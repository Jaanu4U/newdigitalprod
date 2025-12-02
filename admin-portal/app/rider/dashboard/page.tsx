"use client";
import { useEffect, useState } from "react";
import { apiBase } from "@/lib/api";
import { withTenantHeaders, getTenantSlugFromHost } from "@/lib/tenant";
import Link from "next/link";
import { Package, MapPin, CheckCircle, Clock, TrendingUp, Phone, Navigation } from "lucide-react";

interface AssignedOrder {
  invoice_id: string;
  invoice_no: string;
  customer_id?: string;
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  amount?: number;
  totals?: { total?: number };
  assigned_at: string;
  status?: 'pending' | 'delivered';
}

export default function RiderDashboard() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, delivered: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const fetchAssignedOrders = async () => {
      try {
        const token = localStorage.getItem('dc_access') || '';
        if (!token) {
          console.log('[DEBUG] No token found in localStorage');
          setLoading(false);
          return;
        }

        const base = apiBase();
        const url = `${base}rider/assigned-orders`;
        console.log('[DEBUG] Fetching orders from:', url);
        
        const res = await fetch(
          url,
          withTenantHeaders({
            headers: { Authorization: `Bearer ${token}` }
          })
        );

        console.log('[DEBUG] Response status:', res.status);
        
        if (res.ok) {
          const data = await res.json();
          console.log('[DEBUG] Response data:', data);
          const ordersList = data.orders || [];
          console.log('[DEBUG] Orders count:', ordersList.length);
          console.log('[DEBUG] First order:', ordersList[0]);
          console.log('[DEBUG] Setting orders to state...');
          setOrders(ordersList);
          console.log('[DEBUG] Orders state updated');

          // Calculate stats
          const pending = ordersList.filter((o: AssignedOrder) => o.status !== 'delivered').length;
          const delivered = ordersList.filter((o: AssignedOrder) => o.status === 'delivered').length;
          setStats({ total: ordersList.length, pending, delivered });
          console.log('[DEBUG] Stats:', { total: ordersList.length, pending, delivered });
        } else {
          const errorText = await res.text();
          console.error('[DEBUG] Error response:', errorText);
        }
      } catch (e) {
        console.error('Failed to fetch assigned orders:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignedOrders();
  }, [mounted]);

  if (!mounted || loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 md:px-6">
      {/* Professional Gradient Header */}
      <div className="mb-8 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 rounded-xl shadow-lg p-8 text-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Package className="w-8 h-8" />
              </div>
              <h1 className="text-3xl font-bold">Delivery Dashboard</h1>
            </div>
            <p className="text-blue-50 text-sm">Track and manage your assigned deliveries</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 hover:shadow-xl transition-all duration-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Orders</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-md">
              <Package className="text-white" size={28} />
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <TrendingUp size={14} />
            <span>All assigned deliveries</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 hover:shadow-xl transition-all duration-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">{stats.pending}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-md">
              <Clock className="text-white" size={28} />
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-orange-600 font-medium">
            <span>Awaiting delivery</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 hover:shadow-xl transition-all duration-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Delivered</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{stats.delivered}</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-md">
              <CheckCircle className="text-white" size={28} />
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <span>Successfully completed</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Navigation size={24} className="text-blue-600" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link 
            href="/rider/orders"
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center gap-3 group"
          >
            <div className="p-2 bg-white/20 rounded-lg">
              <Package size={24} />
            </div>
            <div>
              <span className="font-semibold text-lg">View All Orders</span>
              <p className="text-xs text-blue-100">Complete order list</p>
            </div>
          </Link>
          <Link 
            href="/rider/orders?status=pending"
            className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-6 py-4 rounded-xl hover:from-orange-700 hover:to-orange-800 transition-all shadow-md hover:shadow-lg flex items-center gap-3 group"
          >
            <div className="p-2 bg-white/20 rounded-lg">
              <Clock size={24} />
            </div>
            <div>
              <span className="font-semibold text-lg">Pending Deliveries</span>
              <p className="text-xs text-orange-100">Orders to deliver</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Orders - Card View */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Package size={24} className="text-blue-600" />
          Recent Orders
        </h2>
        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-12 text-center">
            <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
              <Package size={48} className="text-gray-400" />
            </div>
            <p className="text-lg font-semibold text-gray-700">No orders assigned yet</p>
            <p className="text-sm text-gray-500 mt-2">Your deliveries will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.slice(0, 6).map((order) => (
              <div
                key={order.invoice_id}
                className="bg-white rounded-xl border-2 border-gray-200 shadow-md hover:shadow-xl transition-all duration-200 p-6 hover:border-blue-300"
              >
                {/* Header with Status */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Invoice No</p>
                    <p className="text-lg font-bold text-gray-900">{order.invoice_no}</p>
                  </div>
                  {order.status === 'delivered' ? (
                    <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200 shadow-sm flex items-center gap-1">
                      <CheckCircle size={14} />
                      Delivered
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold border border-orange-200 shadow-sm flex items-center gap-1">
                      <Clock size={14} />
                      Pending
                    </span>
                  )}
                </div>

                {/* Customer Info */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <p className="text-sm text-gray-600 mb-1">Customer</p>
                  <p className="font-semibold text-gray-900">
                    {order.customer_name || (order.customer_id ? order.customer_id.substring(0, 20) + '...' : 'N/A')}
                  </p>
                  {order.customer_phone && (
                    <p className="text-sm text-gray-600 flex items-center gap-1 mt-2">
                      <Phone size={14} className="text-blue-600" />
                      {order.customer_phone}
                    </p>
                  )}
                </div>

                {/* Address */}
                {order.customer_address && (
                  <div className="mb-4 pb-4 border-b border-gray-100">
                    <p className="text-xs text-gray-600 flex items-start gap-2">
                      <MapPin size={14} className="mt-0.5 flex-shrink-0 text-blue-600" />
                      <span className="line-clamp-2">{order.customer_address}</span>
                    </p>
                  </div>
                )}

                {/* Amount */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-1">Amount</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{(order.amount || order.totals?.total || 0).toFixed(2)}
                  </p>
                </div>

                {/* Action Button */}
                <Link
                  href={`/rider/orders/${order.invoice_id}`}
                  className="block w-full text-center px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg font-semibold"
                >
                  View Details
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
