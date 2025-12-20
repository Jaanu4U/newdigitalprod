"use client";
import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { apiBase } from "@/lib/api";
import { withTenantHeaders, getTenantSlugFromHost } from "@/lib/tenant";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, Truck, X, Package, CheckCircle, MapPin, MessageCircle, Upload, Download, Trash2, Edit } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import UploadModal from "./UploadModal";

interface ShipmentInfo {
  provider_name?: string;
  provider_code?: string;
  tracking_number?: string;
  status?: string;
  shipping_address?: string;
}

interface DraftRow {
  id: number;
  created_at: string;
  created_by?: string;
  created_by_name?: string;
  invoice_id?: string;
  invoice_no?: string;
  customer_id?: string;
  customer_name?: string;
  customer_company_name?: string;
  customer_phone?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_address?: string;
  totals?: { subtotal?: number; total?: number };
  items_count: number;
  rider_name?: string;
  rider_assignment_status?: string;  // pending, accepted, rejected
  shipment?: ShipmentInfo | null;
}

interface Rider {
  user_id: string;
  name: string;
  email: string;
  cellnumber?: string;
  assigned_count?: number;
}

interface ShipmentProvider {
  provider_id: string;
  name: string;
  code: string;
  tracking_url?: string;
}

function OrdersInner() {
  const base = useMemo(() => apiBase(), []);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<{attempt:number; max:number; nextDelay:number}|null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<DraftRow | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loadingRiders, setLoadingRiders] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string>("");
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shipmentProviders, setShipmentProviders] = useState<ShipmentProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [assigningShipment, setAssigningShipment] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [enabledProviderCodes, setEnabledProviderCodes] = useState<string[]>([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [shippingAddress, setShippingAddress] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [savingAddress, setSavingAddress] = useState(false);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>("");
  const [addressSaveSuccess, setAddressSaveSuccess] = useState(false);
  const [addressInputMode, setAddressInputMode] = useState<'map' | 'custom'>('map');
  const [whatsappAccounts, setWhatsappAccounts] = useState<any[]>([]);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [selectedInvoiceForPhone, setSelectedInvoiceForPhone] = useState<DraftRow | null>(null);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [updatingPhone, setUpdatingPhone] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const searchParams = useSearchParams();
  const from = searchParams?.get('from');

  useEffect(() => {
    setMounted(true);
    try { setSlug(getTenantSlugFromHost()); } catch { setSlug(null); }
  }, []);

  useEffect(() => {
    // Fetch organization settings to get enabled providers and Google Maps API key
    const fetchOrgSettings = async () => {
      try {
        const token = localStorage.getItem('dc_access') || '';
        const res = await fetch(`${base}org/settings`, withTenantHeaders({ 
          headers: { Authorization: `Bearer ${token}` } 
        }));
        if (res.ok) {
          const data = await res.json();
          const providerSettings = data.provider_settings || {};
          setEnabledProviderCodes(providerSettings.enabled_provider_codes || []);
          
          // Get WhatsApp settings
          const whatsappSettings = data.whatsapp_settings || {};
          setWhatsappEnabled(Boolean(whatsappSettings.enabled));
          setWhatsappAccounts(whatsappSettings.accounts || []);
          
          // Fetch unmasked Google Maps API key from dedicated endpoint
          const mapsRes = await fetch(`${base}org/maps-api-key`, withTenantHeaders({ 
            headers: { Authorization: `Bearer ${token}` } 
          }));
          if (mapsRes.ok) {
            const mapsData = await mapsRes.json();
            setGoogleMapsApiKey(mapsData.google_api_key || '');
          }
        }
      } catch (e) {
        console.error('Failed to fetch org settings:', e);
      }
    };
    
    if (mounted && slug) {
      fetchOrgSettings();
    }
  }, [mounted, slug, base]);

  // Re-initialize autocomplete when switching to map mode
  useEffect(() => {
    if (showAddressModal && addressInputMode === 'map' && googleMapsApiKey && typeof window !== 'undefined') {
      setTimeout(() => {
        initAutocomplete();
      }, 100);
    }
  }, [addressInputMode, showAddressModal]);

  useEffect(() => {
    let timeout: any;
    let attempts = 0;
    const max = 3; // total attempts including first
    const run = async () => {
      try {
        if (!mounted) return;
        const token = typeof window !== 'undefined' ? (localStorage.getItem("dc_access") || "") : "";
        if (!token || !slug) { setLoading(false); return; }
        const url = `${base}invoice/drafts`;
        const init = withTenantHeaders({ headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        // eslint-disable-next-line no-console
        console.log('Fetch drafts:', url, init);
        const res = await fetch(url, init);
        if (!res.ok) {
          // For immediate post-save redirect and slow backend deploys, retry a few times on 404/errors
          const d = await res.json().catch(()=>({}));
          const detail = d.detail || `HTTP ${res.status}`;
          if (from === 'save' && attempts < (max-1)) {
            attempts += 1;
            const delay = attempts * 2000; // 2s, 4s
            setRetryInfo({ attempt: attempts+1, max, nextDelay: delay });
            // eslint-disable-next-line no-console
            console.warn(`Drafts fetch failed (${detail}). Retrying in ${delay}ms…`);
            timeout = setTimeout(run, delay);
            return;
          }
          throw new Error(detail);
        }
        const data = await res.json();
        // eslint-disable-next-line no-console
        console.log('Drafts response:', data);
        
        // Set drafts directly - rider info should come from backend if needed
        // Removed: timeline fetching loop (was making 100+ API calls and causing slow load)
        setRows(data.drafts || []);
        setErr(null);
        setRetryInfo(null);
      } catch(e:any) {
        setErr(e.message || 'Failed loading drafts');
      } finally {
        setLoading(false);
      }
    };
    run();
    return () => { if (timeout) clearTimeout(timeout); };
  }, [base, slug, mounted, from]);

  const loadRiders = useCallback(async () => {
    setLoadingRiders(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(`${base}org/users`, withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } }));
      if (!res.ok) throw new Error('Failed to load riders');
      const data = await res.json();
      const ridersList = data.filter((u: any) => (u.role || '').toLowerCase() === 'rider');
      
      // Count assigned orders for each rider
      const ridersWithCount = ridersList.map((rider: Rider) => {
        const assignedCount = rows.filter((d: DraftRow) => d.rider_name === rider.name).length;
        return { ...rider, assigned_count: assignedCount };
      });
      
      setRiders(ridersWithCount);
    } catch (e) {
      console.error(e);
      setRiders([]);
    } finally {
      setLoadingRiders(false);
    }
  }, [base, rows]);

  const handleAssignRider = useCallback(async (riderId: string) => {
    if (!selectedInvoice?.customer_id || !selectedInvoice?.invoice_id) return;
    setAssigning(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}invoice/${selectedInvoice.customer_id}/assign-rider`,
        withTenantHeaders({
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            rider_user_id: riderId,
            invoice_id: selectedInvoice.invoice_id 
          })
        })
      );
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to assign rider');
      }
      
      // Update the row with rider name and status
      const rider = riders.find(r => r.user_id === riderId);
      if (rider) {
        setRows(prev => prev.map(r => 
          r.invoice_id === selectedInvoice.invoice_id 
            ? { ...r, rider_name: rider.name || rider.email, rider_assignment_status: 'pending' }
            : r
        ));
      }
      
      setShowRiderModal(false);
      setSelectedInvoice(null);
      
      // Reload data to get updated status from server
      window.location.reload();
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to assign rider');
    } finally {
      setAssigning(false);
    }
  }, [base, selectedInvoice, riders]);

  const handleSendWhatsApp = async (order: DraftRow) => {
    if (!whatsappEnabled || whatsappAccounts.length === 0) {
      alert('WhatsApp is not configured. Please set up WhatsApp accounts in Settings.');
      return;
    }

    if (!order.rider_name) {
      alert('Please assign a rider first before sending WhatsApp message.');
      return;
    }

    // Find rider's cell number
    const rider = riders.find(r => r.name === order.rider_name || r.email === order.rider_name);
    if (!rider || !rider.cellnumber) {
      alert('Rider cell number not found. Please update rider information.');
      return;
    }

    try {
      const token = localStorage.getItem('dc_access') || '';
      
      // Fetch invoice details to get ship-to address
      let shipToAddress = order.shipment?.shipping_address || '';
      let customerName = '';
      let customerPhone = '';
      
      if (order.customer_id && order.invoice_id) {
        try {
          const invoiceRes = await fetch(
            `${base}invoice/${order.customer_id}/view/${order.invoice_id}`,
            withTenantHeaders({
              headers: { Authorization: `Bearer ${token}` }
            })
          );
          
          if (invoiceRes.ok) {
            const invoiceData = await invoiceRes.json();
            
            // Get ship-to address or billing address
            if (invoiceData.ship_to_address) {
              shipToAddress = invoiceData.ship_to_address;
            } else if (invoiceData.billing_address) {
              shipToAddress = invoiceData.billing_address;
            }
            
            // Get customer details
            if (invoiceData.customer_name) {
              customerName = invoiceData.customer_name;
            }
            if (invoiceData.customer_phone) {
              customerPhone = invoiceData.customer_phone;
            }
          }
        } catch (e) {
          console.error('Failed to fetch invoice details:', e);
        }
      }
      
      if (!shipToAddress) {
        alert('No shipping address found. Please add shipping address first.');
        return;
      }
    
      // Pick first active WhatsApp account
      const activeAccount = whatsappAccounts.find(acc => acc.status === 'active') || whatsappAccounts[0];
      if (!activeAccount) {
        alert('No active WhatsApp account found.');
        return;
      }
      
      // Format message with ship-to address
      let message = `🚚 *New Delivery Assignment*\n\n`;
      message += `📦 *Order:* ${order.invoice_no || order.invoice_id}\n\n`;
      
      if (customerName) {
        message += `👤 *Customer:* ${customerName}\n`;
      }
      if (customerPhone) {
        message += `� *Phone:* ${customerPhone}\n`;
      }
      if (customerName || customerPhone) {
        message += `\n`;
      }
      
      message += `📍 *Ship To Address:*\n${shipToAddress}\n\n`;
      message += `📊 *Order Details:*\n`;
      message += `• ${order.items_count} item(s)\n`;
      message += `• Total: ₹${order.totals?.total || 0}\n\n`;
      message += `✅ Please confirm receipt and update delivery status.`;

      // Send WhatsApp message via backend
      const res = await fetch(`${base}whatsapp/send`, withTenantHeaders({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_id: activeAccount.id,
          to: rider.cellnumber,
          message: message,
          order_id: order.invoice_id
        })
      }));

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to send WhatsApp message');
      }

      alert('WhatsApp message sent successfully!');
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to send WhatsApp message');
    }
  };

  const refreshDrafts = async () => {
    try {
      const token = localStorage.getItem('dc_access') || '';
      const url = `${base}invoice/drafts`;
      const res = await fetch(url, withTenantHeaders({ 
        headers: { Authorization: `Bearer ${token}` }, 
        cache: 'no-store' 
      }));
      if (res.ok) {
        const data = await res.json();
        setRows(data.drafts || []);
      }
    } catch (e) {
      console.error('Failed to refresh drafts:', e);
    }
  };

  const openRiderModal = (invoice: DraftRow) => {
    // Only block if rider has accepted
    if (invoice.rider_name && invoice.rider_assignment_status === 'accepted') {
      return; // Accepted assignment, don't allow reassignment
    }
    setSelectedInvoice(invoice);
    setShowRiderModal(true);
    loadRiders();
  };

  const openShipmentModal = (invoice: DraftRow) => {
    setSelectedInvoice(invoice);
    setShowShipmentModal(true);
    setTrackingNumber(invoice.shipment?.tracking_number || "");
    loadShipmentProviders();
  };

  const loadShipmentProviders = async () => {
    setLoadingProviders(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}providers`,
        withTenantHeaders({ headers: { Authorization: `Bearer ${token}` } })
      );
      if (res.ok) {
        const data = await res.json();
        const allProviders = data.items || [];
        
        // Filter to only show enabled providers from organization settings
        const filteredProviders = enabledProviderCodes.length > 0
          ? allProviders.filter((p: ShipmentProvider) => enabledProviderCodes.includes(p.code))
          : allProviders;
        
        setShipmentProviders(filteredProviders);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProviders(false);
    }
  };

  const assignShipmentProvider = async (providerId: string) => {
    if (!selectedInvoice?.invoice_id) return;
    setAssigningShipment(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}invoice/shipment/assign`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: selectedInvoice.invoice_id,
            provider_id: providerId,
          }),
        })
      );
      if (res.ok) {
        // Refresh drafts to show updated shipment info
        setShowShipmentModal(false);
        refreshDrafts();
      } else {
        alert('Failed to assign shipment provider');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to assign shipment provider');
    } finally {
      setAssigningShipment(false);
    }
  };

  const updateTrackingNumber = async () => {
    if (!selectedInvoice?.invoice_id || !trackingNumber.trim()) return;
    setAssigningShipment(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}invoice/shipment/update`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: selectedInvoice.invoice_id,
            tracking_number: trackingNumber,
            status: 'in_transit',
          }),
        })
      );
      if (res.ok) {
        setShowShipmentModal(false);
        refreshDrafts();
      } else {
        alert('Failed to update tracking number');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to update tracking number');
    } finally {
      setAssigningShipment(false);
    }
  };

  const markShipmentDelivered = async () => {
    if (!selectedInvoice?.invoice_id || !selectedInvoice.shipment?.tracking_number) {
      console.log('Cannot mark delivered - missing data:', {
        invoice_id: selectedInvoice?.invoice_id,
        tracking_number: selectedInvoice?.shipment?.tracking_number
      });
      return;
    }
    setAssigningShipment(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}invoice/shipment/update`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: selectedInvoice.invoice_id,
            tracking_number: selectedInvoice.shipment.tracking_number,
            status: 'delivered',
          }),
        })
      );
      if (res.ok) {
        setShowShipmentModal(false);
        refreshDrafts();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to mark delivered:', res.status, errorData);
        alert(`Failed to mark as delivered: ${errorData.detail || res.status}`);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to mark as delivered');
    } finally {
      setAssigningShipment(false);
    }
  };

  const openAddressModal = (invoice: DraftRow) => {
    setSelectedInvoice(invoice);
    setShippingAddress(invoice.shipment?.shipping_address || "");
    setShowAddressModal(true);
    setAddressInputMode(googleMapsApiKey ? 'map' : 'custom');
    
    // Load Google Places Autocomplete after modal opens (only if API key exists and map mode)
    if (googleMapsApiKey && typeof window !== 'undefined') {
      setTimeout(() => {
        initAutocomplete();
      }, 100);
    }
  };

  const initAutocomplete = () => {
    if (!googleMapsApiKey || typeof window === 'undefined') return;
    
    // Check if script is already loaded
    if ((window as any).google?.maps?.places) {
      setupAutocomplete();
      return;
    }
    
    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => setupAutocomplete());
      return;
    }
    
    // Load Google Maps script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    
    // Set up global callback
    (window as any).initGoogleMaps = () => {
      setupAutocomplete();
      delete (window as any).initGoogleMaps;
    };
    
    script.onerror = () => {
      console.error('Failed to load Google Maps script');
    };
    
    document.head.appendChild(script);
  };

  const setupAutocomplete = () => {
    const input = document.getElementById('address-input') as HTMLInputElement;
    if (!input || !(window as any).google?.maps?.places) return;

    try {
      const autocomplete = new (window as any).google.maps.places.Autocomplete(input, {
        types: ['geocode'],
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'address_components', 'geometry', 'name'],
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.formatted_address) {
          setShippingAddress(place.formatted_address);
        } else if (place.name) {
          setShippingAddress(place.name);
        }
      });
    } catch (error) {
      console.error('Error setting up autocomplete:', error);
    }
  };

  const searchAddress = async (query: string) => {
    setShippingAddress(query);
    // Google Places Autocomplete handles suggestions automatically via the widget
  };

  const fetchLocationFromWhatsApp = async (order?: DraftRow) => {
    const targetOrder = order || selectedInvoice;
    if (!targetOrder?.customer_id || !targetOrder?.invoice_id) {
      alert('Please select an order first');
      return;
    }
    
    if (!targetOrder.customer_phone) {
      alert('Customer phone number not found for this order');
      return;
    }
    
    console.log('Fetching location for order:', targetOrder.invoice_id);
    setSavingAddress(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const customerPhone = targetOrder.customer_phone;
      console.log('Fetching location from WhatsApp for phone:', customerPhone);

      // Fetch active WhatsApp sessions from the service
      let sessionId = null;
      try {
        const sessionsRes = await fetch(
          `${base}whatsapp/sessions`,
          withTenantHeaders({
            headers: { Authorization: `Bearer ${token}` }
          })
        );
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          const activeSessions = sessionsData.sessions || [];
          const readySession = activeSessions.find((s: any) => s.status === 'ready' || s.status === 'authenticated');
          if (readySession) {
            sessionId = readySession.sessionId;
            console.log('Using active WhatsApp session:', sessionId);
          }
        }
      } catch (e) {
        console.error('Failed to fetch WhatsApp sessions:', e);
      }

      // Fallback: Get WhatsApp account from settings if no active session found
      if (!sessionId) {
        const whatsappAccount = whatsappAccounts.find(acc => acc.is_default) || whatsappAccounts[0];
        if (!whatsappAccount) {
          alert('No WhatsApp account configured. Please configure WhatsApp in settings or initialize a session in the WhatsApp page.');
          setSavingAddress(false);
          return;
        }
        sessionId = whatsappAccount.id;
        console.log('Using WhatsApp account from settings:', sessionId);
      }

      console.log('Using WhatsApp session ID:', sessionId);

      // Fetch location from WhatsApp messages
      const res = await fetch(
        `${base}whatsapp/get-location`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: sessionId,
            phone_number: customerPhone,
            invoice_id: targetOrder.invoice_id,  // Include invoice_id to update draft
          }),
        })
      );

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        console.error('WhatsApp location fetch failed:', error);
        throw new Error(error.detail || error.error || 'Failed to fetch location from WhatsApp');
      }

      const data = await res.json();
      console.log('WhatsApp location data:', data);
      
      if (data.latitude && data.longitude) {
        // Check if backend already geocoded the address
        if (data.address) {
          setShippingAddress(data.address);
          setAddressInputMode('custom');
          setSavingAddress(false);
          
          // Refresh page to show updated coordinates in table
          alert(`✅ Location retrieved from WhatsApp and saved to invoice!\n\nAddress: ${data.address}\n\nClick the blue directions button to navigate.`);
          window.location.reload();
          return;
        }
        
        // Fallback to coordinates if geocoding failed on backend
        setShippingAddress(`Lat: ${data.latitude}, Lng: ${data.longitude}`);
        setAddressInputMode('custom');
        setSavingAddress(false);
        alert(`⚠️ Location coordinates retrieved but address conversion failed.\n\nCoordinates: ${data.latitude}, ${data.longitude}\n\nPlease check your Google Maps API key configuration.`);
        return;
      } else {
        alert(`❌ No location found in recent WhatsApp messages from this customer.\n\nCustomer Phone: ${customerPhone}\n\nAsk the customer to send their location via WhatsApp.`);
        setSavingAddress(false);
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to fetch location from WhatsApp');
    } finally {
      setSavingAddress(false);
    }
  };

  const saveShippingAddress = async () => {
    if (!selectedInvoice?.invoice_id || !shippingAddress.trim()) return;
    setSavingAddress(true);
    setAddressSaveSuccess(false);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}invoice/shipment/address`,
        withTenantHeaders({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: selectedInvoice.invoice_id,
            shipping_address: shippingAddress,
          }),
        })
      );
      if (res.ok) {
        setAddressSaveSuccess(true);
        // Update the row in the local state to show purple icon
        setRows(prev => prev.map(r => 
          r.invoice_id === selectedInvoice.invoice_id 
            ? { 
                ...r, 
                shipment: { 
                  ...(r.shipment || {}), 
                  shipping_address: shippingAddress 
                } 
              }
            : r
        ));
        // Show success message for 2 seconds before closing
        setTimeout(() => {
          setShowAddressModal(false);
          setAddressSaveSuccess(false);
          refreshDrafts();
        }, 2000);
      } else {
        alert('Failed to save shipping address');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save shipping address');
    } finally {
      setSavingAddress(false);
    }
  };

  const openInvoiceModal = (customerId: string, invoiceId?: string) => {
    const params = new URLSearchParams({ view: 'saved', popup: 'true' });
    if (invoiceId) params.set('invoice_id', invoiceId);
    // Add timestamp to force refresh when invoice is re-opened
    params.set('t', Date.now().toString());
    const url = `/billing/invoice/${customerId}?${params.toString()}`;
    console.log('Opening invoice modal with URL:', url);
    setInvoiceUrl(url);
    setShowInvoiceModal(true);
  };

  const closeInvoiceModal = () => {
    setShowInvoiceModal(false);
    setInvoiceUrl("");
  };

  const deleteInvoice = useCallback(async (invoiceId: number) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}invoice/draft/${invoiceId}`,
        withTenantHeaders({
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        })
      );
      
      if (res.ok) {
        // Remove from local state
        setRows(prev => prev.filter(r => r.id !== invoiceId));
        // Remove from selection if selected
        setSelectedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(invoiceId);
          return newSet;
        });
      } else {
        alert('Failed to delete invoice');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to delete invoice');
    }
  }, [base]);

  const bulkDeleteInvoices = useCallback(async () => {
    if (selectedIds.size === 0) {
      alert('Please select invoices to delete');
      return;
    }

    if (!confirm(`Delete ${selectedIds.size} selected invoice(s)? This cannot be undone.`)) return;
    
    setBulkDeleting(true);
    const token = localStorage.getItem('dc_access') || '';
    let successCount = 0;
    let failCount = 0;

    try {
      // Delete invoices one by one
      for (const invoiceId of Array.from(selectedIds)) {
        try {
          const res = await fetch(
            `${base}invoice/draft/${invoiceId}`,
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
          console.error(`Failed to delete invoice ${invoiceId}:`, e);
          failCount++;
        }
      }

      // Remove successfully deleted invoices from local state
      if (successCount > 0) {
        setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
        setSelectedIds(new Set());
      }

      // Show result
      if (failCount === 0) {
        alert(`Successfully deleted ${successCount} invoice(s)`);
      } else {
        alert(`Deleted ${successCount} invoice(s). Failed to delete ${failCount} invoice(s).`);
      }
    } catch (e) {
      console.error(e);
      alert('Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  }, [base, selectedIds]);

  const updatePhoneNumber = useCallback(async () => {
    if (!selectedInvoiceForPhone || !newPhoneNumber.trim()) {
      alert('Please enter a phone number');
      return;
    }

    // Validate phone number (basic validation)
    const cleanPhone = newPhoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      alert('Please enter a valid 10-digit phone number');
      return;
    }

    setUpdatingPhone(true);
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}customers/${selectedInvoiceForPhone.customer_id}/update-phone`,
        withTenantHeaders({
          method: 'PATCH',
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ phone: cleanPhone })
        })
      );

      if (res.ok) {
        // Update local state
        setRows(prev => prev.map(r => 
          r.customer_id === selectedInvoiceForPhone.customer_id 
            ? { ...r, customer_phone: cleanPhone }
            : r
        ));
        setShowPhoneModal(false);
        setNewPhoneNumber('');
        setSelectedInvoiceForPhone(null);
        alert('Phone number updated successfully');
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.detail || 'Failed to update phone number');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to update phone number');
    } finally {
      setUpdatingPhone(false);
    }
  }, [base, selectedInvoiceForPhone, newPhoneNumber]);

  // Memoize filtered data to avoid recalculating on every render
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchInvoice = (r.invoice_no || '').toLowerCase().includes(term);
        const matchPhone = (r.customer_phone || '').toLowerCase().includes(term);
        const matchTracking = (r.shipment?.tracking_number || '').toLowerCase().includes(term);
        const matchCustomerId = (r.customer_id || '').toLowerCase().includes(term);
        if (!matchInvoice && !matchPhone && !matchTracking && !matchCustomerId) {
          return false;
        }
      }
      
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'assigned' && !r.rider_name) return false;
        if (statusFilter === 'shipped' && r.shipment?.status !== 'shipped') return false;
        if (statusFilter === 'delivered' && r.shipment?.status !== 'delivered') return false;
        if (statusFilter === 'pending' && (r.rider_name || r.shipment?.status)) return false;
        if (statusFilter === 'with_address' && !r.delivery_address) return false;
        if (statusFilter === 'no_address' && r.delivery_address) return false;
      }
      
      return true;
    });
  }, [rows, searchTerm, statusFilter]);

  // Memoize pagination data
  const paginationData = useMemo(() => {
    const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedRows = filteredRows.slice(startIndex, endIndex);
    
    return { totalPages, startIndex, endIndex, paginatedRows };
  }, [filteredRows, currentPage, itemsPerPage]);

  // Selection callbacks - defined after paginationData to avoid circular dependency
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === paginationData.paginatedRows.length) {
      // Deselect all on current page
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        paginationData.paginatedRows.forEach(r => newSet.delete(r.id));
        return newSet;
      });
    } else {
      // Select all on current page
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        paginationData.paginatedRows.forEach(r => newSet.add(r.id));
        return newSet;
      });
    }
  }, [paginationData.paginatedRows, selectedIds.size]);

  const toggleSelect = useCallback((invoiceId: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(invoiceId)) {
        newSet.delete(invoiceId);
      } else {
        newSet.add(invoiceId);
      }
      return newSet;
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Professional Gradient Header */}
        <div className="mb-8 bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-800 rounded-xl shadow-lg p-8 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Package className="w-8 h-8" />
                </div>
                <h1 className="text-3xl font-bold">Orders Management</h1>
              </div>
              <p className="text-purple-50 text-sm mb-4">Manage invoice drafts, shipments, and deliveries</p>
              
              {/* Stats Cards */}
              <div className="flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/20">
                  <Package className="w-5 h-5" />
                  <span className="font-semibold">Total: {rows.length}</span>
                </div>
                {statusFilter !== 'all' && (
                  <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/20">
                    <span className="font-semibold">Filtered: {rows.filter(r => {
                      if (statusFilter === 'assigned' && !r.rider_name) return false;
                      if (statusFilter === 'shipped' && r.shipment?.status !== 'shipped') return false;
                      if (statusFilter === 'delivered' && r.shipment?.status !== 'delivered') return false;
                      if (statusFilter === 'pending' && (r.rider_name || r.shipment?.status)) return false;
                      if (statusFilter === 'with_address' && !r.delivery_address) return false;
                      if (statusFilter === 'no_address' && r.delivery_address) return false;
                      return true;
                    }).length}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 lg:min-w-[360px]">
              <button
                onClick={() => {
                  const csv = 'customer_name,customer_phone,customer_email,customer_address,shipping_address,item_name,item_quantity,item_price,tracking_number\nJohn Doe,9876543210,john@example.com,"123 Street, City, State, 500001","456 Delivery Address, City, State, 500001",Product A,2,100,TRACK123\nJohn Doe,9876543210,john@example.com,"123 Street, City, State, 500001","456 Delivery Address, City, State, 500001",Product B,3,150,TRACK123\nJane Smith,9876543211,jane@example.com,"789 Avenue, City, State, 500002",,Service A,1,500,\nJane Smith,9876543211,jane@example.com,"789 Avenue, City, State, 500002",,Service B,2,300,\nRobert Kumar,9876543212,robert@example.com,"321 Road, City, State, 500003","100 Office Building, City, State, 500003",Laptop,1,45000,TRACK789';
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'bulk_invoice_template.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/95 backdrop-blur-sm border border-white/20 text-purple-700 hover:bg-white font-semibold transition-all duration-200 shadow-md"
              >
                <Download size={18} />
                Download Template
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 font-semibold shadow-md transition-all duration-200"
              >
                <Upload size={18} />
                Upload Bulk Invoices
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-gray-200 p-5">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by invoice #, customer phone, tracking..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-3 pl-10 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-5 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white min-w-[200px] font-semibold"
            >
              <option value="all">📋 All Status</option>
              <option value="pending">⏳ Pending</option>
              <option value="assigned">👤 Assigned to Rider</option>
              <option value="shipped">📦 Shipped</option>
              <option value="delivered">✅ Delivered</option>
              <option value="with_address">📍 Has Address</option>
              <option value="no_address">❌ No Address</option>
            </select>
          </div>
        </div>
      {from === 'save' && (
        <div className="mb-3 text-[12px] px-3 py-2 rounded-md bg-green-50 text-green-700 border border-green-200">
          Invoice saved. Loading latest drafts… If nothing appears, ensure the API is updated with the drafts endpoint.
          {retryInfo && (
            <span className="ml-2 text-[11px] text-green-700">
              Retrying {retryInfo.attempt}/{retryInfo.max} in {Math.round(retryInfo.nextDelay/1000)}s…
            </span>
          )}
        </div>
      )}
      {(!mounted || loading) && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600 mb-3">{err}</div>}
      {!loading && !err && rows.length === 0 && (
        <div className="text-sm text-gray-500">
          No drafts yet. Create an invoice and press "Save & Close". If you recently saved but still see nothing,
          the API may not be updated; contact admin to deploy the latest backend.
        </div>
      )}
      {rows.length > 0 && (
        <>
          {filteredRows.length === 0 && (
            <div className="text-sm text-gray-500 py-4">
              No orders match your search criteria.
            </div>
          )}
          {filteredRows.length > 0 && (
        <>
        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg shadow-sm border-2 border-red-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-red-900">
                  {selectedIds.size} invoice(s) selected
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-red-700 hover:text-red-800 underline"
                >
                  Clear selection
                </button>
              </div>
              <button
                onClick={bulkDeleteInvoices}
                disabled={bulkDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <Trash2 size={16} />
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Selected`}
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="font-medium text-gray-700">
              Showing <span className="text-blue-600">{paginationData.startIndex + 1}</span> to <span className="text-blue-600">{Math.min(paginationData.endIndex, filteredRows.length)}</span> of <span className="text-blue-600">{filteredRows.length}</span> orders
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="itemsPerPage" className="text-sm font-medium text-gray-700">Items per page:</label>
              <select
                id="itemsPerPage"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <th className="px-3 py-3 text-center font-semibold text-gray-700 w-12">
                  <input
                    type="checkbox"
                    checked={paginationData.paginatedRows.length > 0 && paginationData.paginatedRows.every(r => selectedIds.has(r.id))}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    title="Select all on this page"
                  />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 w-32">Invoice No</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 w-32">Customer</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 w-32">Rider</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 w-36">Shipment</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 w-56">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginationData.paginatedRows.map(r => (
                <tr key={r.id} className={`hover:bg-blue-50 transition-colors ${selectedIds.has(r.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-900">{r.invoice_no || '-'}</div>
                    <div className="text-[10px] text-gray-500">
                      {r.created_at.substring(0, 10)} {r.created_at.substring(11, 16)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div className="font-medium text-gray-900 truncate" title={r.customer_company_name || r.customer_name || r.customer_id || ''}>
                      {r.customer_company_name || r.customer_name || (r.customer_id ? r.customer_id.substring(0, 10) + '...' : '-')}
                    </div>
                    {r.customer_phone && r.customer_phone !== 'nan' && r.customer_phone !== 'NaN' ? (
                      <div className="text-[10px] text-gray-500">{r.customer_phone.substring(0, 10)}</div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedInvoiceForPhone(r);
                          setNewPhoneNumber('');
                          setShowPhoneModal(true);
                        }}
                        className="flex items-center gap-1 text-[10px] text-orange-600 hover:text-orange-700 hover:underline"
                        title="Add phone number"
                      >
                        <Edit size={10} />
                        Add phone
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {r.rider_name ? (
                      <div className="space-y-0.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium max-w-full truncate ${
                          r.rider_assignment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          r.rider_assignment_status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-green-100 text-green-800'
                        }`} title={r.rider_name}>
                          {r.rider_name}
                        </span>
                        {r.rider_assignment_status === 'pending' && (
                          <div className="text-[10px] text-yellow-600 font-medium">⏳ Pending acceptance</div>
                        )}
                        {r.rider_assignment_status === 'rejected' && (
                          <div className="text-[10px] text-red-600 font-medium">⏸️ On Hold</div>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">No rider</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {r.shipment ? (
                      <div className="space-y-0.5">
                        <div className="font-semibold text-gray-900 text-xs truncate" title={r.shipment.provider_name || r.shipment.provider_code}>{r.shipment.provider_name || r.shipment.provider_code}</div>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          r.shipment.status === 'delivered' ? 'bg-green-100 text-green-800' :
                          r.shipment.status === 'in_transit' ? 'bg-blue-100 text-blue-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {r.shipment.status === 'delivered' ? '✓ Delivered' :
                           r.shipment.status === 'in_transit' ? '→ In Transit' :
                           '⏳ Pending'}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">No shipment</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {r.customer_id && (
                        <>
                          <button
                            onClick={() => { console.log('openInvoiceModal customerId', r.customer_id, 'invoiceId', r.invoice_id); openInvoiceModal(r.customer_id!, r.invoice_id); }}
                            title="View Invoice"
                            className="p-1.5 rounded-lg border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-all"
                          >
                            <Eye size={14} className="text-blue-700" />
                          </button>
                          <button
                            onClick={() => openRiderModal(r)}
                            title={
                              r.rider_name && r.rider_assignment_status === 'accepted' 
                                ? "Rider accepted - cannot reassign" 
                                : r.rider_name && r.rider_assignment_status === 'pending'
                                ? "Change rider (pending acceptance)"
                                : r.rider_name && r.rider_assignment_status === 'rejected'
                                ? "Reassign to different rider"
                                : "Assign Rider"
                            }
                            disabled={!!(r.rider_name && r.rider_assignment_status === 'accepted')}
                            className={`p-1.5 rounded-lg border-2 transition-all ${
                              r.rider_name && r.rider_assignment_status === 'accepted'
                                ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-50' 
                                : r.rider_assignment_status === 'pending'
                                ? 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100 hover:border-yellow-300'
                                : r.rider_assignment_status === 'rejected'
                                ? 'border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300'
                                : 'border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-300'
                            }`}
                          >
                            <Truck size={14} className={
                              r.rider_name && r.rider_assignment_status === 'accepted' ? 'text-gray-400' : 
                              r.rider_assignment_status === 'pending' ? 'text-yellow-700' :
                              r.rider_assignment_status === 'rejected' ? 'text-orange-700' :
                              'text-green-700'
                            } />
                          </button>
                          <button
                            onClick={() => openShipmentModal(r)}
                            title={
                              r.shipment?.status === 'delivered' ? 'Shipment delivered' :
                              r.shipment?.tracking_number ? 'Update shipment tracking' :
                              r.shipment ? 'Add tracking number' :
                              'Assign shipment provider'
                            }
                            className={`p-1.5 rounded-lg border-2 transition-all ${
                              r.shipment?.status === 'delivered'
                                ? 'border-green-200 bg-green-100 cursor-default'
                                : r.shipment?.tracking_number
                                ? 'border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300'
                                : 'border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-300'
                            }`}
                          >
                            {r.shipment?.status === 'delivered' ? (
                              <CheckCircle size={14} className="text-green-700" />
                            ) : (
                              <Package size={14} className={r.shipment ? 'text-orange-700' : 'text-purple-700'} />
                            )}
                          </button>
                          <button
                            onClick={() => openAddressModal(r)}
                            title={r.shipment?.shipping_address ? 'Update shipping address' : 'Add shipping address'}
                            className={`p-1.5 rounded-lg border-2 transition-all ${
                              r.shipment?.shipping_address
                                ? 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300'
                                : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'
                            }`}
                          >
                            <MapPin size={14} className={r.shipment?.shipping_address ? 'text-indigo-700' : 'text-gray-700'} />
                          </button>
                          <button
                            onClick={async () => {
                              if (!whatsappEnabled) {
                                alert('Please enable WhatsApp in Settings first');
                                return;
                              }
                              await fetchLocationFromWhatsApp(r);
                            }}
                            title={whatsappEnabled ? "Fetch location from WhatsApp" : "Enable WhatsApp in Settings first"}
                            className={`p-1.5 rounded-lg border-2 transition-all ${
                              whatsappEnabled 
                                ? 'border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-300' 
                                : 'border-gray-300 bg-gray-100 opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <MessageCircle size={14} className={whatsappEnabled ? 'text-green-700' : 'text-gray-400'} />
                          </button>
                          {r.delivery_latitude && r.delivery_longitude && (
                            <button
                              onClick={() => {
                                const url = `https://www.google.com/maps/dir/?api=1&destination=${r.delivery_latitude},${r.delivery_longitude}`;
                                window.open(url, '_blank');
                              }}
                              title={`Get directions to: ${r.delivery_address || `${r.delivery_latitude}, ${r.delivery_longitude}`}`}
                              className="p-1.5 rounded-lg border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-all"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-700">
                                <path d="M3 11l19-9-9 19-2-8-8-2z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => deleteInvoice(r.id)}
                            title="Delete invoice"
                            className="p-1.5 rounded-lg border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-all"
                          >
                            <Trash2 size={14} className="text-red-700" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        
        {/* Pagination Controls */}
        {paginationData.totalPages > 1 && (
          <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-5 py-2.5 text-sm font-medium border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 transition-all"
              >
                ← Previous
              </button>
              
              <div className="flex items-center gap-2">
              {Array.from({ length: paginationData.totalPages }, (_, i) => i + 1).map(page => {
                // Show first page, last page, current page, and pages around current
                const showPage = page === 1 || page === paginationData.totalPages || 
                  (page >= currentPage - 2 && page <= currentPage + 2);
                
                if (!showPage) {
                  // Show ellipsis for gaps
                  if (page === currentPage - 3 || page === currentPage + 3) {
                    return <span key={page} className="px-2 text-gray-400">...</span>;
                  }
                  return null;
                }
                
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      currentPage === page
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                        : 'border-2 border-gray-300 hover:bg-gray-50 hover:border-blue-300'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setCurrentPage(p => Math.min(paginationData.totalPages, p + 1))}
              disabled={currentPage === paginationData.totalPages}
              className="px-5 py-2.5 text-sm font-medium border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 transition-all"
            >
              Next →
            </button>
            </div>
          </div>
        )}
        </>
          )}
        </>
      )}

      {/* Rider Assignment Modal */}
      {showRiderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {selectedInvoice?.rider_name ? 'Change Rider Assignment' : 'Assign Rider'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Invoice: {selectedInvoice?.invoice_no || selectedInvoice?.customer_id}
              </p>
              {selectedInvoice?.rider_name && (
                <div className={`mt-2 p-2 rounded-md text-xs ${
                  selectedInvoice.rider_assignment_status === 'pending' 
                    ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {selectedInvoice.rider_assignment_status === 'pending' 
                    ? `⚠️ Currently pending: ${selectedInvoice.rider_name}. Select a new rider to reassign.`
                    : `⏸️ On Hold by: ${selectedInvoice.rider_name}. Select a new rider to reassign.`
                  }
                </div>
              )}
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              {loadingRiders ? (
                <div className="text-sm text-gray-600 py-4">Loading riders...</div>
              ) : riders.length === 0 ? (
                <div className="text-sm text-gray-500 py-4">No riders available. Please create a rider user first.</div>
              ) : (
                <div className="space-y-2">
                  {riders.map(rider => (
                    <button
                      key={rider.user_id}
                      onClick={() => handleAssignRider(rider.user_id)}
                      disabled={assigning}
                      className="w-full text-left px-4 py-3 border rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{rider.name || rider.email}</div>
                          {rider.cellnumber && (
                            <div className="text-xs text-gray-500 mt-1">📱 {rider.cellnumber}</div>
                          )}
                        </div>
                        <div className="ml-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            {rider.assigned_count || 0} assigned
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRiderModal(false);
                  setSelectedInvoice(null);
                }}
                disabled={assigning}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipment Assignment Modal */}
      {showShipmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Manage Shipment</h2>
              <p className="text-sm text-gray-600 mt-1">
                Invoice: {selectedInvoice?.invoice_no || selectedInvoice?.customer_id}
              </p>
            </div>
            <div className="px-6 py-4">
              {selectedInvoice?.shipment ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Provider</label>
                    <div className="mt-1 text-sm text-gray-900">
                      {selectedInvoice.shipment.provider_name} ({selectedInvoice.shipment.provider_code})
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Status</label>
                    <div className={`mt-1 inline-block px-2 py-1 rounded text-sm font-medium ${
                      selectedInvoice.shipment.status === 'delivered' ? 'bg-green-100 text-green-700' :
                      selectedInvoice.shipment.status === 'in_transit' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {selectedInvoice.shipment.status === 'delivered' ? 'Delivered' :
                       selectedInvoice.shipment.status === 'in_transit' ? 'In Transit' :
                       'Pending'}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Tracking Number</label>
                    {selectedInvoice.shipment.status === 'delivered' ? (
                      <div className="mt-1 text-sm text-gray-900 font-mono">
                        {selectedInvoice.shipment.tracking_number || 'Not available'}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        placeholder="Enter tracking number"
                        className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
                        disabled={assigningShipment}
                      />
                    )}
                  </div>

                  {selectedInvoice.shipment.status !== 'delivered' && (
                    <div className="flex gap-2">
                      {trackingNumber.trim() && (
                        <button
                          onClick={updateTrackingNumber}
                          disabled={assigningShipment}
                          className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          {assigningShipment ? 'Updating...' : 'Update Tracking'}
                        </button>
                      )}
                      {selectedInvoice.shipment.tracking_number && (
                        <button
                          onClick={markShipmentDelivered}
                          disabled={assigningShipment}
                          className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                          {assigningShipment ? 'Marking...' : 'Mark Delivered'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Select a shipment provider to assign to this invoice:</p>
                  {loadingProviders ? (
                    <div className="text-sm text-gray-600 py-4">Loading providers...</div>
                  ) : shipmentProviders.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4">
                      No shipment providers enabled. Please enable providers in{' '}
                      <a href="/business-settings" className="text-blue-600 hover:underline">Business Settings</a>.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shipmentProviders.map(provider => (
                        <button
                          key={provider.provider_id}
                          onClick={() => assignShipmentProvider(provider.provider_id)}
                          disabled={assigningShipment}
                          className="w-full text-left px-4 py-3 border rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="font-medium text-sm">{provider.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{provider.code}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowShipmentModal(false);
                  setSelectedInvoice(null);
                  setTrackingNumber("");
                }}
                disabled={assigningShipment}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Shipping Address</h2>
              <p className="text-sm text-gray-600 mt-1">
                Invoice: {selectedInvoice?.invoice_no || selectedInvoice?.customer_id}
              </p>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-4">
                {addressSaveSuccess && (
                  <div className="px-4 py-3 rounded-md bg-green-50 border border-green-200 flex items-center gap-2">
                    <CheckCircle size={20} className="text-green-600" />
                    <span className="text-sm text-green-800 font-medium">Address saved successfully!</span>
                  </div>
                )}
                
                {/* Address Input Mode Selection */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-md">
                  <button
                    onClick={() => setAddressInputMode('map')}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
                      addressInputMode === 'map'
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    disabled={!googleMapsApiKey}
                  >
                    <MapPin size={16} className="inline mr-1" />
                    Map Pick
                  </button>
                  <button
                    onClick={() => setAddressInputMode('custom')}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
                      addressInputMode === 'custom'
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {/* Fetch from WhatsApp button */}
                {whatsappEnabled && (
                  <button
                    onClick={() => fetchLocationFromWhatsApp()}
                    disabled={savingAddress}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={18} />
                    {savingAddress ? 'Fetching...' : 'Fetch Location from WhatsApp'}
                  </button>
                )}

                {/* Map Pick Mode */}
                {addressInputMode === 'map' && (
                  <div>
                    {!googleMapsApiKey ? (
                      <div className="px-4 py-3 rounded-md bg-yellow-50 border border-yellow-200">
                        <div className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-sm text-yellow-800 font-medium">Google Maps API Not Configured</p>
                            <p className="text-xs text-yellow-700 mt-1">
                              To use Map Pick, please configure your Google Maps API key in{' '}
                              <Link href="/settings" className="underline font-medium hover:text-yellow-900">
                                Settings
                              </Link>
                              .
                            </p>
                            <p className="text-xs text-yellow-700 mt-2">
                              Or switch to <button 
                                onClick={() => setAddressInputMode('custom')} 
                                className="underline font-medium hover:text-yellow-900"
                              >
                                Custom mode
                              </button> to enter address manually.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-sm font-medium text-gray-700">Search Address</label>
                        <input
                          id="address-input"
                          type="text"
                          value={shippingAddress}
                          onChange={(e) => searchAddress(e.target.value)}
                          placeholder="Type to search address..."
                          className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
                          disabled={savingAddress}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Start typing your address - Google autocomplete will show suggestions
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Custom Mode */}
                {addressInputMode === 'custom' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Enter Complete Address</label>
                    <textarea
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Enter complete shipping address..."
                      rows={4}
                      className="mt-1 w-full px-3 py-2 border rounded-md text-sm resize-none"
                      disabled={savingAddress}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Enter the complete shipping address with street, city, state, and postal code
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddressModal(false);
                  setSelectedInvoice(null);
                  setShippingAddress("");
                  setAddressSuggestions([]);
                  setAddressSaveSuccess(false);
                  setAddressInputMode('map');
                }}
                disabled={savingAddress}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveShippingAddress}
                disabled={savingAddress || !shippingAddress.trim() || addressSaveSuccess}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {savingAddress ? 'Saving...' : 'Save Address'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Preview Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Invoice Preview</h2>
              <button
                onClick={closeInvoiceModal}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                title="Close"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50">
              {invoiceUrl ? (
                <iframe
                  src={invoiceUrl}
                  className="w-full h-full min-h-[600px] bg-white"
                  title="Invoice Preview"
                  onError={(e) => console.error('Iframe error:', e)}
                  onLoad={() => console.log('Iframe loaded successfully')}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500">Loading invoice...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showUploadModal && (
        <UploadModal
          base={base}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => window.location.reload()}
        />
      )}

      {/* Phone Update Modal */}
      {showPhoneModal && selectedInvoiceForPhone && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Update Phone Number</h3>
              <button
                onClick={() => {
                  setShowPhoneModal(false);
                  setNewPhoneNumber('');
                  setSelectedInvoiceForPhone(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Customer: <span className="font-medium text-gray-900">{selectedInvoiceForPhone.customer_name}</span>
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Invoice: <span className="font-medium text-gray-900">{selectedInvoiceForPhone.invoice_no}</span>
              </p>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={newPhoneNumber}
                onChange={(e) => setNewPhoneNumber(e.target.value)}
                placeholder="Enter 10-digit phone number"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                maxLength={15}
              />
              <p className="text-xs text-gray-500 mt-1">Enter phone number without country code</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPhoneModal(false);
                  setNewPhoneNumber('');
                  setSelectedInvoiceForPhone(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={updatingPhone}
              >
                Cancel
              </button>
              <button
                onClick={updatePhoneNumber}
                disabled={updatingPhone || !newPhoneNumber.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updatingPhone ? 'Updating...' : 'Update Phone'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <OrdersInner />
    </Suspense>
  );
}
