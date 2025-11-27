"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Users } from "lucide-react";
import { getTenantSlugFromHost } from "@/lib/tenant";
import SuperAdminHeader from "@/components/SuperAdminHeader";

interface DashboardData {
  summary: {
    total_organizations: number;
    total_users: number;
    total_deliveries: number;
    status_breakdown: Record<string, number>;
  };
  organizations: Array<{
    org_id: string;
    name: string;
    status: string;
    users_count: number;
    deliveries_count: number;
    created_at: string;
  }>;
  recent_deliveries: Array<{
    delivery_id: string;
    org_id: string;
    order_id: string;
    customer: string;
    status: string;
    created_at: string;
  }>;
}

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    // Enforce SuperAdmin dashboard on apex only (redirect if on tenant subdomain)
    try {
      const host = window.location.hostname;
      const slug = getTenantSlugFromHost(host);
      if (slug) {
        window.location.href = "https://digitalchain.in/superadmin";
        return;
      }
    } catch {}

    // Check auth
    const role = localStorage.getItem("dc_role");
    const token = localStorage.getItem("dc_access");
    const userEmail = localStorage.getItem("dc_email");

    if (!token || role !== "SuperAdmin") {
      router.push("/superadmin/login");
      return;
    }

    if (userEmail) setEmail(userEmail);

    // Fetch dashboard data
    const fetchDashboard = async () => {
      try {
        const { apiBase } = await import("@/lib/api");
        const res = await fetch(`${apiBase()}v1/superadmin/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (res.status === 401) router.push("/superadmin/login");
          throw new Error("Failed to fetch dashboard");
        }

        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto p-4 mt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <strong>Error:</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, organizations, recent_deliveries } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperAdminHeader email={email} activeTab="dashboard" />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Summary Stats - Only Organizations and Users */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Organizations</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{summary.total_organizations}</p>
              </div>
              <BarChart3 className="text-blue-500 opacity-50" size={32} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Users</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{summary.total_users}</p>
              </div>
              <Users className="text-green-500 opacity-50" size={32} />
            </div>
          </div>
        </div>

        {/* Organizations Table */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">All Organizations</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Organization</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Users</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Deliveries</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {organizations.length > 0 ? (
                  organizations.map((org) => (
                    <tr key={org.org_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{org.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{org.org_id}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                            org.status === "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {org.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-gray-900 font-medium">
                        {org.users_count}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-900 font-medium">
                        {org.deliveries_count}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No organizations found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Deliveries */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Deliveries (Last 10)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Delivery ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Organization</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Order</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recent_deliveries.length > 0 ? (
                  recent_deliveries.map((delivery) => (
                    <tr key={delivery.delivery_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-sm text-gray-900">
                        {delivery.delivery_id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {delivery.org_id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-gray-600">
                        {delivery.order_id}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {delivery.customer}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                            delivery.status === "delivered"
                              ? "bg-green-100 text-green-800"
                              : delivery.status === "in_transit"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {delivery.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(delivery.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      No deliveries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
