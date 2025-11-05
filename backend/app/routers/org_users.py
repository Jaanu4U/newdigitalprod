from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import secrets
import string

from ..db import get_db
from .. import models, schemas
from ..deps import get_current_principal, CurrentPrincipal
from ..security import hash_password

router = APIRouter()


def _generate_temp_password(length: int = 12) -> str:
    # Letters, digits and a few safe symbols
    letters_digits = string.ascii_letters + string.digits
    symbols = "!@#$%^&*"
    # Ensure a mix by including at least one symbol and one digit
    core = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice(symbols),
    ]
    remaining = [secrets.choice(letters_digits + symbols) for _ in range(max(0, length - len(core)))]
    chars = core + remaining
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


@router.get("/org/users", response_model=List[schemas.UserOut])
def list_org_users(principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    # Restrict Account Manager visibility to only users they created
    base_query = db.query(models.User).filter(models.User.org_id == principal.org_id)
    role_l = (principal.role or "").lower()
    manager_roles = {
        "manager",
        "accountant manager",
        "inventory manager",
        "orders manager",
        "delivery manager",
    }
    if role_l in manager_roles:
        base_query = base_query.filter(models.User.created_by == principal.user_id)
    users = base_query.all()
    return [
        schemas.UserOut(
            user_id=u.user_id,
            email=u.email,
            name=u.name,
            cellnumber=u.cellnumber,
            role=u.role,
            team=u.team,
            status=u.status,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("/org/users", response_model=dict)
def create_org_user(
    payload: schemas.CreateUserIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    # Determine creator permissions based on role
    role_creator = (principal.role or "").lower()
    privileged_creators = {"admin", "superadmin", "owner"}
    manager_create_map = {
        "accountant manager": {"account staff"},
        "inventory manager": {"inventory staff"},
        "orders manager": {"orders staff", "rider"},
        "delivery manager": {"delivery staff"},
        "manager": {"staff"},
    }

    role_l = (payload.role or "").lower()
    if role_l == "superadmin":
        raise HTTPException(status_code=400, detail="Cannot create SuperAdmin from org scope")
    # Expanded allowed org-scoped roles
    all_allowed_roles = {
        "admin",
        "staff",
        "rider",
        "manager",
        "accountant manager",
        "account staff",
        "inventory manager",
        "inventory staff",
        "delivery manager",
        "delivery staff",
        "orders manager",
        "orders staff",
    }

    # Determine the set of roles this creator can assign
    if role_creator in privileged_creators:
        allowed_to_create = all_allowed_roles
    else:
        allowed_to_create = manager_create_map.get(role_creator, set())
        if not allowed_to_create:
            raise HTTPException(status_code=403, detail="You do not have permission to create users")

    if role_l not in all_allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Allowed: {', '.join(sorted(all_allowed_roles))}")
    if role_l not in allowed_to_create:
        raise HTTPException(status_code=403, detail="You can only create your staff or riders")

    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Determine password: use provided or generate
    temp_password = (payload.password or "").strip() or _generate_temp_password()

    user = models.User(
        org_id=principal.org_id,
        email=payload.email,
        name=payload.name,
        cellnumber=payload.cellnumber,
        role=payload.role,
        team=payload.team,
        password_hash=hash_password(temp_password),
        created_by=principal.user_id,
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"status": "ok", "user_id": user.user_id, "temp_password": temp_password}


@router.put("/org/users/{user_id}", response_model=dict)
def update_org_user(
    user_id: str,
    payload: schemas.UpdateUserIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    # Only allow org Admins to update users
    if (principal.role or "").lower() not in {"admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only Admins can update users")

    user = db.query(models.User).filter(models.User.user_id == user_id, models.User.org_id == principal.org_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role:
        role_l = payload.role.lower()
        if role_l == "superadmin":
            raise HTTPException(status_code=400, detail="Cannot set role to SuperAdmin in org scope")
        # Expanded allowed org-scoped roles (must match create)
        allowed_roles = {
            "admin",
            "staff",
            "rider",
            "manager",
            "accountant manager",
            "account staff",
            "inventory manager",
            "inventory staff",
            "delivery manager",
            "delivery staff",
            "orders manager",
            "orders staff",
        }
        if role_l not in allowed_roles:
            raise HTTPException(status_code=400, detail=f"Invalid role. Allowed: {', '.join(sorted(allowed_roles))}")

    if payload.name is not None:
        user.name = payload.name
    if payload.cellnumber is not None:
        user.cellnumber = payload.cellnumber
    if payload.role is not None:
        user.role = payload.role
    if payload.team is not None:
        user.team = payload.team
    if payload.status is not None:
        user.status = payload.status

    db.commit()
    db.refresh(user)
    return {"status": "ok", "user_id": user.user_id}


@router.delete("/org/users/{user_id}", response_model=dict)
def delete_org_user(
    user_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    # Only allow org Admins to delete users
    if (principal.role or "").lower() not in {"admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only Admins can delete users")

    user = db.query(models.User).filter(models.User.user_id == user_id, models.User.org_id == principal.org_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"status": "ok"}
