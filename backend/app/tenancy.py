from typing import Optional, Tuple
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from .models import Organization
from .db import get_db

RESERVED = {"admin", "api", "www"}


def parse_tenant_from_host(host: str) -> Tuple[str, Optional[str]]:
    """
    Returns (kind, value) where kind is 'slug' for subdomain or 'domain' for custom domain.
    If no tenant is found, returns ("none", None).
    """
    if not host:
        return ("none", None)
    host = host.split(":")[0].strip().lower()
    if host.endswith(".digitalchain.in"):
        sub = host.rsplit(".", 3)[0]  # get leading label(s) before digitalchain.in
        # only accept simple one-level subdomain like acme.digitalchain.in
        parts = host.split(".")
        if len(parts) >= 3:
            sub = parts[0]
            if sub and sub not in RESERVED:
                return ("slug", sub)
    # Otherwise treat entire host as potential custom domain
    return ("domain", host)


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Allow explicit X-Org header to override (from Nginx or client)
        x_org = request.headers.get("x-org")
        if x_org:
            request.state.tenant_lookup = ("slug", x_org.strip().lower())
        else:
            request.state.tenant_lookup = parse_tenant_from_host(request.headers.get("host", ""))
        return await call_next(request)


def resolve_tenant(request: Request, db: Session) -> Optional[Organization]:
    kind, value = getattr(request.state, "tenant_lookup", ("none", None))
    if not value:
        return None
    if kind == "slug":
        return db.query(Organization).filter(Organization.slug == value, Organization.status == "active").first()
    if kind == "domain":
        return db.query(Organization).filter(Organization.custom_domain == value, Organization.status == "active").first()
    return None
