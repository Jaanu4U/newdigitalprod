from fastapi import APIRouter, Depends, HTTPException, Request, Query, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from typing import List, Optional, Dict, Any
import smtplib
from email.mime.text import MIMEText
from email.utils import formatdate
import pandas as pd
import io
import uuid
import json

from ..db import get_db
from .. import models, schemas
from ..deps import get_current_principal, CurrentPrincipal
from ..tenancy import resolve_tenant
from ..core import settings

router = APIRouter()


class ShareCreateIn(BaseModel):
    customer_id: str
    invoice_no: Optional[str] = None
    ttl_hours: int = Field(default=72, ge=1, le=24 * 14)


class ShareCreateOut(BaseModel):
    share_url: str
    token: str
    expires_at: datetime


@router.post("/invoice/share", response_model=ShareCreateOut)
def create_share_link(
    payload: ShareCreateIn,
    request: Request,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    # Only Admin/Owner/Orders Manager/Billing Staff can create a share link
    role_l = (principal.role or "").lower()
    if role_l not in {"admin", "owner", "superadmin", "orders manager", "billing staff"}:
        raise HTTPException(status_code=403, detail="You are not allowed to share invoices")

    # Determine org and slug for URL
    org = None
    if principal.org_id:
        org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    if org is None:
        org = resolve_tenant(request, db)
    if org is None or not org.slug:
        raise HTTPException(status_code=400, detail="Organization/slug not found for share link")

    # Ensure customer belongs to this org
    cust = db.query(models.Customer).filter(models.Customer.customer_id == payload.customer_id, models.Customer.org_id == org.org_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    exp = datetime.utcnow() + timedelta(hours=payload.ttl_hours)
    claims = {
        "sub": "invoice-share",
        "org_id": org.org_id,
        "slug": org.slug,
        "customer_id": payload.customer_id,
        "invoice_no": payload.invoice_no or None,
        "exp": int(exp.timestamp()),
        "iat": int(datetime.utcnow().timestamp()),
    }
    token = jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALG)

    # Build URL like https://<slug>.digitalchain.in/billing/invoice/<customer_id>?share=<token>
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or f"{org.slug}.digitalchain.in"
    scheme = "https" if ":443" in (host or "") or not host.startswith("localhost") else "http"
    share_url = f"{scheme}://{org.slug}.digitalchain.in/billing/invoice/{payload.customer_id}?share={token}"

    return ShareCreateOut(share_url=share_url, token=token, expires_at=exp)


class ShareDataOut(BaseModel):
    org: Dict[str, Any]
    customer: Dict[str, Any]
    generated_at: datetime
    invoice_no: Optional[str] = None


@router.get("/invoice/share", response_model=ShareDataOut)
def get_share_data(token: str = Query(...), db: Session = Depends(get_db)):
    try:
        claims = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if claims.get("sub") != "invoice-share":
        raise HTTPException(status_code=400, detail="Invalid token subject")
    org_id = claims.get("org_id")
    customer_id = claims.get("customer_id")
    if not org_id or not customer_id:
        raise HTTPException(status_code=400, detail="Token missing data")

    org = db.query(models.Organization).filter(models.Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    cust = db.query(models.Customer).filter(models.Customer.customer_id == customer_id, models.Customer.org_id == org_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Whitelist business settings keys to expose
    bset = (org.settings or {}).get("business") or (org.settings or {}).get("business_settings") or {}
    business = {k: bset.get(k) for k in [
        "address",
        "logo_data_url",
        "gstin",
        "company_registration",
        "drug_license",
        "fssai",
    ]}

    org_out = {
        "name": org.name,
        "slug": org.slug,
        "business_settings": business,
    }
    cust_out = {
        "customer_id": cust.customer_id,
        "ctype": cust.ctype,
        "name": cust.name,
        "company_name": cust.company_name,
        "gstin": cust.gstin,
        "email": cust.email,
        "phone": cust.phone,
        "address": cust.address,
        "city": cust.city,
        "state": cust.state,
        "pin": cust.pin,
    }

    return ShareDataOut(org=org_out, customer=cust_out, generated_at=datetime.utcnow(), invoice_no=claims.get("invoice_no"))


class EmailSendIn(BaseModel):
    customer_id: str
    recipients: List[str]
    subject: Optional[str] = None
    message: Optional[str] = None
    ttl_hours: int = Field(default=72, ge=1, le=24 * 14)


@router.post("/invoice/email", response_model=dict)
def email_invoice_link(
    payload: EmailSendIn,
    request: Request,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    # Admin/Owner/SuperAdmin/Orders Manager/Billing Staff
    role_l = (principal.role or "").lower()
    if role_l not in {"admin", "owner", "superadmin", "orders manager", "billing staff"}:
        raise HTTPException(status_code=403, detail="You are not allowed to email invoices")

    # Get org and email settings
    org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    s = org.settings or {}
    email_cfg = s.get("email") or s.get("email_settings") or {}
    host = email_cfg.get("smtp_host")
    port = int(email_cfg.get("smtp_port") or 587)
    user = email_cfg.get("smtp_user")
    pwd = email_cfg.get("smtp_password")
    from_email = email_cfg.get("from_email") or user
    if not (host and port and user and pwd and from_email):
        raise HTTPException(status_code=400, detail="Email settings are incomplete; configure SMTP in Org Settings")

    # Create share link token
    share = create_share_link(ShareCreateIn(customer_id=payload.customer_id, ttl_hours=payload.ttl_hours), request, principal, db)

    subj = payload.subject or f"Invoice from {org.name}"
    link = share.share_url
    msg_html = payload.message or f"<p>Dear Customer,</p><p>Please view your invoice here: <a href=\"{link}\">{link}</a></p><p>Regards,<br/>{org.name}</p>"

    mime = MIMEText(msg_html, "html", "utf-8")
    mime["Subject"] = subj
    mime["From"] = from_email
    mime["To"] = ", ".join(payload.recipients)
    mime["Date"] = formatdate(localtime=True)

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            if port in (587, 25):
                server.starttls()
                server.ehlo()
            server.login(user, pwd)
            server.sendmail(from_email, payload.recipients, mime.as_string())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")

    return {"status": "ok", "sent": len(payload.recipients), "share_url": link}


@router.post("/bulk-upload")
async def bulk_upload_invoices(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    principal: CurrentPrincipal = Depends(get_current_principal),
):
    """
    Bulk upload invoices from CSV/Excel file.
    
    Expected columns:
    - customer_name (required)
    - customer_phone (required, unique identifier)
    - customer_email (optional)
    - customer_address (optional)
    - item_name (required)
    - item_quantity (required)
    - item_price (required)
    - tracking_number (optional)
    """
    
    # Check permissions
    role_l = (principal.role or "").lower()
    if role_l not in {"admin", "owner", "superadmin", "orders manager", "billing staff"}:
        raise HTTPException(status_code=403, detail="You are not allowed to upload invoices")
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Check file extension
    file_ext = file.filename.lower().split('.')[-1]
    if file_ext not in ['csv', 'xlsx', 'xls']:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only CSV and Excel files are supported."
        )
    
    # Read file content
    content = await file.read()
    
    # Parse file based on type
    try:
        if file_ext == 'csv':
            df = pd.read_csv(io.BytesIO(content))
        else:  # xlsx or xls
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")
    
    # Validate required columns
    required_cols = ['customer_name', 'customer_phone', 'item_name', 'item_quantity', 'item_price']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing_cols)}"
        )
    
    # Process each row - first validate and group by customer
    created_count = 0
    updated_count = 0
    new_customers_count = 0
    errors: List[Dict[str, Any]] = []
    upload_batch_id = str(uuid.uuid4())  # Track this bulk upload session
    
    # Create bulk upload log entry
    upload_log = models.SyncLog(
        log_id=upload_batch_id,
        org_id=principal.org_id,
        created_by=principal.user_id,
        entity_type='bulk_upload',
        action='invoice_upload',
        status='processing',
        metadata={
            "file_name": file.filename,
            "file_type": file_ext,
            "total_rows": len(df),
            "uploaded_by_name": principal.name or principal.email,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        },
        created_at=datetime.now(timezone.utc)
    )
    db.add(upload_log)
    db.flush()  # Save upload log immediately
    
    # Group rows by customer phone to combine multiple products
    from collections import defaultdict
    customer_invoices = defaultdict(lambda: {"rows": [], "customer_data": None})
    
    # Group rows by customer phone to combine multiple products
    from collections import defaultdict
    customer_invoices = defaultdict(lambda: {"rows": [], "customer_data": None})
    
    for idx, row in df.iterrows():
        row_num = idx + 2  # Excel row number (1-indexed + header)
        
        # Validate required fields
        if pd.isna(row['customer_phone']) or not str(row['customer_phone']).strip():
            errors.append({"row": row_num, "message": "Customer phone is required"})
            continue
        
        if pd.isna(row['customer_name']) or not str(row['customer_name']).strip():
            errors.append({"row": row_num, "message": "Customer name is required"})
            continue
        
        if pd.isna(row['item_name']) or not str(row['item_name']).strip():
            errors.append({"row": row_num, "message": "Item name is required"})
            continue
        
        # Validate numeric fields
        try:
            quantity = float(row['item_quantity'])
            if quantity <= 0:
                errors.append({"row": row_num, "message": "Item quantity must be greater than 0"})
                continue
        except (ValueError, TypeError):
            errors.append({"row": row_num, "message": "Invalid item quantity"})
            continue
        
        try:
            price = float(row['item_price'])
            if price < 0:
                errors.append({"row": row_num, "message": "Item price cannot be negative"})
                continue
        except (ValueError, TypeError):
            errors.append({"row": row_num, "message": "Invalid item price"})
            continue
        
        # Normalize phone number
        phone = str(row['customer_phone']).strip()
        phone = phone.replace('-', '').replace(' ', '').replace('(', '').replace(')', '')
        
        # Group by phone number
        if customer_invoices[phone]["customer_data"] is None:
            customer_invoices[phone]["customer_data"] = {
                "name": str(row['customer_name']).strip(),
                "email": str(row['customer_email']).strip() if not pd.isna(row.get('customer_email')) else None,
                "address": str(row['customer_address']).strip() if not pd.isna(row.get('customer_address')) else None,
                "shipping_address": str(row['shipping_address']).strip() if not pd.isna(row.get('shipping_address')) else None,
                "tracking_number": str(row['tracking_number']).strip() if not pd.isna(row.get('tracking_number')) else None,
            }
        
        # Add item to this customer's invoice
        customer_invoices[phone]["rows"].append({
            "row_num": row_num,
            "name": str(row['item_name']).strip(),
            "quantity": quantity,
            "price": price,
            "total": quantity * price
        })
    
    # Now create invoices for each customer
    for phone, invoice_data in customer_invoices.items():
        try:
            customer_data = invoice_data["customer_data"]
            items = invoice_data["rows"]
            
            if not items:  # Skip if no valid items
                continue
            
            # Check if customer exists
            customer = db.query(models.Customer).filter(
                models.Customer.org_id == principal.org_id,
                models.Customer.phone == phone
            ).first()
            
            customer_created = False
            if not customer:
                # Create new customer
                customer = models.Customer(
                    customer_id=str(uuid.uuid4()),
                    org_id=principal.org_id,
                    name=customer_data["name"],
                    phone=phone,
                    email=customer_data["email"],
                    address=customer_data["address"],
                    created_by=principal.user_id,
                    created_at=datetime.now(timezone.utc)
                )
                db.add(customer)
                new_customers_count += 1
                customer_created = True
            
            # Generate invoice number
            last_invoice = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == principal.org_id,
                models.SyncLog.entity_type == 'invoice'
            ).order_by(models.SyncLog.created_at.desc()).first()
            
            if last_invoice and last_invoice.payload:
                try:
                    last_num = int(last_invoice.payload.get('invoice_no', '0'))
                    invoice_no = str(last_num + 1).zfill(6)
                except:
                    invoice_no = datetime.now().strftime('%Y%m%d%H%M%S')
            else:
                invoice_no = '000001'
            
            # Calculate totals from all items
            subtotal = sum(item["total"] for item in items)
            
            # Create invoice payload with all items
            invoice_payload = {
                "invoice_id": str(uuid.uuid4()),
                "invoice_no": invoice_no,
                "customer_id": customer.customer_id,
                "customer_name": customer.name,
                "customer_company_name": customer.company_name if hasattr(customer, 'company_name') else None,
                "customer_phone": customer.phone,
                "customer_email": customer.email,
                "customer_address": customer.address,
                "billing_phone": customer.phone,
                "items": items,  # All items for this customer
                "totals": {
                    "subtotal": subtotal,
                    "tax": 0,
                    "total": subtotal
                },
                "subtotal": subtotal,
                "tax": 0,
                "total": subtotal,
                "status": "draft",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": principal.user_id,
                "created_by_name": principal.name or principal.email,
                "upload_batch_id": upload_batch_id,  # Link to bulk upload session
                "delivery_address": customer_data["shipping_address"],
                "shipping_address": customer_data["shipping_address"],
            }
            
            # Create invoice in SyncLog
            invoice = models.SyncLog(
                log_id=str(uuid.uuid4()),
                org_id=principal.org_id,
                entity_type='invoice',
                entity_id=invoice_payload['invoice_id'],
                action='create',
                payload=invoice_payload,
                status='pending',
                created_by=principal.user_id,
                created_at=datetime.now(timezone.utc)
            )
            db.add(invoice)
            
            # Create shipment if tracking number provided
            if customer_data["tracking_number"]:
                shipment = models.Shipment(
                    shipment_id=str(uuid.uuid4()),
                    org_id=principal.org_id,
                    invoice_id=invoice_payload['invoice_id'],
                    provider_code="manual",
                    provider_name="Manual Entry",
                    tracking_number=customer_data["tracking_number"],
                    status="pending",
                    shipping_address=customer_data["shipping_address"],
                    created_at=datetime.now(timezone.utc)
                )
                db.add(shipment)
            
            if customer_created:
                created_count += 1
            else:
                updated_count += 1
            
        except Exception as e:
            # Add error for all rows belonging to this customer
            for item in invoice_data["rows"]:
                errors.append({"row": item["row_num"], "message": f"Error processing invoice: {str(e)}"})
            continue
    
    # Update upload log with results
    upload_log.status = 'completed' if len(errors) == 0 else 'completed_with_errors'
    upload_log.metadata.update({
        "created": created_count,
        "updated": updated_count,
        "new_customers": new_customers_count,
        "errors_count": len(errors),
        "processed_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Commit all changes
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    return {
        "created": created_count,
        "updated": updated_count,
        "new_customers": new_customers_count,
        "errors": errors
    }


@router.post("/invoice/sync", response_model=schemas.InvoiceSyncOut)
def sync_invoice_drafts_to_deliveries(
    payload: Optional[schemas.InvoiceSyncIn] = None,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """
    Convert invoice drafts from sync_log to deliveries in the deliveries table.
    This enables riders to see assigned orders via the rider API.
    
    If draft_ids is provided, only those drafts are synced.
    Otherwise, all pending invoice_draft entries are synced.
    """
    # Check permissions
    role_l = (principal.role or "").lower()
    if role_l not in {"admin", "owner", "superadmin", "orders manager", "billing staff"}:
        raise HTTPException(status_code=403, detail="You are not allowed to sync invoices")
    
    # Build query for invoice drafts
    query = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_draft'
    )
    
    # Filter by specific draft IDs if provided
    if payload and payload.draft_ids:
        query = query.filter(models.SyncLog.id.in_(payload.draft_ids))
    
    drafts = query.all()
    
    synced = 0
    deliveries_created = 0
    errors = []
    
    for draft in drafts:
        try:
            # Parse the draft payload
            if not draft.payload:
                errors.append({
                    "draft_id": draft.id,
                    "error": "Empty payload"
                })
                continue
            
            invoice_data = json.loads(draft.payload)
            
            # Extract required fields
            invoice_id = invoice_data.get('invoice_id')
            invoice_no = invoice_data.get('invoice_no')
            customer_id = invoice_data.get('customer_id')
            
            if not invoice_id or not customer_id:
                errors.append({
                    "draft_id": draft.id,
                    "error": "Missing invoice_id or customer_id"
                })
                continue
            
            # Get customer details
            customer = db.query(models.Customer).filter(
                models.Customer.customer_id == customer_id,
                models.Customer.org_id == principal.org_id
            ).first()
            
            if not customer:
                errors.append({
                    "draft_id": draft.id,
                    "invoice_id": invoice_id,
                    "error": "Customer not found"
                })
                continue
            
            # Check if delivery already exists
            existing_delivery = db.query(models.Delivery).filter(
                models.Delivery.org_id == principal.org_id,
                models.Delivery.order_id == invoice_id
            ).first()
            
            if existing_delivery:
                # Already synced, skip
                synced += 1
                continue
            
            # Determine delivery address
            delivery_address = invoice_data.get('delivery_address')
            if not delivery_address and invoice_data.get('ship_to_same'):
                delivery_address = customer.address
            
            # Create delivery record
            delivery = models.Delivery(
                delivery_id=str(uuid.uuid4()),
                org_id=principal.org_id,
                order_id=invoice_id,
                customer=customer.name or "",
                address=delivery_address or customer.address or "",
                status="pending",
                created_at=datetime.utcnow()
            )
            
            db.add(delivery)
            deliveries_created += 1
            synced += 1
            
        except json.JSONDecodeError:
            errors.append({
                "draft_id": draft.id,
                "error": "Invalid JSON payload"
            })
        except Exception as e:
            errors.append({
                "draft_id": draft.id,
                "error": str(e)
            })
    
    # Commit all changes
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    return schemas.InvoiceSyncOut(
        synced=synced,
        deliveries_created=deliveries_created,
        errors=errors
    )
