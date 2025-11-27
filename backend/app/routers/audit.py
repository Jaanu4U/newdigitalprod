from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..deps import get_current_principal, CurrentPrincipal
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import json

router = APIRouter()


class OrderAuditItem(BaseModel):
    invoice_id: str
    invoice_no: str
    order_id: str
    customer_name: str
    customer_phone: Optional[str]
    delivery_address: str
    amount: float
    rider_name: Optional[str]
    rider_email: Optional[str]
    shipment_provider: Optional[str]
    tracking_number: Optional[str]
    # Timestamps
    created_at: str
    assigned_at: Optional[str]
    accepted_at: Optional[str]
    in_transit_at: Optional[str]
    delivered_at: Optional[str]
    completed_at: Optional[str]
    # Locations
    pickup_location: Optional[Dict[str, float]]
    delivery_location: Optional[Dict[str, float]]
    # Payment
    payment_method: Optional[str]
    payment_details: Optional[Dict[str, Any]]
    # Proof of delivery
    pod_image_url: Optional[str]
    delivery_notes: Optional[str]


@router.get("/admin/orders/audit", response_model=Dict[str, Any])
def get_completed_orders_audit(
    status: Optional[str] = Query(None, description="Filter by status: completed, in_transit, assigned"),
    rider_id: Optional[str] = Query(None, description="Filter by rider user_id"),
    from_date: Optional[str] = Query(None, description="Filter from date (ISO format)"),
    to_date: Optional[str] = Query(None, description="Filter to date (ISO format)"),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive audit trail of all orders with rider, shipment, timing and location details.
    Only accessible by admins and owners.
    """
    # Check permissions
    allowed_roles = ['admin', 'owner', 'superadmin', 'manager']
    if (principal.role or '').lower() not in allowed_roles:
        raise HTTPException(status_code=403, detail='Only admins can access order audit')
    
    # Get all invoice assignments
    assignments = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    orders = []
    
    for assignment in assignments:
        try:
            assignment_data = json.loads(assignment.payload or '{}')
            invoice_id = assignment_data.get('invoice_id')
            rider_user_id = assignment_data.get('rider_user_id')
            
            if not invoice_id:
                continue
            
            # Apply rider filter
            if rider_id and rider_user_id != rider_id:
                continue
            
            # Get creator information from assignment log
            created_by = None
            if assignment.user_id:
                creator = db.query(models.User).filter(
                    models.User.user_id == assignment.user_id,
                    models.User.org_id == principal.org_id
                ).first()
                if creator:
                    created_by = creator.name or creator.email
            
            # Get invoice details
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
            
            # If no invoice_draft found, use assignment data as fallback
            customer = None  # Track if customer was already fetched
            if not invoice_data:
                # Get customer info from assignment payload
                customer_id = assignment_data.get('customer_id')
                if customer_id:
                    customer = db.query(models.Customer).filter(
                        models.Customer.customer_id == customer_id,
                        models.Customer.org_id == principal.org_id
                    ).first()
                    if customer:
                        invoice_data = {
                            'invoice_id': invoice_id,
                            'invoice_no': invoice_id[:8],  # Use first 8 chars as invoice number
                            'customer_id': customer_id,
                            'customer_name': customer.company_name or customer.name or 'Unknown',
                            'customer_phone': customer.phone,
                            'customer_address': customer.address,
                            'totals': {'total': 0},  # No amount data available
                            'delivery_address': customer.address
                        }
                    else:
                        # No customer found, skip this assignment
                        continue
                else:
                    # No customer_id in assignment, skip
                    continue
            
            # Get rider information
            rider = None
            if rider_user_id:
                rider = db.query(models.User).filter(
                    models.User.user_id == rider_user_id,
                    models.User.org_id == principal.org_id
                ).first()
            
            # Get delivery information for coordinates
            delivery = db.query(models.Delivery).filter(
                models.Delivery.order_id == invoice_id,
                models.Delivery.org_id == principal.org_id
            ).first()
            
            # Get shipment provider information
            shipment_provider = None
            tracking_number = None
            shipment_logs = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == principal.org_id,
                models.SyncLog.type.in_(['invoice_shipment_assigned', 'invoice_shipment_updated'])
            ).all()
            
            for slog in shipment_logs:
                try:
                    sdata = json.loads(slog.payload or '{}')
                    if sdata.get('invoice_id') == invoice_id:
                        provider_id = sdata.get('shipment_provider_id')
                        tracking_number = sdata.get('tracking_number')
                        if provider_id:
                            provider = db.query(models.ShipmentProvider).filter(
                                models.ShipmentProvider.provider_id == provider_id
                            ).first()
                            if provider:
                                shipment_provider = provider.name
                        break
                except:
                    continue
            
            # Get all status timestamps
            accepted_at = None
            in_transit_at = None
            delivered_at = None
            completed_at = None
            estimated_minutes = None  # Estimated delivery time from rider acceptance
            pickup_location = None
            delivery_location = None
            payment_info = None
            pod_image_url = None
            
            status_logs = db.query(models.SyncLog).filter(
                models.SyncLog.org_id == principal.org_id
            ).order_by(models.SyncLog.created_at).all()
            
            current_status = 'assigned'
            
            print(f"DEBUG: Starting status loop for invoice {invoice_id}")
            
            # Get invoice_no for this invoice (for matching old POD uploads)
            invoice_no_for_match = invoice_data.get('invoice_no')
            
            for log in status_logs:
                try:
                    log_data = json.loads(log.payload or '{}')
                    log_invoice_id = log_data.get('invoice_id')
                    
                    # For POD uploads, also check invoice_no (for backwards compatibility)
                    if log.type == 'pod_image_uploaded':
                        if log_invoice_id == invoice_id or log_invoice_id == invoice_no_for_match:
                            pod_image_url = log_data.get('image_url')
                            print(f"DEBUG: Found POD - log_invoice_id: {log_invoice_id}, invoice_id: {invoice_id}, invoice_no: {invoice_no_for_match}, image_url: {pod_image_url}")
                            continue  # Skip other checks for POD logs
                    
                    if log_invoice_id != invoice_id:
                        continue
                    
                    # Debug: check what's being processed
                    if log.type in ['delivery_completed', 'rider_delivery_started', 'rider_order_accepted']:
                        print(f"DEBUG: Processing {log.type} for invoice {invoice_id}, current_status before: {current_status}")
                    
                    if log.type == 'rider_order_accepted':
                        accepted_at = log_data.get('accepted_at') or log.created_at.isoformat() + 'Z'
                        estimated_minutes = log_data.get('estimated_minutes')  # Get estimated delivery time
                        if current_status == 'assigned':  # Only update if still in assigned state
                            current_status = 'accepted'
                    elif log.type == 'rider_delivery_started':
                        in_transit_at = log_data.get('started_at') or log.created_at.isoformat() + 'Z'
                        pickup_location = log_data.get('location')
                        if current_status in ['assigned', 'accepted']:  # Only update if not yet in_transit or completed
                            current_status = 'in_transit'
                        print(f"DEBUG: Setting status to in_transit for invoice {invoice_id}, log created at {log.created_at}")
                    elif log.type == 'delivery_completed':
                        delivered_at = log_data.get('completed_at') or log.created_at.isoformat() + 'Z'
                        completed_at = delivered_at
                        delivery_location = log_data.get('location')
                        payment_info = log_data.get('payment')
                        current_status = 'completed'  # Always set to completed - this is final
                        print(f"DEBUG: Setting status to completed for invoice {invoice_id}, log created at {log.created_at}")
                except Exception as e:
                    print(f"DEBUG: Error processing log: {e}")
                    continue
            
            # Apply status filter
            if status and current_status != status:
                continue
            
            # Apply date filters
            created_at_str = assignment.created_at.isoformat() + 'Z'
            if from_date:
                try:
                    from_dt = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
                    created_dt = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                    if created_dt < from_dt:
                        continue
                except:
                    pass
            
            if to_date:
                try:
                    to_dt = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
                    created_dt = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                    if created_dt > to_dt:
                        continue
                except:
                    pass
            
            # Get customer info (if not already fetched above)
            if not customer:
                customer_id = assignment_data.get('customer_id')
                if customer_id:
                    customer = db.query(models.Customer).filter(
                        models.Customer.customer_id == customer_id,
                        models.Customer.org_id == principal.org_id
                    ).first()
            
            # Apply B2B logic for customer name
            if customer:
                if customer.company_name and (not customer.name or (customer.ctype and customer.ctype.upper() == 'B2B')):
                    customer_name = customer.company_name
                elif customer.name:
                    customer_name = customer.name
                elif customer.company_name:
                    customer_name = customer.company_name
                else:
                    customer_name = invoice_data.get('customer_name', 'Unknown Customer')
            else:
                customer_name = invoice_data.get('customer_name', 'Unknown Customer')
            
            customer_phone = customer.phone if customer else invoice_data.get('customer_phone')
            customer_address = customer.address if customer else invoice_data.get('customer_address')
            
            # Get shipping address from shipment if available
            shipping_address = None
            for slog in shipment_logs:
                try:
                    sdata = json.loads(slog.payload or '{}')
                    if sdata.get('invoice_id') == invoice_id:
                        shipping_address = sdata.get('shipping_address')
                        if shipping_address:
                            break
                except:
                    pass
            
            delivery_address = shipping_address or customer_address or invoice_data.get('delivery_address', '')
            
            # Set delivery_location from Delivery table if not already set from delivery_completed log
            if not delivery_location and delivery and delivery.latitude and delivery.longitude:
                try:
                    delivery_location = {
                        'lat': float(delivery.latitude),
                        'lng': float(delivery.longitude)
                    }
                    print(f"DEBUG: Set delivery_location from Delivery table for {invoice_id}: {delivery_location}")
                except (ValueError, TypeError) as e:
                    print(f"DEBUG: Error parsing delivery coordinates for {invoice_id}: {e}")
            
            # Calculate distance if both locations are available
            distance_km = None
            if pickup_location and delivery_location:
                try:
                    from math import radians, cos, sin, asin, sqrt
                    
                    # Haversine formula to calculate distance between two lat/lng points
                    lat1, lon1 = pickup_location.get('lat'), pickup_location.get('lng')
                    lat2, lon2 = delivery_location.get('lat'), delivery_location.get('lng')
                    
                    if lat1 and lon1 and lat2 and lon2:
                        # Convert to radians
                        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
                        
                        # Haversine formula
                        dlat = lat2 - lat1
                        dlon = lon2 - lon1
                        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                        c = 2 * asin(sqrt(a))
                        
                        # Radius of earth in kilometers
                        r = 6371
                        distance_km = round(c * r, 2)
                        print(f"DEBUG: Calculated distance for {invoice_id}: {distance_km} km")
                except Exception as e:
                    print(f"Error calculating distance: {e}")
                    distance_km = None
            else:
                print(f"DEBUG: Cannot calculate distance for {invoice_id} - pickup_location: {pickup_location is not None}, delivery_location: {delivery_location is not None}")
            
            orders.append({
                'invoice_id': invoice_id,
                'invoice_no': invoice_data.get('invoice_no', invoice_id),
                'order_id': invoice_data.get('invoice_no', invoice_id),
                'customer_name': customer_name,
                'customer_phone': customer_phone,
                'delivery_address': delivery_address,
                'amount': invoice_data.get('totals', {}).get('total', 0),
                'rider_name': rider.name if rider else None,
                'rider_email': rider.email if rider else None,
                'rider_phone': rider.cellnumber if rider else None,
                'shipment_provider': shipment_provider,
                'tracking_number': tracking_number,
                'status': current_status,
                'created_at': created_at_str,
                'assigned_at': assignment_data.get('assigned_at') or created_at_str,
                'accepted_at': accepted_at,
                'estimated_minutes': estimated_minutes,  # Add estimated delivery time
                'distance_km': distance_km,  # Add calculated distance
                'in_transit_at': in_transit_at,
                'delivered_at': delivered_at,
                'completed_at': completed_at,
                'pickup_location': pickup_location,
                'delivery_location': delivery_location,
                'payment_method': payment_info.get('method') if payment_info else None,
                'payment_details': payment_info if payment_info else None,
                'pod_image_url': pod_image_url,
                'delivery_notes': None,
                'created_by': created_by
            })
        except Exception as e:
            print(f"Error processing assignment: {e}")
            continue
    
    # Calculate summary statistics
    total_orders = len(orders)
    completed_orders = len([o for o in orders if o['status'] == 'completed'])
    in_transit_orders = len([o for o in orders if o['status'] == 'in_transit'])
    assigned_orders = len([o for o in orders if o['status'] == 'assigned'])
    
    total_amount = sum(o['amount'] for o in orders)
    completed_amount = sum(o['amount'] for o in orders if o['status'] == 'completed')
    
    # Group by rider
    riders_stats = {}
    for order in orders:
        rider_email = order.get('rider_email')
        if rider_email:
            if rider_email not in riders_stats:
                riders_stats[rider_email] = {
                    'rider_name': order.get('rider_name'),
                    'rider_email': rider_email,
                    'total_assigned': 0,
                    'completed': 0,
                    'in_transit': 0,
                    'amount_delivered': 0
                }
            riders_stats[rider_email]['total_assigned'] += 1
            if order['status'] == 'completed':
                riders_stats[rider_email]['completed'] += 1
                riders_stats[rider_email]['amount_delivered'] += order['amount']
            elif order['status'] == 'in_transit':
                riders_stats[rider_email]['in_transit'] += 1
    
    return {
        'orders': orders,
        'summary': {
            'total_orders': total_orders,
            'completed_orders': completed_orders,
            'in_transit_orders': in_transit_orders,
            'assigned_orders': assigned_orders,
            'total_amount': total_amount,
            'completed_amount': completed_amount
        },
        'riders': list(riders_stats.values())
    }


@router.get("/admin/orders/audit/{invoice_id}", response_model=Dict[str, Any])
def get_order_audit_detail(
    invoice_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Get detailed audit trail for a specific order including all timestamps and locations.
    """
    # Check permissions
    allowed_roles = ['admin', 'owner', 'superadmin', 'manager']
    if (principal.role or '').lower() not in allowed_roles:
        raise HTTPException(status_code=403, detail='Only admins can access order audit')
    
    # Get all logs related to this invoice
    all_logs = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id
    ).order_by(models.SyncLog.created_at.asc()).all()
    
    timeline = []
    invoice_data = {}
    rider_user_id = None
    
    for log in all_logs:
        try:
            log_data = json.loads(log.payload or '{}')
            
            # Get invoice data
            if log.type == 'invoice_draft' and log_data.get('invoice_id') == invoice_id:
                invoice_data = log_data
            
            # Track all events for this invoice
            if log_data.get('invoice_id') == invoice_id:
                event_type = log.type
                event_time = log.created_at.isoformat() + 'Z'
                
                if event_type == 'invoice_rider_assigned':
                    rider_user_id = log_data.get('rider_user_id')
                    timeline.append({
                        'event': 'Order Assigned to Rider',
                        'timestamp': event_time,
                        'details': {
                            'rider_user_id': rider_user_id
                        }
                    })
                elif event_type == 'rider_order_accepted':
                    timeline.append({
                        'event': 'Order Accepted by Rider',
                        'timestamp': log_data.get('accepted_at') or event_time,
                        'details': {}
                    })
                elif event_type == 'rider_order_rejected':
                    timeline.append({
                        'event': 'Order Rejected by Rider',
                        'timestamp': log_data.get('rejected_at') or event_time,
                        'details': {}
                    })
                elif event_type == 'rider_delivery_started':
                    timeline.append({
                        'event': 'Delivery Started (In Transit)',
                        'timestamp': log_data.get('started_at') or event_time,
                        'details': {
                            'pickup_location': log_data.get('location')
                        }
                    })
                elif event_type == 'rider_location_update':
                    timeline.append({
                        'event': 'Location Update',
                        'timestamp': log_data.get('timestamp') or event_time,
                        'details': {
                            'location': log_data.get('location')
                        }
                    })
                elif event_type == 'delivery_completed':
                    timeline.append({
                        'event': 'Delivery Completed',
                        'timestamp': log_data.get('completed_at') or event_time,
                        'details': {
                            'delivery_location': log_data.get('location'),
                            'payment': log_data.get('payment')
                        }
                    })
                elif event_type == 'invoice_shipment_assigned':
                    timeline.append({
                        'event': 'Shipment Provider Assigned',
                        'timestamp': event_time,
                        'details': {
                            'provider_id': log_data.get('shipment_provider_id'),
                            'tracking_number': log_data.get('tracking_number'),
                            'shipping_address': log_data.get('shipping_address')
                        }
                    })
        except:
            continue
    
    if not invoice_data:
        raise HTTPException(status_code=404, detail='Order not found')
    
    # Get rider details
    rider = None
    if rider_user_id:
        rider = db.query(models.User).filter(
            models.User.user_id == rider_user_id,
            models.User.org_id == principal.org_id
        ).first()
    
    return {
        'invoice_id': invoice_id,
        'invoice_no': invoice_data.get('invoice_no', invoice_id),
        'customer_name': invoice_data.get('customer_name'),
        'amount': invoice_data.get('totals', {}).get('total', 0),
        'items': invoice_data.get('items', []),
        'rider': {
            'name': rider.name if rider else None,
            'email': rider.email if rider else None,
            'phone': rider.cellnumber if rider else None
        } if rider else None,
        'timeline': timeline
    }
