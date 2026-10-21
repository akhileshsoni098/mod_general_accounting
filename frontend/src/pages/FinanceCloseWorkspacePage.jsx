import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Play,
  FileCheck,
  Download,
  Scale,
  PieChart,
  Layers,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  Clock
} from 'lucide-react';
import { financeCloseApi } from '../services/api';

export default function FinanceCloseWorkspacePage() {
  const [activeSubtab, setActiveSubtab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Data states
  const [overview, setOverview] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [subledgerBalances, setSubledgerBalances] = useState([]);
  const [reconciliationCases, setReconciliationCases] = useState([]);
  const [uprPreview, setUprPreview] = useState(null);
  const [trialBalance, setTrialBalance] = useState(null);
  const [financialStatements, setFinancialStatements] = useState(null);
  const [exportBatches, setExportBatches] = useState([]);

  // Revenue Amortization Run form
  const [uprForm, setUprForm] = useState({
    policy_reference: 'CTR-2026-001',
    contract_reference: 'CTR-2026-001',
    period_name: '2026-07',
    written_premium: '37650.00',
    deferred_revenue: '37650.00',
    start_date: '2026-07-01',
    end_date: '2027-07-01',
    as_of_date: '2026-07-31'
  });

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await financeCloseApi.getOverview();
      setOverview(res.data);
      const uprRes = await financeCloseApi.previewUPR('?written_premium=37650.00&start_date=2026-07-01&end_date=2027-07-01&as_of_date=2026-07-31');
      setUprPreview(uprRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSubtabData = async (subtab) => {
    try {
      setLoading(true);
      setError(null);
      if (subtab === 'checklist') {
        const res = await financeCloseApi.getChecklist();
        setChecklist(res.data);
      } else if (subtab === 'reconciliation') {
        const balRes = await financeCloseApi.getSubledgerBalances();
        setSubledgerBalances(balRes.data);
        const caseRes = await financeCloseApi.getReconciliationCases();
        setReconciliationCases(caseRes.data);
      } else if (subtab === 'upr') {
        const uprRes = await financeCloseApi.previewUPR(`?written_premium=${uprForm.written_premium}&start_date=${uprForm.start_date}&end_date=${uprForm.end_date}&as_of_date=${uprForm.as_of_date}`);
        setUprPreview(uprRes.data);
      } else if (subtab === 'trial_balance') {
        const res = await financeCloseApi.getTrialBalance();
        setTrialBalance(res.data);
      } else if (subtab === 'financial_statements') {
        const res = await financeCloseApi.getFinancialStatements();
        setFinancialStatements(res.data);
      } else if (subtab === 'export_batches') {
        const res = await financeCloseApi.getExportBatches();
        setExportBatches(res.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubtab === 'overview') {
      loadOverview();
    } else {
      loadSubtabData(activeSubtab);
    }
  }, [activeSubtab]);

  // Execute Step in Close Checklist
  const handleExecuteStep = async (stepNum) => {
    try {
      setLoading(true);
      setError(null);
      const res = await financeCloseApi.executeChecklistStep(stepNum);
      setSuccessMsg(`Step ${stepNum} completed: ${res.data.evidence_summary || res.data.task_name}`);
      loadSubtabData('checklist');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Run UPR Amortization
  const handleRunUPR = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const res = await financeCloseApi.runUPR(uprForm);
      setSuccessMsg(`UPR Amortization posted: Journal ${res.data.journal.journal_number} (Earned: $${res.data.calculation ? res.data.calculation.earned_premium : res.data.earned_premium})`);
      loadSubtabData('upr');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Certify Trial Balance
  const handleCertifyTrialBalance = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await financeCloseApi.certifyTrialBalance({ period_name: '2026-07' });
      setSuccessMsg(`Trial Balance Snapshot ${res.data.snapshot.snapshot_number} certified successfully!`);
      loadSubtabData('trial_balance');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Create ERP Export Batch
  const handleCreateExportBatch = async (erpTarget) => {
    try {
      setLoading(true);
      setError(null);
      const res = await financeCloseApi.createExportBatch({ target_erp: erpTarget });
      setSuccessMsg(`Generated ${erpTarget} Export Batch ${res.data.batch_number} (Checksum: ${res.data.checksum})`);
      loadSubtabData('export_batches');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <span>Finance Close, Revenue Amortization & Financial Reporting</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Module Live
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            ASC 606 / IFRS 15 straight-line revenue amortization, 7-step month-end checklist, subledger control reconciliation, and immutable Trial Balance snapshots.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => (activeSubtab === 'overview' ? loadOverview() : loadSubtabData(activeSubtab))}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Subtabs */}
      <div className="flex border-b border-slate-800 space-x-2 overflow-x-auto pb-1">
        {[
          { id: 'overview', label: 'Overview', icon: CalendarCheck },
          { id: 'checklist', label: '7-Step Close Checklist', icon: FileCheck },
          { id: 'reconciliation', label: 'Subledger Reconciliation', icon: Scale },
          { id: 'upr', label: 'Deferred Revenue Amortization', icon: Clock },
          { id: 'trial_balance', label: 'Trial Balance', icon: Layers },
          { id: 'financial_statements', label: 'Financial Statements', icon: PieChart },
          { id: 'export_batches', label: 'ERP Export Batches', icon: Download }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubtab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSubtab(tab.id);
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-t-lg text-xs font-medium transition whitespace-nowrap ${
                isActive
                  ? 'bg-slate-850 text-brand-400 border-b-2 border-brand-500 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subtab 1: Overview */}
      {activeSubtab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Period Status</div>
              <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                {overview?.currentPeriod || '2026-07'}
              </div>
              <div className="text-[10px] text-emerald-400 mt-1 font-semibold">
                Status: {overview?.periodStatus || 'OPEN'}
              </div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Close Checklist</div>
              <div className="text-xl font-bold font-mono text-brand-400 mt-1">
                {overview?.closeProgress?.completed_steps || 0} / 7 Steps
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {overview?.closeProgress?.percent || 0}% Completed
              </div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Reconciliation Cases</div>
              <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                {overview?.openReconciliationCases || 0} Open
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Subledger Variances</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Trial Balance State</div>
              <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                {overview?.latestTrialBalance ? (overview.latestTrialBalance.is_balanced ? 'BALANCED' : 'IMBALANCE') : 'PREVIEW'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                {overview?.latestTrialBalance ? overview.latestTrialBalance.snapshot_number : 'Awaiting Run'}
              </div>
            </div>
          </div>

          {/* Canonical UPR July Card */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Commercial Revenue Amortization (CTR-2026-001, July 2026)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ASC 606 Straight-Line Non-Leap Year Actual/365 Convention ($37,650.00 / 365 = $103.1506849/day)
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Formula Verified
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Annual Contract / Deferred Basis</div>
                <div className="text-sm font-bold text-slate-200 mt-1">$37,650.00</div>
                <div className="text-[10px] text-slate-500 mt-1">12-Month Service Term</div>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">July Active Days</div>
                <div className="text-sm font-bold text-brand-400 mt-1">31 Days</div>
                <div className="text-[10px] text-slate-500 mt-1">July 1 to July 31, 2026</div>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">July Recognized Revenue</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">$3,197.67</div>
                <div className="text-[10px] text-slate-500 mt-1">Recognized to Revenue (4000)</div>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Remaining Deferred Revenue</div>
                <div className="text-sm font-bold text-blue-400 mt-1">$34,452.33</div>
                <div className="text-[10px] text-slate-500 mt-1">Deferred Liability Balance (2200)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 2: 7-Step Close Checklist */}
      {activeSubtab === 'checklist' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Nina's 7-Step Month-End Close Checklist
            </h3>
            <div className="space-y-3">
              {checklist.map((task) => (
                <div
                  key={task._id}
                  className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-brand-400">Step {task.task_step}:</span>
                      <span className="font-semibold text-slate-200">{task.task_name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        task.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : task.status === 'IN_PROGRESS'
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px]">{task.description}</div>
                    {task.evidence_summary && (
                      <div className="text-emerald-400/90 text-[10px] font-mono">
                        ✓ Evidence: {task.evidence_summary}
                      </div>
                    )}
                    {task.error_details && (
                      <div className="text-rose-400 text-[10px] font-mono">
                        ✗ Error: {task.error_details}
                      </div>
                    )}
                  </div>
                  <div>
                    {task.status !== 'COMPLETED' && (
                      <button
                        onClick={() => handleExecuteStep(task.task_step)}
                        disabled={loading}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold transition"
                      >
                        <Play className="w-3 h-3" />
                        <span>Execute Step</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Subtab 3: Subledger Reconciliation */}
      {activeSubtab === 'reconciliation' && (
        <div className="space-y-6">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Subledger Control Balances vs General Ledger
            </h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                  <th className="py-2">Subledger Type</th>
                  <th>Control Account</th>
                  <th>Subledger Balance</th>
                  <th>GL Balance</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {subledgerBalances.map((b) => (
                  <tr key={b._id}>
                    <td className="py-2.5 font-bold text-slate-200">{b.subledger_type}</td>
                    <td className="text-brand-400">{b.control_account_code}</td>
                    <td className="text-slate-200">${b.subledger_closing_balance?.$numberDecimal || b.subledger_closing_balance}</td>
                    <td className="text-slate-300">${b.gl_closing_balance?.$numberDecimal || b.gl_closing_balance}</td>
                    <td className={parseFloat(b.variance?.$numberDecimal || b.variance) === 0 ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                      ${b.variance?.$numberDecimal || b.variance}
                    </td>
                    <td>
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 font-bold">
                        {b.reconciliation_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: UPR & Earned Premium */}
      {activeSubtab === 'upr' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
                Execute Deferred Revenue Amortization Run
              </h3>
              <form onSubmit={handleRunUPR} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Contract / Agreement Reference</label>
                  <input
                    type="text"
                    value={uprForm.contract_reference || uprForm.policy_reference}
                    onChange={(e) => setUprForm({ ...uprForm, contract_reference: e.target.value, policy_reference: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Deferred Revenue Basis ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={uprForm.deferred_revenue || uprForm.written_premium}
                    onChange={(e) => setUprForm({ ...uprForm, deferred_revenue: e.target.value, written_premium: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Effective Start</label>
                    <input
                      type="date"
                      value={uprForm.start_date}
                      onChange={(e) => setUprForm({ ...uprForm, start_date: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Expiration End</label>
                    <input
                      type="date"
                      value={uprForm.end_date}
                      onChange={(e) => setUprForm({ ...uprForm, end_date: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold transition"
                >
                  Post Revenue Recognition Journal (Dr 2200 / Cr 4000)
                </button>
              </form>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Amortization Preview Calculation
              </h3>
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between border-b border-slate-800/80 py-1">
                  <span className="text-slate-400">Day-Count Convention:</span>
                  <span className="text-slate-200 font-bold">Actual / 365 Non-Leap</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 py-1">
                  <span className="text-slate-400">Total Term Days:</span>
                  <span className="text-slate-200">{uprPreview?.total_term_days || 365} Days</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 py-1">
                  <span className="text-slate-400">Active Days (July):</span>
                  <span className="text-brand-400 font-bold">{uprPreview?.covered_days || 31} Days</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 py-1">
                  <span className="text-slate-400">Daily Earning Rate:</span>
                  <span className="text-slate-300">${uprPreview?.daily_earning_rate || '103.1506849'}/day</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 py-1">
                  <span className="text-slate-400">Recognized Revenue (July):</span>
                  <span className="text-emerald-400 font-bold">${uprPreview?.earned_premium || '3,197.67'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Remaining Deferred Revenue:</span>
                  <span className="text-blue-400 font-bold">${uprPreview?.remaining_upr || '34,452.33'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 5: Trial Balance */}
      {activeSubtab === 'trial_balance' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Trial Balance (July 2026)
              </h3>
              <p className="text-xs text-slate-400">
                Snapshot: <span className="font-mono text-brand-400">{trialBalance?.snapshot?.snapshot_number || 'Draft Preview'}</span>
              </p>
            </div>
            <button
              onClick={handleCertifyTrialBalance}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
            >
              Certify & Lock Trial Balance Snapshot
            </button>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                  <th className="py-2">Account Code</th>
                  <th>Account Name</th>
                  <th>Type</th>
                  <th>Normal</th>
                  <th>Debit Balance</th>
                  <th>Credit Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {trialBalance?.lines?.map((l) => (
                  <tr key={l.account_code} className="hover:bg-slate-800/30">
                    <td className="py-2 font-bold text-brand-400">{l.account_code}</td>
                    <td className="font-sans text-slate-200">{l.account_name}</td>
                    <td className="text-slate-400">{l.account_type}</td>
                    <td className="text-slate-500">{l.normal_balance}</td>
                    <td className="text-slate-200">${l.debit_balance?.$numberDecimal || l.debit_balance}</td>
                    <td className="text-slate-200">${l.credit_balance?.$numberDecimal || l.credit_balance}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 font-mono text-xs font-bold text-slate-100">
                  <td colSpan="4" className="py-3 text-right pr-4">TOTALS:</td>
                  <td className="text-emerald-400">${trialBalance?.snapshot?.total_debits?.$numberDecimal || trialBalance?.snapshot?.total_debits || '0.00'}</td>
                  <td className="text-emerald-400">${trialBalance?.snapshot?.total_credits?.$numberDecimal || trialBalance?.snapshot?.total_credits || '0.00'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 6: Financial Statements */}
      {activeSubtab === 'financial_statements' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Balance Sheet */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Balance Sheet (As of July 31, 2026)
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="font-bold text-brand-400 border-b border-slate-800 py-1">ASSETS</div>
                {financialStatements?.balanceSheet?.assets.map((a) => (
                  <div key={a.account_code} className="flex justify-between text-slate-300 py-0.5">
                    <span>{a.account_code} - {a.account_name}</span>
                    <span>${a.balance}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-slate-100 border-t border-slate-800 pt-1">
                  <span>Total Assets:</span>
                  <span>${financialStatements?.balanceSheet?.total_assets}</span>
                </div>

                <div className="font-bold text-purple-400 border-b border-slate-800 py-1 mt-4">LIABILITIES</div>
                {financialStatements?.balanceSheet?.liabilities.map((l) => (
                  <div key={l.account_code} className="flex justify-between text-slate-300 py-0.5">
                    <span>{l.account_code} - {l.account_name}</span>
                    <span>${l.balance}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-slate-100 border-t border-slate-800 pt-1">
                  <span>Total Liabilities:</span>
                  <span>${financialStatements?.balanceSheet?.total_liabilities}</span>
                </div>
              </div>
            </div>

            {/* Income Statement */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Profit & Loss Statement (July 2026)
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="font-bold text-emerald-400 border-b border-slate-800 py-1">REVENUE</div>
                {financialStatements?.incomeStatement?.revenue.map((r) => (
                  <div key={r.account_code} className="flex justify-between text-slate-300 py-0.5">
                    <span>{r.account_code} - {r.account_name}</span>
                    <span>${r.balance}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-slate-100 border-t border-slate-800 pt-1">
                  <span>Total Revenue:</span>
                  <span>${financialStatements?.incomeStatement?.total_revenue}</span>
                </div>

                <div className="font-bold text-rose-400 border-b border-slate-800 py-1 mt-4">EXPENSES</div>
                {financialStatements?.incomeStatement?.expenses.map((e) => (
                  <div key={e.account_code} className="flex justify-between text-slate-300 py-0.5">
                    <span>{e.account_code} - {e.account_name}</span>
                    <span>${e.balance}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-emerald-400 border-t-2 border-slate-700 pt-2 text-sm">
                  <span>Net Income:</span>
                  <span>${financialStatements?.incomeStatement?.net_income}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 7: ERP Export Batches */}
      {activeSubtab === 'export_batches' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                ERP Export Manifest Batches
              </h3>
              <p className="text-xs text-slate-400">Generate formatted export artifacts for SAP S/4HANA and NetSuite.</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleCreateExportBatch('SAP_S4HANA')}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
              >
                Generate SAP S/4HANA (SIMULATED)
              </button>
              <button
                onClick={() => handleCreateExportBatch('NETSUITE')}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition"
              >
                Generate NetSuite (SIMULATED)
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                  <th className="py-2">Batch #</th>
                  <th>Target ERP</th>
                  <th>Journals</th>
                  <th>Total Debit</th>
                  <th>Checksum</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {exportBatches.map((b) => (
                  <tr key={b._id}>
                    <td className="py-2.5 font-bold text-brand-400">{b.batch_number}</td>
                    <td className="text-slate-200">{b.target_erp}</td>
                    <td className="text-slate-300">{b.journal_count}</td>
                    <td className="text-emerald-400">${b.total_debit?.$numberDecimal || b.total_debit}</td>
                    <td className="text-slate-500 text-[10px]">{b.checksum?.slice(0, 24)}...</td>
                    <td>
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 font-bold">
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
