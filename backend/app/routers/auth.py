from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas
from ..security import verify_password, create_token, decode_token
from ..tenancy import resolve_tenant

router = APIRouter()

@router.post("/login", response_model=schemas.TokenOut)
def login(payload: schemas.LoginIn, request: Request, db: Session = Depends(get_db)):
    import logging
    logger = logging.getLogger(__name__)
    
    org_id = payload.org_id
    logger.info(f"Login attempt - email: {payload.email}, org_id provided: {org_id}")
    
    if not org_id:
        org = resolve_tenant(request, db)
        if org is None:
            raise HTTPException(status_code=400, detail="Missing org_id and no tenant resolved from host")
        org_id = org.org_id
        logger.info(f"Resolved org_id from tenant: {org_id}")

    user = db.query(models.User).filter(models.User.org_id == org_id, models.User.email == payload.email).first()
    logger.info(f"User lookup - found: {user is not None}, org_id: {org_id}")
    
    if not user or not verify_password(payload.password, user.password_hash):
        logger.warning(f"Login failed - user: {user is not None}, password_match: {verify_password(payload.password, user.password_hash) if user else False}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check if email is verified
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Email not verified. Please verify your email before logging in.")

    access = create_token({"sub": user.user_id, "org_id": user.org_id, "role": user.role})
    refresh = create_token({"sub": user.user_id, "org_id": user.org_id, "type": "refresh"}, expires_in=60*60*24*30)

    return {
        "access_token": access,
        "refresh_token": refresh,
        "user": {"user_id": user.user_id, "role": user.role},
        "org_id": user.org_id
    }


@router.post("/superadmin-login", response_model=schemas.SuperAdminTokenOut)
def superadmin_login(payload: schemas.SuperAdminLoginIn, db: Session = Depends(get_db)):
    """SuperAdmin login: email + password only, no org_id required."""
    user = db.query(models.User).filter(models.User.email == payload.email, models.User.role == "SuperAdmin").first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Fetch all organizations for the SuperAdmin
    orgs = db.query(models.Organization).all()
    org_list = [{"org_id": o.org_id, "name": o.name, "status": o.status} for o in orgs]

    access = create_token({"sub": user.user_id, "org_id": None, "role": "SuperAdmin", "is_superadmin": True})
    refresh = create_token({"sub": user.user_id, "org_id": None, "type": "refresh"}, expires_in=60*60*24*30)

    return {
        "access_token": access,
        "refresh_token": refresh,
        "user": {"user_id": user.user_id, "role": user.role},
        "organizations": org_list
    }


@router.post("/refresh", response_model=schemas.TokenPairOut)
def refresh(payload: schemas.RefreshIn, db: Session = Depends(get_db)):
    # Validate refresh token and issue a new access and refresh pair
    try:
        data = decode_token(payload.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = data.get("sub")
    org_id = data.get("org_id")
    if not user_id or not org_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(models.User).filter(models.User.user_id == user_id, models.User.org_id == org_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    new_access = create_token({"sub": user.user_id, "org_id": user.org_id, "role": user.role})
    new_refresh = create_token({"sub": user.user_id, "org_id": user.org_id, "type": "refresh"}, expires_in=60*60*24*30)
    return {"access_token": new_access, "refresh_token": new_refresh}
