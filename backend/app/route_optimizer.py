"""
Route Optimization Utility for Delivery Sequencing

Uses multiple algorithms:
1. Simple nearest neighbor for fast optimization
2. Google Maps Distance Matrix API for accurate routing (when available)
3. 2-opt improvement for better results
"""

import math
from typing import List, Dict, Tuple, Optional
import logging
import requests
from .core import settings

logger = logging.getLogger(__name__)


class DeliveryPoint:
    """Represents a delivery location"""
    def __init__(self, delivery_id: str, latitude: float, longitude: float, 
                 address: str, invoice_id: str):
        self.delivery_id = delivery_id
        self.latitude = latitude
        self.longitude = longitude
        self.address = address
        self.invoice_id = invoice_id


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two points using Haversine formula
    Returns distance in kilometers
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
    
    return R * c


def nearest_neighbor_optimization(points: List[DeliveryPoint], 
                                  start_lat: Optional[float] = None,
                                  start_lon: Optional[float] = None) -> List[DeliveryPoint]:
    """
    Simple nearest neighbor TSP approximation
    
    Args:
        points: List of delivery points to optimize
        start_lat: Starting latitude (e.g., warehouse location)
        start_lon: Starting longitude
    
    Returns:
        Optimized list of delivery points
    """
    if not points:
        return []
    
    if len(points) == 1:
        return points
    
    unvisited = points.copy()
    route = []
    
    # Start from specified location or first point
    if start_lat is not None and start_lon is not None:
        current_lat, current_lon = start_lat, start_lon
    else:
        # Start from centroid of all points
        current_lat = sum(p.latitude for p in points) / len(points)
        current_lon = sum(p.longitude for p in points) / len(points)
    
    # Build route using nearest neighbor
    while unvisited:
        # Find nearest unvisited point
        nearest = min(unvisited, 
                     key=lambda p: haversine_distance(current_lat, current_lon, 
                                                      p.latitude, p.longitude))
        route.append(nearest)
        unvisited.remove(nearest)
        current_lat, current_lon = nearest.latitude, nearest.longitude
    
    return route


def two_opt_improvement(route: List[DeliveryPoint], max_iterations: int = 100) -> List[DeliveryPoint]:
    """
    Improve route using 2-opt algorithm
    
    Args:
        route: Initial route to improve
        max_iterations: Maximum number of iterations
    
    Returns:
        Improved route
    """
    if len(route) < 4:
        return route
    
    def route_distance(r: List[DeliveryPoint]) -> float:
        """Calculate total distance of a route"""
        total = 0
        for i in range(len(r) - 1):
            total += haversine_distance(r[i].latitude, r[i].longitude,
                                       r[i+1].latitude, r[i+1].longitude)
        return total
    
    improved = True
    best_route = route.copy()
    best_distance = route_distance(best_route)
    iterations = 0
    
    while improved and iterations < max_iterations:
        improved = False
        iterations += 1
        
        for i in range(1, len(best_route) - 2):
            for j in range(i + 1, len(best_route)):
                if j - i == 1:
                    continue
                
                # Create new route by reversing segment between i and j
                new_route = best_route[:i] + best_route[i:j][::-1] + best_route[j:]
                new_distance = route_distance(new_route)
                
                if new_distance < best_distance:
                    best_route = new_route
                    best_distance = new_distance
                    improved = True
                    break
            
            if improved:
                break
    
    logger.info(f"2-opt improved route over {iterations} iterations")
    return best_route


def optimize_route_google_maps(points: List[DeliveryPoint], 
                               start_lat: Optional[float] = None,
                               start_lon: Optional[float] = None,
                               api_key: Optional[str] = None) -> Optional[List[DeliveryPoint]]:
    """
    Optimize route using Google Maps Distance Matrix API
    
    Args:
        points: List of delivery points
        start_lat: Starting latitude
        start_lon: Starting longitude
        api_key: Google Maps API key
    
    Returns:
        Optimized route or None if API fails
    """
    if not api_key:
        api_key = getattr(settings, 'GOOGLE_MAPS_API_KEY', None)
    
    if not api_key or len(points) > 25:  # Google Maps limit
        logger.warning("Google Maps API not available or too many waypoints")
        return None
    
    try:
        # Build origin and destinations
        if start_lat is not None and start_lon is not None:
            origin = f"{start_lat},{start_lon}"
        else:
            origin = f"{points[0].latitude},{points[0].longitude}"
        
        destinations = "|".join([f"{p.latitude},{p.longitude}" for p in points])
        
        # Call Distance Matrix API
        url = "https://maps.googleapis.com/maps/api/distancematrix/json"
        params = {
            "origins": origin,
            "destinations": destinations,
            "key": api_key,
            "mode": "driving"
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get("status") != "OK":
            logger.warning(f"Google Maps API error: {data.get('status')}")
            return None
        
        # Extract distances and build route using nearest neighbor based on actual road distances
        distances = {}
        for i, element in enumerate(data["rows"][0]["elements"]):
            if element.get("status") == "OK":
                distances[i] = element["distance"]["value"]  # meters
        
        # Build route using distances
        unvisited = list(range(len(points)))
        route = []
        
        while unvisited:
            if not route:
                # Start with nearest to origin
                nearest_idx = min(unvisited, key=lambda idx: distances.get(idx, float('inf')))
            else:
                # Find nearest to last added point
                last_point = route[-1]
                nearest_idx = min(unvisited, 
                                 key=lambda idx: haversine_distance(
                                     last_point.latitude, last_point.longitude,
                                     points[idx].latitude, points[idx].longitude))
            
            route.append(points[nearest_idx])
            unvisited.remove(nearest_idx)
        
        logger.info("Route optimized using Google Maps Distance Matrix API")
        return route
        
    except Exception as e:
        logger.error(f"Google Maps API error: {e}")
        return None


def optimize_delivery_route(points: List[DeliveryPoint],
                           start_lat: Optional[float] = None,
                           start_lon: Optional[float] = None,
                           use_google_maps: bool = True) -> List[DeliveryPoint]:
    """
    Main route optimization function
    
    Tries Google Maps API first, falls back to local optimization
    
    Args:
        points: List of delivery points to optimize
        start_lat: Starting latitude (warehouse/depot)
        start_lon: Starting longitude
        use_google_maps: Whether to try Google Maps API
    
    Returns:
        Optimized list of delivery points
    """
    if not points:
        return []
    
    if len(points) == 1:
        return points
    
    # Try Google Maps first if enabled
    if use_google_maps:
        google_route = optimize_route_google_maps(points, start_lat, start_lon)
        if google_route:
            return google_route
    
    # Fallback to local optimization
    logger.info("Using local route optimization (nearest neighbor + 2-opt)")
    route = nearest_neighbor_optimization(points, start_lat, start_lon)
    
    # Improve with 2-opt if we have enough points
    if len(route) >= 4:
        route = two_opt_improvement(route)
    
    return route


def calculate_route_stats(route: List[DeliveryPoint]) -> Dict[str, any]:
    """
    Calculate statistics for an optimized route
    
    Returns:
        Dict with total_distance_km, estimated_time_minutes, etc.
    """
    if not route:
        return {
            "total_distance_km": 0,
            "estimated_time_minutes": 0,
            "num_stops": 0
        }
    
    total_distance = 0
    for i in range(len(route) - 1):
        total_distance += haversine_distance(
            route[i].latitude, route[i].longitude,
            route[i+1].latitude, route[i+1].longitude
        )
    
    # Rough estimation: 30 km/h average speed + 5 minutes per stop
    estimated_time = (total_distance / 30 * 60) + (len(route) * 5)
    
    return {
        "total_distance_km": round(total_distance, 2),
        "estimated_time_minutes": int(estimated_time),
        "num_stops": len(route),
        "avg_distance_per_stop_km": round(total_distance / len(route), 2) if route else 0
    }
