'use client'

import { useEffect, useState } from 'react'
import { apiBase } from '@/lib/api'
import { withTenantHeaders } from '@/lib/tenant'
import { FileText, User, Phone, Mail, MapPin, Package, Calendar, Check, X } from 'lucide-react'

type PurchaseOrder = {
  id: number
  created_at: string
  order_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  customer_email: string
  total: number
  subtotal: number
  items_count: number
  items: Array<{ description: string; qty: number; rate: number; total: number }>
  status: string
  delivery_address: string
  notes: string
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [processingOrder, setProcessingOrder] = useState<number | null>(null)

  useEffect(() => {
    loadOrders()
  }, [])

  async function loadOrders() {
    try {
      const token = localStorage.getItem('dc_access')
      if (!token) {
        window.location.href = '/login'
        return
      }

      const res = await fetch(`${apiBase()}purchase-orders/list`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }))

      if (res.ok) {
        const data = await res.json()
        setOrders(data.purchase_orders || [])
      } else {
        setError('Failed to load purchase orders')
      }
    } catch (err) {
      setError('Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }

  async function handleOrderAction(orderId: number, action: 'approve' | 'reject') {
    setProcessingOrder(orderId)
    try {
      const token = localStorage.getItem('dc_access')
      if (!token) return

      const url = `${apiBase()}purchase-orders/${orderId}/${action}`

      const res = await fetch(url, withTenantHeaders({
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }))

      if (res.ok) {
        // Reload orders to get updated status
        await loadOrders()
        setError('')
      } else {
        const data = await res.json()
        setError(data.detail || `Failed to ${action} order`)
      }
    } catch (err) {
      setError(`Failed to ${action} order`)
    } finally {
      setProcessingOrder(null)
    }
  }

  const filteredOrders = orders.filter(order => 
    order.order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customer_phone?.includes(searchTerm)
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading purchase orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-800 rounded-xl shadow-lg p-8 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <FileText className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold">Customer Purchase Orders</h1>
          </div>
          <p className="text-purple-50 text-sm">View and manage purchase orders from customers</p>
          
          <div className="mt-4 flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/20">
            <Package className="w-5 h-5" />
            <span className="font-semibold">Total Orders: {orders.length}</span>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-gray-200 p-5">
          <div className="relative">
            <svg className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by order ID, customer name, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 pl-10 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No purchase orders found</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{order.order_id}</h3>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {new Date(order.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      {selectedOrder?.id === order.id ? 'Hide Details' : 'View Details'}
                    </button>
                    
                    {order.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleOrderAction(order.id, 'approve')}
                          disabled={processingOrder === order.id}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          {processingOrder === order.id ? 'Processing...' : 'Accept'}
                        </button>
                        <button
                          onClick={() => handleOrderAction(order.id, 'reject')}
                          disabled={processingOrder === order.id}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                        >
                          <X className="w-4 h-4" />
                          {processingOrder === order.id ? 'Processing...' : 'Reject'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Customer Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700"><strong>Customer:</strong> {order.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700"><strong>Phone:</strong> {order.customer_phone}</span>
                  </div>
                  {order.customer_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-700"><strong>Email:</strong> {order.customer_email}</span>
                    </div>
                  )}
                  {order.delivery_address && (
                    <div className="flex items-start gap-2 md:col-span-2">
                      <MapPin className="w-4 h-4 text-gray-600 mt-0.5" />
                      <span className="text-sm text-gray-700"><strong>Address:</strong> {order.delivery_address}</span>
                    </div>
                  )}
                </div>

                {/* Items Summary */}
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700">{order.items_count} item(s)</span>
                  </div>
                  {order.total > 0 && (
                    <span className="text-lg font-bold text-blue-600">₹{order.total.toLocaleString()}</span>
                  )}
                </div>

                {/* Expanded Details */}
                {selectedOrder?.id === order.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="font-semibold text-gray-900 mb-3">Order Items:</h4>
                    <div className="space-y-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{item.description}</p>
                            <p className="text-sm text-gray-600">Quantity: {item.qty}</p>
                          </div>
                          {item.total > 0 && (
                            <span className="font-semibold text-gray-900">₹{item.total.toLocaleString()}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {order.notes && (
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm font-medium text-gray-700"><strong>Notes:</strong></p>
                        <p className="text-sm text-gray-600 mt-1">{order.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
