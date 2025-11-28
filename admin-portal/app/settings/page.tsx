"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";
import { User, KeyRound, Loader2, Building, Save, AlertCircle, Crosshair, MapPin, Package, MessageCircle, Briefcase, CreditCard, Mail } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { REGIONS, TIMEZONES, detectBrowserTimeZone } from "@/lib/constants";

interface Me {
  user_id: string;
  email: string;
  name: string | null;
  cellnumber: string | null;
  role: string;
  team: string | null;
  status: string;
  created_at: string | null;
}

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
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  payment_settings?: any;
  email_settings?: any;
  maps_settings?: any;
  business_settings?: any;
  provider_settings?: any;
  whatsapp_settings?: any;
}

type PaymentSettings = {
  enabled?: boolean;
  provider?: string;
  currency?: string;
  public_key?: string;
  secret_key?: string;
  webhook_secret?: string;
  upi?: {
    merchant_vpa?: string;
    merchant_name?: string;
    qr_expiry_minutes?: number;
  };
};

type EmailSettings = {
  enabled?: boolean;
  provider?: string;
  smtp_host?: string;
  smtp_port?: number | string;
  smtp_user?: string;
  smtp_password?: string;
  from_email?: string;
};

type MapsSettings = {
  enabled?: boolean;
  provider?: string;
  google_api_key?: string;
  google_api_key_present?: boolean;
};

type BusinessSettings = {
  gstin?: string;
  company_registration?: string;
  drug_license?: string;
  fssai?: string;
  logo_data_url?: string;
};

type ProviderSettings = {
  default_provider_code?: string;
  enabled_provider_codes?: string[];
};

type WhatsAppAccount = {
  id: string;
  label: string;
  number: string;
  api_key?: string;
  is_default: boolean;
  status: string;
};

type WhatsAppSettings = {
  enabled?: boolean;
  provider?: string;
  accounts?: WhatsAppAccount[];
};

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [slug, setSlug] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // User profile states
  const [name, setName] = useState("");
  const [cell, setCell] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Organization settings states
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [orgName, setOrgName] = useState("");
  const [region, setRegion] = useState("");
  const [timezone, setTimezone] = useState("");
  const [plan, setPlan] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingUpi, setSavingUpi] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingMaps, setSavingMaps] = useState(false);

  const [pay, setPay] = useState<PaymentSettings>({ enabled: false, provider: "", currency: "", public_key: "", secret_key: "" });
  const [email, setEmail] = useState<EmailSettings>({ enabled: false, provider: "SMTP", smtp_port: 587 });
  const [maps, setMaps] = useState<MapsSettings>({ enabled: false, provider: "google", google_api_key: "" });
  const [business, setBusiness] = useState<BusinessSettings>({});
  const [providers, setProviders] = useState<ProviderSettings>({ enabled_provider_codes: [] });
  const [whatsapp, setWhatsApp] = useState<WhatsAppSettings>({ enabled: false, accounts: [] });
  const [availableProviders, setAvailableProviders] = useState<Array<{code: string, name: string}>>([]);

  const base = useMemo(() => apiBase(), []);

  const isPrivileged = (r: string | null) => {
    const rl = (r || "").toLowerCase();
    return rl === "admin" || rl === "owner" || rl === "superadmin";
  };

  useEffect(() => {
    const tenantSlug = getTenantSlugFromHost();
    setSlug(tenantSlug);
    
    const t = localStorage.getItem("dc_access") || "";
    const r = localStorage.getItem("dc_role");
    setRole(r);
    
    if (!t) {
      router.push("/login");
      return;
    }
    
    setToken(t);
    fetchMe(t);
    
    // Fetch org settings only if user is in a tenant organization
    if (tenantSlug) {
      fetchOrgSettings(t);
      fetchAvailableProviders(t);
    }
  }, [router]);

  const fetchAvailableProviders = async (accessToken: string) => {
    try {
      const res = await fetch(`${base}v1/providers`, withTenantHeaders({
        headers: { Authorization: `Bearer ${accessToken}` },
      }));
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          setAvailableProviders(data.items.map((p: any) => ({ code: p.code, name: p.name })));
        }
      }
    } catch (e) {
      console.error('Failed to fetch providers:', e);
    }
  };

  const fetchMe = async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}v1/me`, withTenantHeaders({
        headers: { Authorization: `Bearer ${accessToken}` },
      }));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMe(data);
      setName(data.name || "");
      setCell(data.cellnumber || "");
    } catch (e: any) {
      setError(e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgSettings = async (accessToken: string) => {
    setError(null);
    try {
      const res = await fetch(`${base}v1/org/settings`, withTenantHeaders({
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: OrgSettings = await res.json();
      setOrgSettings(data);
      setOrgName(data.name || "");
      setRegion(data.region || "");
      setTimezone(data.timezone || "");
      setPlan(data.plan || "");
      setAddress(data.address || "");
      setCity(data.city || "");
      setState(data.state || "");
      setPincode(data.pincode || "");
      setCountry(data.country || "");
      setPay({
        enabled: Boolean(data.payment_settings?.enabled) || false,
        provider: data.payment_settings?.provider || "",
        currency: data.payment_settings?.currency || "",
        public_key: data.payment_settings?.public_key || "",
        secret_key: data.payment_settings?.secret_key || "",
        upi: {
          merchant_vpa: data.payment_settings?.upi?.merchant_vpa || "",
          merchant_name: data.payment_settings?.upi?.merchant_name || "",
          qr_expiry_minutes: data.payment_settings?.upi?.qr_expiry_minutes || 15,
        },
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
        google_api_key_present: data.maps_settings?.google_api_key_present || false,
      } as any);
      setBusiness({
        gstin: data.business_settings?.gstin || "",
        company_registration: data.business_settings?.company_registration || "",
        drug_license: data.business_settings?.drug_license || "",
        fssai: data.business_settings?.fssai || "",
        logo_data_url: data.business_settings?.logo_data_url || "",
      });
      setProviders({
        default_provider_code: data.provider_settings?.default_provider_code || "",
        enabled_provider_codes: data.provider_settings?.enabled_provider_codes || [],
      });
      setWhatsApp({
        enabled: Boolean(data.whatsapp_settings?.enabled) || false,
        provider: data.whatsapp_settings?.provider || "whatsapp-web-js",
        accounts: data.whatsapp_settings?.accounts || [],
      });
    } catch (e: any) {
      // Silently fail if org settings not available
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${base}v1/me`, withTenantHeaders({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, cellnumber: cell }),
      }));
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      await fetchMe(token);
      setSuccess("Profile updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setPwSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${base}v1/me/password`, withTenantHeaders({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      }));
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password changed successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  const putOrgSettings = async (body: any) => {
    const res = await fetch(`${base}v1/org/settings`, withTenantHeaders({
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }));
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail || `HTTP ${res.status}`);
    }
    return res.json().catch(() => ({}));
  };

  const handleSaveOrg = async () => {
    setError(null);
    setSuccess(null);
    setSavingOrg(true);
    try {
      await putOrgSettings({ 
        name: orgName, 
        region, 
        timezone, 
        plan,
        address,
        city,
        state,
        pincode,
        country
      });
      await fetchOrgSettings(token);
      setSuccess("Organization settings updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save organization settings");
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSavePayment = async () => {
    setError(null);
    setSuccess(null);
    setSavingPayment(true);
    try {
      await putOrgSettings({ payment_settings: pay });
      await fetchOrgSettings(token);
      setSuccess("Payment settings updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save payment settings");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSaveUpi = async () => {
    setError(null);
    setSuccess(null);
    setSavingUpi(true);
    try {
      await putOrgSettings({ payment_settings: { ...pay, upi: pay.upi } });
      await fetchOrgSettings(token);
      setSuccess("UPI settings updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save UPI settings");
    } finally {
      setSavingUpi(false);
    }
  };

  const handleSaveEmail = async () => {
    setError(null);
    setSuccess(null);
    setSavingEmail(true);
    try {
      await putOrgSettings({ email_settings: email });
      await fetchOrgSettings(token);
      setSuccess("Email settings updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save email settings");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveMaps = async () => {
    setError(null);
    setSuccess(null);
    setSavingMaps(true);
    try {
      // Prepare maps payload - exclude google_api_key if it's empty and one already exists
      const mapsPayload: any = {
        enabled: maps.enabled,
        provider: maps.provider,
      };
      
      // Only include google_api_key if it has a real value (not empty/masked)
      if (maps.google_api_key && maps.google_api_key.trim() !== "" && !maps.google_api_key.includes("•")) {
        mapsPayload.google_api_key = maps.google_api_key;
      }
      
      await putOrgSettings({ maps_settings: mapsPayload });
      await fetchOrgSettings(token);
      setSuccess("Maps settings updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save maps settings");
    } finally {
      setSavingMaps(false);
    }
  };

  const handleSaveBusiness = async () => {
    setError(null);
    setSuccess(null);
    try {
      await putOrgSettings({ business_settings: business });
      await fetchOrgSettings(token);
      setSuccess("Business settings updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save business settings");
    }
  };

  const handleSaveProviders = async () => {
    setError(null);
    setSuccess(null);
    try {
      await putOrgSettings({ provider_settings: providers });
      await fetchOrgSettings(token);
      setSuccess("Provider settings updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save provider settings");
    }
  };

  const handleSaveWhatsApp = async () => {
    setError(null);
    setSuccess(null);
    try {
      await putOrgSettings({ whatsapp_settings: whatsapp });
      await fetchOrgSettings(token);
      setSuccess("WhatsApp settings updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save WhatsApp settings");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="animate-spin" size={20} /> Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Settings</h1>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 mb-4">
            {success}
          </div>
        )}

        {/* User Profile Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-brand-600 flex items-center justify-center">
              <User size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">User Profile</h2>
              <p className="text-sm text-gray-500">Manage your personal information</p>
            </div>
          </div>
          
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={cell}
                  onChange={(e) => setCell(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t">
              <button 
                type="submit" 
                disabled={saving} 
                className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
              <KeyRound size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
              <p className="text-sm text-gray-500">Update your password to keep your account secure</p>
            </div>
          </div>
          
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Current password"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Re-enter new password"
                  required
                  minLength={8}
                />
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t">
              <button 
                type="submit" 
                disabled={pwSaving} 
                className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-gray-800 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {pwSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Organization Settings - Only show for tenant users with privileged role */}
        {slug && isPrivileged(role) && orgSettings && (
          <>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
                  <Building size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Organization Settings</h2>
                  <p className="text-sm text-gray-500">Manage your organization configuration</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
                  <input
                    type="text"
                    value={orgSettings?.slug || ""}
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
                  </div>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
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
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <input
                    type="text"
                    value={orgSettings?.status || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                    disabled
                  />
                </div>
              </div>

              {/* Address Fields */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-md font-semibold text-gray-900 mb-4">Organization Address</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="123 Main Street"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Mumbai"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Maharashtra"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PIN/ZIP Code</label>
                      <input
                        type="text"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="400001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="India"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <button
                  onClick={handleSaveOrg}
                  disabled={savingOrg}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {savingOrg ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Payment Settings */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-purple-600 flex items-center justify-center">
                  <CreditCard size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Payment Settings</h3>
                  <p className="text-sm text-gray-500">Configure payment gateway integration</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={!!pay.enabled} onChange={(e) => setPay({ ...pay, enabled: e.target.checked })} />
                  Enable payments
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <select value={pay.provider || ""} onChange={(e) => setPay({ ...pay, provider: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Select provider...</option>
                    <option value="Razorpay">Razorpay</option>
                    <option value="Stripe">Stripe</option>
                    <option value="Cashfree">Cashfree</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input value={pay.currency || ""} onChange={(e) => setPay({ ...pay, currency: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="INR" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Public Key</label>
                  <input value={pay.public_key || ""} onChange={(e) => setPay({ ...pay, public_key: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="pk_..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                  <input type="password" value={pay.secret_key || ""} onChange={(e) => setPay({ ...pay, secret_key: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="sk_..." />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Secret
                    <span className="text-xs text-gray-500 ml-2">(Optional - Required for auto payment confirmation)</span>
                  </label>
                  <input 
                    type="password" 
                    value={pay.webhook_secret || ""} 
                    onChange={(e) => setPay({ ...pay, webhook_secret: e.target.value })} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md" 
                    placeholder="whsec_..." 
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Get this from Razorpay Dashboard → Settings → Webhooks. Required for automatic payment confirmation.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={handleSavePayment}
                  disabled={savingPayment}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {savingPayment ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* UPI Settings */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-orange-600 flex items-center justify-center">
                  <CreditCard size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">UPI QR Code Settings</h3>
                  <p className="text-sm text-gray-500">Configure merchant UPI details for QR code payments</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Merchant UPI Address (VPA) <span className="text-red-500">*</span>
                  </label>
                  <input 
                    value={pay.upi?.merchant_vpa || ""} 
                    onChange={(e) => setPay({ 
                      ...pay, 
                      upi: { ...pay.upi, merchant_vpa: e.target.value } 
                    })} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md" 
                    placeholder="merchant@paytm or merchant@ybl or 9876543210@okaxis" 
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your UPI address where payments will be received (e.g., yourname@paytm, yourname@ybl)
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Merchant Name <span className="text-red-500">*</span>
                  </label>
                  <input 
                    value={pay.upi?.merchant_name || ""} 
                    onChange={(e) => setPay({ 
                      ...pay, 
                      upi: { ...pay.upi, merchant_name: e.target.value } 
                    })} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md" 
                    placeholder="Your Business Name" 
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Business or merchant name that appears in the payment request
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    QR Code Expiry (minutes)
                  </label>
                  <input 
                    type="number" 
                    value={pay.upi?.qr_expiry_minutes || 15} 
                    onChange={(e) => setPay({ 
                      ...pay, 
                      upi: { ...pay.upi, qr_expiry_minutes: parseInt(e.target.value) || 15 } 
                    })} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md" 
                    placeholder="15" 
                    min="1"
                    max="120"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    How long the QR code remains valid (1-120 minutes)
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={handleSaveUpi}
                  disabled={savingUpi}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {savingUpi ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Email Settings */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
                  <Mail size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Email Settings</h3>
                  <p className="text-sm text-gray-500">Configure SMTP or email service provider</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={!!email.enabled} onChange={(e) => setEmail({ ...email, enabled: e.target.checked })} />
                  Enable email
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <select value={email.provider || "SMTP"} onChange={(e) => setEmail({ ...email, provider: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="SMTP">SMTP</option>
                    <option value="SendGrid">SendGrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                  <input value={email.smtp_host || ""} onChange={(e) => setEmail({ ...email, smtp_host: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="smtp.example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                  <input type="number" value={email.smtp_port as any} onChange={(e) => setEmail({ ...email, smtp_port: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="587" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP User</label>
                  <input value={email.smtp_user || ""} onChange={(e) => setEmail({ ...email, smtp_user: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="user@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
                  <input type="password" value={email.smtp_password || ""} onChange={(e) => setEmail({ ...email, smtp_password: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="••••••••" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                  <input value={email.from_email || ""} onChange={(e) => setEmail({ ...email, from_email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="no-reply@yourdomain.com" />
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={handleSaveEmail}
                  disabled={savingEmail}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {savingEmail ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Maps Settings */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center">
                  <MapPin size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Google Maps Settings</h3>
                  <p className="text-sm text-gray-500">Configure maps and location services</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={!!maps.enabled} onChange={(e) => setMaps({ ...maps, enabled: e.target.checked })} />
                  Enable Maps
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <input value={maps.provider || "google"} onChange={(e) => setMaps({ ...maps, provider: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Google Maps API Key
                  </label>
                  
                  {(maps as any).google_api_key_present ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                        <div className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm font-medium text-green-700">API Key Saved</span>
                        <span className="text-xs text-green-600 ml-auto">••••••••••••••••</span>
                      </div>
                      <input 
                        type="password"
                        value={maps.google_api_key || ""} 
                        onChange={(e) => setMaps({ ...maps, google_api_key: e.target.value })} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500" 
                        placeholder="Enter new API key to replace existing one (optional)" 
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <div className="flex-shrink-0 w-2 h-2 bg-yellow-500 rounded-full"></div>
                        <span className="text-sm font-medium text-yellow-700">No API Key Configured</span>
                      </div>
                      <input 
                        type="password"
                        value={maps.google_api_key || ""} 
                        onChange={(e) => setMaps({ ...maps, google_api_key: e.target.value })} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500" 
                        placeholder="Enter Google Maps API key (AIza...)" 
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={handleSaveMaps}
                  disabled={savingMaps}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {savingMaps ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Business Settings */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center">
                  <Briefcase size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Business Information</h3>
                  <p className="text-sm text-gray-500">Company registration and compliance details</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                  <input
                    value={business.gstin || ""}
                    onChange={(e) => setBusiness({ ...business, gstin: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="29ABCDE1234F1Z5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Registration</label>
                  <input
                    value={business.company_registration || ""}
                    onChange={(e) => setBusiness({ ...business, company_registration: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="CIN/Registration number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Drug License</label>
                  <input
                    value={business.drug_license || ""}
                    onChange={(e) => setBusiness({ ...business, drug_license: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="License number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">FSSAI</label>
                  <input
                    value={business.fssai || ""}
                    onChange={(e) => setBusiness({ ...business, fssai: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="FSSAI license"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={handleSaveBusiness}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>

            {/* Shipping Providers */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-orange-600 flex items-center justify-center">
                  <Package size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Shipping Providers</h3>
                  <p className="text-sm text-gray-500">Configure courier and delivery partners</p>
                </div>
              </div>
              {availableProviders.length === 0 ? (
                <div className="text-sm text-gray-500">Loading providers...</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Default Provider</label>
                    <select
                      value={providers.default_provider_code || ""}
                      onChange={(e) => setProviders({ ...providers, default_provider_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">Select default provider...</option>
                      {availableProviders.map((provider) => (
                        <option key={provider.code} value={provider.code}>{provider.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Enabled Providers</label>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {availableProviders.map((provider) => (
                        <label key={provider.code} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={providers.enabled_provider_codes?.includes(provider.code)}
                            onChange={(e) => {
                              const codes = providers.enabled_provider_codes || [];
                              if (e.target.checked) {
                                setProviders({ ...providers, enabled_provider_codes: [...codes, provider.code] });
                              } else {
                                setProviders({ ...providers, enabled_provider_codes: codes.filter(c => c !== provider.code) });
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">{provider.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={handleSaveProviders}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>

            {/* WhatsApp Settings */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center">
                  <MessageCircle size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">WhatsApp Integration</h3>
                  <p className="text-sm text-gray-500">Configure WhatsApp Business accounts</p>
                </div>
              </div>
              <div className="space-y-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!whatsapp.enabled}
                    onChange={(e) => setWhatsApp({ ...whatsapp, enabled: e.target.checked })}
                  />
                  Enable WhatsApp integration
                </label>
                
                {whatsapp.enabled && (
                  <>
                    {/* Provider Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        WhatsApp Provider
                      </label>
                      <select
                        value={whatsapp.provider || "whatsapp-web-js"}
                        onChange={(e) => setWhatsApp({ ...whatsapp, provider: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                      >
                        <option value="whatsapp-web-js">whatsapp-web.js (Recommended)</option>
                        <option value="whatsapp-business">WhatsApp Business API</option>
                        <option value="twilio">Twilio</option>
                        <option value="gupshup">Gupshup</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        whatsapp-web.js connects to WhatsApp Web - requires QR code scanning for authentication
                      </p>
                    </div>

                    {/* Add Account Form */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">
                        {whatsapp.provider === 'whatsapp-web-js' ? 'Add WhatsApp Session' : 'Add WhatsApp Account'}
                      </h4>
                      {whatsapp.provider === 'whatsapp-web-js' && (
                        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                          <strong>Note:</strong> After adding a session, you'll need to scan a QR code on the backend server to authenticate.
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Session Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g., main-support"
                            id="whatsapp-label-input"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phone Number
                          </label>
                          <input
                            type="text"
                            placeholder="e.g., +919876543210"
                            id="whatsapp-number-input"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        {whatsapp.provider !== 'whatsapp-web-js' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              API Key / Token
                            </label>
                            <input
                              type="password"
                              placeholder="Enter API key"
                              id="whatsapp-api-key-input"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Status
                          </label>
                          <select
                            id="whatsapp-status-input"
                            defaultValue="inactive"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-500"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive (Needs QR Scan)</option>
                            <option value="ready">Ready</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            id="whatsapp-default-input"
                          />
                          Set as default session
                        </label>
                      </div>
                      <div className="flex justify-end mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            const labelInput = document.getElementById("whatsapp-label-input") as HTMLInputElement;
                            const numberInput = document.getElementById("whatsapp-number-input") as HTMLInputElement;
                            const apiKeyInput = document.getElementById("whatsapp-api-key-input") as HTMLInputElement;
                            const statusInput = document.getElementById("whatsapp-status-input") as HTMLSelectElement;
                            const defaultInput = document.getElementById("whatsapp-default-input") as HTMLInputElement;
                            
                            const label = labelInput?.value.trim();
                            const number = numberInput?.value.trim();
                            const apiKey = apiKeyInput?.value.trim() || undefined;
                            const status = statusInput?.value || "inactive";
                            const isDefault = defaultInput?.checked || false;
                            
                            if (!label || !number) {
                              alert("Please enter session name and phone number");
                              return;
                            }
                            
                            if (whatsapp.provider !== 'whatsapp-web-js' && !apiKey) {
                              alert("API key is required for this provider");
                              return;
                            }
                            
                            const newAccount = {
                              id: `wa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                              label,
                              number,
                              api_key: apiKey,
                              status,
                              is_default: isDefault,
                            };
                            
                            const accounts = [...(whatsapp.accounts || [])];
                            if (isDefault) {
                              // Unset other defaults
                              accounts.forEach(acc => acc.is_default = false);
                            }
                            accounts.push(newAccount);
                            
                            setWhatsApp({ ...whatsapp, accounts });
                            
                            // Clear form
                            if (labelInput) labelInput.value = "";
                            if (numberInput) numberInput.value = "";
                            if (apiKeyInput) apiKeyInput.value = "";
                            if (defaultInput) defaultInput.checked = false;
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                        >
                          Add {whatsapp.provider === 'whatsapp-web-js' ? 'Session' : 'Account'}
                        </button>
                      </div>
                    </div>

                    {/* Connected Accounts List */}
                    {whatsapp.accounts && whatsapp.accounts.length > 0 && (
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          {whatsapp.provider === 'whatsapp-web-js' ? 'Active Sessions' : 'Connected Accounts'}
                        </h4>
                        <div className="space-y-2">
                          {whatsapp.accounts.map((account, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-white rounded border">
                              <div>
                                <div className="font-medium text-sm">{account.label}</div>
                                <div className="text-xs text-gray-500">{account.number}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                {account.is_default && (
                                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">Default</span>
                                )}
                                <span className={`text-xs px-2 py-1 rounded ${
                                  account.status === 'active' || account.status === 'ready' 
                                    ? 'bg-green-100 text-green-700' 
                                    : account.status === 'inactive'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {account.status === 'inactive' && whatsapp.provider === 'whatsapp-web-js' 
                                    ? 'Needs QR Scan' 
                                    : account.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const accounts = whatsapp.accounts?.filter((_, i) => i !== idx) || [];
                                    setWhatsApp({ ...whatsapp, accounts });
                                  }}
                                  className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={handleSaveWhatsApp}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}