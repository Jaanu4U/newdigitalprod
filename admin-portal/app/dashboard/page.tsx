// @ts-nocheck
"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";
import { BarChart3, Users, Package, TrendingUp, Building2 } from "lucide-react";

type OrgSettings = {
  name?: string;
  plan?: string;
  status?: string;
  region?: string;
  timezone?: string;
};

type User = { role: string };
type Delivery = { status: string };

export default function OrgAdminDashboard() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [userStats, setUserStats] = useState<{ total: number; admins: number; managers: number; riders: number } | null>(null);
  const [deliveryStats, setDeliveryStats] = useState<{ total: number; delivered: number; assigned: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(() => apiBase(), []);

  useEffect(() => {
    // Check if on tenant subdomain
    try {
      const host = window.location.hostname;
      const slug = getTenantSlugFromHost(host);
      if (!slug) {
        // On apex domain, redirect SuperAdmin to their dashboard
        const userRole = localStorage.getItem("dc_role");
        if (userRole === "SuperAdmin") {
          router.push("/superadmin");
          return;
        }
      }
    } catch {}

    // Check auth
    const token = localStorage.getItem("dc_access");
    const em = localStorage.getItem("dc_email");
    const r = localStorage.getItem("dc_role");
    
    if (!token) {
      router.push("/login");
      return;
    }

    // Redirect Rider to their dashboard
    if (r === "Rider") {
      router.push("/rider/dashboard");
      return;
    }

    setAuthed(!!token);
    setEmail(em);
    setRole(r);
    
    loadData(token);
  }, [router]);

  const loadData = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const h = withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } });
      const [orgRes, usersRes, delivRes] = await Promise.all([
        fetch(`${base}org/settings`, h),
        fetch(`${base}org/users`, h),
        fetch(`${base}rider/deliveries`, h),
      ]);
      
      if (!orgRes.ok) throw new Error(`Org HTTP ${orgRes.status}`);
      const orgJson = await orgRes.json();
      setOrg({ 
        name: orgJson.name, 
        plan: orgJson.plan, 
        status: orgJson.status, 
        region: orgJson.region, 
        timezone: orgJson.timezone 
      });

      if (usersRes.ok) {
        const users: User[] = await usersRes.json();
        const total = users.length;
        const admins = users.filter(u => ['admin','owner','superadmin'].includes((u.role || '').toLowerCase())).length;
        const managers = users.filter(u => ['manager','accountant manager','inventory manager','orders manager','delivery manager'].includes((u.role || '').toLowerCase())).length;
        const riders = users.filter(u => (u.role || '').toLowerCase() === 'rider').length;
        setUserStats({ total, admins, managers, riders });
      } else {
        setUserStats(null);
      }

      if (delivRes.ok) {
        const d = await delivRes.json();
        const items: Delivery[] = d.items || [];
        const total = items.length;
        const delivered = items.filter(i => (i.status || '').toLowerCase() === 'delivered').length;
        const assigned = items.filter(i => (i.status || '').toLowerCase() === 'assigned').length;
        const pending = total - delivered - assigned;
        setDeliveryStats({ total, delivered, assigned, pending });
      } else {
        setDeliveryStats(null);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Organization Dashboard</h1>
              <p className="text-gray-600 mt-1">
                {org?.name ? `Welcome to ${org.name}` : 'Manage your organization'}
              </p>
              {email && (
                <p className="text-sm text-gray-500 mt-1">
                  Signed in as <span className="font-medium">{email}</span>
                  {role && ` • ${role}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <a className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50" href="/deliveries">
                <Package size={16} />
                View Deliveries
              </a>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
            {error}
          </div>
        )}

        {!loading && (
          <>
            {/* Stats Grid */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-gray-600">Organization</div>
                  <Building2 className="text-brand-600" size={24} />
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">{org?.name || '—'}</div>
                <div className="text-sm text-gray-600">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    org?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {org?.status || '—'}
                  </span>
                  <span className="mx-2">•</span>
                  <span>{org?.plan || '—'}</span>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-gray-600">Users</div>
                  <Users className="text-green-600" size={24} />
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-2">{userStats?.total ?? '—'}</div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Admins: <span className="font-medium">{userStats?.admins ?? 0}</span></div>
                  <div>Managers: <span className="font-medium">{userStats?.managers ?? 0}</span></div>
                  <div>Riders: <span className="font-medium">{userStats?.riders ?? 0}</span></div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-gray-600">Deliveries</div>
                  <Package className="text-blue-600" size={24} />
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-2">{deliveryStats?.total ?? '—'}</div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Delivered: <span className="font-medium text-green-600">{deliveryStats?.delivered ?? 0}</span></div>
                  <div>Assigned: <span className="font-medium text-blue-600">{deliveryStats?.assigned ?? 0}</span></div>
                  <div>Pending: <span className="font-medium text-orange-600">{deliveryStats?.pending ?? 0}</span></div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-gray-600">Region</div>
                  <TrendingUp className="text-purple-600" size={24} />
                </div>
                <div className="text-xl font-bold text-gray-900 mb-1">{org?.region || '—'}</div>
                <div className="text-sm text-gray-600">{org?.timezone || '—'}</div>
              </div>
            </section>

            {/* Quick Links */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 size={20} className="text-brand-600" />
                  Quick Actions
                </h2>
                <ul className="space-y-2">
                  <li>
                    <a className="text-brand-700 hover:underline flex items-center gap-2" href="/deliveries">
                      → View All Deliveries
                    </a>
                  </li>
                  <li>
                    <a className="text-brand-700 hover:underline flex items-center gap-2" href="/org-users">
                      → Manage Users
                    </a>
                  </li>
                  <li>
                    <a className="text-brand-700 hover:underline flex items-center gap-2" href="/orders">
                      → View Orders
                    </a>
                  </li>
                  <li>
                    <a className="text-brand-700 hover:underline flex items-center gap-2" href="/customers">
                      → Manage Customers
                    </a>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h2 className="text-lg font-semibold mb-3">Settings</h2>
                <ul className="space-y-2">
                  <li>
                    <a className="text-brand-700 hover:underline flex items-center gap-2" href="/settings">
                      → Settings
                    </a>
                  </li>
                  <li>
                    <a className="text-brand-700 hover:underline flex items-center gap-2" href="/business-settings">
                      → Business Details
                    </a>
                  </li>
                  <li>
                    <a className="text-brand-700 hover:underline flex items-center gap-2" href="/billing">
                      → Billing & Invoices
                    </a>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h2 className="text-lg font-semibold mb-3">Status</h2>
                <div className="text-sm text-gray-700 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>System Online</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-gray-600">
                      All services are operational
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
