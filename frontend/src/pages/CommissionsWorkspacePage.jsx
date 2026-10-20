import React, { useState, useEffect } from 'react';
import {
  FileText,
  DollarSign,
  Layers,
  ArrowRightLeft,
  Building,
  Table,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Send,
  Download,
  ShieldCheck,
  ChevronRight,
  Sliders,
  Tags,
  Sparkles
} from 'lucide-react';
import { commissionsApi, rulesApi, dimensionsApi, billingApi } from '../services/api';

export default function CommissionsWorkspacePage() {
  const [activeSubtab, setActiveSubtab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Data states
  const [overview, setOverview] = useState(null);
  const [agreements, setAgreements] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [profitSchedules, setProfitSchedules] = useState([]);
  const [splits, setSplits] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [fiduciaryAccounts, setFiduciaryAccounts] = useState([]);
  const [publishedSweepRules, setPublishedSweepRules] = useState([]);
  const [selectedSweepRuleId, setSelectedSweepRuleId] = useState('');
  const [bordereauDefinitions, setBordereauDefinitions] = useState([]);
  const [bordereauRuns, setBordereauRuns] = useState([]);
  const [selectedRunLines, setSelectedRunLines] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [chainPreview, setChainPreview] = useState(null);

  // Forms & Modal states
  const [newAgreement, setNewAgreement] = useState({
    agreement_code: 'AGR-SUMMIT-HARBOR',
    name: 'Summit Mutual MGA Agreement',
    contract_reference: 'SUMMIT-2026',
    payer_party_id: 'CARRIER-SUMMIT',
    payer_party_name: 'Summit Mutual',
    payee_party_id: 'MGA-HARBOR',
    payee_party_name: 'Harbor Underwriting MGA',
    agreement_type: 'CARRIER_TO_MGA',
    effective_from: '2026-01-01'
  });

  const [sweepForm, setSweepForm] = useState({
    fiduciary_account_id: '',
    amount: '3765.00',
    notes: 'Texas § 4053 MGA Earned Commission Sweep'
  });

  const [settlementForm, setSettlementForm] = useState({
    fiduciary_account_id: '',
    carrier_party_id: 'CARRIER-SUMMIT'
  });

  // Dynamic Commission & Carrier Share Allocation State (Step 1.3)
  const [allocating, setAllocating] = useState(false);
  const [dimensionContext, setDimensionContext] = useState(null);
  const [invoicesList, setInvoicesList] = useState([]);
  const [showAdvancedDimensions, setShowAdvancedDimensions] = useState(false);
  const [allocationForm, setAllocationForm] = useState({
    policy_reference: 'POL-TX-8821',
    invoice_reference: 'INV-2026-00001',
    installment_premium: 9412.50,
    carrier_id: '',
    carrier_name: '',
    broker_id: '',
    broker_name: '',
    carrier_rate: 80.0,
    broker_rate: 10.0,
    mga_rate: 10.0,
    cost_center: 'CC-OPS',
    company_code: 'COMP-001',
    custom_dimension_key: '',
    custom_dimension_value: ''
  });

  // Dynamic Bordereau & Carrier Communication State (Subtab 8)
  const [transmittingRunId, setTransmittingRunId] = useState(null);
  const [bordereauForm, setBordereauForm] = useState({
    carrier_id: 'CARRIER-SUMMIT',
    carrier_name: 'Summit Mutual Insurance Company',
    reporting_period: '2026-07',
    risk_state: 'TX',
    line_of_business: 'COMMERCIAL_AUTO',
    reporting_frequency: 'MONTHLY',
    transmission_protocol: 'ACORD_XML_EDI'
  });

  const handleAllocateShares = async () => {
    try {
      setAllocating(true);
      setError(null);

      const customDims = {};
      if (allocationForm.cost_center) customDims.cost_center = allocationForm.cost_center;
      if (allocationForm.company_code) customDims.company_code = allocationForm.company_code;
      if (allocationForm.custom_dimension_key && allocationForm.custom_dimension_value) {
        customDims[allocationForm.custom_dimension_key.trim()] = allocationForm.custom_dimension_value.trim();
      }

      const payload = {
        policy_reference: allocationForm.policy_reference,
        invoice_reference: allocationForm.invoice_reference,
        installment_premium: parseFloat(allocationForm.installment_premium) || 9412.50,
        carrier_id: allocationForm.carrier_id || undefined,
        carrier_name: allocationForm.carrier_name || undefined,
        broker_id: allocationForm.broker_id || undefined,
        broker_name: allocationForm.broker_name || undefined,
        carrier_rate: parseFloat(allocationForm.carrier_rate) || 80.0,
        broker_rate: parseFloat(allocationForm.broker_rate) || 10.0,
        mga_rate: parseFloat(allocationForm.mga_rate) || 10.0,
        cost_center: allocationForm.cost_center || 'CC-OPS',
        company_code: allocationForm.company_code || 'COMP-001',
        dimensions: customDims
      };

      const res = await commissionsApi.allocateShares(payload);
      setSuccessMsg(res.message || 'Commission & Carrier Share allocated successfully to General Ledger!');
      loadSubtabData('fiduciary');
    } catch (err) {
      setError(err.message);
    } finally {
      setAllocating(false);
    }
  };

  // Load Overview Data
  const loadOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await commissionsApi.getOverview();
      setOverview(res.data);
      const chainRes = await commissionsApi.previewChain(37650);
      setChainPreview(chainRes.data);
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
      if (subtab === 'agreements') {
        const res = await commissionsApi.getAgreements();
        setAgreements(res.data);
      } else if (subtab === 'schedules') {
        const res = await commissionsApi.getSchedules();
        setSchedules(res.data);
      } else if (subtab === 'profit_schedules') {
        const res = await commissionsApi.getProfitSchedules();
        setProfitSchedules(res.data);
      } else if (subtab === 'splits') {
        const res = await commissionsApi.getSplits();
        setSplits(res.data);
      } else if (subtab === 'transactions') {
        const res = await commissionsApi.getTransactions();
        setTransactions(res.data);
      } else if (subtab === 'fiduciary') {
        const [res, rulesRes, ctxRes, invRes] = await Promise.all([
          commissionsApi.getFiduciaryAccounts(),
          rulesApi.getRules('?status=PUBLISHED').catch(() => ({ data: [] })),
          dimensionsApi.getDimensionContext().catch(() => ({ data: null })),
          billingApi.getInvoices().catch(() => ({ data: [] }))
        ]);
        setFiduciaryAccounts(res.data);
        if (ctxRes && ctxRes.data) {
          setDimensionContext(ctxRes.data);
          const defaultCarrier = ctxRes.data.counterparties?.carriers?.[0];
          const defaultBroker = ctxRes.data.counterparties?.brokers?.[0];
          setAllocationForm(prev => ({
            ...prev,
            carrier_id: prev.carrier_id || defaultCarrier?.party_code || 'CARRIER-SUMMIT',
            carrier_name: prev.carrier_name || defaultCarrier?.legal_name || 'Summit Mutual Insurance',
            broker_id: prev.broker_id || defaultBroker?.party_code || 'BROKER-BRIGHTLINE',
            broker_name: prev.broker_name || defaultBroker?.legal_name || 'Brightline Agency'
          }));
        }
        if (invRes && invRes.data) {
          setInvoicesList(invRes.data);
        }
        const sRules = (rulesRes.data || []).filter(r => r.event_code === 'fiduciary.sweep.executed');
        setPublishedSweepRules(sRules);
        if (sRules.length > 0 && !selectedSweepRuleId) {
          setSelectedSweepRuleId(sRules[0]._id);
        }
        if (res.data.length > 0) {
          setSweepForm(prev => ({ ...prev, fiduciary_account_id: res.data[0]._id }));
          setSettlementForm(prev => ({ ...prev, fiduciary_account_id: res.data[0]._id }));
        }
      } else if (subtab === 'bordereaux') {
        const [defs, runs, ctxRes] = await Promise.all([
          commissionsApi.getBordereauDefinitions(),
          commissionsApi.getBordereauRuns(),
          dimensionsApi.getDimensionContext().catch(() => ({ data: null }))
        ]);
        setBordereauDefinitions(defs.data);
        setBordereauRuns(runs.data);
        if (ctxRes && ctxRes.data) {
          setDimensionContext(ctxRes.data);
          const defaultCarrier = ctxRes.data.counterparties?.carriers?.[0];
          if (defaultCarrier) {
            setBordereauForm(prev => ({
              ...prev,
              carrier_id: prev.carrier_id || defaultCarrier.party_code || 'CARRIER-SUMMIT',
              carrier_name: prev.carrier_name || defaultCarrier.legal_name || 'Summit Mutual Insurance Company'
            }));
          }
        }
      } else if (subtab === 'settlements') {
        const res = await commissionsApi.getSettlements();
        setSettlements(res.data);
        const fidRes = await commissionsApi.getFiduciaryAccounts();
        setFiduciaryAccounts(fidRes.data);
        if (fidRes.data.length > 0) {
          setSettlementForm(prev => ({ ...prev, fiduciary_account_id: fidRes.data[0]._id }));
        }
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

  // Seed Canonical Chain
  const handleSeedCanonical = async () => {
    try {
      setLoading(true);
      setError(null);
      await commissionsApi.seedCommissions();
      setSuccessMsg('Successfully seeded Lone Pine canonical commission chain, trust account, and definitions!');
      if (activeSubtab === 'overview') loadOverview();
      else loadSubtabData(activeSubtab);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Seed Fiduciary Trust Accounts
  const handleSeedFiduciaryAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await commissionsApi.seedFiduciaryAccounts();
      setSuccessMsg(res.message || 'Default Texas § 4053 Fiduciary Trust Accounts initialized successfully!');
      const updated = await commissionsApi.getFiduciaryAccounts();
      setFiduciaryAccounts(updated.data || []);
      if (updated.data && updated.data.length > 0) {
        setSweepForm(prev => ({ ...prev, fiduciary_account_id: updated.data[0]._id }));
        setSettlementForm(prev => ({ ...prev, fiduciary_account_id: updated.data[0]._id }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Execute Sweep
  const handleExecuteSweep = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const res = await commissionsApi.executeSweep(sweepForm);
      setSuccessMsg(`Sweep executed successfully! Transfer Journal #${res.data.journal_number} created for $${res.data.amount}`);
      loadSubtabData('fiduciary');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Disburse Broker Commission via ACH
  const handleDisburseBroker = async (txId) => {
    try {
      setLoading(true);
      setError(null);
      const res = await commissionsApi.disburseBrokerCommission(txId);
      setSuccessMsg(res.message || 'Broker commission disbursed successfully via ACH!');
      loadSubtabData('transactions');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate Bordereau Run with Dynamic Dimensions
  const handleGenerateBordereau = async (defId) => {
    try {
      setLoading(true);
      setError(null);
      const payload = {
        definition_id: defId || undefined,
        carrier_party_id: bordereauForm.carrier_id,
        carrier_name: bordereauForm.carrier_name,
        reporting_period: bordereauForm.reporting_period || '2026-07',
        risk_state: bordereauForm.risk_state || 'TX',
        line_of_business: bordereauForm.line_of_business || 'COMMERCIAL_AUTO',
        reporting_frequency: bordereauForm.reporting_frequency || 'MONTHLY',
        transmission_protocol: bordereauForm.transmission_protocol || 'ACORD_XML_EDI'
      };
      const res = await commissionsApi.generateBordereauRun(payload);
      setSuccessMsg(`Generated Bordereau Run ${res.data.run.run_number} for ${res.data.run.carrier_name} (${res.data.run.risk_state}) with ${res.data.run.total_lines} coverage lines!`);
      loadSubtabData('bordereaux');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Transmit Bordereau Electronically to Carrier Gateway
  const handleTransmitBordereau = async (runId) => {
    try {
      setTransmittingRunId(runId);
      setError(null);
      const res = await commissionsApi.transmitBordereauRun(runId, {
        transmission_protocol: bordereauForm.transmission_protocol || 'ACORD_XML_EDI'
      });
      setSuccessMsg(res.message || 'Bordereau electronic package successfully transmitted to Carrier gateway!');
      loadSubtabData('bordereaux');
    } catch (err) {
      setError(err.message);
    } finally {
      setTransmittingRunId(null);
    }
  };

  // View Bordereau Run Lines
  const handleViewLines = async (runId) => {
    try {
      setLoading(true);
      const res = await commissionsApi.getBordereauRunLines(runId);
      setSelectedRunLines(res.data);
      setSelectedRunId(runId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate Settlement
  const handleGenerateSettlement = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const res = await commissionsApi.generateSettlement(settlementForm);
      setSuccessMsg(`Generated Settlement Statement ${res.data.statement.statement_number} for $${res.data.statement.net_due_carrier}!`);
      loadSubtabData('settlements');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Disburse Settlement
  const handleDisburseSettlement = async (statementId) => {
    try {
      setLoading(true);
      setError(null);
      const res = await commissionsApi.disburseSettlement(statementId, {
        payment_reference: 'ACH-SUMMIT-DISBURSE-001'
      });
      setSuccessMsg(`Carrier Settlement disbursed from Texas § 4053 Trust! Journal ${res.data.journal.journal_number} posted.`);
      loadSubtabData('settlements');
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
            <span>Commissions, Fiduciary Trust & Carrier Settlements</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
              Module 13 Live
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Texas § 4053 segregated trust accounts, canonical distribution chain, bordereaux generation and carrier settlements.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSeedCanonical}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Seed Lone Pine Canonical Chain</span>
          </button>
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
          { id: 'overview', label: 'Overview & Chain', icon: FileText },
          { id: 'agreements', label: 'Agreements', icon: Building },
          { id: 'schedules', label: 'Commission Schedules', icon: Layers },
          { id: 'profit_schedules', label: 'Profit Commission', icon: Table },
          { id: 'splits', label: 'Producer Splits', icon: ArrowRightLeft },
          { id: 'transactions', label: 'Commission Register', icon: DollarSign },
          { id: 'fiduciary', label: 'Fiduciary Trust & Sweeps', icon: ShieldCheck },
          { id: 'bordereaux', label: 'Bordereaux Runs', icon: Download },
          { id: 'settlements', label: 'Carrier Settlements', icon: Send }
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

      {/* Subtab 1: Overview & Canonical Chain */}
      {activeSubtab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Balances */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Operating Cash (1000)</div>
              <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                ${overview?.balances?.operating_cash || '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Unrestricted Operating Funds</div>
            </div>
            <div className="p-4 bg-slate-900 border border-emerald-500/20 rounded-lg">
              <div className="text-[11px] font-mono text-emerald-400 uppercase">Texas § 4053 Trust (1010)</div>
              <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
                ${overview?.balances?.fiduciary_trust_cash || '0.00'}
              </div>
              <div className="text-[10px] text-emerald-500/70 mt-1">Segregated Fiduciary Trust</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-mono text-amber-400 uppercase">Due to Carrier (2010)</div>
              <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                ${overview?.balances?.due_to_carrier || '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Net Carrier Remittance Due</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-mono text-purple-400 uppercase">Broker Payable (2020)</div>
              <div className="text-xl font-bold font-mono text-purple-300 mt-1">
                ${overview?.balances?.broker_commission_payable || '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Producing Broker Payable</div>
            </div>
          </div>

          {/* Canonical Commission Chain Card */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Canonical Lone Pine Distribution Chain (POL-TX-8821)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Gross Written Premium Basis: <span className="font-mono text-brand-400 font-bold">$37,650.00</span>
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Double-Entry Balanced
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Summit → Harbor (MGA)</div>
                <div className="text-sm font-bold text-slate-200 mt-1">$7,530.00 (20%)</div>
                <div className="text-[10px] text-slate-500 mt-1">Carrier Authorized Withholding</div>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Harbor → Brightline (Broker)</div>
                <div className="text-sm font-bold text-amber-400 mt-1">$3,765.00 (10%)</div>
                <div className="text-[10px] text-slate-500 mt-1">Paid from Harbor Gross Comm</div>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Harbor Net Retained</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">$3,765.00 (10%)</div>
                <div className="text-[10px] text-slate-500 mt-1">Eligible for Fiduciary Sweep</div>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Summit Net Settlement</div>
                <div className="text-sm font-bold text-blue-400 mt-1">$30,120.00 (80%)</div>
                <div className="text-[10px] text-slate-500 mt-1">Remitted from Trust (1010)</div>
              </div>
            </div>

            {/* Brightline 70/30 Split Subcard */}
            <div className="p-3.5 bg-slate-950/90 rounded-lg border border-purple-500/20 text-xs">
              <div className="text-purple-400 font-semibold text-[11px] mb-2">
                Brightline Broker Internal Split Breakdown (Pool: $3,765.00)
              </div>
              <div className="grid grid-cols-2 gap-4 font-mono text-[11px]">
                <div className="flex justify-between border-b border-slate-800 py-1">
                  <span className="text-slate-400">Agency House Account (70%):</span>
                  <span className="text-slate-200 font-bold">$2,635.50</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 py-1">
                  <span className="text-slate-400">Producer James Reynolds (30%):</span>
                  <span className="text-slate-200 font-bold">$1,129.50</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 2: Agreements */}
      {activeSubtab === 'agreements' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Commission Agreements Register
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                    <th className="py-2">Agreement Code</th>
                    <th>Name</th>
                    <th>Payer</th>
                    <th>Payee</th>
                    <th>Direction</th>
                    <th>Effective Period</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {agreements.map((agr) => (
                    <tr key={agr._id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-bold text-brand-400">{agr.agreement_code}</td>
                      <td className="font-sans text-slate-200">{agr.name}</td>
                      <td className="text-slate-400">{agr.payer_party_name}</td>
                      <td className="text-slate-300 font-semibold">{agr.payee_party_name}</td>
                      <td>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400">
                          {agr.agreement_type}
                        </span>
                      </td>
                      <td className="text-slate-400">
                        {agr.effective_from?.slice(0, 10)} to {agr.effective_to?.slice(0, 10) || 'Indefinite'}
                      </td>
                      <td>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                          {agr.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {agreements.length === 0 && (
                    <tr>
                      <td colSpan="7" className="py-4 text-center text-slate-500 font-sans">
                        No agreements found. Click "Seed Lone Pine Canonical Chain" above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 3: Schedules */}
      {activeSubtab === 'schedules' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Commission Schedules
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                    <th className="py-2">Schedule Code</th>
                    <th>Schedule Name</th>
                    <th>Agreement</th>
                    <th>Line of Business</th>
                    <th>Rate %</th>
                    <th>Basis</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {schedules.map((sch) => (
                    <tr key={sch._id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-bold text-brand-400">{sch.schedule_code}</td>
                      <td className="font-sans text-slate-200">{sch.schedule_name}</td>
                      <td className="text-slate-400">{sch.agreement_id?.agreement_code || 'AGR'}</td>
                      <td className="text-slate-400">{sch.line_of_business}</td>
                      <td className="text-emerald-400 font-bold">{sch.rate_percentage?.$numberDecimal || sch.rate_percentage}%</td>
                      <td className="text-slate-300">{sch.calculation_basis}</td>
                      <td>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400">
                          ACTIVE
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 4: Profit Commission */}
      {activeSubtab === 'profit_schedules' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Profit Commission Schedules (Contingent Commission)
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Contingent commission rules require authorized loss-ratio thresholds. Rules remain in{' '}
              <span className="text-amber-400 font-mono">NOT_CONFIGURED</span> state until an authorized underwriter provides validated thresholds.
            </p>
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono">
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-slate-400">Status:</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold">
                  NOT_CONFIGURED (Awaiting Authorized Input)
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-slate-400">Loss Ratio Threshold:</span>
                <span className="text-slate-500">Unspecified / Pending Review</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-400">Contingent Rate:</span>
                <span className="text-slate-500">0.00%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 5: Splits */}
      {activeSubtab === 'splits' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Internal Producer Split Hierarchy (Brightline 70/30)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                    <th className="py-2">Split Code</th>
                    <th>Recipient Party</th>
                    <th>Tier</th>
                    <th>Parent Recipient</th>
                    <th>Split %</th>
                    <th>Effective Dates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {splits.map((sp) => (
                    <tr key={sp._id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-bold text-brand-400">{sp.split_code}</td>
                      <td className="font-sans text-slate-200">{sp.recipient_party_name}</td>
                      <td className="text-slate-400">Tier {sp.tier_level}</td>
                      <td className="text-slate-500">{sp.parent_recipient_id || 'Root'}</td>
                      <td className="text-purple-400 font-bold">{sp.split_percentage?.$numberDecimal || sp.split_percentage}%</td>
                      <td className="text-slate-400">{sp.effective_from?.slice(0, 10)} to {sp.effective_to?.slice(0, 10) || 'Indefinite'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 6: Transactions */}
      {activeSubtab === 'transactions' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Commission Transactions Register
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                    <th className="py-2">Transaction #</th>
                    <th>Policy Ref</th>
                    <th>Payer → Payee</th>
                    <th>Basis Amount</th>
                    <th>Rate %</th>
                    <th>Calculated Amount</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {transactions.map((tx) => (
                    <tr key={tx._id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-bold text-brand-400">{tx.transaction_number}</td>
                      <td className="text-slate-300">{tx.policy_reference}</td>
                      <td className="text-slate-400">{tx.payer_party_id} → {tx.payee_party_id}</td>
                      <td className="text-slate-200">${tx.basis_amount?.$numberDecimal || tx.basis_amount}</td>
                      <td className="text-slate-400">{tx.rate_applied?.$numberDecimal || tx.rate_applied}%</td>
                      <td className="text-emerald-400 font-bold">${tx.calculated_amount?.$numberDecimal || tx.calculated_amount}</td>
                      <td>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          tx.lifecycle_status === 'PAID'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : tx.lifecycle_status === 'PAYABLE'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {tx.lifecycle_status}
                        </span>
                      </td>
                      <td className="text-right py-2">
                        {tx.lifecycle_status === 'PAYABLE' ? (
                          <button
                            type="button"
                            onClick={() => handleDisburseBroker(tx._id)}
                            disabled={loading}
                            className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-semibold transition shadow-sm shadow-purple-500/20"
                          >
                            Disburse Broker via ACH (${Number(tx.calculated_amount?.$numberDecimal || tx.calculated_amount || 0).toFixed(2)})
                          </button>
                        ) : tx.lifecycle_status === 'PAID' ? (
                          <span className="text-[10px] text-slate-400 font-sans">
                            Disbursed ({tx.payment_reference || 'ACH'})
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan="8" className="py-4 text-center text-slate-500 font-sans">
                        No transactions registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 7: Fiduciary Trust & Sweeps */}
      {activeSubtab === 'fiduciary' && (
        <div className="space-y-6">
          {/* Step 1.3: Commission & Carrier Share Allocation Card (accounting_architecture_guide.html) */}
          <div className="p-5 bg-slate-900 border border-brand-500/40 rounded-xl space-y-5 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded bg-brand-500/20 text-brand-400 font-mono text-[10px] font-bold border border-brand-500/30">
                    GUIDE STEP 1.3 &bull; DYNAMIC SUBLEDGER
                  </span>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <span>Multi-Carrier & Broker Commission Share Allocation</span>
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                  Reclassifies collected premium from <strong className="text-slate-200">2200 UPR</strong> to specific Underwriting Carrier liability (<strong className="text-amber-400">2010 Due to Carrier</strong>), Retail Producer payable (<strong className="text-amber-400">2020 Broker Payable</strong>), and retained MGA revenue (<strong className="text-purple-400">4200 MGA Income</strong>) with dynamic dimension tagging.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAllocateShares}
                disabled={allocating}
                className="px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition disabled:opacity-50 shadow-lg shadow-brand-500/25 flex items-center space-x-2 shrink-0 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-white" />
                <span>{allocating ? 'Posting to GL...' : 'Allocate Carrier & Broker Shares (Post to GL)'}</span>
              </button>
            </div>

            {/* Dynamic Counterparty, Invoice & Split Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Invoice / Policy Selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Invoice / Policy Link
                </label>
                {invoicesList.length > 0 ? (
                  <div>
                    <select
                      value={allocationForm.invoice_reference}
                      onChange={(e) => {
                        const sel = invoicesList.find(i => i.invoice_number === e.target.value);
                        if (sel) {
                          setAllocationForm(prev => ({
                            ...prev,
                            invoice_reference: sel.invoice_number,
                            policy_reference: sel.policy_id || prev.policy_reference,
                            installment_premium: parseFloat(sel.total_amount?.$numberDecimal || sel.total_amount || 9412.50),
                            carrier_name: sel.carrier_name || prev.carrier_name,
                            broker_name: sel.broker_name || prev.broker_name
                          }));
                        } else {
                          setAllocationForm(prev => ({ ...prev, invoice_reference: e.target.value }));
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 font-mono text-[11px]"
                    >
                      {invoicesList.map(inv => {
                        const isAlloc = inv.allocation_status === 'ALLOCATED' || inv.is_allocated;
                        return (
                          <option key={inv._id} value={inv.invoice_number}>
                            {inv.invoice_number} ({inv.policy_id}) - ${parseFloat(inv.total_amount?.$numberDecimal || inv.total_amount || 0).toFixed(2)} {isAlloc ? `[✓ ALLOCATED - Journal #${inv.allocation_journal_number || 'JE-2026-00003'}]` : '[UNALLOCATED]'}
                          </option>
                        );
                      })}
                      <option value="INV-2026-00001">INV-2026-00001 (POL-TX-8821) [Default Guide]</option>
                    </select>
                    {(() => {
                      const selInv = invoicesList.find(i => i.invoice_number === allocationForm.invoice_reference);
                      if (selInv && (selInv.allocation_status === 'ALLOCATED' || selInv.is_allocated)) {
                        return (
                          <div className="mt-1 text-[10px] text-emerald-400 font-medium flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Already Allocated on Journal #{selInv.allocation_journal_number || 'JE-2026-00003'}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={allocationForm.invoice_reference}
                    onChange={(e) => setAllocationForm(prev => ({ ...prev, invoice_reference: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px]"
                    placeholder="INV-2026-00001"
                  />
                )}
              </div>

              {/* Underwriting Carrier Selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Underwriting Carrier (2010 Subledger)
                </label>
                {dimensionContext?.counterparties?.carriers?.length > 0 ? (
                  <select
                    value={allocationForm.carrier_id}
                    onChange={(e) => {
                      const sel = dimensionContext.counterparties.carriers.find(c => c.party_code === e.target.value);
                      setAllocationForm(prev => ({
                        ...prev,
                        carrier_id: e.target.value,
                        carrier_name: sel ? sel.legal_name : e.target.value
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 text-[11px]"
                  >
                    {dimensionContext.counterparties.carriers.map(c => (
                      <option key={c._id} value={c.party_code}>
                        {c.legal_name} ({c.party_code})
                      </option>
                    ))}
                    <option value="CARRIER-SUMMIT">Summit Mutual Insurance Company</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={allocationForm.carrier_name || 'Summit Mutual Insurance Company'}
                    onChange={(e) => setAllocationForm(prev => ({ ...prev, carrier_name: e.target.value, carrier_id: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-[11px]"
                    placeholder="Carrier Name"
                  />
                )}
              </div>

              {/* Retail Broker Selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Retail Broker (2020 Subledger)
                </label>
                {dimensionContext?.counterparties?.brokers?.filter(b => !b.party_code.startsWith('POLICYHOLDER'))?.length > 0 ? (
                  <select
                    value={allocationForm.broker_id}
                    onChange={(e) => {
                      const sel = dimensionContext.counterparties.brokers.find(b => b.party_code === e.target.value);
                      setAllocationForm(prev => ({
                        ...prev,
                        broker_id: e.target.value,
                        broker_name: sel ? sel.legal_name : e.target.value
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 text-[11px]"
                  >
                    {dimensionContext.counterparties.brokers
                      .filter(b => !b.party_code.startsWith('POLICYHOLDER'))
                      .map(b => (
                        <option key={b._id} value={b.party_code}>
                          {b.legal_name} ({b.party_code})
                        </option>
                      ))}
                    <option value="BROKER-BRIGHTLINE">Brightline Retail Risk Agency LLC (BROKER-BRIGHTLINE)</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={allocationForm.broker_name || 'Brightline Agency'}
                    onChange={(e) => setAllocationForm(prev => ({ ...prev, broker_name: e.target.value, broker_id: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-[11px]"
                    placeholder="Broker Name"
                  />
                )}
              </div>

              {/* Installment Premium Amount */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Installment Premium ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={allocationForm.installment_premium}
                  onChange={(e) => setAllocationForm(prev => ({ ...prev, installment_premium: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-bold text-[11px]"
                />
              </div>
            </div>

            {/* Split Rates & Dynamic Dimension Controls */}
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">Commission & Remittance Split %</span>
                <button
                  type="button"
                  onClick={() => setShowAdvancedDimensions(!showAdvancedDimensions)}
                  className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center space-x-1 cursor-pointer"
                >
                  <Tags className="w-3 h-3" />
                  <span>{showAdvancedDimensions ? 'Hide Segment Dimensions' : 'Configure Segment Dimensions (CC, Comp, MGA)'}</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Carrier Remittance %</div>
                  <input
                    type="number"
                    step="0.1"
                    value={allocationForm.carrier_rate}
                    onChange={(e) => setAllocationForm(prev => ({ ...prev, carrier_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-full mt-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-amber-400 font-mono font-semibold"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Broker Commission %</div>
                  <input
                    type="number"
                    step="0.1"
                    value={allocationForm.broker_rate}
                    onChange={(e) => setAllocationForm(prev => ({ ...prev, broker_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-full mt-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-amber-400 font-mono font-semibold"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">MGA Retained %</div>
                  <input
                    type="number"
                    step="0.1"
                    value={allocationForm.mga_rate}
                    onChange={(e) => setAllocationForm(prev => ({ ...prev, mga_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-full mt-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-purple-400 font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Advanced Dynamic Dimensions Drawer */}
              {showAdvancedDimensions && (
                <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Cost Center (Dimension)</label>
                    <select
                      value={allocationForm.cost_center}
                      onChange={(e) => setAllocationForm(prev => ({ ...prev, cost_center: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[11px]"
                    >
                      <option value="CC-OPS">CC-OPS (Operations)</option>
                      <option value="CC-UNDERWRITING">CC-UNDERWRITING</option>
                      <option value="CC-FINANCE">CC-FINANCE</option>
                      <option value="CC-CLAIMS">CC-CLAIMS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Company Code (Dimension)</label>
                    <input
                      type="text"
                      value={allocationForm.company_code}
                      onChange={(e) => setAllocationForm(prev => ({ ...prev, company_code: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-mono"
                      placeholder="COMP-001"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Custom Key (e.g. comp, dept)</label>
                    <input
                      type="text"
                      value={allocationForm.custom_dimension_key}
                      onChange={(e) => setAllocationForm(prev => ({ ...prev, custom_dimension_key: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-mono"
                      placeholder="e.g. comp"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Custom Value</label>
                    <input
                      type="text"
                      value={allocationForm.custom_dimension_value}
                      onChange={(e) => setAllocationForm(prev => ({ ...prev, custom_dimension_value: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-mono"
                      placeholder="e.g. TX-AUTO"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Double-Entry Ledger Preview Chips (Dynamic Calculation) */}
            {(() => {
              const prem = parseFloat(allocationForm.installment_premium) || 0;
              const cAmt = (prem * (parseFloat(allocationForm.carrier_rate) || 0) / 100).toFixed(2);
              const bAmt = (prem * (parseFloat(allocationForm.broker_rate) || 0) / 100).toFixed(2);
              const mAmt = Math.max(0, prem - parseFloat(cAmt) - parseFloat(bAmt)).toFixed(2);
              const carrierDisplay = allocationForm.carrier_name || 'Summit Mutual';
              const brokerDisplay = allocationForm.broker_name || 'Brightline Agency';

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Debit (Dr 2200)</div>
                    <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate">Unearned Premium Reserve</div>
                    <div className="text-sm font-mono font-bold text-emerald-400 mt-1">${prem.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">Policy: {allocationForm.policy_reference}</div>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Credit (Cr 2010 - {allocationForm.carrier_rate}%)
                    </div>
                    <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate">
                      Due to {carrierDisplay}
                    </div>
                    <div className="text-sm font-mono font-bold text-amber-400 mt-1">${cAmt}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                      Subledger: {allocationForm.carrier_id || 'CARRIER-SUMMIT'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Credit (Cr 2020 - {allocationForm.broker_rate}%)
                    </div>
                    <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate">
                      Payable to {brokerDisplay}
                    </div>
                    <div className="text-sm font-mono font-bold text-amber-400 mt-1">${bAmt}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                      Subledger: {allocationForm.broker_id || 'BROKER-BRIGHTLINE'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Credit (Cr 4200 - {allocationForm.mga_rate}%)
                    </div>
                    <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate">
                      MGA Commission Income
                    </div>
                    <div className="text-sm font-mono font-bold text-purple-400 mt-1">${mAmt}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Subledger: MGA-HARBOR
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trust Accounts List */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                      Fiduciary Premium Trust Accounts
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleSeedFiduciaryAccounts}
                    disabled={loading}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-semibold border border-slate-700 flex items-center space-x-1.5 transition"
                    title="Initialize or reload Texas § 4053 standard fiduciary accounts"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Seed Trust Accounts</span>
                  </button>
                </div>

                {fiduciaryAccounts.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950 rounded-lg border border-slate-800 space-y-3">
                    <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto" />
                    <div className="text-xs text-slate-300 font-semibold">No Fiduciary Trust Accounts Configured</div>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Texas Insurance Code § 4053 requires MGAs to maintain segregated fiduciary premium trust accounts.
                    </p>
                    <button
                      type="button"
                      onClick={handleSeedFiduciaryAccounts}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold inline-flex items-center space-x-1.5 transition"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Initialize Texas § 4053 Accounts</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fiduciaryAccounts.map((fa) => {
                      const isSelected = sweepForm.fiduciary_account_id === fa._id;
                      const bal = Number(fa.current_balance || 0);
                      return (
                        <div
                          key={fa._id}
                          onClick={() => setSweepForm(prev => ({ ...prev, fiduciary_account_id: fa._id }))}
                          className={`p-3.5 rounded-lg border cursor-pointer transition space-y-2.5 ${
                            isSelected
                              ? 'bg-slate-950 border-emerald-500/50 shadow-md shadow-emerald-500/5'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-bold text-xs text-emerald-400">{fa.account_code}</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                                  {fa.status}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-300 font-mono">
                                  GL {fa.gl_account_code}
                                </span>
                              </div>
                              <div className="text-slate-200 font-semibold text-xs mt-1">{fa.account_name}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 uppercase font-mono">Live GL Balance</div>
                              <div className={`font-mono text-sm font-bold ${bal > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                ${bal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-850 text-slate-400">
                            <div>
                              <span className="text-slate-500">Bank: </span>
                              <span className="text-slate-300 font-medium">{fa.bank_name}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Statute: </span>
                              <span className="text-amber-400/90 font-mono">{fa.jurisdiction_statute || 'Texas § 4053'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Vault Token: </span>
                              <span className="font-mono text-[10px] text-slate-400">{fa.bank_reference_token}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Hold Period: </span>
                              <span className="text-slate-300">{fa.fiduciary_hold_days} days</span>
                            </div>
                          </div>

                          {fa.notes && (
                            <div className="text-[10px] text-slate-500 italic bg-slate-900/60 p-1.5 rounded">
                              {fa.notes}
                            </div>
                          )}

                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSweepForm(prev => ({ ...prev, fiduciary_account_id: fa._id }));
                              }}
                              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {isSelected ? '✓ Selected for Sweep' : 'Select for Sweep'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sweep Execution Form */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1">
                  Execute MGA Earned Commission Sweep
                </h3>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  Releases earned retained MGA commission from segregated Texas Premium Trust (GL 1010) to Operating Cash (GL 1000).
                </p>
                <form onSubmit={handleExecuteSweep} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Fiduciary Trust Account *</label>
                    <select
                      value={sweepForm.fiduciary_account_id || (fiduciaryAccounts[0]?._id || '')}
                      onChange={(e) => setSweepForm({ ...sweepForm, fiduciary_account_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      required
                    >
                      {fiduciaryAccounts.length === 0 ? (
                        <option value="">No Fiduciary Account Available — Please Seed</option>
                      ) : (
                        fiduciaryAccounts.map((fa) => (
                          <option key={fa._id} value={fa._id}>
                            {fa.account_code} — {fa.account_name} (GL {fa.gl_account_code} | Balance: ${Number(fa.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-medium text-slate-400">Sweep Amount ($) *</label>
                      {(() => {
                        const selectedFa = fiduciaryAccounts.find(a => a._id === (sweepForm.fiduciary_account_id || fiduciaryAccounts[0]?._id));
                        const curBal = Number(selectedFa?.current_balance || 0);
                        return (
                          <span className="text-[10px] text-emerald-400 font-mono">
                            Available Trust Cash: ${curBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        );
                      })()}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={sweepForm.amount}
                      onChange={(e) => setSweepForm({ ...sweepForm, amount: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-slate-500 mr-0.5">Quick Fill:</span>
                      <button
                        type="button"
                        onClick={() => setSweepForm({ ...sweepForm, amount: '941.25' })}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-mono border border-slate-700"
                      >
                        $941.25 (10% MGA Share)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSweepForm({ ...sweepForm, amount: '1091.25' })}
                        className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30"
                      >
                        $1,091.25 (Step 1.4 Guide)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSweepForm({ ...sweepForm, amount: '3765.00' })}
                        className="px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30"
                      >
                        $3,765.00 (Annual)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Memo / Justification</label>
                    <input
                      type="text"
                      value={sweepForm.notes}
                      onChange={(e) => setSweepForm({ ...sweepForm, notes: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Applied Posting Rule Selection & Validation */}
                  <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-200 flex items-center space-x-1.5">
                        <Sliders className="w-3.5 h-3.5 text-brand-400" />
                        <span>Applied Posting Rule (Rules Engine)</span>
                      </span>
                      {publishedSweepRules.length > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {publishedSweepRules.length} Rule(s) Active
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          No Rule Published
                        </span>
                      )}
                    </div>

                    {publishedSweepRules.length > 0 ? (
                      <div className="space-y-2">
                        <select
                          value={selectedSweepRuleId || publishedSweepRules[0]?._id}
                          onChange={(e) => setSelectedSweepRuleId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-xs text-white"
                        >
                          {publishedSweepRules.map((r) => (
                            <option key={r._id} value={r._id}>
                              {r.rule_code} — {r.rule_name} (Priority {r.priority})
                            </option>
                          ))}
                        </select>
                        <div className="font-mono text-[11px] text-slate-300 space-y-0.5 pt-1">
                          <div className="text-emerald-400 font-semibold">
                            Dr 1000 Operating Cash: ${Number(sweepForm.amount || 0).toFixed(2)}
                          </div>
                          <div className="text-amber-400 font-semibold">
                            Cr 1010 Premium Trust Bank: ${Number(sweepForm.amount || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-400 space-y-1">
                        <div className="font-semibold flex items-center space-x-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Posting Rule Required</span>
                        </div>
                        <div>
                          No active rule found for <code>fiduciary.sweep.executed</code>. Please publish a rule in Journal Entry Rules first.
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || publishedSweepRules.length === 0 || fiduciaryAccounts.length === 0}
                    className={`w-full py-2.5 rounded text-xs font-semibold transition ${
                      publishedSweepRules.length === 0 || fiduciaryAccounts.length === 0
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
                    }`}
                  >
                    Execute Trust-to-Operating Cash Sweep (${Number(sweepForm.amount || 0).toFixed(2)})
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 8: Bordereaux Runs */}
      {activeSubtab === 'bordereaux' && (
        <div className="space-y-6">
          {/* Dynamic Carrier, State & Dimension Bordereau Generator Card */}
          <div className="p-5 bg-slate-900 border border-brand-500/40 rounded-xl space-y-4 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded bg-brand-500/20 text-brand-400 font-mono text-[10px] font-bold border border-brand-500/30">
                    STATUTORY REPORTING &bull; BORDEREAU PIPELINE
                  </span>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <span>Multi-Carrier & State Dimension Bordereaux Generator</span>
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                  Compile monthly policy schedules per Carrier paper, tag statutory <strong className="text-amber-400">NAIC Schedule T Risk State</strong> & <strong className="text-purple-400">Line of Business</strong> dimensions, and communicate electronic packages directly to Carrier gateways.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleGenerateBordereau()}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition shadow-lg shadow-brand-500/20 flex items-center space-x-2 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Compile & Generate Bordereau</span>
              </button>
            </div>

            {/* Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              {/* Carrier Selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Underwriting Carrier Paper
                </label>
                <select
                  value={bordereauForm.carrier_id}
                  onChange={(e) => {
                    if (e.target.value === 'ALL') {
                      setBordereauForm(prev => ({
                        ...prev,
                        carrier_id: 'ALL',
                        carrier_name: 'Consolidated Multi-Carrier Portfolio'
                      }));
                    } else {
                      const sel = dimensionContext?.counterparties?.carriers?.find(c => c.party_code === e.target.value);
                      const fallbackName = e.target.value === 'CARRIER-CLEARSPRING'
                        ? 'ClearSpring Insurance Co.'
                        : (e.target.value === 'CARRIER-SOUTHLAKE' ? 'Southlake Specialty Insurance' : 'Summit Mutual Insurance Company');
                      setBordereauForm(prev => ({
                        ...prev,
                        carrier_id: e.target.value,
                        carrier_name: sel?.legal_name || fallbackName
                      }));
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 font-mono text-[11px]"
                >
                  <option value="ALL">ALL - All Carriers (Consolidated Master Portfolio)</option>
                  {dimensionContext?.counterparties?.carriers?.map(c => (
                    <option key={c.party_code} value={c.party_code}>
                      {c.legal_name} ({c.party_code})
                    </option>
                  ))}
                  {(!dimensionContext?.counterparties?.carriers || dimensionContext.counterparties.carriers.length === 0) && (
                    <>
                      <option value="CARRIER-SUMMIT">Summit Mutual Insurance Company</option>
                      <option value="CARRIER-CLEARSPRING">ClearSpring Insurance Co.</option>
                      <option value="CARRIER-SOUTHLAKE">Southlake Specialty Insurance</option>
                    </>
                  )}
                </select>
              </div>

              {/* State Dimension (NAIC Schedule T) */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Risk State (NAIC Schedule T)
                </label>
                <select
                  value={bordereauForm.risk_state}
                  onChange={(e) => setBordereauForm(prev => ({ ...prev, risk_state: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 font-mono text-[11px]"
                >
                  <option value="ALL">ALL - Multi-State Interstate Allocation (TX, CA, FL, NM)</option>
                  <option value="TX">TX - Texas (TDI Regulatory Statute)</option>
                  <option value="CA">CA - California (CDI Compliant)</option>
                  <option value="FL">FL - Florida (OIR Compliant)</option>
                  <option value="NM">NM - New Mexico (OSI Compliant)</option>
                  <option value="NY">NY - New York (NYDFS Admitted)</option>
                </select>
              </div>

              {/* Line of Business */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Line of Business / Program
                </label>
                <select
                  value={bordereauForm.line_of_business}
                  onChange={(e) => setBordereauForm(prev => ({ ...prev, line_of_business: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 font-mono text-[11px]"
                >
                  <option value="ALL">ALL - Multi-Coverage Comprehensive Program</option>
                  <option value="COMMERCIAL_AUTO">Commercial Auto Liability</option>
                  <option value="PHYSICAL_DAMAGE">Physical Damage & Collision</option>
                  <option value="MOTOR_TRUCK_CARGO">Motor Truck Cargo</option>
                  <option value="GENERAL_LIABILITY">Commercial General Liability</option>
                </select>
              </div>

              {/* Reporting Period & Frequency */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Period & Cadence
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={bordereauForm.reporting_period}
                    onChange={(e) => setBordereauForm(prev => ({ ...prev, reporting_period: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-center font-mono text-[11px]"
                    placeholder="2026-07"
                  />
                  <select
                    value={bordereauForm.reporting_frequency}
                    onChange={(e) => setBordereauForm(prev => ({ ...prev, reporting_frequency: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px]"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                  </select>
                </div>
              </div>

              {/* Electronic Transmission Protocol */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Carrier Communication Protocol
                </label>
                <select
                  value={bordereauForm.transmission_protocol}
                  onChange={(e) => setBordereauForm(prev => ({ ...prev, transmission_protocol: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500 font-mono text-[11px]"
                >
                  <option value="ACORD_XML_EDI">ACORD XML EDI 131/133</option>
                  <option value="SFTP_SECURE">Secure SFTP Batch (PGP)</option>
                  <option value="DIRECT_API">Carrier API Webhook</option>
                </select>
              </div>
            </div>
          </div>

          {/* Generated Bordereaux Runs Table */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Bordereau Transmission Ledger
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                {bordereauRuns.length} Runs Recorded
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                    <th className="py-2">Run #</th>
                    <th>Carrier Paper</th>
                    <th>Risk State</th>
                    <th>Period</th>
                    <th>Lines</th>
                    <th>Gross Premium</th>
                    <th>MGA Comm (20%)</th>
                    <th>Net Due Carrier</th>
                    <th>Carrier Communication</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {bordereauRuns.map((r) => {
                    const isAccepted = r.status === 'ACCEPTED' || r.transmission_status === 'TRANSMITTED_AND_ACCEPTED';
                    return (
                      <tr key={r._id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 font-bold text-brand-400">{r.run_number}</td>
                        <td className="text-slate-200 font-sans font-medium">
                          {r.carrier_name || 'Summit Mutual'}
                          <span className="block text-[10px] text-slate-500 font-mono">{r.carrier_party_id || 'CARRIER-SUMMIT'}</span>
                        </td>
                        <td>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-bold border border-slate-700">
                            {r.risk_state || 'TX'}
                          </span>
                        </td>
                        <td className="text-slate-300">{r.reporting_period}</td>
                        <td className="text-slate-400">{r.total_lines}</td>
                        <td className="text-slate-200">${r.total_gross_premium?.$numberDecimal || r.total_gross_premium}</td>
                        <td className="text-amber-400">${r.total_commission_withheld?.$numberDecimal || r.total_commission_withheld}</td>
                        <td className="text-emerald-400 font-bold">${r.total_net_due_carrier?.$numberDecimal || r.total_net_due_carrier}</td>
                        <td>
                          {isAccepted ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Accepted by Carrier</span>
                              </span>
                              {r.carrier_ack_id && (
                                <div className="text-[9px] text-slate-400 font-mono truncate max-w-[130px]" title={r.carrier_ack_id}>
                                  {r.carrier_ack_id}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                              Ready to Dispatch
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2 space-x-2 whitespace-nowrap">
                          {!isAccepted && (
                            <button
                              type="button"
                              onClick={() => handleTransmitBordereau(r._id)}
                              disabled={transmittingRunId === r._id}
                              className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-semibold transition shadow-sm inline-flex items-center space-x-1"
                            >
                              <Send className="w-3 h-3" />
                              <span>{transmittingRunId === r._id ? 'Transmitting...' : 'Transmit (ACORD XML)'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleViewLines(r._id)}
                            className="text-xs text-brand-400 hover:text-brand-300 inline-flex items-center space-x-0.5"
                          >
                            <span>Lines</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {bordereauRuns.length === 0 && (
                    <tr>
                      <td colSpan="10" className="py-4 text-center text-slate-500 font-sans">
                        No bordereaux runs recorded yet. Use the generator above to compile a package.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lines View */}
          {selectedRunId && selectedRunLines.length > 0 && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Bordereau Detail Lines & Statutory Dimensions
                </h4>
                <span className="text-[11px] text-slate-500 font-mono">
                  {selectedRunLines.length} Coverage Lines
                </span>
              </div>
              <table className="w-full text-left text-xs font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-[10px]">
                    <th className="py-1">Line #</th>
                    <th>Policy #</th>
                    <th>Carrier Paper</th>
                    <th>Insured</th>
                    <th>Risk State</th>
                    <th>Coverage & LOB</th>
                    <th>Gross Premium</th>
                    <th>MGA Comm (20%)</th>
                    <th>Net Remittance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {selectedRunLines.map((l) => (
                    <tr key={l._id}>
                      <td className="py-2 text-slate-400">#{l.line_number}</td>
                      <td className="text-slate-200">{l.policy_number}</td>
                      <td className="text-slate-300 font-sans">
                        {l.carrier_name || 'Summit Mutual'}
                        <span className="block text-[9px] text-slate-500 font-mono">{l.carrier_party_id || 'CARRIER-SUMMIT'}</span>
                      </td>
                      <td className="text-slate-300 font-sans">{l.insured_name || 'Lone Pine Trucking'}</td>
                      <td>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-amber-300 font-bold border border-slate-700">
                          {l.risk_state || 'TX'}
                        </span>
                      </td>
                      <td className="text-slate-300">
                        {l.coverage_type}
                        <span className="block text-[9px] text-slate-500">{l.line_of_business || 'COMMERCIAL_AUTO'}</span>
                      </td>
                      <td className="text-slate-200">${l.gross_premium?.$numberDecimal || l.gross_premium}</td>
                      <td className="text-amber-400">${l.mga_commission_amount?.$numberDecimal || l.mga_commission_amount}</td>
                      <td className="text-emerald-400 font-bold">${l.net_due_carrier?.$numberDecimal || l.net_due_carrier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subtab 9: Settlements */}
      {activeSubtab === 'settlements' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Carrier Settlement Statements (Summit Mutual)
              </h3>
              <p className="text-xs text-slate-400">
                Formula: Gross ($37,650) − MGA Comm ($7,530) − Claims ($0) = Net Due ($30,120)
              </p>
            </div>
            <button
              onClick={handleGenerateSettlement}
              disabled={loading || fiduciaryAccounts.length === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Generate Summit Settlement (2026-07)</span>
            </button>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                  <th className="py-2">Statement #</th>
                  <th>Carrier</th>
                  <th>Period</th>
                  <th>Gross Premium</th>
                  <th>Withheld (20%)</th>
                  <th>Net Remittance</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {settlements.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 font-bold text-brand-400">{s.statement_number}</td>
                    <td className="text-slate-200 font-sans">{s.carrier_name}</td>
                    <td className="text-slate-400">{s.period_start?.slice(0, 7)}</td>
                    <td className="text-slate-200">${s.gross_eligible_premium?.$numberDecimal || s.gross_eligible_premium}</td>
                    <td className="text-amber-400">${s.commission_withheld?.$numberDecimal || s.commission_withheld}</td>
                    <td className="text-emerald-400 font-bold">${s.net_due_carrier?.$numberDecimal || s.net_due_carrier}</td>
                    <td>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        s.status === 'PAID'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      {s.status !== 'PAID' ? (
                        <button
                          onClick={() => handleDisburseSettlement(s._id)}
                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition"
                        >
                          Disburse via Trust ACH (SIMULATED)
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">Disbursed ({s.payment_reference})</span>
                      )}
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
