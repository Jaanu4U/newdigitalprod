"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost, withTenantHeaders } from "@/lib/tenant";
import { Plus, Search, Users, FileText, Pencil, Trash2, ChevronLeft, ChevronRight, MapPin, User, Upload } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import CustomerUploadModal from "./CustomerUploadModal";

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

export default function CustomersPage() {
  const router = useRouter();
  const base = useMemo(() => apiBase(), []);
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  // Show/hide create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [hasMore, setHasMore] = useState(false);

  // generate-invoice modal state
  const [giOpen, setGiOpen] = useState(false);
  const [giCustomer, setGiCustomer] = useState<Customer | null>(null);
  const [giSameAs, setGiSameAs] = useState(true);
  const [giShipTo, setGiShipTo] = useState("");

  // edit customer modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  // editable fields (mirrors schema) for edit
  const [eCtype, setECtype] = useState<"b2b"|"b2c">("b2c");
  const [eName, setEName] = useState("");
  const [eCompany, setECompany] = useState("");
  const [eGstin, setEGstin] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eAddress, setEAddress] = useState("");
  const [eCity, setECity] = useState("");
  const [eState, setEState] = useState("");
  const [ePin, setEPin] = useState("");
  const [eNotes, setENotes] = useState("");

  // delete modal state
  const [delOpen, setDelOpen] = useState(false);
  const [delCustomer, setDelCustomer] = useState<Customer | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  
  // bulk selection and delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  
  // bulk upload
  const [showUploadModal, setShowUploadModal] = useState(false);

  // form state
  const [ctype, setCtype] = useState<"b2b" | "b2c">("b2c");
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [gstin, setGstin] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Address input mode and Google Maps
  const [addressInputMode, setAddressInputMode] = useState<'custom' | 'map'>('custom');
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>('');
  const [mapsCountry, setMapsCountry] = useState<string>('in'); // Default to India
  const addressInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);

  // Edit address input mode
  const [editAddressInputMode, setEditAddressInputMode] = useState<'custom' | 'map'>('custom');
  const editAddressInputRef = useRef<HTMLInputElement>(null);
  const editAutocompleteRef = useRef<any>(null);

  const canAccess = (r: string | null) => {
    const rl = (r || "").toLowerCase();
    return rl === "admin" || rl === "owner" || rl === "superadmin" || rl === "billing staff";
  };

  useEffect(() => {
    const slug = getTenantSlugFromHost();
    if (!slug) { router.replace("/superadmin"); return; }
    const t = localStorage.getItem("dc_access") || "";
    const r = localStorage.getItem("dc_role");
    setRole(r);
    if (!t) { router.push("/login"); return; }
    if (!canAccess(r)) { router.replace("/"); return; }
    fetchCustomers("", 1, pageSize);
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('dc_access') || '';
      
      // Fetch the unmasked Google Maps API key
      const mapsRes = await fetch(
        `${base}org/maps-api-key`,
        withTenantHeaders({
          headers: { Authorization: `Bearer ${token}` }
        })
      );
      
      console.log('[Customers] Maps API response status:', mapsRes.status);
      
      if (mapsRes.ok) {
        const mapsData = await mapsRes.json();
        console.log('[Customers] Maps API data:', mapsData);
        
        if (mapsData.enabled && mapsData.google_api_key) {
          console.log('[Customers] Setting Google Maps API key:', mapsData.google_api_key.substring(0, 10) + '...');
          setGoogleMapsApiKey(mapsData.google_api_key);
        } else {
          console.log('[Customers] Maps not enabled or no API key:', { enabled: mapsData.enabled, hasKey: !!mapsData.google_api_key });
        }
      } else {
        console.error('[Customers] Failed to fetch maps API key:', mapsRes.status);
      }
      
      // Also fetch general settings for country code
      const res = await fetch(
        `${base}org/settings`,
        withTenantHeaders({
          headers: { Authorization: `Bearer ${token}` }
        })
      );
      
      if (res.ok) {
        const data = await res.json();
        const mapsSettings = data.maps_settings || {};
        const country = (mapsSettings.country || 'in').toLowerCase();
        setMapsCountry(country);
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  };

  // Initialize Google Maps Autocomplete for Create form
  const initAutocomplete = () => {
    console.log('[Customers] initAutocomplete called', { 
      hasApiKey: !!googleMapsApiKey, 
      hasWindow: typeof window !== 'undefined', 
      hasInputRef: !!addressInputRef.current 
    });
    
    if (!googleMapsApiKey || typeof window === 'undefined' || !addressInputRef.current) {
      console.log('[Customers] Missing requirements for autocomplete');
      return;
    }
    
    // Check if script already loaded
    if (!(window as any).google?.maps?.places) {
      console.log('[Customers] Google Maps not loaded yet, loading script...');
      
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        console.log('[Customers] Script already exists, waiting for load...');
        existingScript.addEventListener('load', () => setTimeout(initAutocomplete, 100));
        return;
      }
      
      const script = document.createElement('script');
      const region = mapsCountry.toUpperCase();
      const scriptSrc = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&region=${region}`;
      console.log('[Customers] Loading Google Maps script:', scriptSrc);
      
      script.src = scriptSrc;
      script.async = true;
      script.onload = () => {
        console.log('[Customers] Google Maps script loaded successfully');
        setTimeout(initAutocomplete, 100);
      };
      script.onerror = (e) => {
        console.error('[Customers] Failed to load Google Maps script:', e);
      };
      document.head.appendChild(script);
      return;
    }

    console.log('[Customers] Initializing Google Maps Autocomplete...');
    
    const options: any = { 
      fields: ['address_components', 'formatted_address', 'geometry']
    };
    
    // Only add country restriction if a specific country is set
    if (mapsCountry && mapsCountry !== 'all') {
      options.componentRestrictions = { country: mapsCountry };
    }

    const autocomplete = new (window as any).google.maps.places.Autocomplete(
      addressInputRef.current,
      options
    );

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.formatted_address) return;
      
      // Extract components
      const components = place.address_components || [];
      let cityVal = '';
      let stateVal = '';
      let pinVal = '';
      let streetAddress = '';
      
      for (const comp of components) {
        if (comp.types.includes('locality')) cityVal = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) stateVal = comp.long_name;
        if (comp.types.includes('postal_code')) pinVal = comp.long_name;
      }
      
      // Build street address without city, state, pin to avoid duplication
      const addressParts = [];
      for (const comp of components) {
        if (comp.types.includes('street_number') || 
            comp.types.includes('route') ||
            comp.types.includes('sublocality') ||
            comp.types.includes('sublocality_level_1') ||
            comp.types.includes('sublocality_level_2') ||
            comp.types.includes('neighborhood')) {
          addressParts.push(comp.long_name);
        }
      }
      
      streetAddress = addressParts.length > 0 ? addressParts.join(', ') : place.formatted_address.split(',')[0];
      
      setAddress(streetAddress);
      if (cityVal) setCity(cityVal);
      if (stateVal) setState(stateVal);
      if (pinVal) setPin(pinVal);
    });

    autocompleteRef.current = autocomplete;
  };

  // Initialize Google Maps Autocomplete for Edit form
  const initEditAutocomplete = () => {
    if (!googleMapsApiKey || typeof window === 'undefined' || !editAddressInputRef.current) return;
    
    // Check if script already loaded
    if (!(window as any).google?.maps?.places) {
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => setTimeout(initEditAutocomplete, 100));
        return;
      }
      
      const script = document.createElement('script');
      const region = mapsCountry.toUpperCase();
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&region=${region}`;
      script.async = true;
      script.onload = () => setTimeout(initEditAutocomplete, 100);
      document.head.appendChild(script);
      return;
    }

    const options: any = { 
      fields: ['address_components', 'formatted_address', 'geometry']
    };
    
    // Only add country restriction if a specific country is set
    if (mapsCountry && mapsCountry !== 'all') {
      options.componentRestrictions = { country: mapsCountry };
    }

    const autocomplete = new (window as any).google.maps.places.Autocomplete(
      editAddressInputRef.current,
      options
    );

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.formatted_address) return;
      
      // Extract components
      const components = place.address_components || [];
      let cityVal = '';
      let stateVal = '';
      let pinVal = '';
      let streetAddress = '';
      
      for (const comp of components) {
        if (comp.types.includes('locality')) cityVal = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) stateVal = comp.long_name;
        if (comp.types.includes('postal_code')) pinVal = comp.long_name;
      }
      
      // Build street address without city, state, pin to avoid duplication
      const addressParts = [];
      for (const comp of components) {
        if (comp.types.includes('street_number') || 
            comp.types.includes('route') ||
            comp.types.includes('sublocality') ||
            comp.types.includes('sublocality_level_1') ||
            comp.types.includes('sublocality_level_2') ||
            comp.types.includes('neighborhood')) {
          addressParts.push(comp.long_name);
        }
      }
      
      streetAddress = addressParts.length > 0 ? addressParts.join(', ') : place.formatted_address.split(',')[0];
      
      setEAddress(streetAddress);
      if (cityVal) setECity(cityVal);
      if (stateVal) setEState(stateVal);
      if (pinVal) setEPin(pinVal);
    });

    editAutocompleteRef.current = autocomplete;
  };

  // Initialize autocomplete when API key is available
  useEffect(() => {
    if (googleMapsApiKey && typeof window !== 'undefined') {
      console.log('[Customers] API key available, will init autocomplete when form opens');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleMapsApiKey]);

  // Initialize autocomplete when create form is shown
  useEffect(() => {
    if (showCreateForm && googleMapsApiKey && typeof window !== 'undefined') {
      console.log('[Customers] Create form opened, initializing autocomplete...');
      setTimeout(initAutocomplete, 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateForm, googleMapsApiKey]);

  useEffect(() => {
    if (editOpen && googleMapsApiKey && typeof window !== 'undefined') {
      setTimeout(initEditAutocomplete, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, googleMapsApiKey]);

  const fetchCustomers = async (search: string, pageArg?: number, sizeArg?: number) => {
    setLoading(true);
    setListError(null);
    try {
      const token = localStorage.getItem("dc_access") || "";
      const url = new URL(`${base}customers`);
      if (search) url.searchParams.set("q", search);
      const pg = pageArg ?? page; const sz = sizeArg ?? pageSize;
      url.searchParams.set("limit", String(sz));
      url.searchParams.set("offset", String((pg - 1) * sz));
      const res = await fetch(url.toString(), withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Customer[] = data.items || [];
      setItems(list);
      setHasMore(list.length === (sizeArg ?? pageSize));
      if (pageArg) setPage(pageArg);
    } catch (e: any) {
      setListError(e.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (ctype === "b2b") {
      if (!company.trim()) errs.company = "Company name is required";
      if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
        errs.gstin = "Invalid GSTIN format (expect 15 alphanumeric uppercase characters)";
      }
    } else {
      if (!name.trim()) errs.name = "Customer name is required";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("dc_access") || "";
      const payload: any = {
        custom_customer_id: customerId || undefined,
        ctype,
        name: name || undefined,
        company_name: company || undefined,
        gstin: gstin ? gstin.toUpperCase() : undefined,
        email: email || undefined,
        phone: phone || undefined,
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        pin: pin || undefined,
        notes: notes || undefined,
      };
      const res = await fetch(`${base}customers`, withTenantHeaders({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }));
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const detail: string | undefined = d?.detail || undefined;
        if (detail && /customer id.*already exists/i.test(detail)) {
          setFormErrors((prev) => ({ ...prev, customerId: detail }));
          return;
        }
        if (detail && /gstin/i.test(detail)) {
          setFormErrors((prev) => ({ ...prev, gstin: detail }));
          return;
        }
        setSubmitError(detail || `HTTP ${res.status}`);
        return;
      }
      // reset
      setCustomerId(""); setName(""); setCompany(""); setGstin(""); setEmail(""); setPhone(""); setAddress(""); setCity(""); setState(""); setPin(""); setNotes("");
      setFormErrors({});
      await fetchCustomers(q);
    } catch (e: any) {
      setSubmitError(e.message || "Failed to create customer");
    } finally {
      setSaving(false);
    }
  };

  const bulkDeleteCustomers = async () => {
    if (selectedIds.size === 0) {
      alert('Please select customers to delete');
      return;
    }

    if (!confirm(`Delete ${selectedIds.size} selected customer(s)? This cannot be undone.`)) return;
    
    setBulkDeleting(true);
    const token = localStorage.getItem('dc_access') || '';
    let successCount = 0;
    let failCount = 0;

    try {
      for (const customerId of Array.from(selectedIds)) {
        try {
          const res = await fetch(
            `${base}customers/${customerId}`,
            withTenantHeaders({
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            })
          );
          
          if (res.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          console.error(`Failed to delete customer ${customerId}:`, e);
          failCount++;
        }
      }

      // Remove successfully deleted customers from local state
      if (successCount > 0) {
        setItems(prev => prev.filter(c => !selectedIds.has(c.customer_id)));
        setSelectedIds(new Set());
      }

      // Show result
      if (failCount === 0) {
        alert(`Successfully deleted ${successCount} customer(s)`);
      } else {
        alert(`Deleted ${successCount} customer(s). Failed to delete ${failCount} customer(s).`);
      }
    } catch (e) {
      console.error(e);
      alert('Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(c => c.customer_id)));
    }
  };

  const toggleSelect = (customerId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
  };

  // Generate Invoice modal handlers
  const openGenerateInvoice = (c: Customer) => {
    setGiCustomer(c);
    const addr = [c.address, [c.city, c.state, c.pin].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join("\n")
      .trim();
    setGiShipTo(addr);
    setGiSameAs(true);
    setGiOpen(true);
  };

  const proceedGenerateInvoice = () => {
    if (!giCustomer) return;
    const cid = giCustomer.customer_id;
    const params = new URLSearchParams();
    params.set("create", "true"); // Force create new invoice mode
    params.set("shipToSame", giSameAs ? "1" : "0");
    if (!giSameAs && giShipTo.trim()) params.set("shipToAddress", giShipTo.trim());
    setGiOpen(false);
    router.push(`/billing/invoice/${cid}?${params.toString()}`);
  };

  // Open edit modal
  const openEditCustomer = (c: Customer) => {
    setEditCustomer(c);
    setECtype(c.ctype);
    setEName(c.name || "");
    setECompany(c.company_name || "");
    setEGstin(c.gstin || "");
    setEEmail(c.email || "");
    setEPhone(c.phone || "");
    setEAddress(c.address || "");
    setECity(c.city || "");
    setEState(c.state || "");
    setEPin(c.pin || "");
    setENotes(c.notes || "");
    setEditErrors({});
    setEditSubmitError(null);
    setEditOpen(true);
  };

  const validateEdit = () => {
    const errs: Record<string,string> = {};
    if (eCtype === "b2b") {
      if (!eCompany.trim()) errs.company_name = "Company name required";
      if (eGstin && !/^[0-9A-Z]{15}$/.test(eGstin)) errs.gstin = "GSTIN must be 15 chars (A-Z0-9)";
    } else {
      if (!eName.trim()) errs.name = "Name required";
    }
    setEditErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleEditSave = async () => {
    if (!editCustomer) return;
    setEditSubmitError(null);
    if (!validateEdit()) return;
    setEditSaving(true);
    try {
      const token = localStorage.getItem("dc_access") || "";
      const payload: any = {
        ctype: eCtype,
        name: eCtype === "b2b" ? (eName || undefined) : (eName || undefined),
        company_name: eCtype === "b2b" ? (eCompany || undefined) : undefined,
        gstin: eGstin ? eGstin.toUpperCase() : undefined,
        email: eEmail || undefined,
        phone: ePhone || undefined,
        address: eAddress || undefined,
        city: eCity || undefined,
        state: eState || undefined,
        pin: ePin || undefined,
        notes: eNotes || undefined,
      };
      const res = await fetch(`${base}customers/${editCustomer.customer_id}`, withTenantHeaders({
        method: "PUT",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
        body: JSON.stringify(payload)
      }));
      if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        const detail = d.detail || `HTTP ${res.status}`;
        if (/gstin/i.test(detail)) { setEditErrors(prev => ({...prev, gstin: detail})); return; }
        setEditSubmitError(detail); return;
      }
      setEditOpen(false);
      await fetchCustomers(q);
    } catch (e:any) {
      setEditSubmitError(e.message || "Failed to update customer");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-6">
      <div className="max-w-7xl mx-auto px-4">
        {/* Professional Header with Gradient */}
        <div className="mb-8 bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-800 rounded-xl shadow-lg p-8 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Users className="w-8 h-8" />
                </div>
                <h1 className="text-3xl font-bold">Customers</h1>
              </div>
              <p className="text-purple-50 text-sm mb-4">Manage your customer database and relationships</p>
              
              {/* Stats Card */}
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/20">
                <Users className="w-5 h-5" />
                <span className="font-semibold">Total Customers: {items.length}</span>
              </div>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchCustomers(q, 1, pageSize)}
                placeholder="Search by name, company, phone, email..."
                className="w-full pl-11 pr-4 py-3 rounded-lg bg-white/95 backdrop-blur-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-sm"
              />
            </div>
            <button 
              onClick={() => fetchCustomers(q, 1, pageSize)} 
              className="px-8 py-3 bg-white text-purple-700 font-semibold rounded-lg hover:bg-purple-50 transition-colors shadow-md hover:shadow-lg"
            >
              Search
            </button>
          </div>
        </div>

  {listError && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-md"><strong>⚠ Error:</strong> {listError}</div>}

        {/* Add Customer & Upload Buttons */}
        <div className="flex items-center justify-end gap-3 mb-6">
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-md hover:shadow-lg font-semibold"
          >
            <Upload size={20} />
            Bulk Upload
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg font-semibold"
          >
            <Plus size={20} />
            {showCreateForm ? 'Hide Form' : 'Add Customer'}
          </button>
        </div>

        {/* Create customer card */}
        {showCreateForm && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-5 mb-6 animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
            <div className="font-semibold text-gray-900 text-lg inline-flex items-center gap-2">
              <Plus size={20} /> Add New Customer
            </div>
            <button 
              onClick={() => setShowCreateForm(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close form"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Type</label>
              <select value={ctype} onChange={(e) => setCtype(e.target.value as any)} className="w-full px-2 py-2 border border-gray-300 rounded-md">
                <option value="b2c">B2C (Individual)</option>
                <option value="b2b">B2B (Business)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Customer ID (Optional)</label>
              <input 
                value={customerId} 
                onChange={(e) => {
                  setCustomerId(e.target.value.replace(/[^A-Za-z0-9]/g, ''));
                  setFormErrors((p) => ({ ...p, customerId: "" }));
                }} 
                className={`w-full px-2 py-2 border rounded-md ${formErrors.customerId ? "border-red-400" : "border-gray-300"}`}
                placeholder="Leave empty for auto-generated ID"
                maxLength={10}
              />
              {formErrors.customerId && <p className="mt-1 text-xs text-red-600">{formErrors.customerId}</p>}
              <p className="mt-1 text-xs text-gray-500">6-char alphanumeric (A-Z, a-z, 0-9)</p>
            </div>
            {ctype === "b2b" ? (
              <>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Company Name</label>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} className={`w-full px-2 py-2 border rounded-md ${formErrors.company ? "border-red-400" : "border-gray-300"}`} />
                  {formErrors.company && <p className="mt-1 text-xs text-red-600">{formErrors.company}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">GSTIN</label>
                  <input value={gstin} onChange={(e) => { setGstin(e.target.value.toUpperCase()); setFormErrors((p) => ({ ...p, gstin: "" })); }} className={`w-full px-2 py-2 border rounded-md ${formErrors.gstin ? "border-red-400" : "border-gray-300"}`} placeholder="15-char GSTIN" />
                  {formErrors.gstin && <p className="mt-1 text-xs text-red-600">{formErrors.gstin}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Contact Person</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-md" />
                </div>
              </>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">Customer Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full px-2 py-2 border rounded-md ${formErrors.name ? "border-red-400" : "border-gray-300"}`} />
                {formErrors.name && <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>}
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-md" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-md" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Address</label>
              <input
                ref={addressInputRef}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-2 py-2 border border-gray-300 rounded-md"
                placeholder="Start typing address..."
              />
              {!googleMapsApiKey && (
                <p className="mt-1 text-xs text-gray-500">
                  Add Google Maps API key in Settings to enable address autocomplete
                </p>
              )}
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Notes</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-md" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            {submitError && <div className="text-sm text-red-600">{submitError}</div>}
            <div className="grow"></div>
            <button onClick={handleCreate} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium disabled:opacity-50 hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm">
              <Plus size={16} /> {saving ? "Saving..." : "Add Customer"}
            </button>
          </div>
        </div>
        )}

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-sm border-2 border-blue-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-blue-900">
                  {selectedIds.size} customer(s) selected
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-blue-700 hover:text-blue-800 underline"
                >
                  Clear selection
                </button>
              </div>
              <button
                onClick={bulkDeleteCustomers}
                disabled={bulkDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <Trash2 size={16} />
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
              </button>
            </div>
          </div>
        )}

        {/* Customer Table */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <th className="px-4 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Name / Company</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Address</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-3"></div>
                    Loading customers...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <Users className="w-14 h-14 mx-auto mb-3 text-gray-300" />
                    <p className="font-semibold text-gray-700">No customers found</p>
                  </td>
                </tr>
              ) : items.map((c) => (
                <tr key={c.customer_id} className={`hover:bg-purple-50/30 transition-colors duration-150 ${
                  selectedIds.has(c.customer_id) ? 'bg-blue-50' : ''
                }`}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.customer_id)}
                      onChange={() => toggleSelect(c.customer_id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${
                      c.ctype === 'b2b' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-green-100 text-green-700 border border-green-200'
                    }`}>
                      {c.ctype.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 text-base">{c.ctype === "b2b" ? (c.company_name || "-") : (c.name || "-")}</div>
                    {c.custom_customer_id && <div className="text-xs text-gray-500 mt-1 font-mono">ID: {c.custom_customer_id}</div>}
                    {c.ctype === "b2b" && c.name ? <div className="text-sm text-gray-600 mt-1 flex items-center gap-1"><User size={14} /> {c.name}</div> : null}
                    {c.gstin ? <div className="text-xs text-gray-500 mt-1 font-mono">GSTIN: {c.gstin}</div> : null}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {c.phone ? <div className="text-sm text-gray-700 font-medium">📱 {c.phone}</div> : null}
                      {c.email ? <div className="text-sm text-gray-600 truncate">✉️ {c.email}</div> : null}
                      {!c.phone && !c.email && <span className="text-sm text-gray-400">—</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {c.address ? (
                      <div className="max-w-xs">
                        <div className="text-sm text-gray-700 line-clamp-2 flex items-start gap-1">
                          <MapPin size={14} className="mt-0.5 flex-shrink-0 text-purple-600" />
                          {c.address}
                        </div>
                        {[c.city, c.state, c.pin].filter(Boolean).length > 0 && (
                          <div className="text-xs text-gray-500 mt-1 ml-5">
                            {[c.city, c.state, c.pin].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </div>
                    ) : <span className="text-sm text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openGenerateInvoice(c)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm text-xs font-semibold"
                        title="Generate Invoice"
                      >
                        <FileText size={14} />
                        Generate Invoice
                      </button>
                      <button
                        onClick={() => openEditCustomer(c)}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => { setDelCustomer(c); setDelError(null); setDelOpen(true); }}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

          {giOpen && giCustomer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={() => setGiOpen(false)}></div>
              <div className="relative bg-white rounded-lg shadow-lg w-full max-w-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-gray-900">Generate Invoice</div>
                  <button onClick={() => setGiOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="text-sm text-gray-700 mb-3">
                  <div className="font-medium">Bill To</div>
                  <div className="text-gray-900">{giCustomer.ctype === "b2b" ? (giCustomer.company_name || "-") : (giCustomer.name || "-")}</div>
                  {giCustomer.ctype === "b2b" && giCustomer.name ? <div className="text-xs text-gray-600">Attn: {giCustomer.name}</div> : null}
                  {giCustomer.address && <div className="text-sm">{giCustomer.address}</div>}
                  <div className="text-xs text-gray-500">{[giCustomer.city, giCustomer.state, giCustomer.pin].filter(Boolean).join(", ")}</div>
                </div>
                <div className="mb-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-500">Ship To (this invoice)</div>
                    <label className="inline-flex items-center gap-2 text-xs select-none">
                      <input type="checkbox" className="rounded border-gray-300" checked={giSameAs} onChange={(e) => {
                        const checked = e.target.checked; setGiSameAs(checked);
                        if (checked) {
                          const addr = [giCustomer.address, [giCustomer.city, giCustomer.state, giCustomer.pin].filter(Boolean).join(", ")]
                            .filter(Boolean)
                            .join("\n").trim();
                          setGiShipTo(addr);
                        }
                      }} />
                      <span>Same as Bill To</span>
                    </label>
                  </div>
                  <textarea
                    value={giSameAs ? ([giCustomer.address, [giCustomer.city, giCustomer.state, giCustomer.pin].filter(Boolean).join(", ")].filter(Boolean).join("\n").trim()) : giShipTo}
                    onChange={(e) => setGiShipTo(e.target.value)}
                    disabled={giSameAs}
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[88px] text-sm"
                    placeholder="Ship To address for this invoice"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">This does not change the saved customer. It only applies to the invoice you’re about to generate.</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => setGiOpen(false)} className="px-3 py-2 rounded-md border text-sm">Cancel</button>
                  <button onClick={proceedGenerateInvoice} className="px-3 py-2 rounded-md bg-brand-600 text-white text-sm">Continue</button>
                </div>
              </div>
            </div>
          )}

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span>Rows per page:</span>
            <select 
              value={pageSize} 
              onChange={(e)=> { const sz = Number(e.target.value); setPageSize(sz); fetchCustomers(q, 1, sz); }} 
              className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchCustomers(q, Math.max(1, page-1), pageSize)} 
              disabled={page<=1 || loading} 
              className="px-4 py-1.5 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <div className="px-3 py-1.5 text-sm font-medium text-gray-700">
              Page {page}
            </div>
            <button 
              onClick={() => fetchCustomers(q, page+1, pageSize)} 
              disabled={!hasMore || loading} 
              className="px-4 py-1.5 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {giOpen && giCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setGiOpen(false)}></div>
            <div className="relative bg-white rounded-lg shadow-lg w-full max-w-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-900">Generate Invoice</div>
                <button onClick={() => setGiOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
              <div className="text-sm text-gray-700 mb-3">
                <div className="font-medium">Bill To</div>
                <div className="text-gray-900">{giCustomer.ctype === "b2b" ? (giCustomer.company_name || "-") : (giCustomer.name || "-")}</div>
                {giCustomer.ctype === "b2b" && giCustomer.name ? <div className="text-xs text-gray-600">Attn: {giCustomer.name}</div> : null}
                {giCustomer.address && <div className="text-sm">{giCustomer.address}</div>}
                <div className="text-xs text-gray-500">{[giCustomer.city, giCustomer.state, giCustomer.pin].filter(Boolean).join(", ")}</div>
              </div>
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-gray-500">Ship To (this invoice)</div>
                  <label className="inline-flex items-center gap-2 text-xs select-none">
                    <input type="checkbox" className="rounded border-gray-300" checked={giSameAs} onChange={(e) => {
                      const checked = e.target.checked; setGiSameAs(checked);
                      if (checked) {
                        const addr = [giCustomer.address, [giCustomer.city, giCustomer.state, giCustomer.pin].filter(Boolean).join(", ")]
                          .filter(Boolean)
                          .join("\n").trim();
                        setGiShipTo(addr);
                      }
                    }} />
                    <span>Same as Bill To</span>
                  </label>
                </div>
                <textarea
                  value={giSameAs ? ([giCustomer.address, [giCustomer.city, giCustomer.state, giCustomer.pin].filter(Boolean).join(", ")].filter(Boolean).join("\n").trim()) : giShipTo}
                  onChange={(e) => setGiShipTo(e.target.value)}
                  disabled={giSameAs}
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[88px] text-sm"
                  placeholder="Ship To address for this invoice"
                />
                <p className="mt-1 text-[11px] text-gray-500">This does not change the saved customer. It only applies to the invoice you’re about to generate.</p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setGiOpen(false)} className="px-3 py-2 rounded-md border text-sm">Cancel</button>
                <button onClick={proceedGenerateInvoice} className="px-3 py-2 rounded-md bg-brand-600 text-white text-sm">Continue</button>
              </div>
            </div>
          </div>
        )}

        {editOpen && editCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setEditOpen(false)}></div>
            <div className="relative bg-white rounded-lg shadow-lg w-full max-w-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium text-gray-900">Edit Customer</div>
                <button onClick={() => setEditOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Type</label>
                  <select value={eCtype} onChange={(e)=> setECtype(e.target.value as any)} className="w-full px-2 py-2 border border-gray-300 rounded-md">
                    <option value="b2c">B2C</option>
                    <option value="b2b">B2B</option>
                  </select>
                </div>
                {eCtype === "b2b" ? (
                  <>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Company</label>
                      <input value={eCompany} onChange={(e)=> { setECompany(e.target.value); setEditErrors(prev=>({...prev, company_name:""})); }} className={`w-full px-2 py-2 border rounded-md ${editErrors.company_name?"border-red-400":"border-gray-300"}`} />
                      {editErrors.company_name && <p className="mt-1 text-xs text-red-600">{editErrors.company_name}</p>}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">GSTIN</label>
                      <input value={eGstin} onChange={(e)=> { setEGstin(e.target.value.toUpperCase()); setEditErrors(prev=>({...prev, gstin:""})); }} className={`w-full px-2 py-2 border rounded-md ${editErrors.gstin?"border-red-400":"border-gray-300"}`} placeholder="15-char GSTIN" />
                      {editErrors.gstin && <p className="mt-1 text-xs text-red-600">{editErrors.gstin}</p>}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Contact Person</label>
                      <input value={eName} onChange={(e)=> setEName(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-md" />
                    </div>
                  </>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">Customer Name</label>
                    <input value={eName} onChange={(e)=> { setEName(e.target.value); setEditErrors(prev=>({...prev, name:""})); }} className={`w-full px-2 py-2 border rounded-md ${editErrors.name?"border-red-400":"border-gray-300"}`} />
                    {editErrors.name && <p className="mt-1 text-xs text-red-600">{editErrors.name}</p>}
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Email</label>
                  <input value={eEmail} onChange={(e)=> setEEmail(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Phone</label>
                  <input value={ePhone} onChange={(e)=> setEPhone(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-md" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs text-gray-600 mb-1">Address</label>
                  <input
                    ref={editAddressInputRef}
                    value={eAddress}
                    onChange={(e)=> setEAddress(e.target.value)}
                    className="w-full px-2 py-2 border border-gray-300 rounded-md"
                    placeholder="Start typing address..."
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs text-gray-600 mb-1">Notes</label>
                  <input value={eNotes} onChange={(e)=> setENotes(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-md" />
                </div>
              </div>
              {editSubmitError && <div className="mt-3 text-sm text-red-600">{editSubmitError}</div>}
              <div className="mt-4 flex items-center justify-end gap-3">
                <button onClick={()=> setEditOpen(false)} className="px-3 py-2 rounded-md border text-sm">Cancel</button>
                <button onClick={handleEditSave} disabled={editSaving} className="px-3 py-2 rounded-md bg-brand-600 text-white text-sm disabled:opacity-50">
                  {editSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {delOpen && delCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDelOpen(false)}></div>
            <div className="relative bg-white rounded-lg shadow-lg w-full max-w-md p-5">
              <div className="font-medium text-gray-900 mb-2">Delete Customer</div>
              <div className="text-sm text-gray-700 mb-3">Are you sure you want to delete this customer? This action cannot be undone.</div>
              <div className="bg-gray-50 border rounded p-3 mb-3 text-sm">
                <div className="font-medium text-gray-900">{delCustomer.ctype === "b2b" ? (delCustomer.company_name || "-") : (delCustomer.name || "-")}</div>
                <div className="text-xs text-gray-500">{[delCustomer.email, delCustomer.phone].filter(Boolean).join(" · ")}</div>
              </div>
              {delError && <div className="text-sm text-red-600 mb-2">{delError}</div>}
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => setDelOpen(false)} className="px-3 py-2 rounded-md border text-sm">Cancel</button>
                <button onClick={async () => {
                  if (!delCustomer) return;
                  setDelError(null);
                  setDelLoading(true);
                  try {
                    const token = localStorage.getItem("dc_access") || "";
                    const res = await fetch(`${base}customers/${delCustomer.customer_id}`, withTenantHeaders({ method: "DELETE", headers: { Authorization: `Bearer ${token}` } }));
                    if (!res.ok) {
                      const d = await res.json().catch(() => ({}));
                      throw new Error(d.detail || `HTTP ${res.status}`);
                    }
                    setDelOpen(false);
                    setDelCustomer(null);
                    await fetchCustomers(q, 1, pageSize);
                  } catch (e:any) {
                    setDelError(e.message || "Failed to delete");
                  } finally {
                    setDelLoading(false);
                  }
                }} disabled={delLoading} className="px-3 py-2 rounded-md bg-red-600 text-white text-sm disabled:opacity-50">{delLoading?"Deleting...":"Delete"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Upload Modal */}
        {showUploadModal && (
          <CustomerUploadModal
            base={base}
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              setShowUploadModal(false);
              fetchCustomers(q, 1, pageSize);
            }}
          />
        )}
      </div>
    </div>
  );
}
