"use client";
import { Suspense, useEffect, useState } from "react";
import { apiBase } from "@/lib/api";
import { withTenantHeaders } from "@/lib/tenant";
import Link from "next/link";
import { Package, MapPin, CheckCircle, Clock, Eye } from "lucide-react";
import { useSearchParams } from "next/navigation";

interface AssignedOrder {
  invoice_id: string;
  invoice_no: string;
  customer_id?: string;
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_address?: string;
  amount?: number;
  totals?: { total?: number };
  assigned_at: string;
  status?: 'pending' | 'delivered';
  delivered_at?: string;
  rider_status?: 'assigned' | 'accepted' | 'in_transit' | 'delivered';
}

function RiderOrdersInner() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'delivered'>('all');
  const searchParams = useSearchParams();

  useEffect(() => {
    setMounted(true);
    const statusParam = searchParams?.get('status');
    if (statusParam === 'pending' || statusParam === 'delivered') {
      setFilter(statusParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!mounted) return;

    const fetchOrders = async () => {
      try {
        const token = localStorage.getItem('dc_access') || '';
        if (!token) {
          console.log('[ORDERS DEBUG] No token found');
          setLoading(false);
          return;
        }

        const base = apiBase();
        const url = `${base}v1/rider/assigned-orders`;
        console.log('[ORDERS DEBUG] Fetching from:', url);
        
        const res = await fetch(
          url,
          withTenantHeaders({
            headers: { Authorization: `Bearer ${token}` }
          })
        );

        console.log('[ORDERS DEBUG] Response status:', res.status);

        if (res.ok) {
          const data = await res.json();
          console.log('[ORDERS DEBUG] Response:', data);
          console.log('[ORDERS DEBUG] Orders count:', data.orders?.length || 0);
          setOrders(data.orders || []);
        } else {
          const errorText = await res.text();
          console.error('[ORDERS DEBUG] Error:', errorText);
        }
      } catch (e) {
        console.error('Failed to fetch orders:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [mounted]);

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'pending') return order.status !== 'delivered';
    if (filter === 'delivered') return order.status === 'delivered';
    return true;
  });

  if (!mounted || loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">My Deliveries</h1>
        <p className="text-gray-600 mt-1">View and manage all assigned orders</p>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-2 border-b">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 font-medium transition-colors ${
            filter === 'all'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All ({orders.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 font-medium transition-colors ${
            filter === 'pending'
              ? 'border-b-2 border-orange-600 text-orange-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Pending ({orders.filter(o => o.status !== 'delivered').length})
        </button>
        <button
          onClick={() => setFilter('delivered')}
          className={`px-4 py-2 font-medium transition-colors ${
            filter === 'delivered'
              ? 'border-b-2 border-green-600 text-green-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Delivered ({orders.filter(o => o.status === 'delivered').length})
        </button>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-gray-50 border rounded-lg p-8 text-center text-gray-500">
          No {filter !== 'all' ? filter : ''} orders found
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div
              key={order.invoice_id}
              className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{order.invoice_no}</h3>
                  <p className="text-sm text-gray-600">
                    Assigned: {new Date(order.assigned_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {order.status === 'delivered' ? (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1">
                      <CheckCircle size={16} />
                      Delivered
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm flex items-center gap-1">
                      <Clock size={16} />
                      Pending
                    </span>
                  )}
                  {/* Show rider status badge */}
                  {order.rider_status && order.rider_status !== 'delivered' && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      order.rider_status === 'assigned' ? 'bg-gray-100 text-gray-700' :
                      order.rider_status === 'accepted' ? 'bg-blue-100 text-blue-700' :
                      order.rider_status === 'in_transit' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {order.rider_status === 'assigned' ? '📋 New' :
                       order.rider_status === 'accepted' ? '✓ Accepted' :
                       order.rider_status === 'in_transit' ? '🚚 In Transit' :
                       order.rider_status}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-sm text-gray-600">Customer</p>
                  <p className="font-medium">{order.customer_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="font-medium text-lg">₹{(order.amount || order.totals?.total || 0).toFixed(2)}</p>
                </div>
              </div>

              {order.customer_address && (
                <div className="mb-3 flex items-start gap-2 text-sm">
                  <MapPin size={16} className="text-gray-500 mt-0.5" />
                  <span className="text-gray-700">{order.customer_address}</span>
                </div>
              )}

              <div className="flex gap-2">
                {order.delivery_latitude && order.delivery_longitude && (
                  <button
                    onClick={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${order.delivery_latitude},${order.delivery_longitude}`;
                      window.open(url, '_blank');
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    title={`Get directions to: ${order.delivery_address || `${order.delivery_latitude}, ${order.delivery_longitude}`}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 11l19-9-9 19-2-8-8-2z" />
                    </svg>
                    Directions
                  </button>
                )}
                <Link
                  href={`/rider/orders/${order.invoice_id}`}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-center flex items-center justify-center gap-2"
                >
                  <Eye size={16} />
                  View & Complete
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RiderOrdersPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <RiderOrdersInner />
    </Suspense>
  );
}
