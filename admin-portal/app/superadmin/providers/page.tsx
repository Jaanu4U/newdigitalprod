"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost } from "@/lib/tenant";
import { Truck, Plus, RefreshCw, Pencil, Save, X, Link as LinkIcon, ToggleLeft, ToggleRight } from "lucide-react";
import SuperAdminHeader from "@/components/SuperAdminHeader";

type Provider = {
  provider_id: string;
  name: string;
  code: string;
  tracking_url?: string | null;
  active: boolean;
  created_at?: string;
};

export default function ProvidersAdminPage() {
  const router = useRouter();
  const base = useMemo(() => apiBase(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [items, setItems] = useState<Provider[]>([]);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", tracking_url: "", active: true });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; tracking_url: string; active: boolean }>({ name: "", tracking_url: "", active: true });
  const [editErr, setEditErr] = useState<string | null>(null);

  useEffect(() => {
    // Must be SuperAdmin on apex (no tenant slug)
    try {
      const slug = getTenantSlugFromHost();
      if (slug) {
        window.location.href = "https://digitalchain.in/superadmin/providers";
        return;
      }
    } catch {}

    const role = localStorage.getItem("dc_role");
    const t = localStorage.getItem("dc_access") || "";
    if (!t || role !== "SuperAdmin") {
      router.push("/login");
      return;
    }
    setToken(t);
    load(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const load = async (tkn?: string) => {
    const tk = tkn || token;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${base}v1/providers?all=true`, { headers: { Authorization: `Bearer ${tk}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(e.message || "Failed to load providers");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const validateCode = (v: string) => /^[A-Z0-9\-]{2,32}$/.test(v || "");

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const code = (form.code || "").toUpperCase();
    if (!form.name.trim()) { setFormErr("Name is required"); return; }
    if (!validateCode(code)) { setFormErr("Code must be 2-32 chars: A-Z, 0-9, dashes"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${base}providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name.trim(), code, tracking_url: form.tracking_url.trim() || undefined, active: !!form.active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      setShowForm(false);
      setForm({ name: "", code: "", tracking_url: "", active: true });
      await load();
    } catch (e: any) {
      setFormErr(e.message || "Failed to create provider");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: Provider) => {
    setEditId(p.provider_id);
    setEdit({ name: p.name, tracking_url: p.tracking_url || "", active: p.active });
    setEditErr(null);
  };

  const cancelEdit = () => { setEditId(null); setEditErr(null); };

  const saveEdit = async () => {
    if (!editId) return;
    setEditErr(null);
    if (!edit.name.trim()) { setEditErr("Name is required"); return; }
    try {
      const res = await fetch(`${base}v1/providers/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: edit.name.trim(), tracking_url: edit.tracking_url.trim(), active: !!edit.active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      setEditId(null);
      await load();
    } catch (e: any) {
      setEditErr(e.message || "Failed to update provider");
    }
  };

  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    try {
      const em = localStorage.getItem("dc_email") || "";
      setEmail(em);
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperAdminHeader email={email} activeTab="providers" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Truck className="text-brand-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Shipment Providers</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load()} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border hover:bg-gray-50 disabled:opacity-60">
              <RefreshCw size={16} /> Refresh
            </button>
            <button onClick={() => setShowForm((v)=>!v)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-green-600 text-white hover:bg-green-700">
              <Plus size={16} /> New Provider
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={onCreate} className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input value={form.name} onChange={(e)=>setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-md" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Code</label>
                <input value={form.code} onChange={(e)=>setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="FEDEX" className="w-full px-3 py-2 border rounded-md uppercase" required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Tracking URL</label>
                <input value={form.tracking_url} onChange={(e)=>setForm({ ...form, tracking_url: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div className="flex items-center gap-2 md:col-span-4">
                <input id="active" type="checkbox" checked={form.active} onChange={(e)=>setForm({ ...form, active: e.target.checked })} />
                <label htmlFor="active" className="text-sm">Active</label>
              </div>
            </div>
            {formErr && <div className="mt-2 text-sm text-red-600">{formErr}</div>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={()=>{ setShowForm(false); setFormErr(null); }} className="px-3 py-2 rounded-md border text-sm">Cancel</button>
              <button type="submit" disabled={saving} className="px-3 py-2 rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-60">{saving ? "Saving..." : "Create"}</button>
            </div>
          </form>
        )}

  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {error && <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Tracking URL</th>
                  <th className="px-4 py-2 text-left">Active</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No providers yet</td></tr>
                ) : (
                  items.map((p)=>{
                    const isEditing = editId === p.provider_id;
                    return (
                      <tr key={p.provider_id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 align-top">
                          {isEditing ? (
                            <input value={edit.name} onChange={(e)=>setEdit((s)=>({ ...s, name: e.target.value }))} className="px-2 py-1 border rounded w-full" />
                          ) : (
                            <span className="font-medium text-gray-900">{p.name}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top font-mono">{p.code}</td>
                        <td className="px-4 py-2 align-top">
                          {isEditing ? (
                            <input value={edit.tracking_url} onChange={(e)=>setEdit((s)=>({ ...s, tracking_url: e.target.value }))} className="px-2 py-1 border rounded w-full" />
                          ) : (
                            p.tracking_url ? <a href={p.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline"><LinkIcon size={14} /> {p.tracking_url}</a> : <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top">
                          {isEditing ? (
                            <button onClick={()=>setEdit((s)=>({ ...s, active: !s.active }))} className="inline-flex items-center gap-1 px-2 py-1 rounded border">
                              {edit.active ? <ToggleRight size={16} className="text-green-600"/> : <ToggleLeft size={16} className="text-gray-500"/>}
                              {edit.active ? "Active" : "Inactive"}
                            </button>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${p.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{p.active ? 'Active' : 'Inactive'}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <button onClick={saveEdit} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-brand-600 text-white text-xs"><Save size={14}/> Save</button>
                              <button onClick={cancelEdit} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs"><X size={14}/> Cancel</button>
                              {editErr && <span className="text-xs text-red-600 ml-2">{editErr}</span>}
                            </div>
                          ) : (
                            <button onClick={()=>startEdit(p)} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs"><Pencil size={14}/> Edit</button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}

              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
