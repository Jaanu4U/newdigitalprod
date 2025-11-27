"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "@/lib/api";
import { withTenantHeaders } from "@/lib/tenant";
import { MapPin, CreditCard, Banknote, CheckCircle, Smartphone, Package, User, Calendar, DollarSign } from "lucide-react";

interface DeliveryProof {
  invoice_id: string;
  invoice_no: string;
  customer_name?: string;
  total_amount: number;
  rider_name?: string;
  rider_email?: string;
  delivery_location?: { lat: number; lng: number };
  payment?: {
    method: string;
    upi_id?: string;
    card_last4?: string;
    cash_amount?: number;
  };
  completed_at?: string;
  proof_images?: string[];
}

export default function DeliveryProofPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [proof, setProof] = useState<DeliveryProof | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const fetchProof = async () => {
      try {
        const token = localStorage.getItem('dc_access') || '';
        const base = apiBase();
        
        const res = await fetch(
          `${base}v1/delivery-proof/${params.id}`,
          withTenantHeaders({
            headers: { Authorization: `Bearer ${token}` }
          })
        );

        if (res.ok) {
          const data = await res.json();
          setProof(data);
        } else if (res.status === 404) {
          setError('Delivery proof not found. The order may not be completed yet.');
        } else {
          setError('Failed to load delivery proof');
        }
      } catch (e) {
        console.error('Failed to fetch delivery proof:', e);
        setError('Failed to load delivery proof');
      } finally {
        setLoading(false);
      }
    };

    fetchProof();
  }, [params.id, mounted]);

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="bg-white rounded-xl p-6 space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !proof) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:underline mb-4"
          >
            ← Back
          </button>
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-8 text-center">
            <div className="text-red-600 text-xl mb-2">⚠️</div>
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              {error || 'Delivery Proof Not Found'}
            </h2>
            <p className="text-sm text-red-600">
              This order may not have been completed yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getPaymentMethodIcon = () => {
    switch (proof.payment?.method) {
      case 'cash':
        return <Banknote className="text-green-600" size={20} />;
      case 'upi':
        return <Smartphone className="text-purple-600" size={20} />;
      case 'card':
        return <CreditCard className="text-blue-600" size={20} />;
      default:
        return <DollarSign className="text-gray-600" size={20} />;
    }
  };

  const getPaymentMethodLabel = () => {
    switch (proof.payment?.method) {
      case 'cash':
        return 'Cash Payment';
      case 'upi':
        return 'UPI Payment';
      case 'card':
        return 'Card Payment';
      default:
        return 'Payment';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:underline mb-4 flex items-center gap-1"
          >
            ← Back to Orders
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-xl">
              <CheckCircle className="text-green-600" size={32} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                Delivery Proof
              </h1>
              <p className="text-gray-600 mt-1">Order #{proof.invoice_no}</p>
            </div>
          </div>
        </div>

        {/* Success Banner */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl p-6 mb-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle size={24} />
            <h2 className="text-xl font-bold">Delivery Completed</h2>
          </div>
          <p className="text-green-50">
            {proof.completed_at && new Date(proof.completed_at).toLocaleString('en-IN', {
              dateStyle: 'full',
              timeStyle: 'short'
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Order Details */}
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Package size={20} className="text-blue-600" />
              Order Details
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Invoice Number</p>
                <p className="font-semibold text-gray-900">{proof.invoice_no}</p>
              </div>
              <div className="pt-3 border-t">
                <p className="text-sm text-gray-600">Customer</p>
                <p className="font-semibold text-gray-900">{proof.customer_name || 'N/A'}</p>
              </div>
              <div className="pt-3 border-t">
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="font-bold text-2xl text-blue-600">₹{proof.total_amount?.toFixed(2) || '0.00'}</p>
              </div>
            </div>
          </div>

          {/* Rider Details */}
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <User size={20} className="text-purple-600" />
              Delivered By
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Rider Name</p>
                <p className="font-semibold text-gray-900">{proof.rider_name || 'Unknown'}</p>
              </div>
              {proof.rider_email && (
                <div className="pt-3 border-t">
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium text-gray-700">{proof.rider_email}</p>
                </div>
              )}
              <div className="pt-3 border-t">
                <p className="text-sm text-gray-600">Completed At</p>
                <p className="font-medium text-gray-700 flex items-center gap-2">
                  <Calendar size={16} />
                  {proof.completed_at && new Date(proof.completed_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Delivery Location */}
        {proof.delivery_location && (
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-red-600" />
              Delivery Location
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-2">
                <MapPin size={16} className="text-gray-500 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Coordinates</p>
                  <p className="font-mono text-sm text-gray-900">
                    {proof.delivery_location.lat.toFixed(6)}, {proof.delivery_location.lng.toFixed(6)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const url = `https://www.google.com/maps?q=${proof.delivery_location!.lat},${proof.delivery_location!.lng}`;
                  window.open(url, '_blank');
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 font-medium"
              >
                <MapPin size={18} />
                View on Google Maps
              </button>
            </div>
          </div>
        )}

        {/* Payment Information */}
        {proof.payment && (
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              {getPaymentMethodIcon()}
              Payment Details
            </h3>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">Payment Method</span>
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
                    proof.payment.method === 'cash' ? 'bg-green-100 text-green-800' :
                    proof.payment.method === 'upi' ? 'bg-purple-100 text-purple-800' :
                    proof.payment.method === 'card' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {getPaymentMethodLabel()}
                  </span>
                </div>

                {proof.payment.method === 'cash' && proof.payment.cash_amount && (
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-600 mb-1">Cash Received</p>
                    <p className="font-bold text-3xl text-green-600">₹{proof.payment.cash_amount.toFixed(2)}</p>
                  </div>
                )}

                {proof.payment.method === 'upi' && proof.payment.upi_id && (
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-600 mb-1">UPI ID / Transaction ID</p>
                    <p className="font-mono text-sm font-semibold text-purple-700 bg-purple-50 px-3 py-2 rounded">
                      {proof.payment.upi_id}
                    </p>
                  </div>
                )}

                {proof.payment.method === 'card' && proof.payment.card_last4 && (
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-600 mb-1">Card (Last 4 digits)</p>
                    <p className="font-mono text-xl font-bold text-blue-700">
                      •••• •••• •••• {proof.payment.card_last4}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Proof Images (Placeholder) */}
        {proof.proof_images && proof.proof_images.length > 0 ? (
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              📸 Delivery Photos
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {proof.proof_images.map((img, idx) => (
                <div key={idx} className="aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img src={img} alt={`Proof ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 text-center">
            <p className="text-gray-500">📸 No delivery photos available</p>
            <p className="text-xs text-gray-400 mt-1">Photo upload feature coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
