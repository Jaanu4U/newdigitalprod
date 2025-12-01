'use client';

import { useEffect, useRef, useState } from 'react';

interface OrderTrackingMapProps {
  pickupLocation?: { lat: number; lng: number } | null;
  deliveryLocation?: { lat: number; lng: number } | null;
  riderLocation?: { lat: number; lng: number; timestamp: string } | null;
  status?: string;
}

declare global {
  interface Window {
    google: any;
  }
}

export default function OrderTrackingMap({
  pickupLocation,
  deliveryLocation,
  riderLocation,
  status
}: OrderTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');

  // Fetch API key from backend
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    fetch('/api/maps-key', {
      headers: token ? {
        'Authorization': `Bearer ${token}`
      } : {}
    })
      .then(res => res.json())
      .then(data => {
        if (data.api_key) {
          setApiKey(data.api_key);
        } else {
          // Fallback to hardcoded key if backend doesn't provide one
          setApiKey('AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0');
        }
      })
      .catch(() => {
        // Fallback to hardcoded key on error
        setApiKey('AIzaSyDJVgqPI6Gbu1YXxMBZnJazQ43r7O9nmv0');
      });
  }, []);

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey) return; // Wait for API key
    
    if (typeof window !== 'undefined' && !(window as any).google) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.defer = true;
      script.onload = () => setIsLoaded(true);
      document.head.appendChild(script);
    } else if ((window as any).google) {
      setIsLoaded(true);
    }
  }, [apiKey]);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || map) return;

    const bounds = new window.google.maps.LatLngBounds();
    const locations = [pickupLocation, deliveryLocation, riderLocation].filter(Boolean);
    
    if (locations.length === 0) return;

    const centerLocation = riderLocation || deliveryLocation || pickupLocation;
    if (!centerLocation) return;

    const newMap = new window.google.maps.Map(mapRef.current, {
      center: { lat: centerLocation.lat, lng: centerLocation.lng },
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    setMap(newMap);

    // Extend bounds for all locations
    locations.forEach(loc => {
      if (loc) bounds.extend(new window.google.maps.LatLng(loc.lat, loc.lng));
    });

    if (locations.length > 1) {
      newMap.fitBounds(bounds, 50);
    }
  }, [isLoaded, mapRef.current]);

  // Update markers when locations change
  useEffect(() => {
    if (!map || !isLoaded) return;

    console.log('🗺️ OrderTrackingMap - Updating markers:', {
      hasPickup: !!pickupLocation,
      hasDelivery: !!deliveryLocation,
      hasRider: !!riderLocation,
      status,
      pickup: pickupLocation,
      delivery: deliveryLocation,
      rider: riderLocation
    });
    
    if (riderLocation) {
      console.log('✅ Rider location data available:', riderLocation);
    } else {
      console.log('⚠️ No rider location data');
    }

    // Clear existing markers, polylines, and circles
    markers.forEach((marker: any) => {
      if (marker.setMap) {
        marker.setMap(null);
      }
    });
    // Clean up polylines and circles
    if ((markers as any).polyline) {
      (markers as any).polyline.setMap(null);
    }
    if ((markers as any).circle) {
      (markers as any).circle.setMap(null);
    }
    if ((markers as any).directionsRenderer) {
      (markers as any).directionsRenderer.setMap(null);
    }
    const newMarkers: any[] = [];

    // Check if locations are the same
    const isSameLocation = pickupLocation && deliveryLocation &&
      Math.abs(pickupLocation.lat - deliveryLocation.lat) < 0.0001 && 
      Math.abs(pickupLocation.lng - deliveryLocation.lng) < 0.0001;

    // Add pickup marker
    if (pickupLocation) {
      // Slightly offset pickup marker if same location
      const pickupPos = isSameLocation
        ? { lat: pickupLocation.lat - 0.00005, lng: pickupLocation.lng - 0.00005 }
        : { lat: pickupLocation.lat, lng: pickupLocation.lng };
        
      const pickupMarker = new window.google.maps.Marker({
        position: pickupPos,
        map: map,
        title: 'Pickup Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        label: {
          text: 'P',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 'bold',
        },
      });

      const pickupInfo = new window.google.maps.InfoWindow({
        content: `<div style="padding: 8px;">
          <strong style="color: #3B82F6;">📍 Pickup Location</strong>
          <p style="margin: 4px 0 0 0; font-size: 12px;">
            ${pickupLocation.lat.toFixed(6)}, ${pickupLocation.lng.toFixed(6)}
          </p>
          ${isSameLocation ? '<p style="margin: 4px 0 0 0; font-size: 11px; color: #666;">⚠️ Same as delivery</p>' : ''}
        </div>`,
      });

      pickupMarker.addListener('click', () => {
        pickupInfo.open(map, pickupMarker);
      });

      newMarkers.push(pickupMarker);
    }

    // Add delivery marker
    if (deliveryLocation) {
      // Slightly offset delivery marker if same location
      const deliveryPos = isSameLocation
        ? { lat: deliveryLocation.lat + 0.00005, lng: deliveryLocation.lng + 0.00005 }
        : { lat: deliveryLocation.lat, lng: deliveryLocation.lng };
        
      const deliveryMarker = new window.google.maps.Marker({
        position: deliveryPos,
        map: map,
        title: 'Delivery Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#10B981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        label: {
          text: 'D',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 'bold',
        },
      });

      const deliveryInfo = new window.google.maps.InfoWindow({
        content: `<div style="padding: 8px;">
          <strong style="color: #10B981;">🎯 Delivery Location</strong>
          <p style="margin: 4px 0 0 0; font-size: 12px;">
            ${deliveryLocation.lat.toFixed(6)}, ${deliveryLocation.lng.toFixed(6)}
          </p>
          ${isSameLocation ? '<p style="margin: 4px 0 0 0; font-size: 11px; color: #666;">⚠️ Same as pickup</p>' : ''}
        </div>`,
      });

      deliveryMarker.addListener('click', () => {
        deliveryInfo.open(map, deliveryMarker);
      });

      newMarkers.push(deliveryMarker);
    }

    // Add rider marker (animated for in_transit)
    if (riderLocation) {
      const riderMarker = new window.google.maps.Marker({
        position: { lat: riderLocation.lat, lng: riderLocation.lng },
        map: map,
        title: 'Rider Current Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: status === 'in_transit' ? '#F59E0B' : '#6B7280',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        label: {
          text: '🚚',
          fontSize: '16px',
        },
        animation: status === 'in_transit' ? window.google.maps.Animation.BOUNCE : undefined,
      });

      const updateTime = new Date(riderLocation.timestamp).toLocaleString();
      const riderInfo = new window.google.maps.InfoWindow({
        content: `<div style="padding: 8px;">
          <strong style="color: #F59E0B;">🚚 Rider Location</strong>
          <p style="margin: 4px 0 0 0; font-size: 12px;">
            ${riderLocation.lat.toFixed(6)}, ${riderLocation.lng.toFixed(6)}
          </p>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #666;">
            Updated: ${updateTime}
          </p>
        </div>`,
      });

      riderMarker.addListener('click', () => {
        riderInfo.open(map, riderMarker);
      });

      newMarkers.push(riderMarker);

      // Center on rider if in transit
      if (status === 'in_transit') {
        map.panTo({ lat: riderLocation.lat, lng: riderLocation.lng });
      }
    }

    // Draw route line if we have pickup, delivery, and rider
    if (pickupLocation && deliveryLocation && riderLocation && status === 'in_transit') {
      console.log('🚗 Drawing in-transit route with rider location');
      
      // Use Directions API to show route from pickup to delivery via rider's waypoint
      const directionsService = new window.google.maps.DirectionsService();
      const directionsRenderer = new window.google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true, // We already have our own markers
        polylineOptions: {
          strokeColor: '#F59E0B', // Orange for in-transit
          strokeOpacity: 0.8,
          strokeWeight: 5,
        },
      });

      const request = {
        origin: { lat: pickupLocation.lat, lng: pickupLocation.lng },
        destination: { lat: deliveryLocation.lat, lng: deliveryLocation.lng },
        waypoints: [{
          location: { lat: riderLocation.lat, lng: riderLocation.lng },
          stopover: false // Don't require stopping at rider location
        }],
        travelMode: window.google.maps.TravelMode.DRIVING,
      };

      directionsService.route(request, (result: any, status: any) => {
        if (status === 'OK' && result) {
          directionsRenderer.setDirections(result);
          console.log('✅ In-transit route rendered via rider location');
          const leg1 = result.routes[0]?.legs[0]; // pickup to rider
          const leg2 = result.routes[0]?.legs[1]; // rider to delivery
          console.log('Distance to rider:', leg1?.distance?.text);
          console.log('Distance to delivery:', leg2?.distance?.text);
        } else {
          console.error('❌ Directions request failed:', status);
          // Fallback to straight line
          const routePath = [
            { lat: pickupLocation.lat, lng: pickupLocation.lng },
            { lat: riderLocation.lat, lng: riderLocation.lng },
            { lat: deliveryLocation.lat, lng: deliveryLocation.lng },
          ];
          const routeLine = new window.google.maps.Polyline({
            path: routePath,
            geodesic: true,
            strokeColor: '#F59E0B',
            strokeOpacity: 0.7,
            strokeWeight: 3,
            map: map,
          });
          (newMarkers as any).polyline = routeLine;
        }
      });

      (newMarkers as any).directionsRenderer = directionsRenderer;
    } else if (pickupLocation && deliveryLocation) {
      console.log('📍 Drawing route line (pickup -> delivery)');
      console.log('Pickup coords:', pickupLocation);
      console.log('Delivery coords:', deliveryLocation);
      console.log('Is same location?', isSameLocation);
      
      // Check if locations are the same
      if (isSameLocation) {
        console.log('⚠️ Pickup and delivery are at same location - drawing offset route');
        // Draw line between offset markers
        const routePath = [
          { lat: pickupLocation.lat - 0.00005, lng: pickupLocation.lng - 0.00005 },
          { lat: deliveryLocation.lat + 0.00005, lng: deliveryLocation.lng + 0.00005 },
        ];

        console.log('Route path:', routePath);

        const routeLine = new window.google.maps.Polyline({
          path: routePath,
          geodesic: true,
          strokeColor: '#F59E0B',
          strokeOpacity: 0.6,
          strokeWeight: 3,
          map: map,
        });

        (newMarkers as any).polyline = routeLine;
        console.log('✅ Polyline created');
        
        // Also draw a circle to indicate the area
        const circle = new window.google.maps.Circle({
          strokeColor: '#94A3B8',
          strokeOpacity: 0.4,
          strokeWeight: 1,
          fillColor: '#94A3B8',
          fillOpacity: 0.08,
          map: map,
          center: { lat: pickupLocation.lat, lng: pickupLocation.lng },
          radius: 30, // 30 meters
        });
        (newMarkers as any).circle = circle;
        console.log('✅ Circle created');
      } else {
        console.log('📏 Different locations - fetching route from Google Directions API');
        
        // Use Directions API to get actual road route
        const directionsService = new window.google.maps.DirectionsService();
        const directionsRenderer = new window.google.maps.DirectionsRenderer({
          map: map,
          suppressMarkers: true, // We already have our own markers
          polylineOptions: {
            strokeColor: '#3B82F6',
            strokeOpacity: 0.8,
            strokeWeight: 5,
          },
        });

        const request = {
          origin: { lat: pickupLocation.lat, lng: pickupLocation.lng },
          destination: { lat: deliveryLocation.lat, lng: deliveryLocation.lng },
          travelMode: window.google.maps.TravelMode.DRIVING,
        };

        directionsService.route(request, (result: any, status: any) => {
          if (status === 'OK' && result) {
            directionsRenderer.setDirections(result);
            console.log('✅ Route rendered from Directions API');
            console.log('Distance:', result.routes[0]?.legs[0]?.distance?.text);
            console.log('Duration:', result.routes[0]?.legs[0]?.duration?.text);
          } else {
            console.error('❌ Directions request failed:', status);
            // Fallback to straight line if Directions API fails
            const routePath = [
              { lat: pickupLocation.lat, lng: pickupLocation.lng },
              { lat: deliveryLocation.lat, lng: deliveryLocation.lng },
            ];

            const routeLine = new window.google.maps.Polyline({
              path: routePath,
              geodesic: true,
              strokeColor: '#3B82F6',
              strokeOpacity: 0.8,
              strokeWeight: 4,
              map: map,
            });

            (newMarkers as any).polyline = routeLine;
            console.log('⚠️ Fallback to straight line');
          }
        });

        (newMarkers as any).directionsRenderer = directionsRenderer;
      }
    } else {
      console.log('❌ Cannot draw route - missing locations:', {
        hasPickup: !!pickupLocation,
        hasDelivery: !!deliveryLocation
      });
    }

    setMarkers(newMarkers);

    // Adjust bounds to fit all markers
    if (newMarkers.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      newMarkers.forEach((marker: any) => {
        const pos = marker.getPosition();
        if (pos) bounds.extend(pos);
      });
      map.fitBounds(bounds, 50);
    }

    // Cleanup
    return () => {
      if ((newMarkers as any).polyline) {
        (newMarkers as any).polyline.setMap(null);
      }
    };
  }, [map, pickupLocation, deliveryLocation, riderLocation, status, isLoaded]);

  if (!pickupLocation && !deliveryLocation && !riderLocation) {
    return (
      <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <p className="text-gray-500 text-sm">No location data available</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-96 rounded-lg shadow-lg" />
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-xs space-y-1">
        {pickupLocation && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white"></div>
            <span>Pickup</span>
          </div>
        )}
        {deliveryLocation && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white"></div>
            <span>Delivery</span>
          </div>
        )}
        {riderLocation && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-white"></div>
            <span>Rider {status === 'in_transit' ? '(Live)' : ''}</span>
          </div>
        )}
      </div>
      
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
          <div className="text-center">
            <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
}
