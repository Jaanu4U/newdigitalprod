import { useState, useEffect } from 'react';
import { X, Upload, Check, Save, AlertTriangle, Download, Trash2, CheckCircle } from 'lucide-react';

interface UploadModalProps {
  base: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface StandardColumn {
  required: boolean;
  description: string;
  label: string;
  isMultiSelect?: boolean;
}

const standardColumns: Record<string, StandardColumn> = {
  invoice_number: { required: false, label: 'Invoice Number', description: 'Invoice number (invoice_no, bill_no, inv_no, voucher_no, receipt_no, doc_no, feedno, feed_no) - groups invoices by this number' },
  invoice_date: { required: false, label: 'Invoice Date', description: 'Invoice date (invoice_date, date, bill_date, doc_date)' },
  customer_id: { required: false, label: 'Customer ID', description: 'Customer ID or code (customer_id, cust_id, customer_code, party_code) - unique identifier for customer' },
  customer_name: { required: true, label: 'Customer Name', description: 'Customer name (customer_name, name, party_name, customer)' },
  customer_phone: { required: true, label: 'Customer Phone', description: 'Phone number (phone, mobile, contact, customer_phone) - groups products by customer' },
  customer_email: { required: false, label: 'Customer Email', description: 'Email address (email, customer_email)' },
  customer_gstin: { required: false, label: 'Customer GSTIN', description: 'GSTIN/GST Number (gstin, gst, gst_number, tax_id) - if provided, marks as B2B customer' },
  customer_address: { required: false, label: 'Customer Address', description: 'Customer billing address (Includes: Name + Street + City + PIN) - Select up to 3 columns to combine', isMultiSelect: true },
  shipping_address: { required: false, label: 'Shipping Address', description: 'Shipping address (shipping_address, delivery_address)' },
  rider_name: { required: false, label: 'Rider/Driver Name', description: 'Rider or driver name (rider, driver, driver_name, delivery_boy) - auto-assigns rider if name matches' },
  item_name: { required: false, label: 'Product/Item Name', description: 'Product/item name (product, item_name, description, particulars) - if not mapped, will use "All Items"' },
  item_quantity: { required: false, label: 'Quantity', description: 'Quantity (quantity, qty, item_quantity) - if not mapped, will use "All Quantity"' },
  item_price: { required: false, label: 'Unit Price', description: 'Unit price or total amount (price, rate, amount, item_price, total) - if not mapped, will use Total Amount' },
  total_amount: { required: false, label: 'Total Amount', description: 'Total amount (total, total_amount, net_amount, grand_total)' },
  discount_amount: { required: false, label: 'Discount Amount', description: 'Discount amount (discount, discount_amount, discount_value)' },
  discount_percentage: { required: false, label: 'Discount Percentage', description: 'Discount percentage (discount_percent, discount_percentage, disc_percent)' },
  tracking_number: { required: false, label: 'Tracking Number', description: 'Tracking/AWB number (tracking, awb, docket, tracking_number)' },
};

export default function UploadModal({ base, onClose, onSuccess }: UploadModalProps) {
  const [step, setStep] = useState<'select' | 'mapping' | 'result'>('select');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileColumns, setFileColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [addressParts, setAddressParts] = useState<{part1: string, part2: string, part3: string}>({part1: '', part2: '', part3: ''});
  const [uploading, setUploading] = useState(false);
  const [uploadReport, setUploadReport] = useState<any>(null);
  const [savedTemplates, setSavedTemplates] = useState<Array<{id: number; name: string; column_mapping: Record<string, string>; address_parts?: typeof addressParts}>>([]);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<number | null>(null);

  // Load templates from API on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const token = localStorage.getItem('dc_access') || '';
      const res = await fetch(`${base}column-mapping-templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSavedTemplates(data);
      }
    } catch (e) {
      console.error('Failed to load templates:', e);
    }
  };

  const handleFileSelect = async (file: File) => {
    setUploadFile(file);
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('dc_access') || '';
      const headers = new Headers();
      headers.set('Authorization', `Bearer ${token}`);
      
      const res = await fetch(`${base}invoices/preview-columns`, {
        method: 'POST',
        headers: headers,
        body: formData
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      
      const result = await res.json();
      setFileColumns(result.detected_columns);
      setColumnMapping(result.suggested_mapping);
      setStep('mapping');
    } catch (e: any) {
      alert(`Failed to preview file: ${e.message}`);
      setUploadFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    
    // Validate required mappings
    const requiredCols = Object.entries(standardColumns)
      .filter(([_, info]) => info.required)
      .map(([col]) => col);
    
    const mappedStandardCols = Object.values(columnMapping);
    const missingRequired = requiredCols.filter(col => !mappedStandardCols.includes(col));
    
    if (missingRequired.length > 0) {
      alert(`Please map all required columns: ${missingRequired.join(', ')}`);
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      
      // If a template is selected, send template_id so backend can load it
      if (selectedTemplate) {
        formData.append('template_id', selectedTemplate.toString());
      }
      
      // Combine address parts into column mapping
      const finalMapping = {...columnMapping};
      if (addressParts.part1) finalMapping[addressParts.part1] = 'customer_address_line1';
      if (addressParts.part2) finalMapping[addressParts.part2] = 'customer_address_line2';
      if (addressParts.part3) finalMapping[addressParts.part3] = 'customer_address_line3';
      
      formData.append('column_mapping', JSON.stringify(finalMapping));
      formData.append('address_parts', JSON.stringify(addressParts));
      
      const token = localStorage.getItem('dc_access') || '';
      const headers = new Headers();
      headers.set('Authorization', `Bearer ${token}`);
      
      const res = await fetch(`${base}invoices/bulk-upload`, {
        method: 'POST',
        headers: headers,
        body: formData
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      
      const result = await res.json();
      setUploadReport(result);
      setStep('result');
    } catch (e: any) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }
    
    try {
      const token = localStorage.getItem('dc_access') || '';
      const formData = new FormData();
      formData.append('name', templateName);
      formData.append('column_mapping', JSON.stringify(columnMapping));
      formData.append('address_parts', JSON.stringify(addressParts));
      
      const res = await fetch(`${base}column-mapping-templates`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (res.ok) {
        await loadTemplates();
        setTemplateName('');
        setShowSaveTemplate(false);
        alert(editingTemplate ? 'Template updated!' : 'Template saved!');
        setEditingTemplate(null);
      } else {
        alert('Failed to save template');
      }
    } catch (e) {
      alert('Error saving template');
      console.error(e);
    }
  };

  const loadTemplate = (id: number) => {
    const template = savedTemplates.find(t => t.id === id);
    if (template) {
      setColumnMapping(template.column_mapping);
      if (template.address_parts) {
        setAddressParts(template.address_parts);
      }
      setSelectedTemplate(id);
    }
  };

  const deleteTemplate = async (id: number, name: string) => {
    if (confirm(`Delete template "${name}"?`)) {
      try {
        const token = localStorage.getItem('dc_access') || '';
        const res = await fetch(`${base}column-mapping-templates/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
          await loadTemplates();
          if (selectedTemplate === id) {
            setSelectedTemplate(null);
            setColumnMapping({});
            setAddressParts({part1: '', part2: '', part3: ''});
          }
        } else {
          alert('Failed to delete template');
        }
      } catch (e) {
        alert('Error deleting template');
        console.error(e);
      }
    }
  };

  const downloadExampleFile = () => {
    // Create example data with all supported columns
    const exampleData = [
      {
        'Invoice Number': 'INV001',
        'Invoice Date': '2026-01-06',
        'Customer ID': 'CUST001',
        'Customer Name': 'John Doe',
        'Customer Phone': '9876543210',
        'Customer Email': 'john@example.com',
        'Customer GSTIN': '29ABCDE1234F1Z5',
        'Customer Address - Street': '123 Main Street, Building A',
        'Customer Address - City': 'Mumbai, Maharashtra',
        'Customer Address - PIN': '400001',
        'Shipping Address': 'Same as billing',
        'Rider/Driver Name': 'Ramesh Kumar',
        'Product/Item Name': 'Widget A',
        'Quantity': '5',
        'Unit Price': '100.00',
        'Total Amount': '500.00',
        'Discount Amount': '50.00',
        'Discount Percentage': '10',
        'Tracking Number': 'TRK123456789'
      },
      {
        'Invoice Number': 'INV001',
        'Invoice Date': '2026-01-06',
        'Customer ID': 'CUST001',
        'Customer Name': 'John Doe',
        'Customer Phone': '9876543210',
        'Customer Email': 'john@example.com',
        'Customer GSTIN': '29ABCDE1234F1Z5',
        'Customer Address - Street': '123 Main Street, Building A',
        'Customer Address - City': 'Mumbai, Maharashtra',
        'Customer Address - PIN': '400001',
        'Shipping Address': 'Same as billing',
        'Rider/Driver Name': 'Ramesh Kumar',
        'Product/Item Name': 'Widget B',
        'Quantity': '3',
        'Unit Price': '200.00',
        'Total Amount': '600.00',
        'Discount Amount': '60.00',
        'Discount Percentage': '10',
        'Tracking Number': 'TRK123456789'
      },
      {
        'Invoice Number': 'INV002',
        'Invoice Date': '2026-01-06',
        'Customer ID': 'CUST002',
        'Customer Name': 'Jane Smith',
        'Customer Phone': '9123456789',
        'Customer Email': 'jane@example.com',
        'Customer GSTIN': '',
        'Customer Address - Street': '456 Park Avenue',
        'Customer Address - City': 'Delhi',
        'Customer Address - PIN': '110001',
        'Shipping Address': '',
        'Rider/Driver Name': 'Suresh Singh',
        'Product/Item Name': 'Product X',
        'Quantity': '10',
        'Unit Price': '50.00',
        'Total Amount': '500.00',
        'Discount Amount': '',
        'Discount Percentage': '',
        'Tracking Number': ''
      }
    ];

    // Convert to CSV
    const headers = Object.keys(exampleData[0]);
    const csvContent = [
      headers.join(','),
      ...exampleData.map(row => 
        headers.map(header => {
          const value = row[header as keyof typeof row] || '';
          // Wrap in quotes if contains comma
          return value.toString().includes(',') ? `"${value}"` : value;
        }).join(',')
      )
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'invoice_upload_example.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">
            {step === 'select' && 'Select File'}
            {step === 'mapping' && 'Map Columns'}
            {step === 'result' && 'Upload Complete'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Step 1: File Selection */}
          {step === 'select' && (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Upload a CSV or Excel file. Multiple products for the same customer (phone number) will be grouped into one invoice.
                </p>
                
                {/* Example File Download Section */}
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-blue-900 mb-1">First time uploading?</h4>
                      <p className="text-xs text-blue-700 mb-2">
                        Download our example file to see the expected format with sample data
                      </p>
                      <button
                        onClick={downloadExampleFile}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors"
                      >
                        <Download size={14} />
                        Download Example File
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                  className="hidden"
                  id="bulk-upload"
                  disabled={uploading}
                />
                <label htmlFor="bulk-upload" className="cursor-pointer inline-flex flex-col items-center">
                  <Upload size={48} className="text-gray-400 mb-2" />
                  <span className="text-sm font-medium text-gray-700">
                    {uploading ? 'Analyzing file...' : uploadFile ? uploadFile.name : 'Click to select file'}
                  </span>
                  <span className="text-xs text-gray-500 mt-1">
                    Supported: .csv, .xlsx, .xls
                  </span>
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <button onClick={onClose} className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Map your file columns to standard fields. Required fields are marked with <span className="text-red-500">*</span>
                </p>

                {/* Template Selection */}
                {savedTemplates.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Saved Templates</label>
                    <div className="space-y-2">
                      {savedTemplates.map((t) => (
                        <div key={t.id} className="flex items-center gap-2">
                          <button
                            onClick={() => loadTemplate(t.id)}
                            className={`flex-1 px-3 py-2 text-sm text-left border rounded-md hover:bg-blue-100 ${
                              selectedTemplate === t.id ? 'bg-blue-200 border-blue-400 font-medium' : 'bg-white border-gray-300'
                            }`}
                          >
                            {t.name}
                          </button>
                          <button
                            onClick={() => deleteTemplate(t.id, t.name)}
                            className="px-3 py-2 text-red-600 hover:bg-red-50 border border-red-300 rounded-md"
                            title="Delete template"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Standard Columns</h3>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Your File Columns</h3>
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {Object.entries(standardColumns).map(([standardCol, info]) => {
                  // Special handling for customer_address with 3 dropdowns
                  if (standardCol === 'customer_address' && info.isMultiSelect) {
                    return (
                      <div key={standardCol} className="grid grid-cols-2 gap-4 items-start p-2 bg-blue-50 rounded">
                        <div className="text-sm flex items-center gap-2">
                          <div>
                            <span className="font-medium">{info.label}</span>
                            <div className="text-xs text-gray-500">{info.description}</div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <select
                            value={addressParts.part1}
                            onChange={(e) => setAddressParts({...addressParts, part1: e.target.value})}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          >
                            <option value="">-- Address Part 1 (Street/Building) --</option>
                            {fileColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                          <select
                            value={addressParts.part2}
                            onChange={(e) => setAddressParts({...addressParts, part2: e.target.value})}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          >
                            <option value="">-- Address Part 2 (Area/City) --</option>
                            {fileColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                          <select
                            value={addressParts.part3}
                            onChange={(e) => setAddressParts({...addressParts, part3: e.target.value})}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          >
                            <option value="">-- Address Part 3 (PIN/State) --</option>
                            {fileColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  }
                  
                  // Regular single-select mapping for other fields
                  const isMapped = Object.values(columnMapping).includes(standardCol);
                  const showWarning = info.required && !isMapped;
                  
                  return (
                    <div key={standardCol} className={`grid grid-cols-2 gap-4 items-center ${showWarning ? 'bg-yellow-50 p-2 rounded' : ''}`}>
                      <div className="text-sm flex items-center gap-2">
                        {showWarning && <AlertTriangle size={16} className="text-yellow-600" />}
                        <div>
                          <span className="font-medium">{info.label}</span>
                          {info.required && <span className="text-red-500 ml-1">*</span>}
                          <div className="text-xs text-gray-500">{info.description}</div>
                        </div>
                      </div>
                      <div>
                        <select
                          value={Object.entries(columnMapping).find(([_, val]) => val === standardCol)?.[0] || ''}
                          onChange={(e) => {
                            const newMapping = { ...columnMapping };
                            // Remove old mapping for this standard column
                            Object.keys(newMapping).forEach(key => {
                              if (newMapping[key] === standardCol) delete newMapping[key];
                            });
                            // Add new mapping
                            if (e.target.value) {
                              newMapping[e.target.value] = standardCol;
                            }
                            setColumnMapping(newMapping);
                          }}
                          className={`w-full px-3 py-2 border rounded-md text-sm ${showWarning ? 'border-yellow-500' : ''}`}
                        >
                          <option value="">-- Not mapped --</option>
                          {fileColumns.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                    className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Save size={16} />
                    Save Template
                  </button>
                  {showSaveTemplate && (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Template name"
                        className="px-3 py-2 border rounded-md text-sm"
                      />
                      <button
                        onClick={saveTemplate}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setStep('select');
                      setUploadFile(null);
                      setFileColumns([]);
                      setColumnMapping({});
                    }}
                    className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploading ? 'Uploading...' : (
                      <>
                        <Check size={16} />
                        Confirm & Upload
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Results */}
          {step === 'result' && uploadReport && (
            <>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-green-600 mb-4">Upload Complete!</h3>
                
                {/* Main Statistics */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-600">{uploadReport.total_csv_rows || 0}</div>
                    <div className="text-xs text-gray-600">CSV Rows</div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">{uploadReport.unique_customers || 0}</div>
                    <div className="text-xs text-gray-600">Customers</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="text-xl font-bold text-green-600">{uploadReport.created || 0}</div>
                    <div className="text-xs text-gray-600">Created</div>
                  </div>
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                    <div className="text-xl font-bold text-teal-600">{uploadReport.saved_in_db || 0}</div>
                    <div className="text-xs text-gray-600">Saved in DB</div>
                  </div>
                </div>

                {/* Additional Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {uploadReport.new_customers > 0 && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                      <div className="text-xl font-bold text-indigo-600">{uploadReport.new_customers}</div>
                      <div className="text-xs text-gray-600">New Customers</div>
                    </div>
                  )}
                  {uploadReport.skipped_invoices && uploadReport.skipped_invoices.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="text-xl font-bold text-yellow-600">{uploadReport.skipped_invoices.length}</div>
                      <div className="text-xs text-gray-600">Skipped</div>
                    </div>
                  )}
                  {uploadReport.failed_invoices && uploadReport.failed_invoices.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="text-xl font-bold text-red-600">{uploadReport.failed_invoices.length}</div>
                      <div className="text-xs text-gray-600">Failed</div>
                    </div>
                  )}
                </div>

                {/* Successfully Processed */}
                {uploadReport.processed_invoices && uploadReport.processed_invoices.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-green-600 mb-2 flex items-center gap-2">
                      <CheckCircle size={16} />
                      Successfully Processed ({uploadReport.processed_invoices.length}):
                    </h4>
                    <div className="max-h-48 overflow-y-auto bg-green-50 border border-green-200 rounded p-3">
                      {uploadReport.processed_invoices.map((inv: any, idx: number) => (
                        <div key={idx} className="text-xs text-green-800 mb-2 pb-2 border-b border-green-200 last:border-0">
                          <div className="font-semibold">Invoice: {inv.invoice_number}</div>
                          <div className="text-green-700">
                            {inv.customer_name} ({inv.phone}) • {inv.items_count} items • ₹{inv.total_amount?.toFixed(2)}
                            {inv.new_customer && <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">NEW</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skipped */}
                {uploadReport.skipped_invoices && uploadReport.skipped_invoices.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-yellow-600 mb-2 flex items-center gap-2">
                      <AlertTriangle size={16} />
                      Skipped ({uploadReport.skipped_invoices.length}):
                    </h4>
                    <div className="max-h-48 overflow-y-auto bg-yellow-50 border border-yellow-200 rounded p-3">
                      {uploadReport.skipped_invoices.map((inv: any, idx: number) => (
                        <div key={idx} className="text-xs text-yellow-800 mb-2">
                          <span className="font-semibold">{inv.invoice_number}</span> - {inv.customer_name} ({inv.phone}) - {inv.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed */}
                {uploadReport.failed_invoices && uploadReport.failed_invoices.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
                      <X size={16} />
                      Failed ({uploadReport.failed_invoices.length}):
                    </h4>
                    <div className="max-h-48 overflow-y-auto bg-red-50 border border-red-200 rounded p-3">
                      {uploadReport.failed_invoices.map((inv: any, idx: number) => (
                        <div key={idx} className="text-xs text-red-800 mb-3 pb-2 border-b border-red-200 last:border-0">
                          <div className="font-semibold">{inv.invoice_number} - {inv.customer_name} ({inv.phone})</div>
                          <div className="text-red-700">Error: {inv.error}</div>
                          <div className="text-red-600 text-[10px]">Rows: {inv.rows?.join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {uploadReport.warnings && uploadReport.warnings.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-yellow-600 mb-2 flex items-center gap-2">
                      <AlertTriangle size={16} />
                      Warnings - Please Review:
                    </h4>
                    <div className="max-h-48 overflow-y-auto bg-yellow-50 border border-yellow-200 rounded p-3">
                      {uploadReport.warnings.map((warn: any, idx: number) => (
                        <div key={idx} className="text-xs text-yellow-700 mb-1 flex items-start gap-2">
                          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                          <span>Row {warn.row}: {warn.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {uploadReport.errors && uploadReport.errors.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-red-600 mb-2">Errors:</h4>
                    <div className="max-h-48 overflow-y-auto bg-red-50 border border-red-200 rounded p-3">
                      {uploadReport.errors.map((err: any, idx: number) => (
                        <div key={idx} className="text-xs text-red-700 mb-1">
                          Row {err.row}: {err.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3">
                <button
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('dc_access') || '';
                      // Add template_id to URL if a template was used
                      const url = selectedTemplate 
                        ? `${base}invoices/export-uploaded?template_id=${selectedTemplate}`
                        : `${base}invoices/export-uploaded`;
                      const res = await fetch(url, {
                        method: 'GET',
                        headers: {
                          'Authorization': `Bearer ${token}`
                        }
                      });
                      
                      if (!res.ok) throw new Error('Export failed');
                      
                      const blob = await res.blob();
                      const url2 = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url2;
                      a.download = `uploaded_invoices_${new Date().getTime()}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url2);
                      document.body.removeChild(a);
                    } catch (e: any) {
                      alert(`Export failed: ${e.message}`);
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 flex items-center gap-2"
                >
                  <Download size={16} />
                  Download CSV
                </button>
                <button
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
