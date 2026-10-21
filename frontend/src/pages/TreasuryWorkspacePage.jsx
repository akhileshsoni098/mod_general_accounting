import React, { useState, useEffect } from 'react';
import { authApi } from '../services/api';
import {
  Landmark,
  CreditCard,
  FileCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Plus,
  ArrowRight,
  TrendingUp,
  RotateCcw,
  ShieldAlert,
  Users,
  Search,
  Check,
  XCircle,
  FileSpreadsheet
} from 'lucide-react';

export default function TreasuryWorkspacePage() {
  const [subtab, setSubtab] = useState('overview'); // 'overview' | 'reconciliation' | 'statements' | 'processors' | 'mandates' | 'attempts' | 'returns' | 'refunds' | 'dunning'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Data states
  const [overview, setOverview] = useState(null);
  const [bankLines, setBankLines] = useState([]);
  const [processorTxs, setProcessorTxs] = useState([]);
  const [matches, setMatches] = useState([]);
  const [mandates, setMandates] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [returns, setReturns] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [dunningCases, setDunningCases] = useState([]);
  const [dunningPlans, setDunningPlans] = useState([]);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualMatchModal, setShowManualMatchModal] = useState(false);
  const [showAttemptModal, setShowAttemptModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  // Forms
  const [importForm, setImportForm] = useState({
    batch_id: `STMT-WF-${Date.now().toString().slice(-6)}`,
    account_type: 'FIDUCIARY_TRUST',
    account_number: 'WF-TX-TRUST-1010',
    linesText: `2026-07-01,CR,9412.50,WELLS FARGO ACH DEPOSIT LONE PINE TRUCKING,PTX-2026-00001\n2026-07-02,CR,500.00,UNIDENTIFIED LOCKBOX CHECK DEPOSIT,CHK-99120`
  });

  const [selectedBankLine, setSelectedBankLine] = useState('');
  const [selectedProcessorTx, setSelectedProcessorTx] = useState('');
  const [matchReason, setMatchReason] = useState('Manual verification with bank ledger');

  const [attemptForm, setAttemptForm] = useState({
    billing_account_id: '',
    amount: '9412.50',
    simulated_outcome: 'SUCCESS',
    payment_method: 'ACH'
  });

  const [returnForm, setReturnForm] = useState({
    payment_id: '',
    return_code: 'R01',
    reason_description: 'ACH Insufficient Funds (NSF)'
  });

  const [refundForm, setRefundForm] = useState({
    billing_account_id: '',
    amount: '500.00',
    reason: 'Customer credit balance / return adjustment refund',
    refund_method: 'ACH'
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (subtab === 'overview') {
        const res = await authApi.getTreasuryOverview();
        setOverview(res.data);
      } else if (subtab === 'reconciliation') {
        const [blRes, ptRes, mRes] = await Promise.all([
          authApi.getBankStatementLines('?reconciliation_status=UNMATCHED'),
          authApi.getProcessorTransactions('?reconciliation_status=UNMATCHED'),
          authApi.getReconciliationMatches()
        ]);
        setBankLines(blRes.data);
        setProcessorTxs(ptRes.data);
        setMatches(mRes.data);
      } else if (subtab === 'statements') {
        const res = await authApi.getBankStatementLines();
        setBankLines(res.data);
      } else if (subtab === 'processors') {
        const res = await authApi.getProcessorTransactions();
        setProcessorTxs(res.data);
      } else if (subtab === 'mandates') {
        const res = await authApi.getMandates();
        setMandates(res.data);
      } else if (subtab === 'attempts') {
        const res = await authApi.getAttempts();
        setAttempts(res.data);
      } else if (subtab === 'returns') {
        const res = await authApi.getPaymentReturns();
        setReturns(res.data);
      } else if (subtab === 'refunds') {
        const res = await authApi.getRefunds();
        setRefunds(res.data);
      } else if (subtab === 'dunning') {
        const [cRes, pRes] = await Promise.all([
          authApi.getDelinquencyCases(),
          authApi.getDunningPlans()
        ]);
        setDunningCases(cRes.data);
        setDunningPlans(pRes.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subtab]);

  // Handle CSV Statement Import
  const handleImportStatement = async (e) => {
    e.preventDefault();
    try {
      const parsedLines = importForm.linesText
        .trim()
        .split('\n')
        .map(line => {
          const parts = line.split(',');
          return {
            booking_date: parts[0]?.trim() || new Date().toISOString(),
            direction: parts[1]?.trim() || 'CR',
            amount: parts[2]?.trim() || '0.00',
            bank_description: parts[3]?.trim() || 'Bank Deposit',
            bank_reference: parts[4]?.trim() || ''
          };
        });

      await authApi.importBankStatement({
        batch_id: importForm.batch_id,
        account_type: importForm.account_type,
        account_number: importForm.account_number,
        lines: parsedLines
      });

      setSuccess(`Imported ${parsedLines.length} bank statement lines successfully`);
      setShowImportModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Auto-Reconcile
  const handleAutoReconcile = async () => {
    setLoading(true);
    try {
      const res = await authApi.autoReconcile();
      setSuccess(`Auto-reconciliation executed: ${res.data.length} matches created with 100% confidence`);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Manual Match
  const handleManualMatch = async (e) => {
    e.preventDefault();
    try {
      await authApi.manualMatch({
        bank_statement_line_id: selectedBankLine,
        processor_transaction_id: selectedProcessorTx,
        reason: matchReason
      });
      setSuccess('Manual reconciliation match recorded with audit trace');
      setShowManualMatchModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Payment Return
  const handleProcessReturn = async (e) => {
    e.preventDefault();
    try {
      await authApi.postPaymentReturn(returnForm);
      setSuccess('Payment return & NSF reversal journal posted to GL');
      setShowReturnModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Refund
  const handleProcessRefund = async (e) => {
    e.preventDefault();
    try {
      await authApi.postRefund(refundForm);
      setSuccess('Refund disbursed and GL entry posted');
      setShowRefundModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Treasury & Bank Reconciliation</h1>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-medium">
              Module 40 • Cash Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Two-pane bank statement reconciliation, processor settlements, NSF returns, refunds, Texas § 4053 trust accounts, and dunning.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">✕</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-200">✕</button>
        </div>
      )}

      {/* Navigation Subtabs */}
      <div className="flex border-b border-slate-800 space-x-1 overflow-x-auto">
        {[
          { id: 'overview', label: 'Treasury Overview', icon: Landmark },
          { id: 'reconciliation', label: '2-Pane Bank Reconciliation', icon: FileCheck },
          { id: 'statements', label: 'Bank Statement Feeds', icon: FileSpreadsheet },
          { id: 'processors', label: 'Processor Settlements', icon: TrendingUp },
          { id: 'returns', label: 'NSF Returns & Dishonors', icon: RotateCcw },
          { id: 'refunds', label: 'Disbursed Refunds', icon: CreditCard },
          { id: 'dunning', label: 'Dunning & Collections', icon: ShieldAlert }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subtab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSubtab(tab.id);
                setSuccess(null);
                setError(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition ${
                isActive
                  ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {subtab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
              <div className="text-[11px] text-slate-400 uppercase font-mono">Bank Statement Deposits</div>
              <div className="text-2xl font-bold font-mono text-white mt-1">
                ${overview ? overview.totalBankDeposits : '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Total imported feed deposits</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
              <div className="text-[11px] text-emerald-400 uppercase font-mono">Reconciled Bank Cash</div>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                ${overview ? overview.matchedBankAmount : '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Matched with system transactions</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
              <div className="text-[11px] text-amber-400 uppercase font-mono">Unmatched Bank Lines</div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {overview ? overview.unmatchedBankCount : 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Pending reconciliation</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
              <div className="text-[11px] text-purple-400 uppercase font-mono">Processor Settled</div>
              <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
                ${overview ? overview.totalProcessorSettled : '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Gateway settlement volume</div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-lg space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Treasury Quick Actions</h3>
            <p className="text-xs text-slate-400">
              Import electronic bank feeds, execute 4-way automated reconciliation against payment records, or process NSF dishonors with GL adjustments.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Import Bank Statement Feed</span>
              </button>
              <button
                onClick={() => setSubtab('reconciliation')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition"
              >
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Launch 2-Pane Reconciliation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TWO-PANE RECONCILIATION */}
      {subtab === 'reconciliation' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Match unmatched bank feed lines (left pane) against recorded processor cash receipts (right pane).
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleAutoReconcile}
                disabled={loading}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Run Auto-Reconcile</span>
              </button>
              <button
                onClick={() => setShowManualMatchModal(true)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold border border-slate-700 transition"
              >
                <span>Manual Match...</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Left Pane: Bank Lines */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-850 border-b border-slate-800 font-semibold text-xs text-slate-200 flex justify-between">
                <span>Unmatched Bank Statement Feed Lines</span>
                <span className="font-mono text-emerald-400">{bankLines.length} Lines</span>
              </div>
              <div className="divide-y divide-slate-800 text-xs font-mono max-h-96 overflow-y-auto">
                {bankLines.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 font-sans">All bank lines reconciled!</div>
                ) : (
                  bankLines.map((bl) => (
                    <div key={bl._id} className="p-3 hover:bg-slate-850/50 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-white">${bl.amount} {bl.direction}</div>
                        <div className="text-[11px] text-slate-400 font-sans">{bl.bank_description}</div>
                        <div className="text-[10px] text-slate-500">{new Date(bl.booking_date).toLocaleDateString()} • Ref: {bl.bank_reference || '-'}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {bl.reconciliation_status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Pane: Processor Transactions */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-850 border-b border-slate-800 font-semibold text-xs text-slate-200 flex justify-between">
                <span>Unmatched System Processor Transactions</span>
                <span className="font-mono text-brand-400">{processorTxs.length} Transactions</span>
              </div>
              <div className="divide-y divide-slate-800 text-xs font-mono max-h-96 overflow-y-auto">
                {processorTxs.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 font-sans">No unmatched processor transactions.</div>
                ) : (
                  processorTxs.map((pt) => (
                    <div key={pt._id} className="p-3 hover:bg-slate-850/50 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-white">${pt.amount}</div>
                        <div className="text-[11px] text-slate-400">{pt.processor_reference}</div>
                        <div className="text-[10px] text-slate-500">{new Date(pt.settlement_date).toLocaleDateString()} • {pt.processor_name}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {pt.reconciliation_status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Active Matches Register */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden mt-6">
            <div className="p-3 bg-slate-850 border-b border-slate-800 font-semibold text-xs text-slate-200">
              Active Reconciliation Matches Register ({matches.length})
            </div>
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-850 text-slate-400 text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Match Type</th>
                  <th className="p-2.5">Bank Line Amount</th>
                  <th className="p-2.5">Bank Description</th>
                  <th className="p-2.5">Matched System Tx</th>
                  <th className="p-2.5">Confidence</th>
                  <th className="p-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {matches.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-4 text-center text-slate-500 font-sans">
                      No matches yet. Click "Run Auto-Reconcile" above.
                    </td>
                  </tr>
                ) : (
                  matches.map((m) => (
                    <tr key={m._id} className="hover:bg-slate-850/50">
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px]">
                          {m.match_type}
                        </span>
                      </td>
                      <td className="p-2.5 text-white font-semibold">${m.matched_amount}</td>
                      <td className="p-2.5 font-sans text-slate-300">
                        {m.bank_statement_line_id ? m.bank_statement_line_id.bank_description : 'N/A'}
                      </td>
                      <td className="p-2.5 text-slate-400">
                        {m.processor_transaction_id ? m.processor_transaction_id.processor_reference : 'N/A'}
                      </td>
                      <td className="p-2.5 text-emerald-400 font-bold">{m.confidence_score * 100}%</td>
                      <td className="p-2.5 text-slate-500">{new Date(m.match_date).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BANK STATEMENTS */}
      {subtab === 'statements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Imported electronic bank statement feed register.
            </div>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Import Statement</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-850 text-slate-400 uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Batch ID</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Account</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {bankLines.map((bl) => (
                  <tr key={bl._id} className="hover:bg-slate-850/50">
                    <td className="p-3 text-slate-400">{bl.import_batch_id}</td>
                    <td className="p-3 text-slate-400">{new Date(bl.booking_date).toLocaleDateString()}</td>
                    <td className="p-3 text-slate-300 font-sans">{bl.bank_account_type}</td>
                    <td className="p-3 text-white font-sans">{bl.bank_description}</td>
                    <td className="p-3 text-white font-semibold">${bl.amount} {bl.direction}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        bl.reconciliation_status === 'MATCHED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {bl.reconciliation_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: RETURNS */}
      {subtab === 'returns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              ACH dishonors and NSF return reversals with automated penalty fee contra-postings.
            </div>
            <button
              onClick={() => setShowReturnModal(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Record NSF Return</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-850 text-slate-400 uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Return #</th>
                  <th className="p-3">Return Code</th>
                  <th className="p-3">Dishonored Amount</th>
                  <th className="p-3">NSF Penalty Fee</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">GL Journal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-6 text-center text-slate-500 font-sans">
                      No payment returns recorded.
                    </td>
                  </tr>
                ) : (
                  returns.map((r) => (
                    <tr key={r._id} className="hover:bg-slate-850/50">
                      <td className="p-3 text-white font-semibold">{r.return_number}</td>
                      <td className="p-3 text-rose-400">{r.return_code}</td>
                      <td className="p-3 text-white">${r.return_amount}</td>
                      <td className="p-3 text-amber-400">${r.fee_amount}</td>
                      <td className="p-3 font-sans text-slate-300">{r.reason_description}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">{r.journal_id ? r.journal_id.journal_number : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: REFUNDS */}
      {subtab === 'refunds' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Customer credit balance and return adjustment refund disbursements from operating bank account.
            </div>
            <button
              onClick={() => setShowRefundModal(true)}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Disburse Refund</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-850 text-slate-400 uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Refund #</th>
                  <th className="p-3">Account</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">GL Journal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {refunds.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-6 text-center text-slate-500 font-sans">
                      No refunds disbursed yet.
                    </td>
                  </tr>
                ) : (
                  refunds.map((rf) => (
                    <tr key={rf._id} className="hover:bg-slate-850/50">
                      <td className="p-3 text-white font-semibold">{rf.refund_number}</td>
                      <td className="p-3 font-sans text-slate-300">
                        {rf.billing_account_id ? rf.billing_account_id.customer_name : 'N/A'}
                      </td>
                      <td className="p-3 text-white font-semibold">${rf.refund_amount}</td>
                      <td className="p-3 text-slate-400">{rf.refund_method}</td>
                      <td className="p-3 font-sans text-slate-300">{rf.reason}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {rf.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">{rf.journal_id ? rf.journal_id.journal_number : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: DUNNING */}
      {subtab === 'dunning' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400">
            Dunning timeline rules (Grace Period → Intent to Cancel → Nonpayment Cancellation).
          </div>
          <div className="grid grid-cols-2 gap-4">
            {dunningPlans.map((dp) => (
              <div key={dp._id} className="bg-slate-900 border border-slate-800 p-4 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold font-mono text-white">{dp.plan_code}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{dp.status}</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-200">{dp.plan_name}</h4>
                <p className="text-xs text-slate-400">{dp.description}</p>
                <div className="pt-2 border-t border-slate-800 text-xs font-mono grid grid-cols-3 gap-2 text-slate-400">
                  <div>Grace: {dp.grace_period_days} days</div>
                  <div>Notice: {dp.cancellation_notice_days} days</div>
                  <div>Cancel: {dp.final_cancellation_days} days</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Import Bank Statement */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-lg w-full space-y-4">
            <h3 className="text-base font-bold text-white">Import Bank Statement Feed</h3>
            <form onSubmit={handleImportStatement} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Import Batch Reference</label>
                <input
                  type="text"
                  required
                  value={importForm.batch_id}
                  onChange={(e) => setImportForm({ ...importForm, batch_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Account Type</label>
                  <select
                    value={importForm.account_type}
                    onChange={(e) => setImportForm({ ...importForm, account_type: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="FIDUCIARY_TRUST">Texas Fiduciary Trust (1010)</option>
                    <option value="OPERATING">MGA Operating Cash (1000)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Account Number</label>
                  <input
                    type="text"
                    value={importForm.account_number}
                    onChange={(e) => setImportForm({ ...importForm, account_number: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">CSV Feed Lines (Date, Direction, Amount, Description, Ref)</label>
                <textarea
                  rows={4}
                  value={importForm.linesText}
                  onChange={(e) => setImportForm({ ...importForm, linesText: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono text-[11px]"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setShowImportModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded font-semibold">Import Feed</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Manual Match */}
      {showManualMatchModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">Manual Reconciliation Match</h3>
            <form onSubmit={handleManualMatch} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Bank Statement Line</label>
                <select
                  required
                  value={selectedBankLine}
                  onChange={(e) => setSelectedBankLine(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="">Select Bank Line...</option>
                  {bankLines.map((bl) => (
                    <option key={bl._id} value={bl._id}>${bl.amount} - {bl.bank_description}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Processor System Transaction</label>
                <select
                  required
                  value={selectedProcessorTx}
                  onChange={(e) => setSelectedProcessorTx(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="">Select Processor Tx...</option>
                  {processorTxs.map((pt) => (
                    <option key={pt._id} value={pt._id}>${pt.amount} - {pt.processor_reference}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Audit Match Reason</label>
                <input
                  type="text"
                  required
                  value={matchReason}
                  onChange={(e) => setMatchReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setShowManualMatchModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold">Confirm Match</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
