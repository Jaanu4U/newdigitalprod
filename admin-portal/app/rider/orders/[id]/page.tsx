"use client";
import { useEffect, useState, useRef } from "react";
import { apiBase } from "@/lib/api";
import { withTenantHeaders } from "@/lib/tenant";
import { useRouter } from "next/navigation";
import { MapPin, CreditCard, Banknote, CheckCircle, Smartphone, Camera, Upload, Navigation, Package } from "lucide-react";

interface OrderDetail {
  invoice_id: string;
  invoice_no: string;
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_address?: string;
  totals?: { total?: number };
  status?: string;
  rider_status?: 'assigned' | 'accepted' | 'in_transit' | 'delivered' | 'pending';
  items?: Array<{description: string; qty: number; rate: number; amount: number}>;
  shipping_details?: {
    pickup_address?: string;
    pickup_time?: string;
    delivery_time?: string;
    distance?: string;
    special_instructions?: string;
  };
}

export default function RiderOrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [completing, setCompleting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [riderStatus, setRiderStatus] = useState<'assigned' | 'accepted' | 'in_transit' | 'delivered' | 'pending'>('assigned');
  
  // Payment collection
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [upiId, setUpiId] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  
  // Location
  const [location, setLocation] = useState<{lat: number; lng: number} | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [trackingLocation, setTrackingLocation] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  
  // File uploads
  const [proofImages, setProofImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  // Customer location for map
  const [customerLocation, setCustomerLocation] = useState<{lat: number; lng: number} | null>(null);

  useEffect(() => {
    setMounted(true);
    
    // Load offline data if exists
    const offlineKey = `rider_delivery_${params.id}`;
    const offlineData = localStorage.getItem(offlineKey);
    if (offlineData) {
      try {
        const parsed = JSON.parse(offlineData);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
        if (parsed.upiId) setUpiId(parsed.upiId);
        if (parsed.cardLast4) setCardLast4(parsed.cardLast4);
        if (parsed.cashReceived) setCashReceived(parsed.cashReceived);
      } catch (e) {
        console.error('Failed to load offline data:', e);
      }
    }
    
    return () => {
      // Stop location tracking on unmount
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [params.id, watchId]);

  useEffect(() => {
    if (!mounted) return;
    
    const fetchOrderDetail = async () => {
      try {
        const token = localStorage.getItem('dc_access') || '';
        const base = apiBase();
        
        const res = await fetch(
          `${base}rider/orders/${params.id}`,
          withTenantHeaders({
            headers: { Authorization: `Bearer ${token}` }
          })
        );

        if (res.ok) {
          const data = await res.json();
          setOrder(data);
          setRiderStatus(data.rider_status || 'assigned');
          if (data.totals?.total) {
            setCashReceived(data.totals.total.toString());
          }
          
          // Try to geocode customer address for map
          if (data.customer_address) {
            // For now, set a default location or use geocoding API
            // You can integrate Google Geocoding API here
            setCustomerLocation({ lat: 17.4400, lng: 78.3489 }); // Default Hyderabad
          }
        }
      } catch (e) {
        console.error('Failed to fetch order:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetail();
  }, [params.id, mounted]);

  const getLocation = () => {
    setGettingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setLocation(loc);
          setGettingLocation(false);
          saveOfflineData({ location: loc });
        },
        (error) => {
          console.error('Error getting location:', error);
          let errorMessage = 'Failed to get location. ';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage += 'Please allow location access in your browser settings.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += 'Location information is unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage += 'Location request timed out.';
              break;
            default:
              errorMessage += 'Unknown error occurred.';
          }
          alert(errorMessage + '\n\nYou can enter coordinates manually below.');
          setGettingLocation(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      alert('Geolocation is not supported by your browser. Please enter coordinates manually.');
      setGettingLocation(false);
    }
  };
  
  const useManualLocation = () => {
    const lat = prompt('Enter Latitude (e.g., 17.4400):');
    const lng = prompt('Enter Longitude (e.g., 78.3489):');
    
    if (lat && lng) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        const loc = { lat: parsedLat, lng: parsedLng };
        setLocation(loc);
        saveOfflineData({ location: loc });
      } else {
        alert('Invalid coordinates. Please enter valid numbers.');
      }
    }
  };

  const startLiveTracking = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setTrackingLocation(true);
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setLocation(loc);
        
        // Send live location to server
        sendLiveLocation(loc);
        saveOfflineData({ location: loc });
      },
      (error) => {
        console.error('Error tracking location:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
    setWatchId(id);
  };

  const stopLiveTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setTrackingLocation(false);
    }
  };

  const sendLiveLocation = async (loc: {lat: number; lng: number}) => {
    try {
      const token = localStorage.getItem('dc_access') || '';
      const base = apiBase();
      
      await fetch(
        `${base}rider/update-location`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            invoice_id: order?.invoice_id,
            location: loc,
            timestamp: new Date().toISOString()
          })
        })
      );
    } catch (e) {
      console.error('Failed to send live location:', e);
    }
  };

  const saveOfflineData = (additionalData?: any) => {
    const offlineKey = `rider_delivery_${params.id}`;
    const data = {
      location,
      paymentMethod,
      upiId,
      cardLast4,
      cashReceived,
      timestamp: new Date().toISOString(),
      ...additionalData
    };
    localStorage.setItem(offlineKey, JSON.stringify(data));
  };

  const handleAcceptRide = async () => {
    if (!confirm('Do you want to accept this delivery order?')) {
      return;
    }

    setAccepting(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const base = apiBase();

      const res = await fetch(
        `${base}rider/accept-order`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            invoice_id: order?.invoice_id
          })
        })
      );

      if (res.ok) {
        setRiderStatus('accepted');
        alert('Delivery order accepted! You can now start the delivery.');
        // Refresh order data
        const detailRes = await fetch(
          `${base}rider/orders/${params.id}`,
          withTenantHeaders({
            headers: { Authorization: `Bearer ${token}` }
          })
        );
        if (detailRes.ok) {
          const data = await detailRes.json();
          setOrder(data);
          setRiderStatus(data.rider_status || 'accepted');
        }
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.detail || 'Failed to accept order');
      }
    } catch (e) {
      console.error('Failed to accept order:', e);
      alert('Failed to accept order. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!confirm('Are you sure you want to reject this delivery order? This cannot be undone.')) {
      return;
    }

    setAccepting(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const base = apiBase();

      const res = await fetch(
        `${base}rider/reject-order`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            invoice_id: order?.invoice_id
          })
        })
      );

      if (res.ok) {
        alert('Delivery order rejected. Redirecting to orders list...');
        router.push('/rider/orders');
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.detail || 'Failed to reject order');
      }
    } catch (e) {
      console.error('Failed to reject order:', e);
      alert('Failed to reject order. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleStartDelivery = async () => {
    if (!location) {
      alert('Please capture your current location first');
      return;
    }

    try {
      const token = localStorage.getItem('dc_access') || '';
      const base = apiBase();

      const res = await fetch(
        `${base}rider/start-delivery`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            invoice_id: order?.invoice_id,
            location: location
          })
        })
      );

      if (res.ok) {
        setRiderStatus('in_transit');
        alert('Delivery started! Navigate to customer location.');
      }
    } catch (e) {
      console.error('Failed to start delivery:', e);
    }
  };

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          
          // Calculate new dimensions (max 1920px width/height)
          let width = img.width;
          let height = img.height;
          const maxDimension = 1920;
          
          if (width > height && width > maxDimension) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          } else if (height > maxDimension) {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }
          
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to blob with 0.8 quality (JPEG compression)
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file); // Fallback to original
              }
            },
            'image/jpeg',
            0.8
          );
        };
      };
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Compress images before adding
    const compressedFiles = await Promise.all(
      files.map(file => file.type.startsWith('image/') ? compressImage(file) : Promise.resolve(file))
    );

    // Add to existing files
    const newFiles = [...proofImages, ...compressedFiles];
    setProofImages(newFiles);

    // Create preview URLs
    const newUrls = compressedFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls([...previewUrls, ...newUrls]);
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e);
  };

  const removeImage = (index: number) => {
    const newFiles = proofImages.filter((_, i) => i !== index);
    const newUrls = previewUrls.filter((_, i) => i !== index);
    
    // Revoke the URL to free memory
    URL.revokeObjectURL(previewUrls[index]);
    
    setProofImages(newFiles);
    setPreviewUrls(newUrls);
  };

  const handleComplete = async () => {
    if (!location) {
      alert('Please capture delivery location first');
      return;
    }

    if (paymentMethod === 'upi' && !upiId.trim()) {
      alert('Please enter UPI ID');
      return;
    }

    if (paymentMethod === 'card' && !cardLast4.trim()) {
      alert('Please enter last 4 digits of card');
      return;
    }

    if (paymentMethod === 'cash' && !cashReceived.trim()) {
      alert('Please enter cash amount received');
      return;
    }

    setCompleting(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const base = apiBase();

      // For now, send as JSON (file upload to be implemented later)
      const paymentData: any = {
        method: paymentMethod
      };
      
      if (paymentMethod === 'upi' && upiId) {
        paymentData.upi_id = upiId;
      } else if (paymentMethod === 'card' && cardLast4) {
        paymentData.card_last4 = cardLast4;
      } else if (paymentMethod === 'cash' && cashReceived) {
        paymentData.cash_amount = parseFloat(cashReceived);
      }
      
      const payload = {
        invoice_id: order?.invoice_id || '',
        location: location,
        payment: paymentData
      };

      console.log('Sending complete delivery payload:', JSON.stringify(payload, null, 2));

      const res = await fetch(
        `${base}rider/complete-delivery`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })
      );

      console.log('Response status:', res.status);

      if (res.ok) {
        // Clear offline data on success
        const offlineKey = `rider_delivery_${params.id}`;
        localStorage.removeItem(offlineKey);
        
        alert('Delivery completed successfully!');
        router.push('/rider/orders');
      } else {
        const errorText = await res.text();
        let errorMsg = 'Failed to complete delivery';
        
        try {
          const error = JSON.parse(errorText);
          if (typeof error.detail === 'string') {
            errorMsg = error.detail;
          } else if (error.detail && Array.isArray(error.detail)) {
            errorMsg = error.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
          } else {
            errorMsg = JSON.stringify(error);
          }
        } catch {
          errorMsg = errorText || 'Failed to complete delivery';
        }
        
        console.error('Complete delivery error:', errorText);
        alert(errorMsg);
      }
    } catch (e) {
      console.error('Failed to complete delivery:', e);
      alert(`Error: ${e instanceof Error ? e.message : 'Failed to complete delivery'}`);
    } finally {
      setCompleting(false);
    }
  };

  if (!mounted || loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!order) {
    return <div className="p-6">Order not found</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.push('/rider/orders')}
          className="text-blue-600 hover:underline mb-3 flex items-center gap-1"
        >
          ← Back to Orders
        </button>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{order.invoice_no}</h1>
        <p className="text-gray-600">
          {riderStatus === 'assigned' ? 'Accept and start delivery' : 
           riderStatus === 'accepted' ? 'Ready to deliver' :
           riderStatus === 'in_transit' ? 'Complete delivery and collect payment' :
           'Delivery completed'}
        </p>
      </div>

      {/* Status Timeline */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 rounded-xl shadow-lg p-6 mb-6 text-white">
        <h2 className="font-semibold mb-4 text-lg">Delivery Status</h2>
        <div className="flex items-center justify-between">
          <div className={`flex flex-col items-center ${riderStatus !== 'assigned' ? 'opacity-50' : ''}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              riderStatus === 'assigned' ? 'bg-white text-blue-600' : 'bg-green-500 text-white'
            }`}>
              {riderStatus === 'assigned' ? '1' : '✓'}
            </div>
            <span className="text-xs mt-2 text-center">Assigned</span>
          </div>
          <div className="flex-1 h-1 bg-white/30 mx-2"></div>
          <div className={`flex flex-col items-center ${riderStatus === 'assigned' ? 'opacity-50' : riderStatus !== 'accepted' ? 'opacity-50' : ''}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              riderStatus === 'accepted' ? 'bg-white text-blue-600' : 
              riderStatus === 'in_transit' || riderStatus === 'delivered' ? 'bg-green-500 text-white' : 
              'bg-white/30'
            }`}>
              {riderStatus === 'accepted' ? '2' : riderStatus === 'in_transit' || riderStatus === 'delivered' ? '✓' : '2'}
            </div>
            <span className="text-xs mt-2 text-center">Accepted</span>
          </div>
          <div className="flex-1 h-1 bg-white/30 mx-2"></div>
          <div className={`flex flex-col items-center ${riderStatus !== 'in_transit' && riderStatus !== 'delivered' ? 'opacity-50' : ''}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              riderStatus === 'in_transit' ? 'bg-white text-blue-600' : 
              riderStatus === 'delivered' ? 'bg-green-500 text-white' : 
              'bg-white/30'
            }`}>
              {riderStatus === 'in_transit' ? '3' : riderStatus === 'delivered' ? '✓' : '3'}
            </div>
            <span className="text-xs mt-2 text-center">In Transit</span>
          </div>
          <div className="flex-1 h-1 bg-white/30 mx-2"></div>
          <div className={`flex flex-col items-center ${riderStatus !== 'delivered' ? 'opacity-50' : ''}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              riderStatus === 'delivered' ? 'bg-green-500 text-white' : 'bg-white/30'
            }`}>
              {riderStatus === 'delivered' ? '✓' : '4'}
            </div>
            <span className="text-xs mt-2 text-center">Delivered</span>
          </div>
        </div>
      </div>

      {/* Accept Ride Button - Only show if status is assigned */}
      {riderStatus === 'assigned' && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white">
              <Package size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-orange-900 mb-2">New Delivery Order</h3>
              <p className="text-orange-800 mb-4">
                This order has been assigned to you. Please review the details and accept or reject the delivery.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleAcceptRide}
                  disabled={accepting}
                  className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 rounded-lg hover:from-green-700 hover:to-green-800 transition-all shadow-md hover:shadow-lg disabled:bg-gray-400 flex items-center justify-center gap-2 font-semibold text-lg"
                >
                  <CheckCircle size={24} />
                  {accepting ? 'Processing...' : 'Accept Order'}
                </button>
                <button
                  onClick={handleRejectOrder}
                  disabled={accepting}
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-4 rounded-lg hover:from-red-700 hover:to-red-800 transition-all shadow-md hover:shadow-lg disabled:bg-gray-400 flex items-center justify-center gap-2 font-semibold text-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                  </svg>
                  {accepting ? 'Processing...' : 'Reject Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions for Accepted Orders */}
      {riderStatus === 'accepted' && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white">
              <Navigation size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-blue-900 mb-2">Ready to Start Delivery</h3>
              <p className="text-blue-800 mb-4">
                You've accepted this order. Capture your current location and start the delivery.
              </p>
              {!location ? (
                <div className="space-y-2">
                  <button
                    onClick={getLocation}
                    disabled={gettingLocation}
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all shadow-md hover:shadow-lg disabled:bg-gray-400 flex items-center justify-center gap-2 font-semibold text-lg"
                  >
                    <MapPin size={24} />
                    {gettingLocation ? 'Getting Location...' : 'Capture My Location'}
                  </button>
                  <button
                    onClick={useManualLocation}
                    className="w-full bg-white text-purple-700 border-2 border-purple-300 px-4 py-2 rounded-lg hover:bg-purple-50 transition-all flex items-center justify-center gap-2 font-medium text-sm"
                  >
                    ✏️ Enter Location Manually
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-700 font-medium flex items-center gap-2">
                      <CheckCircle size={16} />
                      Location captured: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    </p>
                  </div>
                  <button
                    onClick={handleStartDelivery}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 font-semibold text-lg"
                  >
                    <Navigation size={24} />
                    Start Delivery (In Transit)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Details */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Package size={20} className="text-blue-600" />
          Order Details
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-3 border-b">
            <span className="text-sm text-gray-600">Customer:</span>
            <span className="font-medium text-gray-900">{order.customer_name || 'N/A'}</span>
          </div>
          {order.customer_phone && (
            <div className="flex items-center justify-between pb-3 border-b">
              <span className="text-sm text-gray-600">Phone:</span>
              <a href={`tel:${order.customer_phone}`} className="font-medium text-blue-600 hover:underline">
                {order.customer_phone}
              </a>
            </div>
          )}
          {order.customer_address && (
            <div className="pb-3 border-b">
              <div className="flex items-start gap-2">
                <MapPin size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-600 mb-1">Delivery Address:</p>
                  <p className="text-sm font-medium text-gray-900">{order.customer_address}</p>
                </div>
              </div>
            </div>
          )}
          {order.delivery_latitude && order.delivery_longitude && (
            <div className="pt-2">
              <button
                onClick={() => {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${order.delivery_latitude},${order.delivery_longitude}`;
                  window.open(url, '_blank');
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 font-medium"
                title={`Get directions to: ${order.delivery_address || `${order.delivery_latitude}, ${order.delivery_longitude}`}`}
              >
                <Navigation size={18} />
                Get Directions to Customer
              </button>
              {order.delivery_address && (
                <p className="text-xs text-gray-500 mt-2 text-center">{order.delivery_address}</p>
              )}
            </div>
          )}
          <div className="pt-3 border-t bg-blue-50 -mx-6 -mb-6 px-6 py-4 rounded-b-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Total Amount:</span>
              <span className="font-bold text-2xl text-blue-600">₹{order.totals?.total?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Shipping Details - Show only if accepted */}
      {riderStatus !== 'assigned' && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 shadow-md p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Shipping & Delivery Details
          </h2>
          <div className="space-y-3">
            {order.shipping_details?.pickup_address && (
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-xs text-green-700 font-semibold mb-1">PICKUP LOCATION</p>
                <p className="text-sm font-medium text-gray-900">{order.shipping_details.pickup_address}</p>
                {order.shipping_details.pickup_time && (
                  <p className="text-xs text-gray-600 mt-2">Expected Pickup: {order.shipping_details.pickup_time}</p>
                )}
              </div>
            )}
            
            {order.customer_address && (
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-xs text-green-700 font-semibold mb-1">DELIVERY LOCATION</p>
                <p className="text-sm font-medium text-gray-900">{order.customer_address}</p>
                {order.shipping_details?.delivery_time && (
                  <p className="text-xs text-gray-600 mt-2">Expected Delivery: {order.shipping_details.delivery_time}</p>
                )}
              </div>
            )}

            {order.shipping_details?.distance && (
              <div className="flex items-center gap-2 bg-white rounded-lg p-3 border border-green-200">
                <Navigation size={16} className="text-green-600" />
                <div>
                  <p className="text-xs text-gray-600">Estimated Distance</p>
                  <p className="text-sm font-bold text-gray-900">{order.shipping_details.distance}</p>
                </div>
              </div>
            )}

            {order.shipping_details?.special_instructions && (
              <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-300">
                <p className="text-xs text-yellow-800 font-semibold mb-2">⚠️ SPECIAL INSTRUCTIONS</p>
                <p className="text-sm text-gray-900">{order.shipping_details.special_instructions}</p>
              </div>
            )}

            {riderStatus === 'accepted' && (
              <button
                onClick={handleStartDelivery}
                disabled={!location}
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg disabled:bg-gray-400 flex items-center justify-center gap-2 font-semibold"
              >
                <Navigation size={20} />
                {!location ? 'Capture Location First' : 'Start Delivery (In Transit)'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Items - Show only if accepted */}
      {riderStatus !== 'assigned' && order.items && order.items.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">Order Items</h2>
          <div className="space-y-3">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center pb-3 border-b last:border-b-0 last:pb-0">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.description}</p>
                  <p className="text-sm text-gray-600">Quantity: {item.qty} × ₹{(item.rate || 0).toFixed(2)}</p>
                </div>
                <p className="font-bold text-gray-900">₹{(item.amount || 0).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Location Capture - Show only if accepted */}
      {riderStatus !== 'assigned' && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <MapPin size={20} className="text-blue-600" />
            Delivery Location
          </h2>
          {location ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
              <p className="text-sm text-green-700 font-medium">
                ✓ Location captured: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={getLocation}
                disabled={gettingLocation}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md disabled:bg-gray-400 font-medium"
              >
                {gettingLocation ? 'Getting Location...' : 'Capture Delivery Location'}
              </button>
              <button
                onClick={useManualLocation}
                className="w-full bg-white text-blue-700 border-2 border-blue-300 px-4 py-2 rounded-lg hover:bg-blue-50 transition-all font-medium text-sm"
              >
                ✏️ Enter Coordinates Manually
              </button>
            </div>
          )}

        {/* Live Location Tracking */}
        <div className="mt-4 pt-4 border-t">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Navigation size={16} />
            Live Location Tracking
          </h3>
          <button
            onClick={trackingLocation ? stopLiveTracking : startLiveTracking}
            className={`w-full py-2 px-4 rounded-md font-medium flex items-center justify-center gap-2 ${
              trackingLocation 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <Navigation size={16} />
            {trackingLocation ? 'Stop Live Tracking' : 'Start Live Tracking'}
          </button>
          {trackingLocation && (
            <p className="mt-2 text-xs text-green-600 text-center animate-pulse">
              🟢 Live tracking active - Updates sent every 30 seconds
            </p>
          )}
        </div>

        {/* Google Maps View */}
        {customerLocation && location && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-semibold mb-2">Route to Customer</h3>
            <div className="w-full h-64 rounded-lg overflow-hidden border bg-gray-100 flex items-center justify-center">
              <p className="text-sm text-gray-600 text-center px-4">
                Map View: {location.lat.toFixed(4)}, {location.lng.toFixed(4)} → {customerLocation.lat.toFixed(4)}, {customerLocation.lng.toFixed(4)}
                <br />
                <span className="text-xs">Add Google Maps API key to view route</span>
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Customer: {order.customer_address}
            </p>
          </div>
        )}
        </div>
      )}

      {/* Proof of Delivery - Show only if in transit */}
      {riderStatus === 'in_transit' && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Camera size={20} />
          Proof of Delivery
        </h2>
        
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <Camera size={18} />
            Take Photo
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 bg-gray-600 text-white py-3 px-4 rounded-md hover:bg-gray-700 flex items-center justify-center gap-2"
          >
            <Upload size={18} />
            Browse Files
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraCapture}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Image Previews */}
        {previewUrls.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Photos ({previewUrls.length})</h3>
            <div className="grid grid-cols-2 gap-3">
              {previewUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Proof ${index + 1}`}
                    className="w-full h-32 object-cover rounded-md border"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      )}

      {/* Payment Collection - Show only if in transit */}
      {riderStatus === 'in_transit' && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 mb-6">
        <h2 className="font-semibold mb-3">Collect Payment</h2>
        
        {/* Payment Method Selection */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            onClick={() => setPaymentMethod('cash')}
            className={`p-3 border rounded-md flex flex-col items-center gap-1 transition-colors ${
              paymentMethod === 'cash' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
            }`}
          >
            <Banknote size={24} />
            <span className="text-sm font-medium">Cash</span>
          </button>
          <button
            onClick={() => setPaymentMethod('upi')}
            className={`p-3 border rounded-md flex flex-col items-center gap-1 transition-colors ${
              paymentMethod === 'upi' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
            }`}
          >
            <Smartphone size={24} />
            <span className="text-sm font-medium">UPI</span>
          </button>
          <button
            onClick={() => setPaymentMethod('card')}
            className={`p-3 border rounded-md flex flex-col items-center gap-1 transition-colors ${
              paymentMethod === 'card' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
            }`}
          >
            <CreditCard size={24} />
            <span className="text-sm font-medium">Card</span>
          </button>
        </div>

        {/* Payment Details */}
        {paymentMethod === 'cash' && (
          <div>
            <label className="block text-sm font-medium mb-1">Cash Received (₹)</label>
            <input
              type="number"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
              placeholder="Enter amount received"
            />
          </div>
        )}

        {paymentMethod === 'upi' && (
          <div>
            <label className="block text-sm font-medium mb-1">UPI ID / Transaction ID</label>
            <input
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
              placeholder="customer@upi or transaction ID"
            />
          </div>
        )}

        {paymentMethod === 'card' && (
          <div>
            <label className="block text-sm font-medium mb-1">Last 4 Digits of Card</label>
            <input
              type="text"
              value={cardLast4}
              onChange={(e) => setCardLast4(e.target.value.slice(0, 4))}
              maxLength={4}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="1234"
            />
          </div>
        )}
        </div>
      )}

      {/* Complete Button - Show only if in transit */}
      {riderStatus === 'in_transit' && (
        <>
          <button
            onClick={handleComplete}
            disabled={completing || !location}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 rounded-lg hover:from-green-700 hover:to-green-800 transition-all shadow-lg hover:shadow-xl disabled:bg-gray-400 flex items-center justify-center gap-2 font-semibold text-lg"
          >
            <CheckCircle size={24} />
            {completing ? 'Completing Delivery...' : 'Complete Delivery & Collect Payment'}
          </button>

          <button
            onClick={() => router.push('/rider/orders')}
            className="w-full mt-3 border-2 border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
