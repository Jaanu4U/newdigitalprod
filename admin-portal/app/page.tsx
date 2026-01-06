// @ts-nocheck
"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import MarketingLanding from "@/components/MarketingLanding";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";

type OrgSettings = {
  name?: string;
  plan?: string;
  status?: string;
  region?: string;
  timezone?: string;
};

type MapsUsage = {
  total_usage: number;
  usage_by_endpoint: Array<{ endpoint: string; requests: number }>;
  usage_by_role: Array<{ role: string; requests: number }>;
  daily_usage_last_7_days: Array<{ date: string; requests: number }>;
};

type User = { role: string };

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const pathname = usePathname();
  const [isMarketingHost, setIsMarketingHost] = useState(false);

  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [userStats, setUserStats] = useState<{ total: number; admins: number; managers: number; riders: number } | null>(null);
  const [mapsUsage, setMapsUsage] = useState<MapsUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(() => apiBase(), []);

  const syncAuth = () => {
    try {
      const token = localStorage.getItem("dc_access");
      const em = localStorage.getItem("dc_email");
      setAuthed(!!token);
      setEmail(em);
    } catch {}
  };

  useEffect(() => {
    syncAuth();
    const onStorage = (e: StorageEvent) => {
      if (e.key && ["dc_access", "dc_email", "dc_refresh", "dc_org", "dc_role"].includes(e.key)) {
        syncAuth();
        if (e.key === "dc_access") loadData();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        syncAuth();
        loadData();
      }
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncAuth();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    try {
      const host = window.location.hostname;
      const slug = getTenantSlugFromHost(host);
      const isApex = host === 'digitalchain.in' || host === 'www.digitalchain.in' || host === 'localhost' || host === '127.0.0.1';
      // Show marketing only on apex/root host when no tenant slug is present
      setIsMarketingHost(Boolean(!slug && isApex));
    } catch {}
  }, [])

  const loadData = async () => {
    const token = localStorage.getItem("dc_access");
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch in parallel
      const h = withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } });
      const [orgRes, usersRes, mapsRes] = await Promise.all([
        fetch(`${base}org/settings`, h),
        fetch(`${base}org/users`, h),
        fetch(`${base}org/maps-usage`, h),
      ]);
      if (!orgRes.ok) throw new Error(`Org HTTP ${orgRes.status}`);
      const orgJson = await orgRes.json();
      setOrg({ name: orgJson.name, plan: orgJson.plan, status: orgJson.status, region: orgJson.region, timezone: orgJson.timezone });

      if (usersRes.ok) {
        const users: User[] = await usersRes.json();
        const total = users.length;
        const admins = users.filter(u => (u.role || '').toLowerCase() === 'admin' || (u.role || '').toLowerCase() === 'owner' || (u.role || '').toLowerCase() === 'superadmin').length;
        const managers = users.filter(u => ['manager','accountant manager','inventory manager','orders manager','delivery manager'].includes((u.role || '').toLowerCase())).length;
        const riders = users.filter(u => (u.role || '').toLowerCase() === 'rider').length;
        setUserStats({ total, admins, managers, riders });
      } else {
        setUserStats(null);
      }
      
      if (mapsRes.ok) {
        const mapsData = await mapsRes.json();
        setMapsUsage(mapsData);
      } else {
        // Set default empty data structure if endpoint fails
        setMapsUsage({ total_usage: 0, usage_by_endpoint: [], daily_usage_last_7_days: [] });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (isMarketingHost) {
    return <MarketingLanding />
  }

  // If not authenticated, show public company page
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                  {org?.name?.[0] || 'D'}
                </div>
                <h1 className="text-2xl font-bold text-gray-900">{org?.name || 'Digital Chain'}</h1>
              </div>
              <div className="flex items-center gap-3">
                <a href="/customer-login" className="px-4 py-2 text-purple-700 font-medium hover:text-purple-800 transition-colors">
                  Customer Login
                </a>
                <a href="/customer-register" className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors shadow-md">
                  Register
                </a>
                <a href="/login" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors border-l pl-4 ml-2">
                  Staff Login
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-gray-900 mb-6">
              Welcome to {org?.name || 'Digital Chain'}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
              Streamline your delivery operations with our comprehensive logistics platform
            </p>
            <div className="flex items-center justify-center gap-4">
              <a href="/customer-register" className="px-8 py-4 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-lg text-lg">
                Get Started
              </a>
              <a href="/customer-login" className="px-8 py-4 bg-white text-purple-700 font-bold rounded-lg hover:bg-gray-50 transition-colors shadow-lg border-2 border-purple-600 text-lg">
                Customer Portal
              </a>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mt-20">
            <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Track Orders</h3>
              <p className="text-gray-600">Real-time tracking of your deliveries with detailed status updates and notifications</p>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Manage Profile</h3>
              <p className="text-gray-600">Update your delivery addresses, contact information, and preferences anytime</p>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Order History</h3>
              <p className="text-gray-600">Access complete history of all your orders and delivery proof documents</p>
            </div>
          </div>

          {/* CTA Section */}
          <div className="mt-20 bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-800 rounded-2xl shadow-2xl p-12 text-center text-white">
            <h3 className="text-3xl font-bold mb-4">Ready to Get Started?</h3>
            <p className="text-lg text-purple-100 mb-8 max-w-2xl mx-auto">
              Create your customer account today and enjoy seamless order tracking and management
            </p>
            <a href="/customer-register" className="inline-block px-10 py-4 bg-white text-purple-700 font-bold rounded-lg hover:bg-gray-100 transition-colors shadow-lg text-lg">
              Create Account Now
            </a>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-white border-t mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center text-gray-600">
              <p>&copy; 2025 {org?.name || 'Digital Chain'}. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    )
  }

  // Authenticated admin dashboard
  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-gray-600">{org?.name ? `Welcome to ${org.name}` : 'Welcome! Use the navigation to manage your organization.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <a className="btn btn-secondary" href="/deliveries">View Deliveries</a>
        </div>
      </div>

      {authed && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Organization</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 truncate">{org?.name || '—'}</div>
            <div className="mt-1 text-sm text-gray-600">Plan: <span className="font-medium">{org?.plan || '—'}</span></div>
            <div className="mt-1 text-sm text-gray-600">Status: <span className="font-medium">{org?.status || '—'}</span></div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Users</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{userStats?.total ?? '—'}</div>
            <div className="mt-1 text-sm text-gray-600">Admins: <span className="font-medium">{userStats?.admins ?? '—'}</span></div>
            <div className="mt-1 text-sm text-gray-600">Managers: <span className="font-medium">{userStats?.managers ?? '—'}</span></div>
            <div className="mt-1 text-sm text-gray-600">Riders: <span className="font-medium">{userStats?.riders ?? '—'}</span></div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Region & Timezone</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{org?.region || '—'}</div>
            <div className="mt-1 text-sm text-gray-600">{org?.timezone || '—'}</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Google Maps API Usage</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {mapsUsage ? (mapsUsage.total_usage || 0).toLocaleString() : '—'}
            </div>
            <div className="mt-1 text-sm text-gray-600">Total requests</div>
            {mapsUsage && mapsUsage.usage_by_role && mapsUsage.usage_by_role.length > 0 && (
              <div className="mt-2 space-y-1">
                {mapsUsage.usage_by_role.map((item) => (
                  <div key={item.role} className="text-xs text-gray-500">
                    {item.role}: <span className="font-medium">{item.requests.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-lg font-semibold mb-2">Quick Links</h2>
          <ul className="list-disc pl-5 text-gray-700 space-y-1">
            <li><a className="text-brand-700 hover:underline" href="/orders">Orders</a></li>
            <li><a className="text-brand-700 hover:underline" href="/org-users">Users</a></li>

            <li><span className="text-gray-500">Reports (coming soon)</span></li>
          </ul>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-semibold mb-2">Status</h2>
          <div className="text-gray-700">
            {authed ? (
              <span>Signed in as <strong>{email || "Admin"}</strong>. Access protected pages like Deliveries and Users.</span>
            ) : (
              <span>API and Admin are live over HTTPS. Please log in to access protected pages.</span>
            )}
          </div>
          {loading && <div className="mt-2 text-sm text-gray-500">Loading dashboard…</div>}
          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        </div>
      </section>
    </main>
  );
}
