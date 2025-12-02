"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, Download, Mail, Share2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";

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
};

type OrgSettings = {
  name: string;
  business_settings?: any;
};

type Item = { description: string; qty: number; rate: number };

export default function InvoicePreviewPage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const params = useParams<{ customer_id: string }>();
  const searchParams = useSearchParams();
  const base = useMemo(() => apiBase(), []);
  const [role, setRole] = useState<string | null>(null);
  const [cust, setCust] = useState<Customer | null>(null);
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [items, setItems] = useState<Item[]>([{ description: "", qty: 1, rate: 0 }]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [assigningRider, setAssigningRider] = useState(false);
  const [draftSavedMsg, setDraftSavedMsg] = useState<string | null>(null);
  const [draftErrMsg, setDraftErrMsg] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [riderAssignMsg, setRiderAssignMsg] = useState<string | null>(null);
  const [riderAssignErr, setRiderAssignErr] = useState<string | null>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [selectedRider, setSelectedRider] = useState<string>("");
  const [serverInvoiceNo, setServerInvoiceNo] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailOk, setEmailOk] = useState<string | null>(null);
  const [emailList, setEmailList] = useState<string>("");
  // Timeline state
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineErr, setTimelineErr] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  // Ship To controls
  const [shipToSame, setShipToSame] = useState(true);
  const [shipToAddress, setShipToAddress] = useState<string>("");
  const [shipToModalOpen, setShipToModalOpen] = useState(false);
  // Invoice number + QR
  const [invoiceNo, setInvoiceNo] = useState<string>("");
  const invoiceQrRef = useRef<HTMLCanvasElement | null>(null);
  const [invoiceQrOk, setInvoiceQrOk] = useState(true);
  const [invoiceQrReady, setInvoiceQrReady] = useState(false);
  const [invoiceQrDataUrl, setInvoiceQrDataUrl] = useState<string>("");
  // Shipping number + QR
  const [shippingNo, setShippingNo] = useState<string>("");
  const shipQrRef = useRef<HTMLCanvasElement | null>(null);
  const [shipQrOk, setShipQrOk] = useState(true);
  const [shipQrReady, setShipQrReady] = useState(false);
  const [shipQrDataUrl, setShipQrDataUrl] = useState<string>("");
  
  // Track if invoice is already saved (read-only mode)
  const [invoiceSaved, setInvoiceSaved] = useState(false);

  // helpers
  const oneLine = (str: string) => (str || "").replace(/\s*\n\s*/g, ", ").replace(/\s{2,}/g, " ").replace(/,\s*,/g, ", ").trim();
  const addrOneLine = (addr?: string | null, city?: string | null, state?: string | null, pin?: string | null) => {
    // If address already contains commas, it's likely a combined address from CSV upload
    if (addr && addr.includes(',')) {
      return oneLine(addr);
    }
    // Otherwise, combine address components
    return oneLine([addr || "", [city, state, pin].filter(Boolean).join(", ")].filter(Boolean).join(", "));
  };

  const canBilling = (r: string | null) => {
    const rl = (r || "").toLowerCase();
    return rl === "admin" || rl === "owner" || rl === "superadmin" || rl === "billing staff";
  };

  useEffect(() => {
    setMounted(true);
    const cid = params.customer_id;
    const share = searchParams.get("share");
    // Public share mode
    if (share) {
      (async () => {
        const res = await fetch(`${base}invoice/share?token=${encodeURIComponent(share)}`, { cache: "no-store" });
        if (!res.ok) return; // keep loading if invalid
        const data = await res.json();
        setOrg({ name: data.org?.name, business_settings: data.org?.business_settings });
        setCust(data.customer);
        // Set shipping default from customer
        const defaultAddr = [data.customer?.address, [data.customer?.city, data.customer?.state, data.customer?.pin].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join("\n").trim();
        setShipToAddress(defaultAddr);
        setShipToSame(true);
        // Prefer token-provided invoice_no when present
        if (data.invoice_no) setInvoiceNo(data.invoice_no);
      })();
      return;
    }
    // Authenticated mode
    const slug = getTenantSlugFromHost();
    if (!slug) { router.replace("/superadmin"); return; }
    const t = localStorage.getItem("dc_access") || "";
    const r = localStorage.getItem("dc_role");
    setRole(r);
    if (!t) { router.push("/login"); return; }
    if (!canBilling(r)) { router.replace("/"); return; }
    if (!cid) return;
    (async () => {
      const token = localStorage.getItem("dc_access") || "";
      
      // First, check if there's a shipment address for this invoice
      const invoiceIdParam = searchParams.get("invoice_id");
      let hasShipmentAddress = false;
      
      if (invoiceIdParam) {
        try {
          const shipmentUrl = `${base}invoice/shipment/${invoiceIdParam}`;
          console.log('Fetching shipment from:', shipmentUrl);
          const shipRes = await fetch(
            shipmentUrl,
            withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } })
          );
          console.log('Shipment response status:', shipRes.status);
          if (shipRes.ok) {
            const shipData = await shipRes.json();
            console.log('Shipment data received:', shipData);
            if (shipData.shipment?.shipping_address) {
              hasShipmentAddress = true;
              setShipToAddress(shipData.shipment.shipping_address);
              setShipToSame(false);
              console.log('✓ Shipping address set:', shipData.shipment.shipping_address);
            } else {
              console.log('No shipping_address in response');
            }
          } else {
            console.log('Shipment fetch failed with status:', shipRes.status);
          }
        } catch (e) {
          console.error('Failed to fetch shipment address:', e);
        }
      }
      
      // Then load customer data
      const resC = await fetch(`${base}customers/${cid}`, withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } }));
      if (resC.ok) {
        const data = await resC.json();
        setCust(data);
        
        // Only set default address if there's NO shipment address
        if (!hasShipmentAddress) {
          console.log('No shipment address found, using customer default');
          const defaultAddr = [data.address, [data.city, data.state, data.pin].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join("\n").trim();
          const spSame = searchParams.get("shipToSame");
          if (spSame !== null) {
            const same = spSame === "1" || spSame.toLowerCase() === "true";
            setShipToSame(same);
            if (same) setShipToAddress(defaultAddr); else setShipToAddress(searchParams.get("shipToAddress") || "");
          } else {
            setShipToAddress(defaultAddr);
            setShipToSame(true);
          }
        } else {
          console.log('Skipping customer default because shipment address exists');
        }
      }
      const resO = await fetch(`${base}org/settings`, withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } }));
      if (resO.ok) setOrg(await resO.json());
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.customer_id]);

  // Share mode flag should be defined before any effects that reference it to avoid TDZ issues
  const isShareMode = !!searchParams.get("share");
  const isPopupMode = searchParams.get("popup") === "true";
  const isCreateMode = searchParams.get("create") === "true" || searchParams.get("mode") === "new";

  // Fetch server-side invoice data (JSON) for authoritative number & items (mock server items)
  useEffect(() => {
    if (!cust || isShareMode) return;
    (async () => {
      try {
        const token = localStorage.getItem("dc_access") || "";
        // Build URL with invoice_id if present in query params
        const url = new URL(`${base}invoice/${cust.customer_id}`, window.location.origin);
        const invoiceIdParam = searchParams.get("invoice_id");
        if (invoiceIdParam) {
          url.searchParams.set("invoice_id", invoiceIdParam);
        }
        const res = await fetch(url.toString(), withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } }));
        if (res.ok) {
          const data = await res.json();
          // Check if we're in view mode from orders page OR force create new mode
          const viewMode = searchParams.get("view");
          const createNew = searchParams.get("create") === "true" || searchParams.get("mode") === "new";
          
          // If create=true or mode=new, force editable mode (don't load saved invoice)
          if (createNew) {
            setInvoiceSaved(false);
            // Don't set any invoice number for new invoices - will be generated on save
            setServerInvoiceNo("");
            setInvoiceNo("");
            // Load fresh mock items instead of saved items
            if (Array.isArray(data.items) && !data.invoice_no) {
              setItems(data.items.map((it: any) => ({ description: it.description, qty: it.qty, rate: it.rate })));
            }
          } else if (data.invoice_no || viewMode === "saved") {
            // Invoice exists or forced view mode, mark as saved (read-only)
            setServerInvoiceNo(data.invoice_no || data.preview_no);
            setInvoiceSaved(true);
            if (Array.isArray(data.items)) {
              setItems(data.items.map((it: any) => ({ description: it.description, qty: it.qty, rate: it.rate })));
            }
          } else if (data.preview_no) {
            // Use preview number for display when invoice isn't saved yet
            setServerInvoiceNo(data.preview_no);
            if (Array.isArray(data.items)) {
              setItems(data.items.map((it: any) => ({ description: it.description, qty: it.qty, rate: it.rate })));
            }
          }
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cust]);

  // Fetch shipping address from shipment data
  useEffect(() => {
    if (!cust || isShareMode) return;
    const invoiceIdParam = searchParams.get("invoice_id");
    if (!invoiceIdParam) return;
    
    (async () => {
      try {
        const token = localStorage.getItem("dc_access") || "";
        console.log('Fetching shipment data for invoice:', invoiceIdParam);
        const res = await fetch(
          `${base}invoice/shipment/${invoiceIdParam}`,
          withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } })
        );
        console.log('Shipment response status:', res.status);
        if (res.ok) {
          const data = await res.json();
          console.log('Shipment data:', data);
          if (data.shipment?.shipping_address) {
            console.log('Setting shipping address:', data.shipment.shipping_address);
            // Use setTimeout to ensure this runs after customer data sets default
            // Increased to 300ms to ensure customer data loads first
            setTimeout(() => {
              console.log('Applying shipping address now');
              setShipToAddress(data.shipment.shipping_address);
              setShipToSame(false);
            }, 300);
          } else {
            console.log('No shipping address in shipment data');
          }
        } else {
          const errorText = await res.text();
          console.error('Failed to fetch shipment:', res.status, errorText);
        }
      } catch (e) {
        console.error('Failed to fetch shipment address:', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cust, searchParams, base]);

  // Load riders for assignment
  useEffect(() => {
    if (isShareMode) return;
    (async () => {
      try {
        const token = localStorage.getItem('dc_access') || '';
        if (!token) return;
        const res = await fetch(`${base}org/users`, withTenantHeaders({ headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }));
        if (!res.ok) return;
        const data = await res.json();
        const ridersOnly = (Array.isArray(data) ? data : []).filter((u: any) => (u.role || '').toLowerCase() === 'rider');
        setRiders(ridersOnly);
      } catch {}
    })();
  }, [base, isShareMode]);

  // Fetch invoice lifecycle timeline
  useEffect(() => {
    if (isShareMode) return;
    if (!cust?.customer_id) return;
    (async () => {
      setTimelineLoading(true); setTimelineErr(null);
      try {
        const token = localStorage.getItem('dc_access') || '';
        if (!token) { setTimeline([]); return; }
        const res = await fetch(`${base}invoice/${cust.customer_id}/timeline`, withTenantHeaders({ headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }));
        if (!res.ok) {
          const d = await res.json().catch(()=>({}));
          setTimelineErr(d.detail || `HTTP ${res.status}`);
          setTimeline([]);
          return;
        }
        const data = await res.json();
        setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
      } catch (e:any) {
        setTimelineErr(e.message || 'Failed to load timeline');
        setTimeline([]);
      } finally {
        setTimelineLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cust?.customer_id]);

  // derive/generate invoice number once customer is loaded (local draft fallback)
  useEffect(() => {
    if (!cust) return;
    // persist a draft number for this customer for current day
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const yyyymmdd = `${y}${m}${day}`;
    const suffix = (cust.customer_id || "").replace(/-/g, "").slice(-6).toUpperCase();
    const draftKey = `dc_inv_draft_${yyyymmdd}_${cust.customer_id}`;
    let no = localStorage.getItem(draftKey);
    if (!no) {
      // simple daily counter in localStorage
      const counterKey = `dc_inv_counter_${yyyymmdd}`;
      const current = Number(localStorage.getItem(counterKey) || "0") + 1;
      localStorage.setItem(counterKey, String(current));
      no = `INV-${yyyymmdd}-${String(current).padStart(3, "0")}-${suffix}`;
      localStorage.setItem(draftKey, no);
    }
  // Prefer server-issued invoice number if available later
  setInvoiceNo(no);

    // shipping number (separate counter)
    const shipDraftKey = `dc_ship_draft_${yyyymmdd}_${cust.customer_id}`;
    let sn = localStorage.getItem(shipDraftKey);
    if (!sn) {
      const shipCounterKey = `dc_ship_counter_${yyyymmdd}`;
      const currentShip = Number(localStorage.getItem(shipCounterKey) || "0") + 1;
      localStorage.setItem(shipCounterKey, String(currentShip));
      sn = `SHP-${yyyymmdd}-${String(currentShip).padStart(3, "0")}-${suffix}`;
      localStorage.setItem(shipDraftKey, sn);
    }
    setShippingNo(sn);
  }, [cust]);

  // render invoice QR when number available
  useEffect(() => {
    if (!invoiceNo) return;
    (async () => {
      try {
        const mod: any = await import("qrcode");
        const QR = mod?.default || mod; // normalize default export
        // Try canvas first if available
        if (invoiceQrRef.current && QR?.toCanvas) {
          const opts = { margin: 0, scale: 3, errorCorrectionLevel: "M" } as any;
          await QR.toCanvas(invoiceQrRef.current, invoiceNo, opts);
          // Also set a data URL for print-only rendering
          try {
            const url = QR?.toDataURL ? await QR.toDataURL(invoiceNo, opts) : invoiceQrRef.current.toDataURL();
            setInvoiceQrDataUrl(url || "");
          } catch {
            try { setInvoiceQrDataUrl(invoiceQrRef.current.toDataURL()); } catch {}
          }
          setInvoiceQrOk(true);
          setInvoiceQrReady(true);
          return;
        }
        // Fallback to data URL image
        if (QR?.toDataURL) {
          const url = await QR.toDataURL(invoiceNo, { margin: 0, scale: 3, errorCorrectionLevel: "M" });
          setInvoiceQrDataUrl(url);
          setInvoiceQrOk(false);
          setInvoiceQrReady(true);
        } else {
          setInvoiceQrOk(false);
        }
      } catch (e) {
        console.error("Invoice QR render failed", e);
        try {
          const mod: any = await import("qrcode");
          const QR = mod?.default || mod;
          if (QR?.toDataURL) {
            const url = await QR.toDataURL(invoiceNo, { margin: 0, scale: 3, errorCorrectionLevel: "M" });
            setInvoiceQrDataUrl(url);
          }
        } catch {}
        setInvoiceQrOk(false);
        setInvoiceQrReady(true);
      }
    })();
  }, [invoiceNo]);

  useEffect(() => {
    if (!shippingNo) return;
    (async () => {
      try {
        const mod: any = await import("qrcode");
        const QR = mod?.default || mod;
        if (shipQrRef.current && QR?.toCanvas) {
          const opts = { margin: 0, scale: 3, errorCorrectionLevel: "M" } as any;
          await QR.toCanvas(shipQrRef.current, shippingNo, opts);
          // Also set a data URL for print-only rendering
          try {
            const url = QR?.toDataURL ? await QR.toDataURL(shippingNo, opts) : shipQrRef.current.toDataURL();
            setShipQrDataUrl(url || "");
          } catch {
            try { setShipQrDataUrl(shipQrRef.current.toDataURL()); } catch {}
          }
          setShipQrOk(true);
          setShipQrReady(true);
          return;
        }
        if (QR?.toDataURL) {
          const url = await QR.toDataURL(shippingNo, { margin: 0, scale: 3, errorCorrectionLevel: "M" });
          setShipQrDataUrl(url);
          setShipQrOk(false);
          setShipQrReady(true);
        } else {
          setShipQrOk(false);
        }
      } catch (e) {
        console.error("Shipping QR render failed", e);
        try {
          const mod: any = await import("qrcode");
          const QR = mod?.default || mod;
          if (QR?.toDataURL) {
            const url = await QR.toDataURL(shippingNo, { margin: 0, scale: 3, errorCorrectionLevel: "M" });
            setShipQrDataUrl(url);
          }
        } catch {}
        setShipQrOk(false);
        setShipQrReady(true);
      }
    })();
  }, [shippingNo]);

  // Ensure print media (including browser preview) always sees images (not canvases) and waits for readiness
  useEffect(() => {
    const ensureQrData = () => {
      try {
        if (invoiceQrRef.current && !invoiceQrDataUrl) {
          try { setInvoiceQrDataUrl(invoiceQrRef.current.toDataURL()); setInvoiceQrReady(true); } catch {}
        }
        if (shipQrRef.current && !shipQrDataUrl) {
          try { setShipQrDataUrl(shipQrRef.current.toDataURL()); setShipQrReady(true); } catch {}
        }
      } catch {}
    };
    const handleBeforePrint = () => {
      ensureQrData();
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    // Some browsers (e.g. Firefox private mode) do not fire beforeprint reliably; use matchMedia fallback
    const mql = window.matchMedia('print');
    const handleChange = (e: MediaQueryListEvent) => { if (e.matches) ensureQrData(); };
    // @ts-ignore
    if (mql && mql.addEventListener) mql.addEventListener('change', handleChange);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      // @ts-ignore
      if (mql && mql.removeEventListener) mql.removeEventListener('change', handleChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceQrDataUrl, shipQrDataUrl]);

  const addRow = () => setItems((arr) => [...arr, { description: "", qty: 1, rate: 0 }]);
  const rmRow = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const effectiveInvoiceNo = serverInvoiceNo || invoiceNo;
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const total = subtotal; // placeholder: add taxes/discounts later

  if (!mounted || !cust || !org) return <div className="min-h-screen bg-gray-50 p-8">Loading...</div>;

  const seller = org.business_settings || {};
  const compLine1 = [
    seller.gstin ? `GSTIN: ${seller.gstin}` : null,
    seller.company_registration ? `Reg. No.: ${seller.company_registration}` : null,
  ].filter(Boolean).join(" | ");
  const compLine2 = [
    seller.drug_license ? `D.L.No: ${seller.drug_license}` : null,
    seller.fssai ? `FSSAI: ${seller.fssai}` : null,
  ].filter(Boolean).join(" | ");

  return (
    <div className="min-h-screen bg-slate-50 py-10 print:bg-white print:py-0 print:text-[10px]">
      <div
        id="print-root"
        className="max-w-5xl mx-auto px-4 text-[13px] leading-snug space-y-8 print:px-0 print:text-[10px]"
      >
        {/* Inline fallback print CSS (in case global stylesheet not applied yet during preview) */}
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: `
            @media print { 
              body * { visibility: hidden !important; } 
              #print-root, #print-root * { visibility: visible !important; } 
              #print-root { position: absolute; left: 0; top: 0; width: 100%; } 
              #app-navbar, #app-navbar * , aside, aside * , .no-print, .print\\:hidden, .change-ship-btn { display: none !important; } 
            }
            ${isPopupMode ? `
              #app-navbar, #app-navbar *, aside, aside *, nav, nav * { 
                display: none !important; 
              }
              body { 
                overflow: auto !important; 
              }
            ` : ''}
          ` }}
        />
        {/* PROFESSIONAL HEADER */}
        <section
          className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 text-white rounded-3xl border border-white/10 shadow-2xl p-6 print:bg-white print:text-black print:border print:shadow-none"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              {seller.logo_data_url && (
                <div className="w-[64px] h-[64px] rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={seller.logo_data_url} alt="Company Logo" className="w-full h-full object-contain" />
                </div>
              )}
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-white/70 print:text-gray-500">Invoice Workspace</p>
                <h1 className="text-3xl font-semibold mt-2 print:text-lg text-white">{org.name}</h1>
                {(org as any).address && (
                  <p className="text-sm text-white/70 max-w-xl mt-2 print:text-gray-600">
                    {addrOneLine((org as any).address, (org as any).city, (org as any).state, (org as any).pincode)}
                  </p>
                )}
                <div className="mt-3 space-y-1 text-xs text-white/70 print:text-gray-600">
                  {compLine1 && <p>{compLine1}</p>}
                  {compLine2 && <p>{compLine2}</p>}
                </div>
              </div>
            </div>
            <div className="w-full lg:w-auto">
              <div className="flex flex-col items-start lg:items-end gap-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium tracking-wide print:bg-transparent print:border print:text-gray-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse print:bg-emerald-600" />
                  {invoiceSaved ? "Saved Invoice" : isCreateMode ? "Draft In Progress" : "Preview Mode"}
                </div>
                <div className="bg-white/5 rounded-2xl px-5 py-3 w-full lg:w-auto print:bg-transparent print:border print:text-gray-900">
                  <p className="text-xs uppercase tracking-[0.4em] text-white/60 print:text-gray-500">Invoice</p>
                  <p className="text-2xl font-semibold mt-1 print:text-lg text-white">
                    {effectiveInvoiceNo || "Pending Number"}
                  </p>
                  <p className="text-sm mt-1 text-white/70 print:text-gray-600">
                    Date • {new Date().toLocaleDateString()}
                  </p>
                  {effectiveInvoiceNo && (
                    <p className="text-xs text-white/60 mt-1 print:text-gray-500">
                      Shipping Ref • SHP-{effectiveInvoiceNo.replace('INV-', '')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CLIENT + SHIPPING + QR */}
        <section className="grid gap-5 lg:grid-cols-[2fr_2fr_1fr] print:gap-4">
          <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 print:shadow-none print:border print:p-3">
            <header className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Bill To</p>
                <p className="text-lg font-semibold text-slate-900">
                  {cust.ctype === "b2b" ? (cust.company_name || "-") : (cust.name || "-")}
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-500">#{cust.customer_id.slice(-6)}</span>
            </header>
            <dl className="space-y-2 text-[13px] text-slate-600">
              <div>
                <dt className="font-semibold text-slate-500">Address</dt>
                <dd>{addrOneLine(cust.address, cust.city, cust.state, cust.pin) || "-"}</dd>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span><span className="font-semibold">Phone:</span> {cust.phone || "-"}</span>
                <span><span className="font-semibold">Email:</span> {cust.email || "-"}</span>
              </div>
              {cust.gstin && (
                <div>
                  <dt className="font-semibold text-slate-500">GSTIN</dt>
                  <dd className="font-mono">{cust.gstin}</dd>
                </div>
              )}
            </dl>
          </article>

          <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 print:shadow-none print:border print:p-3">
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Ship To</p>
                <p className="text-lg font-semibold text-slate-900">{shipToSame ? "Primary Address" : "Custom Address"}</p>
              </div>
              {!isShareMode && (
                <button
                  onClick={() => setShipToModalOpen(true)}
                  className="change-ship-btn inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white print:hidden no-print"
                >
                  Update
                </button>
              )}
            </header>
            <p className="text-[13px] text-slate-600 whitespace-pre-line">{shipToSame ? (addrOneLine(cust.address, cust.city, cust.state, cust.pin) || "-") : (oneLine(shipToAddress) || "-")}</p>
            <div className="text-[12px] text-slate-500">
              Ship mode: <span className="font-semibold text-slate-700">{shipToSame ? "Customer" : "Custom"}</span>
            </div>
          </article>

          <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 print:shadow-none print:border print:p-3">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Scan & Pay</p>
            <div className="mt-3 flex flex-col items-center">
              {invoiceNo ? (
                <div className="border border-slate-200 rounded-2xl p-2 bg-white">
                  <div className="print:hidden">
                    {invoiceQrOk && <canvas ref={invoiceQrRef} className="bg-white" width={120} height={120} />}
                    {!invoiceQrOk && invoiceQrDataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={invoiceQrDataUrl} alt="Invoice QR" className="bg-white w-[120px] h-[120px] object-contain" />
                    )}
                    {!invoiceQrOk && !invoiceQrDataUrl && (
                      <div className="w-[120px] h-[120px] flex items-center justify-center text-[11px] text-gray-500">{effectiveInvoiceNo}</div>
                    )}
                  </div>
                  <div className="hidden print:block">
                    {invoiceQrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={invoiceQrDataUrl} alt="Invoice QR" className="bg-white w-[120px] h-[120px] object-contain" />
                    ) : (
                      <div className="w-[120px] h-[120px] flex items-center justify-center text-[11px] text-gray-500">{effectiveInvoiceNo}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full text-center text-sm text-slate-500">QR will appear once invoice is generated.</div>
              )}
              <p className="mt-2 text-[12px] text-slate-500">Share with finance or rider for quick reference.</p>
            </div>
          </article>
        </section>

        {/* ITEMS TABLE */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden print:shadow-none print:border print:rounded-none">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 print:px-3 print:py-2">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Line Items</p>
              <p className="text-base font-semibold text-slate-900">Products & Services</p>
            </div>
            {!invoiceSaved && !isShareMode && (
              <button
                onClick={addRow}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white text-xs font-semibold px-4 py-2 hover:bg-slate-800 print:hidden"
              >
                + Add Item
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Description</th>
                  <th className="text-left px-5 py-3 font-semibold w-24">Qty</th>
                  <th className="text-left px-5 py-3 font-semibold w-32">Rate</th>
                  <th className="text-right px-5 py-3 font-semibold w-32">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="px-5 py-3 align-top">
                      {!invoiceSaved && !isShareMode ? (
                        <input
                          value={it.description}
                          onChange={(e) => setItems((arr) => arr.map((row, idx) => idx === i ? { ...row, description: e.target.value } : row))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                          placeholder="Item description"
                        />
                      ) : (
                        <p className="text-slate-800">{it.description || "-"}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {!invoiceSaved && !isShareMode ? (
                        <input
                          type="number"
                          value={it.qty}
                          onChange={(e) => setItems((arr) => arr.map((row, idx) => idx === i ? { ...row, qty: Number(e.target.value) } : row))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                        />
                      ) : (
                        <p>{Number(it.qty) || 0}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {!invoiceSaved && !isShareMode ? (
                        <input
                          type="number"
                          value={it.rate}
                          onChange={(e) => setItems((arr) => arr.map((row, idx) => idx === i ? { ...row, rate: Number(e.target.value) } : row))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                        />
                      ) : (
                        <p>{(Number(it.rate) || 0).toFixed(2)}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-900 font-semibold">{((Number(it.qty) || 0) * (Number(it.rate) || 0)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* TOTALS RIGHT */}
        <section className="grid gap-4 lg:grid-cols-[2fr_1fr] items-start">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 print:border print:shadow-none print:p-3">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Notes</p>
            <p className="text-sm text-slate-600 mt-2">Attach payment instructions, delivery commitments, or GST notes for finance teams.</p>
            {!invoiceSaved && !isShareMode && (
              <p className="mt-3 text-xs text-amber-500 font-medium">Invoice will lock once you click Save Draft.</p>
            )}
          </div>
          <div className="bg-slate-900 text-white rounded-2xl shadow-xl p-5 print:text-black print:bg-white print:border print:shadow-none">
            <p className="text-xs uppercase tracking-[0.4em] text-white/60 print:text-gray-500">Totals</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/70 print:text-gray-600">Subtotal</span>
                <span className="font-semibold text-white print:text-gray-900">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ACTION BAR */}
        <section className="mt-6 print:hidden bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Actions</p>
              <p className="text-sm text-slate-600 mt-1">
                {isShareMode ? "Shared view (read-only)" : isCreateMode ? "Create a new invoice and dispatch" : "Manage drafts, export PDFs, or assign riders"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {/* CREATE MODE: Only Save & Close and Exit buttons */}
              {isCreateMode && !isShareMode && (
                <>
                  {!invoiceSaved && (
                    <button
                      onClick={async () => {
                        setDraftSavedMsg(null); setDraftErrMsg(null); setSavingDraft(true);
                        try {
                          const token = localStorage.getItem('dc_access') || '';
                          
                          // Geocode the delivery address
                          let deliveryLat = null;
                          let deliveryLng = null;
                          const deliveryAddr = shipToSame 
                            ? [cust.address, [cust.city, cust.state, cust.pin].filter(Boolean).join(', ')].filter(Boolean).join(', ').trim()
                            : shipToAddress.trim();
                          
                          if (deliveryAddr) {
                            try {
                              const geoRes = await fetch(`${base}org/geocode?address=${encodeURIComponent(deliveryAddr)}`, withTenantHeaders({
                                headers: { Authorization: `Bearer ${token}` }
                              }));
                              if (geoRes.ok) {
                                const geoData = await geoRes.json();
                                if (geoData.status === 'ok') {
                                  deliveryLat = geoData.latitude;
                                  deliveryLng = geoData.longitude;
                                  console.log('✅ Geocoded delivery address:', { lat: deliveryLat, lng: deliveryLng });
                                }
                              }
                            } catch (geoErr) {
                              console.warn('⚠️ Geocoding failed, continuing without coordinates:', geoErr);
                            }
                          }
                          
                          const payload = {
                            items: items.map(it => ({ description: it.description, qty: it.qty, rate: it.rate })),
                            ship_to_same: shipToSame,
                            ship_to_address: shipToSame ? null : shipToAddress,
                            totals: { subtotal, total },
                            invoice_no: effectiveInvoiceNo,
                            delivery_latitude: deliveryLat,
                            delivery_longitude: deliveryLng,
                          };
                          const res = await fetch(`${base}invoice/${cust.customer_id}/save`, withTenantHeaders({
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify(payload)
                          }));
                          if (!res.ok) { const d = await res.json().catch(()=>({}));
                            const detail = d.detail || `HTTP ${res.status}`;
                            // Enhance customer 404 guidance
                            if (detail.toLowerCase().includes('customer not found')) {
                              throw new Error(detail + ' – verify this customer exists for tenant and you used the correct subdomain. Create customer first if missing.');
                            }
                            throw new Error(detail);
                          }
                          const rj = await res.json();
                          setDraftSavedMsg(`Saved draft ${rj.invoice_no}`);
                          // Redirect to orders/billing page after successful save
                          setTimeout(() => {
                            window.location.href = '/orders';
                          }, 500);
                        } catch(e:any) {
                          setDraftErrMsg(e.message || 'Save failed');
                        } finally { setSavingDraft(false); }
                      }}
                      disabled={savingDraft}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50"
                    >{savingDraft? 'Saving…' : 'Save & Exit'}</button>
                  )}
                  
                  <button
                    onClick={() => window.location.href = '/customers'}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 text-[13px] font-medium hover:bg-gray-50"
                  >Exit Without Saving</button>
                  
                  {invoiceSaved && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-50 border border-green-200 text-green-800 text-[13px] font-medium">
                      Invoice Saved (Read-Only)
                    </div>
                  )}
                </>
              )}

              {/* NORMAL MODE: All buttons and icons */}
              {!isCreateMode && (
                <>
                  {!isShareMode && !invoiceSaved && (
                    <button
                      onClick={async () => {
                        setDraftSavedMsg(null); setDraftErrMsg(null); setSavingDraft(true);
                        try {
                          const token = localStorage.getItem('dc_access') || '';
                          
                          // Geocode the delivery address
                          let deliveryLat = null;
                          let deliveryLng = null;
                          const deliveryAddr = shipToSame 
                            ? [cust.address, [cust.city, cust.state, cust.pin].filter(Boolean).join(', ')].filter(Boolean).join(', ').trim()
                            : shipToAddress.trim();
                          
                          if (deliveryAddr) {
                            try {
                              const geoRes = await fetch(`${base}org/geocode?address=${encodeURIComponent(deliveryAddr)}`, withTenantHeaders({
                                headers: { Authorization: `Bearer ${token}` }
                              }));
                              if (geoRes.ok) {
                                const geoData = await geoRes.json();
                                if (geoData.status === 'ok') {
                                  deliveryLat = geoData.latitude;
                                  deliveryLng = geoData.longitude;
                                  console.log('✅ Geocoded delivery address:', { lat: deliveryLat, lng: deliveryLng });
                                }
                              }
                            } catch (geoErr) {
                              console.warn('⚠️ Geocoding failed, continuing without coordinates:', geoErr);
                            }
                          }
                          
                          const payload = {
                            items: items.map(it => ({ description: it.description, qty: it.qty, rate: it.rate })),
                            ship_to_same: shipToSame,
                            ship_to_address: shipToSame ? null : shipToAddress,
                            totals: { subtotal, total },
                            delivery_latitude: deliveryLat,
                            delivery_longitude: deliveryLng,
                            // Don't send invoice_no - let backend generate a new unique one
                          };
                          const res = await fetch(`${base}invoice/${cust.customer_id}/save`, withTenantHeaders({
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify(payload)
                          }));
                          if (!res.ok) { const d = await res.json().catch(()=>({}));
                            const detail = d.detail || `HTTP ${res.status}`;
                            // Enhance customer 404 guidance
                            if (detail.toLowerCase().includes('customer not found')) {
                              throw new Error(detail + ' – verify this customer exists for tenant and you used the correct subdomain. Create customer first if missing.');
                            }
                            throw new Error(detail);
                          }
                          const rj = await res.json();
                          setDraftSavedMsg(`Saved draft ${rj.invoice_no}`);
                          // Update the server invoice number with the newly generated one
                          setServerInvoiceNo(rj.invoice_no);
                          // Redirect to orders/billing page after successful save
                          setTimeout(() => {
                            window.location.href = '/orders';
                          }, 500);
                        } catch(e:any) {
                          setDraftErrMsg(e.message || 'Save failed');
                        } finally { setSavingDraft(false); }
                      }}
                      disabled={savingDraft}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50"
                    >{savingDraft? 'Saving…' : 'Save & Exit'}</button>
                  )}
                  
                  {!isShareMode && invoiceSaved && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-50 border border-green-200 text-green-800 text-[13px] font-medium">
                      Invoice Saved (Read-Only)
                    </div>
                  )}
                  
                  {/* Divider */}
                  {!isShareMode && cust && (
                    <div className="h-8 w-px bg-gray-300 mx-2"></div>
                  )}
                  
                  {/* Action icons */}
                  {!isShareMode && cust && (
                    <>
                      <button
                        onClick={() => window.print()}
                        disabled={!invoiceQrReady || !shipQrReady}
                        title="Print Invoice"
                        className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        <Printer size={18} className="text-gray-700" />
                      </button>
                      <button
                        onClick={() => {
                          // Use browser's native print which handles all CSS properly
                          // User can select "Save as PDF" in the print dialog
                          window.print();
                        }}
                        disabled={!invoiceQrReady || !shipQrReady}
                        title="Download PDF (Print to PDF)"
                        className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        <Download size={18} className="text-gray-700" />
                      </button>
                      <button
                        onClick={() => {
                          setEmailErr(null); setEmailOk(null);
                          const def = cust.email || '';
                          setEmailList(def);
                          const el = document.getElementById('invoice-email-panel');
                          if (el) el.classList.remove('hidden');
                        }}
                        title="Send Email"
                        className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <Mail size={18} className="text-gray-700" />
                      </button>
                      {!isPopupMode && riders.length > 0 && (
                        <button
                          onClick={() => {
                            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                          }}
                          title="Assign Rider"
                          className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                        >
                          <Share2 size={18} className="text-gray-700" />
                        </button>
                      )}
                    </>
                  )}
                  
                  {!isShareMode && cust && !isPopupMode && (
                    <ShareControls customerId={cust.customer_id} invoiceNo={effectiveInvoiceNo} />
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* Draft save status */}
        {(draftSavedMsg || draftErrMsg) && (
          <div className="mt-3 text-[11px] print:hidden">
            {draftSavedMsg && <span className="text-green-700">{draftSavedMsg}</span>}
            {draftErrMsg && <span className="text-red-600">{draftErrMsg}</span>}
          </div>
        )}

        {/* Rider assignment */}
        {!isShareMode && !isPopupMode && !isCreateMode && riders.length > 0 && (
          <div className="mt-4 border border-gray-200 rounded-md p-3 bg-gray-50 print:hidden">
            <div className="text-[12px] font-medium mb-2">Assign Rider (optional)</div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <select
                value={selectedRider}
                onChange={(e)=>setSelectedRider(e.target.value)}
                className="w-full sm:w-auto rounded-md border border-gray-300 px-3 py-2 text-[12px]"
              >
                <option value="">Select rider…</option>
                {riders.map((r: any) => (
                  <option key={r.user_id} value={r.user_id}>{r.name || r.email}</option>
                ))}
              </select>
              <button
                disabled={!selectedRider || assigningRider}
                onClick={async () => {
                  setRiderAssignMsg(null); setRiderAssignErr(null); setAssigningRider(true);
                  try {
                    const token = localStorage.getItem('dc_access') || '';
                    const res = await fetch(`${base}invoice/${cust.customer_id}/assign-rider`, withTenantHeaders({
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ rider_user_id: selectedRider })
                    }));
                    if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.detail || `HTTP ${res.status}`); }
                    await res.json();
                    setRiderAssignMsg('Rider assigned');
                  } catch(e:any) {
                    setRiderAssignErr(e.message || 'Assign failed');
                  } finally { setAssigningRider(false); }
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-[12px] disabled:opacity-50"
              >{assigningRider? 'Assigning…':'Assign Rider'}</button>
            </div>
            {(riderAssignMsg || riderAssignErr) && (
              <div className="mt-2 text-[11px]">
                {riderAssignMsg && <span className="text-green-700">{riderAssignMsg}</span>}
                {riderAssignErr && <span className="text-red-600">{riderAssignErr}</span>}
              </div>
            )}
          </div>
        )}

        {/* Email invoice panel */}
        <div id="invoice-email-panel" className="hidden mt-4 max-w-xl border border-gray-200 rounded-md p-4 bg-white print:hidden">
          <div className="text-sm font-medium mb-2">Email Invoice (server PDF attachment)</div>
          <div className="space-y-3">
            <input
              value={emailList}
              onChange={(e)=>setEmailList(e.target.value)}
              placeholder="customer@example.com, accounts@example.com"
              className="w-full px-3 py-2 border rounded text-[12px]"
            />
            {emailErr && <div className="text-[11px] text-red-600">{emailErr}</div>}
            {emailOk && <div className="text-[11px] text-green-700">{emailOk}</div>}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setEmailErr(null); setEmailOk(null); setEmailing(true);
                  try {
                    const list = emailList.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean);
                    if (!list.length) { setEmailErr('Enter at least one email'); setEmailing(false); return; }
                    const token = localStorage.getItem('dc_access') || '';
                    const emailUrl = new URL(`${base}invoice/${cust.customer_id}/email`, window.location.origin);
                    const invoiceIdParam = searchParams.get("invoice_id");
                    if (invoiceIdParam) {
                      emailUrl.searchParams.set("invoice_id", invoiceIdParam);
                    }
                    const res = await fetch(emailUrl.toString(), withTenantHeaders({
                      method:'POST',
                      headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                      body: JSON.stringify({ customer_id: cust.customer_id, recipients: list })
                    }));
                    if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.detail || `HTTP ${res.status}`); }
                    const d = await res.json();
                    setEmailOk(`Sent invoice ${d.invoice_no} to ${d.sent} recipient(s)`);
                  } catch(e:any) {
                    setEmailErr(e.message || 'Send failed');
                  } finally { setEmailing(false); }
                }}
                disabled={emailing}
                className="px-3 py-1.5 rounded-md bg-brand-600 text-white text-[12px] disabled:opacity-50"
              >{emailing?'Sending…':'Send Email'}</button>
              <button onClick={()=>{ const el=document.getElementById('invoice-email-panel'); if(el) el.classList.add('hidden'); }} className="px-3 py-1.5 rounded-md border text-[12px]">Close</button>
            </div>
          </div>
        </div>

        {shipToModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center print:hidden no-print">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShipToModalOpen(false)}></div>
            <div className="relative bg-white rounded-lg shadow-lg w-full max-w-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium text-gray-900">Edit Ship To (This Invoice)</div>
                <button onClick={() => setShipToModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-xs select-none">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={shipToSame}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setShipToSame(checked);
                      if (checked) {
                        const addr = [cust.address, [cust.city, cust.state, cust.pin].filter(Boolean).join(", ")]
                          .filter(Boolean)
                          .join("\n")
                          .trim();
                        setShipToAddress(addr);
                      }
                    }}
                  />
                  <span>Same as Bill To</span>
                </label>
                <textarea
                  value={shipToSame ? ([cust.address, [cust.city, cust.state, cust.pin].filter(Boolean).join(", ")].filter(Boolean).join("\n").trim()) : shipToAddress}
                  onChange={(e) => setShipToAddress(e.target.value)}
                  disabled={shipToSame}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[120px] text-sm"
                  placeholder="Ship To address for this invoice"
                />
                <p className="text-[11px] text-gray-500">Changing Ship To here only affects this invoice preview. To permanently change, edit the customer record.</p>
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                <button onClick={() => setShipToModalOpen(false)} className="px-3 py-2 rounded-md border text-sm">Cancel</button>
                <button onClick={() => setShipToModalOpen(false)} className="px-3 py-2 rounded-md bg-brand-600 text-white text-sm">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Options modal after save */}
      {optionsOpen && !isShareMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-xl rounded-md shadow-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Invoice Saved</div>
              <button onClick={()=>setOptionsOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <p className="text-xs text-gray-600 mb-4">Choose an action for invoice <span className="font-medium">{effectiveInvoiceNo}</span> or go to Orders.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-[12px]">
              <button onClick={()=>{ setOptionsOpen(false); window.print(); }} className="px-3 py-2 rounded-md border hover:bg-gray-50">Print</button>
              <button onClick={()=>{ setOptionsOpen(false); const btn = Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Client PDF'); (btn as HTMLButtonElement|undefined)?.click(); }} className="px-3 py-2 rounded-md border hover:bg-gray-50">Client PDF</button>
              <button onClick={async ()=>{
                try {
                  const token = localStorage.getItem('dc_access') || '';
                  const res = await fetch(`${base}invoice/${cust.customer_id}/pdf`, withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } }));
                  if(res.ok){
                    const blob = await res.blob(); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${effectiveInvoiceNo||'invoice'}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
                  }
                } catch {}
              }} className="px-3 py-2 rounded-md border hover:bg-gray-50">Server PDF</button>
              <button onClick={()=>{ setOptionsOpen(false); const el=document.getElementById('invoice-email-panel'); if(el) el.classList.remove('hidden'); }} className="px-3 py-2 rounded-md border hover:bg-gray-50">Email</button>
              <button onClick={()=>{ setOptionsOpen(false); const shareBtn = Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Share'); (shareBtn as HTMLButtonElement|undefined)?.click(); }} className="px-3 py-2 rounded-md border hover:bg-gray-50">Share Link</button>
              {riders.length>0 && (
                <button onClick={()=>{ setOptionsOpen(false); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }} className="px-3 py-2 rounded-md border hover:bg-gray-50">Assign Rider</button>
              )}
            </div>
            <div className="flex flex-wrap gap-3 justify-end text-[12px]">
              <button onClick={()=>{ setOptionsOpen(false); }} className="px-3 py-2 rounded-md border">Stay Here</button>
              <button onClick={()=>{ router.push(`/orders?from=save&ts=${Date.now()}`); }} className="px-3 py-2 rounded-md bg-brand-600 text-white">Go To Orders</button>
              <button onClick={()=>{ window.location.href='/billing'; }} className="px-3 py-2 rounded-md bg-gray-800 text-white">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Debug panel */}
      {!isShareMode && !isPopupMode && !isCreateMode && (
        <div className="mt-8 print:hidden">
          <button onClick={()=>setDebugOpen(o=>!o)} className="text-[11px] underline text-gray-500">{debugOpen? 'Hide' : 'Show'} Debug Info</button>
          {debugOpen && (
            <div className="mt-2 p-3 border border-gray-200 rounded bg-gray-50 text-[11px] space-y-1">
              <div><span className="font-semibold">Tenant slug:</span> {getTenantSlugFromHost() || '(none)'}</div>
              <div><span className="font-semibold">Customer ID:</span> {cust.customer_id}</div>
              <div><span className="font-semibold">Effective Invoice No:</span> {effectiveInvoiceNo || '(pending)'} </div>
              <div><span className="font-semibold">Server Invoice No:</span> {serverInvoiceNo || '(none)'} </div>
              <div><span className="font-semibold">Items Count:</span> {items.length}</div>
              <div><span className="font-semibold">Ship To Same:</span> {shipToSame? 'yes':'no'}</div>
              {draftErrMsg && <div className="text-red-600"><span className="font-semibold">Last Save Error:</span> {draftErrMsg}</div>}
              {draftSavedMsg && <div className="text-green-700"><span className="font-semibold">Last Save Success:</span> {draftSavedMsg}</div>}
              <div className="text-gray-500">If Customer not found persists, confirm customer exists via Customers &gt; list and that X-Org header matches subdomain.</div>

              {/* Timeline */}
              <div className="mt-3 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Invoice Timeline</div>
                  <button
                    onClick={async () => {
                      if (!cust?.customer_id) return;
                      setTimelineLoading(true); setTimelineErr(null);
                      try {
                        const token = localStorage.getItem('dc_access') || '';
                        const res = await fetch(`${base}invoice/${cust.customer_id}/timeline`, withTenantHeaders({ headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }));
                        if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.detail || `HTTP ${res.status}`); }
                        const data = await res.json();
                        setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
                      } catch (e:any) {
                        setTimelineErr(e.message || 'Refresh failed');
                      } finally {
                        setTimelineLoading(false);
                      }
                    }}
                    className="px-2 py-1 border rounded bg-white"
                  >Refresh</button>
                </div>
                {timelineLoading && <div className="text-gray-500 mt-1">Loading timeline…</div>}
                {timelineErr && <div className="text-red-600 mt-1">{timelineErr}</div>}
                {!timelineLoading && !timelineErr && (
                  <ul className="mt-1 space-y-1">
                    {timeline.length === 0 && <li className="text-gray-500">No events yet.</li>}
                    {timeline.slice(0, 20).map((ev:any) => {
                      const when = ev.at || ev.created_at;
                      const t = (ev.type || '').replace(/^invoice_/, '').replace(/_/g, ' ');
                      const d = ev.data || {};
                      let info = '';
                      if (ev.type === 'invoice_email_sent' && Array.isArray(d.recipients)) info = `to ${d.recipients.join(', ')}`;
                      if (ev.type === 'invoice_rider_assigned' && d.rider_name) info = `rider ${d.rider_name}`;
                      if (ev.type === 'invoice_downloaded' && d.invoice_no) info = d.invoice_no;
                      if (ev.type === 'invoice_draft' && d.invoice_no) info = d.invoice_no;
                      return (
                        <li key={ev.id} className="flex items-center gap-2">
                          <span className="inline-block w-28 text-gray-600">{new Date(when).toLocaleString?.() || when}</span>
                          <span className="inline-block min-w-[120px] capitalize">{t}</span>
                          {info && <span className="text-gray-700">{info}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShareControls({ customerId, invoiceNo }: { customerId: string; invoiceNo?: string }) {
  const base = useMemo(() => apiBase(), []);
  const [link, setLink] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const genShare = async () => {
    setErr(null); setOk(null);
    const token = localStorage.getItem("dc_access") || "";
    const res = await fetch(`${base}invoice/share`, withTenantHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ customer_id: customerId, invoice_no: invoiceNo || null, ttl_hours: 168 }),
    }));
    if (!res.ok) { const d = await res.json().catch(()=>({})); setErr(d.detail || `HTTP ${res.status}`); return; }
    const data = await res.json();
    setLink(data.share_url);
    setOpen(true);
  };

  const sendEmail = async () => {
    setSending(true); setErr(null); setOk(null);
    try {
      const list = emails.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
      if (!list.length) { setErr("Enter at least one email"); setSending(false); return; }
      const token = localStorage.getItem("dc_access") || "";
      const res = await fetch(`${base}invoice/email`, withTenantHeaders({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customer_id: customerId, recipients: list, ttl_hours: 168 }),
      }));
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.detail || `HTTP ${res.status}`); }
      const d = await res.json();
      setOk(`Sent to ${d.sent} recipients`);
    } catch (e:any) {
      setErr(e.message || "Send failed");
    } finally { setSending(false); }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button onClick={genShare} className="px-3 py-1.5 rounded-md border text-[12px]">Share</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)}></div>
          <div className="relative bg-white rounded-lg shadow-lg w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-gray-900">Share Invoice</div>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">Link</label>
                <input value={link} readOnly className="w-full px-3 py-2 border rounded text-[12px]" onFocus={(e)=>e.currentTarget.select()} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Send to emails (comma or space separated)</label>
                <input value={emails} onChange={(e)=>setEmails(e.target.value)} placeholder="customer@domain, rider@domain" className="w-full px-3 py-2 border rounded text-[12px]" />
              </div>
              {err && <div className="text-xs text-red-600">{err}</div>}
              {ok && <div className="text-xs text-green-700">{ok}</div>}
            </div>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button onClick={() => setOpen(false)} className="px-3 py-2 rounded-md border text-sm">Close</button>
              <button onClick={sendEmail} disabled={sending} className="px-3 py-2 rounded-md bg-brand-600 text-white text-sm">{sending?"Sending...":"Send Email"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
