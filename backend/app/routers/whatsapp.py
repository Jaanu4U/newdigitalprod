from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import httpx
from typing import Optional
import os
import uuid
from datetime import datetime
from ..deps import get_current_user
from .. import models
from sqlalchemy.orm import Session
from ..db import get_db

router = APIRouter()

WHATSAPP_SERVICE_URL = "http://localhost:3001"

def get_google_maps_api_key(db: Session):
    """Get Google Maps API key from global platform settings"""
    platform_row = db.query(models.PlatformSettings).order_by(models.PlatformSettings.id.asc()).first()
    if not platform_row:
        return os.getenv("GOOGLE_MAPS_API_KEY", "AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0")
    cfg = platform_row.email_config or {}
    maps = cfg.get('maps_config') or {}
    return maps.get("google_api_key") or os.getenv("GOOGLE_MAPS_API_KEY", "AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0")

class InitSessionRequest(BaseModel):
    session_id: str

class SendMessageRequest(BaseModel):
    session_id: str
    to: str
    message: str

class GetLocationRequest(BaseModel):
    session_id: str
    phone_number: str
    invoice_id: Optional[str] = None  # Optional: to update invoice with coordinates

class LogoutRequest(BaseModel):
    session_id: str

@router.post("/v1/whatsapp/init")
async def init_session(req: InitSessionRequest, current_user = Depends(get_current_user)):
    """Initialize a WhatsApp session"""
    try:
        # Prefix session ID with org_id to make it organization-specific
        org_session_id = f"{current_user.org_id}_{req.session_id}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/whatsapp/init",
                json={"sessionId": org_session_id},
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"WhatsApp service error: {str(e)}")

@router.get("/v1/whatsapp/qr/{session_id}")
async def get_qr_code(session_id: str, current_user = Depends(get_current_user)):
    """Get QR code for a session"""
    try:
        # Use org-prefixed session ID if not already prefixed
        if not session_id.startswith(f"{current_user.org_id}_"):
            session_id = f"{current_user.org_id}_{session_id}"
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/whatsapp/qr/{session_id}",
                timeout=10.0
            )
            if response.status_code == 404:
                return response.json()
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"WhatsApp service error: {str(e)}")

@router.get("/v1/whatsapp/status/{session_id}")
async def get_status(session_id: str, current_user = Depends(get_current_user)):
    """Get status of a WhatsApp session"""
    try:
        # Use org-prefixed session ID if not already prefixed
        if not session_id.startswith(f"{current_user.org_id}_"):
            session_id = f"{current_user.org_id}_{session_id}"
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/whatsapp/status/{session_id}",
                timeout=10.0
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"WhatsApp service error: {str(e)}")

@router.post("/v1/whatsapp/send")
async def send_message(req: SendMessageRequest, current_user = Depends(get_current_user)):
    """Send a WhatsApp message"""
    try:
        # Use org-prefixed session ID if not already prefixed
        session_id = req.session_id
        if not session_id.startswith(f"{current_user.org_id}_"):
            session_id = f"{current_user.org_id}_{session_id}"
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/whatsapp/send",
                json={
                    "sessionId": session_id,
                    "to": req.to,
                    "message": req.message
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"WhatsApp service error: {str(e)}")

def _normalize_phone(number: Optional[str]) -> Optional[str]:
    if not number:
        return None
    digits = ''.join(ch for ch in number if ch.isdigit())
    if not digits:
        return None
    return digits[-10:] if len(digits) > 10 else digits


@router.post("/v1/whatsapp/get-location")
async def get_location(req: GetLocationRequest, current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get location from WhatsApp messages and convert to address"""
    print(f"[Backend] get-location request: session_id={req.session_id}, phone_number={req.phone_number}, invoice_id={req.invoice_id}")
    try:
        # Use org-prefixed session ID if not already prefixed
        session_id = req.session_id
        if not session_id.startswith(f"{current_user.org_id}_"):
            session_id = f"{current_user.org_id}_{session_id}"
        
        async with httpx.AsyncClient() as client:
            # Get location from WhatsApp service
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/whatsapp/get-location",
                json={
                    "sessionId": session_id,
                    "phoneNumber": req.phone_number
                },
                timeout=30.0
            )
            print(f"[Backend] WhatsApp service response: status={response.status_code}")
            if response.status_code == 404:
                return response.json()
            response.raise_for_status()
            location_data = response.json()
            
            # If location found, geocode it to get address
            if location_data.get("success"):
                latitude = location_data.get("latitude")
                longitude = location_data.get("longitude")
                
                # Call Google Maps Geocoding API
                geocode_response = await client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={
                        "latlng": f"{latitude},{longitude}",
                        "key": get_google_maps_api_key(db)
                    },
                    timeout=10.0
                )
                
                if geocode_response.status_code == 200:
                    geocode_data = geocode_response.json()
                    if geocode_data.get("status") == "OK" and geocode_data.get("results"):
                        address = geocode_data["results"][0]["formatted_address"]
                        location_data["address"] = address
                        print(f"[Backend] Geocoded address: {address}")
                    else:
                        print(f"[Backend] Geocoding failed: {geocode_data.get('status')}")
                        location_data["address"] = None
                else:
                    print(f"[Backend] Geocoding request failed: {geocode_response.status_code}")
                    location_data["address"] = None
                
                # If invoice_id provided, update the invoice draft with coordinates
                if req.invoice_id:
                    from sqlalchemy.orm import Session
                    from ..db import SessionLocal
                    from ..models import SyncLog, Customer
                    import json as _json
                    
                    db = SessionLocal()
                    try:
                        org_id = current_user.org_id
                        matched_draft_payload = None
                        drafts = db.query(SyncLog).filter(
                            SyncLog.org_id == org_id,
                            SyncLog.type == "invoice_draft"
                        ).order_by(SyncLog.created_at.desc()).limit(50).all()
                        
                        for draft in drafts:
                            draft_data = _json.loads(draft.payload or '{}')
                            if draft_data.get('invoice_id') == req.invoice_id:
                                draft_data['delivery_latitude'] = latitude
                                draft_data['delivery_longitude'] = longitude
                                draft_data['delivery_address'] = location_data.get("address")
                                matched_draft_payload = draft_data
                                draft.payload = _json.dumps(draft_data)
                                db.commit()
                                print(f"[Backend] Updated invoice {req.invoice_id} with coordinates: {latitude}, {longitude}")
                                break
                        
                        # Auto-update shipment address when WhatsApp phone matches customer phone
                        if matched_draft_payload:
                            customer_phone = matched_draft_payload.get('customer_phone') or matched_draft_payload.get('billing_phone')
                            if not customer_phone:
                                customer_id = matched_draft_payload.get('customer_id')
                                if customer_id:
                                    customer = db.query(Customer).filter(
                                        Customer.org_id == org_id,
                                        Customer.customer_id == customer_id
                                    ).first()
                                    if customer and customer.phone:
                                        customer_phone = customer.phone
                            normalized_invoice_phone = _normalize_phone(customer_phone)
                            normalized_req_phone = _normalize_phone(req.phone_number)
                            if normalized_invoice_phone and normalized_req_phone and normalized_invoice_phone == normalized_req_phone:
                                shipment_events = db.query(SyncLog).filter(
                                    SyncLog.org_id == org_id,
                                    SyncLog.type.in_(["invoice_shipment_assigned", "invoice_shipment_updated"])
                                ).order_by(SyncLog.created_at.desc()).all()
                                latest_shipment = None
                                for se in shipment_events:
                                    try:
                                        se_data = _json.loads(se.payload or '{}')
                                        if se_data.get('invoice_id') == req.invoice_id:
                                            latest_shipment = se_data
                                            break
                                    except Exception:
                                        continue
                                shipping_address = location_data.get("address") or f"Lat: {latitude}, Lng: {longitude}"
                                if not latest_shipment:
                                    latest_shipment = {
                                        'invoice_id': req.invoice_id,
                                        'provider_id': str(uuid.uuid4()),
                                        'provider_name': 'WhatsApp Location',
                                        'provider_code': 'WHATSAPP',
                                        'tracking_url': None,
                                        'tracking_number': None,
                                        'status': 'pending',
                                    }
                                shipment_payload = {
                                    'invoice_id': req.invoice_id,
                                    'provider_id': latest_shipment.get('provider_id'),
                                    'provider_name': latest_shipment.get('provider_name'),
                                    'provider_code': latest_shipment.get('provider_code'),
                                    'tracking_url': latest_shipment.get('tracking_url'),
                                    'tracking_number': latest_shipment.get('tracking_number'),
                                    'status': latest_shipment.get('status', 'pending'),
                                    'shipping_address': shipping_address,
                                    'updated_at': datetime.utcnow().isoformat() + 'Z',
                                    'updated_by': current_user.user_id,
                                }
                                db.add(SyncLog(
                                    org_id=org_id,
                                    user_id=current_user.user_id,
                                    type='invoice_shipment_updated',
                                    payload=_json.dumps(shipment_payload)
                                ))
                                db.commit()
                                print(f"[Backend] Auto-updated shipment address for invoice {req.invoice_id}")
                    finally:
                        db.close()
            
            return location_data
    except httpx.TimeoutException as e:
        print(f"[Backend] WhatsApp service timeout: {str(e)}")
        raise HTTPException(status_code=504, detail="WhatsApp service timeout. The request took too long. Please try again or check if the WhatsApp session is active.")
    except httpx.HTTPStatusError as e:
        print(f"[Backend] WhatsApp service HTTP error: {e.response.status_code} - {e.response.text}")
        error_detail = "WhatsApp service error"
        try:
            error_data = e.response.json()
            error_detail = error_data.get('error', error_data.get('detail', str(e)))
        except:
            error_detail = e.response.text or str(e)
        raise HTTPException(status_code=e.response.status_code, detail=error_detail)
    except httpx.HTTPError as e:
        print(f"[Backend] WhatsApp service error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"WhatsApp service error: {str(e)}")
    except Exception as e:
        print(f"[Backend] Unexpected error in get-location: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@router.post("/v1/whatsapp/logout")
async def logout_session(req: LogoutRequest, current_user = Depends(get_current_user)):
    """Logout a WhatsApp session"""
    try:
        # Use org-prefixed session ID if not already prefixed
        session_id = req.session_id
        if not session_id.startswith(f"{current_user.org_id}_"):
            session_id = f"{current_user.org_id}_{session_id}"
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/whatsapp/logout",
                json={"sessionId": session_id},
                timeout=30.0
            )
            # If the service reports client not found (404), return proper 404 to frontend
            if response.status_code == 404:
                raise HTTPException(
                    status_code=404, 
                    detail="WhatsApp session not found. It may have been already logged out or never initialized."
                )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"WhatsApp service error: {str(e)}")

@router.get("/v1/whatsapp/sessions")
async def list_sessions(current_user = Depends(get_current_user)):
    """List all WhatsApp sessions for current organization"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/whatsapp/sessions",
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            
            # Filter sessions to show:
            # 1. Sessions with org prefix (new style)
            # 2. Sessions without any org prefix (legacy/migration - show to all orgs for now)
            org_prefix = f"{current_user.org_id}_"
            all_sessions = data.get("sessions", [])
            
            filtered_sessions = []
            for s in all_sessions:
                session_id = s.get("sessionId", "")
                # Include if it has our org prefix OR if it doesn't have any org prefix (legacy)
                if session_id.startswith(org_prefix) or "_" not in session_id:
                    filtered_sessions.append(s)
            
            return {"sessions": filtered_sessions}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"WhatsApp service error: {str(e)}")


class LocationUpdateRequest(BaseModel):
    phone_number: str
    latitude: float
    longitude: float
    description: Optional[str] = None


@router.post("/v1/whatsapp/location-update")
async def whatsapp_location_update(req: LocationUpdateRequest, db: Session = Depends(get_db)):
    """
    Auto-update shipping address when customer sends location via WhatsApp.
    Called by WhatsApp service webhook when location message is received.
    """
    import json
    from datetime import timezone
    
    print(f"📍 [WhatsApp Location Update] Phone: {req.phone_number}, Lat: {req.latitude}, Lng: {req.longitude}")
    
    # Format phone number (remove country code if present)
    phone = req.phone_number.replace('+', '').replace(' ', '').replace('-', '')
    if phone.startswith('91') and len(phone) == 12:
        phone = phone[2:]  # Remove country code for matching
    
    # Find customer by phone number
    customer = db.query(models.Customer).filter(
        models.Customer.phone.like(f'%{phone}%')
    ).first()
    
    if not customer:
        print(f"❌ [WhatsApp Location] No customer found for phone: {req.phone_number}")
        return {"success": False, "error": "Customer not found"}
    
    print(f"✅ [WhatsApp Location] Found customer: {customer.name} (ID: {customer.customer_id})")
    
    # Get Google Maps API key
    api_key = get_google_maps_api_key(db)
    
    # Reverse geocode to get address
    address = None
    try:
        async with httpx.AsyncClient() as client:
            geocode_response = await client.get(
                f"https://maps.googleapis.com/maps/api/geocode/json",
                params={
                    "latlng": f"{req.latitude},{req.longitude}",
                    "key": api_key
                },
                timeout=10.0
            )
            geocode_data = geocode_response.json()
            
            if geocode_data.get("status") == "OK" and geocode_data.get("results"):
                address = geocode_data["results"][0]["formatted_address"]
                print(f"📍 [WhatsApp Location] Geocoded address: {address}")
    except Exception as e:
        print(f"⚠️ [WhatsApp Location] Geocoding failed: {e}")
        address = req.description or f"Location: {req.latitude}, {req.longitude}"
    
    # Find pending orders for this customer
    pending_orders = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == customer.org_id,
        models.SyncLog.type.in_(['invoice', 'invoice_draft'])
    ).order_by(models.SyncLog.created_at.desc()).limit(20).all()
    
    updated_count = 0
    for order_log in pending_orders:
        try:
            order_data = json.loads(order_log.payload) if isinstance(order_log.payload, str) else order_log.payload
            
            # Skip if not this customer's order or already delivered
            if order_data.get('customer_id') != customer.customer_id:
                continue
            if order_data.get('status') in ['delivered', 'completed', 'cancelled']:
                continue
            
            invoice_id = order_data.get('invoice_id')
            if not invoice_id:
                continue
            
            # Update shipment with new address and coordinates
            shipment_log = models.SyncLog(
                org_id=customer.org_id,
                user_id=customer.customer_id,
                type='invoice_shipment_updated',
                payload=json.dumps({
                    'invoice_id': invoice_id,
                    'shipping_address': address,
                    'latitude': req.latitude,
                    'longitude': req.longitude,
                    'updated_via': 'whatsapp_location',
                    'updated_at': datetime.now(timezone.utc).isoformat() + 'Z'
                }),
                created_at=datetime.now(timezone.utc)
            )
            db.add(shipment_log)
            updated_count += 1
            
            print(f"✅ [WhatsApp Location] Updated order {order_data.get('invoice_no')} with new address")
        except Exception as e:
            print(f"⚠️ [WhatsApp Location] Error updating order: {e}")
            continue
            
    db.commit()
    
    return {
        "success": True,
        "customer_name": customer.name,
        "address": address,
        "orders_updated": updated_count,
        "latitude": req.latitude,
        "longitude": req.longitude
    }

