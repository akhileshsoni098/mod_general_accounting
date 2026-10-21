import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Sliders, ToggleLeft, ToggleRight, Check, AlertCircle, Info, BookOpen, Layers } from 'lucide-react';

const MODULE_META = {
  GL: {
    name: 'General Ledger (GL)',
    subtitle: 'Chart of Accounts, Double-Entry Journal Engine, Fiscal Accounting Periods & Trial Balance',
    category: 'Core Ledger'
  },
  BILLING_AR: {
    name: 'Billing & Accounts Receivable (AR)',
    subtitle: 'Payment Plans, Installment Schedules, Direct & Agency Invoices, AR Aging',
    category: 'Billing & Cash Inflow'
  },
  COMMISSIONS_FIDUCIARY: {
    name: 'Commissions & Fiduciary Accounting',
    subtitle: 'Producer Agreements, Tier Schedules, Net-to-Gross Splits, Fiduciary Trust Accounts',
    category: 'Commissions & Trust'
  },
  TREASURY_BANK_REC: {
    name: 'Treasury & Bank Reconciliation',
    subtitle: 'Bank Feeds, Multi-Account Cash Positioning, Auto-Matching, Void/Stale Checks',
    category: 'Cash Operations'
  },
  FINANCE_CLOSE: {
    name: 'Finance Close, Period Lock & Reporting',
    subtitle: 'Unearned Premium Reserves (UPR), Close Runbooks, Period Hard Lock, Final Trial Balance',
    category: 'Close & Financial Reports'
  }
};

export default function ModuleConfigPage() {
  const { currentWorkspace, reloadProfile } = useAuth();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    loadModules();
  }, [currentWorkspace]);

  async function loadModules() {
    setLoading(true);
    try {
      const res = await authApi.getModules();
      if (res.success) setModules(res.data);
    } catch (err) {
      console.error('Failed to load modules:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleToggle = async (module_code, currentStatus) => {
    setUpdating({ ...updating, [module_code]: true });
    setFeedback(null);
    try {
      const res = await authApi.updateModule(module_code, !currentStatus);
      if (res.success) {
        setModules(modules.map(m => m.module_code === module_code ? { ...m, is_enabled: !currentStatus } : m));
        setFeedback({
          type: 'success',
          text: `Module ${module_code} ${!currentStatus ? 'enabled' : 'disabled'} for ${currentWorkspace.name}`
        });
        await reloadProfile();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setUpdating({ ...updating, [module_code]: false });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-brand-400" />
            <span>Tenant Module Entitlements & Licensing</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure active financial engines and submodules for <strong className="text-slate-200">{currentWorkspace?.name}</strong>.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-400'
              : 'bg-rose-950/40 border border-rose-500/40 text-rose-400'
          }`}
        >
          {feedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center space-x-2 mb-2 text-xs font-semibold text-brand-400 uppercase tracking-wider">
          <Layers className="w-4 h-4" />
          <span>TallyVeridex Multi-Module SaaS ERP Ecosystem</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Each tenant can license and activate independent submodules or run the unified commercial accounting & inventory suite.
          Disabling an entitlement immediately locks the corresponding subledgers, routes, and API endpoints for non-platform users.
        </p>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">Loading module configurations...</div>
        ) : (
          modules.map((m) => {
            const meta = MODULE_META[m.module_code] || { name: m.module_code, subtitle: '', category: 'Finance Module' };
            const isUpdating = updating[m.module_code];

            return (
              <div
                key={m.module_code}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-brand-400 font-semibold border border-slate-700">
                      {m.module_code}
                    </span>
                    <h3 className="text-sm font-bold text-white">{meta.name}</h3>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-semibold">
                      {meta.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{meta.subtitle}</p>
                </div>

                <div className="flex items-center space-x-4 self-end md:self-center">
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider font-mono ${
                      m.is_enabled ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {m.is_enabled ? 'Licensed & Active' : 'Disabled'}
                  </span>
                  <button
                    onClick={() => handleToggle(m.module_code, m.is_enabled)}
                    disabled={isUpdating}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      m.is_enabled ? 'bg-brand-600' : 'bg-slate-700'
                    } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        m.is_enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
