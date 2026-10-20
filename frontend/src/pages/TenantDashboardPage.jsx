import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardApi } from '../services/api';
import {
  Building2,
  Receipt,
  Landmark,
  Percent,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Clock,
  BookOpen,
  Calendar,
  Users2,
  RefreshCw,
  FileText,
  Shield
} from 'lucide-react';

const TENANT_TYPE_BADGES = {
  CARRIER: { label: 'Underwriting Carrier', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  MGA: { label: 'Managing General Agent', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  BROKER: { label: 'Commercial Broker', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  OTHER: { label: 'Financial Entity', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
};

export default function TenantDashboardPage({ onNavigateTab }) {
  const { currentWorkspace, user, roles } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMetrics();
  }, [currentWorkspace?.id]);

  async function loadMetrics() {
    try {
      setLoading(true);
      setError(null);
      const res = await dashboardApi.getMetrics();
      if (res.success && res.data) {
        setMetrics(res.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const tenantType = metrics?.tenant?.tenant_type || currentWorkspace?.tenant_type || 'MGA';
  const typeBadge = TENANT_TYPE_BADGES[tenantType] || TENANT_TYPE_BADGES.MGA;

  return (
    <div className="space-y-6">
      {/* Workspace Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-8 pointer-events-none">
          <Building2 className="w-48 h-48 text-brand-500" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-xs font-semibold border ${typeBadge.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              <span>{typeBadge.label}</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Code: <span className="text-slate-200 font-semibold">{currentWorkspace?.tenant_code}</span>
            </span>
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight">
            {currentWorkspace?.name}
          </h1>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Tenant-scoped financial ledger, automated billing and receivables, statutory fiduciary trust, carrier settlements, and accounting close.
          </p>

          <div className="flex flex-wrap items-center gap-5 mt-4 pt-4 border-t border-slate-800 text-xs font-mono text-slate-400">
            <div>
              <span className="text-slate-500">Functional Currency:</span>{' '}
              <span className="text-slate-200 font-semibold">{currentWorkspace?.base_currency || 'USD'}</span>
            </div>
            <div>
              <span className="text-slate-500">Fiscal Period:</span>{' '}
              <span className="text-brand-300 font-semibold">
                {metrics?.gl?.current_period ? `${metrics.gl.current_period.period_name} (${metrics.gl.current_period.status})` : 'Active 2026'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Signed In As:</span>{' '}
              <span className="text-slate-200">{user?.first_name} {user?.last_name}</span>
              <span className="text-brand-400 ml-1 font-semibold">({roles.join(', ') || 'Staff'})</span>
            </div>
            <button
              onClick={loadMetrics}
              disabled={loading}
              className="ml-auto text-xs text-brand-400 hover:text-brand-300 flex items-center space-x-1 transition font-sans font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Metrics</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real Financial Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Receivables Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Outstanding Receivables</span>
              <Receipt className="w-4 h-4 text-brand-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              ${metrics?.receivables?.total_outstanding || '0.00'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {metrics?.receivables?.unpaid_invoices_count || 0} unpaid invoices
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('billing_ar')}
            className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-brand-400 hover:text-brand-300 flex items-center justify-between font-semibold"
          >
            <span>Billing & AR Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Operating Cash Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Operating Cash</span>
              <Landmark className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
              ${metrics?.cash?.operating_cash || '0.00'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              GL 1000 Operating Account
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('treasury_bank_rec')}
            className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center justify-between font-semibold"
          >
            <span>Treasury & Bank Rec</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Fiduciary Trust Cash Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Fiduciary Trust Cash</span>
              <Shield className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-blue-400 font-mono mt-1">
              ${metrics?.cash?.fiduciary_trust_cash || '0.00'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              GL 1010 Premium Trust (Texas § 4053)
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('commissions_fiduciary')}
            className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-blue-400 hover:text-blue-300 flex items-center justify-between font-semibold"
          >
            <span>Commissions & Fiduciary</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Carrier Payables Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Carrier Settlements Due</span>
              <Percent className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-purple-400 font-mono mt-1">
              ${metrics?.payables?.carrier_payable_gl || '0.00'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              GL 2010 Due to Carrier
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('commissions_fiduciary')}
            className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-purple-400 hover:text-purple-300 flex items-center justify-between font-semibold"
          >
            <span>Carrier Settlements</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Operational Status & Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* General Ledger Health */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-brand-400" />
              <span>General Ledger Health</span>
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                metrics?.gl?.trial_balance_balanced
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              {metrics?.gl?.trial_balance_balanced ? 'TRIAL BALANCE IN BALANCE' : 'UNBALANCED'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Total Posted Debits:</span>
              <span className="font-mono text-white font-semibold">${metrics?.gl?.total_debits || '0.00'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Total Posted Credits:</span>
              <span className="font-mono text-white font-semibold">${metrics?.gl?.total_credits || '0.00'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Active Ledger Accounts:</span>
              <span className="font-mono text-slate-200">{metrics?.gl?.active_accounts_count || 0} Accounts</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Current Accounting Period:</span>
              <span className="font-mono text-brand-300 font-semibold">
                {metrics?.gl?.current_period ? `${metrics.gl.current_period.period_name} (${metrics.gl.current_period.status})` : 'Open'}
              </span>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('gl')}
            className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition border border-slate-700"
          >
            <span>View Full General Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Treasury & Operations Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
              <Landmark className="w-4 h-4 text-emerald-400" />
              <span>Treasury & Reconciliations</span>
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Total Payments Collected:</span>
              <span className="font-mono text-emerald-400 font-semibold">${metrics?.cash?.total_payments_collected || '0.00'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Unapplied Cash (Suspense 2190):</span>
              <span className="font-mono text-amber-400 font-semibold">${metrics?.cash?.unapplied_cash || '0.00'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Unmatched Bank Statement Lines:</span>
              <span className="font-mono text-slate-200 font-semibold">{metrics?.operations?.unmatched_bank_lines_count || 0}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Registered Business Counterparties:</span>
              <span className="font-mono text-slate-200 font-semibold">{metrics?.operations?.counterparties_count || 0}</span>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('treasury_bank_rec')}
            className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition border border-slate-700"
          >
            <span>Open Bank Reconciliation</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Finance Close Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              <span>Finance Close & Reports</span>
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Pending Carrier Settlements:</span>
              <span className="font-mono text-slate-200 font-semibold">{metrics?.payables?.pending_settlements_count || 0}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Broker Commission Payable:</span>
              <span className="font-mono text-slate-200 font-semibold">${metrics?.payables?.commission_payable_gl || '0.00'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Invoiced YTD Total:</span>
              <span className="font-mono text-slate-200 font-semibold">${metrics?.receivables?.total_invoiced_ytd || '0.00'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Close Subledger Status:</span>
              <span className="font-mono text-emerald-400 font-semibold">Active & Synced</span>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('finance_close')}
            className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition border border-slate-700"
          >
            <span>Explore Finance Close & Reports</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Recent Journal Postings Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
            <FileText className="w-4 h-4 text-brand-400" />
            <span>Recent Double-Entry Journal Postings</span>
          </h3>
          <button
            onClick={() => onNavigateTab('gl')}
            className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center space-x-1"
          >
            <span>View All Journals</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850/80 border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Journal Number</th>
                <th className="px-4 py-3">Posting Date</th>
                <th className="px-4 py-3">Source Module</th>
                <th className="px-4 py-3">Description / Memo</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {metrics?.gl?.recent_journals && metrics.gl.recent_journals.length > 0 ? (
                metrics.gl.recent_journals.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-850/50 transition">
                    <td className="px-4 py-3 font-mono font-semibold text-brand-300">
                      {j.journal_number}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {new Date(j.posting_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {j.source_module}
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={j.memo}>
                      {j.memo}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                      ${j.total_amount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                        {j.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-4 py-6 text-center text-slate-500">
                    No recent journal entries posted in this tenant workspace.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
