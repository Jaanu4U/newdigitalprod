from fastapi import APIRouter, Depends, HTTPException, Request, Query, File, UploadFile, Form
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
import httpx

from ..db import get_db
from .. import models, schemas
from ..deps import get_current_principal, CurrentPrincipal
from ..tenancy import resolve_tenant
from ..core import settings


async def geocode_address(address: str, google_api_key: str = None, org_id: str = None, db: Session = None, user_id: str = None) -> tuple[float, float] | None:
    """Geocode an address using Google Maps API and track usage"""
    if not address or not google_api_key:
        return None
    
    try:
        # Track usage if org_id and db provided
        if org_id and db:
            from .org import track_maps_usage
            track_maps_usage(db, org_id, "bulk_geocode", user_id)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={
                    "address": address,
                    "key": google_api_key
                },
                timeout=10.0
            )
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                location = data["results"][0]["geometry"]["location"]
                return (location["lat"], location["lng"])
    except Exception as e:
        print(f"Geocoding error: {e}")
    
    return None

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


@router.post("/invoices/preview-columns")
async def preview_file_columns(
    file: UploadFile = File(...),
    principal: CurrentPrincipal = Depends(get_current_principal),
):
    """
    Preview columns from uploaded CSV/Excel file for mapping.
    Returns detected columns and suggested mappings.
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
    
    # Handle files with merged headers or data starting on later rows
    original_columns = df.columns.tolist()
    if df.columns.str.contains('unnamed', case=False).sum() > len(df.columns) * 0.5:
        for idx in range(min(10, len(df))):
            potential_headers = df.iloc[idx].astype(str).str.lower().str.strip().str.replace(' ', '_')
            common_keywords = ['name', 'customer', 'party', 'phone', 'mobile', 'product', 'item', 'quantity', 'qty', 'price', 'rate', 'amount']
            if any(keyword in str(val).lower() for val in potential_headers for keyword in common_keywords):
                df.columns = df.iloc[idx].astype(str).str.lower().str.strip().str.replace(' ', '_')
                break
    
    # Normalize column names
    detected_columns = df.columns.str.lower().str.strip().str.replace(' ', '_').tolist()
    
    # Auto-suggest mappings
    column_mapping = {
        'customer_name': ['customer_name', 'customername', 'name', 'customer', 'cust_name', 'party_name', 'party', 'custname', 'customer_nm'],
        'customer_phone': ['customer_phone', 'phone', 'mobile', 'contact', 'phone_number', 'mobile_number', 'contact_number', 'cust_phone', 'custphone'],
        'customer_email': ['customer_email', 'email', 'email_address'],
        'customer_address_line1': ['customer_address', 'address', 'billing_address', 'street', 'address1', 'address_1'],
        'customer_address_line2': ['address2', 'address_2', 'locality', 'area', 'landmark'],
        'customer_address_line3': ['address3', 'address_3', 'city', 'state', 'pincode', 'zip', 'postal_code', 'custcity', 'pin'],
        'shipping_address': ['shipping_address', 'delivery_address', 'ship_address'],
        'item_name': ['item_name', 'product', 'product_name', 'item', 'description', 'particulars', 'prodname', 'prod_name', 'docname', 'doc_name'],
        'item_quantity': ['item_quantity', 'quantity', 'qty', 'qnty', 'rxqty', 'rx_qty'],
        'item_price': ['item_price', 'price', 'rate', 'unit_price', 'amount'],
        'tracking_number': ['tracking_number', 'tracking', 'awb', 'docket'],
        'invoice_number': ['invoice_number', 'invoice_no', 'invoice', 'bill_no', 'bill_number', 'inv_no', 'inv_number', 'voucher_no', 'voucher_number', 'receipt_no', 'receipt_number', 'doc_no', 'document_number'],
        'invoice_date': ['invoice_date', 'date', 'bill_date', 'doc_date', 'voucher_date', 'receipt_date', 'inv_date', 'feeddate', 'feed_date'],
    }
    
    # Suggest mappings
    suggested_mapping = {}
    for standard_col, variations in column_mapping.items():
        for col in detected_columns:
            if col in variations:
                suggested_mapping[col] = standard_col
                break
    
    return {
        "detected_columns": detected_columns,
        "suggested_mapping": suggested_mapping,
        "row_count": len(df),
        "standard_columns": {
            "customer_name": {"required": True, "description": "Customer name"},
            "customer_phone": {"required": True, "description": "Phone number (used to group products)"},
            "customer_email": {"required": False, "description": "Email address"},
            "customer_address_line1": {"required": False, "description": "Address line 1"},
            "customer_address_line2": {"required": False, "description": "Address line 2"},
            "customer_address_line3": {"required": False, "description": "Address line 3 (city/state/pincode)"},
            "shipping_address": {"required": False, "description": "Shipping/delivery address"},
            "item_name": {"required": True, "description": "Product/item name"},
            "item_quantity": {"required": True, "description": "Quantity"},
            "item_price": {"required": True, "description": "Unit price"},
            "tracking_number": {"required": False, "description": "Tracking/AWB number"},
            "invoice_number": {"required": False, "description": "Invoice number (if provided, uses existing or creates with this number)"},
            "invoice_date": {"required": False, "description": "Invoice date"},
        }
    }


@router.post("/invoices/bulk-upload")
async def bulk_upload_invoices(
    file: UploadFile = File(...),
    column_mapping: str = Form(""),  # JSON string of column mapping
    address_parts: str = Form(""),  # JSON string of address parts from template
    template_id: int = Form(0),  # Template ID to load mapping from database
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
    
    # Debug: Log what was received at the start
    with open('/tmp/upload_debug.log', 'a') as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"NEW UPLOAD REQUEST at {pd.Timestamp.now()}\n")
        f.write(f"template_id param: {template_id}\n")
        f.write(f"column_mapping param: {repr(column_mapping[:200] if column_mapping else 'EMPTY')}\n")
        f.write(f"address_parts param: {repr(address_parts)}\n")
    
    # If template_id is provided, load mapping from database
    if template_id > 0:
        template = db.query(models.ColumnMappingTemplate).filter(
            models.ColumnMappingTemplate.id == template_id,
            models.ColumnMappingTemplate.org_id == principal.org_id
        ).first()
        if template:
            column_mapping = json.dumps(template.column_mapping)
            address_parts = json.dumps(template.address_parts or {})
            with open('/tmp/upload_debug.log', 'a') as f:
                f.write(f"Loaded template '{template.name}' from database\n")
                f.write(f"Template column_mapping: {column_mapping[:200]}\n")
                f.write(f"Template address_parts: {address_parts}\n")
    
    with open('/tmp/upload_debug.log', 'a') as f:
        f.write(f"{'='*60}\n\n")
    
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
        
        # Handle duplicate column names by adding suffixes
        cols = pd.Series(df.columns)
        for dup in cols[cols.duplicated()].unique():
            cols[cols[cols == dup].index.values.tolist()] = [dup + '_' + str(i) if i != 0 else dup for i in range(sum(cols == dup))]
        df.columns = cols
        print(f"📋 Original CSV columns (after handling duplicates): {list(df.columns)}")
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")
    
    # Handle files with merged headers or data starting on later rows
    # Look for the actual header row by finding rows with meaningful column names
    if df.columns.str.contains('unnamed', case=False).sum() > len(df.columns) * 0.5:
        # More than 50% unnamed columns - likely header is in the data
        # Try to find a row with meaningful headers
        for idx in range(min(10, len(df))):  # Check first 10 rows
            potential_headers = df.iloc[idx].astype(str).str.lower().str.strip().str.replace(' ', '_')
            # Check if this row has common column names
            common_keywords = ['name', 'customer', 'party', 'phone', 'mobile', 'product', 'item', 'quantity', 'qty', 'price', 'rate', 'amount']
            if any(keyword in str(val).lower() for val in potential_headers for keyword in common_keywords):
                # Found likely header row
                df.columns = df.iloc[idx].astype(str).str.lower().str.strip().str.replace(' ', '_')
                df = df.iloc[idx+1:].reset_index(drop=True)
                break
    
    # Normalize column names - map common variations to standard names
    # If custom mapping provided, use it; otherwise use automatic mapping
    address_parts_config = {}
    if address_parts:
        try:
            address_parts_config = json.loads(address_parts)
            with open('/tmp/upload_debug.log', 'a') as f:
                f.write(f"\n=== UPLOAD DEBUG {pd.Timestamp.now()} ===\n")
                f.write(f"Received address_parts config: {address_parts_config}\n")
        except Exception as e:
            with open('/tmp/upload_debug.log', 'a') as f:
                f.write(f"Failed to parse address_parts: {e}\n")
    
    # Determine which mapping to use
    if column_mapping:
        try:
            custom_mapping = json.loads(column_mapping)
            with open('/tmp/upload_debug.log', 'a') as f:
                f.write(f"Custom mapping received: {custom_mapping}\n")
            # Apply custom mapping - normalize keys to lowercase for matching
            df.columns = df.columns.str.lower().str.strip().str.replace(' ', '_')
            # Also normalize custom mapping keys to lowercase
            normalized_mapping = {k.lower().strip().replace(' ', '_'): v for k, v in custom_mapping.items()}
            df = df.rename(columns=normalized_mapping)
            with open('/tmp/upload_debug.log', 'a') as f:
                f.write(f"Applied custom column mapping: {normalized_mapping}\n")
                f.write(f"Resulting columns after mapping: {list(df.columns)}\n")
            
            # After custom mapping, rename customer_id to custom_customer_id for database field
            # This is needed because UI uses 'customer_id' but DB field is 'custom_customer_id'
            if 'customer_id' in df.columns:
                df = df.rename(columns={'customer_id': 'custom_customer_id'})
                with open('/tmp/upload_debug.log', 'a') as f:
                    f.write(f"Renamed 'customer_id' -> 'custom_customer_id' for database field\n")
                    f.write(f"Final columns: {list(df.columns)}\n")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid column mapping: {str(e)}")
        
        # When custom mapping is provided, don't apply automatic fallback mapping
        # This ensures only explicitly mapped columns are used
        column_mapping_dict = {}
    else:
        # Use automatic column mapping
        column_mapping_dict = {
        # Customer ID variations (maps to custom_customer_id field)
        'customer_id': 'custom_customer_id',
        'customerid': 'custom_customer_id',
        'cust_id': 'custom_customer_id',
        'custid': 'custom_customer_id',
        'customer_code': 'custom_customer_id',
        'code': 'custom_customer_id',
        
        # Customer name variations
        'customer_name': 'customer_name',
        'customername': 'customer_name',
        'name': 'customer_name',
        'customer': 'customer_name',
        'cust_name': 'customer_name',
        'party_name': 'customer_name',
        'party': 'customer_name',
        'custname': 'customer_name',
        'customer_nm': 'customer_name',
        
        # Phone variations
        'customer_phone': 'customer_phone',
        'phone': 'customer_phone',
        'mobile': 'customer_phone',
        'contact': 'customer_phone',
        'phone_number': 'customer_phone',
        'mobile_number': 'customer_phone',
        'contact_number': 'customer_phone',
        'cust_phone': 'customer_phone',
        'custphone': 'customer_phone',
        
        # Email variations
        'customer_email': 'customer_email',
        'email': 'customer_email',
        'email_address': 'customer_email',
        
        # Address line 1 variations
        'customer_address': 'customer_address_line1',
        'address': 'customer_address_line1',
        'billing_address': 'customer_address_line1',
        'street': 'customer_address_line1',
        'address1': 'customer_address_line1',
        'address_1': 'customer_address_line1',
        'add4': 'customer_address_line1',  # Add4 field from CSV
        
        # Address line 2 variations
        'address2': 'customer_address_line2',
        'address_2': 'customer_address_line2',
        'locality': 'customer_address_line2',
        'area': 'customer_address_line2',
        'landmark': 'customer_address_line2',
        'custcity': 'customer_address_line2',  # CustCity field from CSV
        
        # Address line 3 variations
        'address3': 'customer_address_line3',
        'address_3': 'customer_address_line3',
        'city': 'customer_address_line3',
        'state': 'customer_address_line3',
        'pincode': 'customer_address_line3',
        'zip': 'customer_address_line3',
        'postal_code': 'customer_address_line3',
        'pin': 'customer_address_line3',  # Pin field from CSV
        
        # Shipping address variations
        'shipping_address': 'shipping_address',
        'delivery_address': 'shipping_address',
        'ship_address': 'shipping_address',
        
        # Item name variations (ProdName should be prioritized over DocName)
        'item_name': 'item_name',
        'product': 'item_name',
        'product_name': 'item_name',
        'item': 'item_name',
        'description': 'item_name',
        'particulars': 'item_name',
        'prodname': 'item_name',  # ProdName - actual product names
        'prod_name': 'item_name',
        
        # Quantity variations
        'item_quantity': 'item_quantity',
        'quantity': 'item_quantity',
        'qty': 'item_quantity',
        'qnty': 'item_quantity',
        'rxqty': 'item_quantity',
        'rx_qty': 'item_quantity',
        
        # Price variations
        'item_price': 'item_price',
        'price': 'item_price',
        'rate': 'item_price',
        'unit_price': 'item_price',
        'amount': 'item_price',
        
        # Tracking number variations
        'tracking_number': 'tracking_number',
        'tracking': 'tracking_number',
        'awb': 'tracking_number',
        'docket': 'tracking_number',
        
        # Invoice number variations
        'invoice_number': 'invoice_number',
        'invoice_no': 'invoice_number',
        'invoice': 'invoice_number',
        'bill_no': 'invoice_number',
        'bill_number': 'invoice_number',
        'inv_no': 'invoice_number',
        'inv_number': 'invoice_number',
        'voucher_no': 'invoice_number',
        'voucher_number': 'invoice_number',
        'receipt_no': 'invoice_number',
        'receipt_number': 'invoice_number',
        'doc_no': 'invoice_number',
        'document_number': 'invoice_number',
        'feedno': 'invoice_number',
        'feed_no': 'invoice_number',
        
        # Invoice date variations
        'invoice_date': 'invoice_date',
        'date': 'invoice_date',
        'bill_date': 'invoice_date',
        'doc_date': 'invoice_date',
        'voucher_date': 'invoice_date',
        'receipt_date': 'invoice_date',
        'inv_date': 'invoice_date',
        'feeddate': 'invoice_date',
        'feed_date': 'invoice_date',
        
        # GSTIN variations (for B2B identification)
        'gstin': 'customer_gstin',
        'gst': 'customer_gstin',
        'gst_number': 'customer_gstin',
        'gst_no': 'customer_gstin',
        'gstin_number': 'customer_gstin',
        'tax_id': 'customer_gstin',
        'tin': 'customer_gstin',
        
        # Rider/Driver name variations
        'rider': 'rider_name',
        'rider_name': 'rider_name',
        'driver': 'rider_name',
        'driver_name': 'rider_name',
        'delivery_boy': 'rider_name',
        'delivery_person': 'rider_name',
        }
        
        # Rename columns based on mapping (case-insensitive)
        df.columns = df.columns.str.lower().str.strip().str.replace(' ', '_')
        df = df.rename(columns={k.lower(): v for k, v in column_mapping_dict.items()})
    
    # Validate required columns - only customer_name and customer_phone are truly required
    required_cols = ['customer_name', 'customer_phone']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        # Show available columns to help user
        available_cols = ', '.join(df.columns.tolist())
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing_cols)}. Available columns: {available_cols}"
        )
    
    # Add default columns if item fields are missing
    if 'item_name' not in df.columns:
        df['item_name'] = 'All Items'
    if 'item_quantity' not in df.columns:
        df['item_quantity'] = 1
    if 'item_price' not in df.columns:
        # Try to use total_amount if available, otherwise default to 0
        if 'total_amount' in df.columns:
            df['item_price'] = df['total_amount']
        else:
            df['item_price'] = 0
    
    # Process each row - first validate and group by customer
    created_count = 0
    updated_count = 0
    new_customers_count = 0
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []
    upload_batch_id = str(uuid.uuid4())  # Track this bulk upload session
    
    # Fetch Google API key from global platform settings for geocoding
    platform_row = db.query(models.PlatformSettings).order_by(models.PlatformSettings.id.asc()).first()
    google_api_key = None
    if platform_row:
        cfg = platform_row.email_config or {}
        maps = cfg.get('maps_config') or {}
        google_api_key = maps.get("google_api_key")
    
    # Create bulk upload log entry
    upload_log = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='bulk_invoice_upload',
        payload=json.dumps({
            "batch_id": upload_batch_id,
            "file_name": file.filename,
            "file_type": file_ext,
            "total_rows": len(df),
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }),
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
        
        # Validate required fields - extract scalar values from Series
        try:
            phone_val = row['customer_phone']
            # Convert Series to scalar if needed
            if isinstance(phone_val, pd.Series):
                phone_val = phone_val.iloc[0] if len(phone_val) > 0 else None
            if pd.isna(phone_val) or not str(phone_val).strip():
                # Add warning for missing phone instead of error
                warnings.append({"row": row_num, "message": "Customer phone is missing - please add phone number", "field": "customer_phone"})
                # Use row number as temporary phone identifier
                phone_val = f"MISSING_PHONE_{row_num}"
            
            name_val = row['customer_name']
            if isinstance(name_val, pd.Series):
                name_val = name_val.iloc[0] if len(name_val) > 0 else None
            if pd.isna(name_val):
                errors.append({"row": row_num, "message": "Customer name is required"})
                continue
            if not str(name_val).strip():
                errors.append({"row": row_num, "message": "Customer name is required"})
                continue
            
            # Item name is now optional - use default if missing
            item_val = row['item_name']
            if isinstance(item_val, pd.Series):
                item_val = item_val.iloc[0] if len(item_val) > 0 else None
            # Don't error if item name is missing - it will use the default value
            
        except Exception as e:
            errors.append({"row": row_num, "message": f"Error processing row: {str(e)}"})
            continue
        
        # Validate numeric fields - now optional with defaults
        try:
            quantity_val = row['item_quantity']
            if isinstance(quantity_val, pd.Series):
                quantity_val = quantity_val.iloc[0] if len(quantity_val) > 0 else None
            if pd.isna(quantity_val):
                quantity = 1  # Default quantity
            else:
                quantity = float(quantity_val)
                # Allow negative quantities for returns, but not zero
                if quantity == 0:
                    errors.append({"row": row_num, "message": "Item quantity cannot be zero"})
                    continue
        except (ValueError, TypeError):
            quantity = 1  # Default to 1 if invalid
        
        try:
            price_val = row['item_price']
            if isinstance(price_val, pd.Series):
                price_val = price_val.iloc[0] if len(price_val) > 0 else None
            if pd.isna(price_val):
                price = 0  # Default price
            else:
                price = float(price_val)
                if price < 0:
                    errors.append({"row": row_num, "message": "Item price cannot be negative"})
                    continue
        except (ValueError, TypeError):
            price = 0  # Default to 0 if invalid
        
        # Normalize phone number
        phone = str(row['customer_phone']).strip()
        phone = phone.replace('-', '').replace(' ', '').replace('(', '').replace(')', '')
        
        # Group by phone number
        if customer_invoices[phone]["customer_data"] is None:
            # Combine address lines if multiple are present
            # Do NOT include customer name in address
            address_parts_list = []
            
            # Get customer name for reference (not added to address)
            cust_name = row['customer_name']
            if isinstance(cust_name, pd.Series):
                cust_name = cust_name.iloc[0] if len(cust_name) > 0 else None
            name_val = str(cust_name).strip() if not pd.isna(cust_name) else None
            
            # Dynamically add address parts based on what's in the columns
            # Check for both standard address_line columns and original columns from address_parts
            address_line_columns = ['customer_address_line1', 'customer_address_line2', 'customer_address_line3']
            
            # Also check for original column names if address_parts_config is available
            if address_parts_config:
                for part_key in ['part1', 'part2', 'part3']:
                    orig_col = address_parts_config.get(part_key, '').lower().strip().replace(' ', '_')
                    if orig_col and orig_col in df.columns:
                        address_line_columns.append(orig_col)
            
            with open('/tmp/upload_debug.log', 'a') as f:
                f.write(f"Processing address for customer: {str(cust_name)[:30]}\n")
                f.write(f"Available columns: {list(df.columns)}\n")
                f.write(f"Checking for address columns: {address_line_columns}\n")
            
            for addr_col in address_line_columns:
                if addr_col in df.columns:
                    addr_val = row[addr_col]
                    if isinstance(addr_val, pd.Series):
                        addr_val = addr_val.iloc[0] if len(addr_val) > 0 else None
                    if not pd.isna(addr_val) and str(addr_val).strip():
                        # Remove .0 from numeric values like PIN codes
                        addr_str = str(addr_val).strip()
                        if addr_str.endswith('.0') and addr_str.replace('.', '').isdigit():
                            addr_str = addr_str[:-2]
                        address_parts_list.append(addr_str)
                        with open('/tmp/upload_debug.log', 'a') as f:
                            f.write(f"Added {addr_col} to address: {addr_str}\n")
            
            combined_address = ', '.join(address_parts_list) if address_parts_list else None
            
            with open('/tmp/upload_debug.log', 'a') as f:
                f.write(f"Final combined address (Bill To & Ship To): {combined_address}\n\n")
            
            # Use shipping address column if provided, otherwise leave as None
            shipping_addr = None
            if 'shipping_address' in df.columns:
                ship_addr = row['shipping_address']
                if isinstance(ship_addr, pd.Series):
                    ship_addr = ship_addr.iloc[0] if len(ship_addr) > 0 else None
                if not pd.isna(ship_addr) and str(ship_addr).strip():
                    shipping_addr = str(ship_addr).strip()
            # Don't default to billing address - leave as None if not provided
            
            # Extract optional fields safely
            email_val = None
            if 'customer_email' in df.columns:
                email_val = row['customer_email']
                if isinstance(email_val, pd.Series):
                    email_val = email_val.iloc[0] if len(email_val) > 0 else None
                if not pd.isna(email_val) and str(email_val).strip():
                    email_val = str(email_val).strip()
                else:
                    email_val = None
            
            tracking_val = None
            if 'tracking_number' in df.columns:
                tracking_val = row['tracking_number']
                if isinstance(tracking_val, pd.Series):
                    tracking_val = tracking_val.iloc[0] if len(tracking_val) > 0 else None
                if not pd.isna(tracking_val) and str(tracking_val).strip():
                    tracking_val = str(tracking_val).strip()
                else:
                    tracking_val = None
            
            rider_name_val = None
            if 'rider_name' in df.columns:
                rider_name_val = row['rider_name']
                if isinstance(rider_name_val, pd.Series):
                    rider_name_val = rider_name_val.iloc[0] if len(rider_name_val) > 0 else None
                if not pd.isna(rider_name_val) and str(rider_name_val).strip():
                    rider_name_val = str(rider_name_val).strip()
                else:
                    rider_name_val = None
            
            invoice_num_val = None
            if 'invoice_number' in df.columns:
                invoice_num_val = row['invoice_number']
                if isinstance(invoice_num_val, pd.Series):
                    invoice_num_val = invoice_num_val.iloc[0] if len(invoice_num_val) > 0 else None
                if not pd.isna(invoice_num_val) and str(invoice_num_val).strip():
                    invoice_num_val = str(invoice_num_val).strip()
                    print(f"📄 Extracted invoice_number from CSV row {row_num}: {invoice_num_val}")
                else:
                    invoice_num_val = None
            else:
                print(f"⚠️ Column 'invoice_number' not found in dataframe columns: {list(df.columns)}")

            
            invoice_date_val = None
            if 'invoice_date' in df.columns:
                invoice_date_val = row['invoice_date']
                if isinstance(invoice_date_val, pd.Series):
                    invoice_date_val = invoice_date_val.iloc[0] if len(invoice_date_val) > 0 else None
                if not pd.isna(invoice_date_val) and str(invoice_date_val).strip():
                    invoice_date_val = str(invoice_date_val).strip()
                else:
                    invoice_date_val = None
            
            # Extract GSTIN to determine B2B vs B2C
            gstin_val = None
            if 'customer_gstin' in df.columns:
                gstin_val = row['customer_gstin']
                if isinstance(gstin_val, pd.Series):
                    gstin_val = gstin_val.iloc[0] if len(gstin_val) > 0 else None
                if not pd.isna(gstin_val) and str(gstin_val).strip():
                    gstin_val = str(gstin_val).strip()
                else:
                    gstin_val = None
            
            # Extract custom_customer_id if provided
            custom_customer_id_val = None
            if 'custom_customer_id' in df.columns:
                custom_customer_id_val = row['custom_customer_id']
                if isinstance(custom_customer_id_val, pd.Series):
                    custom_customer_id_val = custom_customer_id_val.iloc[0] if len(custom_customer_id_val) > 0 else None
                if not pd.isna(custom_customer_id_val) and str(custom_customer_id_val).strip():
                    custom_customer_id_val = str(custom_customer_id_val).strip()
                    print(f"📋 Extracted custom_customer_id from CSV row {row_num}: '{custom_customer_id_val}'")
                else:
                    custom_customer_id_val = None
            else:
                print(f"⚠️ Column 'custom_customer_id' not found in dataframe. Available columns: {list(df.columns)}")
            
            customer_invoices[phone]["customer_data"] = {
                "name": str(name_val).strip(),
                "email": email_val,
                "gstin": gstin_val,
                "custom_customer_id": custom_customer_id_val,
                "address": combined_address,
                "shipping_address": shipping_addr,
                "tracking_number": tracking_val,
                "rider_name": rider_name_val,
                "invoice_number": invoice_num_val,
                "invoice_date": invoice_date_val,
            }
        
        # Add item to this customer's invoice
        # Use description/qty/rate for compatibility with invoice PDF generation
        # Extract item_name properly to avoid pandas Series issues
        item_name_val = row['item_name']
        if isinstance(item_name_val, pd.Series):
            item_name_val = item_name_val.iloc[0] if len(item_name_val) > 0 else ""
        item_name_str = str(item_name_val).strip() if not pd.isna(item_name_val) else ""
        
        if row_num <= 3:  # Log first 3 items for debugging
            print(f"🔍 Row {row_num}: item_name extracted = '{item_name_str}', qty={quantity}, price={price}")
        
        customer_invoices[phone]["rows"].append({
            "row_num": row_num,
            "description": item_name_str,
            "qty": quantity,
            "rate": price,
            "total": quantity * price
        })
    
    # Track detailed processing results
    processed_invoices = []
    skipped_invoices = []
    failed_invoices = []
    
    # Now create invoices for each customer
    for phone, invoice_data in customer_invoices.items():
        try:
            customer_data = invoice_data["customer_data"]
            items = invoice_data["rows"]
            invoice_number = customer_data.get("invoice_number", "N/A")
            
            if not items:  # Skip if no valid items
                skipped_invoices.append({
                    "invoice_number": invoice_number,
                    "customer_name": customer_data.get("name", "Unknown"),
                    "phone": phone,
                    "reason": "No valid items"
                })
                continue
            
            # Check if customer exists
            customer = db.query(models.Customer).filter(
                models.Customer.org_id == principal.org_id,
                models.Customer.phone == phone
            ).first()
            
            customer_created = False
            if not customer:
                # Determine customer type based on GSTIN presence
                # If GSTIN is provided, it's B2B; otherwise B2C
                customer_type = 'B2B' if customer_data.get("gstin") else 'B2C'
                
                # customer_id (primary key) is auto-generated UUID
                # custom_customer_id is the user-provided ID from CSV or auto-generated
                custom_id = customer_data.get("custom_customer_id")
                if custom_id:
                    print(f"✅ Using provided customer_id from CSV: '{custom_id}' for customer {customer_data['name']}")
                    
                    # Check if custom_customer_id already exists in database
                    existing_customer = db.query(models.Customer).filter(
                        models.Customer.org_id == principal.org_id,
                        models.Customer.custom_customer_id == custom_id
                    ).first()
                    
                    if existing_customer:
                        error_msg = f"Customer ID '{custom_id}' already exists for customer '{existing_customer.name or existing_customer.company_name}' (Phone: {existing_customer.phone})"
                        print(f"❌ DUPLICATE customer_id: {error_msg}")
                        
                        # Skip this invoice and add to errors
                        failed_invoices.append({
                            "invoice_number": invoice_number,
                            "customer_name": customer_data.get("name", "Unknown"),
                            "phone": phone,
                            "error": error_msg,
                            "rows": [item["row_num"] for item in items]
                        })
                        for item in items:
                            errors.append({
                                "row": item["row_num"],
                                "message": error_msg,
                                "field": "customer_id"
                            })
                        continue  # Skip to next customer
                else:
                    # Auto-generate random 6-character alphanumeric customer ID
                    import random
                    import string
                    while True:
                        custom_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
                        # Check if generated ID already exists
                        existing = db.query(models.Customer).filter(
                            models.Customer.org_id == principal.org_id,
                            models.Customer.custom_customer_id == custom_id
                        ).first()
                        if not existing:
                            break  # Found a unique ID
                    print(f"🎲 Auto-generated customer_id: '{custom_id}' for customer {customer_data['name']}")
                
                # Create new customer
                customer = models.Customer(
                    customer_id=str(uuid.uuid4()),  # Primary key (auto-generated)
                    custom_customer_id=custom_id,
                    org_id=principal.org_id,
                    ctype=customer_type,
                    name=customer_data["name"],
                    phone=phone,
                    email=customer_data["email"],
                    gstin=customer_data.get("gstin"),
                    address=customer_data["address"],
                    created_by=principal.user_id,
                    created_at=datetime.now(timezone.utc)
                )
                
                # Geocode the address if Google API key is available
                if google_api_key:
                    # Use shipping address if available, otherwise use billing address
                    address_to_geocode = customer_data.get("shipping_address") or customer_data["address"]
                    if address_to_geocode:
                        coords = await geocode_address(address_to_geocode, google_api_key, principal.org_id, db, principal.user_id)
                        if coords:
                            customer.latitude = str(coords[0])
                            customer.longitude = str(coords[1])
                
                db.add(customer)
                print(f"💾 Saved NEW customer to DB: {customer.name}, phone={customer.phone}, custom_customer_id='{customer.custom_customer_id}'")
                new_customers_count += 1
                customer_created = True
            else:
                # Update existing customer with latest data from CSV
                print(f"🔄 Updating EXISTING customer: {customer.name}, phone={customer.phone}")
                if customer_data.get("custom_customer_id"):
                    # Check if the new custom_customer_id already exists for a different customer
                    new_custom_id = customer_data["custom_customer_id"]
                    if new_custom_id != customer.custom_customer_id:
                        existing_with_id = db.query(models.Customer).filter(
                            models.Customer.org_id == principal.org_id,
                            models.Customer.custom_customer_id == new_custom_id,
                            models.Customer.customer_id != customer.customer_id  # Different customer
                        ).first()
                        
                        if existing_with_id:
                            error_msg = f"Cannot update: Customer ID '{new_custom_id}' already exists for another customer '{existing_with_id.name or existing_with_id.company_name}' (Phone: {existing_with_id.phone})"
                            print(f"❌ DUPLICATE customer_id on update: {error_msg}")
                            
                            # Skip this invoice and add to errors
                            failed_invoices.append({
                                "invoice_number": invoice_number,
                                "customer_name": customer_data.get("name", "Unknown"),
                                "phone": phone,
                                "error": error_msg,
                                "rows": [item["row_num"] for item in items]
                            })
                            for item in items:
                                errors.append({
                                    "row": item["row_num"],
                                    "message": error_msg,
                                    "field": "customer_id"
                                })
                            continue  # Skip to next customer
                    
                    # Update custom_customer_id if no duplicate
                    old_id = customer.custom_customer_id
                    customer.custom_customer_id = new_custom_id
                    print(f"  📝 Updated custom_customer_id: '{old_id}' -> '{customer.custom_customer_id}'")
                if customer_data.get("email"):
                    customer.email = customer_data["email"]
                if customer_data.get("gstin"):
                    customer.gstin = customer_data["gstin"]
                    customer.ctype = 'B2B'
                # Always update address with the combined address from CSV
                if customer_data.get("address"):
                    customer.address = customer_data["address"]
                    # Clear old separate address fields
                    customer.city = None
                    customer.state = None
                    customer.pin = None
                    
                    # Update geocoding if API key available
                    if google_api_key:
                        address_to_geocode = customer_data.get("shipping_address") or customer_data["address"]
                        if address_to_geocode:
                            coords = await geocode_address(address_to_geocode, google_api_key, principal.org_id, db, principal.user_id)
                            if coords:
                                customer.latitude = str(coords[0])
                                customer.longitude = str(coords[1])
            
            # Use provided invoice number or generate new one
            provided_invoice_no = customer_data.get("invoice_number")
            if provided_invoice_no:
                invoice_no = provided_invoice_no
                print(f"✅ Using provided invoice number from CSV: {invoice_no} for customer {customer_data['name']}")
            else:
                print(f"⚠️ No invoice_number provided for customer {customer_data['name']}, generating new number")
                # Generate invoice number
                last_invoice = db.query(models.SyncLog).filter(
                    models.SyncLog.org_id == principal.org_id,
                    models.SyncLog.type == 'invoice'
                ).order_by(models.SyncLog.created_at.desc()).first()
                
                if last_invoice and last_invoice.payload:
                    try:
                        payload_data = json.loads(last_invoice.payload) if isinstance(last_invoice.payload, str) else last_invoice.payload
                        last_num = int(payload_data.get('invoice_no', '0'))
                        invoice_no = str(last_num + 1).zfill(6)
                    except:
                        invoice_no = datetime.now().strftime('%Y%m%d%H%M%S')
                else:
                    invoice_no = '000001'
            
            # Calculate totals from all items
            subtotal = sum(item["total"] for item in items)
            
            # Determine if this is a return order (all quantities are negative)
            is_return = all(item["qty"] < 0 for item in items)
            # Use invoice_draft type so orders appear in the orders page
            invoice_type = 'invoice_draft'
            order_status = 'return_initiated' if is_return else 'draft'
            
            # Create invoice payload with all items
            invoice_payload = {
                "invoice_id": str(uuid.uuid4()),
                "invoice_no": invoice_no,
                "provided_invoice_no": customer_data.get("invoice_number"),  # Track if invoice number was provided
                "is_return": is_return,
                "customer_id": customer.customer_id,
                "customer_name": customer.name,
                "customer_company_name": customer.company_name if hasattr(customer, 'company_name') else None,
                "customer_phone": customer.phone,
                "customer_email": customer.email,
                "customer_address": customer_data["address"],  # Use combined address from CSV
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
                "status": order_status,
                "created_at": customer_data.get("invoice_date") or datetime.now(timezone.utc).isoformat(),
                "created_by": principal.user_id,
                "upload_batch_id": upload_batch_id,  # Link to bulk upload session
                "delivery_address": customer_data["shipping_address"],
                "shipping_address": customer_data["shipping_address"],
            }
            
            # Check if invoice with this number already exists (skip for now - always create new)
            # Create new invoice in SyncLog
            invoice = models.SyncLog(
                org_id=principal.org_id,
                user_id=principal.user_id,
                type=invoice_type,
                payload=json.dumps(invoice_payload),
                created_at=datetime.now(timezone.utc)
            )
            db.add(invoice)
            created_count += 1
            
            # Track successful processing
            processed_invoices.append({
                "invoice_number": invoice_number,
                "customer_name": customer_data.get("name", "Unknown"),
                "phone": phone,
                "items_count": len(items),
                "total_amount": sum(item['total'] for item in items),
                "status": "created",
                "new_customer": customer_created
            })
            
            # Note: Tracking number is stored in invoice payload, no separate shipment model
            
            # Auto-assign rider if rider_name is provided
            rider_assigned = False
            rider_warning = None
            if customer_data.get("rider_name"):
                rider_name = customer_data["rider_name"].strip()
                print(f"🔍 Looking for rider: '{rider_name}' in org: {principal.org_id}")
                
                # Find rider by name (case-insensitive)
                rider = db.query(models.User).filter(
                    models.User.org_id == principal.org_id,
                    models.User.role == 'Rider',
                    models.User.name.ilike(f"%{rider_name}%")
                ).first()
                
                if rider:
                    print(f"✅ Found rider: {rider.name} (ID: {rider.user_id})")
                    # Create delivery assignment
                    delivery = models.Delivery(
                        delivery_id=str(uuid.uuid4()),
                        org_id=principal.org_id,
                        order_id=invoice_payload['invoice_id'],
                        customer=customer.name,
                        customer_phone=customer.phone,
                        address=customer_data.get("shipping_address") or customer_data["address"],
                        status='assigned',
                        assigned_rider_id=rider.user_id,
                        tracking_number=customer_data.get("tracking_number"),
                        created_at=datetime.now(timezone.utc),
                        assigned_at=datetime.now(timezone.utc)
                    )
                    db.add(delivery)
                    
                    # Create SyncLog entry for rider assignment (so it appears in UI)
                    rider_assignment_log = models.SyncLog(
                        org_id=principal.org_id,
                        user_id=principal.user_id,
                        type='invoice_rider_assigned',
                        payload=json.dumps({
                            'invoice_id': invoice_payload['invoice_id'],
                            'invoice_no': invoice_no,
                            'rider_name': rider.name,
                            'rider_email': rider.email,
                            'rider_id': rider.user_id,
                            'assigned_by': principal.user_id,
                            'auto_assigned': True
                        }),
                        created_at=datetime.now(timezone.utc)
                    )
                    db.add(rider_assignment_log)
                    
                    rider_assigned = True
                    print(f"✅ Auto-assigned rider '{rider.name}' to invoice {invoice_no}")
                else:
                    # Check what riders exist
                    all_riders = db.query(models.User).filter(
                        models.User.org_id == principal.org_id,
                        models.User.role == 'Rider'
                    ).all()
                    available_riders = [r.name for r in all_riders]
                    print(f"⚠️ Rider '{rider_name}' not found. Available riders: {available_riders}")
                    
                    # Rider not found - add warning
                    rider_warning = f"Rider '{rider_name}' not found. Available riders: {', '.join(available_riders) if available_riders else 'None'}"
                    warnings.append({
                        "row": items[0]["row_num"] if items else None,
                        "message": rider_warning,
                        "field": "rider_name",
                        "invoice_number": invoice_number
                    })
            else:
                print(f"ℹ️ No rider_name provided for invoice {invoice_no}")
            
            # Update processed invoice info with rider details
            processed_invoices[-1]["rider_assigned"] = rider_assigned
            processed_invoices[-1]["rider_name"] = customer_data.get("rider_name")
            if rider_warning:
                processed_invoices[-1]["rider_warning"] = rider_warning
            
        except Exception as e:
            # Track failed invoice
            failed_invoices.append({
                "invoice_number": customer_data.get("invoice_number", "N/A") if customer_data else "N/A",
                "customer_name": customer_data.get("name", "Unknown") if customer_data else "Unknown",
                "phone": phone,
                "error": str(e),
                "rows": [item["row_num"] for item in invoice_data.get("rows", [])]
            })
            # Add error for all rows belonging to this customer
            for item in invoice_data.get("rows", []):
                errors.append({"row": item["row_num"], "message": f"Error processing invoice: {str(e)}"})
            continue
    
    # Update upload log with results
    payload_data = json.loads(upload_log.payload) if upload_log.payload else {}
    payload_data.update({
        "created": created_count,
        "updated": updated_count,
        "new_customers": new_customers_count,
        "errors_count": len(errors),
        "warnings_count": len(warnings),
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "processed_invoices": processed_invoices,
        "skipped_invoices": skipped_invoices,
        "failed_invoices": failed_invoices
    })
    upload_log.payload = json.dumps(payload_data)
    
    # Commit all changes
    try:
        db.commit()
        
        # Write detailed report to log file
        with open('/tmp/upload_debug.log', 'a') as f:
            f.write(f"\n{'='*60}\n")
            f.write(f"UPLOAD COMPLETE at {pd.Timestamp.now()}\n")
            f.write(f"Total rows in CSV: {len(df)}\n")
            f.write(f"Unique customers: {len(customer_invoices)}\n")
            f.write(f"Successfully created: {created_count} invoices\n")
            f.write(f"New customers created: {new_customers_count}\n")
            f.write(f"Skipped: {len(skipped_invoices)} invoices\n")
            f.write(f"Failed: {len(failed_invoices)} invoices\n")
            f.write(f"Errors: {len(errors)}\n")
            f.write(f"Warnings: {len(warnings)}\n\n")
            
            if processed_invoices:
                f.write("✅ SUCCESSFULLY PROCESSED:\n")
                for inv in processed_invoices:
                    f.write(f"  • {inv['invoice_number']} - {inv['customer_name']} ({inv['phone']}) - "
                           f"{inv['items_count']} items - ₹{inv['total_amount']:.2f} - "
                           f"{'NEW customer' if inv['new_customer'] else 'Existing customer'}\n")
            
            if skipped_invoices:
                f.write("\n⚠️ SKIPPED:\n")
                for inv in skipped_invoices:
                    f.write(f"  • {inv['invoice_number']} - {inv['customer_name']} ({inv['phone']}) - "
                           f"Reason: {inv['reason']}\n")
            
            if failed_invoices:
                f.write("\n❌ FAILED:\n")
                for inv in failed_invoices:
                    f.write(f"  • {inv['invoice_number']} - {inv['customer_name']} ({inv['phone']}) - "
                           f"Error: {inv['error']}\n")
                    f.write(f"    Rows: {', '.join(map(str, inv['rows']))}\n")
            
            f.write(f"\n{'='*60}\n")
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    # Verify what was actually saved in database
    saved_count = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_draft',
        models.SyncLog.payload.contains(upload_batch_id)
    ).count()
    
    return {
        "created": created_count,
        "updated": updated_count,
        "new_customers": new_customers_count,
        "errors": errors,
        "warnings": warnings,
        "total_csv_rows": len(df),
        "unique_customers": len(customer_invoices),
        "processed_invoices": processed_invoices,
        "skipped_invoices": skipped_invoices,
        "failed_invoices": failed_invoices,
        "saved_in_db": saved_count,
        "report_available": "/tmp/upload_debug.log"
    }


@router.get("/invoices/export-uploaded")
async def export_uploaded_invoices(
    principal: CurrentPrincipal = Depends(get_current_principal),
    template_id: int = Query(None, description="Template ID to use original column names"),
    db: Session = Depends(get_db)
):
    """
    Export recently uploaded invoices (last 5 minutes) as CSV
    Use template_id to export with original column names from upload
    """
    from fastapi.responses import StreamingResponse
    import io
    
    # Get invoices uploaded in the last 5 minutes
    recent_invoices = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_draft',
        models.SyncLog.created_at > datetime.now(timezone.utc) - timedelta(minutes=5)
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    if not recent_invoices:
        raise HTTPException(status_code=404, detail="No recent uploads found")
    
    # Get template for reverse mapping if provided
    reverse_mapping = {}
    address_parts = None
    mapped_standards = set()
    if template_id:
        template = db.query(models.ColumnMappingTemplate).filter(
            models.ColumnMappingTemplate.id == template_id,
            models.ColumnMappingTemplate.org_id == principal.org_id
        ).first()
        if template:
            # Reverse: standard_name -> original_name
            for orig_col, std_col in template.column_mapping.items():
                reverse_mapping[std_col] = orig_col.upper()  # Original columns in uppercase
            address_parts = template.address_parts or {}
            
            # Build set of mapped standard columns
            mapped_standards = set(template.column_mapping.values())
            # If address_parts exist, customer_address was mapped
            if address_parts:
                mapped_standards.add('customer_address')
    
    # Create CSV in memory
    output = io.StringIO()
    
    # Build header based on template mapping
    all_standard_columns = ['invoice_number', 'invoice_date', 'customer_name', 'customer_phone', 
                           'customer_address', 'customer_email', 'customer_gstin',
                           'shipping_address', 'item_name', 'item_quantity', 'item_price', 'tracking_number']
    
    if template_id and template:
        # Include ALL standard columns, not just mapped ones
        header = []
        
        # Add all standard columns with standard names
        for std_col in all_standard_columns:
            header.append(std_col)
        
        # Always add item_total at the end
        header.append('item_total')
        
        output.write(','.join(header) + '\n')
    else:
        # Default: all standard columns
        output.write("invoice_number,invoice_date,customer_name,customer_phone,customer_address,shipping_address,item_name,item_quantity,item_price,item_total\n")
    
    for invoice in recent_invoices:
        try:
            data = json.loads(invoice.payload) if isinstance(invoice.payload, str) else invoice.payload
            
            items = data.get('items', [])
            for item in items:
                # Remove .0 from numeric values if they're whole numbers
                def clean_numeric(val):
                    if isinstance(val, (int, float)):
                        if float(val).is_integer():
                            return int(val)
                    return val
                
                # Build row based on mapped columns
                if template_id and template:
                    # mapped_standards already built above
                    row = []
                    
                    # Function to get value for a standard column
                    def get_column_value(std_col):
                        if std_col == 'invoice_number':
                            return data.get('invoice_no', '')
                        elif std_col == 'invoice_date':
                            return data.get('created_at', '')
                        elif std_col == 'customer_name':
                            return data.get('customer_name', '')
                        elif std_col == 'customer_phone':
                            return data.get('customer_phone', '')
                        elif std_col == 'customer_address':
                            return data.get('customer_address', '')  # Combined address
                        elif std_col == 'customer_email':
                            return data.get('customer_email', '')
                        elif std_col == 'customer_gstin':
                            return data.get('customer_gstin', '')
                        elif std_col == 'shipping_address':
                            return data.get('shipping_address', '')
                        elif std_col == 'item_name':
                            return item.get('description', '').replace('"', '""')
                        elif std_col == 'item_quantity':
                            return clean_numeric(item.get('qty', 0))
                        elif std_col == 'item_price':
                            return clean_numeric(item.get('rate', 0))
                        elif std_col == 'tracking_number':
                            return data.get('tracking_number', '')
                        else:
                            return ''
                    
                    # Build row with ALL standard columns (empty for unmapped)
                    for std_col in all_standard_columns:
                        val = get_column_value(std_col)
                        # Quote strings, don't quote numbers
                        if isinstance(val, (int, float)):
                            row.append(str(val))
                        else:
                            row.append(f'"{val}"')
                    
                    # Add item_total
                    total = clean_numeric(item.get('total', 0))
                    row.append(str(total))
                    
                    output.write(','.join(row) + '\n')
                else:
                    # Default export with all columns
                    invoice_no = data.get('invoice_no', '')
                    invoice_date = data.get('created_at', '')
                    customer_name = data.get('customer_name', '')
                    customer_phone = data.get('customer_phone', '')
                    customer_address = data.get('customer_address', '')
                    shipping_address = data.get('shipping_address', '')
                    description = item.get('description', '').replace('"', '""')
                    qty = clean_numeric(item.get('qty', 0))
                    rate = clean_numeric(item.get('rate', 0))
                    total = clean_numeric(item.get('total', 0))
                    
                    output.write(f'"{invoice_no}","{invoice_date}","{customer_name}","{customer_phone}","{customer_address}","{shipping_address}","{description}",{qty},{rate},{total}\n')
        except Exception as e:
            print(f"Error exporting invoice {invoice.id}: {e}")
            continue
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=uploaded_invoices_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


@router.get("/column-mapping-templates")
async def get_column_mapping_templates(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get all column mapping templates for the current user"""
    templates = db.query(models.ColumnMappingTemplate).filter(
        models.ColumnMappingTemplate.org_id == principal.org_id,
        models.ColumnMappingTemplate.user_id == principal.user_id
    ).order_by(models.ColumnMappingTemplate.updated_at.desc()).all()
    
    return [{
        "id": t.id,
        "name": t.name,
        "column_mapping": t.column_mapping,
        "address_parts": t.address_parts,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat()
    } for t in templates]


@router.post("/column-mapping-templates")
async def save_column_mapping_template(
    name: str = Form(...),
    column_mapping: str = Form(...),
    address_parts: str = Form(None),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Save or update a column mapping template"""
    import json
    
    # Check if template with same name exists
    existing = db.query(models.ColumnMappingTemplate).filter(
        models.ColumnMappingTemplate.org_id == principal.org_id,
        models.ColumnMappingTemplate.user_id == principal.user_id,
        models.ColumnMappingTemplate.name == name
    ).first()
    
    mapping_data = json.loads(column_mapping)
    address_data = json.loads(address_parts) if address_parts else None
    
    if existing:
        # Update existing template
        existing.column_mapping = mapping_data
        existing.address_parts = address_data
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        return {"message": "Template updated", "id": existing.id}
    else:
        # Create new template
        template = models.ColumnMappingTemplate(
            org_id=principal.org_id,
            user_id=principal.user_id,
            name=name,
            column_mapping=mapping_data,
            address_parts=address_data
        )
        db.add(template)
        db.commit()
        return {"message": "Template created", "id": template.id}


@router.delete("/column-mapping-templates/{template_id}")
async def delete_column_mapping_template(
    template_id: int,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Delete a column mapping template"""
    template = db.query(models.ColumnMappingTemplate).filter(
        models.ColumnMappingTemplate.id == template_id,
        models.ColumnMappingTemplate.org_id == principal.org_id,
        models.ColumnMappingTemplate.user_id == principal.user_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    db.delete(template)
    db.commit()
    return {"message": "Template deleted"}


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


@router.post("/invoices/{invoice_id}/return")
async def create_return_order(
    invoice_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Create a return order for an existing invoice
    """
    # Check permissions
    role_l = (principal.role or "").lower()
    if role_l not in {"admin", "owner", "superadmin", "orders manager", "billing staff"}:
        raise HTTPException(status_code=403, detail="You are not allowed to create return orders")
    
    # Find the original invoice
    original_invoice = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice'
    ).all()
    
    # Parse and find the matching invoice
    invoice_data = None
    original_log = None
    for log in original_invoice:
        try:
            payload = json.loads(log.payload) if isinstance(log.payload, str) else log.payload
            if payload.get('invoice_id') == invoice_id:
                invoice_data = payload
                original_log = log
                break
        except:
            continue
    
    if not invoice_data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Create return order with negative quantities
    return_invoice_id = str(uuid.uuid4())
    return_invoice_no = f"RET-{invoice_data.get('invoice_no', 'UNKNOWN')}"
    
    # Negate item quantities and amounts
    return_items = []
    for item in invoice_data.get('items', []):
        return_items.append({
            **item,
            "quantity": -abs(item.get("quantity", 0)),
            "total": -abs(item.get("total", 0))
        })
    
    return_payload = {
        "invoice_id": return_invoice_id,
        "invoice_no": return_invoice_no,
        "original_invoice_id": invoice_id,
        "original_invoice_no": invoice_data.get('invoice_no'),
        "is_return": True,
        "customer_id": invoice_data.get('customer_id'),
        "customer_name": invoice_data.get('customer_name'),
        "customer_company_name": invoice_data.get('customer_company_name'),
        "customer_phone": invoice_data.get('customer_phone'),
        "customer_email": invoice_data.get('customer_email'),
        "customer_address": invoice_data.get('customer_address'),
        "billing_phone": invoice_data.get('billing_phone'),
        "items": return_items,
        "totals": {
            "subtotal": -abs(invoice_data.get('totals', {}).get('subtotal', 0)),
            "tax": -abs(invoice_data.get('totals', {}).get('tax', 0)),
            "total": -abs(invoice_data.get('totals', {}).get('total', 0))
        },
        "subtotal": -abs(invoice_data.get('subtotal', 0)),
        "tax": -abs(invoice_data.get('tax', 0)),
        "total": -abs(invoice_data.get('total', 0)),
        "status": "return_initiated",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": principal.user_id,
        "delivery_address": invoice_data.get('delivery_address'),
        "shipping_address": invoice_data.get('shipping_address'),
    }
    
    # Create return invoice in SyncLog
    return_invoice = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='invoice_return',
        payload=json.dumps(return_payload),
        created_at=datetime.now(timezone.utc)
    )
    db.add(return_invoice)
    
    try:
        db.commit()
        return {
            "success": True,
            "return_invoice_id": return_invoice_id,
            "return_invoice_no": return_invoice_no,
            "original_invoice_id": invoice_id,
            "return_order": return_payload
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


class UpdatePhoneRequest(BaseModel):
    phone: str

@router.patch("/customers/{customer_id}/update-phone")
async def update_customer_phone(
    customer_id: str,
    request: UpdatePhoneRequest,
    db: Session = Depends(get_db),
    principal: CurrentPrincipal = Depends(get_current_principal),
):
    """Update customer phone number"""
    try:
        # Validate phone number
        phone = request.phone.strip()
        clean_phone = ''.join(filter(str.isdigit, phone))
        
        if len(clean_phone) < 10:
            raise HTTPException(status_code=400, detail="Phone number must be at least 10 digits")
        
        # Find customer by UUID
        customer = db.query(models.Customer).filter(
            models.Customer.customer_id == customer_id,
            models.Customer.org_id == principal.org_id
        ).first()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Update phone
        customer.phone = phone
        db.commit()
        
        return {
            "success": True,
            "customer_id": customer_id,
            "phone": phone,
            "message": "Phone number updated successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating phone: {str(e)}")
