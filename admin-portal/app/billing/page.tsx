"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";
import { Search, Receipt, FileText, Building2, User } from "lucide-react";

type Customer = {
  customer_id: string;
  ctype: "b2b" | "b2c";
  name?: string | null;
  company_name?: string | null;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pin?: string | null;
  notes?: string | null;
};

export default function BillingPage() {
  const router = useRouter();
  const base = useMemo(() => apiBase(), []);
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canBilling = (r: string | null) => {
    const rl = (r || "").toLowerCase();
    return rl === "admin" || rl === "owner" || rl === "superadmin" || rl === "billing staff";
  };

  useEffect(() => {
    const slug = getTenantSlugFromHost();
    if (!slug) {
      router.replace("/superadmin");
      return;
    }
    const t = localStorage.getItem("dc_access") || "";
    const r = localStorage.getItem("dc_role");
    setRole(r);
    if (!t) {
      router.push("/login");
      return;
    }
    if (!canBilling(r)) {
      router.replace("/");
      return;
    }
    fetchCustomers("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchCustomers = async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("dc_access") || "";
      const url = new URL(`${base}v1/customers`);
      if (search) url.searchParams.set("q", search);
      const res = await fetch(url.toString(), withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (e: any) {
      setError(e.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-6xl mx-auto px-4">
        {/* Professional Header with Gradient */}
        <div className="mb-6 bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-800 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Receipt className="w-7 h-7" />
                Billing
              </h1>
              <p className="text-emerald-100 text-sm mt-1">Generate invoices for your customers</p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
              <div className="text-2xl font-bold">{items.length}</div>
              <div className="text-xs text-emerald-100">Customers</div>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchCustomers(q)}
                placeholder="Search customers by name, company, phone..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/95 backdrop-blur-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-sm"
              />
            </div>
            <button 
              onClick={() => fetchCustomers(q)} 
              className="px-6 py-2.5 bg-white text-emerald-700 font-medium rounded-lg hover:bg-emerald-50 transition-colors shadow-sm"
            >
              Search
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>}

        {/* Helper card: manage customers link */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700 flex items-center gap-2">
              <FileText size={16} className="text-blue-600" />
              <span>Search and select a customer to generate an invoice.</span>
            </div>
            <a 
              href="/customers" 
              className="text-sm font-medium text-blue-700 hover:text-blue-800 bg-white px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
            >
              Manage Customers
            </a>
          </div>
        </div>

        {/* List customers */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100 text-left text-gray-700 border-b border-gray-200">
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Name / Company</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Address</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading customers...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No customers found</td></tr>
              ) : items.map((c) => (
                <tr key={c.customer_id} className="border-t border-gray-100 hover:bg-emerald-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {c.ctype === 'b2b' ? (
                        <Building2 className="w-5 h-5 text-blue-600" />
                      ) : (
                        <User className="w-5 h-5 text-green-600" />
                      )}
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        c.ctype === 'b2b' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {c.ctype.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.ctype === "b2b" ? (c.company_name || "-") : (c.name || "-")}</div>
                    <div className="text-xs text-gray-500">{c.ctype === "b2b" ? (c.name || "") : (c.company_name || "")}</div>
                    {c.gstin ? <div className="text-xs text-gray-500">GSTIN: {c.gstin}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900">{c.phone || "-"}</div>
                    <div className="text-xs text-gray-500">{c.email || ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900 truncate max-w-xs">{c.address || "-"}</div>
                    <div className="text-xs text-gray-500">{[c.city, c.state, c.pin].filter(Boolean).join(", ")}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a 
                      href={`/billing/invoice/${c.customer_id}?create=true`} 
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm hover:shadow-md font-medium text-sm"
                    >
                      <FileText size={14} />
                      Generate Invoice
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
