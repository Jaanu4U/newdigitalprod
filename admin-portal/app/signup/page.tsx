"use client";
import { useEffect, useMemo, useState } from "react";
import { getTenantSlugFromHost } from "@/lib/tenant";

function apiBase() {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    const b = process.env.NEXT_PUBLIC_API_BASE;
    return b.endsWith('/') ? b : b + '/';
  }
  if (typeof window !== 'undefined') {
    const h = window.location.hostname
    if (h.endsWith('digitalchain.in')) return 'https://api.digitalchain.in/v1/'
  }
  return 'http://localhost:8000/v1/'
}

async function checkAvailability(slug?: string, domain?: string) {
  const params = new URLSearchParams()
  if (slug) params.set('slug', slug)
  if (domain) params.set('domain', domain)
  const res = await fetch(`${apiBase()}org/check?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) return {}
  return res.json()
}

export default function SignupPage() {
  const [orgName, setOrgName] = useState("")
  const [adminName, setAdminName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminPhone, setAdminPhone] = useState("")
  const [password, setPassword] = useState("")
  const [slug, setSlug] = useState("")
  const [domain, setDomain] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [slugStatus, setSlugStatus] = useState<{valid?: boolean; available?: boolean; reason?: string} | null>(null)
  const [domainStatus, setDomainStatus] = useState<{valid?: boolean; available?: boolean; reason?: string} | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!slug && orgName) {
        const s = orgName.toLowerCase().replace(/[^a-z0-9\-\s]/g,'').trim().replace(/\s+/g,'-').slice(0,48)
        setSlug(s)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [orgName])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!slug) { setSlugStatus(null); return }
      try {
        const r = await checkAvailability(slug, undefined)
        const s = r?.slug || {}
        // Backend now only checks uniqueness; valid=true always
        setSlugStatus({ valid: true, available: s.available })
      } catch { setSlugStatus(null) }
    }, 300)
    return () => clearTimeout(t)
  }, [slug])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!domain) { setDomainStatus(null); return }
      try {
        const r = await checkAvailability(undefined, domain)
        const d = r?.domain || {}
        setDomainStatus({ valid: d.valid, available: d.available, reason: d.reason })
      } catch { setDomainStatus(null) }
    }, 400)
    return () => clearTimeout(t)
  }, [domain])

  const canSubmit = useMemo(() => {
    const slugOk = slug ? (slugStatus ? slugStatus.available !== false : true) : false
    const domainOk = domain ? (domainStatus ? domainStatus.valid !== false && domainStatus.available !== false : true) : true
    return Boolean(orgName && adminName && adminEmail && password && slugOk && domainOk)
  }, [orgName, adminName, adminEmail, password, slug, slugStatus, domain, domainStatus])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase()}org/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: orgName,
          admin_name: adminName,
          admin_email: adminEmail,
          admin_phone: adminPhone || undefined,
          admin_password: password,
          custom_domain: domain || undefined,
          slug: slug || undefined
        })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({detail:'Signup failed'}))
        throw new Error(j.detail || 'Signup failed')
      }
      const out = await res.json()
      const s = out.slug || slug
      if (s) {
        window.location.href = `https://${s}.digitalchain.in/login`
      } else {
        window.location.href = '/login'
      }
    } catch (err:any) {
      setError(err.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-6 py-10 max-w-3xl">
        <h1 className="text-3xl font-bold">Create your organization</h1>
        <p className="text-gray-600 mt-1">Start with a few details. You can change settings later.</p>

        <form className="mt-8 space-y-5" onSubmit={onSubmit}>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium">Organization name</label>
              <input className="mt-1 w-full border rounded-md px-3 py-2" value={orgName} onChange={e=>setOrgName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium">Subdomain (unique)</label>
              <input className={`mt-1 w-full border rounded-md px-3 py-2 ${slugStatus?.available===false ? 'border-red-400' : ''}`} value={slug} onChange={e=>setSlug(e.target.value.toLowerCase())} placeholder="acme" required />
              {/* Live preview of the full org URL */}
              {slug ? (
                <p className={`text-sm mt-1 ${slugStatus?.available===false ? 'text-red-600' : slugStatus?.available ? 'text-green-600' : 'text-gray-600'}`}>
                  {slug}.digitalchain.in {slugStatus?.available===false ? 'is not available' : slugStatus?.available ? 'is available' : ''}
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">Example: acme.digitalchain.in</p>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium">Admin name</label>
              <input className="mt-1 w-full border rounded-md px-3 py-2" value={adminName} onChange={e=>setAdminName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium">Admin email</label>
              <input type="email" className="mt-1 w-full border rounded-md px-3 py-2" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} required />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium">Phone number</label>
              <input className="mt-1 w-full border rounded-md px-3 py-2" value={adminPhone} onChange={e=>setAdminPhone(e.target.value)} placeholder="+91..." />
            </div>
            <div>
              <label className="block text-sm font-medium">Password</label>
              <input type="password" className="mt-1 w-full border rounded-md px-3 py-2" value={password} onChange={e=>setPassword(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Organization website (optional)</label>
            <input className={`mt-1 w-full border rounded-md px-3 py-2 ${domainStatus?.valid===false || domainStatus?.available===false ? 'border-red-400' : ''}`} value={domain} onChange={e=>setDomain(e.target.value.toLowerCase())} placeholder="yourcompany.com" />
            {domainStatus?.valid===false && <p className="text-sm text-red-600 mt-1">Invalid domain format</p>}
            {domain && domainStatus?.valid && domainStatus?.available===false && <p className="text-sm text-red-600 mt-1">Domain already in use</p>}
            {domain && domainStatus?.valid && domainStatus?.available && <p className="text-sm text-green-600 mt-1">Available</p>}
            <p className="text-xs text-gray-500 mt-1">Optional: use your own website/domain later via DNS (CNAME/A) setup.</p>
          </div>

          {error && <div className="rounded-md border border-red-200 bg-red-50 text-red-700 px-4 py-2">{error}</div>}

          <button
            disabled={!canSubmit || loading}
            type="submit"
            className="btn btn-primary btn-lg w-full"
            style={{ backgroundColor: '#2563eb', color: '#ffffff', display: 'block', borderRadius: 6, border: '1px solid #1d4ed8' }}
          >
            {loading? 'Creating...' : 'Create Organization'}
          </button>
        </form>
      </div>
    </div>
  )
}
