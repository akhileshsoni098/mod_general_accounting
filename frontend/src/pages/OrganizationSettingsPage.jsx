import React, { useState, useEffect } from 'react';
import { settingsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Building2,
  Save,
  CheckCircle,
  AlertCircle,
  X,
  Globe,
  DollarSign,
  Calendar,
  Clock,
  Shield,
  Layers
} from 'lucide-react';

export default function OrganizationSettingsPage() {
  const { currentWorkspace } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    tenant_type: 'ENTERPRISE',
    base_currency: 'INR',
    timezone: 'Asia/Kolkata',
    fiscal_year_start_month: 4
  });

  useEffect(() => {
    loadSettings();
  }, [currentWorkspace?.id]);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const res = await settingsApi.getSettings();
      if (res.success && res.data) {
        setSettings(res.data);
        setFormData({
          name: res.data.name || '',
          tenant_type: res.data.tenant_type || 'MGA',
          base_currency: res.data.base_currency || 'USD',
          timezone: res.data.timezone || 'America/New_York',
          fiscal_year_start_month: res.data.fiscal_year_start_month || 1
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const res = await settingsApi.updateSettings(formData);
      if (res.success) {
        setSuccessMsg('Organization profile and settings updated successfully.');
        setSettings(res.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        Loading organization settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-3 mb-1">
          <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-bold border border-brand-500/20">
            ORGANIZATION
          </span>
          <h2 className="text-xl font-bold text-white tracking-tight">Organization Profile & Settings</h2>
        </div>
        <p className="text-xs text-slate-400">
          Manage entity classification, fiscal reporting period, default functional currency, and operational regional settings for the active workspace.
        </p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
        <div>
          <h3 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-brand-400" />
            <span>Identity & Entity Classification</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Tenant Partition Code (Immutable)
              </label>
              <input
                type="text"
                disabled
                value={settings?.tenant_code || ''}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-400 font-mono cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">System-level database isolation key</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Organization Legal Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-300 block mb-2">
            Subscribing Business Tenant Type *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              onClick={() => setFormData({ ...formData, tenant_type: 'ENTERPRISE' })}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                formData.tenant_type === 'ENTERPRISE'
                  ? 'bg-blue-500/10 border-blue-500/40 text-white shadow-md shadow-blue-500/10'
                  : 'bg-slate-800/40 border-slate-750 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-xs text-blue-400">Commercial Enterprise</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">ENTERPRISE</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                General commercial enterprise: multi-company trading, double-entry GL, GST invoicing, trade receivables/payables, and close reports.
              </p>
            </div>

            <div
              onClick={() => setFormData({ ...formData, tenant_type: 'RETAIL' })}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                formData.tenant_type === 'RETAIL'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-white shadow-md shadow-emerald-500/10'
                  : 'bg-slate-800/40 border-slate-750 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-xs text-emerald-400">Retail & Supermarket</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">RETAIL</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Fast retail operations: POS counter checkout, barcode scanner integration, cashier shift reconciliations, and instant stock deduction.
              </p>
            </div>

            <div
              onClick={() => setFormData({ ...formData, tenant_type: 'HOSPITALITY' })}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                formData.tenant_type === 'HOSPITALITY'
                  ? 'bg-amber-500/10 border-amber-500/40 text-white shadow-md shadow-amber-500/10'
                  : 'bg-slate-800/40 border-slate-750 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-xs text-amber-400">Hospitality & Hotel</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">HOSPITALITY</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Dining and lodging: dining tables, KOT routing, recipe BOM raw material auto-consumption, hotel room reservations, and night audits.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Financial & Regional Parameters</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Functional Base Currency
              </label>
              <select
                value={formData.base_currency}
                onChange={(e) => setFormData({ ...formData, base_currency: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
              >
                <option value="USD">USD ($) - US Dollar</option>
                <option value="CAD">CAD ($) - Canadian Dollar</option>
                <option value="GBP">GBP (£) - British Pound</option>
                <option value="EUR">EUR (€) - Euro</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Fiscal Year Start Month
              </label>
              <select
                value={formData.fiscal_year_start_month}
                onChange={(e) => setFormData({ ...formData, fiscal_year_start_month: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
              >
                <option value={1}>January (Calendar Year)</option>
                <option value={4}>April (Q2 Start)</option>
                <option value={7}>July (Mid-Year)</option>
                <option value={10}>October (Q4 Start)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Primary Operational Timezone
              </label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
              >
                <option value="America/New_York">Eastern Time (US / Canada)</option>
                <option value="America/Chicago">Central Time (US / Canada)</option>
                <option value="America/Denver">Mountain Time (US / Canada)</option>
                <option value="America/Los_Angeles">Pacific Time (US / Canada)</option>
                <option value="UTC">UTC (Universal Coordinated)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 transition shadow-md shadow-brand-500/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save Organization Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
