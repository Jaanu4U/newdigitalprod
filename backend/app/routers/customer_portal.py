"""
Customer Portal Routes
Endpoints for customer self-service portal
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import secrets
from ..db import get_db
from .. import models, schemas
from ..security import hash_password, create_token, verify_password
from ..deps import get_current_principal, CurrentPrincipal
from ..tenancy import resolve_tenant

router = APIRouter()


@router.post("/register")
def customer_register(
    payload: schemas.CustomerRegisterIn,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Customer self-registration for portal access
    """
    # Get org_id from tenant context (subdomain or X-Org header)
    org = resolve_tenant(request, db)
    
    if not org:
        raise HTTPException(status_code=400, detail="Organization not found. Please access from your organization's subdomain.")
    
    org_id = org.org_id
    
    # Check if customer already exists with this email
    existing = db.query(models.Customer).filter(
        models.Customer.org_id == org_id,
        models.Customer.email == payload.email
    ).first()
    
    if existing and existing.portal_access:
        raise HTTPException(status_code=400, detail="An account with this email already exists. Please use the password reset option.")
    
    if existing:
        # Customer exists but no portal access - enable it
        existing.password_hash = hash_password(payload.password)
        existing.portal_access = True
        existing.email = payload.email
        existing.phone = payload.phone
        existing.name = payload.name
        if payload.company_name:
            existing.company_name = payload.company_name
        db.commit()
        
        return {
            "message": "Portal access enabled successfully",
            "customer_id": existing.customer_id,
            "email_verified": existing.email_verified
        }
    
    # Create new customer
    from ..models import gen_custom_id
    import secrets
    from datetime import timedelta
    
    custom_id = gen_custom_id(6)
    verification_token = secrets.token_urlsafe(32)
    
    customer = models.Customer(
        org_id=org_id,
        custom_customer_id=custom_id,
        ctype=payload.ctype or 'B2C',
        name=payload.name,
        company_name=payload.company_name,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        password_hash=hash_password(payload.password),
        portal_access=True,
        email_verified=False,
        phone_verified=False,
        verification_token=verification_token,
        verification_token_expires=datetime.now(timezone.utc) + timedelta(hours=24),
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(customer)
    db.commit()
    db.refresh(customer)
    
    # Send verification email
    from ..email import send_verification_email
    email_sent = send_verification_email(
        db=db,
        org=org,
        customer_email=customer.email,
        customer_name=customer.name or customer.company_name or "Customer",
        verification_token=verification_token
    )
    
    verification_link = f"https://{org.slug}.digitalchain.in/verify-email?token={verification_token}&type=customer"
    
    return {
        "message": "Registration successful. Please check your email to verify your account." if email_sent else "Registration successful. Please verify your email to activate your account.",
        "customer_id": customer.customer_id,
        "custom_customer_id": custom_id,
        "email_verified": False,
        "verification_link": verification_link if not email_sent else None  # Only show if email failed
    }


@router.get("/profile")
def get_customer_profile(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get customer profile information"""
    if principal.role != "Customer":
        raise HTTPException(status_code=403, detail="Only customers can access this endpoint")
    
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == principal.user_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {
        "customer_id": customer.customer_id,
        "custom_customer_id": customer.custom_customer_id,
        "name": customer.name,
        "company_name": customer.company_name,
        "email": customer.email,
        "phone": customer.phone,
        "address": customer.address,
        "city": customer.city,
        "state": customer.state,
        "pin": customer.pin,
        "gstin": customer.gstin,
        "ctype": customer.ctype,
        "email_verified": customer.email_verified,
        "phone_verified": customer.phone_verified,
        "last_login": customer.last_login.isoformat() if customer.last_login else None,
        "created_at": customer.created_at.isoformat() if customer.created_at else None
    }


@router.put("/profile")
def update_customer_profile(
    payload: schemas.CustomerProfileUpdateIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Update customer profile"""
    if principal.role != "Customer":
        raise HTTPException(status_code=403, detail="Only customers can access this endpoint")
    
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == principal.user_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Update allowed fields
    if payload.name:
        customer.name = payload.name
    if payload.phone:
        customer.phone = payload.phone
    if payload.address:
        customer.address = payload.address
    if payload.city:
        customer.city = payload.city
    if payload.state:
        customer.state = payload.state
    if payload.pin:
        customer.pin = payload.pin
    
    customer.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Profile updated successfully"}


@router.get("/orders")
def get_customer_orders(
    status: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get customer's orders/invoices"""
    if principal.role != "Customer":
        raise HTTPException(status_code=403, detail="Only customers can access this endpoint")
    
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == principal.user_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Query invoices and purchase orders from sync_log where customer_id matches
    import json
    query = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type.in_(['invoice', 'invoice_draft', 'customer_purchase_order'])
    )
    
    # Filter by customer_id in payload
    all_invoices = query.order_by(models.SyncLog.created_at.desc()).all()
    customer_invoices = []
    
    for inv in all_invoices:
        try:
            payload = json.loads(inv.payload) if isinstance(inv.payload, str) else inv.payload
            
            # Skip deleted records
            if payload.get('deleted') or payload.get('is_deleted'):
                continue
            
            if payload.get('customer_id') == customer.customer_id:
                # Apply status filter if provided
                if status and payload.get('status') != status:
                    continue
                
                # Use order_id for purchase orders, invoice_id for invoices
                order_id = payload.get('order_id') or payload.get('invoice_id')
                order_no = payload.get('order_id') or payload.get('invoice_no')
                
                # Check if rider is assigned by looking in invoice_rider_assigned table
                rider_id = payload.get('rider_id')
                rider_name = payload.get('rider_name')
                rider_phone = payload.get('rider_phone')
                
                # If not in invoice payload, check rider assignments
                if not rider_id and order_id:
                    assignment_logs = db.query(models.SyncLog).filter(
                        models.SyncLog.org_id == principal.org_id,
                        models.SyncLog.type == 'invoice_rider_assigned'
                    ).all()
                    
                    for assignment in assignment_logs:
                        try:
                            assignment_data = json.loads(assignment.payload) if isinstance(assignment.payload, str) else assignment.payload
                            if assignment_data.get('invoice_id') == order_id:
                                rider_id = assignment_data.get('rider_user_id')
                                rider_name = assignment_data.get('rider_name')
                                # Get rider phone from users table
                                if rider_id:
                                    rider = db.query(models.User).filter(models.User.user_id == rider_id).first()
                                    if rider:
                                        rider_phone = rider.cellnumber
                                break
                        except:
                            continue
                
                # Check deliveries table for actual delivery status
                delivery_status = payload.get('status', 'pending')
                delivery_rider_status = None
                delivered_at = None
                completed_at = None
                
                if order_id:
                    delivery_record = db.query(models.Delivery).filter(
                        models.Delivery.order_id == order_id,
                        models.Delivery.org_id == principal.org_id
                    ).first()
                    
                    if delivery_record:
                        delivery_status = delivery_record.status or delivery_status
                        delivery_rider_status = delivery_record.rider_status
                        delivered_at = delivery_record.delivered_at.isoformat() if delivery_record.delivered_at else None
                        completed_at = delivery_record.completed_at.isoformat() if delivery_record.completed_at else None
                
                customer_invoices.append({
                    "invoice_id": order_id,
                    "invoice_no": order_no,
                    "status": delivery_status,
                    "rider_status": delivery_rider_status,
                    "total": payload.get('total', 0),
                    "items": payload.get('items', []),
                    "created_at": inv.created_at.isoformat() if inv.created_at else None,
                    "delivery_address": payload.get('delivery_address'),
                    "tracking_number": payload.get('tracking_number'),
                    "order_type": 'purchase_order' if inv.type == 'customer_purchase_order' else 'invoice',
                    "rider_id": rider_id,
                    "rider_name": rider_name,
                    "rider_phone": rider_phone,
                    "approved_at": payload.get('approved_at'),
                    "approved_by": payload.get('approved_by'),
                    "delivered_at": delivered_at,
                    "completed_at": completed_at
                })
        except:
            continue
    
    # Apply pagination
    total = len(customer_invoices)
    paginated = customer_invoices[offset:offset+limit]
    
    return {
        "total": total,
        "orders": paginated,
        "limit": limit,
        "offset": offset
    }


@router.post("/create-order")
def create_customer_order(
    payload: schemas.CreateOrderIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Create a new purchase order from customer"""
    import json
    import secrets
    
    if principal.role != "Customer":
        raise HTTPException(status_code=403, detail="Only customers can access this endpoint")
    
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == principal.user_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Generate order ID
    order_id = f"PO-{secrets.token_hex(6).upper()}"
    
    # Calculate total
    total = sum(item.quantity * item.rate for item in payload.items)
    
    # Prepare order payload
    order_payload = {
        "order_id": order_id,
        "customer_id": customer.customer_id,
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "customer_email": customer.email,
        "items": [
            {
                "description": item.description,
                "qty": item.quantity,
                "rate": item.rate,
                "total": item.quantity * item.rate
            } for item in payload.items
        ],
        "subtotal": total,
        "total": total,
        "status": "pending",
        "delivery_address": payload.delivery_address or customer.address,
        "notes": payload.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Save to sync_log as customer_purchase_order
    order_log = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='customer_purchase_order',
        payload=json.dumps(order_payload),
        created_at=datetime.now(timezone.utc)
    )
    db.add(order_log)
    
    # Create notification for admin
    notification_payload = {
        "type": "new_purchase_order",
        "order_id": order_id,
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "total": total,
        "items_count": len(payload.items),
        "message": f"New purchase order {order_id} from {customer.name}",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    notification_log = models.SyncLog(
        org_id=principal.org_id,
        user_id=None,  # System notification
        type='admin_notification',
        payload=json.dumps(notification_payload),
        created_at=datetime.now(timezone.utc)
    )
    db.add(notification_log)
    
    try:
        db.commit()
        return {
            "success": True,
            "order_id": order_id,
            "message": "Order created successfully",
            "order": order_payload
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")


@router.post("/change-password")
def change_customer_password(
    payload: schemas.ChangePasswordIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Change customer password"""
    from ..security import verify_password
    
    if principal.role != "Customer":
        raise HTTPException(status_code=403, detail="Only customers can access this endpoint")
    
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == principal.user_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Verify old password
    if not verify_password(payload.old_password, customer.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Update password
    customer.password_hash = hash_password(payload.new_password)
    customer.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Password changed successfully"}


@router.post("/request-password-reset")
def request_password_reset(
    email: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Request password reset link for customer
    """
    from ..tenancy import resolve_tenant
    
    org = resolve_tenant(request, db)
    if not org:
        # Always return success to prevent enumeration
        return {"message": "If an account exists with this email, a password reset link will be sent"}
    
    customer = db.query(models.Customer).filter(
        models.Customer.org_id == org.org_id,
        models.Customer.email == email,
        models.Customer.portal_access == True
    ).first()
    
    # Always return success to prevent email enumeration
    if customer:
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        customer.password_reset_token = reset_token
        customer.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        
        print(f"[Password Reset] Token generated for customer: {email}")
        
        # Send password reset email
        try:
            reset_link = f"https://{org.slug}.digitalchain.in/customer/reset-password?token={reset_token}"
            # TODO: Implement send_password_reset_email function
            print(f"[Password Reset] Reset link: {reset_link}")
            # For now, just log the link
        except Exception as e:
            print(f"[Password Reset] Failed to send email: {str(e)}")
    
    return {"message": "If an account exists with this email, a password reset link will be sent"}


@router.post("/reset-password")
def reset_password(
    token: str,
    new_password: str,
    db: Session = Depends(get_db)
):
    """
    Reset customer password using reset token
    """
    from ..security import hash_password
    
    print(f"[Password Reset] Attempting reset with token: {token[:10]}...")
    
    # Find customer with this reset token
    customer = db.query(models.Customer).filter(
        models.Customer.password_reset_token == token
    ).first()
    
    if not customer:
        print(f"[Password Reset] No customer found with token")
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check if token has expired
    if customer.password_reset_expires:
        expiry_time = customer.password_reset_expires
        if expiry_time.tzinfo is None:
            expiry_time = expiry_time.replace(tzinfo=timezone.utc)
        if expiry_time < datetime.now(timezone.utc):
            print(f"[Password Reset] Token expired for customer: {customer.email}")
            raise HTTPException(status_code=400, detail="Reset token has expired. Please request a new one.")
    
    # Validate new password
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Update password
    customer.password_hash = hash_password(new_password)
    customer.password_reset_token = None
    customer.password_reset_expires = None
    db.commit()
    
    print(f"[Password Reset] Password reset successful for customer: {customer.email}")
    
    return {"message": "Password reset successfully. You can now log in with your new password."}


@router.post("/resend-verification")
def resend_verification_email(
    email: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Resend email verification link for customer
    """
    import secrets
    from datetime import timedelta
    
    # Get org_id from tenant context
    org = resolve_tenant(request, db)
    
    if not org:
        raise HTTPException(status_code=400, detail="Organization not found")
    
    customer = db.query(models.Customer).filter(
        models.Customer.org_id == org.org_id,
        models.Customer.email == email,
        models.Customer.portal_access == True
    ).first()
    
    verification_link = None
    
    # Always return success to prevent email enumeration
    if customer and not customer.email_verified:
        # Generate new verification token
        verification_token = secrets.token_urlsafe(32)
        customer.verification_token = verification_token
        customer.verification_token_expires = datetime.now(timezone.utc) + timedelta(hours=24)
        db.commit()
        
        # Send verification email
        from ..email import send_verification_email
        email_sent = send_verification_email(
            db=db,
            org=org,
            customer_email=customer.email,
            customer_name=customer.name or customer.company_name or "Customer",
            verification_token=verification_token
        )
        
        verification_link = f"https://{org.slug}.digitalchain.in/verify-email?token={verification_token}&type=customer"
    
    return {
        "message": "If an account exists with this email and is not verified, a verification email has been sent",
        "verification_link": verification_link if verification_link and not email_sent else None  # Only show if email failed
    }


@router.get("/verify-email")
@router.post("/verify-email")
def verify_email(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Verify customer email using token
    Accepts both GET (link clicks) and POST (API calls)
    """
    print(f"[Customer Verify Email] Received token: {token[:10]}...")
    
    customer = db.query(models.Customer).filter(
        models.Customer.verification_token == token
    ).first()
    
    if not customer:
        print(f"[Customer Verify Email] No customer found with token: {token[:10]}...")
        raise HTTPException(status_code=400, detail="Invalid verification token. The link may have expired or already been used.")
    
    print(f"[Customer Verify Email] Found customer: {customer.email}, verified: {customer.email_verified}")
    
    # Check if already verified
    if customer.email_verified:
        print(f"[Customer Verify Email] Email already verified for customer: {customer.email}")
        return {
            "message": "Email already verified! You can now login to your account.",
            "email": customer.email
        }
    
    # Check if token has expired (handle both timezone-aware and naive datetimes)
    if customer.verification_token_expires:
        expiry = customer.verification_token_expires
        # Make expiry timezone-aware if it's naive
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        
        if expiry < datetime.now(timezone.utc):
            print(f"[Customer Verify Email] Token expired. Expiry: {expiry}, Now: {datetime.now(timezone.utc)}")
            raise HTTPException(status_code=400, detail="Verification token has expired. Please request a new one.")
    
    print(f"[Customer Verify Email] Token is valid and not expired")
    
    # Verify the email
    customer.email_verified = True
    customer.verification_token = None
    customer.verification_token_expires = None
    db.commit()
    
    print(f"[Customer Verify Email] Successfully verified email for customer: {customer.email}")
    
    return {
        "message": "Email verified successfully! You can now login to your account.",
        "email": customer.email
    }


@router.get("/notifications")
def get_customer_notifications(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get notifications for customer"""
    import json
    
    if principal.role != "Customer":
        raise HTTPException(status_code=403, detail="Only customers can access this endpoint")
    
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == principal.user_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Get customer notifications
    notifications_logs = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'customer_notification',
        models.SyncLog.user_id == customer.customer_id
    ).order_by(models.SyncLog.created_at.desc()).limit(50).all()
    
    notifications = []
    for notif in notifications_logs:
        try:
            data = json.loads(notif.payload or '{}')
            notifications.append({
                "id": notif.id,
                "type": data.get('type'),
                "message": data.get('message'),
                "order_id": data.get('order_id'),
                "read": data.get('read', False),
                "created_at": notif.created_at.isoformat() if notif.created_at else None
            })
        except:
            continue
    
    return {
        "notifications": notifications,
        "total": len(notifications)
    }


