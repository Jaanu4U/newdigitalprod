'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import NavBar from "@/components/NavBar"
import Sidebar from "@/components/Sidebar"
import { getTenantSlugFromHost } from "@/lib/tenant"

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mounted, setMounted] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const isLoginPage = pathname === '/login' || pathname === '/superadmin/login'
  const isSignupPage = pathname === '/signup'
  const isVerifyEmailPage = pathname === '/verify-email'
  const isVerifyPendingPage = pathname === '/verify-pending'
  const isSuperAdminPage = pathname?.startsWith('/superadmin')
  const isCustomerPage = pathname?.startsWith('/customer/') || pathname === '/customer-login' || pathname === '/customer-register'
  const [isApexRoot, setIsApexRoot] = useState(true)

  // Mount effect
  useEffect(() => {
    setMounted(true)
  }, [])

  // Check authentication status
  useEffect(() => {
    if (!mounted) return
    try {
      const token = localStorage.getItem('dc_token') || localStorage.getItem('dc_access')
      setIsAuthenticated(!!token)
    } catch {
      setIsAuthenticated(false)
    }
  }, [mounted, pathname])

  // Load persisted collapse state
  useEffect(() => {
    if (!mounted) return
    try {
      const saved = localStorage.getItem('dc_sidebar_collapsed')
      if (saved) setSidebarCollapsed(saved === '1')
    } catch {}
  }, [mounted])

  // Persist collapse state
  useEffect(() => {
    try {
      localStorage.setItem('dc_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
    } catch {}
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!mounted) return
    try {
      const host = window.location.hostname
      const slug = getTenantSlugFromHost(host)
      const isApex = host === 'digitalchain.in' || host === 'www.digitalchain.in' || host === 'localhost' || host === '127.0.0.1'
      // Only treat apex homepage as marketing (full-bleed)
      setIsApexRoot(Boolean(!slug && isApex && pathname === '/'))
    } catch {}
  }, [pathname, mounted])

  // Don't render layout features until mounted to avoid hydration mismatch
  if (!mounted) {
    return <div className="min-h-screen">{children}</div>
  }

  // Pages that should never show navbar/sidebar
  const isPublicPage = isLoginPage || isSignupPage || isVerifyEmailPage || isVerifyPendingPage || isApexRoot || isSuperAdminPage || isCustomerPage
  
  // Hide navbar/sidebar on root path (/) ONLY when not authenticated (public landing page)
  const isPublicRoot = pathname === '/' && !isAuthenticated
  
  // Don't show navbar/sidebar on public pages or unauthenticated root
  if (isPublicPage || isPublicRoot) {
    return children
  }

  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      <div className="flex flex-1">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main 
          className={`
            flex-1 p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen transition-all duration-300
            ${sidebarCollapsed ? 'ml-20' : 'ml-64'}
          `}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
