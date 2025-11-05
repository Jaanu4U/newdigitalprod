from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from ..db import get_db, Base, engine
from .. import models, schemas
from ..security import hash_password
import secrets
import re
from ..deps import get_current_principal, CurrentPrincipal
from ..tenancy import resolve_tenant

router = APIRouter()

# Ensure tables exist (dev-friendly)
Base.metadata.create_all(bind=engine)

# Reserved subdomains used by the platform and infra
RESERVED_SLUGS = {"admin", "api", "www"}

def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")[:48] or "org"


@router.post("/register", response_model=schemas.OrgRegisterOut)
def register_org(payload: schemas.OrgRegisterIn, db: Session = Depends(get_db)):
    # Create org with access key
    access_key = secrets.token_urlsafe(24)
    # Determine slug (unique)
    base_slug = (payload.slug or _slugify(payload.org_name)).strip().lower()
    if base_slug in RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail="Subdomain is reserved. Please choose another.")
    slug = base_slug
    # ensure uniqueness
    i = 1
    while db.query(models.Organization).filter(models.Organization.slug == slug).first() is not None:
        i += 1
        slug = f"{base_slug}-{i}"
    # optional custom domain must be unique if provided
    if payload.custom_domain:
        existing = db.query(models.Organization).filter(models.Organization.custom_domain == payload.custom_domain.lower()).first()
        if existing:
            raise HTTPException(status_code=409, detail="Custom domain already in use")
    org = models.Organization(
        name=payload.org_name,
        slug=slug,
        custom_domain=(payload.custom_domain.lower() if payload.custom_domain else None),
        region=payload.region,
        plan=payload.plan,
        access_key=access_key,
    )
    db.add(org)
    db.flush()

    # Create owner user with temp password 'ChangeMe123!'
    owner_password = payload.admin_password or "ChangeMe123!"
    user = models.User(
        org_id=org.org_id,
        email=payload.admin_email,
        name=payload.admin_name,
        role="Owner",
        cellnumber=payload.admin_phone,
        password_hash=hash_password(owner_password)
    )
    db.add(user)
    db.commit()
    db.refresh(org)

    return schemas.OrgRegisterOut(org_id=org.org_id, access_key=org.access_key, slug=org.slug)


@router.get("/check")
def check_availability(slug: str | None = Query(default=None), domain: str | None = Query(default=None), db: Session = Depends(get_db)):
    out = {}
    if slug is not None:
        s = (slug or "").strip().lower()
        is_reserved = s in RESERVED_SLUGS
        exists = db.query(models.Organization).filter(models.Organization.slug == s).first() is not None
        # Valid if non-empty and not reserved
        out["slug"] = {
            "available": (not exists) and (not is_reserved),
            "valid": (s != "") and (not is_reserved),
            "reason": ("Reserved subdomain" if is_reserved else None)
        }
    if domain is not None:
        d = (domain or "").lower()
        # very light validation
        valid = re.fullmatch(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$", d) is not None
        if valid:
            exists = db.query(models.Organization).filter(models.Organization.custom_domain == d).first() is not None
            out["domain"] = {"available": not exists, "valid": True}
        else:
            out["domain"] = {"available": False, "valid": False, "reason": "Invalid domain format"}
    return out


@router.get("/settings", response_model=schemas.OrgSettingsOut)
def get_org_settings(request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    # Resolve current org either by principal.org_id or host
    org = None
    if principal.org_id:
        org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    if org is None:
        org = resolve_tenant(request, db)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    # Unpack section-wise settings from JSON
    s = org.settings or {}
    payment = s.get("payment") or s.get("payment_settings")
    email = s.get("email") or s.get("email_settings")
    maps = s.get("maps") or s.get("maps_settings")

    # Mask secrets in response and add *_present flags
    def mask_section(sec: dict | None, secret_keys: list[str]):
        if not isinstance(sec, dict):
            return sec
        out = dict(sec)
        for k in secret_keys:
            present = bool(out.get(k))
            out[f"{k}_present"] = present
            if k in out:
                out[k] = None
        return out

    payment = mask_section(payment, ["secret_key"])
    email = mask_section(email, ["smtp_password"])
    maps = mask_section(maps, ["google_api_key"])

    return schemas.OrgSettingsOut(
        org_id=org.org_id,
        name=org.name,
        slug=org.slug,
        custom_domain=org.custom_domain,
        region=org.region,
        timezone=org.timezone,
        plan=org.plan,
        status=org.status,
        created_at=org.created_at,
        updated_at=org.updated_at,
        payment_settings=payment,
        email_settings=email,
        maps_settings=maps,
    )


@router.put("/settings", response_model=dict)
def update_org_settings(
    payload: schemas.OrgSettingsUpdateIn,
    request: Request,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    # Only Admin/Owner/SuperAdmin can update org settings
    role_l = (principal.role or "").lower()
    if role_l not in {"admin", "owner", "superadmin"}:
        raise HTTPException(status_code=403, detail="Only Admin/Owner can update organization settings")

    org = None
    if principal.org_id:
        org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    if org is None:
        org = resolve_tenant(request, db)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Update allowed fields only (not slug)
    if payload.name is not None:
        org.name = payload.name
    if payload.region is not None:
        org.region = payload.region
    if payload.timezone is not None:
        org.timezone = payload.timezone
    if payload.plan is not None:
        org.plan = payload.plan

    # Merge section-wise settings into org.settings JSON
    s = org.settings or {}

    # Validate incoming sections (use effective settings to allow partial updates)
    incoming_payment = getattr(payload, "payment_settings", None)
    incoming_email = getattr(payload, "email_settings", None)
    incoming_maps = getattr(payload, "maps_settings", None)

    def to_int(val, default=None):
        try:
            return int(val)
        except Exception:
            return default

    def is_email(v: str) -> bool:
        return bool(re.fullmatch(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", (v or "")))

    eff_payment = {**(s.get("payment") or {}), **(incoming_payment or {})}
    eff_email = {**(s.get("email") or {}), **(incoming_email or {})}
    eff_maps = {**(s.get("maps") or {}), **(incoming_maps or {})}

    # Payment validation
    if eff_payment.get("enabled"):
        provider = (eff_payment.get("provider") or "").lower()
        if provider not in {"razorpay", "stripe", "cashfree"}:
            raise HTTPException(status_code=400, detail="Invalid payment provider")
        currency = eff_payment.get("currency") or ""
        if currency and not re.fullmatch(r"^[A-Z]{3}$", currency):
            raise HTTPException(status_code=400, detail="Invalid currency code; use 3-letter ISO like INR")
        if not eff_payment.get("public_key") or not (eff_payment.get("secret_key") or (s.get("payment") or {}).get("secret_key")):
            raise HTTPException(status_code=400, detail="Payment keys are required when payments are enabled")

    # Email validation
    if eff_email.get("enabled"):
        provider = (eff_email.get("provider") or "SMTP").upper()
        if provider not in {"SMTP", "SENDGRID"}:
            raise HTTPException(status_code=400, detail="Invalid email provider")
        if provider == "SMTP":
            host = eff_email.get("smtp_host") or ""
            port = to_int(eff_email.get("smtp_port"), None)
            user = eff_email.get("smtp_user") or ""
            pwd_present = bool((eff_email.get("smtp_password") or (s.get("email") or {}).get("smtp_password")))
            if not host:
                raise HTTPException(status_code=400, detail="SMTP host is required")
            if port is None or port < 1 or port > 65535:
                raise HTTPException(status_code=400, detail="SMTP port must be 1-65535")
            if not user:
                raise HTTPException(status_code=400, detail="SMTP user is required")
            if not pwd_present:
                raise HTTPException(status_code=400, detail="SMTP password is required")
        # Basic from_email validation if provided
        from_email = eff_email.get("from_email") or ""
        if from_email and not is_email(from_email):
            raise HTTPException(status_code=400, detail="Invalid from_email address")

    # Maps validation
    if eff_maps.get("enabled"):
        provider = (eff_maps.get("provider") or "google").lower()
        if provider != "google":
            raise HTTPException(status_code=400, detail="Only Google Maps provider is supported")
        if not (eff_maps.get("google_api_key") or (s.get("maps") or {}).get("google_api_key")):
            raise HTTPException(status_code=400, detail="Google Maps API key is required")

    def merge_section(key_aliases: list[str], incoming: dict | None):
        if incoming is None:
            return
        # Normalize to primary key name
        primary = key_aliases[0]
        existing = None
        for k in key_aliases:
            if k in s and isinstance(s[k], dict):
                existing = s.get(k)
                primary = k
                break
        if existing is None:
            existing = {}
        # Build merged map using only simple serializable keys, and ignore blank secrets (no-change)
        def clean(k: str, v):
            if v is None:
                return None
            if k in {"secret_key", "smtp_password", "google_api_key"} and (v == "" or v is False):
                return None
            return v
        patch = {}
        for k, v in incoming.items():
            cv = clean(k, v)
            if cv is not None:
                patch[k] = cv
        merged = {**existing, **patch}
        # Remove alias keys, store under canonical key
        for k in key_aliases:
            if k in s:
                s.pop(k, None)
        s[key_aliases[0]] = merged

    # Apply merges after validation passes
    merge_section(["payment" , "payment_settings"], incoming_payment)
    merge_section(["email"   , "email_settings"  ], incoming_email)
    merge_section(["maps"    , "maps_settings"   ], incoming_maps)

    org.settings = s

    db.commit()
    db.refresh(org)
    return {"status": "ok"}
