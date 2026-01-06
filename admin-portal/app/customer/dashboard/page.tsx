'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiBase } from '@/lib/api'
import { withTenantHeaders } from "@/lib/tenant"
import { User, Package, ShoppingCart, Bell, LogOut, Edit, Mail, Phone, MapPin, Save, X, Navigation, Home, FileText, PlusCircle, Menu, Radio } from 'lucide-react'

type CustomerProfile = {
  customer_id: string
  custom_customer_id: string
  name: string
  company_name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  pin: string
  ctype: string
  email_verified: boolean
  last_login: string
}

type Order = {
  invoice_id: string
  invoice_no: string
  status: string
  rider_status?: string
  total: number
  items: Array<{ description: string; qty: number; rate: number; total: number }>
  created_at: string
  delivery_address: string
  tracking_number: string
  rider_id?: string
  rider_name?: string
  rider_phone?: string
  delivered_at?: string
  completed_at?: string
}

type RiderLocation = {
  status: string
  message?: string
  rider?: {
    rider_id: string
    name: string
    phone: string
    location: {
      latitude: number
      longitude: number
      last_updated: string
    }
  }
  delivery?: {
    address: string
    latitude: number | null
    longitude: number | null
  }
  distance_km?: number
  eta_minutes?: number
  order_status?: string
}

export default function CustomerDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'orders' | 'create-order'>('overview')
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [notifications, setNotifications] = useState<Array<{type: string; message: string; created_at: string}>>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null)
  const [showRoute, setShowRoute] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pin: ''
  })

  // Purchase Order Form
  const [orderItems, setOrderItems] = useState([{ description: '', quantity: 1, rate: 0 }])
  const [orderAddress, setOrderAddress] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('dc_token')
    if (!token) {
      router.push('/customer-login')
      return
    }

    loadData()
  }, [router])

  async function loadData() {
    try {
      const token = localStorage.getItem('dc_token')
      
      // Load profile
      const profileRes = await fetch(`${apiBase()}customer-portal/profile`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }))
      
      if (profileRes.ok) {
        const profileData = await profileRes.json()
        setProfile(profileData)
        setProfileForm({
          name: profileData.name || profileData.company_name || '',
          phone: profileData.phone || '',
          address: profileData.address || '',
          city: profileData.city || '',
          state: profileData.state || '',
          pin: profileData.pin || ''
        })
        setOrderAddress(profileData.address || '')
      }

      // Load orders
      const ordersRes = await fetch(`${apiBase()}customer-portal/orders?limit=10`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }))
      
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json()
        setOrders(ordersData.orders || [])
      }

      // Load notifications
      const notifRes = await fetch(`${apiBase()}customer-portal/notifications`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }))
      
      if (notifRes.ok) {
        const notifData = await notifRes.json()
        const unread = notifData.notifications?.filter((n: any) => !n.read) || []
        setNotifications(unread)
        setUnreadMessages(unread.length)
      }

      setLoading(false)
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Failed to load data')
      setLoading(false)
    }
  }

  async function loadRiderLocation(orderId: string) {
    try {
      const token = localStorage.getItem('dc_token')
      
      const res = await fetch(`${apiBase()}customer-portal/order/${orderId}/rider-location`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }))
      
      if (res.ok) {
        const data = await res.json()
        setRiderLocation(data)
      } else {
        setRiderLocation({ status: 'error', message: 'Failed to load rider location' })
      }
    } catch (err) {
      setRiderLocation({ status: 'error', message: 'Failed to load rider location' })
    }
  }

  // Polling for real-time location updates
  useEffect(() => {
    if (!trackingOrderId) return

    // Initial load
    loadRiderLocation(trackingOrderId)

    // Poll every 10 seconds
    const interval = setInterval(() => {
      loadRiderLocation(trackingOrderId)
    }, 10000)

    return () => clearInterval(interval)
  }, [trackingOrderId])

  function handleTrackOrder(order: Order) {
    setSelectedOrder(order)
    setTrackingOrderId(order.invoice_id)
    setShowRoute(false)
  }

  function closeTracking() {
    setSelectedOrder(null)
    setTrackingOrderId(null)
    setRiderLocation(null)
    setShowRoute(false)
  }

  function handleLogout() {
    localStorage.removeItem('dc_token')
    localStorage.removeItem('dc_refresh')
    localStorage.removeItem('dc_user')
    localStorage.removeItem('dc_org_id')
    router.push('/customer-login')
  }

  async function handleProfileUpdate() {
    try {
      const token = localStorage.getItem('dc_token')
      const res = await fetch(`${apiBase()}customer-portal/profile`, withTenantHeaders({
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profileForm)
      }))

      if (res.ok) {
        setEditingProfile(false)
        loadData()
      } else {
        setError('Failed to update profile')
      }
    } catch (err) {
      setError('Failed to update profile')
    }
  }

  function addOrderItem() {
    setOrderItems([...orderItems, { description: '', quantity: 1, rate: 0 }])
  }

  function removeOrderItem(index: number) {
    setOrderItems(orderItems.filter((_, i) => i !== index))
  }

  function updateOrderItem(index: number, field: string, value: any) {
    const updated = [...orderItems]
    updated[index] = { ...updated[index], [field]: value }
    setOrderItems(updated)
  }

  async function handleCreateOrder() {
    try {
      const token = localStorage.getItem('dc_token')
      
      const orderData = {
        items: orderItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.rate
        })),
        notes: '',
        delivery_address: orderAddress || profile?.address || ''
      }

      const res = await fetch(`${apiBase()}customer-portal/create-order`, withTenantHeaders({
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      }))

      if (res.ok) {
        setOrderItems([{ description: '', quantity: 1, rate: 0 }])
        setActiveTab('orders')
        loadData()
      } else {
        setError('Failed to create order')
      }
    } catch (err) {
      setError('Failed to create order')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const orderTotal = orderItems.reduce((sum, item) => sum + (item.quantity * item.rate), 0)

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-gradient-to-b from-blue-900 to-blue-700 text-white transition-all duration-300 flex flex-col shadow-xl`}>
        {/* Logo / Header */}
        <div className="p-4 border-b border-blue-600">
          <div className="flex items-center justify-between">
            {sidebarOpen ? (
              <>
                <div>
                  <h1 className="text-xl font-bold">Customer Portal</h1>
                  <p className="text-xs text-blue-200 mt-1">DigitalChain</p>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-blue-600 rounded">
                  <Menu className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button onClick={() => setSidebarOpen(true)} className="mx-auto p-1 hover:bg-blue-600 rounded">
                <Menu className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 py-6 px-3 space-y-2">
          <button
            onClick={() => { setActiveTab('overview'); setTrackingOrderId(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition ${
              activeTab === 'overview'
                ? 'bg-blue-600 shadow-lg'
                : 'hover:bg-blue-600/50'
            }`}
          >
            <Home className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">Dashboard</span>}
          </button>

          <button
            onClick={() => { setActiveTab('orders'); setTrackingOrderId(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition ${
              activeTab === 'orders'
                ? 'bg-blue-600 shadow-lg'
                : 'hover:bg-blue-600/50'
            }`}
          >
            <Package className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">My Orders</span>}
            {sidebarOpen && orders.length > 0 && (
              <span className="ml-auto bg-blue-500 text-xs px-2 py-1 rounded-full">{orders.length}</span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('live-tracking'); setTrackingOrderId(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition ${
              activeTab === 'live-tracking'
                ? 'bg-blue-600 shadow-lg'
                : 'hover:bg-blue-600/50'
            }`}
          >
            <Radio className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">Live Tracking</span>}
            {sidebarOpen && orders.filter(o => o.rider_id && o.status !== 'completed' && o.status !== 'delivered').length > 0 && (
              <span className="ml-auto bg-green-500 text-xs px-2 py-1 rounded-full animate-pulse">
                {orders.filter(o => o.rider_id && o.status !== 'completed' && o.status !== 'delivered').length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('create-order'); setTrackingOrderId(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition ${
              activeTab === 'create-order'
                ? 'bg-blue-600 shadow-lg'
                : 'hover:bg-blue-600/50'
            }`}
          >
            <PlusCircle className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">Create Order</span>}
          </button>

          <button
            onClick={() => { setActiveTab('profile'); setTrackingOrderId(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition ${
              activeTab === 'profile'
                ? 'bg-blue-600 shadow-lg'
                : 'hover:bg-blue-600/50'
            }`}
          >
            <User className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">My Profile</span>}
          </button>
        </nav>

        {/* User Profile Section */}
        <div className="p-4 border-t border-blue-600">
          {sidebarOpen ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{profile?.name || 'User'}</p>
                  <p className="text-xs text-blue-200 truncate">{profile?.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-800 hover:bg-blue-900 rounded-lg text-sm font-medium transition"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full p-2 bg-blue-800 hover:bg-blue-900 rounded-lg transition"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5 mx-auto" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {activeTab === 'overview' && 'Dashboard Overview'}
                {activeTab === 'orders' && 'My Orders'}
                {activeTab === 'live-tracking' && 'Live Tracking'}
                {activeTab === 'create-order' && 'Create New Order'}
                {activeTab === 'profile' && 'My Profile'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">Welcome back, {profile?.name || profile?.company_name}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                >
                  <Bell className="w-5 h-5" />
                  {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-600 rounded-full">
                      {unreadMessages}
                    </span>
                  )}
                </button>
                
                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                      <h3 className="font-semibold text-gray-900">Notifications</h3>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 text-sm">
                        <Bell className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <p>No new notifications</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {notifications.map((notif, idx) => (
                          <div key={idx} className="p-4 hover:bg-gray-50 transition cursor-pointer">
                            <p className="text-sm font-medium text-gray-900">{notif.message}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(notif.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between shadow-sm">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-100">Total Orders</p>
                    <p className="text-3xl font-bold mt-1">{orders.length}</p>
                  </div>
                  <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <Package className="w-7 h-7" />
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-yellow-100">Pending Orders</p>
                    <p className="text-3xl font-bold mt-1">
                      {orders.filter(o => o.status === 'pending').length}
                    </p>
                  </div>
                  <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <ShoppingCart className="w-7 h-7" />
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-100">Active Deliveries</p>
                    <p className="text-3xl font-bold mt-1">
                      {orders.filter(o => o.rider_id && o.status !== 'completed' && o.status !== 'delivered').length}
                    </p>
                  </div>
                  <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <Navigation className="w-7 h-7" />
                  </div>
                </div>
              </div>
            </div>

            {/* Live Tracking Section */}
            {orders.filter(o => o.rider_id && o.status !== 'completed' && o.status !== 'delivered').length > 0 && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg border-2 border-blue-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Navigation className="w-6 h-6 text-white animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Live Order Tracking</h2>
                    <p className="text-sm text-gray-600">Track your orders in real-time</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {orders.filter(o => o.rider_id && o.status !== 'completed' && o.status !== 'delivered').map((order) => (
                    <div key={order.invoice_id} className="bg-white rounded-lg shadow-md border border-blue-200 p-4 hover:shadow-xl transition">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-gray-900">Order #{order.invoice_no}</p>
                          <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-1 bg-green-100 px-2 py-1 rounded-full">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-semibold text-green-700">Live</span>
                        </div>
                      </div>
                      
                      {order.rider_name && (
                        <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 rounded-lg">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-gray-600">Rider</p>
                            <p className="text-sm font-semibold text-gray-900">{order.rider_name}</p>
                          </div>
                          <Phone className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      
                      <button
                        onClick={() => handleTrackOrder(order)}
                        className="w-full py-2 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-medium text-sm flex items-center justify-center gap-2 transition shadow-md"
                      >
                        <MapPin className="w-4 h-4" />
                        Track Live Location
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Orders */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h2>
              {orders.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-600">No orders yet</p>
                  <button
                    onClick={() => setActiveTab('create-order')}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create Your First Order
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.invoice_id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">Order #{order.invoice_no}</p>
                          <p className="text-sm text-gray-600">{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">₹{(order.total || 0).toLocaleString()}</p>
                          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                            order.status === 'completed' || order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                            order.status === 'in_transit' ? 'bg-blue-100 text-blue-800' :
                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {order.status === 'completed' ? 'Delivered' : order.status === 'in_transit' ? 'In Transit' : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Tracking Tab */}
        {activeTab === 'live-tracking' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg">
                  <Radio className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Live Tracking</h2>
                  <p className="text-sm text-gray-600">Track your active deliveries in real-time</p>
                </div>
              </div>
            </div>

            {orders.filter(o => o.rider_id && o.status !== 'completed' && o.status !== 'delivered').length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block p-4 bg-gray-100 rounded-full mb-4">
                  <Navigation className="w-12 h-12 text-gray-400" />
                </div>
                <p className="text-lg font-semibold text-gray-900 mb-2">No Active Deliveries</p>
                <p className="text-sm text-gray-600">You don't have any orders with active tracking at the moment.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {orders
                  .filter(o => o.rider_id && o.status !== 'completed' && o.status !== 'delivered')
                  .map((order) => (
                    <div key={order.invoice_id} className="border-2 border-green-200 rounded-xl p-6 bg-gradient-to-br from-green-50 to-white">
                      {/* Order Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-500 rounded-lg">
                            <Package className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-900 text-lg">Order #{order.invoice_no}</p>
                              <span className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white text-xs rounded-full font-semibold">
                                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                                Live
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">{new Date(order.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900 text-lg">₹{(order.total || 0).toLocaleString()}</p>
                          <span className="inline-block px-3 py-1 text-xs rounded-full bg-green-100 text-green-800 font-semibold">
                            {order.status}
                          </span>
                        </div>
                      </div>

                      {/* Rider Info */}
                      {order.rider_name && (
                        <div className="bg-white rounded-lg p-4 mb-4 border border-green-200">
                          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <User className="w-4 h-4 text-green-600" />
                            Delivery Rider
                          </p>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                              {order.rider_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">{order.rider_name}</p>
                              {order.rider_phone && (
                                <p className="text-sm text-gray-600 flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {order.rider_phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Track Button */}
                      <button
                        onClick={() => handleTrackOrder(order)}
                        className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition"
                      >
                        <MapPin className="w-5 h-5" />
                        View Live Tracking Details
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Tracking Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-green-50 to-emerald-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500 rounded-lg">
                    <Navigation className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Live Tracking: Order #{selectedOrder.invoice_no}</h3>
                    <p className="text-sm text-gray-600">Real-time delivery status and location</p>
                  </div>
                </div>
                <button
                  onClick={closeTracking}
                  className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {/* Order Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                    <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Order Information
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-700">Order Number:</span>
                        <span className="text-sm font-semibold text-blue-900">{selectedOrder.invoice_no}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-700">Amount:</span>
                        <span className="text-sm font-semibold text-blue-900">₹{(selectedOrder.total || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-700">Status:</span>
                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-500 text-white font-semibold">
                          {selectedOrder.status}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-700">Created:</span>
                        <span className="text-sm font-semibold text-blue-900">
                          {new Date(selectedOrder.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedOrder.rider_name && (
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                      <h4 className="text-sm font-bold text-green-900 mb-3 flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Delivery Rider
                      </h4>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {selectedOrder.rider_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-green-900">{selectedOrder.rider_name}</p>
                          {selectedOrder.rider_phone && (
                            <p className="text-sm text-green-700 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {selectedOrder.rider_phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ETA Banner */}
                {riderLocation?.status === 'success' && riderLocation.eta_minutes && (
                  <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500 rounded-lg">
                        <Navigation className="w-6 h-6 text-white animate-pulse" />
                      </div>
                      <div className="flex-1">
                        <p className="text-lg font-bold text-orange-900">
                          🚴 Estimated arrival in {riderLocation.eta_minutes} minutes
                        </p>
                        {riderLocation.distance_km && (
                          <p className="text-sm text-orange-700">
                            Distance remaining: {riderLocation.distance_km} km
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Map */}
                {riderLocation?.status === 'success' && riderLocation.rider?.location && riderLocation.delivery?.latitude && riderLocation.delivery?.longitude ? (
                  <div className="mb-6">
                    <h4 className="text-md font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-green-600" />
                      Live Location Map
                      <span className="ml-auto text-xs text-gray-500">
                        Updated: {new Date(riderLocation.rider.location.last_updated).toLocaleTimeString()}
                      </span>
                    </h4>
                    <div className="rounded-xl overflow-hidden border-2 border-green-300 shadow-lg">
                      <div className="relative" style={{ height: '500px' }}>
                        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                        <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />
                        <div 
                          id={`modal-tracking-map-${selectedOrder.invoice_id}`}
                          className="w-full h-full"
                          ref={(el) => {
                            if (el && !el.dataset.initialized) {
                              el.dataset.initialized = 'true';
                              
                              const initMap = () => {
                                // @ts-ignore
                                const L = window.L;
                                if (!L) return;
                                  
                                  const map = L.map(`modal-tracking-map-${selectedOrder.invoice_id}`).setView(
                                    [
                                      (riderLocation.rider.location.latitude + riderLocation.delivery.latitude) / 2,
                                      (riderLocation.rider.location.longitude + riderLocation.delivery.longitude) / 2
                                    ],
                                    13
                                  );
                                  
                                  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                    attribution: '© OpenStreetMap contributors',
                                    maxZoom: 19
                                  }).addTo(map);
                                  
                                  const pickupIcon = L.divIcon({
                                    className: 'custom-div-icon',
                                    html: '<div style="background: #16a34a; width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 20px;">🏪</div>',
                                    iconSize: [40, 40],
                                    iconAnchor: [20, 20]
                                  });
                                  
                                  const riderIcon = L.divIcon({
                                    className: 'custom-div-icon',
                                    html: '<div style="background: #2563eb; width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 20px; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;">🚴</div>',
                                    iconSize: [40, 40],
                                    iconAnchor: [20, 20]
                                  });
                                  
                                  const deliveryIcon = L.divIcon({
                                    className: 'custom-div-icon',
                                    html: '<div style="background: #dc2626; width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 20px;">📍</div>',
                                    iconSize: [40, 40],
                                    iconAnchor: [20, 20]
                                  });
                                  
                                  const waypoints = [];
                                  
                                  if (riderLocation.pickup?.latitude && riderLocation.pickup?.longitude) {
                                    L.marker(
                                      [riderLocation.pickup.latitude, riderLocation.pickup.longitude],
                                      { icon: pickupIcon }
                                    ).addTo(map).bindPopup(`<b>🏪 Pickup Location</b><br>${riderLocation.pickup.address || 'Warehouse'}`);
                                    waypoints.push(L.latLng(riderLocation.pickup.latitude, riderLocation.pickup.longitude));
                                  }
                                  
                                  L.marker(
                                    [riderLocation.rider.location.latitude, riderLocation.rider.location.longitude],
                                    { icon: riderIcon }
                                  ).addTo(map).bindPopup('<b>🚴 Rider Current Location</b><br>Live tracking');
                                  waypoints.push(L.latLng(riderLocation.rider.location.latitude, riderLocation.rider.location.longitude));
                                  
                                  L.marker(
                                    [riderLocation.delivery.latitude, riderLocation.delivery.longitude],
                                    { icon: deliveryIcon }
                                  ).addTo(map).bindPopup(`<b>📍 Delivery Location</b><br>${riderLocation.delivery.address || 'Your location'}`);
                                  waypoints.push(L.latLng(riderLocation.delivery.latitude, riderLocation.delivery.longitude));
                                  
                                  L.Routing.control({
                                    waypoints: waypoints,
                                    routeWhileDragging: false,
                                    addWaypoints: false,
                                    draggableWaypoints: false,
                                    fitSelectedRoutes: true,
                                    showAlternatives: false,
                                    lineOptions: {
                                      styles: [{
                                        color: '#16a34a',
                                        opacity: 0.8,
                                        weight: 6
                                      }]
                                    },
                                    createMarker: function() { return null; },
                                    show: false,
                                  }).addTo(map);
                                  
                                  const boundsPoints = [
                                    [riderLocation.rider.location.latitude, riderLocation.rider.location.longitude],
                                    [riderLocation.delivery.latitude, riderLocation.delivery.longitude]
                                  ];
                                  if (riderLocation.pickup?.latitude && riderLocation.pickup?.longitude) {
                                    boundsPoints.push([riderLocation.pickup.latitude, riderLocation.pickup.longitude]);
                                  }
                                  map.fitBounds(boundsPoints, { padding: [50, 50] });
                                };
                              
                              // Check if Leaflet is already loaded
                              // @ts-ignore
                              if (window.L && window.L.Routing) {
                                initMap();
                              } else if (window.L) {
                                // Leaflet loaded but routing not loaded
                                const routingScript = document.createElement('script');
                                routingScript.src = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js';
                                routingScript.onload = initMap;
                                document.head.appendChild(routingScript);
                              } else {
                                // Load Leaflet first
                                const leafletScript = document.createElement('script');
                                leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                                leafletScript.onload = () => {
                                  const routingScript = document.createElement('script');
                                  routingScript.src = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js';
                                  routingScript.onload = initMap;
                                  document.head.appendChild(routingScript);
                                };
                                document.head.appendChild(leafletScript);
                              }
                            }
                          }}
                        />
                      </div>

                      {/* Location Info Footer */}
                      <div className="bg-gray-50 p-4 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {riderLocation.pickup && riderLocation.pickup.latitude && riderLocation.pickup.longitude && (
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white flex-shrink-0">🏪</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-700">Pickup Location</p>
                                <p className="text-xs text-gray-600 truncate">
                                  {riderLocation.pickup.latitude.toFixed(5)}, {riderLocation.pickup.longitude.toFixed(5)}
                                </p>
                              </div>
                            </div>
                          )}
                          {riderLocation.rider?.location?.latitude && riderLocation.rider?.location?.longitude && (
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white flex-shrink-0">🚴</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-700">Rider Current Location</p>
                                <p className="text-xs text-gray-600 truncate">
                                  {riderLocation.rider.location.latitude.toFixed(5)}, {riderLocation.rider.location.longitude.toFixed(5)}
                                </p>
                              </div>
                            </div>
                          )}
                          {riderLocation.delivery?.latitude && riderLocation.delivery?.longitude && (
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center text-white flex-shrink-0">📍</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-700">Delivery Location</p>
                                <p className="text-xs text-gray-600 truncate">
                                  {riderLocation.delivery.latitude.toFixed(5)}, {riderLocation.delivery.longitude.toFixed(5)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
                    <p className="text-sm text-gray-600">{riderLocation?.message || 'Loading tracking data...'}</p>
                  </div>
                )}

                {/* Order Items */}
                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-gray-900 mb-3">Order Items</h4>
                    <ul className="space-y-2">
                      {selectedOrder.items.map((item, idx) => (
                        <li key={idx} className="flex justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                          <span className="text-gray-700">{item.description} × {item.qty}</span>
                          <span className="font-semibold text-gray-900">₹{(item.total || 0).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Your Profile</h2>
              {!editingProfile && (
                <button
                  onClick={() => setEditingProfile(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Edit className="w-4 h-4" />
                  Edit Profile
                </button>
              )}
            </div>

            {editingProfile ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <input
                    type="text"
                    value={profileForm.address}
                    onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                    <input
                      type="text"
                      value={profileForm.state}
                      onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">PIN</label>
                    <input
                      type="text"
                      value={profileForm.pin}
                      onChange={(e) => setProfileForm({ ...profileForm, pin: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleProfileUpdate}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditingProfile(false)}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Customer ID</p>
                    <p className="font-medium text-gray-900">{profile?.custom_customer_id}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium text-gray-900">{profile?.email || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium text-gray-900">{profile?.phone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Account Type</p>
                    <p className="font-medium text-gray-900">{profile?.ctype === 'B2C' ? 'Retail' : 'Business'}</p>
                  </div>
                </div>
                {profile?.address && (
                  <div className="md:col-span-2 flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Address</p>
                      <p className="font-medium text-gray-900">
                        {profile.address}
                        {profile.city && `, ${profile.city}`}
                        {profile.state && `, ${profile.state}`}
                        {profile.pin && ` - ${profile.pin}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">All Orders</h2>
            {orders.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-600">No orders yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div key={order.invoice_id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">Order #{order.invoice_no}</p>
                        <p className="text-sm text-gray-600">{new Date(order.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">₹{(order.total || 0).toLocaleString()}</p>
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                          order.status === 'completed' || order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                          order.status === 'in_transit' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {order.status === 'completed' ? 'Delivered' : order.status === 'in_transit' ? 'In Transit' : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                        {order.completed_at && (
                          <p className="text-xs text-gray-500 mt-1">Delivered: {new Date(order.completed_at).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="border-t border-gray-100 pt-3 mt-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">Items:</p>
                      <ul className="space-y-1">
                        {(order.items || []).map((item, idx) => (
                          <li key={idx} className="text-sm text-gray-600 flex justify-between">
                            <span>{item.description} × {item.qty}</span>
                            <span>₹{(item.total || 0).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {order.rider_name && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-sm font-medium text-gray-700 mb-2">Delivery Rider:</p>
                        <div className="space-y-1">
                          <p className="text-sm text-gray-600">
                            <User className="w-4 h-4 inline mr-1" />
                            {order.rider_name}
                          </p>
                          {order.rider_phone && (
                            <p className="text-sm text-gray-600">
                              <Phone className="w-4 h-4 inline mr-1" />
                              {order.rider_phone}
                            </p>
                          )}
                        </div>
                        {order.status !== 'completed' && order.status !== 'delivered' && (
                          <button
                            onClick={() => handleTrackOrder(order.invoice_id)}
                            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium w-full"
                          >
                            <MapPin className="w-4 h-4 inline mr-1" />
                            Track Rider Location
                          </button>
                        )}
                        {(order.status === 'completed' || order.status === 'delivered') && order.completed_at && (
                          <div className="mt-2 px-3 py-2 bg-green-50 rounded-lg text-sm">
                            <p className="text-green-800 font-medium">✓ Delivered Successfully</p>
                            <p className="text-green-600 text-xs mt-1">{new Date(order.completed_at).toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {order.tracking_number && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-sm text-gray-600">
                          Tracking: <span className="font-medium text-gray-900">{order.tracking_number}</span>
                        </p>
                      </div>
                    )}

                    {/* Live Tracking Map */}
                    {trackingOrderId === order.invoice_id && riderLocation && (
                      <div className="mt-4 pt-4 border-t-2 border-blue-200">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-md font-semibold text-gray-900">Live Tracking</h3>
                          <button
                            onClick={closeTracking}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        {riderLocation.status === 'success' && riderLocation.rider ? (
                          <div className="space-y-3">
                            {/* ETA Info */}
                            {riderLocation.eta_minutes && (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                <p className="text-sm font-medium text-green-800">
                                  🚴 Estimated arrival in {riderLocation.eta_minutes} minutes
                                </p>
                                {riderLocation.distance_km && (
                                  <p className="text-xs text-green-600 mt-1">
                                    Distance: {riderLocation.distance_km} km
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Map */}
                            {riderLocation.rider.location && riderLocation.delivery?.latitude && riderLocation.delivery?.longitude ? (
                              <div className="rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-100">
                                <div className="relative" style={{ height: '400px' }}>
                                  {/* Map with Leaflet */}
                                  {!showRoute ? (
                                    <>
                                      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                                      <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />
                                      <div 
                                        id="live-tracking-map" 
                                        className="w-full h-full"
                                        ref={(el) => {
                                          if (el && !el.dataset.initialized) {
                                            el.dataset.initialized = 'true';
                                            
                                            // Load Leaflet
                                            const leafletScript = document.createElement('script');
                                            leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                                            leafletScript.onload = () => {
                                              // Load Leaflet Routing Machine
                                              const routingScript = document.createElement('script');
                                              routingScript.src = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js';
                                              routingScript.onload = () => {
                                                // @ts-ignore
                                                const L = window.L;
                                                
                                                // Initialize map
                                                const map = L.map('live-tracking-map').setView(
                                                  [
                                                    (riderLocation.rider.location.latitude + riderLocation.delivery.latitude) / 2,
                                                    (riderLocation.rider.location.longitude + riderLocation.delivery.longitude) / 2
                                                  ],
                                                  13
                                                );
                                                
                                                // Add OpenStreetMap tiles
                                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                                  attribution: '© OpenStreetMap contributors',
                                                  maxZoom: 19
                                                }).addTo(map);
                                                
                                                // Custom icons
                                                const pickupIcon = L.divIcon({
                                                  className: 'custom-div-icon',
                                                  html: '<div style="background: #16a34a; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 18px;">🏪</div>',
                                                  iconSize: [36, 36],
                                                  iconAnchor: [18, 18]
                                                });
                                                
                                                const riderIcon = L.divIcon({
                                                  className: 'custom-div-icon',
                                                  html: '<div style="background: #2563eb; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 18px;">🚴</div>',
                                                  iconSize: [36, 36],
                                                  iconAnchor: [18, 18]
                                                });
                                                
                                                const deliveryIcon = L.divIcon({
                                                  className: 'custom-div-icon',
                                                  html: '<div style="background: #dc2626; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 18px;">📍</div>',
                                                  iconSize: [36, 36],
                                                  iconAnchor: [18, 18]
                                                });
                                                
                                                // Add markers - check if pickup exists
                                                const waypoints = [];
                                                
                                                if (riderLocation.pickup?.latitude && riderLocation.pickup?.longitude) {
                                                  L.marker(
                                                    [riderLocation.pickup.latitude, riderLocation.pickup.longitude],
                                                    { icon: pickupIcon }
                                                  ).addTo(map).bindPopup(`<b>🏪 Pickup Location</b><br>${riderLocation.pickup.address || 'Warehouse'}`);
                                                  waypoints.push(L.latLng(riderLocation.pickup.latitude, riderLocation.pickup.longitude));
                                                }
                                                
                                                L.marker(
                                                  [riderLocation.rider.location.latitude, riderLocation.rider.location.longitude],
                                                  { icon: riderIcon }
                                                ).addTo(map).bindPopup('<b>🚴 Rider Location</b><br>Live tracking');
                                                waypoints.push(L.latLng(riderLocation.rider.location.latitude, riderLocation.rider.location.longitude));
                                                
                                                L.marker(
                                                  [riderLocation.delivery.latitude, riderLocation.delivery.longitude],
                                                  { icon: deliveryIcon }
                                                ).addTo(map).bindPopup(`<b>📍 Delivery Address</b><br>${riderLocation.delivery.address || 'Destination'}`);
                                                waypoints.push(L.latLng(riderLocation.delivery.latitude, riderLocation.delivery.longitude));
                                                
                                                // Add route with Leaflet Routing Machine
                                                L.Routing.control({
                                                  waypoints: waypoints,
                                                  routeWhileDragging: false,
                                                  addWaypoints: false,
                                                  draggableWaypoints: false,
                                                  fitSelectedRoutes: true,
                                                  showAlternatives: false,
                                                  lineOptions: {
                                                    styles: [{
                                                      color: '#2563eb',
                                                      opacity: 0.8,
                                                      weight: 6
                                                    }]
                                                  },
                                                  createMarker: function() { return null; }, // Don't create default markers
                                                  show: false, // Hide instruction panel
                                                }).addTo(map);
                                                
                                                // Fit bounds to include all points
                                                const boundsPoints = [
                                                  [riderLocation.rider.location.latitude, riderLocation.rider.location.longitude],
                                                  [riderLocation.delivery.latitude, riderLocation.delivery.longitude]
                                                ];
                                                if (riderLocation.pickup?.latitude && riderLocation.pickup?.longitude) {
                                                  boundsPoints.push([riderLocation.pickup.latitude, riderLocation.pickup.longitude]);
                                                }
                                                const bounds = L.latLngBounds(boundsPoints);
                                                map.fitBounds(bounds, { padding: [50, 50] });
                                              };
                                              document.head.appendChild(routingScript);
                                            };
                                            document.head.appendChild(leafletScript);
                                          }
                                        }}
                                      ></div>
                                      
                                      {/* Info overlay */}
                                      <div className="absolute top-2 left-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg z-[1000]">
                                        <div className="grid grid-cols-3 gap-2 text-xs">
                                          {riderLocation.pickup?.latitude && riderLocation.pickup?.longitude && (
                                            <div className="flex items-center gap-1">
                                              <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                                                <span className="text-white text-xs">🏪</span>
                                              </div>
                                              <div>
                                                <p className="font-semibold text-gray-900">Pickup</p>
                                                <p className="text-gray-600 text-[10px]">{riderLocation.pickup.latitude.toFixed(3)}, {riderLocation.pickup.longitude.toFixed(3)}</p>
                                              </div>
                                            </div>
                                          )}
                                          {riderLocation.rider?.location?.latitude && riderLocation.rider?.location?.longitude && (
                                            <div className="flex items-center gap-1">
                                              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                                                <span className="text-white text-xs">🚴</span>
                                              </div>
                                              <div>
                                                <p className="font-semibold text-gray-900">Rider Live</p>
                                                <p className="text-gray-600 text-[10px]">{riderLocation.rider.location.latitude.toFixed(3)}, {riderLocation.rider.location.longitude.toFixed(3)}</p>
                                              </div>
                                            </div>
                                          )}
                                          {riderLocation.delivery?.latitude && riderLocation.delivery?.longitude && (
                                            <div className="flex items-center gap-1">
                                              <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                                                <span className="text-white text-xs">📍</span>
                                              </div>
                                              <div>
                                                <p className="font-semibold text-gray-900">Delivery</p>
                                                <p className="text-gray-600 text-[10px]">{riderLocation.delivery.latitude.toFixed(3)}, {riderLocation.delivery.longitude.toFixed(3)}</p>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {/* Bottom bar */}
                                      <div className="absolute bottom-2 left-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg p-2 shadow-lg z-[1000]">
                                        <div className="flex items-center justify-between">
                                          {riderLocation.distance_km && (
                                            <div className="flex items-center gap-3 text-xs">
                                              <div className="flex items-center gap-1">
                                                <span className="font-semibold text-green-700">Distance:</span>
                                                <span className="text-gray-900">{riderLocation.distance_km} km</span>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <span className="font-semibold text-green-700">ETA:</span>
                                                <span className="text-gray-900">{riderLocation.eta_minutes} min</span>
                                              </div>
                                            </div>
                                          )}
                                          <button
                                            onClick={() => setShowRoute(true)}
                                            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium flex items-center gap-1"
                                          >
                                            <Navigation className="w-3 h-3" />
                                            Details
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-blue-50 to-green-50 p-6 overflow-auto">
                                      <div className="max-w-md mx-auto space-y-4">
                                        <div className="flex items-center justify-between border-b-2 border-blue-200 pb-3">
                                          <div className="flex items-center gap-2">
                                            <Navigation className="w-5 h-5 text-blue-600" />
                                            <h4 className="font-bold text-gray-900">Route Details</h4>
                                          </div>
                                          <button
                                            onClick={() => setShowRoute(false)}
                                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                          >
                                            ← Back to Map
                                          </button>
                                        </div>
                                        
                                        <div className="space-y-4">
                                          {/* Starting Point */}
                                          <div className="relative">
                                            <div className="flex items-start gap-3 p-4 bg-white rounded-lg shadow-md border-2 border-blue-300">
                                              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0 animate-pulse">
                                                A
                                              </div>
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <span className="text-2xl">🚴</span>
                                                  <p className="text-sm font-bold text-blue-900">Rider Current Location</p>
                                                </div>
                                                <p className="text-sm text-gray-700 font-mono bg-blue-50 px-2 py-1 rounded">
                                                  {riderLocation.rider?.location?.latitude && riderLocation.rider?.location?.longitude ? 
                                                    `${riderLocation.rider.location.latitude.toFixed(5)}, ${riderLocation.rider.location.longitude.toFixed(5)}` : 
                                                    'Location unavailable'
                                                  }
                                                </p>
                                                <p className="text-xs text-gray-600 mt-1">📍 Banjara Hills, Hyderabad</p>
                                              </div>
                                            </div>
                                            
                                            {/* Route line */}
                                            <div className="flex items-center justify-center my-2">
                                              <div className="relative flex flex-col items-center">
                                                <div className="w-1 h-12 bg-gradient-to-b from-blue-400 via-green-400 to-red-400 rounded-full"></div>
                                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                                                  <div className="text-xs font-bold text-white bg-green-600 px-2 py-1 rounded-full shadow-md whitespace-nowrap">
                                                    ↓ {riderLocation.distance_km} km
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                          
                                          {/* Route Info Card */}
                                          <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-300 shadow-md">
                                            <div className="flex items-center gap-2 mb-3">
                                              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                                                <Navigation className="w-5 h-5 text-white" />
                                              </div>
                                              <p className="text-base font-bold text-green-900">Journey Information</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                              <div className="bg-white p-3 rounded-lg shadow">
                                                <p className="text-xs text-gray-600 mb-1">Total Distance</p>
                                                <p className="text-2xl font-bold text-green-700">{riderLocation.distance_km}</p>
                                                <p className="text-xs text-gray-500">kilometers</p>
                                              </div>
                                              <div className="bg-white p-3 rounded-lg shadow">
                                                <p className="text-xs text-gray-600 mb-1">Estimated Time</p>
                                                <p className="text-2xl font-bold text-green-700">{riderLocation.eta_minutes}</p>
                                                <p className="text-xs text-gray-500">minutes</p>
                                              </div>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-green-200 flex items-center justify-between text-xs">
                                              <span className="text-gray-700">🚗 Mode: <span className="font-semibold">Driving</span></span>
                                              <span className="text-gray-700">⚡ Engine: <span className="font-semibold">OSRM</span></span>
                                            </div>
                                          </div>
                                          
                                          {/* Destination Point */}
                                          <div className="relative">
                                            {/* Route line */}
                                            <div className="flex items-center justify-center mb-2">
                                              <div className="w-1 h-12 bg-gradient-to-b from-green-400 to-red-400 rounded-full"></div>
                                            </div>
                                            
                                            <div className="flex items-start gap-3 p-4 bg-white rounded-lg shadow-md border-2 border-red-300">
                                              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0">
                                                B
                                              </div>
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <span className="text-2xl">📍</span>
                                                  <p className="text-sm font-bold text-red-900">Delivery Destination</p>
                                                </div>
                                                <p className="text-sm text-gray-700 font-mono bg-red-50 px-2 py-1 rounded">
                                                  {riderLocation.delivery?.latitude && riderLocation.delivery?.longitude ? 
                                                    `${riderLocation.delivery.latitude.toFixed(5)}, ${riderLocation.delivery.longitude.toFixed(5)}` : 
                                                    'Location unavailable'
                                                  }
                                                </p>
                                                {riderLocation.delivery.address && (
                                                  <p className="text-xs text-gray-600 mt-1">📮 {riderLocation.delivery.address}</p>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                        
                                        <a
                                          href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${riderLocation.rider.location.latitude},${riderLocation.rider.location.longitude};${riderLocation.delivery.latitude},${riderLocation.delivery.longitude}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
                                        >
                                          <Navigation className="w-5 h-5" />
                                          Open Live Navigation in OpenStreetMap
                                        </a>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {!showRoute && (
                                    <>
                                      {/* Overlay with rider location info and controls */}
                                      <div className="absolute top-2 left-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-blue-200">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <div className="relative">
                                              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                                                <span className="text-white text-xs font-bold">🚴</span>
                                              </div>
                                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                                            </div>
                                            <div>
                                              <p className="text-xs font-semibold text-gray-900">Rider Live Location</p>
                                              <p className="text-xs text-gray-600">
                                                {riderLocation.rider?.location?.latitude && riderLocation.rider?.location?.longitude ? 
                                                  `${riderLocation.rider.location.latitude.toFixed(4)}, ${riderLocation.rider.location.longitude.toFixed(4)}` : 
                                                  'Location updating...'
                                                }
                                              </p>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-xs text-gray-600">Distance</p>
                                            <p className="text-sm font-bold text-blue-600">{riderLocation.distance_km} km</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Bottom info bar with legend and route link */}
                                      <div className="absolute bottom-2 left-2 right-2 bg-white/95 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-gray-200">
                                        <div className="flex items-center justify-between text-xs">
                                          <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1">
                                              <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
                                              <span className="font-medium text-gray-700">Rider (Live)</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                                              <span className="font-medium text-gray-700">Delivery</span>
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => setShowRoute(true)}
                                            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium flex items-center gap-1"
                                          >
                                            <Navigation className="w-3 h-3" />
                                            View Route
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : riderLocation.rider.location ? (
                              <div className="rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-100 p-4 text-center">
                                <MapPin className="w-12 h-12 text-blue-600 mx-auto mb-2" />
                                <p className="text-sm text-gray-700 font-medium">Rider Location</p>
                                <p className="text-xs text-gray-600 mt-1">
                                  {riderLocation.rider?.location?.latitude && riderLocation.rider?.location?.longitude ? (
                                    <>
                                      Lat: {riderLocation.rider.location.latitude.toFixed(6)}, 
                                      Lng: {riderLocation.rider.location.longitude.toFixed(6)}
                                    </>
                                  ) : 'Location unavailable'}
                                </p>
                                <a
                                  href={`https://www.openstreetmap.org/?mlat=${riderLocation.rider.location.latitude}&mlon=${riderLocation.rider.location.longitude}#map=15/${riderLocation.rider.location.latitude}/${riderLocation.rider.location.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                >
                                  <Navigation className="w-4 h-4 inline mr-1" />
                                  Open in OpenStreetMap
                                </a>
                              </div>
                            ) : null}

                            {/* Rider Info */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <p className="text-sm font-medium text-blue-800">
                                Rider: {riderLocation.rider.name}
                              </p>
                              <p className="text-xs text-blue-600 mt-1">
                                Phone: {riderLocation.rider.phone}
                              </p>
                              <p className="text-xs text-blue-600">
                                Last updated: {new Date(riderLocation.rider.location.last_updated).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        ) : riderLocation.status === 'no_rider' ? (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <p className="text-sm text-yellow-800">{riderLocation.message}</p>
                          </div>
                        ) : riderLocation.status === 'location_unavailable' ? (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <p className="text-sm text-orange-800">{riderLocation.message}</p>
                            <p className="text-xs text-orange-600 mt-1">
                              Rider: {riderLocation.rider_name} - {riderLocation.rider_phone}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <p className="text-sm text-gray-600">{riderLocation.message || 'Loading...'}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Order Tab */}
        {activeTab === 'create-order' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Create Purchase Order</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Address</label>
                <textarea
                  value={orderAddress}
                  onChange={(e) => setOrderAddress(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter delivery address"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700">Order Items</h3>
                  <button
                    onClick={addOrderItem}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="space-y-4">
                  {orderItems.map((item, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex gap-4 items-end">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-600 mb-1">Description</label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateOrderItem(index, 'description', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="Item description"
                          />
                        </div>
                        <div className="w-32">
                          <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <input
                          type="hidden"
                          value={item.rate}
                          onChange={(e) => updateOrderItem(index, 'rate', parseFloat(e.target.value) || 0)}
                        />
                        {orderItems.length > 1 && (
                          <button
                            onClick={() => removeOrderItem(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleCreateOrder}
                  disabled={!orderAddress || orderItems.some(item => !item.description)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Submit Order
                </button>
                <button
                  onClick={() => {
                    setOrderItems([{ description: '', quantity: 1, rate: 0 }])
                    setOrderAddress(profile?.address || '')
                  }}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
        </main>
      </div>
    </div>
  )
}
