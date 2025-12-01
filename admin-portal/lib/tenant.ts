export function getTenantSlugFromHost(hostname?: string): string | null {
  const h = (hostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase()
  const parts = h.split('.')
  // Expect acme.digitalchain.in
  if (parts.length >= 3 && parts[parts.length - 2] === 'digitalchain' && parts[parts.length - 1] === 'in') {
    const sub = parts[0]
    if (sub && !['admin', 'api', 'www'].includes(sub)) return sub
  }
  return null
}

export function withTenantHeaders(init?: RequestInit): RequestInit {
  const slug = getTenantSlugFromHost()
  const headers = new Headers(init?.headers || {})
  
  if (slug) {
    headers.set('X-Org', slug)
  } else if (typeof window !== 'undefined') {
    // Fallback: use org_id from localStorage when no tenant slug
    const orgId = localStorage.getItem('dc_org_id')
    if (orgId) {
      headers.set('X-Org-Id', orgId)
    }
  }
  
  return { ...(init || {}), headers }
}
