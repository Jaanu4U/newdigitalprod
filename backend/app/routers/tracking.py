from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from datetime import datetime, timedelta, timezone
import json
from typing import Optional
from ..deps import get_current_principal, CurrentPrincipal
import math
from pydantic import BaseModel

router = APIRouter()


class LocationUpdate(BaseModel):
    latitude: float
    longitude: float


@router.post("/rider/update-location")
def update_rider_location(
    location: LocationUpdate,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Rider updates their current GPS location from mobile device.
    This endpoint should be called every 1-2 minutes from the rider's mobile app.
    """
    # Verify the user is a rider
    rider = db.query(models.User).filter(
        models.User.user_id == principal.user_id,
        models.User.role == "Rider"
    ).first()
    
    if not rider:
        raise HTTPException(status_code=403, detail="Only riders can update location")
    
    # Create location log entry
    location_payload = {
        "user_id": principal.user_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    location_log = models.SyncLog(
        org_id=principal.org_id,
        user_id=principal.user_id,
        payload=json.dumps(location_payload),
        type="location",
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(location_log)
    db.commit()
    
    return {
        "status": "success",
        "message": "Location updated successfully",
        "latitude": location.latitude,
        "longitude": location.longitude,
        "timestamp": location_payload["timestamp"]
    }


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two coordinates using Haversine formula.
    Returns distance in kilometers.
    """
    R = 6371  # Earth's radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) *
         math.sin(delta_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distance = R * c
    return distance


def calculate_eta(distance_km: float) -> int:
    """
    Calculate estimated time of arrival in minutes.
    Assumes average speed of 30 km/h in urban areas.
    """
    avg_speed_kmh = 30
    if distance_km <= 0:
        return 0
    
    eta_hours = distance_km / avg_speed_kmh
    eta_minutes = int(eta_hours * 60)
    
    # Add 5 minutes buffer for each delivery
    eta_minutes += 5
    
    return eta_minutes


@router.get("/customer-portal/order/{order_id}/rider-location")
def get_rider_location_for_order(
    order_id: str,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db)
):
    """
    Get real-time rider location for a customer's order.
    Returns rider location, delivery location, distance, and ETA.
    """
    if principal.role != "Customer":
        raise HTTPException(status_code=403, detail="Only customers can access this endpoint")
    
    # Get customer details
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == principal.user_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Find the order - try by ID first, then by order_id/invoice_id in payload
    order_log = None
    
    # Try to find by sync_log ID if order_id is numeric
    try:
        order_log_id = int(order_id)
        order_log = db.query(models.SyncLog).filter(
            models.SyncLog.id == order_log_id,
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type.in_(['invoice', 'invoice_draft', 'customer_purchase_order'])
        ).first()
        
        if order_log:
            payload = json.loads(order_log.payload) if isinstance(order_log.payload, str) else order_log.payload
            if payload.get('customer_id') != customer.customer_id:
                order_log = None
    except ValueError:
        pass
    
    # If not found by ID, search by order_id/invoice_id in payload
    if not order_log:
        all_orders = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type.in_(['invoice', 'invoice_draft', 'customer_purchase_order'])
        ).all()
        
        for log in all_orders:
            try:
                payload = json.loads(log.payload) if isinstance(log.payload, str) else log.payload
                if (payload.get('order_id') == order_id or 
                    payload.get('invoice_id') == order_id or
                    payload.get('invoice_no') == order_id):
                    if payload.get('customer_id') == customer.customer_id:
                        order_log = log
                        break
            except:
                continue
    
    if not order_log:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order_data = json.loads(order_log.payload) if isinstance(order_log.payload, str) else order_log.payload
    
    # Get invoice_id from order_data
    invoice_id = order_data.get('invoice_id') or order_data.get('order_id')
    
    # Check if order has an assigned rider - look in invoice_rider_assigned table
    rider_id = order_data.get('rider_id')  # Try invoice payload first
    
    # If not in invoice, look for rider assignment in sync_log
    if not rider_id and invoice_id:
        assignment_logs = db.query(models.SyncLog).filter(
            models.SyncLog.org_id == principal.org_id,
            models.SyncLog.type == 'invoice_rider_assigned'
        ).all()
        
        for assignment in assignment_logs:
            try:
                assignment_data = json.loads(assignment.payload) if isinstance(assignment.payload, str) else assignment.payload
                if assignment_data.get('invoice_id') == invoice_id:
                    rider_id = assignment_data.get('rider_user_id')
                    break
            except:
                continue
    
    if not rider_id:
        return {
            "status": "no_rider",
            "message": "No rider assigned to this order yet"
        }
    
    # Get rider information
    rider = db.query(models.User).filter(
        models.User.user_id == rider_id,
        models.User.org_id == principal.org_id
    ).first()
    
    if not rider:
        return {
            "status": "rider_not_found",
            "message": "Rider information not available"
        }
    
    # Get latest rider location (within last 30 minutes)
    five_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=30)
    
    # Query all recent location entries
    all_locations = db.query(models.SyncLog).filter(
        models.SyncLog.org_id == principal.org_id,
        models.SyncLog.type.in_(["location", "rider_location_update"]),
        models.SyncLog.created_at >= five_mins_ago
    ).order_by(models.SyncLog.created_at.desc()).all()
    
    # Filter by rider_id in payload
    location_log = None
    for loc in all_locations:
        try:
            loc_payload = json.loads(loc.payload) if isinstance(loc.payload, str) else loc.payload
            # Check both user_id (old format) and rider_user_id (new format)
            if loc_payload.get('user_id') == rider_id or loc_payload.get('rider_user_id') == rider_id:
                location_log = loc
                break
        except:
            continue
    
    if not location_log:
        return {
            "status": "location_unavailable",
            "message": "Rider location not available",
            "rider_name": rider.name,
            "rider_phone": rider.cellnumber
        }
    
    try:
        location_data = json.loads(location_log.payload) if isinstance(location_log.payload, str) else location_log.payload
        
        # Get rider's current location - handle both old and new formats
        rider_lat = location_data.get('latitude')
        rider_lng = location_data.get('longitude')
        
        # If not found, check in 'location' object (rider_location_update format)
        if not rider_lat or not rider_lng:
            loc_obj = location_data.get('location', {})
            rider_lat = loc_obj.get('lat')
            rider_lng = loc_obj.get('lng')
        
        if not rider_lat or not rider_lng:
            return {
                "status": "location_invalid",
                "message": "Invalid rider location data"
            }
        
        # Get pickup location from order
        pickup_lat = order_data.get('pickup_latitude')
        pickup_lng = order_data.get('pickup_longitude')
        
        # Get delivery location from order
        delivery_lat = order_data.get('delivery_latitude')
        delivery_lng = order_data.get('delivery_longitude')
        
        # Calculate distance and ETA if delivery location is available
        distance_km = None
        eta_minutes = None
        
        if delivery_lat and delivery_lng:
            distance_km = calculate_distance(
                float(rider_lat), float(rider_lng),
                float(delivery_lat), float(delivery_lng)
            )
            eta_minutes = calculate_eta(distance_km)
        
        return {
            "status": "success",
            "rider": {
                "rider_id": rider_id,
                "name": rider.name,
                "phone": rider.cellnumber,
                "location": {
                    "latitude": float(rider_lat),
                    "longitude": float(rider_lng),
                    "last_updated": location_log.created_at.isoformat()
                }
            },
            "pickup": {
                "address": order_data.get('pickup_address', order_data.get('customer_address')),
                "latitude": float(pickup_lat) if pickup_lat else None,
                "longitude": float(pickup_lng) if pickup_lng else None
            },
            "delivery": {
                "address": order_data.get('delivery_address'),
                "latitude": float(delivery_lat) if delivery_lat else None,
                "longitude": float(delivery_lng) if delivery_lng else None
            },
            "distance_km": round(distance_km, 2) if distance_km else None,
            "eta_minutes": eta_minutes,
            "order_status": order_data.get('status', 'pending')
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing location data: {str(e)}")
