'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { withTenantHeaders } from '@/lib/tenant';
import { apiBase } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';

const OrderTrackingMap = dynamic(() => import('@/components/OrderTrackingMap'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><div className="text-sm text-gray-500">Loading map...</div></div>
});

interface OrderAudit {
  invoice_id: string;
  invoice_no: string;
  order_id: string;
  customer_name: string;
  customer_phone: string | null;
  delivery_address: string;
  amount: number;
  rider_name: string | null;
  rider_email: string | null;
  rider_phone: string | null;
  shipment_provider: string | null;
  tracking_number: string | null;
  status: string;
  created_at: string;
  assigned_at: string | null;
  accepted_at: string | null;
  estimated_minutes: number | null;
  distance_km: number | null;
  in_transit_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  pickup_location: { lat: number; lng: number } | null;
  delivery_location: { lat: number; lng: number } | null;
  payment_method: string | null;
  payment_details: any;
  pod_image_url: string | null;
  delivery_notes: string | null;
  created_by: string | null;
}

interface Summary {
  total_orders: number;
  completed_orders: number;
  in_transit_orders: number;
  assigned_orders: number;
  total_amount: number;
  completed_amount: number;
}

interface RiderStats {
  rider_name: string;
  rider_email: string;
  total_assigned: number;
  completed: number;
  in_transit: number;
  amount_delivered: number;
}

export default function AuditPage() {
  const router = useRouter();
  const base = useMemo(() => apiBase(), []);
  
  const [orders, setOrders] = useState<OrderAudit[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [riders, setRiders] = useState<RiderStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [notification, setNotification] = useState<string>('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [riderFilter, setRiderFilter] = useState<string>('');
  const [shipmentFilter, setShipmentFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('today');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'riders' | 'shipping'>('all');
  const [showCustomDateInputs, setShowCustomDateInputs] = useState<boolean>(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  // Selected order for detail view
  const [selectedOrder, setSelectedOrder] = useState<OrderAudit | null>(null);
  const [orderTimeline, setOrderTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [riderLocation, setRiderLocation] = useState<{ lat: number; lng: number; timestamp: string } | null>(null);
  const [podImageUrl, setPodImageUrl] = useState<string | null>(null);
  const [riderLocations, setRiderLocations] = useState<Map<string, { lat: number; lng: number; timestamp: string }>>(new Map());
  const [mapModalOrder, setMapModalOrder] = useState<OrderAudit | null>(null);
  
  // WebSocket connection
  const { isConnected } = useWebSocket((message) => {
    if (message.type === 'pod_uploaded') {
      const data = message.data;
      setNotification(`POD uploaded for ${data.invoice_no}`);
      setTimeout(() => setNotification(''), 5000);
      
      // Update order in state
      setOrders(prev => prev.map(order => 
        order.invoice_id === data.invoice_id 
          ? { ...order, pod_image_url: data.image_url }
          : order
      ));
      
      // Update selected order if it's the one that got updated
      if (selectedOrder?.invoice_id === data.invoice_id) {
        setSelectedOrder(prev => prev ? { ...prev, pod_image_url: data.image_url } : null);
      }
    }
    
    // Handle order status updates
    if (message.type === 'order_status_update') {
      const data = message.data;
      console.log('📦 Order status update received:', data);
      
      setNotification(`Order ${data.invoice_no} is now ${data.status}`);
      setTimeout(() => setNotification(''), 5000);
      
      // Update order status in state
      setOrders(prev => prev.map(order => {
        if (order.invoice_id === data.invoice_id) {
          const updated = { ...order, status: data.status };
          
          // Update status-specific timestamps
          const now = new Date().toISOString();
          if (data.status === 'accepted') {
            updated.accepted_at = now;
          } else if (data.status === 'in_transit') {
            updated.in_transit_at = now;
          } else if (data.status === 'delivered' || data.status === 'completed') {
            updated.delivered_at = now;
            updated.completed_at = now;
          }
          
          return updated;
        }
        return order;
      }));
      
      // Update selected order if it's the one that got updated
      if (selectedOrder?.invoice_id === data.invoice_id) {
        setSelectedOrder(prev => {
          if (!prev) return null;
          const updated = { ...prev, status: data.status };
          
          const now = new Date().toISOString();
          if (data.status === 'accepted') {
            updated.accepted_at = now;
          } else if (data.status === 'in_transit') {
            updated.in_transit_at = now;
          } else if (data.status === 'delivered' || data.status === 'completed') {
            updated.delivered_at = now;
            updated.completed_at = now;
          }
          
          return updated;
        });
        
        // Reload timeline to show the new status
        if (data.invoice_id) {
          fetchOrderTimeline(data.invoice_id);
        }
      }
    }
    
    // Handle delivery completed
    if (message.type === 'delivery_completed') {
      const data = message.data;
      console.log('✅ Delivery completed:', data);
      
      setNotification(`Order ${data.invoice_no} delivered successfully!`);
      setTimeout(() => setNotification(''), 5000);
      
      // Update order status to completed
      setOrders(prev => prev.map(order => 
        order.invoice_id === data.invoice_id 
          ? { 
              ...order, 
              status: 'completed',
              delivered_at: new Date().toISOString(),
              completed_at: new Date().toISOString()
            }
          : order
      ));
      
      // Update selected order
      if (selectedOrder?.invoice_id === data.invoice_id) {
        setSelectedOrder(prev => prev ? { 
          ...prev, 
          status: 'completed',
          delivered_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        } : null);
        
        // Reload timeline
        if (data.invoice_id) {
          fetchOrderTimeline(data.invoice_id);
        }
      }
    }
    
    // Handle rider location updates
    if (message.type === 'rider_location_update') {
      const data = message.data;
      
      // Update rider locations map for the rider performance table
      if (data.rider_email) {
        setRiderLocations(prev => {
          const newMap = new Map(prev);
          newMap.set(data.rider_email, {
            lat: data.latitude,
            lng: data.longitude,
            timestamp: data.timestamp
          });
          return newMap;
        });
      }
      
      // Update location if viewing this order and rider is in transit
      if (selectedOrder?.invoice_id === data.invoice_id && selectedOrder?.status === 'in_transit') {
        setRiderLocation({
          lat: data.latitude,
          lng: data.longitude,
          timestamp: data.timestamp
        });
      }
    }
  });

  useEffect(() => {
    setMounted(true);
  }, []);
  
  useEffect(() => {
    // Set date range based on preset
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (datePreset === 'custom') {
      setShowCustomDateInputs(true);
      return;
    }
    
    setShowCustomDateInputs(false);
    
    switch (datePreset) {
      case 'today':
        setFromDate(today.toISOString().split('T')[0]);
        setToDate(today.toISOString().split('T')[0]);
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        setFromDate(yesterday.toISOString().split('T')[0]);
        setToDate(yesterday.toISOString().split('T')[0]);
        break;
      case 'this_week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        setFromDate(startOfWeek.toISOString().split('T')[0]);
        setToDate(today.toISOString().split('T')[0]);
        break;
      case 'last_week':
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
        setFromDate(lastWeekStart.toISOString().split('T')[0]);
        setToDate(lastWeekEnd.toISOString().split('T')[0]);
        break;
      case 'this_month':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        setFromDate(startOfMonth.toISOString().split('T')[0]);
        setToDate(today.toISOString().split('T')[0]);
        break;
      case 'last_month':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        setFromDate(lastMonthStart.toISOString().split('T')[0]);
        setToDate(lastMonthEnd.toISOString().split('T')[0]);
        break;
      default:
        break;
    }
  }, [datePreset]);

  useEffect(() => {
    if (mounted) {
      fetchAuditData();
      setCurrentPage(1); // Reset to first page when filters change
    }
  }, [mounted, statusFilter, fromDate, toDate]);

  const fetchAuditData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('dc_access');
      console.log('🔍 Audit page - Token exists:', !!token);
      
      if (!token) {
        console.log('❌ No token found, redirecting to login');
        router.push('/login');
        return;
      }

      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      
      // Note: rider filtering done client-side (backend expects user_id not email)
      // Note: shipment_provider filtering done client-side as backend doesn't support it
      if (fromDate) params.append('from_date', fromDate);
      if (toDate) params.append('to_date', toDate);

      const url = `${base}v1/admin/orders/audit?${params}`;
      console.log('📡 Fetching audit data from:', url);

      const response = await fetch(
        url,
        withTenantHeaders({
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      console.log('📥 Response status:', response.status);

      if (response.status === 401) {
        console.log('🚫 401 Unauthorized - Token invalid, redirecting to login');
        localStorage.removeItem('dc_access');
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', response.status, errorText);

        throw new Error(`Failed to fetch audit data: ${response.status} - ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      console.log('✅ Audit data loaded:', data.orders?.length || 0, 'orders');
      console.log('📦 Orders with POD:', data.orders?.filter((o: any) => o.pod_image_url).length || 0);
      console.log('🔍 Sample order:', data.orders?.[0]);
      setOrders(data.orders || []);
      setSummary(data.summary || null);
      setRiders(data.riders || []);
    } catch (err: any) {
      console.error('💥 Fetch error:', err);
      setError(err.message || 'Failed to load audit data');
    } finally {
      setLoading(false);
    }
  };
  
  // Filter and search orders
  const filteredOrders = useMemo(() => {
    const filtered = orders.filter(order => {
      // Tab-based filtering
      if (activeTab === 'riders' && !order.rider_email) return false;
      if (activeTab === 'shipping' && !order.shipment_provider) return false;
      
      // Status filter
      if (statusFilter && order.status !== statusFilter) return false;
      
      // Rider filter
      if (riderFilter && order.rider_email !== riderFilter) return false;
      
      // Shipping provider filter (client-side)
      if (shipmentFilter && order.shipment_provider !== shipmentFilter) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchableFields = [
          order.invoice_no,
          order.customer_name,
          order.customer_phone,
          order.delivery_address,
          order.rider_name,
          order.rider_email,
          order.tracking_number,
          order.created_by
        ].filter(Boolean).join(' ').toLowerCase();
        
        if (!searchableFields.includes(query)) {
          return false;
        }
      }
      
      return true;
    });
    
    console.log('🔍 Filtering:', {
      activeTab,
      shipmentFilter,
      totalOrders: orders.length,
      filteredCount: filtered.length,
      ordersWithShipping: orders.filter(o => o.shipment_provider).length
    });
    
    return filtered;
  }, [orders, searchQuery, statusFilter, riderFilter, shipmentFilter, activeTab]);
  
  // Paginate orders
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);
  
  // Get unique shipping providers for filter
  const shippingProviders = useMemo(() => {
    const providers = new Set<string>();
    orders.forEach(order => {
      if (order.shipment_provider) {
        providers.add(order.shipment_provider);
      }
    });
    const providerList = Array.from(providers).sort();
    console.log('📦 Shipping providers found:', providerList.length, providerList);
    return providerList;
  }, [orders]);

  const fetchOrderTimeline = async (invoiceId: string) => {
    setLoadingTimeline(true);
    try {
      const token = localStorage.getItem('dc_access');
      const response = await fetch(
        `${base}v1/admin/orders/audit/${invoiceId}`,
        withTenantHeaders({
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      if (response.ok) {
        const data = await response.json();
        setOrderTimeline(data.timeline || []);
      }
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleViewDetails = (order: OrderAudit) => {
    console.log('📋 Viewing order details:', order.invoice_no);
    console.log('🖼️ POD URL:', order.pod_image_url);
    setSelectedOrder(order);
    fetchOrderTimeline(order.invoice_id);
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_transit':
        return 'bg-blue-100 text-blue-800';
      case 'accepted':
        return 'bg-yellow-100 text-yellow-800';
      case 'assigned':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Audit Trail</h1>
              <p className="text-gray-600">
                Complete audit log of all orders with rider, shipment, timing and location details
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                <span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                {isConnected ? 'Live Updates' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Notification Banner */}
        {notification && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-blue-800 font-medium">{notification}</span>
            </div>
            <button onClick={() => setNotification('')} className="text-blue-600 hover:text-blue-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
              <div className="text-sm text-gray-600">Total Orders</div>
              <div className="text-2xl font-bold text-gray-900">{summary.total_orders}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
              <div className="text-sm text-gray-600">Completed</div>
              <div className="text-2xl font-bold text-green-600">{summary.completed_orders}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
              <div className="text-sm text-gray-600">In Transit</div>
              <div className="text-2xl font-bold text-blue-600">{summary.in_transit_orders}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
              <div className="text-sm text-gray-600">Assigned</div>
              <div className="text-2xl font-bold text-yellow-600">{summary.assigned_orders}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
              <div className="text-sm text-gray-600">Total Amount</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_amount)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
              <div className="text-sm text-gray-600">Delivered Amount</div>
              <div className="text-xl font-bold text-green-600">{formatCurrency(summary.completed_amount)}</div>
            </div>
          </div>
        )}

        {/* Rider Stats */}
        {riders.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 mb-6 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Rider Performance</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Rider</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Live Location</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Assigned</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Completed</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">In Transit</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Amount Delivered</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Completion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {riders.map((rider) => {
                    const location = riderLocations.get(rider.rider_email);
                    const isRecent = location && (new Date().getTime() - new Date(location.timestamp).getTime()) < 300000; // 5 minutes
                    
                    return (
                      <tr key={rider.rider_email} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">{rider.rider_name}</div>
                          <div className="text-sm text-gray-500">{rider.rider_email}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {location && isRecent ? (
                            <div className="flex flex-col items-center gap-1">
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors text-xs font-medium"
                              >
                                <div className="relative">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                  </span>
                                </div>
                                Navigate
                              </a>
                              <span className="text-xs text-gray-500" title={new Date(location.timestamp).toLocaleString()}>
                                {new Date(location.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-900">{rider.total_assigned}</td>
                        <td className="py-3 px-4 text-right text-green-600 font-semibold">{rider.completed}</td>
                        <td className="py-3 px-4 text-right text-blue-600">{rider.in_transit}</td>
                        <td className="py-3 px-4 text-right text-gray-900 font-medium">
                          {formatCurrency(rider.amount_delivered)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-700">
                          {rider.total_assigned > 0
                            ? `${Math.round((rider.completed / rider.total_assigned) * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          
          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setActiveTab('all');
                  setRiderFilter('');
                  setShipmentFilter('');
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'all'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                All Orders
              </button>
              <button
                onClick={() => {
                  setActiveTab('riders');
                  setShipmentFilter('');
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'riders'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🚴 Riders
              </button>
              <button
                onClick={() => {
                  setActiveTab('shipping');
                  setRiderFilter('');
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'shipping'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📦 Shipping Services
              </button>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice, customer, rider, tracking..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Date Presets */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
          
          {/* Custom Date Inputs - Show only when Custom is selected */}
          {showCustomDateInputs && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
          
          {/* Filter Dropdowns - Show based on active tab */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="assigned">Assigned</option>
                <option value="accepted">Accepted</option>
                <option value="in_transit">In Transit</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            
            {/* Show Rider filter only in 'all' and 'riders' tabs */}
            {(activeTab === 'all' || activeTab === 'riders') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rider</label>
                <select
                  value={riderFilter}
                  onChange={(e) => setRiderFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Riders</option>
                  {riders.map((rider) => (
                    <option key={rider.rider_email} value={rider.rider_email}>
                      {rider.rider_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Show Shipping filter only in 'all' and 'shipping' tabs */}
            {(activeTab === 'all' || activeTab === 'shipping') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Service</label>
                <select
                  value={shipmentFilter}
                  onChange={(e) => setShipmentFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Services</option>
                  {shippingProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                setStatusFilter('');
                setRiderFilter('');
                setShipmentFilter('');
                setSearchQuery('');
                setDatePreset('today');
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Clear All Filters
            </button>
            <div className="flex-1"></div>
            <div className="text-sm text-gray-600 flex items-center">
              Showing {paginatedOrders.length} of {filteredOrders.length} orders
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              Orders ({filteredOrders.length})
              {searchQuery && <span className="text-sm text-gray-500 font-normal ml-2">- Search results</span>}
            </h2>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <div className="mt-2 text-gray-600">Loading audit data...</div>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-red-600">{error}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              {searchQuery ? 'No orders match your search' : 'No orders found'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order Details</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedOrders.map((order) => (
                    <tr key={order.invoice_id} className="hover:bg-gray-50">
                      {/* Order Details Column */}
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-xs text-gray-600">👤 {order.created_by || '—'}</div>
                          <div className="text-sm font-semibold text-gray-900">{order.invoice_no}</div>
                          <div className="text-xs text-gray-600">📅 {formatDateTime(order.created_at)}</div>
                          {order.rider_name && (
                            <div className="text-xs text-indigo-600">🏍️ {order.rider_name}</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Customer Column */}
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{order.customer_name}</div>
                        {order.customer_phone && (
                          <div className="text-xs text-gray-500">{order.customer_phone}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">{order.delivery_address.slice(0, 40)}...</div>
                      </td>
                      
                      {/* Amount Column */}
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">{formatCurrency(order.amount)}</div>
                        {order.payment_method && (
                          <div className="text-xs text-gray-500 mt-1">💳 {order.payment_method}</div>
                        )}
                      </td>
                      
                      {/* Status Column */}
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div>
                            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(order.status)}`}>
                              {order.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                          {order.distance_km && (
                            <div className="text-xs text-gray-600">📏 {order.distance_km} km</div>
                          )}
                          {order.estimated_minutes && (
                            <div className="text-xs text-gray-600">⏱️ {order.estimated_minutes} min</div>
                          )}
                          {order.tracking_number && (
                            <div className="text-xs text-blue-600">📦 {order.tracking_number}</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Actions Column */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewDetails(order)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {(order.pickup_location || order.delivery_location) && (
                            <button
                              onClick={() => setMapModalOrder(order)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="View Map"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                              </svg>
                            </button>
                          )}
                          {order.pod_image_url && (
                            <button
                              onClick={() => setPodImageUrl(order.pod_image_url)}
                              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="View POD Image"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages} ({filteredOrders.length} total orders)
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    
                    {/* Page numbers */}
                    <div className="flex gap-1">
                      {[...Array(totalPages)].map((_, i) => {
                        const page = i + 1;
                        // Show first, last, current, and 2 pages around current
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 2 && page <= currentPage + 2)
                        ) {
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-1 text-sm border rounded ${
                                currentPage === page
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          );
                        } else if (page === currentPage - 3 || page === currentPage + 3) {
                          return <span key={page} className="px-2 py-1 text-gray-500">...</span>;
                        }
                        return null;
                      })}
                    </div>
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Order Details: {selectedOrder.invoice_no}</h3>
                <button
                  onClick={() => {
                    setSelectedOrder(null);
                    setOrderTimeline([]);
                    setRiderLocation(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Customer Information</h4>
                    <div className="space-y-1">
                      <p className="text-sm"><strong>Name:</strong> {selectedOrder.customer_name}</p>
                      <p className="text-sm"><strong>Phone:</strong> {selectedOrder.customer_phone || '—'}</p>
                      <p className="text-sm"><strong>Address:</strong> {selectedOrder.delivery_address}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Rider & Delivery</h4>
                    <div className="space-y-1">
                      <p className="text-sm"><strong>Rider:</strong> {selectedOrder.rider_name || '—'}</p>
                      <p className="text-sm"><strong>Email:</strong> {selectedOrder.rider_email || '—'}</p>
                      <p className="text-sm"><strong>Phone:</strong> {selectedOrder.rider_phone || '—'}</p>
                      <p className="text-sm"><strong>Provider:</strong> {selectedOrder.shipment_provider || '—'}</p>
                      <p className="text-sm"><strong>Tracking:</strong> {selectedOrder.tracking_number || '—'}</p>
                    </div>
                  </div>
                </div>

                {(selectedOrder.pickup_location || selectedOrder.delivery_location || riderLocation) && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Locations</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedOrder.pickup_location && (
                        <div className="bg-blue-50 p-3 rounded">
                          <p className="text-xs font-semibold text-blue-700">Pickup Location</p>
                          <p className="text-sm text-blue-900">
                            {selectedOrder.pickup_location.lat.toFixed(6)}, {selectedOrder.pickup_location.lng.toFixed(6)}
                          </p>
                        </div>
                      )}
                      {selectedOrder.delivery_location && (
                        <div className="bg-green-50 p-3 rounded">
                          <p className="text-xs font-semibold text-green-700">Delivery Location</p>
                          <p className="text-sm text-green-900">
                            {selectedOrder.delivery_location.lat.toFixed(6)}, {selectedOrder.delivery_location.lng.toFixed(6)}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Live Rider Location */}
                    {riderLocation && selectedOrder.status === 'in_transit' && (
                      <div className="mt-4 bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="relative">
                            <svg className="w-6 h-6 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-orange-900">🚚 Rider Live Location</p>
                            <p className="text-xs text-orange-600">Updated: {new Date(riderLocation.timestamp).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${riderLocation.lat},${riderLocation.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium text-sm transition-colors shadow-lg"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            Track on Map
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${riderLocation.lat}, ${riderLocation.lng}`);
                              setNotification('Location copied to clipboard!');
                              setTimeout(() => setNotification(''), 2000);
                            }}
                            className="px-4 py-2 bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 font-medium text-sm transition-colors"
                          >
                            📋 Copy
                          </button>
                        </div>
                        <p className="text-xs text-orange-700 mt-2 text-center">
                          {riderLocation.lat.toFixed(6)}, {riderLocation.lng.toFixed(6)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selectedOrder.payment_details && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Payment Information</h4>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm"><strong>Method:</strong> {selectedOrder.payment_method}</p>
                      {selectedOrder.payment_details.cash_amount && (
                        <p className="text-sm"><strong>Cash Amount:</strong> {formatCurrency(selectedOrder.payment_details.cash_amount)}</p>
                      )}
                      {selectedOrder.payment_details.upi_id && (
                        <p className="text-sm"><strong>UPI ID:</strong> {selectedOrder.payment_details.upi_id}</p>
                      )}
                      {selectedOrder.payment_details.card_last4 && (
                        <p className="text-sm"><strong>Card:</strong> **** {selectedOrder.payment_details.card_last4}</p>
                      )}
                    </div>
                  </div>
                )}

                {selectedOrder.pod_image_url && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Proof of Delivery</h4>
                    <div className="bg-gray-50 p-3 rounded">
                      <img 
                        src={`https://api.digitalchain.in${selectedOrder.pod_image_url}`}
                        alt="Proof of Delivery" 
                        className="max-w-full h-auto rounded border border-gray-300"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <p className="hidden text-sm text-red-600">Failed to load image</p>
                    </div>
                  </div>
                )}

                {selectedOrder.delivery_notes && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Delivery Notes</h4>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm">{selectedOrder.delivery_notes}</p>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-4">Order Timeline</h4>
                  {loadingTimeline ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="text-sm text-gray-500 mt-2">Loading timeline...</p>
                    </div>
                  ) : orderTimeline.length > 0 ? (
                    <div className="relative">
                      {/* Timeline connector line */}
                      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                      
                      <div className="space-y-6">
                        {orderTimeline.map((event, index) => {
                          // Determine icon and color based on event type
                          const getEventStyle = (eventName: string) => {
                            if (eventName.includes('Assigned')) return { icon: '👤', color: 'bg-blue-500', ring: 'ring-blue-100' };
                            if (eventName.includes('Accepted')) return { icon: '✓', color: 'bg-green-500', ring: 'ring-green-100' };
                            if (eventName.includes('Started') || eventName.includes('Transit')) return { icon: '🚚', color: 'bg-yellow-500', ring: 'ring-yellow-100' };
                            if (eventName.includes('Completed')) return { icon: '🎉', color: 'bg-purple-500', ring: 'ring-purple-100' };
                            return { icon: '•', color: 'bg-gray-400', ring: 'ring-gray-100' };
                          };
                          
                          const style = getEventStyle(event.event);
                          
                          return (
                            <div key={index} className="relative flex gap-4 items-start">
                              {/* Icon circle */}
                              <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full ${style.color} ${style.ring} ring-4 flex-shrink-0`}>
                                <span className="text-white text-lg font-semibold">{style.icon}</span>
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 pt-1">
                                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                  <p className="text-sm font-semibold text-gray-900 mb-1">{event.event}</p>
                                  <p className="text-xs text-gray-500 mb-2">
                                    {formatDateTime(event.timestamp)}
                                  </p>
                                  
                                  {event.details && Object.keys(event.details).length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                      <div className="space-y-2">
                                        {Object.entries(event.details).map(([key, value]) => {
                                          // Format specific fields nicely
                                          if (key === 'pickup_location' || key === 'delivery_location') {
                                            const loc = value as any;
                                            const locationName = key === 'pickup_location' ? 'Pickup Location' : 'Delivery Location';
                                            const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
                                            return (
                                              <div key={key} className="flex items-start gap-2">
                                                <span className="text-xs font-medium text-gray-600 min-w-[120px]">
                                                  {locationName}:
                                                </span>
                                                <a 
                                                  href={googleMapsUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
                                                >
                                                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                  </svg>
                                                  View on Map
                                                </a>
                                              </div>
                                            );
                                          }
                                          if (key === 'payment') {
                                            const payment = value as any;
                                            return (
                                              <div key={key} className="flex items-start gap-2">
                                                <span className="text-xs font-medium text-gray-600 min-w-[120px]">Payment:</span>
                                                <span className="text-xs text-gray-700">
                                                  💰 {payment.method?.toUpperCase()} 
                                                  {payment.cash_amount && ` - ₹${payment.cash_amount}`}
                                                  {payment.upi_id && ` - ${payment.upi_id}`}
                                                </span>
                                              </div>
                                            );
                                          }
                                          if (key === 'rider_user_id') {
                                            return (
                                              <div key={key} className="flex items-start gap-2">
                                                <span className="text-xs font-medium text-gray-600 min-w-[120px]">Rider ID:</span>
                                                <span className="text-xs text-gray-700 font-mono">{String(value)}</span>
                                              </div>
                                            );
                                          }
                                          // Default formatting
                                          return (
                                            <div key={key} className="flex items-start gap-2">
                                              <span className="text-xs font-medium text-gray-600 min-w-[120px]">
                                                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                                              </span>
                                              <span className="text-xs text-gray-700">{JSON.stringify(value)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <p className="text-sm text-gray-500">No timeline events found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Map Modal Popup */}
        {mapModalOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setMapModalOrder(null)}>
            <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">🗺️ Live Tracking Map</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Order: <span className="font-semibold">{mapModalOrder.invoice_no}</span> • 
                    Status: <span className={`ml-1 px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(mapModalOrder.status)}`}>
                      {mapModalOrder.status.toUpperCase()}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setMapModalOrder(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
                >
                  ×
                </button>
              </div>

              <div className="p-6">
                <div style={{ width: '100%', height: '500px' }}>
                  <OrderTrackingMap
                    pickupLocation={mapModalOrder.pickup_location}
                    deliveryLocation={mapModalOrder.delivery_location}
                    riderLocation={riderLocations.get(mapModalOrder.invoice_id) || null}
                    status={mapModalOrder.status}
                  />
                </div>
                
                {/* Location Details */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                  {mapModalOrder.pickup_location && (
                    <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
                      <p className="text-sm font-semibold text-blue-700 mb-2">📍 Pickup Location</p>
                      <p className="text-xs text-blue-900 font-mono">
                        {mapModalOrder.pickup_location.lat.toFixed(6)}, {mapModalOrder.pickup_location.lng.toFixed(6)}
                      </p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${mapModalOrder.pickup_location.lat},${mapModalOrder.pickup_location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Open in Google Maps →
                      </a>
                    </div>
                  )}
                  {mapModalOrder.delivery_location && (
                    <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
                      <p className="text-sm font-semibold text-green-700 mb-2">🎯 Delivery Location</p>
                      <p className="text-xs text-green-900 font-mono">
                        {mapModalOrder.delivery_location.lat.toFixed(6)}, {mapModalOrder.delivery_location.lng.toFixed(6)}
                      </p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${mapModalOrder.delivery_location.lat},${mapModalOrder.delivery_location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium"
                      >
                        Open in Google Maps →
                      </a>
                    </div>
                  )}
                </div>

                {/* Rider Info */}
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs text-gray-600">Rider</p>
                    <p className="text-sm font-semibold text-gray-900">{mapModalOrder.rider_name || '—'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs text-gray-600">Customer</p>
                    <p className="text-sm font-semibold text-gray-900">{mapModalOrder.customer_name}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs text-gray-600">Distance</p>
                    <p className="text-sm font-semibold text-gray-900">{mapModalOrder.distance_km ? `${mapModalOrder.distance_km} km` : '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* POD Image Modal */}
        {podImageUrl && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => setPodImageUrl(null)}
          >
            <div 
              className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-2xl overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Proof of Delivery</h3>
                <button
                  onClick={() => setPodImageUrl(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <img 
                  src={`https://api.digitalchain.in${podImageUrl}`}
                  alt="Proof of Delivery" 
                  className="w-full h-auto rounded-lg border border-gray-300"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const errorMsg = e.currentTarget.nextElementSibling as HTMLElement;
                    if (errorMsg) errorMsg.classList.remove('hidden');
                  }}
                />
                <p className="hidden text-center text-sm text-red-600 py-4">Failed to load image</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
