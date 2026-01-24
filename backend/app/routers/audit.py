from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..deps import get_current_principal, CurrentPrincipal
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
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
    limit: Optional[int] = Query(100, description="Max number of orders to return (default 100, max 500)"),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    OPTIMIZED: Get comprehensive audit trail of orders with rider, shipment, timing and location details.
    Only accessible by admins and owners.
    """
    # Check permissions
    allowed_roles = ['admin', 'owner', 'superadmin', 'manager']
    if (principal.role or '').lower() not in allowed_roles:
        raise HTTPException(status_code=403, detail='Only admins can access order audit')
    
    # Limit to reasonable range
    limit = min(max(10, limit), 500)
    
    print(f"DEBUG Audit: org_id={principal.org_id}, role={principal.role}, from_date={from_date}, to_date={to_date}, status={status}, rider_id={rider_id}, limit={limit}")
    
    # Build date filter query for assignments
    assignment_query = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'invoice_rider_assigned'
    )
    
    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
            assignment_query = assignment_query.filter(models.SyncLog.created_at >= from_dt)
            print(f"DEBUG: Filtering from_date >= {from_dt}")
        except:
            pass
    
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
            # Add 1 day to include the entire to_date (end of day)
            to_dt = to_dt + timedelta(days=1)
            assignment_query = assignment_query.filter(models.SyncLog.created_at < to_dt)
            print(f"DEBUG: Filtering to_date < {to_dt}")
        except:
            pass
    
    assignments = assignment_query.order_by(models.SyncLog.created_at.desc()).limit(limit * 2).all()
    print(f"DEBUG: Found {len(assignments)} assignments")
    
    # Pre-load all related data to avoid N+1 queries
    invoice_ids = []
    rider_user_ids = set()
    
    for assignment in assignments:
        try:
            assignment_data = json.loads(assignment.payload or '{}')
            invoice_id = assignment_data.get('invoice_id')
            # Support both 'rider_id' (new) and 'rider_user_id' (legacy)
            rider_user_id = assignment_data.get('rider_id') or assignment_data.get('rider_user_id')
            
            if invoice_id:
                invoice_ids.append(invoice_id)
            if rider_user_id:
                rider_user_ids.add(rider_user_id)
        except:
            continue
    
    # Pre-load invoice drafts (batch)
    invoice_drafts = {}
    if invoice_ids:
        drafts = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_draft'
        ).all()
        
        for draft in drafts:
            try:
                ddata = json.loads(draft.payload or '{}')
                inv_id = ddata.get('invoice_id')
                if inv_id in invoice_ids:
                    invoice_drafts[inv_id] = ddata
            except:
                continue
    
    # Pre-load delivery records (batch) to access latest notes and locations
    deliveries_map = {}
    if invoice_drafts:
        delivery_lookup_ids = set()
        for inv_id, draft in invoice_drafts.items():
            if inv_id:
                delivery_lookup_ids.add(str(inv_id))
            invoice_no = draft.get('invoice_no')
            if invoice_no:
                delivery_lookup_ids.add(str(invoice_no))
            order_id_from_draft = draft.get('order_id') or draft.get('invoice_id')
            if order_id_from_draft:
                delivery_lookup_ids.add(str(order_id_from_draft))

        if delivery_lookup_ids:
            lookup_values = list(delivery_lookup_ids)
            delivery_records = db.query(models.Delivery).filter(
                models.Delivery.org_id == principal.org_id,
                or_(
                    models.Delivery.order_id.in_(lookup_values),
                    models.Delivery.delivery_id.in_(lookup_values)
                )
            ).all()

            for record in delivery_records:
                if record.order_id:
                    deliveries_map[str(record.order_id)] = record
                if record.delivery_id:
                    deliveries_map[str(record.delivery_id)] = record

    # Pre-load riders (batch)
    riders_map = {}
    if rider_user_ids:
        riders = db.query(models.User).filter(
            models.User.user_id.in_(rider_user_ids),
            models.User.org_id == principal.org_id
        ).all()
        for r in riders:
            riders_map[r.user_id] = r
    
    # Pre-load all status logs for these invoices (batch)
    status_logs_map = {}
    if invoice_ids:
        status_logs = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type.in_([
                'rider_order_accepted',
                'rider_delivery_started', 
                'delivery_completed',
                'delivery_cancelled',
                'pod_image_uploaded'
            ])
        ).order_by(models.SyncLog.created_at).all()
        
        for log in status_logs:
            try:
                log_data = json.loads(log.payload or '{}')
                log_invoice_id = log_data.get('invoice_id')
                
                if log_invoice_id not in status_logs_map:
                    status_logs_map[log_invoice_id] = []
                status_logs_map[log_invoice_id].append((log.type, log_data, log.created_at))
            except:
                continue
    
    orders = []
    
    for assignment in assignments:
        try:
            assignment_data = json.loads(assignment.payload or '{}')
            invoice_id = assignment_data.get('invoice_id')
            # Support both 'rider_id' (new) and 'rider_user_id' (legacy)
            rider_user_id = assignment_data.get('rider_id') or assignment_data.get('rider_user_id')
            
            if not invoice_id:
                continue
            
            # Apply rider filter
            if rider_id and rider_user_id != rider_id:
                continue
            
            # Get invoice details from pre-loaded map
            invoice_data = invoice_drafts.get(invoice_id)
            if not invoice_data:
                continue  # Skip if invoice was deleted
            
            # Get rider from pre-loaded map
            rider = riders_map.get(rider_user_id) if rider_user_id else None
            
            # Locate delivery record for accessing persisted delivery notes
            delivery_record = None
            possible_delivery_keys = [
                invoice_id,
                invoice_data.get('invoice_no'),
                invoice_data.get('order_id'),
                invoice_data.get('invoice_id'),
                assignment_data.get('delivery_id'),
                assignment_data.get('order_id')
            ]
            for candidate in possible_delivery_keys:
                if candidate is None:
                    continue
                delivery_record = deliveries_map.get(str(candidate))
                if delivery_record:
                    break

            # Process status logs from pre-loaded map
            accepted_at = None
            in_transit_at = None
            delivered_at = None
            completed_at = None
            cancelled_at = None
            cancellation_reason = None
            estimated_minutes = None
            pickup_location = None
            delivery_location = None
            payment_info = None
            pod_image_url = None
            current_status = 'assigned'
            
            invoice_no_for_match = invoice_data.get('invoice_no')
            logs = status_logs_map.get(invoice_id, [])
            
            # Also check POD by invoice_no for backwards compatibility
            if invoice_no_for_match:
                logs.extend(status_logs_map.get(invoice_no_for_match, []))
            
            for log_type, log_data, log_created_at in logs:
                if log_type == 'pod_image_uploaded':
                    pod_image_url = log_data.get('image_url')
                elif log_type == 'rider_order_accepted':
                    accepted_at = log_data.get('accepted_at') or log_created_at.isoformat() + 'Z'
                    estimated_minutes = log_data.get('estimated_minutes')
                    if current_status == 'assigned':
                        current_status = 'accepted'
                elif log_type == 'rider_delivery_started':
                    in_transit_at = log_data.get('started_at') or log_created_at.isoformat() + 'Z'
                    pickup_location = log_data.get('location')
                    if current_status in ['assigned', 'accepted']:
                        current_status = 'in_transit'
                elif log_type == 'delivery_completed':
                    delivered_at = log_data.get('completed_at') or log_created_at.isoformat() + 'Z'
                    completed_at = delivered_at
                    delivery_location = log_data.get('location')
                    payment_info = log_data.get('payment')
                    current_status = 'completed'
                elif log_type == 'delivery_cancelled':
                    cancelled_at = log_data.get('cancelled_at') or log_created_at.isoformat() + 'Z'
                    cancellation_reason = log_data.get('reason')
                    current_status = 'cancelled'
            
            # Apply status filter
            if status and current_status != status:
                continue
            
            delivery_notes_value = None
            if delivery_record and getattr(delivery_record, 'delivery_notes', None):
                delivery_notes_value = delivery_record.delivery_notes
            else:
                delivery_notes_value = invoice_data.get('delivery_notes')

            if not delivery_notes_value:
                delivery_notes_value = cancellation_reason

            # Get customer information from invoice_data
            customer_name = invoice_data.get('customer_name', 'Unknown')
            customer_phone = invoice_data.get('customer_phone')
            delivery_address = invoice_data.get('ship_to_address') or invoice_data.get('customer_address', '')
            
            # Get amount
            totals = invoice_data.get('totals', {})
            amount = totals.get('total') or totals.get('grandTotal') or totals.get('grand_total') or 0.0
            
            # Get timestamps
            created_at_str = assignment.created_at.isoformat() + 'Z' if assignment.created_at else None
            created_by = assignment_data.get('created_by')
            
            # If delivery_location not set from logs, use coordinates from invoice draft
            if not delivery_location:
                delivery_lat = invoice_data.get('delivery_latitude')
                delivery_lng = invoice_data.get('delivery_longitude')

                # Also look for shipping coordinates if delivery coords are missing
                shipping_lat = invoice_data.get('shipping_latitude')
                shipping_lng = invoice_data.get('shipping_longitude')

                if not delivery_lat:
                    delivery_lat = shipping_lat
                if not delivery_lng:
                    delivery_lng = shipping_lng
                if delivery_lat and delivery_lng:
                    try:
                        delivery_location = {
                            'lat': float(delivery_lat),
                            'lng': float(delivery_lng)
                        }
                        print(f"DEBUG: Using delivery coordinates from invoice draft for {invoice_id}")
                    except (ValueError, TypeError):
                        pass

            # If pickup_location not set from logs, use coordinates from invoice draft (pickup/warehouse)
            if not pickup_location:
                pickup_lat = invoice_data.get('pickup_latitude') or invoice_data.get('warehouse_latitude')
                pickup_lng = invoice_data.get('pickup_longitude') or invoice_data.get('warehouse_longitude')

                if pickup_lat and pickup_lng:
                    try:
                        pickup_location = {
                            'lat': float(pickup_lat),
                            'lng': float(pickup_lng)
                        }
                        print(f"DEBUG: Using pickup coordinates from invoice draft for {invoice_id}")
                    except (ValueError, TypeError):
                        pass
            
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
                'amount': amount,
                'rider_name': rider.name if rider else None,
                'rider_email': rider.email if rider else None,
                'rider_phone': rider.cellnumber if rider else None,
                'rider_user_id': rider.user_id if rider else None,  # Add rider_user_id for route map
                'shipment_provider': None,  # Removed - not used in frontend
                'tracking_number': None,  # Removed - not used in frontend
                'status': current_status,
                'created_at': created_at_str,
                'assigned_at': assignment_data.get('assigned_at') or created_at_str,
                'accepted_at': accepted_at,
                'estimated_minutes': estimated_minutes,
                'distance_km': distance_km,
                'in_transit_at': in_transit_at,
                'delivered_at': delivered_at,
                'completed_at': completed_at,
                'cancelled_at': cancelled_at,
                'pickup_location': pickup_location,
                'delivery_location': delivery_location,
                'payment_method': payment_info.get('method') if payment_info else None,
                'payment_details': payment_info if payment_info else None,
                'pod_image_url': pod_image_url,
                'delivery_notes': delivery_notes_value,
                'cancellation_reason': cancellation_reason,
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
                    'rider_user_id': order.get('rider_user_id'),  # Add rider_user_id for route map
                    'total_assigned': 0,
                    'completed': 0,
                    'in_transit': 0,
                    'amount_delivered': 0,
                    'has_optimized_route': False
                }
            riders_stats[rider_email]['total_assigned'] += 1
            if order['status'] == 'completed':
                riders_stats[rider_email]['completed'] += 1
                riders_stats[rider_email]['amount_delivered'] += order['amount']
            elif order['status'] == 'in_transit':
                riders_stats[rider_email]['in_transit'] += 1
    
    # Check for route optimization status from deliveries table
    if rider_user_ids:
        delivery_routes = db.query(
            models.Delivery.assigned_rider_id,
            models.Delivery.route_sequence
        ).filter(
            models.Delivery.assigned_rider_id.in_(rider_user_ids),
            models.Delivery.route_sequence.isnot(None)
        ).all()
        
        # Get rider emails for those with optimized routes
        rider_ids_with_routes = set(r.assigned_rider_id for r in delivery_routes if r.route_sequence is not None)
        if rider_ids_with_routes:
            riders_with_routes = db.query(models.User).filter(
                models.User.user_id.in_(rider_ids_with_routes)
            ).all()
            rider_emails_with_routes = {r.email for r in riders_with_routes}
            
            # Mark riders with optimized routes
            for email, stats in riders_stats.items():
                if email in rider_emails_with_routes:
                    stats['has_optimized_route'] = True
    
    print(f"DEBUG: Returning {len(orders)} orders, summary: {total_orders} total, {completed_orders} completed")
    
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
            
            # Track all events for this invoice (by invoice_id or delivery_id match)
            if log_data.get('invoice_id') == invoice_id or log_data.get('delivery_id') == invoice_id:
                event_type = log.type
                event_time = log.created_at.isoformat() + 'Z'
                
                if event_type == 'invoice_rider_assigned':
                    # Support both 'rider_id' (new) and 'rider_user_id' (legacy)
                    rider_user_id = log_data.get('rider_id') or log_data.get('rider_user_id')
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
                elif event_type == 'delivery_cancelled':
                    timeline.append({
                        'event': 'Delivery Cancelled',
                        'timestamp': log_data.get('cancelled_at') or event_time,
                        'details': {
                            'reason': log_data.get('reason'),
                            'rider_user_id': log_data.get('rider_user_id')
                        }
                    })
                # Payment events
                elif event_type == 'payment_qr_generated':
                    timeline.append({
                        'event': 'Payment QR Generated',
                        'timestamp': event_time,
                        'details': {
                            'amount': log_data.get('amount'),
                            'order_id': log_data.get('order_id'),
                            'payment_id': log_data.get('payment_id'),
                            'gateway_order_id': log_data.get('gateway_order_id'),
                            'expires_at': log_data.get('expires_at')
                        }
                    })
                elif event_type == 'payment_confirmed':
                    timeline.append({
                        'event': 'Payment Confirmed',
                        'timestamp': event_time,
                        'details': {
                            'amount': log_data.get('amount'),
                            'payment_method': log_data.get('payment_method'),
                            'upi_transaction_id': log_data.get('upi_transaction_id'),
                            'upi_ref_id': log_data.get('upi_ref_id'),
                            'payment_id': log_data.get('payment_id'),
                            'gateway_order_id': log_data.get('gateway_order_id'),
                            'gateway_payment_id': log_data.get('gateway_payment_id')
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


@router.get("/admin/orders/audit/{invoice_id}/locations", response_model=Dict[str, Any])
def get_order_location_history(
    invoice_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """Get all location updates for a specific order"""
    
    # Get all location updates for this invoice
    location_logs = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type == 'rider_location_update'
    ).order_by(models.SyncLog.created_at.asc()).all()
    
    locations = []
    for log in location_logs:
        try:
            log_data = json.loads(log.payload or '{}')
            if log_data.get('invoice_id') == invoice_id:
                location_data = log_data.get('location', {})
                locations.append({
                    'latitude': location_data.get('lat'),
                    'longitude': location_data.get('lng'),
                    'timestamp': log_data.get('timestamp') or log.created_at.isoformat(),
                    'rider_user_id': log_data.get('rider_user_id'),
                    'created_at': log.created_at.isoformat()
                })
        except:
            continue
    
    return {
        'invoice_id': invoice_id,
        'total_locations': len(locations),
        'locations': locations
    }
