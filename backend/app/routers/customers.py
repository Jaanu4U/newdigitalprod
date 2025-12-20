from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import csv
import io
from ..db import get_db, Base, engine
from .. import models, schemas
from ..deps import get_current_principal, CurrentPrincipal

router = APIRouter()

# Ensure table exists (dev-friendly)
Base.metadata.create_all(bind=engine)


def _ensure_billing_role(principal: CurrentPrincipal):
    role = (principal.role or "").lower()
    if role not in {"admin", "owner", "superadmin", "billing staff"}:
        raise HTTPException(status_code=403, detail="Only Admin/Owner/SuperAdmin/Billing Staff can access customers")


@router.get("/customers", response_model=schemas.CustomersListOut)
def list_customers(
    q: Optional[str] = Query(default=None, description="Search by name/company/email/phone"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    _ensure_billing_role(principal)
    query = db.query(models.Customer).filter(models.Customer.org_id == principal.org_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (models.Customer.name.ilike(like)) |
            (models.Customer.company_name.ilike(like)) |
            (models.Customer.email.ilike(like)) |
            (models.Customer.phone.ilike(like))
        )
    rows = query.order_by(models.Customer.created_at.desc()).offset(offset).limit(limit).all()
    items = [
        schemas.CustomerOut(
            customer_id=r.customer_id,
            ctype=r.ctype,
            name=r.name,
            company_name=r.company_name,
            gstin=r.gstin,
            email=r.email,
            phone=r.phone,
            address=r.address,
            city=r.city,
            state=r.state,
            pin=r.pin,
            notes=r.notes,
            created_at=r.created_at,
            updated_at=r.updated_at,
        ) for r in rows
    ]
    return schemas.CustomersListOut(items=items)


@router.post("/customers", response_model=schemas.CustomerOut)
def create_customer(
    payload: schemas.CustomerCreate,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    _ensure_billing_role(principal)
    ctype = (payload.ctype or "b2c").lower()
    if ctype not in {"b2b", "b2c"}:
        raise HTTPException(status_code=400, detail="ctype must be 'b2b' or 'b2c'")
    # basic validation for B2B
    gstin = (payload.gstin or "").strip().upper()
    if ctype == "b2b" and gstin and len(gstin) != 15:
        raise HTTPException(status_code=400, detail="Invalid GSTIN format (expected 15 chars)")

    row = models.Customer(
        org_id=principal.org_id,
        ctype=ctype,
        name=payload.name,
        company_name=payload.company_name,
        gstin=gstin or None,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        pin=payload.pin,
        notes=payload.notes,
        created_by=principal.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.CustomerOut(
        customer_id=row.customer_id,
        ctype=row.ctype,
        name=row.name,
        company_name=row.company_name,
        gstin=row.gstin,
        email=row.email,
        phone=row.phone,
        address=row.address,
        city=row.city,
        state=row.state,
        pin=row.pin,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/customers/{customer_id}", response_model=schemas.CustomerOut)
def get_customer(customer_id: str, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    _ensure_billing_role(principal)
    row = db.query(models.Customer).filter(models.Customer.org_id == principal.org_id, models.Customer.customer_id == customer_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    return schemas.CustomerOut(
        customer_id=row.customer_id,
        ctype=row.ctype,
        name=row.name,
        company_name=row.company_name,
        gstin=row.gstin,
        email=row.email,
        phone=row.phone,
        address=row.address,
        city=row.city,
        state=row.state,
        pin=row.pin,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.put("/customers/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(
    customer_id: str,
    payload: schemas.CustomerUpdate,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    _ensure_billing_role(principal)
    row = db.query(models.Customer).filter(models.Customer.org_id == principal.org_id, models.Customer.customer_id == customer_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    if payload.ctype is not None:
        ct = payload.ctype.lower()
        if ct not in {"b2b", "b2c"}:
            raise HTTPException(status_code=400, detail="ctype must be 'b2b' or 'b2c'")
        row.ctype = ct
    for field in ["name", "company_name", "email", "phone", "address", "city", "state", "pin", "notes"]:
        v = getattr(payload, field, None)
        if v is not None:
            setattr(row, field, v)
    if payload.gstin is not None:
        gst = payload.gstin.strip().upper()
        if row.ctype == "b2b" and gst and len(gst) != 15:
            raise HTTPException(status_code=400, detail="Invalid GSTIN format (expected 15 chars)")
        row.gstin = gst or None
    db.commit()
    db.refresh(row)
    return schemas.CustomerOut(
        customer_id=row.customer_id,
        ctype=row.ctype,
        name=row.name,
        company_name=row.company_name,
        gstin=row.gstin,
        email=row.email,
        phone=row.phone,
        address=row.address,
        city=row.city,
        state=row.state,
        pin=row.pin,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.delete("/customers/{customer_id}", response_model=dict)
def delete_customer(customer_id: str, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    _ensure_billing_role(principal)
    row = db.query(models.Customer).filter(models.Customer.org_id == principal.org_id, models.Customer.customer_id == customer_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(row)
    db.commit()
    return {"status": "ok"}


@router.post("/customers/bulk-upload")
async def bulk_upload_customers(
    file: UploadFile = File(...),
    ctype: str = Form(...),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """
    Bulk upload customers from CSV file.
    B2C columns: name, email, phone, address, city, state, pin, notes
    B2B columns: company_name, name, gstin, email, phone, address, city, state, pin, notes
    """
    _ensure_billing_role(principal)
    
    if ctype not in {"b2b", "b2c"}:
        raise HTTPException(status_code=400, detail="ctype must be 'b2b' or 'b2c'")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")
    
    # Read file content
    content = await file.read()
    try:
        text_content = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text_content = content.decode('latin-1')
        except:
            raise HTTPException(status_code=400, detail="Unable to decode CSV file. Please ensure it's UTF-8 or Latin-1 encoded")
    
    # Parse CSV
    csv_file = io.StringIO(text_content)
    reader = csv.DictReader(csv_file)
    
    total_rows = 0
    successful = 0
    failed = 0
    errors = []
    
    for idx, row in enumerate(reader, start=2):  # Start at 2 because row 1 is header
        total_rows += 1
        try:
            # Common fields
            phone = (row.get('phone') or '').strip()
            email = (row.get('email') or '').strip() or None
            address = (row.get('address') or '').strip() or None
            city = (row.get('city') or '').strip() or None
            state = (row.get('state') or '').strip() or None
            pin = (row.get('pin') or '').strip() or None
            notes = (row.get('notes') or '').strip() or None
            
            # Validate required fields
            if not phone:
                errors.append({"row": idx, "error": "Phone number is required"})
                failed += 1
                continue
            
            # Check for duplicate phone in same org
            existing = db.query(models.Customer).filter(
                models.Customer.org_id == principal.org_id,
                models.Customer.phone == phone
            ).first()
            
            if existing:
                errors.append({"row": idx, "error": f"Customer with phone {phone} already exists"})
                failed += 1
                continue
            
            if ctype == 'b2c':
                name = (row.get('name') or '').strip()
                if not name:
                    errors.append({"row": idx, "error": "Name is required for B2C customers"})
                    failed += 1
                    continue
                
                customer = models.Customer(
                    org_id=principal.org_id,
                    ctype='b2c',
                    name=name,
                    email=email,
                    phone=phone,
                    address=address,
                    city=city,
                    state=state,
                    pin=pin,
                    notes=notes,
                    created_by=principal.user_id,
                )
            else:  # b2b
                company_name = (row.get('company_name') or '').strip()
                if not company_name:
                    errors.append({"row": idx, "error": "Company name is required for B2B customers"})
                    failed += 1
                    continue
                
                name = (row.get('name') or '').strip() or None
                gstin = (row.get('gstin') or '').strip().upper() or None
                
                # Validate GSTIN if provided
                if gstin and len(gstin) != 15:
                    errors.append({"row": idx, "error": f"Invalid GSTIN format (expected 15 characters, got {len(gstin)})"})
                    failed += 1
                    continue
                
                customer = models.Customer(
                    org_id=principal.org_id,
                    ctype='b2b',
                    company_name=company_name,
                    name=name,
                    gstin=gstin,
                    email=email,
                    phone=phone,
                    address=address,
                    city=city,
                    state=state,
                    pin=pin,
                    notes=notes,
                    created_by=principal.user_id,
                )
            
            db.add(customer)
            db.commit()
            successful += 1
            
        except Exception as e:
            db.rollback()
            errors.append({"row": idx, "error": str(e)})
            failed += 1
    
    return {
        "total_rows": total_rows,
        "successful": successful,
        "failed": failed,
        "errors": errors[:50]  # Limit errors to first 50
    }

