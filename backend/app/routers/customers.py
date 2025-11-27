from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
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
