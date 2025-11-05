'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import NavBar from "@/components/NavBar"
import Sidebar from "@/components/Sidebar"
import { getTenantSlugFromHost } from "@/lib/tenant"

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login' || pathname === '/superadmin/login'
  const isSignupPage = pathname === '/signup'
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isApexRoot, setIsApexRoot] = useState(false)

  // Load persisted collapse state (desktop)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dc_sidebar_collapsed')
      if (saved) setSidebarCollapsed(saved === '1')
    } catch {}
  }, [])

  // Persist collapse state
  useEffect(() => {
    try {
      localStorage.setItem('dc_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
    } catch {}
  }, [sidebarCollapsed])

  // Close sidebar on route changes (mobile UX)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    try {
      const host = window.location.hostname
      const slug = getTenantSlugFromHost(host)
      const isApex = host === 'digitalchain.in' || host === 'www.digitalchain.in' || host === 'localhost' || host === '127.0.0.1'
      // Only treat apex homepage as marketing (full-bleed)
      setIsApexRoot(Boolean(!slug && isApex && pathname === '/'))
    } catch {}
  }, [pathname])

  if (isLoginPage || isSignupPage || isApexRoot) {
    // Clean login page - no navbar or sidebar
    return children
  }

  return (
    <div className="flex flex-col">
      <NavBar onToggleSidebar={() => setSidebarOpen((v) => !v)} sidebarOpen={sidebarOpen} />
      <div className={`flex gap-6 flex-1 relative ${sidebarCollapsed ? 'md:pl-0' : ''}`}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((v) => !v)} />
        <main className="flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
