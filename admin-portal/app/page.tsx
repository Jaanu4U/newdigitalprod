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

type User = { role: string };

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const pathname = usePathname();
  const [isMarketingHost, setIsMarketingHost] = useState(false);

  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [userStats, setUserStats] = useState<{ total: number; admins: number; managers: number; riders: number } | null>(null);
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
      const [orgRes, usersRes] = await Promise.all([
        fetch(`${base}v1/org/settings`, h),
        fetch(`${base}v1/org/users`, h),
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
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (isMarketingHost) {
    return <MarketingLanding />
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-gray-600">{org?.name ? `Welcome to ${org.name}` : 'Welcome! Use the navigation to manage your organization.'}</p>
        </div>
        <div className="flex items-center gap-2">
          {!authed && <a className="btn btn-primary" href="/login">Login</a>}
          <a className="btn btn-secondary" href="/deliveries">View Deliveries</a>
        </div>
      </div>

      {!authed && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          You are not signed in. Use the Login button above to sign in with your admin email and password.
        </div>
      )}

      {authed && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
