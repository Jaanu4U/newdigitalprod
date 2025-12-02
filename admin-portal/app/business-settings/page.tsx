"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";
import { Building, Save, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

type BusinessSettings = {
  address?: string;
  gstin?: string;
  company_registration?: string;
  drug_license?: string;
  fssai?: string;
  logo_data_url?: string; // base64 png
};

type ProvidersSettings = {
  default_provider_code?: string;
  enabled_provider_codes?: string[];
};

interface LogoSectionProps {
  logo: string;
  onChange: (dataUrl: string) => void;
  onClear: () => void;
  disabled?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function LogoSection({ logo, onChange, onClear, disabled, isExpanded, onToggle }: LogoSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) { setError("Must be an image"); return; }
    if (file.size > 512 * 1024) { setError("Max size 512KB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 256;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setError("Canvas unsupported"); setProcessing(false); return; }
        ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0,0,SIZE,SIZE);
        const scale = Math.min(SIZE / img.width, SIZE / img.height);
        const w = img.width * scale; const h = img.height * scale;
        const x = (SIZE - w)/2; const y = (SIZE - h)/2;
        ctx.drawImage(img, x, y, w, h);
        const dataUrl = canvas.toDataURL("image/png", 0.92);
        onChange(dataUrl);
        setProcessing(false);
      };
      img.onerror = () => { setError("Bad image"); setProcessing(false); };
      img.src = reader.result as string;
    };
    reader.onerror = () => { setError("Read failed"); setProcessing(false); };
    setProcessing(true);
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between hover:opacity-80"
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-900 text-left">Organization Logo</h2>
          <p className="mt-1 text-xs text-gray-500 text-left">Standard square 256x256 PNG stored inline. Max 512KB.</p>
        </div>
        {isExpanded ? <ChevronUp size={20} className="text-gray-600" /> : <ChevronDown size={20} className="text-gray-600" />}
      </button>
      {isExpanded && (
      <div className="mt-4 flex items-start gap-4">
        <div className="w-40 h-40 border rounded bg-gray-50 flex items-center justify-center overflow-hidden">
          {logo ? <img src={logo} alt="Logo" className="w-full h-full object-contain" /> : <span className="text-xs text-gray-400">No logo</span>}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            disabled={disabled || processing}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { if (inputRef.current) inputRef.current.value = ""; onClear(); }}
              disabled={disabled || !logo || processing}
              className="px-3 py-1.5 text-xs rounded border hover:bg-gray-50 disabled:opacity-40"
            >Remove</button>
            {processing && <span className="text-xs text-gray-500">Processing...</span>}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
      )}
    </div>
  );
}

export default function BusinessSettingsPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Collapsible section states
  const [showLogo, setShowLogo] = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [showCompliance, setShowCompliance] = useState(true);
  const [showProviders, setShowProviders] = useState(true);

  const [business, setBusiness] = useState<BusinessSettings>({});
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [businessSuccessMsg, setBusinessSuccessMsg] = useState<string | null>(null);
  const [initialBusiness, setInitialBusiness] = useState<BusinessSettings | null>(null);

  // Shipment Providers section (default + enabled) restored per request
  const [providers, setProviders] = useState<ProvidersSettings>({ enabled_provider_codes: [] });
  const [allProviders, setAllProviders] = useState<{ code: string; name: string }[]>([]);
  const [savingProviders, setSavingProviders] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);

  const base = useMemo(() => apiBase(), []);

  const isPrivileged = (r: string | null) => {
    const rl = (r || "").toLowerCase();
    return rl === "admin" || rl === "owner" || rl === "superadmin";
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
    if (!isPrivileged(r)) {
      router.replace("/");
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
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      }));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const next: BusinessSettings = {
        address: data.business_settings?.address || "",
        gstin: data.business_settings?.gstin || "",
        company_registration: data.business_settings?.company_registration || "",
        drug_license: data.business_settings?.drug_license || "",
        fssai: data.business_settings?.fssai || "",
        logo_data_url: data.business_settings?.logo_data_url || "",
      };
      setBusiness(next);
      setInitialBusiness(next);

      const pv = data.providers_settings || {};
      setProviders({
        default_provider_code: pv.default_provider_code || "",
        enabled_provider_codes: Array.isArray(pv.enabled_provider_codes) ? pv.enabled_provider_codes : [],
      });
      // Fetch active shipment providers list for dropdown (tenant-scoped list only shows active ones)
      try {
        const token = localStorage.getItem("dc_access") || "";
        if (token) {
          const pres = await fetch(`${base}providers`, {
            headers: { Authorization: `Bearer ${token}` },
          });
            if (pres.ok) {
              const pdata = await pres.json();
              if (Array.isArray(pdata.items)) {
                setAllProviders(pdata.items.map((p: any) => ({ code: p.code, name: p.name })));
              }
            }
        }
      } catch {}
    } catch (e: any) {
      setError(e.message || "Failed to load business settings");
    } finally {
      setLoading(false);
    }
  };

  const putSettings = async (body: any) => {
    const token = localStorage.getItem("dc_access") || "";
    const res = await fetch(`${base}org/settings`, withTenantHeaders({
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

  const handleSaveProviders = async () => {
    setProvidersError(null); setSavingProviders(true); setSuccessMsg(null);
    try {
      const code = (providers.default_provider_code || "").trim().toUpperCase();
      if (code && !allProviders.find(p => p.code === code)) {
        throw new Error("Selected provider unavailable or inactive");
      }
      // Build enabled list (ensure default included if set)
      const enabled = new Set<string>((providers.enabled_provider_codes || []).map(c => (c || "").toUpperCase()));
      if (code) enabled.add(code);
      await putSettings({ providers_settings: { default_provider_code: code || null, enabled_provider_codes: Array.from(enabled) } });
      setSuccessMsg("Default shipment provider saved.");
    } catch (e: any) {
      setProvidersError(e.message || "Failed to save provider selection");
    } finally {
      setSavingProviders(false);
    }
  };

  const buildBusinessPayload = (): BusinessSettings => ({
    address: (business.address ?? "").trim(),
    gstin: (business.gstin ?? "").trim(),
    company_registration: (business.company_registration ?? "").trim(),
    drug_license: (business.drug_license ?? "").trim(),
    fssai: (business.fssai ?? "").trim(),
    logo_data_url: business.logo_data_url || "",
  });

  const isDirty = useMemo(() => {
    if (!initialBusiness) return false;
    const a = buildBusinessPayload();
    const b = {
      address: (initialBusiness.address ?? "").trim(),
      gstin: (initialBusiness.gstin ?? "").trim(),
      company_registration: (initialBusiness.company_registration ?? "").trim(),
      drug_license: (initialBusiness.drug_license ?? "").trim(),
      fssai: (initialBusiness.fssai ?? "").trim(),
      logo_data_url: initialBusiness.logo_data_url || "",
    } as BusinessSettings;
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [business, initialBusiness]);

  // simple validation for Save All
  const [addrErr, setAddrErr] = useState<string | null>(null);
  const [gstErr, setGstErr] = useState<string | null>(null);
  const [fssaiErr, setFssaiErr] = useState<string | null>(null);

  const validateAll = (): boolean => {
    let ok = true;
    setAddrErr(null); setGstErr(null); setFssaiErr(null);
    const addr = (business.address || "").trim();
    if (addr && addr.length < 10) { setAddrErr("Address too short (min 10 characters)"); ok = false; }
    const gst = (business.gstin || "").trim();
    if (gst && !/^[0-9A-Z]{15}$/.test(gst)) { setGstErr("GSTIN must be 15 uppercase alphanumeric characters"); ok = false; }
    const fssai = (business.fssai || "").trim();
    if (fssai && !/^\d{14}$/.test(fssai)) { setFssaiErr("FSSAI must be 14 digits"); ok = false; }
    return ok;
  };

  const handleSaveBusiness = async () => {
    setError(null);
    setSuccessMsg(null);
    setBusinessSuccessMsg(null);
    setSavingBusiness(true);
    try {
  if (!validateAll()) { setSavingBusiness(false); return; }
      const payload = buildBusinessPayload();
      const resp = await putSettings({ business_settings: payload });
      const t = localStorage.getItem("dc_access") || "";
      if (t) await fetchSettings(t);
      // Reflect server echo immediately if present
      if (resp?.updated?.business) {
        setBusiness({
          address: resp.updated.business.address || "",
          gstin: resp.updated.business.gstin || "",
          company_registration: resp.updated.business.company_registration || "",
          drug_license: resp.updated.business.drug_license || "",
          fssai: resp.updated.business.fssai || "",
          logo_data_url: resp.updated.business.logo_data_url || business.logo_data_url || "",
        });
        setInitialBusiness({
          address: resp.updated.business.address || "",
          gstin: resp.updated.business.gstin || "",
          company_registration: resp.updated.business.company_registration || "",
          drug_license: resp.updated.business.drug_license || "",
          fssai: resp.updated.business.fssai || "",
          logo_data_url: resp.updated.business.logo_data_url || business.logo_data_url || "",
        });
      } else setInitialBusiness(payload);
      setBusinessSuccessMsg("Organization settings updated successfully.");
      setTimeout(() => setBusinessSuccessMsg(null), 4000);
    } catch (e: any) {
      setError(e.message || "Failed to save business details");
    } finally {
      setSavingBusiness(false);
    }
  };

  // No per-field save; we present a single form with Save All

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <Building className="text-brand-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Business Settings</h1>
        </div>

        <div className="mb-4 text-xs text-gray-500">
          <span className="font-mono">Tenant: {getTenantSlugFromHost() || 'apex'}</span>
          <span className="mx-2">|</span>
          <span>Role: {role || '-'}</span>
        </div>

        {(error || successMsg) && (
          <div className="mb-4 space-y-2">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</div>
            )}
            {successMsg && (
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2"><CheckCircle2 size={16} /> {successMsg}</div>
            )}
          </div>
        )}

        <LogoSection
          logo={business.logo_data_url || ""}
          onChange={(d) => setBusiness((prev) => ({ ...prev, logo_data_url: d }))}
          onClear={() => setBusiness((prev) => ({ ...prev, logo_data_url: "" }))}
          disabled={!isPrivileged(role)}
          isExpanded={showLogo}
          onToggle={() => setShowLogo(!showLogo)}
        />

        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 mt-6">
          <button
            onClick={() => setShowAddress(!showAddress)}
            className="w-full flex items-center justify-between hover:opacity-80"
          >
            <h3 className="font-semibold text-gray-900">Organization Address</h3>
            {showAddress ? <ChevronUp size={20} className="text-gray-600" /> : <ChevronDown size={20} className="text-gray-600" />}
          </button>
          {showAddress && (
          <>
          <textarea
            value={business.address || ""}
            onChange={(e) => {
              const addr = e.target.value;
              setBusiness((prev) => ({
                ...prev,
                address: addr,
              }));
              setAddrErr(null);
            }}
            disabled={!isPrivileged(role)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[88px]"
            placeholder="Street, Locality, City, State - PIN"
          />
          {addrErr && (
            <p className="text-xs text-red-600 mt-1">{addrErr}</p>
          )}
          </>
          )}
        </div>

  <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4 mt-6">
          <button
            onClick={() => setShowCompliance(!showCompliance)}
            className="w-full flex items-center justify-between hover:opacity-80"
          >
            <div className="text-left">
              <h3 className="font-semibold text-gray-900">Compliance & Registration</h3>
              <p className="text-xs text-gray-500">Stored with business settings. Sensitive keys are normalized (uppercase / digits).</p>
            </div>
            {showCompliance ? <ChevronUp size={20} className="text-gray-600" /> : <ChevronDown size={20} className="text-gray-600" />}
          </button>
          {showCompliance && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">GSTIN</label>
              <input
                type="text"
                value={business.gstin || ""}
                onChange={(e) => setBusiness((prev) => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                placeholder="15-char GSTIN"
                maxLength={15}
                disabled={!isPrivileged(role)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {gstErr && <p className="text-xs text-red-600 mt-1">{gstErr}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Company Registration No.</label>
              <input
                type="text"
                value={business.company_registration || ""}
                onChange={(e) => setBusiness((prev) => ({ ...prev, company_registration: e.target.value }))}
                placeholder="CIN / LLP / etc"
                disabled={!isPrivileged(role)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Drug License No.</label>
              <input
                type="text"
                value={business.drug_license || ""}
                onChange={(e) => setBusiness((prev) => ({ ...prev, drug_license: e.target.value.toUpperCase() }))}
                placeholder="e.g. 21B/5678/2025"
                disabled={!isPrivileged(role)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">FSSAI License No.</label>
              <input
                type="text"
                value={business.fssai || ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, "");
                  setBusiness((prev) => ({ ...prev, fssai: digits }));
                  setFssaiErr(null);
                }}
                placeholder="14-digit FSSAI"
                maxLength={14}
                disabled={!isPrivileged(role)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {fssaiErr && <p className="text-xs text-red-600 mt-1">{fssaiErr}</p>}
            </div>
          </div>
          )}
        </div>

        {/* Business save action and inline success right after business section */}
        <div className="mt-4 flex items-center justify-between">
          {businessSuccessMsg && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={16} /> {businessSuccessMsg}
            </div>
          )}
          <div className="flex-1" />
          <button
            onClick={handleSaveBusiness}
            disabled={!isPrivileged(role) || savingBusiness || !isDirty}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 text-sm"
          >
            <Save size={16} /> {savingBusiness ? "Saving..." : (isDirty ? "Save Changes" : "Saved")}
          </button>
        </div>

        {/* Shipment Providers (Default + Enabled selections) */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4 mt-6">
          <button
            onClick={() => setShowProviders(!showProviders)}
            className="w-full flex items-center justify-between hover:opacity-80"
          >
            <div className="text-left">
              <h3 className="font-semibold text-gray-900">Shipment Providers</h3>
              <p className="text-xs text-gray-500">Select a default provider and choose which providers your org can use. Only active providers are shown.</p>
            </div>
            {showProviders ? <ChevronUp size={20} className="text-gray-600" /> : <ChevronDown size={20} className="text-gray-600" />}
          </button>
          {showProviders && (
          <>
          {providersError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{providersError}</div>}
          <div className="flex flex-col gap-2 max-w-sm">
            <label className="text-xs font-medium text-gray-700">Default Provider</label>
            <select
              value={providers.default_provider_code || ""}
              onChange={(e) => setProviders({ default_provider_code: e.target.value })}
              disabled={!isPrivileged(role)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">(None)</option>
              {allProviders.map(p => (
                <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 max-w-lg">
            <label className="text-xs font-medium text-gray-700">Enabled Providers</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 border rounded">
              {allProviders.map(p => {
                const checked = (providers.enabled_provider_codes || []).includes(p.code);
                return (
                  <label key={p.code} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!isPrivileged(role)}
                      checked={checked}
                      onChange={(e) => {
                        setProviders(prev => {
                          const set = new Set<string>(prev.enabled_provider_codes || []);
                          if (e.target.checked) set.add(p.code); else set.delete(p.code);
                          return { ...prev, enabled_provider_codes: Array.from(set) };
                        });
                      }}
                    />
                    <span>{p.name} <span className="text-[10px] text-gray-500">({p.code})</span></span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveProviders}
              disabled={!isPrivileged(role) || savingProviders}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 text-sm"
            >
              <Save size={16} /> {savingProviders ? "Saving..." : "Save Default Provider"}
            </button>
          </div>
          </>
          )}
        </div>

        
      </div>
    </div>
  );
}
