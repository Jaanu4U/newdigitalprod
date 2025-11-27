"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { Loader2, Save, Map, AlertCircle, CheckCircle2, Mail } from "lucide-react";
import SuperAdminHeader from "@/components/SuperAdminHeader";

interface MapsConfig {
  enabled?: boolean;
  provider?: string;
  google_api_key?: string;
  google_api_key_present?: boolean;
  google_api_key_last4?: string | null;
}

interface EmailConfig {
  provider?: string;
  mailgun?: {
    domain?: string;
    from_email?: string;
    api_key?: string;
    api_key_present?: boolean;
  };
}

export default function SuperAdminMapsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const [mapsConfig, setMapsConfig] = useState<MapsConfig>({
    enabled: false,
    provider: "google",
    google_api_key: "",
  });

  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    provider: "",
    mailgun: {},
  });

  const base = apiBase();

  useEffect(() => {
    const t = localStorage.getItem("dc_access") || "";
    const role = localStorage.getItem("dc_role") || "";
    const em = localStorage.getItem("dc_email") || "";

    if (!t || role !== "SuperAdmin") {
      router.push("/superadmin/login");
      return;
    }

    setToken(t);
    setEmail(em);
    fetchConfig(t);
  }, [router]);

  const fetchConfig = async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch maps config
      const mapsRes = await fetch(`${base}v1/platform/maps-config`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (mapsRes.status === 401) {
        router.push("/superadmin/login");
        return;
      }

      if (mapsRes.ok) {
        const mapsData = await mapsRes.json();
        setMapsConfig({
          enabled: mapsData.enabled || false,
          provider: mapsData.provider || "google",
          google_api_key: mapsData.google_api_key || "",
          google_api_key_present: mapsData.google_api_key_present || false,
          google_api_key_last4: mapsData.google_api_key_last4 || null,
        });
      }

      // Fetch email config
      const emailRes = await fetch(`${base}v1/platform/email-config`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (emailRes.ok) {
        const emailData = await emailRes.json();
        setEmailConfig({
          provider: emailData.provider || "",
          mailgun: emailData.mailgun || {},
        });
      }
    } catch (e: any) {
      setError(e.message || "Failed to load platform configuration");
    } finally {
      setLoading(false);
    }
  };

  const saveEmailConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${base}v1/platform/email-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: emailConfig.provider,
          mailgun: emailConfig.mailgun,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }

      await fetchConfig(token);
      setSuccess("Email configuration updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save email configuration");
    } finally {
      setSaving(false);
    }
  };

  const saveMapsConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${base}v1/platform/maps-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: mapsConfig.enabled,
          provider: mapsConfig.provider,
          google_api_key: mapsConfig.google_api_key || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }

      await fetchConfig(token);
      setSuccess("Maps configuration updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="animate-spin" size={20} /> Loading maps configuration...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperAdminHeader email={email} activeTab="platform" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Platform Settings</h1>
          <p className="text-gray-600 mt-1">
            Configure platform-wide email and maps integration for all organizations
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 mb-4 flex items-center gap-2">
            <CheckCircle2 size={16} /> {success}
          </div>
        )}

        {/* Email Configuration (Editable) */}
        {emailConfig.provider === 'mailgun' && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-purple-600 flex items-center justify-center">
                <Mail size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Email Configuration</h2>
                <p className="text-sm text-gray-500">
                  Mailgun email service for notifications
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider
                </label>
                <input
                  type="text"
                  value={emailConfig.provider}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mailgun Domain
                </label>
                <input
                  type="text"
                  value={emailConfig.mailgun?.domain || ''}
                  onChange={(e) => setEmailConfig({
                    ...emailConfig,
                    mailgun: { ...emailConfig.mailgun, domain: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="yourdomain.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Email Address
                </label>
                <input
                  type="email"
                  value={emailConfig.mailgun?.from_email || ''}
                  onChange={(e) => setEmailConfig({
                    ...emailConfig,
                    mailgun: { ...emailConfig.mailgun, from_email: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="noreply@yourdomain.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mailgun API Key
                </label>
                <input
                  type="text"
                  value={emailConfig.mailgun?.api_key || (emailConfig.mailgun?.api_key_present ? '••••••••••••••••••••••••' : '')}
                  onChange={(e) => setEmailConfig({
                    ...emailConfig,
                    mailgun: { ...emailConfig.mailgun, api_key: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="key-..."
                />
                {emailConfig.mailgun?.api_key_present && (
                  <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 size={12} /> API key is configured (enter new key to update)
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={saveEmailConfig}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Email Config
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Google Maps Configuration */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
              <Map size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Google Maps Configuration</h2>
              <p className="text-sm text-gray-500">
                Central API key used by all organizations
              </p>
            </div>
          </div>

          <form onSubmit={saveMapsConfig} className="space-y-6">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="enabled"
                checked={mapsConfig.enabled}
                onChange={(e) => setMapsConfig({ ...mapsConfig, enabled: e.target.checked })}
                className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
              />
              <label htmlFor="enabled" className="ml-2 block text-sm font-medium text-gray-700">
                Enable Google Maps for all organizations
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Provider
              </label>
              <input
                type="text"
                value={mapsConfig.provider}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500">Currently only Google Maps is supported</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Google Maps API Key
              </label>
              <input
                type="text"
                value={mapsConfig.google_api_key || (mapsConfig.google_api_key_present && mapsConfig.google_api_key_last4 ? `••••••••••••••••${mapsConfig.google_api_key_last4}` : '')}
                onChange={(e) => setMapsConfig({ ...mapsConfig, google_api_key: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder={mapsConfig.google_api_key_present ? "••••••••••••• (enter new key to update)" : "Enter your Google Maps API key (AIza...)"}
                required={mapsConfig.enabled}
              />
              {mapsConfig.google_api_key_present && (
                <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  {mapsConfig.google_api_key ? "New key entered - save to update" : `API key saved (ends with ${mapsConfig.google_api_key_last4})`}
                </p>
              )}
              {!mapsConfig.google_api_key_present && mapsConfig.google_api_key && (
                <p className="mt-1 text-xs text-blue-600 flex items-center gap-1">
                  <AlertCircle size={12} />
                  Remember to save your configuration
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Get your API key from{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:text-brand-700 underline"
                >
                  Google Cloud Console
                </a>
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">How it works:</h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>This API key will be used by all organizations automatically</li>
                <li>Individual organizations can override with their own key in Settings</li>
                <li>Enables address autocomplete, geocoding, and map displays</li>
                <li>Make sure the API key has Maps JavaScript API and Geocoding API enabled</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => router.push("/superadmin")}
                className="px-6 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
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
                  <>
                    <Save size={16} />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
