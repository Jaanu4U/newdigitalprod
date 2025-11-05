"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";
import { Building, Save, AlertCircle, Crosshair } from "lucide-react";
import { REGIONS, TIMEZONES, detectBrowserTimeZone } from "@/lib/constants";

interface OrgSettings {
  org_id: string;
  name: string;
  slug: string | null;
  custom_domain: string | null;
  region: string | null;
  timezone: string | null;
  plan: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  payment_settings?: any;
  email_settings?: any;
  maps_settings?: any;
}

type PaymentSettings = {
  enabled?: boolean;
  provider?: string; // e.g., Razorpay, Stripe, Cashfree
  currency?: string; // e.g., INR, USD
  public_key?: string;
  secret_key?: string;
};

type EmailSettings = {
  enabled?: boolean;
  provider?: string; // e.g., SMTP, SendGrid
  smtp_host?: string;
  smtp_port?: number | string;
  smtp_user?: string;
  smtp_password?: string;
  from_email?: string;
};

type MapsSettings = {
  enabled?: boolean;
  provider?: string; // e.g., google
  google_api_key?: string;
};

export default function OrgSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [timezone, setTimezone] = useState("");
  const [plan, setPlan] = useState("");
  const [role, setRole] = useState<string | null>(null);

  // Section-wise settings
  const [pay, setPay] = useState<PaymentSettings>({ enabled: false, provider: "", currency: "", public_key: "", secret_key: "" });
  const [email, setEmail] = useState<EmailSettings>({ enabled: false, provider: "SMTP", smtp_port: 587 });
  const [maps, setMaps] = useState<MapsSettings>({ enabled: false, provider: "google", google_api_key: "" });

  const base = useMemo(() => apiBase(), []);

  const isPrivileged = (r: string | null) => {
    const rl = (r || "").toLowerCase();
    return rl === "admin" || rl === "owner" || rl === "superadmin";
  };

  useEffect(() => {
    // Tenant-only page; redirect apex to SA dashboard
    const slug = getTenantSlugFromHost();
    if (!slug) {
      router.replace("/superadmin");
      return;
    }
    const t = localStorage.getItem("dc_access") || "";
    setRole(localStorage.getItem("dc_role"));
    if (!t) {
      router.push("/login");
      return;
    }
    fetchSettings(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchSettings = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}org/settings`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` },
      }));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: OrgSettings = await res.json();
      setSettings(data);
      setName(data.name || "");
      setRegion(data.region || "");
      setTimezone(data.timezone || "");
      setPlan(data.plan || "");
      // hydrate section-wise
      setPay({
        enabled: Boolean(data.payment_settings?.enabled) || false,
        provider: data.payment_settings?.provider || "",
        currency: data.payment_settings?.currency || "",
        public_key: data.payment_settings?.public_key || "",
        secret_key: data.payment_settings?.secret_key || "",
      });
      setEmail({
        enabled: Boolean(data.email_settings?.enabled) || false,
        provider: data.email_settings?.provider || "SMTP",
        smtp_host: data.email_settings?.smtp_host || "",
        smtp_port: data.email_settings?.smtp_port ?? 587,
        smtp_user: data.email_settings?.smtp_user || "",
        smtp_password: data.email_settings?.smtp_password || "",
        from_email: data.email_settings?.from_email || "",
      });
      setMaps({
        enabled: Boolean(data.maps_settings?.enabled) || false,
        provider: data.maps_settings?.provider || "google",
        google_api_key: data.maps_settings?.google_api_key || "",
      });
    } catch (e: any) {
      setError(e.message || "Failed to load organization settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("dc_access") || "";
      const res = await fetch(`${base}org/settings`, withTenantHeaders({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name, region, timezone, plan,
          payment_settings: pay,
          email_settings: {
            ...email,
            // coerce number
            smtp_port: typeof email.smtp_port === 'string' ? parseInt(email.smtp_port || '0', 10) || 0 : (email.smtp_port ?? 0),
          },
          maps_settings: maps,
        }),
      }));
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      alert("Organization settings updated");
    } catch (e: any) {
      setError(e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <Building className="text-brand-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Organization Settings</h1>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4 flex items-center gap-2"><AlertCircle size={16} /> {error}</div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={!isPrivileged(role)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
              <input
                type="text"
                value={settings?.slug || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                disabled={!isPrivileged(role)}
              >
                <option value="">Select region...</option>
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                {isPrivileged(role) && (
                  <button
                    type="button"
                    className="text-xs inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
                    onClick={() => {
                      const tz = detectBrowserTimeZone();
                      if (tz) setTimezone(tz);
                    }}
                    title="Use my browser timezone"
                  >
                    <Crosshair size={12} /> Use my timezone
                  </button>
                )}
              </div>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                disabled={!isPrivileged(role)}
              >
                <option value="">Select timezone...</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
              <input
                type="text"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={!isPrivileged(role)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <input
                type="text"
                value={settings?.status || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                disabled
              />
            </div>
          </div>

            {/* Payment Settings */}
            <div className="pt-2 border-t border-gray-200" />
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Payment Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={!!pay.enabled} onChange={(e) => setPay({ ...pay, enabled: e.target.checked })} disabled={!isPrivileged(role)} />
                  Enable payments
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <select value={pay.provider || ""} onChange={(e) => setPay({ ...pay, provider: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Select provider...</option>
                    <option value="Razorpay">Razorpay</option>
                    <option value="Stripe">Stripe</option>
                    <option value="Cashfree">Cashfree</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input value={pay.currency || ""} onChange={(e) => setPay({ ...pay, currency: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="INR" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Public Key</label>
                  <input value={pay.public_key || ""} onChange={(e) => setPay({ ...pay, public_key: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="pk_..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                  <input value={pay.secret_key || ""} onChange={(e) => setPay({ ...pay, secret_key: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="sk_..." />
                </div>
              </div>
            </div>

            {/* Email Settings */}
            <div className="pt-2 border-t border-gray-200" />
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Email Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={!!email.enabled} onChange={(e) => setEmail({ ...email, enabled: e.target.checked })} disabled={!isPrivileged(role)} />
                  Enable email
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <select value={email.provider || "SMTP"} onChange={(e) => setEmail({ ...email, provider: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="SMTP">SMTP</option>
                    <option value="SendGrid">SendGrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                  <input value={email.smtp_host || ""} onChange={(e) => setEmail({ ...email, smtp_host: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="smtp.example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                  <input type="number" value={email.smtp_port as any} onChange={(e) => setEmail({ ...email, smtp_port: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="587" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP User</label>
                  <input value={email.smtp_user || ""} onChange={(e) => setEmail({ ...email, smtp_user: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="user@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
                  <input type="password" value={email.smtp_password || ""} onChange={(e) => setEmail({ ...email, smtp_password: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="••••••••" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                  <input value={email.from_email || ""} onChange={(e) => setEmail({ ...email, from_email: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="no-reply@yourdomain.com" />
                </div>
              </div>
            </div>

            {/* Maps Settings */}
            <div className="pt-2 border-t border-gray-200" />
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Google Maps Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={!!maps.enabled} onChange={(e) => setMaps({ ...maps, enabled: e.target.checked })} disabled={!isPrivileged(role)} />
                  Enable Maps
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <input value={maps.provider || "google"} onChange={(e) => setMaps({ ...maps, provider: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Google Maps API Key</label>
                  <input value={maps.google_api_key || ""} onChange={(e) => setMaps({ ...maps, google_api_key: e.target.value })} disabled={!isPrivileged(role)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="AIza..." />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
            {!isPrivileged(role) && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                You have read-only access. Only Admin/Owner can update settings.
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || !isPrivileged(role)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                title={!isPrivileged(role) ? "You don't have permission to update settings" : undefined}
              >
                <Save size={16} /> {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
