from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from ..db import get_db, Base, engine
from .. import models, schemas
from ..security import hash_password
import secrets
import re
from ..deps import get_current_principal, CurrentPrincipal
from ..tenancy import resolve_tenant
from datetime import datetime, timedelta, timezone
from ..utils.email import send_verification_email, send_welcome_email

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

def track_maps_usage(db: Session, org_id: str, endpoint: str, user_id: str = None):
    """Track Google Maps API usage for an organization and user"""
    try:
        # Update organization total count
        org = db.query(models.Organization).filter(models.Organization.org_id == org_id).first()
        if org:
            if org.maps_api_usage_count is None:
                org.maps_api_usage_count = 0
            org.maps_api_usage_count += 1
        
        # Check if usage entry exists for today
        today = datetime.utcnow().date()
        usage = db.query(models.MapsApiUsage).filter(
            models.MapsApiUsage.org_id == org_id,
            models.MapsApiUsage.user_id == user_id,
            models.MapsApiUsage.endpoint == endpoint,
            func.date(models.MapsApiUsage.created_at) == today
        ).first()
        
        if usage:
            usage.request_count += 1
            usage.updated_at = datetime.utcnow()
        else:
            usage = models.MapsApiUsage(
                org_id=org_id,
                user_id=user_id,
                endpoint=endpoint,
                request_count=1
            )
            db.add(usage)
        
        db.commit()
    except Exception as e:
        db.rollback()
        # Don't fail the main request if tracking fails
        print(f"Failed to track Maps usage: {e}")



@router.post("/register", response_model=schemas.OrgRegisterOut)
def register_org(payload: schemas.OrgRegisterIn, db: Session = Depends(get_db)):
    # Validate admin email uniqueness
    email_lower = payload.admin_email.lower().strip()
    existing_email = db.query(models.User).filter(models.User.email == email_lower).first()
    if existing_email:
        raise HTTPException(status_code=409, detail="Email address already registered")
    
    # Validate phone number format if provided (10 digits)
    if payload.admin_phone:
        phone = payload.admin_phone.strip()
        # Remove any spaces, dashes, or parentheses
        phone_digits = ''.join(c for c in phone if c.isdigit())
        if len(phone_digits) != 10:
            raise HTTPException(status_code=400, detail="Phone number must be 10 digits")
    
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
        address=payload.address,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        country=payload.country,
    )
    db.add(org)
    db.flush()

    # Create owner user with validated email and phone
    owner_password = payload.admin_password or "ChangeMe123!"
    
    # Generate email verification token
    verification_token = secrets.token_urlsafe(32)
    token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    
    user = models.User(
        org_id=org.org_id,
        email=email_lower,
        name=payload.admin_name,
        role="Owner",
        cellnumber=payload.admin_phone,
        password_hash=hash_password(owner_password),
        email_verified=False,
        verification_token=verification_token,
        token_expires_at=token_expires_at
    )
    db.add(user)
    db.commit()
    db.refresh(org)
    
    print(f"[Registration] User created with ID: {user.user_id}, email: {email_lower}")
    print(f"[Registration] Verification token generated (expires: {token_expires_at})")
    
    # Send verification email
    try:
        # Use organization's subdomain for verification link
        verification_link = f"https://{slug}.digitalchain.in/verify-email?token={verification_token}"
        print(f"[Registration] Attempting to send verification email to {email_lower}")
        print(f"[Registration] Verification link: {verification_link}")
        result = send_verification_email(db, email_lower, verification_link, payload.org_name)
        print(f"[Registration] Email send result: {result}")
    except Exception as e:
        print(f"[Registration] Failed to send verification email: {str(e)}")
        import traceback
        traceback.print_exc()
        # Don't fail registration if email fails - user can request resend

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


@router.get("/lookup", response_model=schemas.OrgLookupOut)
def lookup_org(
    slug: str | None = Query(default=None, description="Organization slug (e.g. acme)"),
    domain: str | None = Query(default=None, description="Custom domain (e.g. acme.com)"),
    access_key: str | None = Query(default=None, description="Access key value"),
    db: Session = Depends(get_db)
):
    slug_val = (slug or "").strip().lower() or None
    domain_val = (domain or "").strip().lower() or None
    access_val = (access_key or "").strip() or None

    if not any([slug_val, domain_val, access_val]):
        raise HTTPException(status_code=400, detail="Provide slug, domain, or access_key")

    query = db.query(models.Organization).filter(models.Organization.status == "active")
    if slug_val:
        query = query.filter(models.Organization.slug == slug_val)
    elif domain_val:
        query = query.filter(models.Organization.custom_domain == domain_val)
    else:
        query = query.filter(models.Organization.access_key == access_val)

    org = query.first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return schemas.OrgLookupOut(
        org_id=org.org_id,
        name=org.name,
        slug=org.slug,
        custom_domain=org.custom_domain,
        status=org.status
    )


@router.get("/lookup-by-email", response_model=schemas.OrgLookupOut)
def lookup_org_by_email(
    email: str = Query(..., description="User email address"),
    db: Session = Depends(get_db)
):
    email_lower = (email or "").strip().lower()
    if not email_lower:
        raise HTTPException(status_code=400, detail="Email is required")

    user = db.query(models.User).filter(func.lower(models.User.email) == email_lower).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    org = (
        db.query(models.Organization)
        .filter(models.Organization.org_id == user.org_id, models.Organization.status == "active")
        .first()
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found or inactive")

    return schemas.OrgLookupOut(
        org_id=org.org_id,
        name=org.name,
        slug=org.slug,
        custom_domain=org.custom_domain,
        status=org.status
    )


@router.get("/check-email")
def check_email_availability(email: str = Query(...), db: Session = Depends(get_db)):
    """Check if email is already registered as an admin/owner"""
    email_lower = email.lower().strip()
    
    # Check if email exists in users table
    existing_user = db.query(models.User).filter(models.User.email == email_lower).first()
    
    if existing_user:
        return {"available": False, "reason": "Email already registered"}
    
    return {"available": True}


@router.get("/verify-email")
def verify_email(token: str = Query(...), db: Session = Depends(get_db)):
    """Verify user email using verification token"""
    if not token:
        raise HTTPException(status_code=400, detail="Verification token is required")
    
    print(f"[Verify Email] Received token: {token[:10]}...")
    
    # Find user with this token
    user = db.query(models.User).filter(models.User.verification_token == token).first()
    
    if not user:
        print(f"[Verify Email] No user found with token: {token[:10]}...")
        
        # Check if this is a customer token (fallback for old links without type=customer)
        customer = db.query(models.Customer).filter(models.Customer.verification_token == token).first()
        if customer:
            print(f"[Verify Email] Found customer instead: {customer.email}. Redirecting to customer verification.")
            # Redirect to customer verification endpoint
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=f"/v1/customer-portal/verify-email?token={token}", status_code=307)
        
        raise HTTPException(status_code=404, detail="Invalid verification token. The link may have expired or already been used.")
    
    print(f"[Verify Email] Found user: {user.email}, verified: {user.email_verified}, expires: {user.token_expires_at}")
    
    # Check if token has expired
    if user.token_expires_at:
        # Make expiry time timezone-aware if it isn't already
        expiry_time = user.token_expires_at
        if expiry_time.tzinfo is None:
            expiry_time = expiry_time.replace(tzinfo=timezone.utc)
        if expiry_time < datetime.now(timezone.utc):
            print(f"[Verify Email] Token expired. Expiry: {expiry_time}, Now: {datetime.now(timezone.utc)}")
            raise HTTPException(status_code=400, detail="Verification token has expired. Please request a new verification email.")
    
    print(f"[Verify Email] Token is valid and not expired")
    
    # Check if already verified
    if user.email_verified:
        print(f"[Verify Email] Email already verified for user: {user.email}")
        org = db.query(models.Organization).filter(models.Organization.org_id == user.org_id).first()
        return {
            "status": "success", 
            "message": "Email already verified",
            "org_slug": org.slug if org else None
        }
    
    # Get organization details for welcome email
    org = db.query(models.Organization).filter(models.Organization.org_id == user.org_id).first()
    
    # Verify the email
    user.email_verified = True
    user.verification_token = None
    user.token_expires_at = None
    db.commit()
    
    print(f"[Verify Email] Successfully verified email for user: {user.email}")
    
    # Send welcome email with setup instructions
    if org:
        try:
            send_welcome_email(db, user.email, org.name, org.slug, user.name or "")
            print(f"[Verify Email] Welcome email sent to {user.email}")
        except Exception as e:
            print(f"[Verification] Failed to send welcome email: {str(e)}")
            # Don't fail verification if welcome email fails
    
    return {
        "status": "success", 
        "message": "Email verified successfully",
        "org_slug": org.slug if org else None
    }


@router.get("/resend-verification")
@router.post("/resend-verification")
def resend_verification_email(email: str = Query(None), db: Session = Depends(get_db)):
    """Resend verification email for unverified users"""
    if not email:
        raise HTTPException(status_code=400, detail="Email parameter is required")
    
    email_lower = email.lower().strip()
    
    print(f"[Resend Verification] Request for email: {email_lower}")
    
    # Find user by email
    user = db.query(models.User).filter(models.User.email == email_lower).first()
    
    if not user:
        print(f"[Resend Verification] User not found: {email_lower}")
        raise HTTPException(status_code=404, detail="User not found")
    
    print(f"[Resend Verification] Found user: {user.user_id}, verified: {user.email_verified}")
    print(f"[Resend Verification] Old token expires at: {user.token_expires_at}")
    
    # Check if already verified
    if user.email_verified:
        print(f"[Resend Verification] Email already verified for: {email_lower}")
        return {"status": "success", "message": "Email already verified"}
    
    # Get organization details
    org = db.query(models.Organization).filter(models.Organization.org_id == user.org_id).first()
    
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Generate new verification token
    verification_token = secrets.token_urlsafe(32)
    token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    
    print(f"[Resend Verification] Generated new token (expires: {token_expires_at})")
    
    # Update user with new token
    user.verification_token = verification_token
    user.token_expires_at = token_expires_at
    db.commit()
    
    print(f"[Resend Verification] Updated user token in database")
    
    # Send verification email
    try:
        # Use organization's subdomain for verification link
        verification_link = f"https://{org.slug}.digitalchain.in/verify-email?token={verification_token}"
        print(f"[Resend Verification] Sending email to {email_lower}")
        print(f"[Resend Verification] Link: {verification_link}")
        send_verification_email(db, email_lower, verification_link, org.name)
        print(f"[Resend Verification] Email sent successfully")
    except Exception as e:
        print(f"[Resend] Failed to send verification email: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to send verification email")
    
    return {"status": "success", "message": "Verification email sent"}


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
    business = s.get("business") or s.get("business_settings")
    providers = s.get("providers") or s.get("provider_settings")
    whatsapp = s.get("whatsapp") or s.get("whatsapp_settings")

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
        address=org.address,
        city=org.city,
        state=org.state,
        pincode=org.pincode,
        country=org.country,
        payment_settings=payment,
        email_settings=email,
        maps_settings=maps,
        business_settings=business,
        provider_settings=providers,
        whatsapp_settings=whatsapp,
    )


@router.get("/maps-api-key")
def get_maps_api_key(request: Request, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Get the unmasked Google Maps API key for frontend use (requires authentication) - Uses global platform settings"""
    # Get global platform settings
    platform_row = db.query(models.PlatformSettings).order_by(models.PlatformSettings.id.asc()).first()
    if not platform_row:
        # Return default fallback
        return {
            "google_api_key": "AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0",
            "enabled": True,
            "provider": "google"
        }
    
    cfg = platform_row.email_config or {}
    maps = cfg.get('maps_config') or {}
    
    # Return the unmasked API key from global settings
    return {
        "google_api_key": maps.get("google_api_key") or "AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0",
        "enabled": maps.get("enabled", True),
        "provider": maps.get("provider", "google")
    }


@router.get("/geocode")
def geocode_address(address: str = Query(..., description="Address to geocode"), request: Request = None, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Geocode an address to lat/lng coordinates using Google Maps API - Uses global platform settings"""
    import urllib.parse
    import urllib.request
    import json
    
    # Track usage with user_id
    if principal.org_id:
        track_maps_usage(db, principal.org_id, "geocode", principal.user_id)
    
    # Get global platform settings
    platform_row = db.query(models.PlatformSettings).order_by(models.PlatformSettings.id.asc()).first()
    if not platform_row:
        # Use fallback API key
        api_key = "AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0"
    else:
        cfg = platform_row.email_config or {}
        maps = cfg.get('maps_config') or {}
        api_key = maps.get("google_api_key") or "AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0"
    
    if not api_key:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")
    
    # Geocode the address
    try:
        encoded_address = urllib.parse.quote(address)
        url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded_address}&key={api_key}"
        
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            
        if data.get("status") == "OK" and len(data.get("results", [])) > 0:
            location = data["results"][0]["geometry"]["location"]
            return {
                "status": "ok",
                "latitude": location["lat"],
                "longitude": location["lng"],
                "formatted_address": data["results"][0].get("formatted_address")
            }
        else:
            return {
                "status": "error",
                "message": data.get("error_message") or f"Geocoding failed: {data.get('status')}"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Geocoding error: {str(e)}")


@router.get("/estimated-time")
def get_estimated_delivery_time(
    origin_lat: float = Query(..., description="Origin latitude"),
    origin_lng: float = Query(..., description="Origin longitude"),
    dest_lat: float = Query(..., description="Destination latitude"),
    dest_lng: float = Query(..., description="Destination longitude"),
    request: Request = None,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Calculate estimated delivery time using Google Maps Distance Matrix API"""
    import urllib.parse
    import urllib.request
    import json
    
    # Resolve current org
    org = None
    if principal.org_id:
        org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    if org is None and request:
        org = resolve_tenant(request, db)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Get maps settings
    s = org.settings or {}
    maps = s.get("maps") or s.get("maps_settings") or {}
    api_key = maps.get("google_api_key")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")
    
    # Call Distance Matrix API
    try:
        origins = f"{origin_lat},{origin_lng}"
        destinations = f"{dest_lat},{dest_lng}"
        url = f"https://maps.googleapis.com/maps/api/distancematrix/json?origins={origins}&destinations={destinations}&mode=driving&key={api_key}"
        
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
        
        if data.get("status") == "OK":
            rows = data.get("rows", [])
            if rows and len(rows) > 0:
                elements = rows[0].get("elements", [])
                if elements and len(elements) > 0:
                    element = elements[0]
                    if element.get("status") == "OK":
                        duration = element.get("duration", {})
                        distance = element.get("distance", {})
                        
                        # Duration is in seconds, convert to minutes
                        duration_minutes = duration.get("value", 0) // 60
                        distance_km = distance.get("value", 0) / 1000
                        
                        return {
                            "status": "ok",
                            "duration_minutes": duration_minutes,
                            "duration_text": duration.get("text", ""),
                            "distance_km": round(distance_km, 2),
                            "distance_text": distance.get("text", "")
                        }
        
        return {
            "status": "error",
            "message": data.get("error_message") or f"Distance calculation failed: {data.get('status')}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Distance calculation error: {str(e)}")


@router.get("/maps-usage")
def get_maps_usage(
    request: Request,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get Google Maps API usage statistics for the current organization"""
    if not principal.org_id:
        raise HTTPException(status_code=403, detail="Organization context required")
    
    org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Get usage breakdown by endpoint for last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    usage_by_endpoint = db.query(
        models.MapsApiUsage.endpoint,
        func.sum(models.MapsApiUsage.request_count).label('total_requests')
    ).filter(
        models.MapsApiUsage.org_id == principal.org_id,
        models.MapsApiUsage.created_at >= thirty_days_ago
    ).group_by(models.MapsApiUsage.endpoint).all()
    
    # Get usage breakdown by user role for last 30 days
    usage_by_role = db.query(
        models.User.role,
        func.sum(models.MapsApiUsage.request_count).label('total_requests')
    ).join(
        models.User, models.MapsApiUsage.user_id == models.User.user_id, isouter=True
    ).filter(
        models.MapsApiUsage.org_id == principal.org_id,
        models.MapsApiUsage.created_at >= thirty_days_ago
    ).group_by(models.User.role).all()
    
    # Get daily usage for last 7 days
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    daily_usage = db.query(
        func.date(models.MapsApiUsage.created_at).label('date'),
        func.sum(models.MapsApiUsage.request_count).label('total_requests')
    ).filter(
        models.MapsApiUsage.org_id == principal.org_id,
        models.MapsApiUsage.created_at >= seven_days_ago
    ).group_by(func.date(models.MapsApiUsage.created_at)).order_by(func.date(models.MapsApiUsage.created_at)).all()
    
    return {
        "total_usage": org.maps_api_usage_count or 0,
        "usage_by_endpoint": [
            {"endpoint": endpoint, "requests": int(count)}
            for endpoint, count in usage_by_endpoint
        ],
        "usage_by_role": [
            {"role": role or "Unknown", "requests": int(count)}
            for role, count in usage_by_role
        ],
        "daily_usage_last_7_days": [
            {"date": str(date), "requests": int(count)}
            for date, count in daily_usage
        ]
    }


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
    
    # Update address fields
    if payload.address is not None:
        org.address = payload.address
    if payload.city is not None:
        org.city = payload.city
    if payload.state is not None:
        org.state = payload.state
    if payload.pincode is not None:
        org.pincode = payload.pincode
    if payload.country is not None:
        org.country = payload.country

    # Merge section-wise settings into org.settings JSON
    s = org.settings or {}

    # Validate incoming sections (use effective settings to allow partial updates)
    incoming_payment = getattr(payload, "payment_settings", None)
    incoming_email = getattr(payload, "email_settings", None)
    incoming_maps = getattr(payload, "maps_settings", None)
    incoming_business = getattr(payload, "business_settings", None)
    incoming_providers = getattr(payload, "provider_settings", None)
    incoming_whatsapp = getattr(payload, "whatsapp_settings", None)

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
        print(f"[DEBUG] merge_section: key={key_aliases[0]}, incoming={incoming}, existing={existing}, merged={merged}")

    # Apply merges after validation passes
    merge_section(["payment" , "payment_settings"], incoming_payment)
    merge_section(["email"   , "email_settings"  ], incoming_email)
    merge_section(["maps"    , "maps_settings"   ], incoming_maps)
    merge_section(["business", "business_settings"], incoming_business)
    merge_section(["providers", "provider_settings"], incoming_providers)
    merge_section(["whatsapp", "whatsapp_settings"], incoming_whatsapp)

    # Transform payment settings to new gateway structure if needed
    if incoming_payment and "payment" in s:
        payment = s["payment"]
        # Check if we're using old flat structure (has public_key/secret_key at root)
        if payment.get("public_key") or payment.get("secret_key"):
            # Transform to new structure
            gateway_settings = {
                "provider": (payment.get("provider") or "razorpay").lower(),
                "enabled": True,
                "key_id": payment.get("public_key", ""),
                "key_secret": payment.get("secret_key", ""),
                "webhook_secret": payment.get("webhook_secret")
            }
            
            # Preserve UPI settings
            upi_settings = payment.get("upi", {})
            
            # Create new structure
            s["payment"] = {
                "enabled": payment.get("enabled", True),
                "upi": upi_settings,
                "gateway": gateway_settings
            }
            print(f"[DEBUG] Transformed payment settings to new gateway structure")
        # If already in new structure but webhook_secret was provided at root, move it
        elif payment.get("webhook_secret") and "gateway" in payment:
            if payment["gateway"].get("webhook_secret") != payment["webhook_secret"]:
                payment["gateway"]["webhook_secret"] = payment["webhook_secret"]
                print(f"[DEBUG] Updated webhook_secret in gateway structure")

    print(f"[DEBUG] Before commit - org.settings = {s}")
    org.settings = s
    flag_modified(org, "settings")  # Tell SQLAlchemy the JSON field changed
    print(f"[DEBUG] After assignment - org.settings = {org.settings}")

    db.commit()
    db.refresh(org)
    print(f"[DEBUG] After commit - org.settings = {org.settings}")
    return {"status": "ok"}
