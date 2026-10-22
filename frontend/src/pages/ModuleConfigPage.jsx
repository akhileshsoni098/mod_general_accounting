import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import {
  Sliders,
  Layers,
  Check,
  AlertCircle,
  Building,
  Sparkles,
  Percent,
  CheckCircle2,
  X,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Boxes,
  Receipt,
  ShoppingCart,
  UtensilsCrossed,
  Factory,
  Share2,
  Lock,
  Tags,
  DollarSign,
  RotateCcw,
  Plus,
  Minus,
  AlertTriangle
} from 'lucide-react';

const MODULE_ICONS = {
  GL: Building,
  BANKING_CASH: DollarSign,
  PARTIES: CheckCircle2,
  REPORTS: Receipt,
  INVENTORY: Boxes,
  COMMERCIAL_BILLING: Receipt,
  GST_TAX: Percent,
  RETAIL_POS: ShoppingCart,
  RESTAURANT: UtensilsCrossed,
  HOTEL_PMS: Building,
  MANUFACTURING: Factory,
  FRANCHISE_COMMISSIONS: Share2,
  RULES_ENGINE: Sliders,
  FINANCE_CLOSE: Lock,
  DIMENSIONS: Tags
};

const TEMPLATE_PRESETS = [
  {
    id: 'GENERAL_ACCOUNTING',
    name: 'General Accounting Only (Simple Default)',
    badge: 'Clean Reset',
    isResetPreset: true,
    description: 'Pure general ledger, chart of accounts, party sub-ledgers, banking/contra vouchers, and standard financial reports. (Disables all optional modules in 1 click).',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS']
  },
  {
    id: 'RETAIL_TRADING',
    name: 'Retail & Trading Store',
    badge: 'Retail',
    description: 'General accounting plus inventory stock tracking, commercial trade invoicing, GST, and Retail POS checkout counter.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS']
  },
  {
    id: 'RESTAURANT_CAFE',
    name: 'Restaurant & Cafe',
    badge: 'Hospitality Food',
    description: 'General accounting plus inventory, GST, commercial billing, table management, KOTs, and menu recipes.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RESTAURANT']
  },
  {
    id: 'HOTEL_HOSPITALITY',
    name: 'Hotel & Hospitality Resort',
    badge: 'Lodging',
    description: 'General accounting plus commercial billing, GST, hotel room PMS, guest folios, and restaurant dining.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'COMMERCIAL_BILLING', 'GST_TAX', 'HOTEL_PMS', 'RESTAURANT']
  },
  {
    id: 'MANUFACTURING',
    name: 'Manufacturing & Assembly',
    badge: 'Production',
    description: 'General accounting plus inventory, commercial trade, multi-level BOMs, and work order assembly.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING']
  },
  {
    id: 'FRANCHISE_BUSINESS',
    name: 'Franchise & Commission Sharing',
    badge: 'Franchise',
    description: 'General accounting, commercial trade, POS, and automated franchise commission sharing with Main Hub.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS', 'FRANCHISE_COMMISSIONS']
  }
];

export default function ModuleConfigPage() {
  const { currentCompany, currentWorkspace, reloadProfile } = useAuth();
  const [modulesData, setModulesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingModule, setUpdatingModule] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Preset replacement & safeguard modals
  const [pendingPreset, setPendingPreset] = useState(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [pendingCascade, setPendingCascade] = useState(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Franchise config modal state
  const [franchiseModalOpen, setFranchiseModalOpen] = useState(false);
  const [franchiseLoading, setFranchiseLoading] = useState(false);
  const [franchiseConfig, setFranchiseConfig] = useState({
    is_franchise: true,
    main_hub_party_id: '',
    franchise_share_pct: 70,
    hub_share_pct: 30,
    income_account_code: '4200',
    payable_account_code: '2020',
    settlement_account_code: '1010'
  });
  const [counterparties, setCounterparties] = useState([]);
  const [simulatedAmount, setSimulatedAmount] = useState(200);

  useEffect(() => {
    if (currentCompany?.id) {
      loadCompanyModules();
    }
  }, [currentCompany?.id]);

  async function loadCompanyModules() {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await authApi.getCompanyModules(currentCompany.id);
      if (res.success) {
        setModulesData(res.data);
      }
    } catch (err) {
      console.error('Failed to load company modules:', err);
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  const catalog = modulesData?.modules_catalog || [];
  const activeOptionalModules = catalog.filter(m => !m.is_core && m.is_enabled);
  const activeOptionalCount = activeOptionalModules.length;

  const handleToggleModule = async (moduleKey, currentStatus) => {
    const targetMod = catalog.find(m => m.key === moduleKey);

    // If currently enabled, user is turning it OFF (disabling)
    if (currentStatus) {
      // Check if any currently enabled modules depend on this module
      const activeDependents = catalog.filter(
        m => m.is_enabled && !m.is_core && Array.isArray(m.dependencies) && m.dependencies.includes(moduleKey)
      );

      if (activeDependents.length > 0) {
        setPendingCascade({
          moduleKey,
          targetMod,
          dependentNames: activeDependents.map(d => d.name),
          currentStatus
        });
        return;
      }
    }

    setUpdatingModule(moduleKey);
    setFeedback(null);
    try {
      const res = await authApi.updateCompanyModules(currentCompany.id, {
        module_code: moduleKey,
        is_enabled: !currentStatus,
        auto_resolve_dependencies: !currentStatus
      });
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || `Module ${targetMod?.name || moduleKey} ${!currentStatus ? 'enabled' : 'disabled'} successfully for ${currentCompany.company_name}.`
        });
        await loadCompanyModules();
        await reloadProfile();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setUpdatingModule(null);
    }
  };

  const initiateApplyTemplate = (template) => {
    if (template.id === 'GENERAL_ACCOUNTING') {
      setResetModalOpen(true);
      return;
    }

    const targetModules = template.modules;
    const currentlyEnabledKeys = catalog.filter(m => !m.is_core && m.is_enabled).map(m => m.key);
    const toEnable = targetModules
      .filter(m => !['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS'].includes(m) && !currentlyEnabledKeys.includes(m))
      .map(k => catalog.find(m => m.key === k) || { key: k, name: k });

    const toDisable = currentlyEnabledKeys
      .filter(k => !targetModules.includes(k))
      .map(k => catalog.find(m => m.key === k) || { key: k, name: k });

    const toRetain = targetModules
      .filter(m => !['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS'].includes(m) && currentlyEnabledKeys.includes(m))
      .map(k => catalog.find(m => m.key === k) || { key: k, name: k });

    setPendingPreset({
      template,
      toEnable,
      toDisable,
      toRetain
    });
  };

  const confirmApplyPreset = async () => {
    if (!pendingPreset) return;
    setModalSubmitting(true);
    setFeedback(null);
    try {
      const res = await authApi.updateCompanyModules(currentCompany.id, {
        template_id: pendingPreset.template.id
      });
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || `Applied preset "${pendingPreset.template.name}" successfully.`
        });
        setPendingPreset(null);
        await loadCompanyModules();
        await reloadProfile();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setModalSubmitting(false);
    }
  };

  const confirmResetToCore = async () => {
    setModalSubmitting(true);
    setFeedback(null);
    try {
      const res = await authApi.updateCompanyModules(currentCompany.id, {
        template_id: 'GENERAL_ACCOUNTING'
      });
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || `Reset to Core General Accounting completed! All optional modules are now disabled.`
        });
        setResetModalOpen(false);
        await loadCompanyModules();
        await reloadProfile();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setModalSubmitting(false);
    }
  };

  const confirmCascadeDisable = async () => {
    if (!pendingCascade) return;
    const { moduleKey, targetMod, currentStatus } = pendingCascade;
    setPendingCascade(null);
    setUpdatingModule(moduleKey);
    setFeedback(null);
    try {
      const res = await authApi.updateCompanyModules(currentCompany.id, {
        module_code: moduleKey,
        is_enabled: !currentStatus,
        auto_resolve_dependencies: false
      });
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || `Disabled ${targetMod?.name || moduleKey} and dependent module(s).`
        });
        await loadCompanyModules();
        await reloadProfile();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setUpdatingModule(null);
    }
  };

  const openFranchiseSettings = async () => {
    setFranchiseModalOpen(true);
    setFranchiseLoading(true);
    try {
      const res = await authApi.getCompanyFranchiseConfig(currentCompany.id);
      if (res.success && res.data.config) {
        setFranchiseConfig({
          is_franchise: res.data.config.is_franchise ?? true,
          main_hub_party_id: res.data.config.main_hub_party_id || '',
          franchise_share_pct: res.data.config.franchise_share_pct ?? 70,
          hub_share_pct: res.data.config.hub_share_pct ?? 30,
          income_account_code: res.data.config.income_account_code || '4200',
          payable_account_code: res.data.config.payable_account_code || '2020',
          settlement_account_code: res.data.config.settlement_account_code || '1010'
        });
      }

      // Fetch counterparties to select Main Hub
      const cpRes = await authApi.getCounterparties?.();
      if (cpRes?.success && cpRes.data) {
        setCounterparties(cpRes.data);
      }
    } catch (err) {
      console.warn('Franchise config load note:', err.message);
    } finally {
      setFranchiseLoading(false);
    }
  };

  const handleSaveFranchiseConfig = async (e) => {
    e.preventDefault();
    const fPct = Number(franchiseConfig.franchise_share_pct);
    const hPct = Number(franchiseConfig.hub_share_pct);
    if (fPct + hPct !== 100) {
      alert(`Franchise share (${fPct}%) and Hub share (${hPct}%) must sum to exactly 100%. Current total: ${fPct + hPct}%`);
      return;
    }

    setFranchiseLoading(true);
    try {
      const res = await authApi.updateCompanyFranchiseConfig(currentCompany.id, {
        ...franchiseConfig,
        franchise_share_pct: fPct,
        hub_share_pct: hPct
      });
      if (res.success) {
        setFeedback({
          type: 'success',
          text: `Franchise configuration updated successfully for ${currentCompany.company_name}.`
        });
        setFranchiseModalOpen(false);
        await loadCompanyModules();
        await reloadProfile();
      }
    } catch (err) {
      alert(`Failed to save franchise configuration: ${err.message}`);
    } finally {
      setFranchiseLoading(false);
    }
  };

  if (!currentCompany) {
    return (
      <div className="p-8 text-center text-slate-400">
        <Building className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm">Please select an active company from the top navigation to configure business modules.</p>
      </div>
    );
  }

  const categories = modulesData?.categories || {
    CORE: { key: 'CORE', label: 'Core Accounting' },
    OPERATIONS: { key: 'OPERATIONS', label: 'Commercial Operations' },
    INDUSTRY: { key: 'INDUSTRY', label: 'Industry Workspaces' },
    ADVANCED: { key: 'ADVANCED', label: 'Advanced Capabilities' }
  };

  // Group catalog by category
  const groupedModules = {
    CORE: catalog.filter(m => m.category === 'CORE'),
    OPERATIONS: catalog.filter(m => m.category === 'OPERATIONS'),
    INDUSTRY: catalog.filter(m => m.category === 'INDUSTRY'),
    ADVANCED: catalog.filter(m => m.category === 'ADVANCED')
  };

  // Calculator preview values
  const fPct = Number(franchiseConfig.franchise_share_pct) || 0;
  const hPct = Number(franchiseConfig.hub_share_pct) || 0;
  const simFranchise = (simulatedAmount * (fPct / 100)).toFixed(2);
  const simHub = (simulatedAmount * (hPct / 100)).toFixed(2);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-white flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-brand-400" />
              <span>Business Modules & Capabilities Setup</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/30 font-semibold font-mono">
              Company-Scoped
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configuring operating features for <strong className="text-slate-200">{currentCompany.company_name}</strong> ({currentCompany.company_code}).
            Core accounting is always on; enable only what your business requires.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setResetModalOpen(true)}
            disabled={loading || activeOptionalCount === 0}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
              activeOptionalCount > 0
                ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300'
                : 'bg-slate-800/60 text-slate-500 border-slate-700/60 cursor-not-allowed opacity-60'
            }`}
            title="Disable all optional modules and keep only core general accounting"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span>Reset to Core Only {activeOptionalCount > 0 ? `(${activeOptionalCount} Active)` : ''}</span>
          </button>
          <button
            onClick={openFranchiseSettings}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold transition cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-indigo-400" />
            <span>Franchise Settings</span>
          </button>
          <button
            onClick={loadCompanyModules}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition cursor-pointer"
            title="Refresh module states"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-400'
              : 'bg-rose-950/40 border border-rose-500/40 text-rose-400'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 text-slate-400 hover:text-white rounded transition cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Guidance Banner on How to Disable & Remove Modules */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-start space-x-3.5">
        <HelpCircle className="w-5 h-5 text-brand-400 mt-0.5 shrink-0" />
        <div className="space-y-1 text-xs">
          <div className="font-semibold text-slate-100 flex items-center space-x-2">
            <span>Modules ko Disable ya Remove kaise karein? (How to disable/remove modules)</span>
            {activeOptionalCount > 0 ? (
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
                {activeOptionalCount} optional modules currently active
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                Pure Core General Accounting Active
              </span>
            )}
          </div>
          <div className="text-slate-400 leading-relaxed text-[11px] space-y-0.5">
            <p>
              • <strong>Ek module band karna:</strong> Neeche diye gaye module card par toggle switch click karein. Agar koi doosra module ispe depend karta hai (jaise Inventory par Retail POS), toh dono safely ek saath band ho jayenge.
            </p>
            <p>
              • <strong>Saare optional modules ek saath hatana:</strong> Upar diye gaye <span className="text-rose-400 font-medium">"Reset to Core Only"</span> button par click karein ya pehle preset <strong className="text-slate-200">"General Accounting Only"</strong> ko apply karein.
            </p>
            <p>
              • <strong>Data Surakshit Hai:</strong> Module band karne se aapke puraane vouchers, bills ya ledgers delete nahi hote. Jab chahein dobara chalu kar sakte hain.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Industry Presets */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
            One-Click Business Presets
          </h2>
        </div>
        <p className="text-xs text-slate-400">
          Instantly configure standard capabilities for your industry. You can further customize individual toggles below anytime.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATE_PRESETS.map((tmpl) => (
            <div
              key={tmpl.id}
              className={`border rounded-xl p-4 flex flex-col justify-between transition group ${
                tmpl.isResetPreset
                  ? 'bg-slate-900/90 border-emerald-500/30 hover:border-emerald-500/60'
                  : 'bg-slate-900 border-slate-800 hover:border-brand-500/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                      tmpl.isResetPreset
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-brand-500/10 text-brand-400 border-brand-500/20'
                    }`}
                  >
                    {tmpl.badge}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {tmpl.modules.length} Modules
                  </span>
                </div>
                <h3 className="text-xs font-bold text-white group-hover:text-brand-300 transition">
                  {tmpl.name}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {tmpl.description}
                </p>
              </div>

              <button
                onClick={() => initiateApplyTemplate(tmpl)}
                disabled={loading}
                className={`mt-3.5 w-full flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer border ${
                  tmpl.isResetPreset
                    ? 'bg-emerald-950/40 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-500/40 hover:border-emerald-500'
                    : 'bg-slate-850 hover:bg-brand-600 text-slate-300 hover:text-white border-slate-700 hover:border-brand-500'
                }`}
              >
                {tmpl.isResetPreset ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to General Accounting Only</span>
                  </>
                ) : (
                  <>
                    <span>Apply Preset</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Categorized Module Cards */}
      <div className="space-y-8">
        {Object.entries(categories).map(([catKey, catMeta]) => {
          const list = groupedModules[catKey] || [];
          if (list.length === 0) return null;

          return (
            <div key={catKey} className="space-y-3">
              <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-2">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  {catMeta.label || catKey}
                </span>
                <span className="text-[10px] font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-850 border border-slate-800">
                  {list.length} {list.length === 1 ? 'module' : 'modules'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {list.map((mod) => {
                  const Icon = MODULE_ICONS[mod.key] || Layers;
                  const isCore = mod.is_core;
                  const isEnabled = mod.is_enabled;
                  const isUpdating = updatingModule === mod.key;

                  return (
                    <div
                      key={mod.key}
                      className={`rounded-xl p-4 border transition flex flex-col justify-between ${
                        isEnabled
                          ? 'bg-slate-900/90 border-slate-750 hover:border-slate-650'
                          : 'bg-slate-950/60 border-slate-850 opacity-80 hover:opacity-100 hover:border-slate-750'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center space-x-2.5">
                            <div
                              className={`p-2 rounded-lg ${
                                isEnabled
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-slate-800 text-slate-500 border border-slate-700'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-xs font-bold text-white flex items-center space-x-2">
                                <span>{mod.name}</span>
                                <span className="font-mono text-[10px] text-slate-500 font-normal">
                                  ({mod.key})
                                </span>
                              </h3>
                              <div className="flex items-center space-x-2 mt-0.5">
                                {isCore ? (
                                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    Core (Always Active)
                                  </span>
                                ) : isEnabled ? (
                                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    Active & Enabled
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-500 border border-slate-700">
                                    Disabled
                                  </span>
                                )}

                                {mod.dependencies?.length > 0 && (
                                  <span
                                    className="text-[10px] font-mono text-slate-500"
                                    title={`Requires: ${mod.dependencies.join(', ')}`}
                                  >
                                    Req: {mod.dependencies.join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Toggle or Fixed Core Indicator */}
                          <div>
                            {isCore ? (
                              <div className="p-1 rounded bg-slate-800 text-slate-500" title="Core accounting cannot be disabled">
                                <Lock className="w-4 h-4" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleModule(mod.key, isEnabled)}
                                disabled={isUpdating || loading}
                                title={isEnabled ? `Enabled (click to disable ${mod.name})` : `Disabled (click to enable ${mod.name})`}
                                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
                                  isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                                } ${isUpdating || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                    isEnabled ? 'translate-x-5' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                          {mod.description}
                        </p>
                      </div>

                      {/* Module-Specific Action Footer */}
                      {mod.key === 'FRANCHISE_COMMISSIONS' && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-slate-400">
                            Franchise Split: <strong className="text-brand-300">70% / 30%</strong>
                          </span>
                          <button
                            onClick={openFranchiseSettings}
                            className="text-xs text-brand-400 hover:text-brand-300 font-medium underline cursor-pointer"
                          >
                            Configure Splits & Accounts
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Franchise Commission Configuration Drawer / Modal */}
      {franchiseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Franchise & Commission Sharing Setup</h3>
                  <p className="text-xs text-slate-400">
                    Configure revenue split between <strong className="text-slate-200">{currentCompany.company_name}</strong> and Main Hub
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFranchiseModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFranchiseConfig} className="space-y-4">
              {/* Franchise Status Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-850 rounded-xl border border-slate-750">
                <div>
                  <div className="text-xs font-bold text-white">Operate as a Franchise Entity</div>
                  <div className="text-[11px] text-slate-400">
                    Enables automated split revenue posting to Main Hub on commercial transactions
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={franchiseConfig.is_franchise}
                  onChange={(e) => setFranchiseConfig({ ...franchiseConfig, is_franchise: e.target.checked })}
                  className="w-4 h-4 text-brand-600 rounded bg-slate-800 border-slate-700 focus:ring-brand-500"
                />
              </div>

              {/* Main Hub Party Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Main Hub Counterparty
                </label>
                <select
                  value={franchiseConfig.main_hub_party_id || ''}
                  onChange={(e) => setFranchiseConfig({ ...franchiseConfig, main_hub_party_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-brand-500 font-sans"
                >
                  <option value="">-- Select Main Hub Counterparty --</option>
                  {counterparties.map((cp) => (
                    <option key={cp._id || cp.id} value={cp._id || cp.id}>
                      {cp.legal_name || cp.trade_name} ({cp.party_code || 'Party'})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Assigns the counterparty balance and sub-ledger for Due to Main Hub payable entries.
                </span>
              </div>

              {/* Split Percentages */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-850 rounded-xl border border-slate-750">
                <div>
                  <label className="block text-xs font-semibold text-emerald-400 mb-1">
                    Franchise Store Share %
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={franchiseConfig.franchise_share_pct}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFranchiseConfig({
                          ...franchiseConfig,
                          franchise_share_pct: val,
                          hub_share_pct: Number((100 - val).toFixed(2))
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-indigo-400 mb-1">
                    Main Hub Share %
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={franchiseConfig.hub_share_pct}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFranchiseConfig({
                          ...franchiseConfig,
                          hub_share_pct: val,
                          franchise_share_pct: Number((100 - val).toFixed(2))
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500">%</span>
                  </div>
                </div>
              </div>

              {/* Chart of Accounts Mappings */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  General Ledger Posting Accounts
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Revenue Code</label>
                    <input
                      type="text"
                      required
                      value={franchiseConfig.income_account_code}
                      onChange={(e) => setFranchiseConfig({ ...franchiseConfig, income_account_code: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white font-mono"
                      placeholder="4200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Payable Code</label>
                    <input
                      type="text"
                      required
                      value={franchiseConfig.payable_account_code}
                      onChange={(e) => setFranchiseConfig({ ...franchiseConfig, payable_account_code: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white font-mono"
                      placeholder="2020"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Settlement Code</label>
                    <input
                      type="text"
                      required
                      value={franchiseConfig.settlement_account_code}
                      onChange={(e) => setFranchiseConfig({ ...franchiseConfig, settlement_account_code: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white font-mono"
                      placeholder="1010"
                    />
                  </div>
                </div>
              </div>

              {/* Live Interactive Split Calculator (₹200 Scenario) */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center space-x-1.5">
                    <Percent className="w-3.5 h-3.5 text-brand-400" />
                    <span>Live Split Preview</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] text-slate-500">Test Amount:</span>
                    <input
                      type="number"
                      value={simulatedAmount}
                      onChange={(e) => setSimulatedAmount(parseFloat(e.target.value) || 0)}
                      className="w-20 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-right text-brand-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-800">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Total Transaction</div>
                    <div className="text-xs font-bold font-mono text-white mt-0.5">₹{simulatedAmount.toFixed(2)}</div>
                    <div className="text-[9px] text-slate-500 font-mono">Dr {franchiseConfig.settlement_account_code}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/20">
                    <div className="text-[10px] text-emerald-400">Franchise ({fPct}%)</div>
                    <div className="text-xs font-bold font-mono text-emerald-300 mt-0.5">₹{simFranchise}</div>
                    <div className="text-[9px] text-emerald-500 font-mono">Cr {franchiseConfig.income_account_code}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/20">
                    <div className="text-[10px] text-indigo-400">Main Hub ({hPct}%)</div>
                    <div className="text-xs font-bold font-mono text-indigo-300 mt-0.5">₹{simHub}</div>
                    <div className="text-[9px] text-indigo-500 font-mono">Cr {franchiseConfig.payable_account_code}</div>
                  </div>
                </div>

                <div className="text-[10px] text-center font-mono text-slate-400 pt-1">
                  Balanced Journal Entry: Total Debit (₹{simulatedAmount.toFixed(2)}) = Total Credit (₹{(parseFloat(simFranchise) + parseFloat(simHub)).toFixed(2)}) [Δ = 0.00]
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setFranchiseModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={franchiseLoading}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20 transition cursor-pointer"
                >
                  {franchiseLoading ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. Preset Replacement Confirmation Modal */}
      {pendingPreset && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Apply Preset: {pendingPreset.template.name}</h3>
                  <p className="text-[11px] text-slate-400">
                    Target Company: <strong className="text-slate-200">{currentCompany.company_name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingPreset(null)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-slate-100 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-brand-400" />
                <span>Preset Replacement Semantics</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Applying this preset will <strong>replace</strong> your optional module selection with the standard modules configured for <strong>{pendingPreset.template.name}</strong>. Core general accounting remains permanently active.
              </p>
            </div>

            {/* Modules to Enable (Adding) */}
            {pendingPreset.toEnable.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-emerald-400 flex items-center space-x-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Modules to be Enabled ({pendingPreset.toEnable.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pendingPreset.toEnable.map((m) => (
                    <span
                      key={m.key}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3 shrink-0" />
                      <span>{m.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modules to Disable (Removing) */}
            {pendingPreset.toDisable.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-rose-400 flex items-center space-x-1.5">
                  <Minus className="w-3.5 h-3.5" />
                  <span>Modules to be Disabled ({pendingPreset.toDisable.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pendingPreset.toDisable.map((m) => (
                    <span
                      key={m.key}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30 flex items-center space-x-1"
                    >
                      <Minus className="w-3 h-3 shrink-0" />
                      <span>{m.name}</span>
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500">
                  Note: Disabling these modules will hide their workspace navigation. Historical vouchers, ledgers, and transactions remain completely intact in the database.
                </p>
              </div>
            )}

            {/* Modules Remaining Active */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Modules Remaining Active</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">General Ledger (GL)</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">Banking & Cash</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">Parties & Ledgers</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">Financial Reports</span>
                {pendingPreset.toRetain.map((m) => (
                  <span
                    key={m.key}
                    className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700"
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingPreset(null)}
                disabled={modalSubmitting}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmApplyPreset}
                disabled={modalSubmitting}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20 transition cursor-pointer flex items-center space-x-1.5"
              >
                {modalSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{modalSubmitting ? 'Applying Preset...' : 'Confirm & Replace Configuration'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Reset to Core Accounting Confirmation Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Reset to Core Accounting</h3>
                  <p className="text-[11px] text-slate-400">
                    Company: <strong className="text-slate-200">{currentCompany.company_name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
              <p className="leading-relaxed">
                This action will disable all <strong className="text-white">{activeOptionalCount} optional business modules</strong> (Retail POS, Restaurant, Manufacturing, Inventory, Commercial Trade, Rules Engine, etc.).
              </p>
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>Data Preservation Guarantee:</strong> All posted transactions, journals, vouchers, stock items, and ledger balances remain permanently preserved. You can re-enable modules anytime.
                </span>
              </div>
            </div>

            {activeOptionalModules.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-rose-400">
                  Modules Being Disabled:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeOptionalModules.map((m) => (
                    <span
                      key={m.key}
                      className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-300 border border-rose-500/30"
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-emerald-400">
                Core Accounting Retained (Always Active):
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">General Ledger (GL)</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">Banking & Cash</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">Parties & Ledgers</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">Financial Reports</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={modalSubmitting}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResetToCore}
                disabled={modalSubmitting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition cursor-pointer flex items-center space-x-1.5"
              >
                {modalSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>{modalSubmitting ? 'Resetting...' : 'Confirm Reset to Core Only'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Dependency Cascade Confirmation Modal */}
      {pendingCascade && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Dependency Safeguard</h3>
                  <p className="text-[11px] text-slate-400">
                    Disabling {pendingCascade.targetMod?.name || pendingCascade.moduleKey}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingCascade(null)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p className="leading-relaxed">
                The module <strong className="text-white">{pendingCascade.targetMod?.name || pendingCascade.moduleKey}</strong> has active dependent modules. To preserve system integrity, the following dependent modules will also be safely disabled:
              </p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                {pendingCascade.dependentNames.map((name) => (
                  <div key={name} className="flex items-center space-x-2 text-rose-300 text-xs font-medium">
                    <Minus className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                You can re-enable these modules anytime. Existing transactions and records will remain safely saved in the database.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingCascade(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCascadeDisable}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5"
              >
                <span>Confirm & Disable All</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
