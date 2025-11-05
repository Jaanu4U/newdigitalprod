from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..db import get_db
from .. import models, schemas
from typing import List
from passlib.context import CryptContext
import secrets
import string

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
router = APIRouter()


@router.get("/superadmin/dashboard", response_model=dict)
def superadmin_dashboard(db: Session = Depends(get_db)):
    """Get global dashboard stats for SuperAdmin: all orgs, users, deliveries, activities."""
    
    # Total organizations
    total_orgs = db.query(func.count(models.Organization.org_id)).scalar() or 0
    
    # Total users (excluding superadmin)
    total_users = db.query(func.count(models.User.user_id)).filter(
        models.User.role != "SuperAdmin"
    ).scalar() or 0
    
    # Total deliveries
    total_deliveries = db.query(func.count(models.Delivery.delivery_id)).scalar() or 0
    
    # Deliveries by status
    status_breakdown = db.query(
        models.Delivery.status,
        func.count(models.Delivery.delivery_id).label("count")
    ).group_by(models.Delivery.status).all()
    
    status_stats = {status: count for status, count in status_breakdown} if status_breakdown else {}
    
    # Get all organizations with stats
    orgs = db.query(models.Organization).all()
    org_list = []
    
    for org in orgs:
        org_users = db.query(func.count(models.User.user_id)).filter(
            models.User.org_id == org.org_id
        ).scalar() or 0
        
        org_deliveries = db.query(func.count(models.Delivery.delivery_id)).filter(
            models.Delivery.org_id == org.org_id
        ).scalar() or 0
        
        org_list.append({
            "org_id": org.org_id,
            "name": org.name,
            "status": org.status,
            "users_count": org_users,
            "deliveries_count": org_deliveries,
            "created_at": org.created_at.isoformat() if org.created_at else None
        })
    
    # Recent deliveries (last 10 across all orgs)
    recent_deliveries = db.query(
        models.Delivery.delivery_id,
        models.Delivery.org_id,
        models.Delivery.order_id,
        models.Delivery.customer,
        models.Delivery.status,
        models.Delivery.created_at
    ).order_by(models.Delivery.created_at.desc()).limit(10).all()
    
    recent = [
        {
            "delivery_id": d.delivery_id,
            "org_id": d.org_id,
            "order_id": d.order_id,
            "customer": d.customer,
            "status": d.status,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in recent_deliveries
    ]
    
    return {
        "summary": {
            "total_organizations": total_orgs,
            "total_users": total_users,
            "total_deliveries": total_deliveries,
            "status_breakdown": status_stats
        },
        "organizations": org_list,
        "recent_deliveries": recent
    }


@router.get("/superadmin/organizations", response_model=List[dict])
def superadmin_organizations(db: Session = Depends(get_db)):
    """List all organizations with detailed stats."""
    
    orgs = db.query(models.Organization).all()
    org_list = []
    
    for org in orgs:
        org_users = db.query(func.count(models.User.user_id)).filter(
            models.User.org_id == org.org_id
        ).scalar() or 0
        
        org_deliveries = db.query(func.count(models.Delivery.delivery_id)).filter(
            models.Delivery.org_id == org.org_id
        ).scalar() or 0
        
        org_delivery_status = db.query(
            models.Delivery.status,
            func.count(models.Delivery.delivery_id).label("count")
        ).filter(models.Delivery.org_id == org.org_id).group_by(models.Delivery.status).all()
        
        status_stats = {status: count for status, count in org_delivery_status} if org_delivery_status else {}
        
        org_list.append({
            "org_id": org.org_id,
            "name": org.name,
            "status": org.status,
            "users_count": org_users,
            "deliveries_count": org_deliveries,
            "delivery_status_breakdown": status_stats,
            "created_at": org.created_at.isoformat() if org.created_at else None
        })
    
    return org_list


# Old endpoint removed - see get_all_users below for updated version with cellnumber and team


@router.get("/superadmin/deliveries", response_model=List[dict])
def superadmin_deliveries(
    status: str = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List deliveries across all organizations, optionally filtered by status."""
    
    query = db.query(
        models.Delivery.delivery_id,
        models.Delivery.org_id,
        models.Delivery.order_id,
        models.Delivery.customer,
        models.Delivery.status,
        models.Delivery.created_at
    )
    
    if status:
        query = query.filter(models.Delivery.status == status)
    
    deliveries = query.order_by(models.Delivery.created_at.desc()).limit(limit).all()
    
    delivery_list = [
        {
            "delivery_id": d.delivery_id,
            "org_id": d.org_id,
            "order_id": d.order_id,
            "customer": d.customer,
            "status": d.status,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in deliveries
    ]
    
    return delivery_list


@router.get("/superadmin/superadmin-users", response_model=dict)
def superadmin_superadmin_users(db: Session = Depends(get_db)):
    """List all SuperAdmin users grouped by team."""
    
    # Fetch only SuperAdmin users
    users = db.query(models.User).filter(models.User.role == "SuperAdmin").all()
    
    # Group by team
    teams = {}
    for user in users:
        team = user.team or "Unassigned"
        if team not in teams:
            teams[team] = []
        teams[team].append({
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name,
            "team": user.team,
            "status": user.status,
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "created_at": user.created_at.isoformat() if user.created_at else None
        })
    
    return {
        "total_superadmin_users": len(users),
        "teams": teams
    }


# User Management Endpoints
@router.post("/superadmin/users/create", response_model=dict)
def create_user(user_data: schemas.CreateUserIn, db: Session = Depends(get_db)):
    """Create a new SuperAdmin user."""
    
    # Check if user already exists
    existing = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Determine password: if omitted or defaulted, generate a secure temp password
    default_placeholder = "TempPassword@123!"
    provided = (user_data.password or "").strip()
    if not provided or provided == default_placeholder:
        # Letters, digits and a few safe symbols
        letters_digits = string.ascii_letters + string.digits
        symbols = "!@#$%^&*"
        core = [
            secrets.choice(string.ascii_lowercase),
            secrets.choice(string.ascii_uppercase),
            secrets.choice(string.digits),
            secrets.choice(symbols),
        ]
        remaining = [secrets.choice(letters_digits + symbols) for _ in range(8)]  # total ~12 chars
        chars = core + remaining
        secrets.SystemRandom().shuffle(chars)
        temp_password = "".join(chars)
    else:
        temp_password = provided

    # Create new user
    new_user = models.User(
        email=user_data.email,
        name=user_data.name,
        cellnumber=user_data.cellnumber,
        role=user_data.role,
        team=user_data.team,
        password_hash=pwd_context.hash(temp_password),
        status="active"
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {
        "status": "success",
        "user_id": new_user.user_id,
        "email": new_user.email,
        "message": f"User {user_data.email} created successfully",
        "temp_password": temp_password,
    }


@router.get("/superadmin/users", response_model=List[dict])
def get_all_users(db: Session = Depends(get_db)):
    """Get all users (SuperAdmin, Admin, Staff)."""
    
    users = db.query(models.User).all()
    
    user_list = [
        {
            "user_id": u.user_id,
            "email": u.email,
            "name": u.name,
            "cellnumber": u.cellnumber,
            "role": u.role,
            "team": u.team,
            "status": u.status,
            "created_at": u.created_at.isoformat() if u.created_at else None
        }
        for u in users
    ]
    
    return user_list


@router.put("/superadmin/users/{user_id}", response_model=dict)
def update_user(user_id: str, user_data: schemas.UpdateUserIn, db: Session = Depends(get_db)):
    """Update user details."""
    
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    if user_data.name is not None:
        user.name = user_data.name
    if user_data.cellnumber is not None:
        user.cellnumber = user_data.cellnumber
    if user_data.role is not None:
        user.role = user_data.role
    if user_data.team is not None:
        user.team = user_data.team
    if user_data.status is not None:
        user.status = user_data.status
    
    db.commit()
    db.refresh(user)
    
    return {
        "status": "success",
        "user_id": user.user_id,
        "message": f"User {user.email} updated successfully"
    }


@router.delete("/superadmin/users/{user_id}", response_model=dict)
def delete_user(user_id: str, db: Session = Depends(get_db)):
    """Delete a user."""
    
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    email = user.email
    db.delete(user)
    db.commit()
    
    return {
        "status": "success",
        "message": f"User {email} deleted successfully"
    }
