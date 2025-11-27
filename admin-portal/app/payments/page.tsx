'use client';

import { useState, useEffect } from 'react';
import { Download, Filter, RefreshCw, Search, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';

interface Payment {
  payment_id: string;
  order_id: string;
  delivery_id: string;
  customer_name: string;
  customer_phone: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  upi_transaction_id: string | null;
  collected_by: string;
  collected_by_name: string;
  payment_initiated_at: string | null;
  payment_completed_at: string | null;
  created_at: string;
}

interface PaymentSummary {
  total_amount: number;
  total_count: number;
  success_count: number;
  pending_count: number;
  initiated_count: number;
  failed_count: number;
}

interface PaymentsResponse {
  total: number;
  page: number;
  limit: number;
  payments: Payment[];
  summary: PaymentSummary;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'all',
    payment_method: 'all',
    collected_by: '',
    search: '',
    from_date: '',
    to_date: '',
    page: 1,
    limit: 50
  });
  const [totalPages, setTotalPages] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    fetchPayments();
    
    // Set up WebSocket for real-time updates
    const token = localStorage.getItem('dc_access');
    if (!token) return;
    
    const ws = new WebSocket(`wss://api.digitalchain.in/ws?token=${token}`);
    
    ws.onopen = () => {
      console.log('🔌 Payment WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('📨 Payment WebSocket message:', data);
      if (data.type === 'payment_qr_generated' || data.type === 'payment_confirmed') {
        // Refresh payment list
        fetchPayments();
      }
    };
    
    ws.onerror = (error) => {
      console.error('Payment WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('🔌 Payment WebSocket disconnected');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [filters]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('dc_access');
      const queryParams = new URLSearchParams();
      
      if (filters.status !== 'all') queryParams.append('status', filters.status);
      if (filters.payment_method !== 'all') queryParams.append('payment_method', filters.payment_method);
      if (filters.collected_by) queryParams.append('collected_by', filters.collected_by);
      if (filters.search) queryParams.append('search', filters.search);
      if (filters.from_date) queryParams.append('from_date', filters.from_date);
      if (filters.to_date) queryParams.append('to_date', filters.to_date);
      queryParams.append('page', filters.page.toString());
      queryParams.append('limit', filters.limit.toString());

      const response = await fetch(
        `/api/v1/payment/list?${queryParams}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch payments');

      const data: PaymentsResponse = await response.json();
      setPayments(data.payments);
      setSummary(data.summary);
      setTotalPages(Math.ceil(data.total / filters.limit));
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const csvData = payments.map(p => ({
      'Payment ID': p.payment_id,
      'Order ID': p.order_id,
      'Customer': p.customer_name,
      'Phone': p.customer_phone,
      'Amount': p.amount,
      'Status': p.status,
      'Method': p.payment_method,
      'Transaction ID': p.upi_transaction_id || '-',
      'Collected By': p.collected_by_name,
      'Date': new Date(p.created_at).toLocaleString()
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${new Date().toISOString()}.csv`;
    a.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-100';
      case 'pending': return 'text-gray-600 bg-gray-100';
      case 'initiated': return 'text-blue-600 bg-blue-100';
      case 'failed': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'initiated': return <AlertCircle className="w-4 h-4" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">💰 UPI Payments</h1>
            <p className="text-gray-600 mt-1">Track and manage payment collections</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={fetchPayments}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Total Amount</div>
              <div className="text-2xl font-bold text-gray-900">
                ₹{summary.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-500 mt-1">{summary.total_count} payments</div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-green-200">
              <div className="text-sm text-gray-600 mb-1">Success</div>
              <div className="text-2xl font-bold text-green-600">{summary.success_count}</div>
              <div className="text-xs text-gray-500 mt-1">Completed payments</div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-blue-200">
              <div className="text-sm text-gray-600 mb-1">Initiated</div>
              <div className="text-2xl font-bold text-blue-600">{summary.initiated_count || 0}</div>
              <div className="text-xs text-gray-500 mt-1">QR generated</div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-yellow-200">
              <div className="text-sm text-gray-600 mb-1">Pending</div>
              <div className="text-2xl font-bold text-yellow-600">{summary.pending_count}</div>
              <div className="text-xs text-gray-500 mt-1">Awaiting collection</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg p-4 mb-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Filters</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search order, customer, phone..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="initiated">Initiated</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>

            {/* Payment Method Filter */}
            <select
              value={filters.payment_method}
              onChange={(e) => setFilters({ ...filters, payment_method: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Methods</option>
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
            </select>

            {/* Date Range */}
            <div className="flex gap-2">
              <input
                type="date"
                value={filters.from_date}
                onChange={(e) => setFilters({ ...filters, from_date: e.target.value, page: 1 })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="date"
                value={filters.to_date}
                onChange={(e) => setFilters({ ...filters, to_date: e.target.value, page: 1 })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Collected By</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                        Loading payments...
                      </div>
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.payment_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        #{payment.payment_id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.order_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{payment.customer_name}</div>
                        <div className="text-sm text-gray-500">{payment.customer_phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        ₹{payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.payment_method}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                          {getStatusIcon(payment.status)}
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.collected_by_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(payment.created_at).toLocaleDateString('en-IN')}
                        <br />
                        <span className="text-xs">{new Date(payment.created_at).toLocaleTimeString('en-IN')}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowDetailsModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Page {filters.page} of {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page - 1) })}
                  disabled={filters.page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setFilters({ ...filters, page: Math.min(totalPages, filters.page + 1) })}
                  disabled={filters.page === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Payment Details Modal */}
        {showDetailsModal && selectedPayment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Payment Details</h2>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Status Badge */}
                <div className="flex items-center justify-center">
                  <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(selectedPayment.status)}`}>
                    {getStatusIcon(selectedPayment.status)}
                    {selectedPayment.status.toUpperCase()}
                  </span>
                </div>

                {/* Amount */}
                <div className="text-center">
                  <div className="text-4xl font-bold text-gray-900">
                    ₹{selectedPayment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Payment ID</div>
                    <div className="font-mono text-sm">{selectedPayment.payment_id}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Order ID</div>
                    <div className="font-medium">{selectedPayment.order_id}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Customer Name</div>
                    <div className="font-medium">{selectedPayment.customer_name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Customer Phone</div>
                    <div className="font-medium">{selectedPayment.customer_phone}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Payment Method</div>
                    <div className="font-medium">{selectedPayment.payment_method}</div>
                  </div>
                  {selectedPayment.upi_transaction_id && (
                    <div>
                      <div className="text-sm text-gray-500">UPI Transaction ID</div>
                      <div className="font-mono text-sm">{selectedPayment.upi_transaction_id}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-gray-500">Collected By</div>
                    <div className="font-medium">{selectedPayment.collected_by_name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Collection Time</div>
                    <div className="font-medium">
                      {selectedPayment.payment_completed_at
                        ? new Date(selectedPayment.payment_completed_at).toLocaleString('en-IN')
                        : 'Pending'}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
