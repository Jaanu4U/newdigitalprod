// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";

type Delivery = {
  delivery_id: string;
  order_id: string;
  customer: string;
  address: string;
  status: string;
};

export default function DeliveriesPage() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"order"|"status">("order");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("dc_access");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const base = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/v1/").replace(/\/+$/, "/");
      const res = await fetch(`${base}rider/deliveries`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    let data = items.filter(
      (d) =>
        d.order_id.toLowerCase().includes(t) ||
        d.customer.toLowerCase().includes(t) ||
        d.address.toLowerCase().includes(t)
    );
    if (sort === "order") {
      data = data.sort((a, b) => a.order_id.localeCompare(b.order_id));
    } else if (sort === "status") {
      data = data.sort((a, b) => a.status.localeCompare(b.status));
    }
    return data;
  }, [items, q, sort]);

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Deliveries</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60">
            {loading ? "Loading…" : "Refresh"}
          </button>
          <a className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50" href="/">Dashboard</a>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:w-80 rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Search by order, customer, address"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Sort by</label>
            <select
              className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
            >
              <option value="order">Order ID</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Order ID</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No deliveries found.</td>
                </tr>
              )}
              {filtered.map((d, i) => (
                <tr key={d.delivery_id} className={i % 2 ? 'bg-gray-50/50' : ''}>
                  <td className="px-4 py-3 font-medium">{d.order_id}</td>
                  <td className="px-4 py-3">{d.customer}</td>
                  <td className="px-4 py-3">{d.address}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    <a className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50" href={`/deliveries/${d.delivery_id}`}>View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === 'delivered' ? 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white bg-green-600' : status === 'assigned' ? 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white bg-blue-600' : 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white bg-gray-500';
  return <span className={cls}>{status}</span>;
}
