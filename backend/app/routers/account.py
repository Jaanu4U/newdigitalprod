from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas
from ..deps import get_current_user, CurrentPrincipal
from ..security import verify_password, hash_password

router = APIRouter()


@router.get("/me", response_model=schemas.UserOut)
def get_me(principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(models.User).filter(models.User.user_id == principal.user_id)
    # If org_id present, also ensure scoping
    if principal.org_id:
        q = q.filter(models.User.org_id == principal.org_id)
    user = q.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return schemas.UserOut(
        user_id=user.user_id,
        email=user.email,
        name=user.name,
        cellnumber=user.cellnumber,
        role=user.role,
        team=user.team,
        status=user.status,
        created_at=user.created_at,
    )


@router.put("/me", response_model=dict)
def update_me(payload: schemas.UpdateProfileIn, principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(models.User).filter(models.User.user_id == principal.user_id)
    if principal.org_id:
        q = q.filter(models.User.org_id == principal.org_id)
    user = q.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.name is not None:
        user.name = payload.name
    if payload.cellnumber is not None:
        user.cellnumber = payload.cellnumber
    db.commit()
    db.refresh(user)
    return {"status": "ok"}


@router.put("/me/password", response_model=dict)
def change_password(payload: schemas.PasswordChangeIn, principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(models.User).filter(models.User.user_id == principal.user_id)
    if principal.org_id:
        q = q.filter(models.User.org_id == principal.org_id)
    user = q.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"status": "ok"}
