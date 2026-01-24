from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..deps import get_current_principal, CurrentPrincipal
from ..utils.email import send_generic_email
from ..utils.email_templates import get_order_completed_email, format_items_html, get_order_accepted_customer_email
from ..route_optimizer import optimize_delivery_route, DeliveryPoint, calculate_route_stats
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
import json
import os
import uuid
import logging
import urllib.parse
import urllib.request

router = APIRouter()
logger = logging.getLogger(__name__)


def resolve_invoice_id(invoice_identifier: str, org_id: str, db: Session) -> str:
    """
    Convert invoice number (INV formats) to invoice UUID when required.
    """
    normalized = (invoice_identifier or '').strip()

    # If a delivery_id is passed (new rider app), map it back to order_id/invoice_id
    try:
        delivery = db.query(models.Delivery).filter(
            models.Delivery.delivery_id == normalized,
            models.Delivery.org_id == org_id
        ).first()
        if delivery and delivery.order_id:
            logger.info(f"Resolved delivery_id {normalized} to invoice_id {delivery.order_id}")
            return delivery.order_id
    except Exception as e:
        logger.warning(f"Failed delivery_id lookup for {normalized}: {e}")

    # Treat valid UUIDs as already resolved ids
    try:
        uuid.UUID(normalized)
        return normalized
    except (ValueError, AttributeError):
        pass

    # Look up the UUID from invoice_no (supports INV001, INV-001, etc.)
    drafts = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org_id,
        models.SyncLog.type == 'invoice_draft'
    ).all()

    for draft in drafts:
        try:
            data = json.loads(draft.payload or '{}')
            draft_invoice_no = (data.get('invoice_no') or '').strip()
            if draft_invoice_no and draft_invoice_no.casefold() == normalized.casefold():
                invoice_id = data.get('invoice_id')
                if invoice_id:
                    logger.info(f"Resolved invoice_no {normalized} to invoice_id {invoice_id}")
                    return invoice_id
        except Exception as e:
            logger.warning(f"Failed invoice_no lookup in draft {draft.id if hasattr(draft, 'id') else 'unknown'}: {e}")
            continue

    # If not found, return as-is (will likely fail validation later)
    logger.warning(f"Could not resolve invoice identifier {normalized} to UUID")
    return normalized


@router.get("/rider/assigned-orders", response_model=Dict[str, Any])
def get_assigned_orders(principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Get all orders assigned to the current rider"""
    import logging
    logger = logging.getLogger("uvicorn")
    
    logger.info(f"📱 [RIDER API] User: {principal.user_id}, Role: {principal.role}, OrgID: {principal.org_id}")
    
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can access this endpoint')
    
    # Find all rider assignments for this user
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    orders = []
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            if data.get('rider_id') == principal.user_id:
                # Check if delivered
                delivery_logs = db.query(models.SyncLog).filter(
                    models.SyncLog.org_id == principal.org_id,
                    models.SyncLog.type == 'delivery_completed'
                ).all()
                
                is_delivered = False
                delivered_at = None
                for dlog in delivery_logs:
                    try:
                        ddata = json.loads(dlog.payload or '{}')
                        if ddata.get('invoice_id') == data.get('invoice_id'):
                            is_delivered = True
                            delivered_at = dlog.created_at.isoformat() + 'Z'
                            break
                    except:
                        pass
                
                # Get customer details
                customer_id = data.get('customer_id')
                customer = None
                if customer_id:
                    customer = db.query(models.Customer).filter(
                        models.Customer.customer_id == customer_id,
                        models.Customer.org_id == principal.org_id
                    ).first()
                
                # Get invoice details from drafts
                invoice_data = {}
                invoice_id_from_assignment = data.get('invoice_id')
                drafts = db.query(models.SyncLog).filter(
                    models.SyncLog.org_id == principal.org_id,
                    models.SyncLog.type == 'invoice_draft'
                ).all()
                
                for draft in drafts:
                    try:
                        ddata = json.loads(draft.payload or '{}')
                        # Match by invoice_id if available, otherwise by customer_id
                        if invoice_id_from_assignment:
                            if ddata.get('invoice_id') == invoice_id_from_assignment:
                                invoice_data = ddata
                                break
                        elif customer_id and ddata.get('customer_id') == customer_id:
                            # If no invoice_id in assignment, find draft by customer_id
                            # This handles older assignment format
                            if not invoice_data or ddata.get('saved_at', '') > invoice_data.get('saved_at', ''):
                                invoice_data = ddata  # Get most recent draft for this customer
                    except:
                        pass
                
                # Skip if no invoice data found (invoice was deleted)
                if not invoice_data:
                    logger.info(f"Skipping assignment for invoice_id {invoice_id_from_assignment} - no draft found (deleted)")
                    continue
                    
                # Use invoice_id from draft if not in assignment
                actual_invoice_id = invoice_id_from_assignment or invoice_data.get('invoice_id') or "UNKNOWN_ID"
                
                # Get customer info - prioritize company_name for B2B customers
                if customer:
                    logger.info(f"[RIDER] Found customer: name={repr(customer.name)}, company={repr(customer.company_name)}, ctype={repr(customer.ctype)}")
                    
                    # For B2B customers or when name is empty, use company_name
                    # Prefer company_name for any customer if name is empty/None
                    if customer.company_name and (not customer.name or (customer.ctype and customer.ctype.upper() == 'B2B')):
                        customer_name = customer.company_name
                        logger.info(f"[RIDER] Using company_name: {repr(customer_name)}")
                    elif customer.name:
                        customer_name = customer.name
                        logger.info(f"[RIDER] Using name: {repr(customer_name)}")
                    elif customer.company_name:
                        customer_name = customer.company_name
                        logger.info(f"[RIDER] Using company_name fallback: {repr(customer_name)}")
                    else:
                        customer_name = "Unknown Customer"
                        logger.info(f"[RIDER] No name found, using Unknown")
                    customer_address = customer.address or "No Address"
                    customer_phone = customer.phone or ""
                else:
                    logger.info(f"[RIDER] Customer not found, using invoice data")
                    # Fallback to invoice data
                    # Check if it's B2B and has company name in invoice data
                    customer_company_name = invoice_data.get('customer_company_name')
                    customer_name_from_invoice = invoice_data.get('customer_name')
                    
                    if customer_company_name:
                        customer_name = customer_company_name
                    else:
                        customer_name = customer_name_from_invoice or "Unknown Customer"
                    
                    customer_address = invoice_data.get('customer_address') or "No Address"
                    customer_phone = invoice_data.get('customer_phone') or ""
                
                # Ensure no None values slip through
                if customer_name is None:
                    customer_name = "Unknown Customer"
                if customer_address is None:
                    customer_address = "No Address"
                if customer_phone is None:
                    customer_phone = ""

                # Get delivery location coordinates if available
                delivery_latitude = invoice_data.get('delivery_latitude')
                delivery_longitude = invoice_data.get('delivery_longitude')
                delivery_address = invoice_data.get('delivery_address')
                
                # Get shipping address from shipment if available (most recent update)
                shipping_address = None
                shipping_latitude = None
                shipping_longitude = None
                
                shipment_logs = db.query(models.SyncLog).filter(
                    models.SyncLog.org_id == principal.org_id,
                    models.SyncLog.type.in_(['invoice_shipment_assigned', 'invoice_shipment_updated'])
                ).order_by(models.SyncLog.created_at.desc()).all()
                
                for slog in shipment_logs:
                    try:
                        sdata = json.loads(slog.payload or '{}')
                        if sdata.get('invoice_id') == actual_invoice_id:
                            shipping_address = sdata.get('shipping_address')
                            shipping_latitude = sdata.get('latitude')
                            shipping_longitude = sdata.get('longitude')
                            if shipping_address:
                                break
                    except:
                        pass
                
                # Determine the actual delivery address and coordinates for rider
                # Priority: shipping_address (from updates) > delivery_address > customer_address (billing)
                final_delivery_address = shipping_address or delivery_address or customer_address
                final_delivery_lat = shipping_latitude or delivery_latitude
                final_delivery_lng = shipping_longitude or delivery_longitude

                # Fallback: geocode final address if coordinates are missing
                if (final_delivery_lat is None or final_delivery_lng is None) and final_delivery_address:
                    try:
                        platform_row = db.query(models.PlatformSettings).order_by(models.PlatformSettings.id.asc()).first()
                        cfg = platform_row.email_config or {} if platform_row else {}
                        maps_cfg = cfg.get('maps_config') or {}
                        api_key = maps_cfg.get("google_api_key") or "AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0"
                        encoded_address = urllib.parse.quote(final_delivery_address)
                        url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded_address}&key={api_key}"
                        with urllib.request.urlopen(url) as response:
                            data = json.loads(response.read().decode())
                        if data.get("status") == "OK" and data.get("results"):
                            loc = data["results"][0]["geometry"]["location"]
                            final_delivery_lat = final_delivery_lat or loc.get("lat")
                            final_delivery_lng = final_delivery_lng or loc.get("lng")
                    except Exception as geo_err:
                        logger.warning(f"[RIDER] Geocode fallback failed: {geo_err}")
                
                # Fetch delivery record once for status + route info
                delivery_status = ''
                delivery_record = db.query(models.Delivery).filter(
                    models.Delivery.org_id == principal.org_id,
                    models.Delivery.order_id == actual_invoice_id
                ).first()

                if delivery_record:
                    delivery_status = (delivery_record.rider_status or delivery_record.status or '').lower()
                    if delivery_status in ('delivered', 'completed'):
                        is_delivered = True
                        if not delivered_at:
                            completed_ts = delivery_record.completed_at or delivery_record.delivered_at
                            if completed_ts:
                                if completed_ts.tzinfo is None:
                                    delivered_at = completed_ts.replace(tzinfo=timezone.utc).isoformat()
                                else:
                                    delivered_at = completed_ts.astimezone(timezone.utc).isoformat()

                # Determine rider status based on sync_log entries
                rider_status = 'assigned'
                if is_delivered:
                    rider_status = 'completed' if delivery_status == 'completed' else 'delivered'
                else:
                    # Check for other statuses
                    status_logs = db.query(models.SyncLog).filter(
                        models.SyncLog.org_id == principal.org_id
                    ).all()
                    
                    for log in status_logs:
                        try:
                            log_data = json.loads(log.payload or '{}')
                            if log_data.get('invoice_id') == actual_invoice_id and log_data.get('rider_user_id') == principal.user_id:
                                if log.type == 'rider_delivery_started':
                                    rider_status = 'in_transit'
                                    break
                                elif log.type == 'rider_order_accepted':
                                    rider_status = 'accepted'
                        except:
                            continue
                
                # Final safety check - ensure no None values
                customer_name = customer_name if customer_name is not None else "Unknown Customer"
                customer_address = customer_address if customer_address is not None else "No Address"
                customer_phone = customer_phone if customer_phone is not None else ""
                
                order_status = 'delivered' if is_delivered else 'pending'
                if is_delivered and delivery_status == 'completed':
                    order_status = 'completed'

                order_data = {
                    'invoice_id': actual_invoice_id,
                    'invoice_no': invoice_data.get('invoice_no', actual_invoice_id) or "UNKNOWN_NO",
                    'customer_id': customer_id,
                    'customer_name': customer_name,
                    'customer_address': customer_address,  # Billing address (for reference)
                    'customer_phone': customer_phone,
                    'delivery_latitude': final_delivery_lat,  # Use final coordinates
                    'delivery_longitude': final_delivery_lng,  # Use final coordinates
                    'delivery_address': final_delivery_address,  # Use final address (shipping if available, else billing)
                    'shipping_address': shipping_address,  # Actual shipping address if set
                    'amount': invoice_data.get('amount') or invoice_data.get('totals', {}).get('total', 0),
                    'totals': invoice_data.get('totals', {}),
                    'assigned_at': data.get('assigned_at') or assignment.created_at.isoformat() + 'Z',
                    'status': order_status,
                    'delivered_at': delivered_at,
                    'rider_status': rider_status
                }

                # Hide completed orders from rider dashboard
                if order_data['rider_status'] in ('delivered', 'completed') or is_delivered:
                    logger.info(f"[RIDER] Skipping delivered order {order_data['invoice_no']}")
                    continue
                
                # Log shows what rider will see
                logger.info(f"📦 [RIDER ORDER] Invoice: {order_data['invoice_no']}, Customer: {customer_name}, Address: {final_delivery_address} {'(Shipping)' if shipping_address else '(Billing)'}")
                logger.info(f"   📍 delivery_address={order_data['delivery_address']}, shipping_address={order_data['shipping_address']}, customer_address={order_data['customer_address']}")
                
                # Get route_sequence from Delivery table if available
                if delivery_record and delivery_record.route_sequence is not None:
                    order_data['route_sequence'] = delivery_record.route_sequence
                else:
                    order_data['route_sequence'] = None
                
                orders.append(order_data)
        except Exception as e:
            logger.error(f"Error processing assignment: {e}")
            continue
    
    # Sort orders by route_sequence (optimized route first, then unoptimized)
    # Orders with route_sequence come first in order, then others
    orders_with_sequence = [o for o in orders if o.get('route_sequence') is not None]
    orders_without_sequence = [o for o in orders if o.get('route_sequence') is None]
    
    orders_with_sequence.sort(key=lambda x: x['route_sequence'])
    sorted_orders = orders_with_sequence + orders_without_sequence
    
    logger.info(f"📊 [RIDER API] Returning {len(sorted_orders)} orders to rider {principal.user_id}")
    logger.info(f"   {len(orders_with_sequence)} with optimized route, {len(orders_without_sequence)} without route")
    response = {'orders': sorted_orders, 'count': len(sorted_orders)}
    # Log the actual JSON response for debugging
    logger.info(f"🔍 [RIDER API RESPONSE] {json.dumps(response, indent=2)}")
    return response


@router.get("/rider/orders/{invoice_id}", response_model=Dict[str, Any])
def get_order_detail(invoice_id: str, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Get details of a specific order"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can access this endpoint')
    
    # Verify this order is assigned to this rider
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    assigned_to_me = False
    customer_id = None
    matched_invoice_uuid = None
    
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            # Match by UUID or check if invoice_id matches the invoice_no we're looking for
            if data.get('invoice_id') == invoice_id and data.get('rider_user_id') == principal.user_id:
                assigned_to_me = True
                customer_id = data.get('customer_id')
                matched_invoice_uuid = data.get('invoice_id')
                break
        except:
            continue
    
    # If not matched by UUID, try to find invoice by invoice_no
    if not assigned_to_me:
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        
        for draft in drafts:
            try:
                ddata = json.loads(draft.payload or '{}')
                if ddata.get('invoice_no') == invoice_id:
                    # Found invoice by invoice_no, now check if assigned
                    found_invoice_uuid = ddata.get('invoice_id')
                    for assignment in assignments:
                        try:
                            adata = json.loads(assignment.payload or '{}')
                            if adata.get('invoice_id') == found_invoice_uuid and adata.get('rider_user_id') == principal.user_id:
                                assigned_to_me = True
                                customer_id = adata.get('customer_id')
                                matched_invoice_uuid = found_invoice_uuid
                                invoice_id = found_invoice_uuid  # Use UUID for rest of function
                                break
                        except:
                            continue
                    if assigned_to_me:
                        break
            except:
                continue
    
    if not assigned_to_me:
        raise HTTPException(status_code=404, detail='Order not found or not assigned to you')
    
    # Get invoice details
    drafts = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_draft'
    ).all()
    
    invoice_data = {}
    for draft in drafts:
        try:
            ddata = json.loads(draft.payload or '{}')
            if ddata.get('invoice_id') == invoice_id:
                invoice_data = ddata
                break
        except:
            continue
    
    if not invoice_data:
        raise HTTPException(status_code=404, detail='Invoice details not found')
    
    # Get customer details from Customer table or invoice_data
    customer = None
    if customer_id:
        customer = db.query(models.Customer).filter(
            models.Customer.customer_id == customer_id,
            models.Customer.org_id == principal.org_id
        ).first()
    
    # Get customer info - prioritize company_name for B2B customers
    if customer:
        # For B2B customers, use company_name if available, otherwise use name
        if customer.ctype and customer.ctype.upper() == 'B2B' and customer.company_name:
            customer_name = customer.company_name
        else:
            customer_name = customer.name or customer.company_name or "Unknown Customer"
        customer_address = customer.address or "No Address"
        customer_phone = customer.phone or ""
    else:
        # Fallback to invoice data
        # Check if it's B2B and has company name in invoice data
        customer_company_name = invoice_data.get('customer_company_name')
        customer_name_from_invoice = invoice_data.get('customer_name')
        
        if customer_company_name:
            customer_name = customer_company_name
        else:
            customer_name = customer_name_from_invoice or "Unknown Customer"
        
        customer_address = invoice_data.get('customer_address') or "No Address"
        customer_phone = invoice_data.get('customer_phone') or ""
    
    # Get delivery location coordinates if available
    delivery_latitude = invoice_data.get('delivery_latitude')
    delivery_longitude = invoice_data.get('delivery_longitude')
    delivery_address = invoice_data.get('delivery_address')
    
    # Determine rider status based on sync_log entries
    rider_status = 'assigned'
    accepted_at = None
    started_at = None
    estimated_minutes = None
    
    status_logs = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id
    ).all()
    
    for log in status_logs:
        try:
            data = json.loads(log.payload or '{}')
            if data.get('invoice_id') == invoice_id and data.get('rider_user_id') == principal.user_id:
                if log.type == 'delivery_completed':
                    rider_status = 'delivered'
                    break
                elif log.type == 'rider_delivery_started':
                    rider_status = 'in_transit'
                    started_at = data.get('started_at')
                elif log.type == 'rider_order_accepted':
                    rider_status = 'accepted'
                    accepted_at = data.get('accepted_at')
                    estimated_minutes = data.get('estimated_minutes')
        except:
            continue
    
    # Also check deliveries table for estimated_minutes
    delivery_record = db.query(models.Delivery).filter(
        models.Delivery.order_id == invoice_id,
        models.Delivery.org_id == principal.org_id
    ).first()
    if delivery_record and not estimated_minutes:
        estimated_minutes = delivery_record.estimated_delivery_minutes
    
    return {
        'invoice_id': invoice_id,
        'invoice_no': invoice_data.get('invoice_no', invoice_id),
        'customer_name': customer_name,
        'customer_address': customer_address,
        'customer_phone': customer_phone,
        'delivery_latitude': delivery_latitude,
        'delivery_longitude': delivery_longitude,
        'delivery_address': delivery_address,
        'amount': invoice_data.get('amount', 0),
        'items': invoice_data.get('items', []),
        'totals': invoice_data.get('totals', {}),
        'status': 'pending',
        'rider_status': rider_status,
        'estimated_delivery_minutes': estimated_minutes,
        'accepted_at': accepted_at,
        'started_at': started_at
    }


class AcceptOrderIn(BaseModel):
    invoice_id: str
    estimated_minutes: Optional[int] = None  # Estimated delivery time in minutes


class RejectOrderIn(BaseModel):
    invoice_id: str


class StartDeliveryIn(BaseModel):
    invoice_id: str
    location: Dict[str, float]  # {lat, lng}


class UpdateLocationIn(BaseModel):
    invoice_id: str
    location: Dict[str, float]  # {lat, lng}
    timestamp: str


class SyncLocationsIn(BaseModel):
    invoice_id: str
    locations: List[Dict[str, Any]]  # [{lat, lng, timestamp}, ...]


class RiderIdleNotificationIn(BaseModel):
    invoice_id: str
    latitude: float
    longitude: float
    idle_duration_minutes: int


class CompleteDeliveryIn(BaseModel):
    invoice_id: str
    location: Dict[str, float]  # {lat, lng}
    payment: Dict[str, Any]  # {method, upi_id?, card_last4?, cash_amount?}


class CancelDeliveryIn(BaseModel):
    invoice_id: str
    reason: str


@router.post("/rider/accept-order", response_model=Dict[str, Any])
async def accept_order(payload: AcceptOrderIn, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Accept a delivery order"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can accept orders')
    
    # Convert invoice_no to invoice_id (UUID) if needed
    invoice_id = resolve_invoice_id(payload.invoice_id, principal.org_id, db)
    logger.info(f"Accept order: invoice_id={invoice_id}, user={principal.user_id}")
    
    # Get rider info
    rider = db.query(models.User).filter(
        models.User.user_id == principal.user_id,
        models.User.org_id == principal.org_id
    ).first()
    rider_name = rider.name if rider else 'Rider'
    
    # Verify this order is assigned to this rider
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    assigned_to_me = False
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            if data.get('invoice_id') == invoice_id and (
                data.get('rider_user_id') == principal.user_id or data.get('rider_id') == principal.user_id
            ):
                assigned_to_me = True
                break
        except:
            continue
    
    if not assigned_to_me:
        logger.warning(f"Order {invoice_id} not assigned to rider {principal.user_id}")
        raise HTTPException(status_code=403, detail='This order is not assigned to you')
    
    # Update deliveries table
    delivery = db.query(models.Delivery).filter(
        models.Delivery.order_id == invoice_id,
        models.Delivery.org_id == principal.org_id
    ).first()
    logger.info(f"Accept order: delivery_found={delivery is not None}")
    if delivery:
        logger.info(f"Updating delivery {delivery.delivery_id} rider_status: {delivery.rider_status} -> accepted")
        delivery.rider_status = 'accepted'
        delivery.accepted_at = datetime.utcnow()
        if payload.estimated_minutes:
            delivery.estimated_delivery_minutes = payload.estimated_minutes
        db.add(delivery)
    else:
        logger.warning(f"Delivery not found for invoice_id={invoice_id}, org_id={principal.org_id}")
    
    # Log acceptance
    acceptance_data = {
        'invoice_id': invoice_id,
        'rider_user_id': principal.user_id,
        'accepted_at': datetime.utcnow().isoformat() + 'Z',
        'estimated_minutes': payload.estimated_minutes
    }
    
    log_entry = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='rider_order_accepted',
        payload=json.dumps(acceptance_data)
    )
    db.add(log_entry)
    db.commit()
    
    # Get invoice_no for notification
    invoice_no = payload.invoice_id  # This might be invoice_no already
    invoice_data = None
    try:
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        for draft in drafts:
            draft_data = json.loads(draft.payload or '{}')
            if draft_data.get('invoice_id') == invoice_id:
                invoice_no = draft_data.get('invoice_no', invoice_no)
                invoice_data = draft_data
                break
    except Exception as e:
        logger.warning(f"Failed to get invoice data: {e}")

    # Send customer notification email
    org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    settings = (org.settings or {}) if org else {}
    comm_settings = settings.get('communication') or settings.get('communication_settings') or {}
    
    if comm_settings.get('card_receipt_enabled') and invoice_data:
        customer_email = invoice_data.get('customer_email')
        customer_name = invoice_data.get('customer_name') or invoice_data.get('customer_company_name') or 'Customer'
        
        if customer_email:
            try:
                org_name = org.name if org else 'DigitalChain'
                org_slug = org.slug if org and hasattr(org, 'slug') else 'demo'
                
                # Generate tracking and login URLs
                tracking_url = f"https://{org_slug}.digitalchain.in/customer/dashboard"
                login_url = f"https://{org_slug}.digitalchain.in/customer-login"
                
                email_data = get_order_accepted_customer_email(
                    org_name=org_name,
                    invoice_no=invoice_no,
                    customer_name=customer_name,
                    rider_name=rider_name,
                    rider_phone=rider.phone if rider and hasattr(rider, 'phone') else 'Contact support',
                    estimated_minutes=payload.estimated_minutes or 30,
                    tracking_url=tracking_url,
                    login_url=login_url
                )
                
                logger.info(f"📧 Sending order accepted email to customer {customer_email}")
                send_generic_email(
                    db,
                    to_email=customer_email,
                    subject=email_data['subject'],
                    html_body=email_data['html'],
                    from_name=org_name
                )
                logger.info(f"📧 Customer notification email sent")
            except Exception as e:
                logger.error(f"📧 Failed to send customer notification: {e}")

    # Send WebSocket notification
    from ..websocket import manager
    await manager.notify_order_status_change(principal.org_id, invoice_id, invoice_no, 'accepted', rider_name)
    
    return {'status': 'ok', 'invoice_id': invoice_id, 'rider_status': 'accepted'}


@router.post("/rider/cancel-delivery", response_model=Dict[str, Any])
async def cancel_delivery(payload: CancelDeliveryIn, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Cancel a delivery with reason provided by rider"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can cancel deliveries')

    reason = (payload.reason or '').strip()
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail='Cancellation reason must be at least 3 characters')

    # Resolve invoice ID to UUID if needed
    invoice_id = resolve_invoice_id(payload.invoice_id, principal.org_id, db)

    # Verify assignment to rider
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()

    assigned_to_me = False
    invoice_no = payload.invoice_id
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            if data.get('invoice_id') == invoice_id and (
                data.get('rider_user_id') == principal.user_id or data.get('rider_id') == principal.user_id
            ):
                assigned_to_me = True
                invoice_no = data.get('invoice_no') or invoice_no
                break
        except Exception:
            continue

    if not assigned_to_me:
        raise HTTPException(status_code=403, detail='This order is not assigned to you')

    delivery = db.query(models.Delivery).filter(
        models.Delivery.order_id == invoice_id,
        models.Delivery.org_id == principal.org_id
    ).first()

    if not delivery:
        raise HTTPException(status_code=404, detail='Delivery not found')

    previous_status = delivery.rider_status or delivery.status or 'assigned'

    now = datetime.now(timezone.utc)
    delivery.status = 'cancelled'
    delivery.rider_status = 'cancelled'
    delivery.delivery_notes = reason
    delivery.completed_at = None
    delivery.delivered_at = None
    db.add(delivery)

    log_entry = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='delivery_cancelled',
        payload=json.dumps({
            'invoice_id': invoice_id,
            'delivery_id': delivery.delivery_id,
            'rider_user_id': principal.user_id,
            'reason': reason,
            'cancelled_at': now.isoformat()
        })
    )
    db.add(log_entry)
    db.commit()

    # Attempt to resolve invoice_no for notifications if missing
    if not invoice_no:
        try:
            drafts = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == principal.org_id,
                models.SyncLog.type == 'invoice_draft'
            ).all()
            for draft in drafts:
                draft_data = json.loads(draft.payload or '{}')
                if draft_data.get('invoice_id') == invoice_id:
                    invoice_no = draft_data.get('invoice_no') or invoice_no
                    break
        except Exception:
            pass

    from ..websocket import manager
    await manager.notify_order_status_change(
        principal.org_id,
        invoice_id,
        invoice_no or invoice_id,
        'cancelled'
    )

    return {
        'status': 'ok',
        'invoice_id': invoice_id,
        'delivery_id': delivery.delivery_id,
        'rider_status': 'cancelled',
        'previous_status': previous_status
    }


@router.post("/rider/reject-order", response_model=Dict[str, Any])
def reject_order(payload: RejectOrderIn, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Reject a delivery order"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can reject orders')
    
    # Convert invoice_no to invoice_id (UUID) if needed
    invoice_id = resolve_invoice_id(payload.invoice_id, principal.org_id, db)
    logger.info(f"Reject order: invoice_id={invoice_id}, user={principal.user_id}")
    
    # Verify this order is assigned to this rider
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    assigned_to_me = False
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            if data.get('invoice_id') == invoice_id and (
                data.get('rider_user_id') == principal.user_id or data.get('rider_id') == principal.user_id
            ):
                assigned_to_me = True
                break
        except:
            continue
    
    if not assigned_to_me:
        raise HTTPException(status_code=403, detail='This order is not assigned to you')

    # Ensure rider does not have another active in-transit delivery (except this order)
    active_in_transit = db.query(models.Delivery).filter(
        models.Delivery.org_id == principal.org_id,
        models.Delivery.assigned_rider_id == principal.user_id,
        models.Delivery.rider_status == 'in_transit',
        models.Delivery.order_id != invoice_id
    ).first()

    if active_in_transit:
        logger.info(f"START DELIVERY: Rider {principal.user_id} already has in-transit delivery {active_in_transit.delivery_id}")
        raise HTTPException(status_code=409, detail='You already have a delivery in progress. Complete it before starting another.')

    # Update deliveries table
    delivery = db.query(models.Delivery).filter(
        models.Delivery.order_id == invoice_id,
        models.Delivery.org_id == principal.org_id
    ).first()
    if delivery:
        delivery.rider_status = 'rejected'
        db.add(delivery)
    
    # Log rejection
    rejection_data = {
        'invoice_id': invoice_id,
        'rider_user_id': principal.user_id,
        'rejected_at': datetime.utcnow().isoformat() + 'Z'
    }
    
    log_entry = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='rider_order_rejected',
        payload=json.dumps(rejection_data)
    )
    db.add(log_entry)
    db.commit()
    
    return {'status': 'ok', 'invoice_id': invoice_id}


@router.get("/delivery-proof/{invoice_id}", response_model=Dict[str, Any])
def get_delivery_proof(invoice_id: str, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Get delivery completion proof details for organization admins/owners"""
    # Allow Owner, Manager, SuperAdmin roles to view delivery proof
    allowed_roles = ['owner', 'manager', 'superadmin']
    if (principal.role or '').lower() not in allowed_roles:
        raise HTTPException(status_code=403, detail='Not permitted to view delivery proof')
    
    # Find delivery completion log
    completion_logs = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'delivery_completed'
    ).all()
    
    delivery_data = None
    for log in completion_logs:
        try:
            data = json.loads(log.payload or '{}')
            if data.get('invoice_id') == invoice_id:
                delivery_data = data
                delivery_data['completed_at'] = log.created_at.isoformat() + 'Z'
                delivery_data['log_id'] = log.id
                break
        except:
            continue
    
    if not delivery_data:
        raise HTTPException(status_code=404, detail='Delivery proof not found')
    
    # Get rider info
    rider_user_id = delivery_data.get('rider_user_id')
    rider = None
    if rider_user_id:
        rider = db.query(models.User).filter(
            models.User.user_id == rider_user_id,
            models.User.org_id == principal.org_id
        ).first()
    
    # Get invoice details from drafts
    invoice_data = {}
    drafts = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_draft'
    ).all()
    
    for draft in drafts:
        try:
            ddata = json.loads(draft.payload or '{}')
            if ddata.get('invoice_id') == invoice_id:
                invoice_data = ddata
                break
        except:
            continue
    
    return {
        'invoice_id': invoice_id,
        'invoice_no': invoice_data.get('invoice_no', invoice_id),
        'customer_name': invoice_data.get('customer_name'),
        'total_amount': invoice_data.get('totals', {}).get('total', 0),
        'rider_name': rider.name if rider else None,
        'rider_email': rider.email if rider else None,
        'delivery_location': delivery_data.get('location'),
        'payment': delivery_data.get('payment'),
        'completed_at': delivery_data.get('completed_at'),
        'proof_images': []  # TODO: Add image URLs when file upload is implemented
    }


@router.post("/rider/start-delivery", response_model=Dict[str, Any])
async def start_delivery(payload: StartDeliveryIn, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Start delivery (change status to in_transit)"""
    logger.info(f"START DELIVERY: invoice_id={payload.invoice_id}, rider={principal.user_id}")
    
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can start deliveries')
    
    # Convert invoice_no to invoice_id (UUID) if needed
    invoice_id = resolve_invoice_id(payload.invoice_id, principal.org_id, db)
    logger.info(f"Start delivery: invoice_id={invoice_id}, user={principal.user_id}")
    
    # Get rider info
    rider = db.query(models.User).filter(
        models.User.user_id == principal.user_id,
        models.User.org_id == principal.org_id
    ).first()
    rider_name = rider.name if rider else 'Rider'
    
    # Verify this order is assigned to this rider
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    assigned_to_me = False
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            if data.get('invoice_id') == invoice_id and (
                data.get('rider_user_id') == principal.user_id or data.get('rider_id') == principal.user_id
            ):
                assigned_to_me = True
                break
        except:
            continue
    
    if not assigned_to_me:
        raise HTTPException(status_code=403, detail='This order is not assigned to you')
    
    # Update deliveries table
    delivery = db.query(models.Delivery).filter(
        models.Delivery.order_id == invoice_id,
        models.Delivery.org_id == principal.org_id
    ).first()
    logger.info(f"START DELIVERY: delivery_found={delivery is not None}")
    if delivery:
        logger.info(f"START DELIVERY: Updating delivery {delivery.delivery_id} from {delivery.rider_status} to in_transit")
        delivery.rider_status = 'in_transit'
        delivery.in_transit_at = datetime.utcnow()
        if payload.location:
            delivery.delivery_latitude = str(payload.location.get('lat'))
            delivery.delivery_longitude = str(payload.location.get('lng'))
        db.add(delivery)
        logger.info(f"START DELIVERY: db.add() called for delivery {delivery.delivery_id}")
    
    # Log start
    start_data = {
        'invoice_id': invoice_id,
        'rider_user_id': principal.user_id,
        'location': payload.location,
        'started_at': datetime.utcnow().isoformat() + 'Z'
    }
    
    log_entry = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='rider_delivery_started',
        payload=json.dumps(start_data)
    )
    db.add(log_entry)
    logger.info(f"START DELIVERY: Committing changes...")
    db.commit()
    logger.info(f"START DELIVERY: Commit successful!")
    
    # Get invoice_no for notification
    invoice_no = payload.invoice_id
    try:
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        for draft in drafts:
            draft_data = json.loads(draft.payload or '{}')
            if draft_data.get('invoice_id') == invoice_id:
                invoice_no = draft_data.get('invoice_no', invoice_no)
                break
    except Exception as e:
        logger.warning(f"Failed to resolve invoice_no for start_delivery: {e}")

    # Send WebSocket notification
    from ..websocket import manager
    await manager.notify_order_status_change(principal.org_id, invoice_id, invoice_no, 'in_transit', rider_name)
    
    return {'status': 'ok', 'invoice_id': invoice_id, 'rider_status': 'in_transit'}


@router.post("/rider/update-location", response_model=Dict[str, Any])
async def update_location(payload: UpdateLocationIn, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Update rider's live location"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can update location')

    # Normalize invoice identifier so location history matches audit lookups
    invoice_id = resolve_invoice_id(payload.invoice_id, principal.org_id, db)
    if not invoice_id:
        raise HTTPException(status_code=404, detail='Invoice not found for location update')

    # Try to also capture invoice_no for downstream consumers
    invoice_no = payload.invoice_id
    try:
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        for draft in drafts:
            ddata = json.loads(draft.payload or '{}')
            if ddata.get('invoice_id') == invoice_id:
                invoice_no = ddata.get('invoice_no', invoice_no)
                break
    except Exception as e:
        logger.warning(f"[RIDER] Failed to resolve invoice_no for location update: {e}")

    # Log location update with normalized invoice_id
    location_data = {
        'invoice_id': invoice_id,
        'invoice_no': invoice_no,
        'rider_user_id': principal.user_id,
        'location': payload.location,
        'timestamp': payload.timestamp
    }

    log_entry = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='rider_location_update',
        payload=json.dumps(location_data)
    )
    db.add(log_entry)
    db.commit()

    # Broadcast location update to admin portal via WebSocket
    from ..websocket import manager

    # Get rider details for the broadcast
    rider = db.query(models.User).filter(models.User.user_id == principal.user_id).first()

    await manager.broadcast_to_org(principal.org_id, {
        'type': 'rider_location_update',
        'data': {
            'invoice_id': invoice_id,
            'invoice_no': invoice_no,
            'rider_email': rider.email if rider else principal.user_id,
            'rider_name': rider.name if rider else principal.user_id,
            'latitude': payload.location.get('lat'),
            'longitude': payload.location.get('lng'),
            'timestamp': payload.timestamp
        }
    })

    return {'status': 'ok', 'invoice_id': invoice_id}


@router.post("/rider/upload-pod-image", response_model=Dict[str, Any])
async def upload_pod_image(
    invoice_id: str,
    file: UploadFile = File(...),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Upload POD (Proof of Delivery) image"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can upload POD images')
    
    # Convert invoice_no to invoice_id (UUID) if needed
    resolved_invoice_id = resolve_invoice_id(invoice_id, principal.org_id, db)
    logger.info(f"Upload POD: invoice_id param={invoice_id}, resolved={resolved_invoice_id}")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail='Only image files are allowed')
    
    # Create uploads directory if it doesn't exist (use project-local path to avoid permission issues)
    upload_dir = os.path.join(os.getcwd(), 'uploads', 'pod')
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    unique_filename = f"{resolved_invoice_id}_{uuid.uuid4().hex[:8]}.{file_ext}"
    file_path = os.path.join(upload_dir, unique_filename)
    
    # Save file
    content = await file.read()
    with open(file_path, 'wb') as f:
        f.write(content)
    
    # Generate URL (relative path for serving)
    image_url = f"/uploads/pod/{unique_filename}"
    
    # Get invoice number for notification
    invoice_no = None
    try:
        invoice_drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        for draft in invoice_drafts:
            draft_data = json.loads(draft.payload or '{}')
            if draft_data.get('invoice_id') == resolved_invoice_id:
                invoice_no = draft_data.get('invoice_no')
                break
    except:
        pass
    
    # Store in sync log for later retrieval
    pod_data = {
        'invoice_id': resolved_invoice_id,
        'rider_user_id': principal.user_id,
        'image_url': image_url,
        'uploaded_at': datetime.utcnow().isoformat() + 'Z'
    }
    
    log_entry = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='pod_image_uploaded',
        payload=json.dumps(pod_data)
    )
    db.add(log_entry)
    db.commit()
    
    # Send WebSocket notification to admin portal
    from ..websocket import manager
    await manager.notify_pod_uploaded(principal.org_id, resolved_invoice_id, invoice_no or resolved_invoice_id[:8], image_url)
    
    return {'status': 'ok', 'image_url': image_url}


@router.post("/rider/complete-delivery", response_model=Dict[str, Any])
async def complete_delivery(payload: CompleteDeliveryIn, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Mark delivery as completed with location and payment info"""
    logger.info(f"Complete delivery request: invoice_id={payload.invoice_id}, user_id={principal.user_id}")
    
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can complete deliveries')
    
    # Convert invoice_no to invoice_id (UUID) if needed
    invoice_id = resolve_invoice_id(payload.invoice_id, principal.org_id, db)
    logger.info(f"Complete delivery: invoice_id={invoice_id}, user={principal.user_id}")
    
    # Get rider info
    rider = db.query(models.User).filter(
        models.User.user_id == principal.user_id,
        models.User.org_id == principal.org_id
    ).first()
    rider_name = rider.name if rider else 'Rider'
    
    # Verify this order is assigned to this rider
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    assigned_to_me = False
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            if data.get('invoice_id') == invoice_id:
                rider_assignee = data.get('rider_user_id') or data.get('rider_id')
                if rider_assignee == principal.user_id:
                    assigned_to_me = True
                    break
        except:
            continue
    
    if not assigned_to_me:
        logger.warning(f"Order {invoice_id} not assigned to rider {principal.user_id}")
        raise HTTPException(status_code=403, detail='This order is not assigned to you')
    
    # Check if already completed
    existing = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'delivery_completed'
    ).all()
    
    for log in existing:
        try:
            data = json.loads(log.payload or '{}')
            if data.get('invoice_id') == invoice_id:
                logger.warning(f"Delivery {invoice_id} already completed")
                raise HTTPException(status_code=400, detail='Delivery already completed')
        except:
            continue
    
    # Update deliveries table
    delivery = db.query(models.Delivery).filter(
        models.Delivery.order_id == invoice_id,
        models.Delivery.org_id == principal.org_id
    ).first()
    if delivery:
        delivery.rider_status = 'completed'
        delivery.status = 'completed'
        delivery.completed_at = datetime.utcnow()
        delivery.delivered_at = datetime.utcnow()
        if payload.location:
            delivery.delivery_latitude = str(payload.location.get('lat'))
            delivery.delivery_longitude = str(payload.location.get('lng'))
        db.add(delivery)
    
    # Log completion
    completion_data = {
        'invoice_id': invoice_id,
        'rider_user_id': principal.user_id,
        'location': payload.location,
        'payment': payload.payment,
        'completed_at': datetime.utcnow().isoformat() + 'Z'
    }
    
    logger.info(f"Creating delivery_completed log for invoice {invoice_id}")
    log_entry = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='delivery_completed',
        payload=json.dumps(completion_data)
    )
    db.add(log_entry)
    db.commit()
    
    # Get invoice_no for notification
    invoice_no = payload.invoice_id
    invoice_data = None
    try:
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        for draft in drafts:
            draft_data = json.loads(draft.payload or '{}')
            if draft_data.get('invoice_id') == invoice_id:
                invoice_data = draft_data
                invoice_no = draft_data.get('invoice_no', invoice_no)
                break
    except Exception as e:
        logger.warning(f"Failed to resolve invoice_no for completion: {e}")

    # Send org communication card receipt email when enabled
    payment_info = payload.payment or {}
    method_label = str(payment_info.get('method') or payment_info.get('payment_method') or '').strip()
    org = db.query(models.Organization).filter(models.Organization.org_id == principal.org_id).first()
    settings = (org.settings or {}) if org else {}
    comm_settings = settings.get('communication') or settings.get('communication_settings') or {}

    logger.info(f"📧 Email check - payment_method: {method_label}")
    logger.info(f"📧 Communication settings: enabled={comm_settings.get('card_receipt_enabled')}, org_email={comm_settings.get('card_receipt_email')}")

    if comm_settings.get('card_receipt_enabled') and comm_settings.get('card_receipt_email'):
        logger.info(f"📧 Preparing to send delivery receipt emails for invoice {invoice_id}")
        
        # Extract order details
        totals = (invoice_data or {}).get('totals') or {}
        amount = payment_info.get('amount') or payment_info.get('total_amount') or payment_info.get('cash_amount') or payment_info.get('paid_amount')
        amount = amount or totals.get('total') or (invoice_data or {}).get('total') or 0
        
        customer_name = None
        customer_phone = None
        customer_email = None
        items = []
        
        if invoice_data:
            customer_name = invoice_data.get('customer_name') or invoice_data.get('customer_company_name') or 'Customer'
            customer_phone = invoice_data.get('customer_phone')
            customer_email = invoice_data.get('customer_email')
            items = invoice_data.get('items') or []
        
        card_last4 = payment_info.get('card_last4') or payment_info.get('card_last_digits')
        completed_at = completion_data.get('completed_at')
        
        payment_line = method_label or 'Cash'
        if card_last4:
            payment_line = f"{payment_line} (****{card_last4})"
        
        # Format items HTML
        items_html = format_items_html(items)
        
        # Find most recent POD image for this order
        pod_image_path = None
        pod_filename = None
        try:
            pod_logs = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == principal.org_id,
                models.SyncLog.type == 'pod_image_uploaded'
            ).order_by(models.SyncLog.created_at.desc()).all()
            
            for pod_log in pod_logs:
                pod_data = json.loads(pod_log.payload or '{}')
                if pod_data.get('invoice_id') == invoice_id:
                    image_url = pod_data.get('image_url', '')
                    if image_url.startswith('/uploads/pod/'):
                        filename = image_url.replace('/uploads/pod/', '')
                        upload_dir = os.path.join(os.getcwd(), 'uploads', 'pod')
                        full_path = os.path.join(upload_dir, filename)
                        if os.path.exists(full_path):
                            pod_image_path = full_path
                            pod_filename = f"delivery_proof_{invoice_no or invoice_id[:8]}.jpg"
                            logger.info(f"📧 Found POD image: {full_path}")
                            break
        except Exception as e:
            logger.warning(f"Error finding POD image: {e}")
        
        attachments = []
        if pod_image_path:
            attachments.append({
                'filepath': pod_image_path,
                'filename': pod_filename
            })
        
        org_name = org.name if org else 'DigitalChain'
        
        # Send email to organization
        try:
            email_data = get_order_completed_email(
                org_name=org_name,
                invoice_no=invoice_no or invoice_id[:8],
                customer_name=customer_name,
                customer_phone=customer_phone,
                amount=float(amount),
                payment_method=payment_line,
                items_html=items_html,
                completed_at=completed_at or datetime.utcnow().isoformat(),
                has_attachment=bool(pod_image_path),
                is_customer=False
            )
            
            logger.info(f"📧 Sending org email to {comm_settings.get('card_receipt_email')}")
            send_generic_email(
                db,
                to_email=comm_settings.get('card_receipt_email'),
                subject=email_data['subject'],
                html_body=email_data['html'],
                from_name=org_name,
                attachments=attachments if attachments else None
            )
            logger.info(f"📧 Org email sent successfully")
        except Exception as e:
            logger.error(f"📧 Failed to send org email: {e}")
        
        # Send email to customer if email available
        if customer_email:
            try:
                customer_email_data = get_order_completed_email(
                    org_name=org_name,
                    invoice_no=invoice_no or invoice_id[:8],
                    customer_name=customer_name,
                    customer_phone=customer_phone,
                    amount=float(amount),
                    payment_method=payment_line,
                    items_html=items_html,
                    completed_at=completed_at or datetime.utcnow().isoformat(),
                    has_attachment=bool(pod_image_path),
                    is_customer=True
                )
                
                logger.info(f"📧 Sending customer email to {customer_email}")
                send_generic_email(
                    db,
                    to_email=customer_email,
                    subject=customer_email_data['subject'],
                    html_body=customer_email_data['html'],
                    from_name=org_name,
                    attachments=attachments if attachments else None
                )
                logger.info(f"📧 Customer email sent successfully")
            except Exception as e:
                logger.error(f"📧 Failed to send customer email: {e}")
    else:
        logger.info(f"📧 Email not sent - communication settings not enabled")

    # Send WebSocket notification
    from ..websocket import manager
    await manager.notify_order_status_change(principal.org_id, invoice_id, invoice_no, 'completed', rider_name)
    
    return {'status': 'ok', 'invoice_id': invoice_id}


@router.post("/rider/sync-locations", response_model=Dict[str, Any])
async def sync_locations(
    payload: SyncLocationsIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Batch sync location updates from rider app (offline support)"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can sync locations')
    
    invoice_id = resolve_invoice_id(payload.invoice_id, principal.org_id, db)
    logger.info(f"Syncing {len(payload.locations)} locations for invoice {invoice_id}")
    
    # Save all locations
    synced_count = 0
    for loc_data in payload.locations:
        try:
            location_data = {
                'invoice_id': invoice_id,
                'rider_user_id': principal.user_id,
                'location': {
                    'lat': loc_data.get('lat'),
                    'lng': loc_data.get('lng')
                },
                'timestamp': loc_data.get('timestamp')
            }
            
            log_entry = models.SyncLog(
                org_id=principal.org_id,
                user_id=principal.user_id,
                type='rider_location_update',
                payload=json.dumps(location_data)
            )
            db.add(log_entry)
            synced_count += 1
        except Exception as e:
            logger.error(f"Error saving location: {e}")
    
    db.commit()
    
    # Broadcast last location to admin portal via WebSocket
    if payload.locations:
        last_loc = payload.locations[-1]
        rider = db.query(models.User).filter(models.User.user_id == principal.user_id).first()
        
        from ..websocket import manager
        await manager.broadcast_to_org(principal.org_id, {
            'type': 'rider_location_update',
            'data': {
                'invoice_id': invoice_id,
                'rider_email': principal.user_id,
                'rider_name': rider.name if rider else principal.user_id,
                'latitude': last_loc.get('lat'),
                'longitude': last_loc.get('lng'),
                'timestamp': last_loc.get('timestamp')
            }
        })
    
    return {'status': 'ok', 'synced': synced_count}


@router.post("/rider/notify-idle", response_model=Dict[str, Any])
async def notify_rider_idle(
    payload: RiderIdleNotificationIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Notify admin when rider is idle for extended period"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can send idle notifications')
    
    invoice_id = resolve_invoice_id(payload.invoice_id, principal.org_id, db)
    logger.warning(f"Rider {principal.user_id} idle for {payload.idle_duration_minutes} minutes at ({payload.latitude}, {payload.longitude})")
    
    # Get rider and invoice details
    rider = db.query(models.User).filter(models.User.user_id == principal.user_id).first()
    rider_name = rider.name if rider else principal.email
    
    # Get invoice_no
    invoice_no = payload.invoice_id
    try:
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        for draft in drafts:
            draft_data = json.loads(draft.payload or '{}')
            if draft_data.get('invoice_id') == invoice_id:
                invoice_no = draft_data.get('invoice_no', invoice_no)
                break
    except:
        pass
    
    # Log idle event
    idle_data = {
        'invoice_id': invoice_id,
        'rider_user_id': principal.user_id,
        'rider_name': rider_name,
        'latitude': payload.latitude,
        'longitude': payload.longitude,
        'idle_duration_minutes': payload.idle_duration_minutes,
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }
    
    log_entry = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type='rider_idle_alert',
        payload=json.dumps(idle_data)
    )
    db.add(log_entry)
    db.commit()
    
    # Send WebSocket notification to admin
    from ..websocket import manager
    await manager.broadcast_to_org(principal.org_id, {
        'type': 'rider_idle_alert',
        'data': {
            'invoice_id': invoice_id,
            'invoice_no': invoice_no,
            'rider_email': principal.user_id,
            'rider_name': rider_name,
            'latitude': payload.latitude,
            'longitude': payload.longitude,
            'idle_duration_minutes': payload.idle_duration_minutes,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
    })
    
    return {'status': 'ok', 'message': 'Idle notification sent'}


# ============================================================================
# ROUTE OPTIMIZATION ENDPOINTS
# ============================================================================

class OptimizeRouteIn(BaseModel):
    rider_user_id: Optional[str] = None
    rider_name: Optional[str] = None
    start_latitude: Optional[float] = None
    start_longitude: Optional[float] = None
    use_google_maps: bool = False


@router.post("/rider/optimize-route", response_model=Dict[str, Any])
def optimize_rider_route(
    payload: OptimizeRouteIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Optimize delivery route for a specific rider
    
    This endpoint:
    1. Gets the pickup location from organization settings
    2. Fetches all assigned deliveries for the rider (by name or ID)
    3. Optimizes the route starting from pickup location using TSP algorithms
    4. Updates route_sequence in the database
    5. Returns optimized route with stats
    """
    # Resolve rider by name or ID
    if not payload.rider_user_id and not payload.rider_name:
        raise HTTPException(status_code=400, detail="Either rider_user_id or rider_name must be provided")
    
    logger.info(f"Optimizing route for rider: {payload.rider_name or payload.rider_user_id}")
    
    # Get organization to fetch pickup location
    organization = db.query(models.Organization).filter(
        models.Organization.org_id == principal.org_id
    ).first()
    
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Get pickup location from organization settings
    pickup_location = None
    start_lat = payload.start_latitude
    start_lon = payload.start_longitude
    
    if organization.settings and isinstance(organization.settings, dict):
        pickup_location = organization.settings.get('pickup_location')
        if pickup_location and not start_lat and not start_lon:
            start_lat = pickup_location.get('latitude')
            start_lon = pickup_location.get('longitude')
            logger.info(f"Using pickup location from organization settings: ({start_lat}, {start_lon})")
    
    if not start_lat or not start_lon:
        raise HTTPException(
            status_code=400, 
            detail="Pickup location not configured in organization settings. Please set pickup_location in organization settings or provide start coordinates."
        )
    
    # Find rider by ID or name
    rider_query = db.query(models.User).filter(
        models.User.org_id == principal.org_id,
        models.User.role == 'Rider'
    )
    
    if payload.rider_user_id:
        rider = rider_query.filter(models.User.user_id == payload.rider_user_id).first()
    elif payload.rider_name:
        # Case-insensitive name search
        rider = rider_query.filter(models.User.name.ilike(f"%{payload.rider_name}%")).first()
    else:
        rider = None
    
    if not rider:
        raise HTTPException(status_code=404, detail=f"Rider not found: {payload.rider_name or payload.rider_user_id}")
    
    # Use the rider's user_id for all subsequent queries
    rider_user_id = rider.user_id
    
    # Get all assigned deliveries for this rider that are not yet delivered
    deliveries = db.query(models.Delivery).filter(
        models.Delivery.org_id == principal.org_id,
        models.Delivery.assigned_rider_id == rider_user_id,
        models.Delivery.rider_status.in_(['assigned', 'accepted', 'in_transit'])
    ).all()
    
    if not deliveries:
        return {
            'status': 'no_deliveries',
            'message': 'No pending deliveries found for this rider',
            'optimized_count': 0
        }
    
    # Filter deliveries with valid coordinates
    valid_deliveries = []
    skipped_deliveries = []
    
    for delivery in deliveries:
        try:
            # Try delivery_latitude/longitude first, then fallback to latitude/longitude
            lat_str = delivery.delivery_latitude or delivery.latitude
            lon_str = delivery.delivery_longitude or delivery.longitude
            
            if not lat_str or not lon_str:
                skipped_deliveries.append({
                    'delivery_id': delivery.delivery_id,
                    'reason': 'missing_coordinates'
                })
                continue
            
            lat = float(lat_str)
            lon = float(lon_str)
            
            if lat == 0 or lon == 0 or abs(lat) > 90 or abs(lon) > 180:
                skipped_deliveries.append({
                    'delivery_id': delivery.delivery_id,
                    'reason': 'invalid_coordinates'
                })
                continue
            
            valid_deliveries.append((delivery, lat, lon))
            
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid coordinates for delivery {delivery.delivery_id}: {e}")
            skipped_deliveries.append({
                'delivery_id': delivery.delivery_id,
                'reason': f'parse_error: {str(e)}'
            })
    
    if not valid_deliveries:
        return {
            'status': 'error',
            'message': 'No deliveries with valid coordinates found',
            'total_deliveries': len(deliveries),
            'skipped': skipped_deliveries
        }
    
    # Create DeliveryPoint objects for optimization
    delivery_points = []
    for delivery, lat, lon in valid_deliveries:
        point = DeliveryPoint(
            delivery_id=delivery.delivery_id,
            latitude=lat,
            longitude=lon,
            address=delivery.address,
            invoice_id=delivery.order_id
        )
        delivery_points.append(point)
    
    logger.info(f"Optimizing route for {len(delivery_points)} deliveries starting from pickup location ({start_lat}, {start_lon})")
    
    # Optimize the route starting from pickup location
    optimized_route = optimize_delivery_route(
        delivery_points,
        start_lat=start_lat,
        start_lon=start_lon,
        use_google_maps=payload.use_google_maps
    )
    
    # Update route_sequence in database
    for sequence, point in enumerate(optimized_route, start=1):
        db.query(models.Delivery).filter(
            models.Delivery.delivery_id == point.delivery_id,
            models.Delivery.org_id == principal.org_id
        ).update({'route_sequence': sequence})
    
    db.commit()
    
    # Calculate route statistics
    stats = calculate_route_stats(optimized_route)
    
    # Build response with optimized route details
    route_details = []
    for sequence, point in enumerate(optimized_route, start=1):
        # Find the original delivery record
        delivery_record = next((d for d, _, _ in valid_deliveries 
                               if d.delivery_id == point.delivery_id), None)
        
        route_details.append({
            'sequence': sequence,
            'delivery_id': point.delivery_id,
            'invoice_id': point.invoice_id,
            'address': point.address,
            'latitude': point.latitude,
            'longitude': point.longitude,
            'rider_status': delivery_record.rider_status if delivery_record else None
        })
    
    logger.info(f"Route optimized successfully: {len(route_details)} stops, "
                f"{stats['total_distance_km']} km, ~{stats['estimated_time_minutes']} min")
    
    return {
        'status': 'success',
        'rider_id': rider_user_id,
        'rider_name': rider.name,
        'pickup_location': {
            'latitude': start_lat,
            'longitude': start_lon,
            'address': pickup_location.get('address') if pickup_location else 'Organization Pickup Point'
        },
        'optimized_count': len(route_details),
        'skipped_count': len(skipped_deliveries),
        'skipped_deliveries': skipped_deliveries,
        'route': route_details,
        'stats': stats
    }


@router.get("/rider/{rider_user_id}/route-status", response_model=Dict[str, Any])
def get_rider_route_status(
    rider_user_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Get route optimization status for a rider
    Shows which deliveries have route_sequence assigned
    """
    # Verify rider exists
    rider = db.query(models.User).filter(
        models.User.user_id == rider_user_id,
        models.User.org_id == principal.org_id,
        models.User.role == 'Rider'
    ).first()
    
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # Get all deliveries for this rider
    deliveries = db.query(models.Delivery).filter(
        models.Delivery.org_id == principal.org_id,
        models.Delivery.assigned_rider_id == rider_user_id,
        models.Delivery.rider_status.in_(['assigned', 'accepted', 'in_transit', 'delivered'])
    ).order_by(models.Delivery.route_sequence.asc()).all()
    
    optimized_count = sum(1 for d in deliveries if d.route_sequence is not None)
    pending_count = sum(1 for d in deliveries if d.rider_status in ['assigned', 'accepted', 'in_transit'])
    
    return {
        'rider_id': rider_user_id,
        'rider_name': rider.name,
        'total_deliveries': len(deliveries),
        'optimized_deliveries': optimized_count,
        'pending_deliveries': pending_count,
        'is_route_optimized': optimized_count > 0,
        'deliveries': [{
            'delivery_id': d.delivery_id,
            'route_sequence': d.route_sequence,
            'rider_status': d.rider_status,
            'address': d.address
        } for d in deliveries]
    }


@router.get("/rider/{rider_user_id}/route-map", response_model=Dict[str, Any])
def get_rider_route_map(
    rider_user_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Get optimized route map data for visualization
    Returns pickup location and all delivery points with coordinates in route sequence
    """
    # Verify rider exists
    rider = db.query(models.User).filter(
        models.User.user_id == rider_user_id,
        models.User.org_id == principal.org_id,
        models.User.role == 'Rider'
    ).first()
    
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # Get organization settings for pickup location
    org = db.query(models.Organization).filter(
        models.Organization.org_id == principal.org_id
    ).first()
    
    pickup_location = None
    if org and org.settings:
        try:
            settings = json.loads(org.settings) if isinstance(org.settings, str) else org.settings
            if 'pickup_location' in settings and settings['pickup_location']:
                pickup_location = {
                    'latitude': settings['pickup_location'].get('latitude'),
                    'longitude': settings['pickup_location'].get('longitude'),
                    'address': settings['pickup_location'].get('address', 'Pickup Location')
                }
        except:
            pass
    
    # Get optimized deliveries (only those with route_sequence)
    deliveries = db.query(models.Delivery).filter(
        models.Delivery.org_id == principal.org_id,
        models.Delivery.assigned_rider_id == rider_user_id,
        models.Delivery.route_sequence.isnot(None),
        models.Delivery.rider_status.in_(['assigned', 'accepted', 'in_transit', 'delivered'])
    ).order_by(models.Delivery.route_sequence.asc()).all()
    
    if not deliveries:
        return {
            'status': 'no_route',
            'message': 'No optimized route found for this rider',
            'rider_name': rider.name,
            'pickup_location': pickup_location,
            'deliveries': []
        }
    
    # Build delivery points with coordinates
    delivery_points = []
    for d in deliveries:
        try:
            lat = float(d.delivery_latitude) if d.delivery_latitude else None
            lng = float(d.delivery_longitude) if d.delivery_longitude else None
            
            if lat and lng:
                delivery_points.append({
                    'delivery_id': d.delivery_id,
                    'route_sequence': d.route_sequence,
                    'latitude': lat,
                    'longitude': lng,
                    'address': d.address,
                    'customer': d.customer,
                    'customer_phone': d.customer_phone,
                    'rider_status': d.rider_status,
                    'tracking_number': d.tracking_number
                })
        except (ValueError, TypeError):
            # Skip deliveries with invalid coordinates
            continue
    
    return {
        'status': 'success',
        'rider_id': rider_user_id,
        'rider_name': rider.name,
        'pickup_location': pickup_location,
        'total_deliveries': len(delivery_points),
        'deliveries': delivery_points
    }
