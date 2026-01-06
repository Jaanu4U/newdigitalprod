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
  const [subdomain, setSubdomain] = useState("")
  const [adminName, setAdminName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminPhone, setAdminPhone] = useState("")
  const [password, setPassword] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [pincode, setPincode] = useState("")
  const [country, setCountry] = useState("India")
  const [region, setRegion] = useState("Asia/Kolkata")
  const [plan, setPlan] = useState("free")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [success, setSuccess] = useState(false)
  const [checkingSlug, setCheckingSlug] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean|null>(null)

  useEffect(() => {
    if (!subdomain) {
      setSlugAvailable(null)
      return
    }
    const timer = setTimeout(async () => {
      setCheckingSlug(true)
      const res = await checkAvailability(subdomain)
      // Handle nested response structure
      setSlugAvailable(res.slug?.available === true)
      setCheckingSlug(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [subdomain])

  const canSubmit = useMemo(() => {
    return Boolean(orgName && subdomain && adminName && adminEmail && password && slugAvailable)
  }, [orgName, subdomain, adminName, adminEmail, password, slugAvailable])

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
          slug: subdomain,
          admin_name: adminName,
          admin_email: adminEmail,
          admin_phone: adminPhone || undefined,
          admin_password: password,
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          pincode: pincode || undefined,
          country: country || undefined,
          region: region || undefined,
          plan: plan || undefined,
        })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({detail:'Signup failed'}))
        throw new Error(j.detail || 'Signup failed')
      }
      const out = await res.json()
      console.log('[Signup] Registration successful:', out)
      setSuccess(true)
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

        {success ? (
          <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <div className="mb-4">
              <svg className="mx-auto h-16 w-16 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h2>
            <p className="text-gray-700 mb-4">
              We've sent a verification email to <strong>{adminEmail}</strong>
            </p>
            <p className="text-gray-600 mb-6">
              Please check your inbox and click the verification link to activate your account.
            </p>
            <p className="text-sm text-gray-500">
              Didn't receive the email? Check your spam folder or contact support.
            </p>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={onSubmit}>

          <div>
            <label className="block text-sm font-medium">Organization name</label>
            <input className="mt-1 w-full border rounded-md px-3 py-2" value={orgName} onChange={e=>setOrgName(e.target.value)} required />
          </div>

          <div>
            <label className="block text-sm font-medium">Subdomain</label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                className="flex-1 border rounded-l-md px-3 py-2"
                value={subdomain}
                onChange={e=>setSubdomain(e.target.value.toLowerCase())}
                placeholder="mycompany"
                required
              />
              <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 bg-gray-50 text-gray-500 text-sm">
                .digitalchain.in
              </span>
            </div>
            {checkingSlug && <p className="text-xs text-gray-500 mt-1">Checking availability...</p>}
            {slugAvailable === true && <p className="text-xs text-green-600 mt-1">✓ Available</p>}
            {slugAvailable === false && <p className="text-xs text-red-600 mt-1">✗ Already taken</p>}
          </div>

          <div className="border-t pt-5 mt-2">
            <h3 className="text-lg font-semibold mb-4">Admin User</h3>
            
            <div>
              <label className="block text-sm font-medium">Admin name</label>
              <input className="mt-1 w-full border rounded-md px-3 py-2" value={adminName} onChange={e=>setAdminName(e.target.value)} required />
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium">Admin email</label>
              <input type="email" className="mt-1 w-full border rounded-md px-3 py-2" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} required />
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium">Admin phone (optional)</label>
              <input className="mt-1 w-full border rounded-md px-3 py-2" value={adminPhone} onChange={e=>setAdminPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium">Password</label>
              <input type="password" className="mt-1 w-full border rounded-md px-3 py-2" value={password} onChange={e=>setPassword(e.target.value)} required />
            </div>
          </div>

          <div className="border-t pt-5 mt-2">
            <h3 className="text-lg font-semibold mb-4">Organization Address</h3>
            
            <div>
              <label className="block text-sm font-medium">Street Address</label>
              <input 
                className="mt-1 w-full border rounded-md px-3 py-2" 
                value={address} 
                onChange={e=>setAddress(e.target.value)} 
                placeholder="123 Main Street, Building A"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-5 mt-5">
              <div>
                <label className="block text-sm font-medium">City</label>
                <input 
                  className="mt-1 w-full border rounded-md px-3 py-2" 
                  value={city} 
                  onChange={e=>setCity(e.target.value)}
                  placeholder="Mumbai"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">State/Province</label>
                <input 
                  className="mt-1 w-full border rounded-md px-3 py-2" 
                  value={state} 
                  onChange={e=>setState(e.target.value)}
                  placeholder="Maharashtra"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">PIN/ZIP Code</label>
                <input 
                  className="mt-1 w-full border rounded-md px-3 py-2" 
                  value={pincode} 
                  onChange={e=>setPincode(e.target.value)}
                  placeholder="400001"
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium">Country</label>
              <select 
                className="mt-1 w-full border rounded-md px-3 py-2"
                value={country}
                onChange={e=>setCountry(e.target.value)}
              >
                <option value="India">India</option>
                <option value="United States">United States</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="Australia">Australia</option>
                <option value="United Arab Emirates">United Arab Emirates</option>
                <option value="Singapore">Singapore</option>
                <option value="Malaysia">Malaysia</option>
                <option value="China">China</option>
                <option value="Japan">Japan</option>
                <option value="South Korea">South Korea</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="border-t pt-5 mt-2">
            <h3 className="text-lg font-semibold mb-4">Settings</h3>
            
            <div>
              <label className="block text-sm font-medium">Region/Timezone</label>
              <select 
                className="mt-1 w-full border rounded-md px-3 py-2"
                value={region}
                onChange={e=>setRegion(e.target.value)}
              >
                <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
                <option value="America/New_York">US East (America/New_York)</option>
                <option value="America/Los_Angeles">US West (America/Los_Angeles)</option>
                <option value="Europe/London">UK (Europe/London)</option>
                <option value="Australia/Sydney">Australia (Australia/Sydney)</option>
                <option value="Asia/Dubai">UAE (Asia/Dubai)</option>
                <option value="Asia/Singapore">Singapore (Asia/Singapore)</option>
              </select>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium">Plan</label>
              <select 
                className="mt-1 w-full border rounded-md px-3 py-2"
                value={plan}
                onChange={e=>setPlan(e.target.value)}
              >
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="pro">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
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
        )}
      </div>
    </div>
  )
}
