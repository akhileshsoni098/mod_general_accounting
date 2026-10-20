import React, { useState, useEffect } from 'react';
import { commercialApi, inventoryApi } from '../services/api';
import {
  FileText,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  DollarSign,
  TrendingUp,
  Receipt,
  Layers,
  Search
} from 'lucide-react';

export default function CommercialWorkspacePage() {
  const [activeTab, setActiveTab] = useState('documents'); // 'documents' | 'reports' | 'opening_gl'
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New Voucher Modal State
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState('SALES_INVOICE');
  const [subType, setSubType] = useState('TAX_INVOICE');
  const [billingName, setBillingName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lines, setLines] = useState([
    { line_type: 'GOODS', item_name: '', quantity: 1, unit_price: 100, tax_rate_code: 'GST_18' }
  ]);

  // Reports State
  const [reportType, setReportType] = useState('sales_register');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Opening GL Reconciliation State
  const [glPreview, setGlPreview] = useState(null);
  const [glLoading, setGlLoading] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await commercialApi.getDocuments();
      setDocuments(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async (id) => {
    if (!window.confirm('Post this document to General Ledger and update Stock balances?')) return;
    try {
      await commercialApi.postDocument(id);
      setSuccess('Document posted successfully with GL journals and stock movements!');
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReverse = async (id) => {
    const reason = window.prompt('Enter reason for reversal:', 'Correction of transaction');
    if (!reason) return;
    try {
      await commercialApi.reverseDocument(id, { reason });
      setSuccess('Document reversed successfully with offsetting journals and stock return.');
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateDocument = async (e) => {
    e.preventDefault();
    try {
      const formattedLines = lines.map((l, idx) => ({
        line_number: idx + 1,
        line_type: l.line_type,
        item_name: l.item_name || 'Standard Item',
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        tax_rate_code: l.tax_rate_code
      }));

      await commercialApi.createDraftDocument({
        document_type: docType,
        sub_type: subType,
        billing_name: billingName,
        customer_phone: customerPhone,
        lines: formattedLines
      });

      setShowModal(false);
      setSuccess('Draft voucher created successfully.');
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  const addLine = () => {
    setLines([...lines, { line_type: 'GOODS', item_name: '', quantity: 1, unit_price: 100, tax_rate_code: 'GST_18' }]);
  };

  const updateLine = (idx, field, value) => {
    const updated = [...lines];
    updated[idx][field] = value;
    setLines(updated);
  };

  const removeLine = (idx) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const loadReport = async (type) => {
    setReportType(type);
    setReportLoading(true);
    setReportData(null);
    try {
      let res;
      if (type === 'sales_register') res = await commercialApi.getSalesRegister();
      else if (type === 'purchase_register') res = await commercialApi.getPurchaseRegister();
      else if (type === 'customer_aging') res = await commercialApi.getCustomerAging();
      else if (type === 'supplier_aging') res = await commercialApi.getSupplierAging();
      else if (type === 'gst_summary') res = await commercialApi.getGstSummary();
      setReportData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setReportLoading(false);
    }
  };

  const loadGlPreview = async () => {
    setGlLoading(true);
    try {
      const res = await commercialApi.getOpeningStockGlPreview();
      setGlPreview(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setGlLoading(false);
    }
  };

  const executeGlCatchup = async () => {
    if (!window.confirm('Post Opening Stock GL catch-up entry to General Ledger?')) return;
    setGlLoading(true);
    try {
      const res = await commercialApi.postOpeningStockGlCatchup();
      setSuccess(`Catch-up posted successfully! Journal: ${res.data.journal ? res.data.journal.journal_number : 'Posted'}`);
      loadGlPreview();
    } catch (err) {
      setError(err.message);
    } finally {
      setGlLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <Receipt className="w-5 h-5 text-brand-400" />
            <span>Commercial Invoicing & Voucher Engine</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Sales & Purchase Invoices, GST Breakdown, Perpetual Inventory GL Posting, and Reversals.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Voucher</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-rose-400 font-bold ml-2">×</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-emerald-400 font-bold ml-2">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'documents' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Voucher Documents</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('reports');
            if (!reportData) loadReport('sales_register');
          }}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'reports' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Commercial & GST Reports</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('opening_gl');
            if (!glPreview) loadGlPreview();
          }}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'opening_gl' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Opening Stock GL Reconciliation</span>
        </button>
      </div>

      {/* TAB 1: Voucher Documents */}
      {activeTab === 'documents' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-300">All Commercial Vouchers</span>
            <button
              onClick={fetchDocuments}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                  <th className="p-3">Doc Number</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Customer / Party</th>
                  <th className="p-3 text-right">Taxable</th>
                  <th className="p-3 text-right">Tax (GST)</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-6 text-center text-slate-500">
                      No commercial vouchers created yet. Click "New Voucher" above to begin.
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc._id} className="hover:bg-slate-850/50 transition">
                      <td className="p-3 font-mono font-semibold text-brand-300">{doc.document_number}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-slate-300">
                          {doc.document_type}
                        </span>
                      </td>
                      <td className="p-3 font-medium">{doc.billing_name || 'Cash Customer'}</td>
                      <td className="p-3 text-right font-mono">₹{Number(doc.taxable_amount || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-emerald-400">₹{Number(doc.tax_amount || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">₹{Number(doc.total_amount || 0).toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                            doc.status === 'POSTED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : doc.status === 'REVERSED'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {doc.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        {doc.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePost(doc._id)}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition"
                          >
                            Post to GL
                          </button>
                        )}
                        {doc.status === 'POSTED' && (
                          <button
                            onClick={() => handleReverse(doc._id)}
                            className="px-2 py-1 rounded bg-rose-900/40 hover:bg-rose-800/60 border border-rose-700/50 text-rose-300 text-[11px] transition"
                          >
                            Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Commercial Reports */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex space-x-2">
            {[
              { id: 'sales_register', label: 'Sales Register' },
              { id: 'purchase_register', label: 'Purchase Register' },
              { id: 'customer_aging', label: 'Customer Aging' },
              { id: 'supplier_aging', label: 'Supplier Aging' },
              { id: 'gst_summary', label: 'GST Summary (GSTR-1)' }
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => loadReport(r.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  reportType === r.id ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            {reportLoading ? (
              <div className="text-center py-10 text-slate-400">Loading report data...</div>
            ) : reportData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Records</span>
                    <div className="text-lg font-bold text-white mt-1">
                      {reportData.summary ? reportData.summary.count : (Array.isArray(reportData) ? reportData.length : 'N/A')}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Amount</span>
                    <div className="text-lg font-bold text-emerald-400 mt-1">
                      ₹{reportData.summary ? Number(reportData.summary.total_amount || 0).toFixed(2) : '0.00'}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Tax (GST)</span>
                    <div className="text-lg font-bold text-brand-400 mt-1">
                      ₹{reportData.summary ? Number(reportData.summary.tax_amount || 0).toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>

                <pre className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-96">
                  {JSON.stringify(reportData, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500">Select a report above to view analytics.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Opening Stock GL Reconciliation */}
      {activeTab === 'opening_gl' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-bold text-white">Opening Stock to General Ledger Catch-up</h3>
              <p className="text-xs text-slate-400 mt-1">
                Scans all opening stock inventory valuation and provides an idempotent GL catch-up posting tool (Debit Inventory Asset 1201, Credit Opening Stock Equity 3990).
              </p>
            </div>
            <button
              onClick={loadGlPreview}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold transition"
            >
              Scan & Refresh Preview
            </button>
          </div>

          {glLoading ? (
            <div className="text-center py-8 text-slate-400">Inspecting stock ledger balances...</div>
          ) : glPreview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase">Inventory Opening Value</span>
                  <div className="text-lg font-bold text-white mt-1">
                    ₹{Number(glPreview.opening_stock_value || 0).toFixed(2)}
                  </div>
                </div>
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase">Existing GL Posted Value</span>
                  <div className="text-lg font-bold text-white mt-1">
                    ₹{Number(glPreview.gl_posted_value || 0).toFixed(2)}
                  </div>
                </div>
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase">Reconciliation Status</span>
                  <div className="text-sm font-bold mt-2">
                    {glPreview.is_reconciled ? (
                      <span className="text-emerald-400 flex items-center space-x-1">
                        <CheckCircle className="w-4 h-4" />
                        <span>Reconciled (100% Synced)</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center space-x-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Delta Detected: ₹{Number(glPreview.unposted_delta || 0).toFixed(2)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!glPreview.is_reconciled && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
                  <div className="text-xs text-amber-300">
                    A discrepancy of ₹{Number(glPreview.unposted_delta || 0).toFixed(2)} exists between Inventory valuation and General Ledger.
                  </div>
                  <button
                    onClick={executeGlCatchup}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition"
                  >
                    Post GL Catch-up Entry
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">Click "Scan & Refresh Preview" to evaluate reconciliation.</div>
          )}
        </div>
      )}

      {/* New Voucher Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Create New Commercial Voucher</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white font-bold text-lg">×</button>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Voucher Type</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  >
                    <option value="SALES_INVOICE">Sales Invoice</option>
                    <option value="PURCHASE_INVOICE">Purchase Invoice</option>
                    <option value="CREDIT_NOTE">Sales Return (Credit Note)</option>
                    <option value="DEBIT_NOTE">Purchase Return (Debit Note)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Customer / Vendor Name</label>
                  <input
                    type="text"
                    value={billingName}
                    onChange={(e) => setBillingName(e.target.value)}
                    placeholder="e.g. Acme Retailers Ltd"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-300">Line Items</span>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-brand-400 hover:text-brand-300 font-semibold"
                  >
                    + Add Line
                  </button>
                </div>

                {lines.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <div className="col-span-4">
                      <input
                        type="text"
                        placeholder="Item Name / SKU"
                        value={l.item_name}
                        onChange={(e) => updateLine(idx, 'item_name', e.target.value)}
                        required
                        className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        placeholder="Qty"
                        value={l.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                        min="0.001"
                        step="any"
                        required
                        className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white text-right font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        placeholder="Rate"
                        value={l.unit_price}
                        onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                        min="0"
                        step="any"
                        required
                        className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white text-right font-mono"
                      />
                    </div>
                    <div className="col-span-3">
                      <select
                        value={l.tax_rate_code}
                        onChange={(e) => updateLine(idx, 'tax_rate_code', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white"
                      >
                        <option value="GST_0">GST 0%</option>
                        <option value="GST_5">GST 5%</option>
                        <option value="GST_12">GST 12%</option>
                        <option value="GST_18">GST 18%</option>
                        <option value="GST_28">GST 28%</option>
                      </select>
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-rose-400 hover:text-rose-300 font-bold"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-md"
                >
                  Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
