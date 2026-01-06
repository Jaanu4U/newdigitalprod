'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiBase } from '@/lib/api'
import { withTenantHeaders } from "@/lib/tenant"
import { User, Package, ShoppingCart, Bell, LogOut, Edit, Mail, Phone, MapPin } from 'lucide-react'

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
  total: number
  items: Array<{ description: string; qty: number; rate: number; total: number }>
  created_at: string
  delivery_address: string
  tracking_number: string
}

export default function CustomerDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'orders' | 'create-order'>('overview')
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('dc_token')
    if (!token) {
      router.push('/customer-login')
      return
    }

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
        }

        // Load orders
        const ordersRes = await fetch(`${apiBase()}customer-portal/orders?limit=10`, withTenantHeaders({
          headers: { Authorization: `Bearer ${token}` }
        }))
        
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json()
          setOrders(ordersData.orders || [])
        }

        setLoading(false)
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load data')
        setLoading(false)
      }
    }

    loadData()
  }, [router])

  function handleLogout() {
    localStorage.removeItem('dc_token')
    localStorage.removeItem('dc_refresh')
    localStorage.removeItem('dc_user')
    localStorage.removeItem('dc_org_id')
    router.push('/customer-login')
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Customer Portal</h1>
              <p className="text-sm text-gray-600 mt-1">Welcome back, {profile?.name || profile?.company_name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Profile Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Profile</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Customer ID</p>
              <p className="font-medium text-gray-900">{profile?.custom_customer_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium text-gray-900">{profile?.email || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-medium text-gray-900">{profile?.phone || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Type</p>
              <p className="font-medium text-gray-900">{profile?.ctype}</p>
            </div>
            {profile?.address && (
              <div className="md:col-span-2">
                <p className="text-sm text-gray-600">Address</p>
                <p className="font-medium text-gray-900">
                  {profile.address}
                  {profile.city && `, ${profile.city}`}
                  {profile.state && `, ${profile.state}`}
                  {profile.pin && ` - ${profile.pin}`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h2>
          
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-2 text-sm text-gray-600">No orders yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.invoice_id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">Order #{order.invoice_no}</p>
                      <p className="text-sm text-gray-600">{new Date(order.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">₹{order.total.toLocaleString()}</p>
                      <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                        order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-100 pt-3 mt-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Items:</p>
                    <ul className="space-y-1">
                      {order.items.slice(0, 3).map((item, idx) => (
                        <li key={idx} className="text-sm text-gray-600 flex justify-between">
                          <span>{item.description} × {item.qty}</span>
                          <span>₹{item.total.toLocaleString()}</span>
                        </li>
                      ))}
                      {order.items.length > 3 && (
                        <li className="text-sm text-gray-500 italic">
                          + {order.items.length - 3} more items
                        </li>
                      )}
                    </ul>
                  </div>

                  {order.tracking_number && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-sm text-gray-600">
                        Tracking: <span className="font-medium text-gray-900">{order.tracking_number}</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
