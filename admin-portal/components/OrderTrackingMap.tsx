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

    // Clear existing markers
    markers.forEach((marker: any) => marker.setMap(null));
    const newMarkers: any[] = [];

    // Add pickup marker
    if (pickupLocation) {
      const pickupMarker = new window.google.maps.Marker({
        position: { lat: pickupLocation.lat, lng: pickupLocation.lng },
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
        </div>`,
      });

      pickupMarker.addListener('click', () => {
        pickupInfo.open(map, pickupMarker);
      });

      newMarkers.push(pickupMarker);
    }

    // Add delivery marker
    if (deliveryLocation) {
      const deliveryMarker = new window.google.maps.Marker({
        position: { lat: deliveryLocation.lat, lng: deliveryLocation.lng },
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

      // Store polyline reference to clean up later
      (newMarkers as any).polyline = routeLine;
    } else if (pickupLocation && deliveryLocation) {
      // Draw dotted line between pickup and delivery
      const routePath = [
        { lat: pickupLocation.lat, lng: pickupLocation.lng },
        { lat: deliveryLocation.lat, lng: deliveryLocation.lng },
      ];

      const routeLine = new window.google.maps.Polyline({
        path: routePath,
        geodesic: true,
        strokeColor: '#94A3B8',
        strokeOpacity: 0.5,
        strokeWeight: 2,
        icons: [{
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 3,
          },
          offset: '0',
          repeat: '20px',
        }],
        map: map,
      });

      (newMarkers as any).polyline = routeLine;
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
