from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..db import get_db
from .. import models, schemas
from ..deps import get_current_user, CurrentPrincipal

router = APIRouter()


def _require_superadmin(principal: CurrentPrincipal):
    if (principal.role or "").lower() != "superadmin":
        raise HTTPException(status_code=403, detail="Only SuperAdmin can perform this action")


@router.get("/providers", response_model=schemas.ShipmentProvidersList)
def list_providers(
    principal: CurrentPrincipal = Depends(get_current_user),
    db: Session = Depends(get_db),
    all: bool = Query(default=False, description="Include inactive providers (SuperAdmin only)"),
):
    q = db.query(models.ShipmentProvider)
    if not all or (principal.role or "").lower() != "superadmin":
        q = q.filter(models.ShipmentProvider.active == True)  # noqa: E712
    rows = q.order_by(models.ShipmentProvider.name.asc()).all()
    return {
        "items": [
            schemas.ShipmentProviderOut(
                provider_id=r.provider_id,
                name=r.name,
                code=r.code,
                tracking_url=r.tracking_url,
                active=r.active,
                created_at=r.created_at,
            )
            for r in rows
        ]
    }


@router.post("/providers", response_model=dict)
def create_provider(
    payload: schemas.ShipmentProviderCreate,
    principal: CurrentPrincipal = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_superadmin(principal)
    # Ensure unique code
    existing = (
        db.query(models.ShipmentProvider)
        .filter(models.ShipmentProvider.code == payload.code.upper())
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Provider code already exists")
    p = models.ShipmentProvider(
        name=payload.name,
        code=payload.code.upper(),
        tracking_url=payload.tracking_url,
        active=bool(payload.active if payload.active is not None else True),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"status": "ok", "provider_id": p.provider_id}


@router.put("/providers/{provider_id}", response_model=dict)
def update_provider(
    provider_id: str,
    payload: schemas.ShipmentProviderUpdate,
    principal: CurrentPrincipal = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_superadmin(principal)
    p = db.query(models.ShipmentProvider).filter(models.ShipmentProvider.provider_id == provider_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    if payload.name is not None:
        p.name = payload.name
    if payload.tracking_url is not None:
        p.tracking_url = payload.tracking_url
    if payload.active is not None:
        p.active = bool(payload.active)
    db.commit()
    return {"status": "ok"}
