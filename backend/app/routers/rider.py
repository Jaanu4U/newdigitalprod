from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas
from datetime import datetime
import uuid
import json
from ..deps import get_current_org_id, get_current_principal, CurrentPrincipal

router = APIRouter()

@router.get("/deliveries", response_model=schemas.DeliveriesOut)
def list_deliveries(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Get deliveries assigned to the current rider with invoice numbers and phone numbers.
    """
    rows = db.query(models.Delivery).filter(
        models.Delivery.org_id == principal.org_id,
        models.Delivery.assigned_rider_id == principal.user_id
    ).all()
    
    # Get all invoice drafts for this org
    sync_entries = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_draft',
    ).all()
    
    # Build invoice_id -> invoice_no map and coordinates map
    invoice_map = {}
    customer_id_map = {}
    coordinates_map = {}
    for entry in sync_entries:
        try:
            data = json.loads(entry.payload or '{}')
            inv_id = data.get('invoice_id')
            if inv_id:
                invoice_map[inv_id] = data.get('invoice_no', inv_id)
                customer_id_map[inv_id] = data.get('customer_id')
                # Get delivery coordinates from invoice draft
                delivery_lat = data.get('delivery_latitude')
                delivery_lng = data.get('delivery_longitude')
                if delivery_lat and delivery_lng:
                    coordinates_map[inv_id] = (str(delivery_lat), str(delivery_lng))
        except:
            continue
    
    # Get all customers for phone lookup and names
    customers = db.query(models.Customer).filter(
        models.Customer.org_id == principal.org_id
    ).all()
    customer_phone_map = {c.customer_id: c.phone for c in customers}
    customer_name_map = {}
    for c in customers:
        # Use same logic as rider_delivery.py - prioritize company_name for B2B or when name is empty
        if c.company_name and (not c.name or (c.ctype and c.ctype.upper() == 'B2B')):
            customer_name_map[c.customer_id] = c.company_name
        elif c.name:
            customer_name_map[c.customer_id] = c.name
        elif c.company_name:
            customer_name_map[c.customer_id] = c.company_name
        else:
            customer_name_map[c.customer_id] = "Unknown Customer"
    
    items = []
    for r in rows:
        invoice_no = invoice_map.get(r.order_id, r.order_id)
        customer_id = customer_id_map.get(r.order_id)
        customer_phone = r.customer_phone or (customer_phone_map.get(customer_id) if customer_id else None)
        # Get coordinates from invoice draft
        coords = coordinates_map.get(r.order_id, (None, None))
        
        # Convert coordinates to float
        lat = None
        lng = None
        try:
            lat_str = coords[0] or r.latitude
            lng_str = coords[1] or r.longitude
            if lat_str:
                lat = float(lat_str)
            if lng_str:
                lng = float(lng_str)
        except (ValueError, TypeError):
            pass
        
        items.append(schemas.DeliveryOut(
            delivery_id=r.delivery_id,
            order_id=invoice_no or "UNKNOWN",
            customer=customer_name_map.get(customer_id) or r.customer or "Unknown Customer",
            address=r.address or "No Address",
            status=r.status or "assigned",
            rider_status=r.rider_status or "assigned",
            customer_phone=customer_phone,
            latitude=lat,
            longitude=lng
        ))
    return {"items": items}

@router.get("/deliveries/{delivery_id}", response_model=schemas.DeliveryOut)
def get_delivery(
    delivery_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get delivery details if assigned to current rider"""
    d = (
        db.query(models.Delivery)
        .filter(models.Delivery.delivery_id == delivery_id, models.Delivery.org_id == principal.org_id)
        .first()
    )
    if not d:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    # Verify this delivery is assigned to this rider
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    is_assigned = False
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            if data.get('rider_user_id') == principal.user_id and data.get('invoice_id') == d.order_id:
                is_assigned = True
                break
        except:
            continue
    
    if not is_assigned:
        raise HTTPException(status_code=403, detail="Delivery not assigned to you")
    
    return schemas.DeliveryOut(
        delivery_id=d.delivery_id,
        order_id=d.order_id,
        customer=d.customer,
        address=d.address,
        status=d.status,
    )

@router.post("/deliveries/{delivery_id}/status", response_model=schemas.StatusUpdateOut)
def update_status(
    delivery_id: str,
    payload: schemas.StatusUpdateIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    d = db.query(models.Delivery).filter(
        models.Delivery.delivery_id == delivery_id,
        models.Delivery.org_id == principal.org_id
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    # Verify assignment
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).all()
    
    is_assigned = False
    for assignment in assignments:
        try:
            data = json.loads(assignment.payload or '{}')
            if data.get('rider_user_id') == principal.user_id and data.get('invoice_id') == d.order_id:
                is_assigned = True
                break
        except:
            continue
    
    if not is_assigned:
        raise HTTPException(status_code=403, detail="Delivery not assigned to you")
    
    d.status = payload.status
    log = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type="status_update",
        payload=json.dumps({"delivery_id": delivery_id, "status": payload.status})
    )
    db.add(log)
    db.commit()
    return {"status": "ok", "delivery_id": delivery_id, "new_status": d.status}

@router.post("/deliveries/{delivery_id}/pod", response_model=schemas.PodOut)
def upload_pod(
    delivery_id: str,
    payload: schemas.PodIn,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    # Store only metadata in this starter
    log = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type="pod",
        payload=json.dumps({"delivery_id": delivery_id, "recipient_name": payload.recipient_name})
    )
    db.add(log)
    db.commit()
    return {"status": "ok", "pod_id": str(uuid.uuid4())}

@router.post("/location")
def push_location(
    points: dict,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    log = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        type="location",
        payload=json.dumps(points)
    )
    db.add(log)
    db.commit()
    return {"status": "ok"}
