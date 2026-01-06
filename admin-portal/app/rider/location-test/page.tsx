'use client';

import { useState, useEffect } from 'react';
import { MapPin, Navigation, RefreshCw } from 'lucide-react';

export default function RiderLocationTest() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(false);

  const getCurrentLocation = () => {
    setStatus('Getting location...');
    setError('');
    
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setStatus('');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        setLocation(newLocation);
        setStatus('Location obtained');
        
        // Auto-send if enabled
        if (autoUpdate) {
          sendLocationToServer(newLocation);
        }
      },
      (err) => {
        setError(`Error: ${err.message}`);
        setStatus('');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const sendLocationToServer = async (loc?: { latitude: number; longitude: number }) => {
    const locationToSend = loc || location;
    
    if (!locationToSend) {
      setError('No location available');
      return;
    }

    setStatus('Sending location to server...');
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch('https://api.digitalchain.in/v1/rider/update-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(locationToSend)
      });

      const data = await response.json();

      if (response.ok) {
        setStatus(`✅ Location updated successfully at ${new Date().toLocaleTimeString()}`);
      } else {
        setError(`Failed: ${data.detail || 'Unknown error'}`);
        setStatus('');
      }
    } catch (err) {
      setError(`Network error: ${err}`);
      setStatus('');
    }
  };

  // Auto-update every 2 minutes when enabled
  useEffect(() => {
    if (autoUpdate) {
      const interval = setInterval(() => {
        getCurrentLocation();
      }, 120000); // 2 minutes

      return () => clearInterval(interval);
    }
  }, [autoUpdate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-6 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Navigation className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Rider Location Update</h1>
            <p className="text-sm text-gray-600 mt-2">Update your live location for order tracking</p>
          </div>

          {location && (
            <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <p className="font-semibold text-blue-900">Current Location</p>
              </div>
              <div className="space-y-1 text-sm font-mono">
                <p className="text-gray-700">Lat: {location.latitude.toFixed(6)}</p>
                <p className="text-gray-700">Lng: {location.longitude.toFixed(6)}</p>
              </div>
            </div>
          )}

          {status && (
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <p className="text-sm text-green-800">{status}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={getCurrentLocation}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
            >
              <MapPin className="w-5 h-5" />
              Get My Location
            </button>

            {location && (
              <button
                onClick={() => sendLocationToServer()}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                Send to Server
              </button>
            )}

            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="autoUpdate"
                checked={autoUpdate}
                onChange={(e) => setAutoUpdate(e.target.checked)}
                className="w-5 h-5"
              />
              <label htmlFor="autoUpdate" className="text-sm font-medium text-gray-700">
                Auto-update every 2 minutes
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2">Instructions:</h3>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Click "Get My Location" to fetch GPS coordinates</li>
              <li>Click "Send to Server" to update tracking system</li>
              <li>Enable auto-update for continuous tracking</li>
              <li>Keep this page open while delivering orders</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
