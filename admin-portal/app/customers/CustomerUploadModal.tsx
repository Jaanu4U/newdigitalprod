import { useState } from 'react';
import { X, Upload, Download, AlertTriangle, CheckCircle } from 'lucide-react';
import { withTenantHeaders } from '@/lib/tenant';

interface CustomerUploadModalProps {
  base: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadResult {
  total_rows: number;
  successful: number;
  failed: number;
  errors: Array<{row: number; error: string}>;
}

export default function CustomerUploadModal({ base, onClose, onSuccess }: CustomerUploadModalProps) {
  const [customerType, setCustomerType] = useState<'b2b' | 'b2c'>('b2c');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const downloadTemplate = () => {
    const b2cHeaders = 'customer_id,name,email,phone,address,city,state,pin,notes';
    const b2cSample = 'CUST01,John Doe,john@example.com,9876543210,"123 Main St",Mumbai,Maharashtra,400001,VIP customer';
    
    const b2bHeaders = 'customer_id,company_name,name,gstin,email,phone,address,city,state,pin,notes';
    const b2bSample = 'CORP01,ABC Corp,John Doe,29ABCDE1234F1Z5,contact@abc.com,9876543210,"456 Business Park",Bangalore,Karnataka,560001,Corporate client';
    
    const content = customerType === 'b2b' 
      ? `${b2bHeaders}\n${b2bSample}`
      : `${b2cHeaders}\n${b2cSample}`;
    
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${customerType}_customers_template.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      alert('Please select a file to upload');
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('ctype', customerType);

      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(
        `${base}customers/bulk-upload`,
        withTenantHeaders({
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Upload failed with status ${res.status}`);
      }

      const result = await res.json();
      setUploadResult(result);

      if (result.successful > 0) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (e: any) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Bulk Upload Customers</h2>
            <p className="text-sm text-gray-600 mt-1">Upload multiple customers from CSV file</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Customer Type Selection */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border-2 border-purple-200">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Select Customer Type
            </label>
            <div className="flex gap-4">
              <label className="flex-1">
                <input
                  type="radio"
                  name="customerType"
                  value="b2c"
                  checked={customerType === 'b2c'}
                  onChange={(e) => setCustomerType(e.target.value as 'b2c')}
                  className="sr-only peer"
                />
                <div className="cursor-pointer border-2 border-gray-300 peer-checked:border-green-500 peer-checked:bg-green-50 rounded-lg p-4 text-center transition-all">
                  <div className="text-lg font-bold text-gray-900">B2C (Individual)</div>
                  <div className="text-xs text-gray-600 mt-1">Personal customers</div>
                </div>
              </label>
              <label className="flex-1">
                <input
                  type="radio"
                  name="customerType"
                  value="b2b"
                  checked={customerType === 'b2b'}
                  onChange={(e) => setCustomerType(e.target.value as 'b2b')}
                  className="sr-only peer"
                />
                <div className="cursor-pointer border-2 border-gray-300 peer-checked:border-blue-500 peer-checked:bg-blue-50 rounded-lg p-4 text-center transition-all">
                  <div className="text-lg font-bold text-gray-900">B2B (Business)</div>
                  <div className="text-xs text-gray-600 mt-1">Corporate customers</div>
                </div>
              </label>
            </div>
          </div>

          {/* Template Download */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-start gap-3">
              <Download className="text-blue-600 mt-0.5" size={20} />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 text-sm">Step 1: Download Template</h3>
                <p className="text-sm text-blue-700 mt-1">
                  {customerType === 'b2c' 
                    ? 'Download the B2C template with columns: customer_id (optional), name, email, phone, address, city, state, pin, notes'
                    : 'Download the B2B template with columns: customer_id (optional), company_name, name, gstin, email, phone, address, city, state, pin, notes'
                  }
                </p>
                <button
                  onClick={downloadTemplate}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Download size={16} />
                  Download {customerType.toUpperCase()} Template
                </button>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div className="bg-gray-50 rounded-lg p-4 border-2 border-dashed border-gray-300">
            <div className="flex items-start gap-3">
              <Upload className="text-purple-600 mt-0.5" size={20} />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-sm">Step 2: Upload CSV File</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Fill the template with your customer data and upload it here
                </p>
                <div className="mt-3">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-600
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-purple-600 file:text-white
                      hover:file:bg-purple-700
                      file:cursor-pointer cursor-pointer"
                  />
                  {uploadFile && (
                    <div className="mt-2 text-sm text-gray-700">
                      Selected: <span className="font-medium">{uploadFile.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Format Information */}
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-yellow-600 mt-0.5" size={20} />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 text-sm">Important Notes:</h3>
                <ul className="text-sm text-yellow-800 mt-2 space-y-1 list-disc list-inside">
                  <li>File must be in CSV format</li>
                  <li>Customer ID is optional - leave empty for auto-generated 6-char ID</li>
                  <li>Customer ID must be unique (alphanumeric A-Z, a-z, 0-9)</li>
                  <li>{customerType === 'b2c' ? 'Name' : 'Company name'} and phone are required fields</li>
                  {customerType === 'b2b' && <li>GSTIN should be 15 characters (optional)</li>}
                  <li>Phone numbers should be 10 digits without country code</li>
                  <li>Use the exact column headers from the template</li>
                  <li>Duplicate phone numbers will be skipped</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Upload Result */}
          {uploadResult && (
            <div className={`rounded-lg p-4 border-2 ${
              uploadResult.failed === 0 
                ? 'bg-green-50 border-green-200' 
                : 'bg-orange-50 border-orange-200'
            }`}>
              <div className="flex items-start gap-3">
                <CheckCircle className={uploadResult.failed === 0 ? 'text-green-600' : 'text-orange-600'} size={24} />
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">Upload Complete</h3>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Total rows processed:</span>
                      <span className="font-semibold">{uploadResult.total_rows}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Successfully created:</span>
                      <span className="font-bold text-green-800">{uploadResult.successful}</span>
                    </div>
                    {uploadResult.failed > 0 && (
                      <div className="flex justify-between">
                        <span className="text-red-700">Failed:</span>
                        <span className="font-bold text-red-800">{uploadResult.failed}</span>
                      </div>
                    )}
                  </div>
                  
                  {uploadResult.errors && uploadResult.errors.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm font-semibold text-gray-900 mb-2">Errors:</div>
                      <div className="max-h-40 overflow-y-auto bg-white rounded border border-gray-200 p-2">
                        {uploadResult.errors.map((err, idx) => (
                          <div key={idx} className="text-xs text-red-700 mb-1">
                            Row {err.row}: {err.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 sticky bottom-0">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {uploadResult ? 'Close' : 'Cancel'}
          </button>
          {!uploadResult && (
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Upload Customers
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
