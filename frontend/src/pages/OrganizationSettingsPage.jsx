import React, { useState, useEffect } from 'react';
import { settingsApi, usTaxApi } from '../services/api';
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
  Layers,
  CalendarDays,
  Info,
  FileText,
  Landmark,
  RefreshCw,
  Plus,
  Check,
  MapPin,
  Database,
  Activity,
  ShieldAlert
} from 'lucide-react';

export default function OrganizationSettingsPage() {
  const { currentWorkspace, currentCompany } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    tenant_type: 'ENTERPRISE',
    base_currency: 'USD',
    timezone: 'America/New_York',
    fiscal_year_start_month: 1
  });

  // Calendar configuration state: 'GREGORIAN' | 'RETAIL_12' | 'RETAIL_13'
  const [calendarChoice, setCalendarChoice] = useState('GREGORIAN');
  const [isLegacyUnconfigured, setIsLegacyUnconfigured] = useState(false);

  const [calendarForm, setCalendarForm] = useState({
    fiscal_year_start_month: 1,
    retail_pattern: 'RETAIL_445',
    anchor_month: 1,
    week_end_day: 'SATURDAY',
    year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
    fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
  });

  // US Tax Profile & Provider State
  const [taxProfile, setTaxProfile] = useState({
    tax_classification: 'C_CORP',
    tax_year_end_month: 12,
    ein_masked: '',
    state_of_incorporation: '',
    profile_status: 'ACTIVE',
    tax_provider: { provider_name: 'MOCK', environment: 'SANDBOX', connection_status: 'NOT_CONFIGURED' }
  });
  const [taxRegistrations, setTaxRegistrations] = useState([]);
  const [nexusReviews, setNexusReviews] = useState([]);
  const [providerHealth, setProviderHealth] = useState(null);
  const [seedSyncStatus, setSeedSyncStatus] = useState(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [savingTax, setSavingTax] = useState(false);
  const [taxMsg, setTaxMsg] = useState(null);
  const [newRegModal, setNewRegModal] = useState(false);
  const [newRegForm, setNewRegForm] = useState({
    jurisdiction_code: 'US-CA',
    tax_type: 'SALES_USE_TAX',
    registration_number: '',
    filing_frequency: 'MONTHLY'
  });

  useEffect(() => {
    loadSettings();
  }, [currentWorkspace?.id, currentCompany?.id]);

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

        // Parse calendar configuration if present
        if (res.data.calendar_config) {
          const cc = res.data.calendar_config;
          setIsLegacyUnconfigured(false);
          if (cc.calendar_type === 'GREGORIAN') {
            setCalendarChoice('GREGORIAN');
          } else if (cc.calendar_type === 'RETAIL_13_PERIOD') {
            setCalendarChoice('RETAIL_13');
          } else {
            setCalendarChoice('RETAIL_12');
          }

          setCalendarForm({
            fiscal_year_start_month: cc.fiscal_year_start_month || 1,
            retail_pattern: cc.calendar_type.startsWith('RETAIL_4') || cc.calendar_type.startsWith('RETAIL_5') ? cc.calendar_type : 'RETAIL_445',
            anchor_month: cc.anchor_month || 1,
            week_end_day: cc.week_end_day || 'SATURDAY',
            year_end_rule: cc.year_end_rule || 'LAST_WEEKDAY_OF_MONTH',
            fifty_three_week_policy: cc.fifty_three_week_policy || 'ADD_TO_LAST_PERIOD'
          });
        } else {
          // Legacy company without explicit calendar record
          setIsLegacyUnconfigured(true);
          setCalendarChoice('GREGORIAN');
          setCalendarForm(prev => ({
            ...prev,
            fiscal_year_start_month: res.data.fiscal_year_start_month || 1
          }));
        }
      }

      await loadUsTaxData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsTaxData() {
    try {
      setTaxLoading(true);
      const [profRes, regRes, nexRes, healthRes, logsRes] = await Promise.allSettled([
        usTaxApi.getProfile(),
        usTaxApi.getRegistrations(),
        usTaxApi.getNexusReviews(),
        usTaxApi.getProviderHealth(),
        usTaxApi.getSyncLogs()
      ]);
      if (profRes.status === 'fulfilled' && profRes.value?.success) {
        setTaxProfile(profRes.value.data);
      }
      if (regRes.status === 'fulfilled' && regRes.value?.success) {
        setTaxRegistrations(regRes.value.data || []);
      }
      if (nexRes.status === 'fulfilled' && nexRes.value?.success) {
        setNexusReviews(nexRes.value.data || []);
      }
      if (healthRes.status === 'fulfilled' && healthRes.value?.success) {
        setProviderHealth(healthRes.value.data);
      }
      if (logsRes.status === 'fulfilled' && logsRes.value?.success) {
        const latest = logsRes.value.data?.[0];
        setSeedSyncStatus(latest || null);
      }
    } catch (err) {
      console.warn('Failed to load US tax data:', err.message);
    } finally {
      setTaxLoading(false);
    }
  }

  async function handleSaveTaxProfile(e) {
    if (e) e.preventDefault();
    try {
      setSavingTax(true);
      setTaxMsg(null);
      const res = await usTaxApi.updateProfile({
        tax_classification: taxProfile.tax_classification,
        tax_year_end_month: Number(taxProfile.tax_year_end_month),
        ein_masked: taxProfile.ein_masked,
        state_of_incorporation: taxProfile.state_of_incorporation,
        profile_status: taxProfile.profile_status
      });
      if (res.success) {
        setTaxProfile(res.data);
        setTaxMsg('US Tax Profile updated successfully.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTax(false);
    }
  }

  async function handleSeedImport(dryRun = true) {
    try {
      setTaxLoading(true);
      setTaxMsg(null);
      const res = dryRun ? await usTaxApi.previewSeedImport() : await usTaxApi.executeSeedImport();
      if (res.success) {
        setTaxMsg(res.data.message || (dryRun ? 'Dry run preview completed' : 'Seed import completed'));
        const logsRes = await usTaxApi.getSyncLogs();
        if (logsRes.success && logsRes.data?.length > 0) {
          setSeedSyncStatus(logsRes.data[0]);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTaxLoading(false);
    }
  }

  async function handleCreateRegistration(e) {
    e.preventDefault();
    try {
      setTaxLoading(true);
      const jurisRes = await usTaxApi.getJurisdictionDetail(newRegForm.jurisdiction_code);
      if (!jurisRes.success || !jurisRes.data) {
        throw new Error(`Jurisdiction ${newRegForm.jurisdiction_code} not found. Ensure seed data is imported.`);
      }
      const res = await usTaxApi.createRegistration({
        jurisdiction_id: jurisRes.data._id,
        tax_type: newRegForm.tax_type,
        registration_number: newRegForm.registration_number,
        filing_frequency: newRegForm.filing_frequency
      });
      if (res.success) {
        setNewRegModal(false);
        setNewRegForm({ jurisdiction_code: 'US-CA', tax_type: 'SALES_USE_TAX', registration_number: '', filing_frequency: 'MONTHLY' });
        const regRes = await usTaxApi.getRegistrations();
        if (regRes.success) setTaxRegistrations(regRes.data || []);
        setTaxMsg('State tax registration created successfully.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTaxLoading(false);
    }
  }

  async function handleUpdateNexus(jurisdictionCode, status, notes = '') {
    try {
      setTaxLoading(true);
      const jurisRes = await usTaxApi.getJurisdictionDetail(jurisdictionCode);
      if (!jurisRes.success || !jurisRes.data) {
        throw new Error(`Jurisdiction ${jurisdictionCode} not found`);
      }
      await usTaxApi.upsertNexusReview({
        jurisdiction_id: jurisRes.data._id,
        review_status: status,
        decision_notes: notes || `Nexus review updated to ${status}`
      });
      const nexRes = await usTaxApi.getNexusReviews();
      if (nexRes.success) setNexusReviews(nexRes.data || []);
      setTaxMsg(`Nexus review for ${jurisdictionCode} updated to ${status}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setTaxLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      // Build unified calendar_config payload
      let calendarConfigPayload = null;
      if (calendarChoice === 'GREGORIAN') {
        calendarConfigPayload = {
          calendar_type: 'GREGORIAN',
          fiscal_year_start_month: Number(calendarForm.fiscal_year_start_month),
          year_end_rule: 'CALENDAR_MONTH_END'
        };
      } else if (calendarChoice === 'RETAIL_12') {
        calendarConfigPayload = {
          calendar_type: calendarForm.retail_pattern,
          anchor_month: Number(calendarForm.anchor_month),
          week_end_day: calendarForm.week_end_day,
          year_end_rule: calendarForm.year_end_rule,
          fifty_three_week_policy: calendarForm.fifty_three_week_policy
        };
      } else if (calendarChoice === 'RETAIL_13') {
        calendarConfigPayload = {
          calendar_type: 'RETAIL_13_PERIOD',
          anchor_month: Number(calendarForm.anchor_month),
          week_end_day: calendarForm.week_end_day,
          year_end_rule: calendarForm.year_end_rule,
          fifty_three_week_policy: calendarForm.fifty_three_week_policy
        };
      }

      const payload = {
        ...formData,
        calendar_config: calendarConfigPayload
      };

      const res = await settingsApi.updateSettings(payload);
      if (res.success) {
        setSuccessMsg('Organization profile and accounting calendar updated successfully.');
        setSettings(res.data);
        setIsLegacyUnconfigured(false);
        await loadSettings();
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

  const activeCompanyName = currentCompany?.company_name || settings?.active_company?.company_name || 'Main Company';
  const activeCompanyCode = currentCompany?.company_code || settings?.active_company?.company_code || 'DEFAULT';

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
          Manage entity classification, fiscal reporting calendar, default functional currency, and operational regional settings for the active workspace.
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
        {/* Section 1: Identity & Entity Classification */}
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

        {/* Section 1b: Active Company Industry & Operating Model Setup */}
        {settings?.active_company && (
          <div className="pt-4 border-t border-slate-800">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-brand-400" />
              <span>Active Company Operating Profile ({settings.active_company.company_name})</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">Industry Classification</span>
                <span className="text-xs font-bold text-white">{settings.active_company.industry_code || 'GENERAL_TRADING'}</span>
                {settings.active_company.industry_subcategory && (
                  <span className="text-[11px] text-slate-400 block mt-0.5">{settings.active_company.industry_subcategory}</span>
                )}
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">Operating Models</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(settings.active_company.operating_models || ['BUY_AND_RESELL']).map(m => (
                    <span key={m} className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-mono text-[9px] border border-brand-500/30">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">Inventory Tracking Mode</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  {settings.active_company.inventory_policies?.tracking_mode || 'STANDARD'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Costing: {settings.active_company.inventory_policies?.default_costing_method || 'MOVING_AVERAGE'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Section 2: Business Tenant Type */}
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

        {/* Section 3: Financial & Regional Parameters */}
        <div className="pt-4 border-t border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Financial & Regional Parameters</span>
            </h3>
            <div className="text-[11px] text-slate-400 bg-slate-850 px-2.5 py-1 rounded border border-slate-750 flex items-center space-x-1.5">
              <span>Active Company:</span>
              <span className="font-semibold text-white">{activeCompanyName}</span>
              <span className="font-mono text-slate-400">({activeCompanyCode})</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <option value="INR">INR (₹) - Indian Rupee</option>
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
                <option value="Asia/Kolkata">India Standard Time (Asia/Kolkata)</option>
              </select>
            </div>
          </div>

          {/* Section 4: Accounting Calendar Configuration */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 bg-slate-950/40 p-4 rounded-xl border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <CalendarDays className="w-4 h-4 text-brand-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Accounting Calendar Configuration
                </h4>
              </div>
              {isLegacyUnconfigured ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Legacy / Unconfigured
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  {calendarChoice} Configured
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              Select the accounting calendar pattern used to structure financial periods, period-close cycles, and reporting quarters for <strong className="text-slate-200">{activeCompanyName}</strong>.
            </p>

            {/* Three Configuration Choices */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {/* Option A: Gregorian */}
              <div
                onClick={() => {
                  setCalendarChoice('GREGORIAN');
                  setIsLegacyUnconfigured(false);
                }}
                className={`p-3.5 rounded-lg border cursor-pointer transition ${
                  calendarChoice === 'GREGORIAN'
                    ? 'bg-brand-500/10 border-brand-500/40 text-white shadow-sm shadow-brand-500/10'
                    : 'bg-slate-850 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-brand-400">A. Gregorian</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">12 M</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-200 mb-1">12 Monthly Periods</div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Standard Gregorian monthly calendar with configurable fiscal year start month.
                </p>
              </div>

              {/* Option B: Retail 12 Periods */}
              <div
                onClick={() => {
                  setCalendarChoice('RETAIL_12');
                  setIsLegacyUnconfigured(false);
                }}
                className={`p-3.5 rounded-lg border cursor-pointer transition ${
                  calendarChoice === 'RETAIL_12'
                    ? 'bg-brand-500/10 border-brand-500/40 text-white shadow-sm shadow-brand-500/10'
                    : 'bg-slate-850 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-brand-400">B. Retail 12-Period</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">4-4-5</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-200 mb-1">4-4-5 / 4-5-4 / 5-4-4</div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  National Retail Federation (NRF) week-based accounting with 53-week leap year handling.
                </p>
              </div>

              {/* Option C: Retail 13 Periods */}
              <div
                onClick={() => {
                  setCalendarChoice('RETAIL_13');
                  setIsLegacyUnconfigured(false);
                }}
                className={`p-3.5 rounded-lg border cursor-pointer transition ${
                  calendarChoice === 'RETAIL_13'
                    ? 'bg-brand-500/10 border-brand-500/40 text-white shadow-sm shadow-brand-500/10'
                    : 'bg-slate-850 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-brand-400">C. Retail 13-Period</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">13 x 4W</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-200 mb-1">13 Four-Week Periods</div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Even 4-week periods for consistent comparative operations, payroll, and food services.
                </p>
              </div>
            </div>

            {/* Conditional Form Fields */}
            {calendarChoice === 'GREGORIAN' && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-semibold text-slate-200">Gregorian Calendar Settings</span>
                  <span className="text-[10px] text-slate-400">12 Monthly Periods</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Fiscal Year Start Month *
                    </label>
                    <select
                      value={calendarForm.fiscal_year_start_month}
                      onChange={(e) => {
                        const m = Number(e.target.value);
                        setCalendarForm({ ...calendarForm, fiscal_year_start_month: m });
                        setFormData({ ...formData, fiscal_year_start_month: m });
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value={1}>January (Calendar Year: Jan 1 - Dec 31)</option>
                      <option value={2}>February (Retail Conventional: Feb 1 - Jan 31)</option>
                      <option value={4}>April (Standard India / UK: Apr 1 - Mar 31)</option>
                      <option value={7}>July (Australian / Mid-Year: Jul 1 - Jun 30)</option>
                      <option value={10}>October (US Federal Fiscal Year: Oct 1 - Sep 30)</option>
                    </select>
                  </div>
                  <div className="bg-slate-850 rounded-lg p-3 border border-slate-800 flex items-start space-x-2">
                    <Info className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Gregorian periods span from the 1st of each month to the last calendar day (28/29, 30, or 31). Leap years automatically handle Feb 29.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {calendarChoice === 'RETAIL_12' && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-semibold text-slate-200">Retail 12-Period Pattern Settings</span>
                  <span className="text-[10px] text-slate-400">52 / 53 Weeks Per Year</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Retail Week Pattern</label>
                    <select
                      value={calendarForm.retail_pattern}
                      onChange={(e) => setCalendarForm({ ...calendarForm, retail_pattern: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="RETAIL_445">4-4-5 (4, 4, 5 Weeks per Quarter)</option>
                      <option value="RETAIL_454">4-5-4 (4, 5, 4 Weeks per Quarter)</option>
                      <option value="RETAIL_544">5-4-4 (5, 4, 4 Weeks per Quarter)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Fiscal Year Anchor Month</label>
                    <select
                      value={calendarForm.anchor_month}
                      onChange={(e) => setCalendarForm({ ...calendarForm, anchor_month: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value={1}>January (NRF Standard)</option>
                      <option value={12}>December (Calendar End)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Week-Ending Day</label>
                    <select
                      value={calendarForm.week_end_day}
                      onChange={(e) => setCalendarForm({ ...calendarForm, week_end_day: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="SATURDAY">Saturday (Sunday - Saturday)</option>
                      <option value="SUNDAY">Sunday (Monday - Sunday)</option>
                      <option value="FRIDAY">Friday (Saturday - Friday)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Year-End Anchor Rule</label>
                    <select
                      value={calendarForm.year_end_rule}
                      onChange={(e) => setCalendarForm({ ...calendarForm, year_end_rule: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="LAST_WEEKDAY_OF_MONTH">Last Weekday of Anchor Month (NRF Standard)</option>
                      <option value="CLOSEST_WEEKDAY_TO_MONTH_END">Closest Weekday to Month-End</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">53-Week Leap Year Policy</label>
                    <select
                      value={calendarForm.fifty_three_week_policy}
                      onChange={(e) => setCalendarForm({ ...calendarForm, fifty_three_week_policy: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="ADD_TO_LAST_PERIOD">Add Extra Week to Period 12 (6 Weeks in P12)</option>
                      <option value="ADD_AS_EXTRA_PERIOD">Create Standalone Period 13 (1 Week)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {calendarChoice === 'RETAIL_13' && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-semibold text-slate-200">13-Period Retail Calendar Settings</span>
                  <span className="text-[10px] text-slate-400">13 Periods of Exactly 4 Weeks</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Fiscal Year Anchor Month</label>
                    <select
                      value={calendarForm.anchor_month}
                      onChange={(e) => setCalendarForm({ ...calendarForm, anchor_month: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value={1}>January (NRF Standard)</option>
                      <option value={12}>December (Calendar End)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Week-Ending Day</label>
                    <select
                      value={calendarForm.week_end_day}
                      onChange={(e) => setCalendarForm({ ...calendarForm, week_end_day: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="SATURDAY">Saturday (Sunday - Saturday)</option>
                      <option value="SUNDAY">Sunday (Monday - Sunday)</option>
                      <option value="FRIDAY">Friday (Saturday - Friday)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">53-Week Leap Policy</label>
                    <select
                      value={calendarForm.fifty_three_week_policy}
                      onChange={(e) => setCalendarForm({ ...calendarForm, fifty_three_week_policy: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="ADD_TO_LAST_PERIOD">Add Extra Week to Period 13 (5 Weeks in P13)</option>
                      <option value="ADD_AS_EXTRA_PERIOD">Create Standalone Period 14 (1 Week)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Year-End Anchor Rule</label>
                  <select
                    value={calendarForm.year_end_rule}
                    onChange={(e) => setCalendarForm({ ...calendarForm, year_end_rule: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="LAST_WEEKDAY_OF_MONTH">Last Weekday of Anchor Month (NRF Standard)</option>
                    <option value="CLOSEST_WEEKDAY_TO_MONTH_END">Closest Weekday to Month-End</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: US Tax Profile & Data Configuration */}
          <div className="mt-6 pt-5 border-t border-slate-800 bg-slate-950/40 p-5 rounded-xl border border-slate-800/80 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    US Tax Profile & Jurisdiction Architecture
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Entity classification, external tax engine status, master seed datasets, and nexus tracking.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Company: {activeCompanyName}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  taxProfile.profile_status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {taxProfile.profile_status}
                </span>
              </div>
            </div>

            {taxMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
                <span>{taxMsg}</span>
                <button type="button" onClick={() => setTaxMsg(null)} className="text-emerald-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Grid: Tax Profile & Tax Provider Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Box 1: US Tax Profile */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-brand-400" />
                    <span>Company Tax Classification</span>
                  </span>
                  <span className="text-[10px] text-slate-400">IRS / State Tax Entity</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                      Tax Classification *
                    </label>
                    <select
                      value={taxProfile.tax_classification}
                      onChange={(e) => setTaxProfile({ ...taxProfile, tax_classification: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="C_CORP">C-Corporation (Form 1120)</option>
                      <option value="S_CORP">S-Corporation (Form 1120-S)</option>
                      <option value="LLC_DISREGARDED">LLC - Single Member (Disregarded Entity)</option>
                      <option value="LLC_PARTNERSHIP">LLC - Multi Member (Partnership)</option>
                      <option value="LLC_C_CORP">LLC - Taxed as C-Corp</option>
                      <option value="LLC_S_CORP">LLC - Taxed as S-Corp</option>
                      <option value="PARTNERSHIP">General / Limited Partnership (Form 1065)</option>
                      <option value="SOLE_PROPRIETORSHIP">Sole Proprietorship (Schedule C)</option>
                      <option value="TAX_EXEMPT_501C">Tax-Exempt 501(c)(3) Non-Profit</option>
                      <option value="INDIVIDUAL">Individual / Contractor</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                      Tax Year-End Month *
                    </label>
                    <select
                      value={taxProfile.tax_year_end_month}
                      onChange={(e) => setTaxProfile({ ...taxProfile, tax_year_end_month: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value={12}>December (Standard Calendar Year)</option>
                      <option value={1}>January (NRF Retail Anchor)</option>
                      <option value={3}>March</option>
                      <option value={6}>June</option>
                      <option value={9}>September (Federal Govt Anchor)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                      Federal EIN (Masked)
                    </label>
                    <input
                      type="text"
                      placeholder="XX-XXX1234 or 12-3456789"
                      value={taxProfile.ein_masked}
                      onChange={(e) => setTaxProfile({ ...taxProfile, ein_masked: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                    <span className="text-[10px] text-slate-500">Stored masked for security compliance</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                      State of Incorporation
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="e.g. DE, CA, WY"
                      value={taxProfile.state_of_incorporation}
                      onChange={(e) => setTaxProfile({ ...taxProfile, state_of_incorporation: e.target.value.toUpperCase() })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={savingTax}
                    onClick={handleSaveTaxProfile}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium border border-slate-700 flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingTax ? 'Saving Profile...' : 'Save Tax Profile'}</span>
                  </button>
                </div>
              </div>

              {/* Box 2: Tax Provider Adapter Architecture */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                      <Activity className="w-3.5 h-3.5 text-brand-400" />
                      <span>External Tax Engine Architecture</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                      Pluggable Adapter
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block uppercase font-mono">Configured Provider</span>
                      <span className="font-semibold text-slate-200">
                        {taxProfile.tax_provider?.provider_name || 'MOCK (Sandbox Adapter)'}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block uppercase font-mono">Environment</span>
                      <span className="font-semibold text-slate-200">
                        {taxProfile.tax_provider?.environment || 'SANDBOX'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed">
                    <div className="flex items-start space-x-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Production Safety Guard Active:</strong> Real commercial transactions cannot be calculated using synthetic rates. Pluggable adapters for Avalara, TaxJar, or Vertex can be attached without rewriting accounting models.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center space-x-1.5">
                    <span className={`w-2 h-2 rounded-full ${providerHealth?.status === 'CONNECTED' ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                    <span>{providerHealth?.status === 'CONNECTED' ? `Online (${providerHealth.latencyMs}ms)` : 'Provider Standby'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await usTaxApi.getProviderHealth();
                      if (res.success) setProviderHealth(res.data);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium border border-slate-700 flex items-center space-x-1.5 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Ping Adapter</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Box 3: Master Jurisdiction Seed Data & Import */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Database className="w-3.5 h-3.5 text-brand-400" />
                  <span>US Jurisdiction Reference Seed Data (Versioned FIPS & Census Registry)</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Dataset v2024.1.0
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-mono">Federal & States</span>
                  <span className="font-bold text-white text-sm">51 Records</span>
                  <span className="text-[10px] text-slate-500 block">50 States + DC</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-mono">US Territories</span>
                  <span className="font-bold text-white text-sm">5 Records</span>
                  <span className="text-[10px] text-slate-500 block">PR, VI, GU, AS, MP</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-mono">Sample Counties</span>
                  <span className="font-bold text-white text-sm">7 Records</span>
                  <span className="text-[10px] text-slate-500 block">CA, IL, TX, FL, NY, WA</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-mono">Tax Categories</span>
                  <span className="font-bold text-white text-sm">8 Standards</span>
                  <span className="text-[10px] text-slate-500 block">TPP, SaaS, Grocery, etc.</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-mono">
                  {seedSyncStatus ? (
                    <span>Last Synced: {new Date(seedSyncStatus.started_at).toLocaleString()} ({seedSyncStatus.summary?.inserted || 0} inserted, {seedSyncStatus.summary?.updated || 0} updated)</span>
                  ) : (
                    <span>No seed imports recorded yet for this instance.</span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={taxLoading}
                    onClick={() => handleSeedImport(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium border border-slate-700 flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <span>Dry-Run Preview</span>
                  </button>
                  <button
                    type="button"
                    disabled={taxLoading}
                    onClick={() => handleSeedImport(false)}
                    className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20 flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Import Master Jurisdictions</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Box 4: State Tax Registrations & Nexus Reviews */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Registrations List */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                    <Shield className="w-3.5 h-3.5 text-brand-400" />
                    <span>State Tax Registrations ({taxRegistrations.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewRegModal(true)}
                    className="flex items-center space-x-1 text-[11px] text-brand-400 hover:text-brand-300 font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Permit</span>
                  </button>
                </div>

                {taxRegistrations.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No active state sales tax permits registered yet for {activeCompanyName}.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {taxRegistrations.map((reg) => (
                      <div key={reg._id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white flex items-center space-x-2">
                            <span>{reg.jurisdiction_id?.jurisdiction_name || 'Jurisdiction'}</span>
                            <span className="font-mono text-[10px] text-slate-400">({reg.tax_type})</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Permit: {reg.registration_number} • Freq: {reg.filing_frequency}
                          </div>
                        </div>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {reg.registration_status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Nexus Reviews List */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-brand-400" />
                    <span>Nexus Determination & Review ({nexusReviews.length})</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Wayfair & Physical Nexus</span>
                </div>

                {nexusReviews.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No nexus review records registered yet. Use quick action to track state nexus.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {nexusReviews.map((nex) => (
                      <div key={nex._id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white flex items-center space-x-2">
                            <span>{nex.jurisdiction_id?.jurisdiction_name || 'State'}</span>
                            <span className="font-mono text-[10px] text-slate-400">({nex.nexus_type})</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {nex.decision_notes || 'Nexus review recorded'}
                          </div>
                        </div>
                        <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                          nex.review_status === 'CONFIRMED_BY_REVIEWER' || nex.review_status === 'REGISTRATION_COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : nex.review_status === 'REGISTRATION_REQUIRED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {nex.review_status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Add Registration Modal */}
            {newRegModal && (
              <div className="p-4 rounded-xl bg-slate-900 border border-brand-500/40 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-white">Add New State Sales Tax Registration</span>
                  <button type="button" onClick={() => setNewRegModal(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">State Code *</label>
                    <select
                      value={newRegForm.jurisdiction_code}
                      onChange={(e) => setNewRegForm({ ...newRegForm, jurisdiction_code: e.target.value })}
                      className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="US-CA">US-CA (California)</option>
                      <option value="US-NY">US-NY (New York)</option>
                      <option value="US-TX">US-TX (Texas)</option>
                      <option value="US-FL">US-FL (Florida)</option>
                      <option value="US-IL">US-IL (Illinois)</option>
                      <option value="US-WA">US-WA (Washington)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Tax Type *</label>
                    <select
                      value={newRegForm.tax_type}
                      onChange={(e) => setNewRegForm({ ...newRegForm, tax_type: e.target.value })}
                      className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="SALES_USE_TAX">Sales & Use Tax</option>
                      <option value="SELLER_USE_TAX">Seller's Use Tax</option>
                      <option value="GROSS_RECEIPTS_TAX">Gross Receipts Tax</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Permit / Account # *</label>
                    <input
                      type="text"
                      placeholder="e.g. SR-102934812"
                      value={newRegForm.registration_number}
                      onChange={(e) => setNewRegForm({ ...newRegForm, registration_number: e.target.value })}
                      className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Filing Frequency *</label>
                    <select
                      value={newRegForm.filing_frequency}
                      onChange={(e) => setNewRegForm({ ...newRegForm, filing_frequency: e.target.value })}
                      className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="QUARTERLY">Quarterly</option>
                      <option value="ANNUALLY">Annually</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setNewRegModal(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateRegistration}
                    className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold"
                  >
                    Save Registration
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 transition shadow-md shadow-brand-500/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save Organization & Calendar Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
