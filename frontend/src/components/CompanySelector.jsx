import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import {
  Building,
  Check,
  ChevronDown,
  Plus,
  X,
  Briefcase,
  Globe,
  Calendar,
  DollarSign,
  AlertCircle
} from 'lucide-react';

const PROFILE_LABELS = {
  GENERAL_RETAIL: { label: 'General Retail', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  HARDWARE: { label: 'Hardware Store', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  GROCERY: { label: 'Grocery / Kirana', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  WHOLESALE_DISTRIBUTION: { label: 'Wholesale / Dist.', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  RESTAURANT_CAFE: { label: 'Restaurant / Cafe', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  PIZZA_QSR: { label: 'Pizza / QSR', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  HOTEL_HOSPITALITY: { label: 'Hotel / Hospitality', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  MANUFACTURING: { label: 'Manufacturing', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  PROFESSIONAL_SERVICES: { label: 'Professional Svcs', color: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
  CUSTOM_OTHER: { label: 'Custom Business', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
};

export default function CompanySelector() {
  const { currentCompany, availableCompanies, switchCompany, createCompany } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const dropdownRef = useRef(null);

  // Form state for creating company
  const [formData, setFormData] = useState({
    company_code: '',
    company_name: '',
    legal_name: '',
    business_profile: 'GENERAL_RETAIL',
    base_currency: 'USD',
    country_code: 'US',
    financial_year_start_month: 4
  });

  // Fetch available business profiles on open
  useEffect(() => {
    async function fetchProfiles() {
      try {
        const res = await authApi.getBusinessProfiles();
        if (res.success && res.data) {
          setProfiles(res.data);
        }
      } catch (err) {
        console.warn('Failed to load business profiles dynamically:', err.message);
      }
    }
    fetchProfiles();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchCompany = async (companyId) => {
    if (companyId === currentCompany?.id) {
      setDropdownOpen(false);
      return;
    }
    setLoading(true);
    try {
      await switchCompany(companyId);
      setDropdownOpen(false);
    } catch (err) {
      alert(`Failed to switch company: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createCompany({
        ...formData,
        financial_year_start_month: Number(formData.financial_year_start_month)
      });
      setModalOpen(false);
      setFormData({
        company_code: '',
        company_name: '',
        legal_name: '',
        business_profile: 'GENERAL_RETAIL',
        base_currency: 'USD',
        country_code: 'US',
        financial_year_start_month: 4
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const profileBadge = PROFILE_LABELS[currentCompany?.business_profile] || {
    label: currentCompany?.business_profile || 'Standard',
    color: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Active Company Selector Button */}
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        disabled={loading}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-xs transition cursor-pointer"
        title="Active Company Context (Scoping all Ledger, Journal, and Operational Data)"
      >
        <Building className="w-3.5 h-3.5 text-indigo-400" />
        <div className="text-left flex items-center space-x-1.5">
          <span className="font-semibold text-slate-200">
            {currentCompany ? currentCompany.company_name : 'No Company Selected'}
          </span>
          {currentCompany && (
            <>
              <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1 py-0.2 rounded">
                [{currentCompany.company_code}]
              </span>
              <span className={`px-1.5 py-0.2 text-[9px] font-mono font-medium rounded border ${profileBadge.color}`}>
                {profileBadge.label}
              </span>
            </>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 ml-1" />
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50">
          <div className="px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Active Companies ({availableCompanies.length})
            </span>
            <button
              onClick={() => {
                setDropdownOpen(false);
                setModalOpen(true);
              }}
              className="flex items-center space-x-1 text-[11px] text-brand-400 hover:text-brand-300 font-medium"
            >
              <Plus className="w-3 h-3" />
              <span>New Company</span>
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {availableCompanies.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-slate-500">
                No active companies found.
              </div>
            ) : (
              availableCompanies.map((c) => {
                const isSelected = currentCompany?.id === c.id;
                const cBadge = PROFILE_LABELS[c.business_profile] || {
                  label: c.business_profile,
                  color: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                };
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSwitchCompany(c.id)}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-brand-950/40 text-white font-medium'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs">{c.company_name}</span>
                        <span className="text-[10px] font-mono text-slate-400">({c.company_code})</span>
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className={`text-[9px] px-1 py-0.2 rounded border ${cBadge.color}`}>
                          {cBadge.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {c.base_currency}
                        </span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-brand-400" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Create Company Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 bg-brand-600 rounded-lg flex items-center justify-center text-white">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Create New Company</h3>
                  <p className="text-[11px] text-slate-400">Initialize Company Ledger, COA & Profile</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Company Code *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. RET01"
                    value={formData.company_code}
                    onChange={(e) => setFormData({ ...formData, company_code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono uppercase focus:outline-none focus:border-brand-500"
                  />
                  <span className="text-[10px] text-slate-500">Unique per tenant</span>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Base Currency *
                  </label>
                  <select
                    value={formData.base_currency}
                    onChange={(e) => setFormData({ ...formData, base_currency: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="USD" className="bg-slate-800 text-white">USD ($)</option>
                    <option value="INR" className="bg-slate-800 text-white">INR (₹)</option>
                    <option value="EUR" className="bg-slate-800 text-white">EUR (€)</option>
                    <option value="GBP" className="bg-slate-800 text-white">GBP (£)</option>
                    <option value="AED" className="bg-slate-800 text-white">AED (AED)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Veridex Downtown Retail"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Legal / Registered Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Veridex Downtown Retail Enterprises LLC"
                  value={formData.legal_name}
                  onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                    Business Profile *
                  </label>
                  <select
                    value={formData.business_profile}
                    onChange={(e) => setFormData({ ...formData, business_profile: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    {profiles.length > 0 ? (
                      profiles.map((p) => {
                        const code = p.id || p.code;
                        const label = p.label || p.name || PROFILE_LABELS[code]?.label || code;
                        return (
                          <option key={code} value={code} className="bg-slate-800 text-white">
                            {label}
                          </option>
                        );
                      })
                    ) : (
                      Object.keys(PROFILE_LABELS).map((code) => (
                        <option key={code} value={code} className="bg-slate-800 text-white">
                          {PROFILE_LABELS[code].label}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                    FY Start Month
                  </label>
                  <select
                    value={formData.financial_year_start_month}
                    onChange={(e) => setFormData({ ...formData, financial_year_start_month: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value={1} className="bg-slate-800 text-white">January (Calendar Year)</option>
                    <option value={4} className="bg-slate-800 text-white">April (Standard India/UK FY)</option>
                    <option value={7} className="bg-slate-800 text-white">July (Standard Australia FY)</option>
                    <option value={10} className="bg-slate-800 text-white">October (US Federal FY)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20 transition disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create & Switch Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
