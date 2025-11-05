// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Delivery = {
  delivery_id: string;
  order_id: string;
  customer: string;
  address: string;
  status: string;
};

export default function DeliveryDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchDelivery = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("dc_access");
      if (!token) return router.push("/login");
      const base = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/v1/").replace(/\/+$/, "/");
      const res = await fetch(`${base}rider/deliveries/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) return router.push("/login");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setDelivery(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDelivery(); }, [id]);

  const updateStatus = async (newStatus: string) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const token = localStorage.getItem("dc_access");
      if (!token) return router.push("/login");
      const base = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/v1/").replace(/\/+$/, "/");
      const res = await fetch(`${base}rider/deliveries/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, timestamp: new Date().toISOString() }),
      });
      if (res.status === 401) return router.push("/login");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setNotice("Status updated");
      await fetchDelivery();
    } catch (e: any) {
      setError(e.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Delivery Detail</h1>
        <a className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50" href="/deliveries">Back</a>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

      {loading && <div>Loading…</div>}
      {!loading && delivery && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Order ID" value={delivery.order_id} />
            <Field label="Status" value={delivery.status} />
            <Field label="Customer" value={delivery.customer} />
            <Field label="Address" value={delivery.address} />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button disabled={saving} onClick={() => updateStatus('assigned')} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">Mark Assigned</button>
            <button disabled={saving} onClick={() => updateStatus('in-transit')} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60">Mark In-Transit</button>
            <button disabled={saving} onClick={() => updateStatus('delivered')} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60">Mark Delivered</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-gray-900 font-medium">{value}</div>
    </div>
  );
}
