"""
Payment Management Router

Handles UPI QR code generation, payment tracking, and payment collection.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_, or_, func, desc
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
import qrcode
import io
import base64
import uuid
import json
import os
import logging

from ..db import get_db
from .. import models
from ..deps import get_current_principal, CurrentPrincipal
from ..tenancy import resolve_tenant
from ..websocket import manager

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================================================
# Request/Response Models
# ============================================================================

class GenerateQRRequest(BaseModel):
    delivery_id: str
    order_id: Optional[str] = None
    amount: float = Field(gt=0, description="Amount in rupees")
    customer_phone: Optional[str] = None
    notes: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None


class GenerateQRResponse(BaseModel):
    payment_id: str
    qr_code: str  # Base64 encoded image
    upi_string: str
    expires_at: datetime
    amount: float
    status: str
    order_id: str
    expires_in_seconds: int
    gateway_order_id: Optional[str] = None


class PaymentStatusResponse(BaseModel):
    payment_id: str
    status: str
    amount: float
    payment_method: Optional[str] = None
    upi_transaction_id: Optional[str] = None
    payment_completed_at: Optional[datetime] = None
    gateway_payment_id: Optional[str] = None


class ConfirmPaymentRequest(BaseModel):
    upi_transaction_id: Optional[str] = None
    upi_ref_id: Optional[str] = None
    payment_method: str = "UPI"  # UPI/Cash/Card
    notes: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None


class PaymentListResponse(BaseModel):
    total: int
    page: int
    limit: int
    payments: List[Dict[str, Any]]
    summary: Dict[str, Any]


class PaymentWebhookRequest(BaseModel):
    """Generic webhook request - adapt based on gateway"""
    event: str
    payload: Dict[str, Any]
    signature: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================

def generate_upi_qr_code(upi_string: str) -> str:
    """Generate QR code image from UPI string and return as base64"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(upi_string)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Return just the base64 string without data URI prefix for Android compatibility
    return img_base64


def create_upi_string(
    vpa: str,
    merchant_name: str,
    amount: float,
    order_id: str,
    currency: str = "INR"
) -> str:
    """
    Create UPI payment string.
    Format: upi://pay?pa=VPA&pn=Name&am=Amount&cu=Currency&tn=TransactionNote
    """
    # Remove spaces and special chars from merchant name
    merchant_name = merchant_name.replace(" ", "")
    
    upi_string = (
        f"upi://pay?"
        f"pa={vpa}&"
        f"pn={merchant_name}&"
        f"am={amount:.2f}&"
        f"cu={currency}&"
        f"tn={order_id}"
    )
    
    return upi_string


def get_org_payment_settings(org: models.Organization) -> Dict[str, Any]:
    """Extract payment settings from organization settings JSON"""
    if not org.settings:
        return {}
    
    payment_settings = org.settings.get("payment", {})
    
    # Default settings
    defaults = {
        "enabled": True,
        "upi": {
            "merchant_vpa": "merchant@paytm",
            "merchant_name": org.name or "Store",
            "qr_expiry_minutes": 15
        },
        "gateway": {
            "provider": None,  # razorpay/phonepe/cashfree
            "enabled": False,
            "key_id": None,
            "key_secret": None,
            "webhook_secret": None
        }
    }
    
    # Merge with org settings
    if payment_settings:
        defaults.update(payment_settings)
    
    return defaults


def verify_razorpay_signature(body: bytes, signature: str, secret: str) -> bool:
    """
    Verify Razorpay webhook signature for security.
    Uses HMAC SHA256 to validate the webhook is from Razorpay.
    """
    import hmac
    import hashlib
    
    try:
        expected_signature = hmac.new(
            secret.encode('utf-8'),
            body,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, signature)
    except Exception as e:
        print(f"Signature verification failed: {e}")
        return False


def create_razorpay_order(
    amount: float,
    order_id: str,
    customer_phone: str,
    key_id: str,
    key_secret: str
) -> Dict[str, Any]:
    """Create Razorpay order for payment"""
    try:
        import razorpay
        
        client = razorpay.Client(auth=(key_id, key_secret))
        
        # Amount in paise (smallest currency unit)
        amount_in_paise = int(amount * 100)
        
        order_data = {
            "amount": amount_in_paise,
            "currency": "INR",
            "receipt": order_id,
            "notes": {
                "order_id": order_id,
                "customer_phone": customer_phone
            }
        }
        
        razorpay_order = client.order.create(data=order_data)
        
        # Generate QR code for UPI
        qr_data = {
            "amount": amount_in_paise,
            "currency": "INR",
            "description": f"Payment for {order_id}",
            "customer": {
                "contact": customer_phone
            },
            "close_by": int((datetime.now(timezone.utc) + timedelta(minutes=15)).timestamp())
        }
        
        # Note: Razorpay QR code API might differ, adjust as needed
        # For now, we'll use the order ID
        
        return {
            "gateway_order_id": razorpay_order["id"],
            "amount": razorpay_order["amount"],
            "currency": razorpay_order["currency"],
            "status": razorpay_order["status"]
        }
        
    except ImportError as e:
        print(f"Razorpay package not installed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Payment gateway not configured. Please contact support."
        )
    except razorpay.errors.BadRequestError as e:
        print(f"Razorpay bad request: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment request: {str(e)}"
        )
    except razorpay.errors.GatewayError as e:
        print(f"Razorpay gateway error: {e}")
        raise HTTPException(
            status_code=502,
            detail="Payment gateway temporarily unavailable. Please try again."
        )
    except razorpay.errors.ServerError as e:
        print(f"Razorpay server error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Payment service unavailable. Please try again later."
        )
    except Exception as e:
        print(f"Razorpay order creation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create payment order: {str(e)}"
        )


async def send_payment_notification(
    org_id: str,
    payment_data: Dict[str, Any],
    event_type: str = "payment_update"
):
    """Send real-time payment update via WebSocket"""
    try:
        message = {
            "type": event_type,
            "payment": payment_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await manager.broadcast_to_org(org_id, message)
    except Exception as e:
        print(f"Failed to send payment notification: {e}")


def create_audit_log(
    db: Session,
    org_id: str,
    payment_id: str,
    action: str,
    actor_id: str,
    actor_name: str,
    metadata: Dict[str, Any]
):
    """Create audit log entry for payment event (writes to SyncLog).
    models.SyncLog has fields: org_id, user_id, type, payload, created_at.
    We store the event in `type` and JSON-encode payload with useful context.
    """
    try:
        payload: Dict[str, Any] = {
            **(metadata or {}),
            "payment_id": payment_id,
            "actor_id": actor_id,
            "actor_name": actor_name,
        }
        audit = models.SyncLog(
            org_id=org_id,
            user_id=actor_id,
            type=action,
            payload=json.dumps(payload),
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit)
        db.flush()
    except Exception as e:
        print(f"Failed to create audit log: {e}")


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/payment/generate-qr", response_model=GenerateQRResponse)
async def generate_payment_qr(
    request: GenerateQRRequest,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    http_request: Request = None
):
    """
    Generate UPI QR code for payment collection.
    
    - Validates delivery exists and belongs to requesting rider/admin
    - Creates payment record with 'initiated' status
    - Generates UPI string and QR code
    - Returns QR code as base64 image
    - QR expires in 15 minutes (configurable)
    """
    
    logger.info(f"[PAYMENT] QR request user={principal.user_id} role={principal.role} org={principal.org_id} payload={request.dict()}")

    # Validate delivery exists (accept delivery_id or order_id/invoice_id)
    delivery = db.query(models.Delivery).filter(
        models.Delivery.delivery_id == request.delivery_id,
        models.Delivery.org_id == principal.org_id
    ).first()

    if not delivery and request.order_id:
        delivery = db.query(models.Delivery).filter(
            models.Delivery.order_id == request.order_id,
            models.Delivery.org_id == principal.org_id
        ).first()

    if not delivery:
        # Try resolving delivery via invoice_draft (when mobile sends invoice_no or invoice_id)
        invoice_id = request.order_id or request.delivery_id
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        for draft in drafts:
            try:
                ddata = json.loads(draft.payload or '{}')
                if ddata.get('invoice_no') == invoice_id or ddata.get('invoice_id') == invoice_id:
                    invoice_id = ddata.get('invoice_id') or invoice_id
                    delivery = db.query(models.Delivery).filter(
                        models.Delivery.order_id == invoice_id,
                        models.Delivery.org_id == principal.org_id
                    ).first()
                    break
            except Exception:
                continue

    if not delivery:
        logger.warning(f"[PAYMENT] Delivery not found for QR: delivery_id={request.delivery_id}, order_id={request.order_id}")
        raise HTTPException(status_code=404, detail="Delivery not found for QR generation")
    
    # Backfill assigned_rider_id from assignment logs if missing
    if not delivery.assigned_rider_id:
        assignment_logs = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_rider_assigned'
        ).all()
        for assignment in assignment_logs:
            try:
                adata = json.loads(assignment.payload or '{}')
                if adata.get('invoice_id') == delivery.order_id:
                    delivery.assigned_rider_id = adata.get('rider_user_id') or adata.get('rider_id')
                    break
            except Exception:
                continue
        db.add(delivery)

    # Authorization check: Only assigned rider or admin can generate QR
    role_lower = (principal.role or "").lower()
    is_admin = role_lower in {"admin", "owner", "superadmin", "orders manager"}
    is_assigned_rider = delivery.assigned_rider_id == principal.user_id
    
    if not (is_admin or is_assigned_rider):
        logger.warning(f"[PAYMENT] Unauthorized QR attempt: user={principal.user_id}, delivery_id={delivery.delivery_id}, assigned={delivery.assigned_rider_id}")
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to collect payment for this delivery"
        )
    
    # Check if payment already collected successfully (use resolved delivery id)
    resolved_delivery_id = delivery.delivery_id
    existing_payment = db.query(models.Payment).filter(
        models.Payment.delivery_id == resolved_delivery_id,
        models.Payment.status == "success"
    ).first()
    
    if existing_payment:
        logger.warning(f"[PAYMENT] Duplicate collection attempt payment_id={existing_payment.payment_id} delivery_id={request.delivery_id}")
        raise HTTPException(
            status_code=400,
            detail=f"Payment already collected for this delivery (Payment ID: {existing_payment.payment_id})"
        )
    
    # Get organization and payment settings
    org = db.query(models.Organization).filter(
        models.Organization.org_id == principal.org_id
    ).first()
    
    if not org:
        logger.error(f"[PAYMENT] Org not found for QR: org_id={principal.org_id}")
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Get user info for collected_by_name
    user = db.query(models.User).filter(
        models.User.user_id == principal.user_id,
        models.User.org_id == principal.org_id
    ).first()
    
    collected_by_name = user.name if user and hasattr(user, 'name') and user.name else (
        user.email if user and hasattr(user, 'email') and user.email else principal.user_id
    )
    
    payment_settings = get_org_payment_settings(org)
    
    # Force-enable payments for rider collection if org settings accidentally disable
    if not payment_settings.get("enabled", True):
        logger.warning(f"[PAYMENT] Payment disabled for org={principal.org_id} - overriding to enabled for rider QR")
        payment_settings["enabled"] = True
    
    upi_settings = payment_settings.get("upi", {})
    gateway_settings = payment_settings.get("gateway", {})
    merchant_vpa = upi_settings.get("merchant_vpa", "merchant@paytm")
    merchant_name = upi_settings.get("merchant_name", org.name or "Store")
    qr_expiry_minutes = upi_settings.get("qr_expiry_minutes", 15)
    
    # Create payment record
    payment_id = str(uuid.uuid4())
    order_id = request.order_id or delivery.order_id or f"ORDER-{delivery.delivery_id[:8]}"
    
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=qr_expiry_minutes)
    
    # Gateway disabled: always use custom UPI QR flow
    gateway_order_id = None
    gateway_error = None
    if gateway_settings.get("enabled"):
        print("ℹ️ Payment gateway is disabled by policy. Using custom UPI QR only.")
    
    # Generate UPI string
    upi_string = create_upi_string(
        vpa=merchant_vpa,
        merchant_name=merchant_name,
        amount=request.amount,
        order_id=order_id,
        currency="INR"
    )
    
    # Generate QR code and persist a copy to disk for debugging
    qr_code_base64 = generate_upi_qr_code(upi_string)
    try:
        # Use project-local uploads path rather than /opt to avoid permission issues
        out_dir = os.path.join(os.getcwd(), 'uploads', 'payment_qr')
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{payment_id}.png")
        with open(out_path, 'wb') as f:
            f.write(base64.b64decode(qr_code_base64))
    except PermissionError:
        print("⚠️ Permission denied writing QR image; skipping file save but returning base64")
    except Exception as e:
        print(f"⚠️ Failed to persist QR image: {e}")
    
    # Create payment record
    payment = models.Payment(
        payment_id=payment_id,
        org_id=principal.org_id,
        order_id=order_id,
        delivery_id=resolved_delivery_id,
        customer_id=delivery.customer if hasattr(delivery, 'customer_id') else None,
        customer_name=delivery.customer,
        customer_phone=request.customer_phone or delivery.customer_phone,
        amount=str(request.amount),
        currency="INR",
        payment_method="UPI",
        upi_vpa=merchant_vpa,
        status="initiated",
        payment_initiated_at=now,
        collected_by=principal.user_id,
        collected_by_name=collected_by_name,
        collection_latitude=request.latitude,
        collection_longitude=request.longitude,
        qr_code_generated=True,
        qr_generated_at=now,
        qr_expires_at=expires_at,
        notes=request.notes,
        gateway_provider=gateway_settings.get("provider") if gateway_order_id else None,
        gateway_order_id=gateway_order_id,
        created_at=now,
        updated_at=now
    )
    
    db.add(payment)
    
    # Update delivery payment status
    delivery.payment_status = "initiated"
    delivery.amount_to_collect = str(request.amount)
    
    # Create audit log
    create_audit_log(
        db=db,
        org_id=principal.org_id,
        payment_id=payment_id,
        action="payment_qr_generated",
        actor_id=principal.user_id,
        actor_name=collected_by_name,
        metadata={
            "amount": request.amount,
            "order_id": order_id,
            "invoice_id": delivery.order_id,
            "delivery_id": resolved_delivery_id,
            "expires_at": expires_at.isoformat(),
            "gateway_order_id": gateway_order_id
        }
    )
    
    try:
        db.commit()
    except Exception as e:
        # Handles IntegrityError and PendingRollbackError scenarios
        db.rollback()
        logger.error(f"[PAYMENT] Commit failed for payment_id={payment_id} delivery_id={resolved_delivery_id}: {e}")
        # Fallback: remove delivery linkage to avoid FK failure when delivery row is missing
        payment.delivery_id = None
        db.add(payment)
        db.commit()
    
    # Send real-time notification
    await send_payment_notification(
        org_id=principal.org_id,
        payment_data={
            "payment_id": payment_id,
            "status": "initiated",
            "amount": request.amount,
            "order_id": order_id,
            "delivery_id": resolved_delivery_id,
            "collected_by": collected_by_name
        },
        event_type="payment_qr_generated"
    )
    
    return GenerateQRResponse(
        payment_id=payment_id,
        qr_code=qr_code_base64,
        upi_string=upi_string,
        expires_at=expires_at,
        amount=request.amount,
        status="initiated",
        order_id=order_id,
        expires_in_seconds=qr_expiry_minutes * 60,
        gateway_order_id=gateway_order_id
    )


@router.get("/payment/{payment_id}/status", response_model=PaymentStatusResponse)
def get_payment_status(
    payment_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get payment status by ID"""
    
    payment = db.query(models.Payment).filter(
        models.Payment.payment_id == payment_id,
        models.Payment.org_id == principal.org_id
    ).first()
    
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return PaymentStatusResponse(
        payment_id=payment.payment_id,
        status=payment.status,
        amount=float(payment.amount),
        payment_method=payment.payment_method,
        upi_transaction_id=payment.upi_transaction_id,
        payment_completed_at=payment.payment_completed_at,
        gateway_payment_id=payment.gateway_payment_id
    )


@router.post("/payment/{payment_id}/confirm")
async def confirm_payment(
    payment_id: str,
    request: ConfirmPaymentRequest,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Manually confirm payment receipt.
    Used when rider confirms customer has paid via UPI/Cash/Card.
    """
    
    payment = db.query(models.Payment).filter(
        models.Payment.payment_id == payment_id,
        models.Payment.org_id == principal.org_id
    ).first()
    
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Get user info for actor_name
    user = db.query(models.User).filter(
        models.User.user_id == principal.user_id,
        models.User.org_id == principal.org_id
    ).first()
    
    actor_name = user.name if user and hasattr(user, 'name') and user.name else (
        user.email if user and hasattr(user, 'email') and user.email else principal.user_id
    )
    
    # Check if already confirmed
    if payment.status == "success":
        raise HTTPException(status_code=400, detail="Payment already confirmed")
    
    # Update payment record
    now = datetime.now(timezone.utc)
    payment.status = "success"
    payment.payment_completed_at = now
    payment.payment_method = request.payment_method
    payment.upi_transaction_id = request.upi_transaction_id
    payment.upi_ref_id = request.upi_ref_id
    payment.updated_at = now
    
    if request.notes:
        payment.notes = request.notes
    if request.latitude:
        payment.collection_latitude = request.latitude
    if request.longitude:
        payment.collection_longitude = request.longitude
    
    # Update delivery record
    if payment.delivery_id:
        delivery = db.query(models.Delivery).filter(
            models.Delivery.delivery_id == payment.delivery_id
        ).first()
        
        if delivery:
            delivery.payment_status = "success"
            delivery.payment_method = request.payment_method
            delivery.amount_collected = payment.amount
            delivery.payment_collected_at = now
    
    # Create audit log
    create_audit_log(
        db=db,
        org_id=principal.org_id,
        payment_id=payment_id,
        action="payment_confirmed",
        actor_id=principal.user_id,
        actor_name=actor_name,
        metadata={
            "amount": payment.amount,
            "payment_method": request.payment_method,
            "upi_transaction_id": request.upi_transaction_id,
            "upi_ref_id": request.upi_ref_id,
            "invoice_id": payment.delivery_id,
            "delivery_id": payment.delivery_id,
            "order_id": payment.order_id,
            "gateway_order_id": payment.gateway_order_id,
            "gateway_payment_id": payment.gateway_payment_id
        }
    )
    
    db.commit()
    
    # Send real-time notification
    await send_payment_notification(
        org_id=principal.org_id,
        payment_data={
            "payment_id": payment_id,
            "status": "success",
            "amount": float(payment.amount),
            "order_id": payment.order_id,
            "delivery_id": payment.delivery_id,
            "payment_method": request.payment_method,
            "collected_by": actor_name
        },
        event_type="payment_confirmed"
    )
    
    return {
        "status": "success",
        "payment_id": payment_id,
        "amount": float(payment.amount),
        "payment_method": request.payment_method,
        "completed_at": now.isoformat()
    }


@router.get("/payment/list", response_model=PaymentListResponse)
def list_payments(
    status: Optional[str] = Query(None, description="Filter by status"),
    collected_by: Optional[str] = Query(None, description="Filter by rider user_id"),
    payment_method: Optional[str] = Query(None, description="Filter by payment method"),
    from_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    search: Optional[str] = Query(None, description="Search by order_id, customer name, phone"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Get list of payments with filters.
    Admin can see all, riders can see only their collections.
    """
    
    # Base query
    query = db.query(models.Payment).filter(
        models.Payment.org_id == principal.org_id
    )
    
    # Authorization: Non-admin can only see their own collections
    role_lower = (principal.role or "").lower()
    is_admin = role_lower in {"admin", "owner", "superadmin", "orders manager", "billing staff"}
    
    if not is_admin:
        query = query.filter(models.Payment.collected_by == principal.user_id)
    
    # Apply filters
    if status:
        query = query.filter(models.Payment.status == status)
    
    if collected_by and is_admin:
        query = query.filter(models.Payment.collected_by == collected_by)
    
    if payment_method:
        query = query.filter(models.Payment.payment_method == payment_method)
    
    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date)
            query = query.filter(models.Payment.created_at >= from_dt)
        except ValueError:
            pass
    
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date) + timedelta(days=1)
            query = query.filter(models.Payment.created_at < to_dt)
        except ValueError:
            pass
    
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                models.Payment.order_id.ilike(search_pattern),
                models.Payment.customer_name.ilike(search_pattern),
                models.Payment.customer_phone.ilike(search_pattern),
                models.Payment.upi_transaction_id.ilike(search_pattern)
            )
        )
    
    # Get total count
    total = query.count()
    
    # Calculate summary
    summary_query = query.with_entities(
        func.count(models.Payment.payment_id).label('total_count'),
        func.sum(func.cast(models.Payment.amount, func.Float)).label('total_amount')
    ).first()
    
    status_counts = {}
    for st in ['pending', 'initiated', 'success', 'failed']:
        count = query.filter(models.Payment.status == st).count()
        status_counts[f"{st}_count"] = count
    
    # Pagination
    offset = (page - 1) * limit
    payments = query.order_by(desc(models.Payment.created_at)).offset(offset).limit(limit).all()
    
    # Format payments
    payments_list = []
    for p in payments:
        payments_list.append({
            "payment_id": p.payment_id,
            "order_id": p.order_id,
            "delivery_id": p.delivery_id,
            "customer_name": p.customer_name,
            "customer_phone": p.customer_phone,
            "amount": float(p.amount) if p.amount else 0,
            "currency": p.currency,
            "status": p.status,
            "payment_method": p.payment_method,
            "upi_transaction_id": p.upi_transaction_id,
            "collected_by": p.collected_by,
            "collected_by_name": p.collected_by_name,
            "payment_initiated_at": p.payment_initiated_at.isoformat() if p.payment_initiated_at else None,
            "payment_completed_at": p.payment_completed_at.isoformat() if p.payment_completed_at else None,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })
    
    return PaymentListResponse(
        total=total,
        page=page,
        limit=limit,
        payments=payments_list,
        summary={
            "total_amount": float(summary_query.total_amount or 0),
            "total_count": summary_query.total_count or 0,
            **status_counts
        }
    )


@router.get("/payment/{payment_id}")
def get_payment_details(
    payment_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get full payment details"""
    
    payment = db.query(models.Payment).filter(
        models.Payment.payment_id == payment_id,
        models.Payment.org_id == principal.org_id
    ).first()
    
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Authorization check
    role_lower = (principal.role or "").lower()
    is_admin = role_lower in {"admin", "owner", "superadmin", "orders manager", "billing staff"}
    
    if not is_admin and payment.collected_by != principal.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this payment")
    
    return {
        "payment_id": payment.payment_id,
        "org_id": payment.org_id,
        "order_id": payment.order_id,
        "delivery_id": payment.delivery_id,
        "customer_id": payment.customer_id,
        "customer_name": payment.customer_name,
        "customer_phone": payment.customer_phone,
        "amount": float(payment.amount) if payment.amount else 0,
        "currency": payment.currency,
        "payment_method": payment.payment_method,
        "upi_vpa": payment.upi_vpa,
        "upi_transaction_id": payment.upi_transaction_id,
        "upi_ref_id": payment.upi_ref_id,
        "status": payment.status,
        "payment_initiated_at": payment.payment_initiated_at.isoformat() if payment.payment_initiated_at else None,
        "payment_completed_at": payment.payment_completed_at.isoformat() if payment.payment_completed_at else None,
        "collected_by": payment.collected_by,
        "collected_by_name": payment.collected_by_name,
        "collection_latitude": payment.collection_latitude,
        "collection_longitude": payment.collection_longitude,
        "qr_code_generated": payment.qr_code_generated,
        "qr_generated_at": payment.qr_generated_at.isoformat() if payment.qr_generated_at else None,
        "qr_expires_at": payment.qr_expires_at.isoformat() if payment.qr_expires_at else None,
        "gateway_provider": payment.gateway_provider,
        "gateway_order_id": payment.gateway_order_id,
        "gateway_payment_id": payment.gateway_payment_id,
        "notes": payment.notes,
        "receipt_url": payment.receipt_url,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
        "updated_at": payment.updated_at.isoformat() if payment.updated_at else None
    }


@router.post("/payment/webhook/{provider}")
async def payment_webhook(
    provider: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Webhook endpoint for payment gateway callbacks.
    Provider can be: razorpay, phonepe, cashfree, etc.
    
    Implements signature verification for security.
    """
    
    # Gateway callbacks are disabled; accept and no-op
    raise HTTPException(status_code=410, detail="Payment gateway disabled; webhooks not accepted")

    # Get raw body for signature verification
    body = await request.body()
    headers = dict(request.headers)
    
    # Parse payload first
    try:
        payload = json.loads(body.decode('utf-8'))
    except Exception as e:
        print(f"Invalid webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    # Razorpay signature verification
    if provider.lower() == "razorpay":
        signature = headers.get('x-razorpay-signature')
        
        if not signature:
            print("Missing Razorpay signature header")
            raise HTTPException(status_code=400, detail="Missing signature")
        
        # Get webhook secret from the organization settings
        # Extract org_id from payload if available
        gateway_order_id = payload.get("payload", {}).get("payment", {}).get("entity", {}).get("order_id")
        
        if gateway_order_id:
            payment = db.query(models.Payment).filter(
                models.Payment.gateway_order_id == gateway_order_id
            ).first()
            
            if payment:
                org = db.query(models.Organization).filter(
                    models.Organization.org_id == payment.org_id
                ).first()
                
                if org and org.settings:
                    webhook_secret = org.settings.get("payment", {}).get("gateway", {}).get("webhook_secret")
                    
                    if webhook_secret:
                        # Verify signature
                        if not verify_razorpay_signature(body, signature, webhook_secret):
                            print(f"Invalid Razorpay signature for order {gateway_order_id}")
                            raise HTTPException(status_code=401, detail="Invalid signature")
                        print(f"✅ Razorpay signature verified for order {gateway_order_id}")
                    else:
                        print(f"⚠️ Webhook secret not configured for org {payment.org_id}, skipping verification")
    
    # TODO: Process webhook based on provider
    # This is a basic structure - customize based on gateway
    
    event_type = payload.get("event")
    
    if event_type == "payment.success" or event_type == "payment.captured":
        # Extract payment details from gateway response
        gateway_payment_id = payload.get("payload", {}).get("payment", {}).get("entity", {}).get("id")
        gateway_order_id = payload.get("payload", {}).get("payment", {}).get("entity", {}).get("order_id")
        
        # Find payment by gateway_order_id
        payment = db.query(models.Payment).filter(
            models.Payment.gateway_order_id == gateway_order_id
        ).first()
        
        if payment:
            now = datetime.now(timezone.utc)
            payment.status = "success"
            payment.gateway_payment_id = gateway_payment_id
            payment.gateway_response = json.dumps(payload)
            payment.payment_completed_at = now
            payment.updated_at = now
            
            # Update delivery
            if payment.delivery_id:
                delivery = db.query(models.Delivery).filter(
                    models.Delivery.delivery_id == payment.delivery_id
                ).first()
                if delivery:
                    delivery.payment_status = "success"
                    delivery.amount_collected = payment.amount
                    delivery.payment_collected_at = now
            
            db.commit()
            
            # Send notification
            await send_payment_notification(
                org_id=payment.org_id,
                payment_data={
                    "payment_id": payment.payment_id,
                    "status": "success",
                    "amount": float(payment.amount),
                    "order_id": payment.order_id
                },
                event_type="payment_webhook_success"
            )
    
    return {"status": "ok"}


@router.get("/payment/stats/summary")
def get_payment_summary(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get payment statistics summary"""
    
    role_lower = (principal.role or "").lower()
    is_admin = role_lower in {"admin", "owner", "superadmin", "orders manager", "billing staff"}
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = db.query(models.Payment).filter(
        models.Payment.org_id == principal.org_id
    )
    
    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date)
            query = query.filter(models.Payment.created_at >= from_dt)
        except ValueError:
            pass
    
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date) + timedelta(days=1)
            query = query.filter(models.Payment.created_at < to_dt)
        except ValueError:
            pass
    
    # Status breakdown
    status_breakdown = {}
    for status in ['pending', 'initiated', 'success', 'failed', 'cancelled']:
        count = query.filter(models.Payment.status == status).count()
        amount = query.filter(models.Payment.status == status).with_entities(
            func.sum(func.cast(models.Payment.amount, func.Float))
        ).scalar() or 0
        status_breakdown[status] = {
            "count": count,
            "amount": float(amount)
        }
    
    # Payment method breakdown
    method_breakdown = {}
    for method in ['UPI', 'Cash', 'Card']:
        count = query.filter(models.Payment.payment_method == method).count()
        amount = query.filter(models.Payment.payment_method == method).with_entities(
            func.sum(func.cast(models.Payment.amount, func.Float))
        ).scalar() or 0
        method_breakdown[method] = {
            "count": count,
            "amount": float(amount)
        }
    
    # Top collectors
    top_collectors = db.query(
        models.Payment.collected_by,
        models.Payment.collected_by_name,
        func.count(models.Payment.payment_id).label('count'),
        func.sum(func.cast(models.Payment.amount, func.Float)).label('total_amount')
    ).filter(
        models.Payment.org_id == principal.org_id,
        models.Payment.status == 'success'
    ).group_by(
        models.Payment.collected_by,
        models.Payment.collected_by_name
    ).order_by(
        desc('total_amount')
    ).limit(10).all()
    
    return {
        "status_breakdown": status_breakdown,
        "method_breakdown": method_breakdown,
        "top_collectors": [
            {
                "user_id": c[0],
                "name": c[1],
                "count": c[2],
                "amount": float(c[3] or 0)
            }
            for c in top_collectors
        ]
    }
