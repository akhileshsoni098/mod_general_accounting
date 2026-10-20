import React, { useState, useEffect } from 'react';
import { platformApi } from '../services/api';
import {
  ShieldAlert,
  Building2,
  Users,
  CreditCard,
  Layers,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  FileText
} from 'lucide-react';

export default function PlatformAdminPage() {
  const [activeTab, setActiveTab] = useState('tenants'); // 'tenants' | 'plans' | 'audit'
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Plan Change Modal
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [newPlanCode, setNewPlanCode] = useState('GROWTH');
  const [showPlanModal, setShowPlanModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [tRes, pRes, aRes] = await Promise.all([
        platformApi.getTenants(),
        platformApi.getPlans(),
        platformApi.getAuditLogs()
      ]);
      setTenants(tRes.data || []);
      setPlans(pRes.data || []);
      setAuditLogs(aRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePlan = async (e) => {
    e.preventDefault();
    try {
      await platformApi.updateTenantPlan(selectedTenant._id, { plan_code: newPlanCode });
      setShowPlanModal(false);
      setSuccess(`Updated plan for tenant ${selectedTenant.name} to ${newPlanCode}.`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (tenant) => {
    const nextStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const reason = window.prompt(`Enter reason to set tenant status to ${nextStatus}:`, 'Administrative action');
    if (!reason) return;

    try {
      await platformApi.updateTenantStatus(tenant._id, { status: nextStatus, reason });
      setSuccess(`Tenant status changed to ${nextStatus}.`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>Platform Super Admin & SaaS Governance</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tenant Lifecycles, Subscription Entitlements, Plan Overrides, and Centralized Platform Audit Logs.
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold">×</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="font-bold">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'tenants' ? 'border-b-2 border-rose-500 text-rose-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Tenant Organizations ({tenants.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'plans' ? 'border-b-2 border-rose-500 text-rose-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Subscription Plans ({plans.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'audit' ? 'border-b-2 border-rose-500 text-rose-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Platform Audit Trail</span>
        </button>
      </div>

      {/* TAB 1: Tenants */}
      {activeTab === 'tenants' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <th className="p-3">Tenant Code</th>
                <th className="p-3">Organization Name</th>
                <th className="p-3">Plan</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Users</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {tenants.map((t) => {
                const sub = t.subscription;
                const planCode = sub?.plan_id?.plan_code || 'STARTER';
                return (
                  <tr key={t._id} className="hover:bg-slate-850/50 transition">
                    <td className="p-3 font-mono font-semibold text-rose-300">{t.tenant_code}</td>
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/30 font-mono text-[11px]">
                        {planCode}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          t.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">{t.user_count || 1}</td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedTenant(t);
                          setShowPlanModal(true);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
                      >
                        Change Plan
                      </button>
                      <button
                        onClick={() => handleToggleStatus(t)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold ${
                          t.status === 'ACTIVE'
                            ? 'bg-rose-950/40 border border-rose-800 text-rose-300 hover:bg-rose-900/60'
                            : 'bg-emerald-950/40 border border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
                        }`}
                      >
                        {t.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: Plans */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-4 gap-4">
          {plans.map((p) => (
            <div key={p._id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-bold text-white">{p.plan_name}</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300">
                  {p.plan_code}
                </span>
              </div>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                ₹{p.price_per_month}
                <span className="text-xs text-slate-500 font-normal"> / mo</span>
              </div>
              <p className="text-xs text-slate-400">{p.description}</p>
              <div className="text-xs space-y-1 pt-2 border-t border-slate-800 text-slate-300 font-mono">
                <div>Max Companies: {p.max_companies}</div>
                <div>Max Users: {p.max_users}</div>
                <div>Max Monthly Vouchers: {p.max_documents_per_month === -1 ? 'Unlimited' : p.max_documents_per_month}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Platform Audit Trail */}
      {activeTab === 'audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <th className="p-3">Timestamp</th>
                <th className="p-3">Actor Email</th>
                <th className="p-3">Action</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-6 text-center text-slate-500">
                    No platform audit events recorded.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log._id}>
                    <td className="p-3 text-slate-400 font-mono">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="p-3 font-medium">{log.actor_email}</td>
                    <td className="p-3 font-mono font-semibold text-rose-300">{log.action}</td>
                    <td className="p-3 text-slate-300 font-mono text-[11px] truncate max-w-xs">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Change Plan Modal */}
      {showPlanModal && selectedTenant && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Upgrade / Change Tenant Plan</h3>
            <p className="text-xs text-slate-400">
              Select target plan for organization <span className="text-white font-semibold">{selectedTenant.name}</span>.
            </p>
            <form onSubmit={handleUpdatePlan} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Subscription Plan</label>
                <select
                  value={newPlanCode}
                  onChange={(e) => setNewPlanCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  {plans.map((p) => (
                    <option key={p.plan_code} value={p.plan_code}>
                      {p.plan_name} (₹{p.price_per_month}/mo)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold"
                >
                  Update Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
