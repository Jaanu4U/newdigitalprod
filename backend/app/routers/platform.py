from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, List
import re
import httpx
from pydantic import BaseModel

from ..db import get_db, Base, engine
from .. import models
from ..deps import get_current_user, CurrentPrincipal

router = APIRouter()

# ensure table
Base.metadata.create_all(bind=engine)


def _require_superadmin(principal: CurrentPrincipal):
    if (principal.role or '').lower() != 'superadmin':
        raise HTTPException(status_code=403, detail='SuperAdmin only')


def _get_row(db: Session) -> models.PlatformSettings:
    row = db.query(models.PlatformSettings).order_by(models.PlatformSettings.id.asc()).first()
    if not row:
        row = models.PlatformSettings(email_config={})
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get('/email-config', response_model=Dict[str, Any])
def get_email_config(principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_superadmin(principal)
    row = _get_row(db)
    cfg = row.email_config or {}
    # mask secrets
    def mask_mailgun(mg: Dict[str, Any]):
        if not isinstance(mg, dict):
            return mg
        out = dict(mg)
        if 'api_key' in out:
            out['api_key_present'] = bool(out.get('api_key'))
            out['api_key'] = None
        return out
    if cfg.get('provider') == 'mailgun':
        cfg['mailgun'] = mask_mailgun(cfg.get('mailgun') or {})
    return {'provider': cfg.get('provider'), 'mailgun': cfg.get('mailgun')}


class EmailConfigIn(BaseModel):
    provider: str | None = None
    mailgun: Dict[str, Any] | None = None


@router.put('/email-config', response_model=Dict[str, Any])
def update_email_config(payload: EmailConfigIn, principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_superadmin(principal)
    row = _get_row(db)
    provider = (payload.provider or row.email_config.get('provider') or '').lower()
    if provider not in {'mailgun',''}:
        raise HTTPException(status_code=400, detail='Unsupported provider')
    cfg = row.email_config or {}
    if provider == 'mailgun':
        mg_in = payload.mailgun or {}
        mg_old = cfg.get('mailgun') or {}
        domain = (mg_in.get('domain') or mg_old.get('domain') or '').strip().lower()
        from_email = (mg_in.get('from_email') or mg_old.get('from_email') or '').strip()
        api_key = mg_in.get('api_key') or mg_old.get('api_key')
        if not domain:
            raise HTTPException(status_code=400, detail='Mailgun domain required')
        if not re.fullmatch(r'^[a-z0-9.-]+\.[a-z]{2,}$', domain):
            raise HTTPException(status_code=400, detail='Invalid domain')
        if from_email and not re.fullmatch(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', from_email):
            raise HTTPException(status_code=400, detail='Invalid from_email')
        if not api_key:
            raise HTTPException(status_code=400, detail='API key required')
        cfg['provider'] = 'mailgun'
        cfg['mailgun'] = {'domain': domain, 'from_email': from_email, 'api_key': api_key}
    else:
        cfg['provider'] = ''
        cfg['mailgun'] = {}
    row.email_config = cfg
    db.commit()
    db.refresh(row)
    return {'status':'ok','provider': cfg.get('provider')}


@router.post('/email-config/test', response_model=Dict[str, Any])
def test_email(payload: Dict[str, Any], principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_superadmin(principal)
    to_addr = (payload.get('to') or '').strip()
    if not to_addr:
        raise HTTPException(status_code=400, detail='Recipient required')
    row = _get_row(db)
    cfg = row.email_config or {}
    if cfg.get('provider') != 'mailgun':
        raise HTTPException(status_code=400, detail='Mailgun provider not configured')
    mg = cfg.get('mailgun') or {}
    api_key = mg.get('api_key'); domain = mg.get('domain'); from_email = mg.get('from_email') or f'postmaster@{domain}'
    if not (api_key and domain):
        raise HTTPException(status_code=400, detail='Incomplete Mailgun config')
    url = f'https://api.mailgun.net/v3/{domain}/messages'
    data = {
        'from': from_email,
        'to': to_addr,
        'subject': 'Mailgun config test',
        'text': 'This is a test email confirming Mailgun configuration.'
    }
    try:
        r = httpx.post(url, data=data, auth=('api', api_key), timeout=15)
        if r.status_code >= 300:
            raise HTTPException(status_code=500, detail=f'Mailgun error {r.status_code}: {r.text[:200]}')
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to send test email: {e}')
    return {'status':'ok','sent_to': to_addr}


@router.get('/maps-config', response_model=Dict[str, Any])
def get_maps_config(principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_superadmin(principal)
    row = _get_row(db)
    cfg = row.email_config or {}  # Using email_config temporarily until we add maps_config column
    maps = cfg.get('maps_config') or {}
    
    # Mask API key, show last 4 digits if present
    out = dict(maps)
    api_key = out.get('google_api_key')
    out['google_api_key_present'] = bool(api_key)
    out['google_api_key'] = None
    out['google_api_key_last4'] = api_key[-4:] if api_key and len(api_key) >= 4 else None

    return {
        'enabled': out.get('enabled', False),
        'provider': out.get('provider', 'google'),
        'google_api_key': out.get('google_api_key'),
        'google_api_key_present': out.get('google_api_key_present', False),
        'google_api_key_last4': out.get('google_api_key_last4'),
    }


class MapsConfigIn(BaseModel):
    enabled: bool | None = None
    provider: str | None = None
    google_api_key: str | None = None


@router.put('/maps-config', response_model=Dict[str, Any])
def update_maps_config(payload: MapsConfigIn, principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_superadmin(principal)
    row = _get_row(db)
    cfg = row.email_config or {}
    maps = cfg.get('maps_config') or {}
    
    # Update enabled status
    if payload.enabled is not None:
        maps['enabled'] = payload.enabled
    
    # Update provider
    provider = (payload.provider or maps.get('provider') or 'google').lower()
    if provider != 'google':
        raise HTTPException(status_code=400, detail='Only Google Maps provider is supported')
    maps['provider'] = provider
    
    # Update API key if provided (don't clear it if empty string is sent)
    if payload.google_api_key:
        api_key = payload.google_api_key.strip()
        if not api_key.startswith('AIza'):
            raise HTTPException(status_code=400, detail='Invalid Google Maps API key format')
        maps['google_api_key'] = api_key
    
    # Validate that API key exists if enabled
    if maps.get('enabled') and not maps.get('google_api_key'):
        raise HTTPException(status_code=400, detail='Google Maps API key is required when maps are enabled')
    
    cfg['maps_config'] = maps
    row.email_config = cfg
    db.commit()
    db.refresh(row)
    
    return {
        'status': 'ok',
        'enabled': maps.get('enabled', False),
        'provider': maps.get('provider', 'google')
    }


@router.get('/organizations', response_model=List[Dict[str, Any]])
def get_organizations(principal: CurrentPrincipal = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all organizations with Maps API usage stats (SuperAdmin only)"""
    _require_superadmin(principal)
    
    # Get all organizations
    orgs = db.query(models.Organization).order_by(models.Organization.created_at.desc()).all()
    
    result = []
    for org in orgs:
        # Get user count
        user_count = db.query(func.count(models.User.user_id)).filter(
            models.User.org_id == org.org_id
        ).scalar() or 0
        
        result.append({
            'org_id': org.org_id,
            'name': org.name,
            'slug': org.slug,
            'custom_domain': org.custom_domain,
            'plan': org.plan,
            'status': org.status,
            'region': org.region,
            'timezone': org.timezone,
            'maps_api_usage_count': org.maps_api_usage_count or 0,
            'user_count': user_count,
            'created_at': org.created_at.isoformat() if org.created_at else None,
            'updated_at': org.updated_at.isoformat() if org.updated_at else None,
        })
    
    return result
