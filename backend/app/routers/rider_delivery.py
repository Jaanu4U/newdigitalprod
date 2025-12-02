from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..deps import get_current_principal, CurrentPrincipal
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import os
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


def resolve_invoice_id(invoice_identifier: str, org_id: str, db: Session) -> str:
    """
    Convert invoice number (INV-20251112-0001) to invoice UUID if needed.
    Returns the UUID invoice_id.
    """
    if not invoice_identifier.startswith('INV-'):
        # Already a UUID
        return invoice_identifier
    
    # Look up the UUID from invoice_no
    drafts = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == org_id,
        models.SyncLog.type == 'invoice_draft'
    ).all()
    
    for draft in drafts:
        try:
            data = json.loads(draft.payload or '{}')
            if data.get('invoice_no') == invoice_identifier:
                invoice_id = data.get('invoice_id')
                logger.info(f"Resolved invoice_no {invoice_identifier} to invoice_id {invoice_id}")
                return invoice_id
        except:
            continue
    
    # If not found, return as-is (will likely fail validation later)
    logger.warning(f"Could not resolve invoice_no {invoice_identifier} to UUID")
    return invoice_identifier


@router.get("/rider/assigned-orders", response_model=Dict[str, Any])
def get_assigned_orders(principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Get all orders assigned to the current rider"""
    import logging
    logger = logging.getLogger("uvicorn")
    
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
            if data.get('rider_user_id') == principal.user_id:
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
                
                # Get shipping address from shipment if available
                shipping_address = None
                shipment_logs = db.query(models.SyncLog).filter(
                    models.SyncLog.org_id == principal.org_id,
                    models.SyncLog.type.in_(['invoice_shipment_assigned', 'invoice_shipment_updated'])
                ).order_by(models.SyncLog.created_at.desc()).all()
                
                for slog in shipment_logs:
                    try:
                        sdata = json.loads(slog.payload or '{}')
                        if sdata.get('invoice_id') == actual_invoice_id:
                            shipping_address = sdata.get('shipping_address')
                            if shipping_address:
                                break
                    except:
                        pass
                
                # Determine rider status based on sync_log entries
                rider_status = 'assigned'
                if is_delivered:
                    rider_status = 'delivered'
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
                
                orders.append({
                    'invoice_id': actual_invoice_id,
                    'invoice_no': invoice_data.get('invoice_no', actual_invoice_id) or "UNKNOWN_NO",
                    'customer_id': customer_id,
                    'customer_name': customer_name,
                    'customer_address': customer_address,
                    'customer_phone': customer_phone,
                    'delivery_latitude': delivery_latitude,
                    'delivery_longitude': delivery_longitude,
                    'delivery_address': delivery_address,
                    'shipping_address': shipping_address,  # Add shipping address from shipment
                    'amount': invoice_data.get('amount') or invoice_data.get('totals', {}).get('total', 0),
                    'totals': invoice_data.get('totals', {}),
                    'assigned_at': data.get('assigned_at') or assignment.created_at.isoformat() + 'Z',
                    'status': 'delivered' if is_delivered else 'pending',
                    'delivered_at': delivered_at,
                    'rider_status': rider_status
                })
        except Exception as e:
            logger.error(f"Error processing assignment: {e}")
            continue
    
    logger.info(f"Returning {len(orders)} orders to rider {principal.user_id}")
    return {'orders': orders, 'count': len(orders)}


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
            if data.get('invoice_id') == invoice_id and data.get('rider_user_id') == principal.user_id:
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
    
    # Send WebSocket notification
    from ..websocket import manager
    await manager.notify_order_status_change(principal.org_id, invoice_id, invoice_no, 'accepted', rider_name)
    
    return {'status': 'ok', 'invoice_id': invoice_id, 'rider_status': 'accepted'}


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
            if data.get('invoice_id') == invoice_id and data.get('rider_user_id') == principal.user_id:
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
            if data.get('invoice_id') == invoice_id and data.get('rider_user_id') == principal.user_id:
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
    except:
        pass
    
    # Send WebSocket notification
    from ..websocket import manager
    await manager.notify_order_status_change(principal.org_id, invoice_id, invoice_no, 'in_transit', rider_name)
    
    return {'status': 'ok', 'invoice_id': invoice_id, 'rider_status': 'in_transit'}


@router.post("/rider/update-location", response_model=Dict[str, Any])
async def update_location(payload: UpdateLocationIn, principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)):
    """Update rider's live location"""
    if (principal.role or '').lower() != 'rider':
        raise HTTPException(status_code=403, detail='Only riders can update location')
    
    # Log location update
    location_data = {
        'invoice_id': payload.invoice_id,
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
            'invoice_id': payload.invoice_id,
            'rider_email': rider.email if rider else principal.user_id,
            'rider_name': rider.name if rider else principal.user_id,
            'latitude': payload.location.get('lat'),
            'longitude': payload.location.get('lng'),
            'timestamp': payload.timestamp
        }
    })
    
    return {'status': 'ok'}


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
    
    # Create uploads directory if it doesn't exist (use absolute path)
    upload_dir = '/opt/digitalchain/backend/uploads/pod'
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
            if data.get('invoice_id') == invoice_id and data.get('rider_user_id') == principal.user_id:
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
