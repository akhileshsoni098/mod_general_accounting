import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowRight, ArrowLeft, Building, Lock, Mail, User, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function RegisterTenantPage({ onSwitchToLogin }) {
  const { registerTenant } = useAuth();
  const [formData, setFormData] = useState({
    tenant_code: 'LONEPINE_TRUCK',
    tenant_name: 'Lone Pine Trucking Insurance Ecosystem',
    base_currency: 'USD',
    admin_first_name: 'Arturo',
    admin_last_name: 'Gatti',
    admin_email: 'arturo_lonepine@veridex.com',
    admin_password: 'Password123!'
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await registerTenant(formData);
    } catch (err) {
      setErrorMsg(err.message || 'Tenant registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-brand-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Onboard New Tenant Workspace</h1>
              <p className="text-xs text-slate-400 font-medium">Veridex One Multi-Tenant Insurance Finance</p>
            </div>
          </div>
          <button
            onClick={onSwitchToLogin}
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            <span>Back to Login</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-start space-x-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 bg-slate-850 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-3">1. Organization Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tenant Code (Unique ID)</label>
                <input
                  type="text"
                  required
                  name="tenant_code"
                  value={formData.tenant_code}
                  onChange={handleChange}
                  placeholder="e.g. LONEPINE"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Business Tenant Type</label>
                <select
                  name="tenant_type"
                  value={formData.tenant_type || 'ENTERPRISE'}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="ENTERPRISE">Enterprise Trading / General Business</option>
                  <option value="RETAIL">Retail POS & Supermarket Store</option>
                  <option value="HOSPITALITY">Hotel PMS & Restaurant Hospitality</option>
                  <option value="MANUFACTURING">Manufacturing, Assembly & BOM</option>
                  <option value="SERVICES">Professional & Consulting Services</option>
                  <option value="WHOLESALE">Wholesale & Distribution</option>
                  <option value="OTHER">Other Commercial Entity</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Base Currency</label>
                <select
                  name="base_currency"
                  value={formData.base_currency}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                >
                  <option value="USD">USD - United States Dollar</option>
                  <option value="CAD">CAD - Canadian Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-300 mb-1">Legal Company / Tenant Name</label>
                <input
                  type="text"
                  required
                  name="tenant_name"
                  value={formData.tenant_name}
                  onChange={handleChange}
                  placeholder="e.g. Lone Pine Trucking Insurance Ecosystem"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-850 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-3">2. Tenant Administrator</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">First Name</label>
                <input
                  type="text"
                  required
                  name="admin_first_name"
                  value={formData.admin_first_name}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  name="admin_last_name"
                  value={formData.admin_last_name}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Admin Email Address</label>
                <input
                  type="email"
                  required
                  name="admin_email"
                  value={formData.admin_email}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  name="admin_password"
                  value={formData.admin_password}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-brand-900/20 border border-brand-800/40 rounded-lg text-xs text-brand-300 flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-brand-400 shrink-0" />
            <span>
              Onboarding automatically seeds Chart of Accounts, fiscal periods, and configures commercial invoicing, GST tax configurations, and inventory masters with administrative entitlements.
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white font-medium rounded-lg text-sm flex items-center justify-center space-x-2 transition-all shadow-md shadow-brand-600/20 disabled:opacity-50"
          >
            <span>{submitting ? 'Setting Up Workspace...' : 'Complete Registration & Launch Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
