from fastapi import Depends, HTTPException, Header
from jose import jwt, JWTError
from .core import settings
from typing import Optional

class CurrentPrincipal:
    def __init__(self, user_id: str, org_id: str, role: str | None = None):
        self.user_id = user_id
        self.org_id = org_id
        self.role = role


def get_current_principal(authorization: Optional[str] = Header(None)) -> CurrentPrincipal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        sub = payload.get("sub")
        org_id = payload.get("org_id")
        role = payload.get("role")
        if not sub or not org_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return CurrentPrincipal(user_id=sub, org_id=org_id, role=role)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_org_id(principal: CurrentPrincipal = Depends(get_current_principal)) -> str:
    return principal.org_id

def get_current_user(authorization: Optional[str] = Header(None)) -> CurrentPrincipal:
    """Like get_current_principal, but allows org_id to be None (for SuperAdmin)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        print(f"[Auth] Missing or invalid Authorization header: {authorization[:50] if authorization else 'None'}")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        sub = payload.get("sub")
        org_id = payload.get("org_id")  # may be None for SuperAdmin
        role = payload.get("role")
        print(f"[Auth] Decoded token: sub={sub}, org_id={org_id}, role={role}")
        if not sub:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return CurrentPrincipal(user_id=sub, org_id=org_id, role=role)
    except JWTError as e:
        print(f"[Auth] JWT decode error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_principal_ws(token: str) -> Optional[CurrentPrincipal]:
    """Validate WebSocket token"""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        sub = payload.get("sub")
        org_id = payload.get("org_id")
        role = payload.get("role")
        if not sub or not org_id:
            return None
        return CurrentPrincipal(user_id=sub, org_id=org_id, role=role)
    except JWTError:
        return None
