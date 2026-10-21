import React, { useState, useEffect } from 'react';
import { authApi, counterpartiesApi, rulesApi } from '../services/api';
import {
  Receipt,
  CreditCard,
  Calendar,
  FileText,
  DollarSign,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Eye,
  Sliders,
  Layers,
  Clock,
  ArrowRight
} from 'lucide-react';

export default function BillingWorkspacePage() {
  const [subtab, setSubtab] = useState('overview'); // 'overview' | 'schedules' | 'invoices' | 'payments' | 'accounts' | 'plans' | 'adjustments'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Data states
  const [overview, setOverview] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [publishedRules, setPublishedRules] = useState([]);
  const [selectedInvoiceRuleId, setSelectedInvoiceRuleId] = useState('');
  const [selectedPaymentRuleId, setSelectedPaymentRuleId] = useState('');

  const invoiceRules = publishedRules.filter((r) => r.event_code === 'billing.invoice.issued');
  const paymentRules = publishedRules.filter((r) => r.event_code === 'billing.payment.received');
  const activeInvoiceRule = invoiceRules.find((r) => r._id === (selectedInvoiceRuleId || invoiceRules[0]?._id)) || invoiceRules[0];
  const activePaymentRule = paymentRules.find((r) => r._id === (selectedPaymentRuleId || paymentRules[0]?._id)) || paymentRules[0];

  // Modals & Detail
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [showGenerateScheduleModal, setShowGenerateScheduleModal] = useState(false);
  const [showIssueInvoiceModal, setShowIssueInvoiceModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Form states
  const [newAccount, setNewAccount] = useState({ account_number: '', customer_name: '', customer_email: '' });
  const [newPlan, setNewPlan] = useState({ plan_code: '', plan_name: '', installment_count: 4, down_payment_pct: 25, installment_fee: 0, interval_months: 3 });
  const [scheduleForm, setScheduleForm] = useState({
    billing_account_id: '',
    policy_id: 'POL-TX-8821',
    policy_number: 'POL-TX-8821',
    total_premium: '37650.00',
    policy_fee: '150.00',
    billing_plan_code: '4_PAY_25_DOWN',
    effective_date: '2026-07-01'
  });
  const [invoiceForm, setInvoiceForm] = useState({
    billing_account_id: '',
    policy_id: 'POL-TX-8821',
    installment_number: 1,
    invoice_date: '2026-07-01',
    premium_amount: '9412.50',
    fee_amount: '150.00'
  });
  const [paymentForm, setPaymentForm] = useState({
    billing_account_id: '',
    amount: '9562.50',
    payment_method: 'ACH',
    reference_number: 'WF-TX-ACH-9912',
    is_fiduciary: true,
    target_invoice_id: ''
  });

  const openInvoicesForAccount = invoices.filter(
    (i) =>
      (i.billing_account_id?._id === paymentForm.billing_account_id ||
        i.billing_account_id === paymentForm.billing_account_id) &&
      ['ISSUED', 'PARTIALLY_PAID'].includes(i.status) &&
      Number(i.balance_due) > 0
  );
  const [adjustmentForm, setAdjustmentForm] = useState({
    billing_account_id: '',
    adjustment_type: 'FEE_WAIVER',
    amount: '150.00',
    reason_code: 'BROKER_RELATIONSHIP',
    reason_description: 'Courtesy fee waiver for Lone Pine Trucking'
  });

  const formatMoney = (val) => {
    if (val === null || val === undefined) return '0.00';
    if (typeof val === 'object' && val.$numberDecimal) return Number(val.$numberDecimal).toFixed(2);
    const n = Number(val);
    return isNaN(n) ? '0.00' : n.toFixed(2);
  };

  const handleOpenInvoiceForSchedule = (sched) => {
    const accId =
      sched.billing_account_id?._id ||
      sched.billing_account_id ||
      (accounts[0] ? accounts[0]._id : '');
    const prem = sched.premium_amount?.$numberDecimal || sched.premium_amount || '9412.50';
    const fee = sched.fee_amount?.$numberDecimal || sched.fee_amount || (sched.installment_number === 1 ? '150.00' : '0.00');
    setInvoiceForm({
      billing_account_id: accId,
      policy_id: sched.policy_id || 'POL-TX-8821',
      installment_number: sched.installment_number || 1,
      invoice_date: sched.due_date ? new Date(sched.due_date).toISOString().split('T')[0] : '2026-07-01',
      premium_amount: String(prem),
      fee_amount: String(fee)
    });
    setShowIssueInvoiceModal(true);
  };

  useEffect(() => {
    if (accounts.length > 0) {
      setScheduleForm((prev) => (prev.billing_account_id ? prev : { ...prev, billing_account_id: accounts[0]._id }));
      setInvoiceForm((prev) => (prev.billing_account_id ? prev : { ...prev, billing_account_id: accounts[0]._id }));
      setPaymentForm((prev) => (prev.billing_account_id ? prev : { ...prev, billing_account_id: accounts[0]._id }));
      setAdjustmentForm((prev) => (prev.billing_account_id ? prev : { ...prev, billing_account_id: accounts[0]._id }));
    }
  }, [accounts]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const rulesRes = await rulesApi.getRules('?status=PUBLISHED').catch(() => ({ data: [] }));
      const activeRules = rulesRes.data || [];
      setPublishedRules(activeRules);

      if (subtab === 'overview') {
        const [res, accRes, cpRes, schRes] = await Promise.all([
          authApi.getBillingOverview(),
          authApi.getBillingAccounts(),
          counterpartiesApi.getParties().catch(() => ({ data: [] })),
          authApi.getInstallmentSchedules().catch(() => ({ data: [] }))
        ]);
        setOverview(res.data);
        setAccounts(accRes.data || []);
        setCounterparties(cpRes.data || []);
        setSchedules(schRes.data || []);
      } else if (subtab === 'schedules') {
        const [schRes, accRes] = await Promise.all([
          authApi.getInstallmentSchedules().catch(() => ({ data: [] })),
          authApi.getBillingAccounts().catch(() => ({ data: [] }))
        ]);
        setSchedules(schRes.data || []);
        setAccounts(accRes.data || []);
      } else if (subtab === 'accounts') {
        const [res, cpRes] = await Promise.all([
          authApi.getBillingAccounts(),
          counterpartiesApi.getParties().catch(() => ({ data: [] }))
        ]);
        setAccounts(res.data);
        setCounterparties(cpRes.data || []);
      } else if (subtab === 'plans') {
        const res = await authApi.getBillingPlans();
        setPlans(res.data);
      } else if (subtab === 'invoices') {
        const [res, accRes, cpRes, schRes] = await Promise.all([
          authApi.getInvoices(),
          authApi.getBillingAccounts(),
          counterpartiesApi.getParties().catch(() => ({ data: [] })),
          authApi.getInstallmentSchedules().catch(() => ({ data: [] }))
        ]);
        setInvoices(res.data);
        setAccounts(accRes.data || []);
        setCounterparties(cpRes.data || []);
        setSchedules(schRes.data || []);
      } else if (subtab === 'payments') {
        const [res, accRes] = await Promise.all([
          authApi.getPayments(),
          authApi.getBillingAccounts()
        ]);
        setPayments(res.data);
        setAccounts(accRes.data || []);
      } else if (subtab === 'adjustments') {
        const res = await authApi.getAdjustments();
        setAdjustments(res.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subtab]);

  // Handle Account Create
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      await authApi.createBillingAccount(newAccount);
      setSuccess('Billing account created successfully');
      setShowNewAccountModal(false);
      setNewAccount({ account_number: '', customer_name: '', customer_email: '' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Plan Create
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    try {
      await authApi.createBillingPlan(newPlan);
      setSuccess('Billing plan created successfully');
      setShowNewPlanModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Generate Schedule
  const handleGenerateSchedule = async (e) => {
    e.preventDefault();
    try {
      await authApi.generateSchedule(scheduleForm);
      setSuccess('Policy bound & 4-pay installment schedule generated successfully! Review scheduled installments below.');
      setShowGenerateScheduleModal(false);
      setSubtab('schedules');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Issue Invoice
  const handleIssueInvoice = async (e) => {
    e.preventDefault();
    try {
      const lines = [
        {
          line_type: 'PREMIUM',
          description: `Commercial Auto Premium Installment #${invoiceForm.installment_number}`,
          amount: invoiceForm.premium_amount,
          ledger_account_code: '2200'
        }
      ];
      if (Number(invoiceForm.fee_amount) > 0) {
        lines.push({
          line_type: 'FEE',
          description: 'Policy Issuance Fee',
          amount: invoiceForm.fee_amount,
          ledger_account_code: '4100'
        });
      }

      await authApi.issueInvoice({
        billing_account_id: invoiceForm.billing_account_id,
        policy_id: invoiceForm.policy_id,
        installment_number: invoiceForm.installment_number,
        invoice_date: invoiceForm.invoice_date,
        lines
      });
      setSuccess('Invoice issued & GL posted (Dr 1100 AR / Cr 2200 UPR & 4100 Fee)');
      setShowIssueInvoiceModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Record Payment
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      await authApi.postPaymentReceipt(paymentForm);
      setSuccess('Payment captured, waterfall allocated, and GL journal posted (Dr 1010 / Cr 1100)');
      setShowRecordPaymentModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Adjustment
  const handleCreateAdjustment = async (e) => {
    e.preventDefault();
    try {
      await authApi.createAdjustment(adjustmentForm);
      setSuccess('Billing adjustment applied and posted to GL');
      setShowAdjustmentModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // View Invoice Detail Modal
  const viewInvoiceDetail = async (id) => {
    try {
      const res = await authApi.getInvoiceDetail(id);
      setSelectedInvoice(res.data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Billing & Accounts Receivable</h1>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-medium">
              Module 12 • Real AR Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Installment schedules, invoices, waterfall cash allocation, Texas § 4053 fiduciary receipts, and GL synchronization.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">✕</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-200">✕</button>
        </div>
      )}

      {/* Navigation Subtabs */}
      <div className="flex border-b border-slate-800 space-x-1">
        {[
          { id: 'overview', label: 'AR Overview', icon: Layers },
          { id: 'schedules', label: `Installment Schedules ${schedules.length > 0 ? `(${schedules.length})` : ''}`, icon: Calendar },
          { id: 'invoices', label: 'Invoices & Lines', icon: FileText },
          { id: 'payments', label: 'Payments & Waterfall', icon: DollarSign },
          { id: 'accounts', label: 'Billing Accounts', icon: CreditCard },
          { id: 'plans', label: 'Billing Plans (4-Pay)', icon: Sliders },
          { id: 'adjustments', label: 'Adjustments & Waivers', icon: Receipt }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subtab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSubtab(tab.id);
                setSuccess(null);
                setError(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                isActive
                  ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: AR OVERVIEW */}
      {subtab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
              <div className="text-[11px] text-slate-400 uppercase font-mono">Total Invoiced (Gross AR)</div>
              <div className="text-2xl font-bold font-mono text-white mt-1">
                ${overview ? overview.totalBilled : '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Billed to customers</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
              <div className="text-[11px] text-amber-400 uppercase font-mono">Outstanding Receivable</div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                ${overview ? overview.totalOutstanding : '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Unpaid customer balance</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
              <div className="text-[11px] text-emerald-400 uppercase font-mono">Total Cash Collected</div>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                ${overview ? overview.totalPaid : '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Allocated to open invoices</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
              <div className="text-[11px] text-purple-400 uppercase font-mono">Unapplied Cash (Suspense)</div>
              <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
                ${overview ? overview.totalUnapplied : '0.00'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">GL Account 2190</div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-lg space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Policy Lifecycle Quick Actions</h3>
            <p className="text-xs text-slate-400">
              Execute standard commercial policy billing actions: generate installment schedules, issue deposit invoices, and record fiduciary premium cash receipts.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => setShowGenerateScheduleModal(true)}
                className="px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>1. Bind Policy & Generate 4-Pay Schedule</span>
              </button>
              <button
                onClick={() => setSubtab('schedules')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition"
              >
                <Calendar className="w-3.5 h-3.5 text-brand-400" />
                <span>View Installment Schedules {schedules.length > 0 ? `(${schedules.length})` : ''}</span>
              </button>
              <button
                onClick={() => setShowIssueInvoiceModal(true)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition"
              >
                <FileText className="w-3.5 h-3.5 text-brand-400" />
                <span>2. Issue Deposit Invoice</span>
              </button>
              <button
                onClick={() => setShowRecordPaymentModal(true)}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>3. Capture Cash & Waterfall Allocate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: INSTALLMENT SCHEDULES */}
      {subtab === 'schedules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Policy Installment Schedules (4-Pay Lifecycle)</h3>
              <p className="text-xs text-slate-400">
                Payment plans generated upon policy binding. Issue invoices against scheduled installments when due.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowGenerateScheduleModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bind Policy & Schedule</span>
              </button>
              <button
                onClick={loadData}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                title="Refresh Schedules"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Quick Stats Banner if schedules exist */}
          {schedules.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Total Scheduled Plan</div>
                <div className="text-lg font-bold font-mono text-white mt-0.5">
                  ${schedules.reduce((acc, s) => acc + Number(formatMoney(s.total_amount)), 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">{schedules.length} Installments</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <div className="text-[10px] text-amber-400 uppercase font-mono">Pending Invoicing</div>
                <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                  {schedules.filter((s) => s.status === 'SCHEDULED').length} Installments
                </div>
                <div className="text-[10px] text-slate-500">Awaiting invoice issuance</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <div className="text-[10px] text-emerald-400 uppercase font-mono">Invoiced / Billed</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                  {schedules.filter((s) => s.status === 'BILLED' || s.status === 'PAID').length} Installments
                </div>
                <div className="text-[10px] text-slate-500">Converted to AR invoice</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <div className="text-[10px] text-blue-400 uppercase font-mono">Deposit (#1) Status</div>
                <div className="text-lg font-bold font-mono text-blue-400 mt-0.5">
                  {schedules[0] ? schedules[0].status : 'N/A'}
                </div>
                <div className="text-[10px] text-slate-500">25% Down + $150 Fee</div>
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Installment</th>
                  <th className="p-3">Policy Number</th>
                  <th className="p-3">Customer / Account</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Premium</th>
                  <th className="p-3">Fee</th>
                  <th className="p-3">Total Due</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Invoice Link</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-8 text-center text-slate-500 font-sans space-y-2">
                      <div>No installment schedules generated yet.</div>
                      <div className="text-xs text-slate-600">
                        Click "1. Bind Policy & Generate 4-Pay Schedule" in AR Overview to create the payment plan.
                      </div>
                    </td>
                  </tr>
                ) : (
                  schedules.map((sched) => {
                    const isDeposit = sched.installment_number === 1;
                    const isBilled = sched.status === 'BILLED' || sched.invoice_id;
                    return (
                      <tr key={sched._id} className="hover:bg-slate-850/50 transition">
                        <td className="p-3">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-white">#{sched.installment_number}</span>
                            {isDeposit && (
                              <span className="px-1.5 py-0.5 text-[9px] bg-brand-500/20 text-brand-300 rounded font-sans border border-brand-500/30">
                                Down Payment
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-semibold text-slate-200">
                          {sched.policy_number || sched.policy_id}
                        </td>
                        <td className="p-3 font-sans text-slate-300">
                          {sched.billing_account_id ? sched.billing_account_id.customer_name : 'Lone Pine Trucking LLC'}
                        </td>
                        <td className="p-3 text-slate-400">
                          {new Date(sched.due_date).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-slate-200">${formatMoney(sched.premium_amount)}</td>
                        <td className="p-3 text-slate-400">${formatMoney(sched.fee_amount)}</td>
                        <td className="p-3 text-white font-bold">${formatMoney(sched.total_amount)}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              sched.status === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : sched.status === 'BILLED'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {sched.status === 'SCHEDULED' ? 'SCHEDULED (UNBILLED)' : sched.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400">
                          {sched.invoice_id ? (
                            <button
                              onClick={() => setSubtab('invoices')}
                              className="text-brand-400 hover:underline font-mono text-[11px]"
                            >
                              {sched.invoice_id.invoice_number || 'View Invoice'}
                            </button>
                          ) : (
                            <span className="text-slate-500 font-sans text-[11px]">Not yet issued</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {!isBilled ? (
                            <button
                              onClick={() => handleOpenInvoiceForSchedule(sched)}
                              className="px-2.5 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-[11px] font-sans inline-flex items-center space-x-1 font-semibold transition"
                            >
                              <FileText className="w-3 h-3" />
                              <span>⚡ Issue Invoice</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setSubtab('invoices')}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-sans inline-flex items-center space-x-1 transition"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View in Invoices</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INVOICES */}
      {subtab === 'invoices' && (
        <div className="space-y-4">
          {/* Informative helper banner when schedules exist but no invoices issued yet */}
          {invoices.length === 0 && schedules.length > 0 && (
            <div className="p-4 bg-brand-500/10 border border-brand-500/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-brand-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-brand-300">
                    {schedules.length} Active Installment Schedules Ready for Billing
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Your 4-pay schedule was generated. Installment #1 (${formatMoney(schedules[0].total_amount)}) is pending invoice issuance.
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSubtab('schedules')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-semibold transition"
                >
                  View All Schedules
                </button>
                <button
                  onClick={() => handleOpenInvoiceForSchedule(schedules[0])}
                  className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold flex items-center space-x-1.5 shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Issue Invoice for Installment #1 (${formatMoney(schedules[0].total_amount)})</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Itemized customer billing invoices with double-entry general ledger synchronization.
            </div>
            <button
              onClick={() => setShowIssueInvoiceModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Issue New Invoice</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Invoice Number</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Total Amount</th>
                  <th className="p-3">Paid Amount</th>
                  <th className="p-3">Balance Due</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">GL Journal</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="p-8 text-center text-slate-400 font-sans space-y-2">
                      <div className="text-sm font-medium text-slate-300">No invoices issued yet.</div>
                      {schedules.length > 0 ? (
                        <div className="text-xs text-brand-400">
                          {schedules.length} installment schedules are active. Click "Issue Invoice for Installment #1" above to generate the first bill.
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">
                          Click "Issue New Invoice" to issue a direct invoice or generate an installment schedule first.
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv._id} className="hover:bg-slate-850/50 transition">
                      <td className="p-3 font-semibold text-white">{inv.invoice_number}</td>
                      <td className="p-3 font-sans text-slate-300">
                        {inv.billing_account_id ? inv.billing_account_id.customer_name : 'N/A'}
                      </td>
                      <td className="p-3 text-slate-400">{new Date(inv.due_date).toLocaleDateString()}</td>
                      <td className="p-3 text-white font-semibold">${inv.total_amount}</td>
                      <td className="p-3 text-emerald-400">${inv.amount_paid}</td>
                      <td className="p-3 text-amber-400 font-semibold">${inv.balance_due}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            inv.status === 'PAID'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : inv.status === 'PARTIALLY_PAID'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">
                        {inv.journal_id ? inv.journal_id.journal_number : '-'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => viewInvoiceDetail(inv._id)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-sans inline-flex items-center space-x-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Lines</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PAYMENTS */}
      {subtab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Customer payments captured and allocated against open receivable balances.
            </div>
            <button
              onClick={() => setShowRecordPaymentModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Cash Receipt</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Payment Number</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Total Amount</th>
                  <th className="p-3">Allocated Amount</th>
                  <th className="p-3">Unapplied (Suspense)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">GL Journal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="p-6 text-center text-slate-500 font-sans">
                      No customer cash receipts recorded yet.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-850/50 transition">
                      <td className="p-3 font-semibold text-white">{p.payment_number}</td>
                      <td className="p-3 font-sans text-slate-300">
                        {p.billing_account_id ? p.billing_account_id.customer_name : 'N/A'}
                      </td>
                      <td className="p-3 text-slate-400">{p.payment_method}</td>
                      <td className="p-3 text-slate-400">{p.reference_number || '-'}</td>
                      <td className="p-3 text-white font-semibold">${p.amount}</td>
                      <td className="p-3 text-emerald-400 font-semibold">${p.allocated_amount}</td>
                      <td className="p-3 text-purple-400">${p.unapplied_amount}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">
                        {p.journal_id ? p.journal_id.journal_number : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: BILLING ACCOUNTS */}
      {subtab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Insured customer billing profiles with current and past-due balance tracking.
            </div>
            <button
              onClick={() => setShowNewAccountModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Billing Account</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Account Number</th>
                  <th className="p-3">Customer Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Current AR Balance</th>
                  <th className="p-3">Unapplied Cash</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-6 text-center text-slate-500 font-sans">
                      No billing accounts found. Click "Create Billing Account" to add one.
                    </td>
                  </tr>
                ) : (
                  accounts.map((acc) => (
                    <tr key={acc._id} className="hover:bg-slate-850/50 transition">
                      <td className="p-3 font-semibold text-white">{acc.account_number}</td>
                      <td className="p-3 font-sans text-slate-300 font-medium">{acc.customer_name}</td>
                      <td className="p-3 text-slate-400 font-sans">{acc.customer_email || '-'}</td>
                      <td className="p-3 text-white font-semibold">${acc.current_balance}</td>
                      <td className="p-3 text-purple-400">${acc.unapplied_cash}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {acc.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: BILLING PLANS */}
      {subtab === 'plans' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Installment rules (Full Pay, 4-Pay 25% Down, 10-Pay) driving automatic payment schedules.
            </div>
            <button
              onClick={() => setShowNewPlanModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Billing Plan</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {plans.map((p) => (
              <div key={p._id} className="bg-slate-900 border border-slate-800 p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-white">{p.plan_code}</span>
                  <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-mono">
                    {p.status}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-200">{p.plan_name}</h4>
                <p className="text-xs text-slate-400">{p.description}</p>
                <div className="pt-2 border-t border-slate-800 text-xs font-mono grid grid-cols-2 gap-2 text-slate-400">
                  <div>Installments: <span className="text-white">{p.installment_count}</span></div>
                  <div>Down Pay: <span className="text-white">{p.down_payment_pct}%</span></div>
                  <div>Installment Fee: <span className="text-white">${p.installment_fee}</span></div>
                  <div>Cadence: <span className="text-white">{p.interval_months} mo</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: ADJUSTMENTS */}
      {subtab === 'adjustments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Fee waivers, credit memos, and write-offs with audit trails and GL contra-posting.
            </div>
            <button
              onClick={() => setShowAdjustmentModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Apply Adjustment</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Adjustment #</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">GL Journal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-6 text-center text-slate-500 font-sans">
                      No adjustments applied yet.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((adj) => (
                    <tr key={adj._id} className="hover:bg-slate-850/50 transition">
                      <td className="p-3 font-semibold text-white">{adj.adjustment_number}</td>
                      <td className="p-3 font-sans text-slate-300">
                        {adj.billing_account_id ? adj.billing_account_id.customer_name : 'N/A'}
                      </td>
                      <td className="p-3 text-slate-400">{adj.adjustment_type}</td>
                      <td className="p-3 text-white font-semibold">${adj.amount}</td>
                      <td className="p-3 text-slate-400 font-sans">{adj.reason_description || adj.reason_code}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {adj.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">
                        {adj.journal_id ? adj.journal_id.journal_number : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Create Billing Account */}
      {showNewAccountModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">Create Billing Account</h3>
            <form onSubmit={handleCreateAccount} className="space-y-3 text-xs">
              {counterparties.length > 0 && (
                <div className="p-3 bg-brand-500/10 border border-brand-500/30 rounded-lg space-y-1.5">
                  <label className="text-brand-300 font-semibold block text-[11px] flex items-center justify-between">
                    <span>🏢 Select from Counterparty Directory</span>
                    <span className="text-[10px] text-brand-400 font-mono">Auto-fills form</span>
                  </label>
                  <select
                    onChange={(e) => {
                      const partyId = e.target.value;
                      if (!partyId) return;
                      const p = counterparties.find((cp) => cp._id === partyId);
                      if (p) {
                        const cleanCode = (p.party_code || 'BA').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
                        setNewAccount({
                          ...newAccount,
                          account_number: `BA-${cleanCode}`,
                          customer_name: p.legal_name || p.trade_name || '',
                          customer_email: p.email || ''
                        });
                      }
                    }}
                    className="w-full bg-slate-800 border border-brand-500/40 rounded p-1.5 text-white text-xs focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">-- Choose Existing Broker or Insured --</option>
                    {counterparties.map((cp) => {
                      const rolesStr = (cp.roles || []).map((r) => r.role_type || r).join(', ') || 'Counterparty';
                      return (
                        <option key={cp._id} value={cp._id}>
                          {cp.legal_name} [{rolesStr}] ({cp.party_code})
                        </option>
                      );
                    })}
                  </select>
                  <div className="text-[10px] text-slate-400">
                    Select a Broker (Agency Bill) or Insured (Direct Bill) to auto-fill Account details.
                  </div>
                </div>
              )}
              <div>
                <label className="text-slate-400 block mb-1">Account Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BA-001"
                  value={newAccount.account_number}
                  onChange={(e) => setNewAccount({ ...newAccount, account_number: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Customer / Insured / Broker Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pine Cone Brokerage or Lone Pine Trucking LLC"
                  value={newAccount.customer_name}
                  onChange={(e) => setNewAccount({ ...newAccount, customer_name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Customer Email (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. billing@apexcommercial.com"
                  value={newAccount.customer_email}
                  onChange={(e) => setNewAccount({ ...newAccount, customer_email: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewAccountModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded font-semibold"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Generate Schedule */}
      {showGenerateScheduleModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">Bind Policy & Generate 4-Pay Schedule</h3>
            <form onSubmit={handleGenerateSchedule} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Target Billing Account</label>
                <select
                  required
                  value={scheduleForm.billing_account_id}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, billing_account_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="">Select Account...</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>{a.customer_name} ({a.account_number})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Policy Number</label>
                  <input
                    type="text"
                    value={scheduleForm.policy_number}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, policy_number: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Billing Plan</label>
                  <select
                    value={scheduleForm.billing_plan_code}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, billing_plan_code: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="4_PAY_25_DOWN">4-Pay 25% Down</option>
                    <option value="FULL_PAY">Full Pay</option>
                    <option value="10_PAY">10-Pay</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Annual Gross Premium</label>
                  <input
                    type="text"
                    value={scheduleForm.total_premium}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, total_premium: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Policy Fee</label>
                  <input
                    type="text"
                    value={scheduleForm.policy_fee}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, policy_fee: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowGenerateScheduleModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded font-semibold"
                >
                  Generate Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Issue Invoice */}
      {showIssueInvoiceModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">Issue Customer Invoice</h3>
            <form onSubmit={handleIssueInvoice} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Billing Account</label>
                <select
                  required
                  value={invoiceForm.billing_account_id}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, billing_account_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="">Select Account...</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>{a.customer_name} ({a.account_number})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Policy ID / Insured Risk Reference</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. POL-TX-8821 (Insured: Summit / Pine Cone)"
                  value={invoiceForm.policy_id}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, policy_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Installment #</label>
                  <input
                    type="number"
                    value={invoiceForm.installment_number}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, installment_number: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceForm.invoice_date}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Premium Amount ($)</label>
                  <input
                    type="text"
                    value={invoiceForm.premium_amount}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, premium_amount: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Policy Fee ($)</label>
                  <input
                    type="text"
                    value={invoiceForm.fee_amount}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, fee_amount: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>
              {/* Posting Rule Selection & Validation */}
              <div className="p-3 bg-slate-850 rounded border border-slate-750 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-200 flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5 text-brand-400" />
                    <span>Applied Posting Rule (Rules Engine)</span>
                  </span>
                  {invoiceRules.length > 0 ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {invoiceRules.length} Rule(s) Active
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30">
                      No Rule Published
                    </span>
                  )}
                </div>

                {invoiceRules.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={selectedInvoiceRuleId || invoiceRules[0]?._id}
                      onChange={(e) => setSelectedInvoiceRuleId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white"
                    >
                      {invoiceRules.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.rule_code} — {r.rule_name} (Priority {r.priority})
                        </option>
                      ))}
                    </select>
                    <div className="font-mono text-[11px] text-slate-300 space-y-0.5 pt-1">
                      <div>Dr 1100 Premium Receivable: ${(Number(invoiceForm.premium_amount || 0) + Number(invoiceForm.fee_amount || 0)).toFixed(2)}</div>
                      <div>Cr 2200 Unearned Premium Reserve: ${Number(invoiceForm.premium_amount || 0).toFixed(2)}</div>
                      {Number(invoiceForm.fee_amount || 0) > 0 && (
                        <div>Cr 4100 Policy Fee Income: ${Number(invoiceForm.fee_amount || 0).toFixed(2)}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-400 space-y-1">
                    <div className="font-semibold flex items-center space-x-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Posting Rule Required</span>
                    </div>
                    <div>
                      No active rule found for <code>billing.invoice.issued</code>. Create and publish a rule in Journal Entry Rules first.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowIssueInvoiceModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={invoiceRules.length === 0}
                  className={`px-4 py-1.5 rounded font-semibold text-white transition ${
                    invoiceRules.length === 0
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-brand-600 hover:bg-brand-500'
                  }`}
                >
                  Issue Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Record Payment */}
      {showRecordPaymentModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">Record Cash Receipt & Waterfall Allocate</h3>
            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Billing Account</label>
                <select
                  required
                  value={paymentForm.billing_account_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, billing_account_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="">Select Account...</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>{a.customer_name} ({a.account_number})</option>
                  ))}
                </select>
              </div>

              {paymentForm.billing_account_id && (
                <div className="space-y-1.5 p-2.5 bg-slate-850 rounded border border-slate-750">
                  <div className="text-slate-300 font-semibold block text-[11px] flex items-center justify-between">
                    <span>🧾 Target Invoice (Waterfall Allocation)</span>
                    <span className="text-[10px] text-brand-400 font-mono">
                      {openInvoicesForAccount.length} Open Invoice(s)
                    </span>
                  </div>
                  {openInvoicesForAccount.length > 0 ? (
                    <div>
                      <select
                        onChange={(e) => {
                          const invId = e.target.value;
                          const targetInv = openInvoicesForAccount.find((i) => i._id === invId);
                          if (targetInv) {
                            setPaymentForm({
                              ...paymentForm,
                              amount: Number(targetInv.balance_due).toFixed(2),
                              target_invoice_id: targetInv._id
                            });
                          }
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white"
                      >
                        <option value="">-- Apply to Oldest Due (Standard Waterfall) --</option>
                        {openInvoicesForAccount.map((inv) => (
                          <option key={inv._id} value={inv._id}>
                            {inv.invoice_number} (Policy: {inv.policy_id}) — Balance Due: ${Number(inv.balance_due).toFixed(2)}
                          </option>
                        ))}
                      </select>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Select an invoice to auto-fill its exact balance due.
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded p-2">
                      ℹ️ Is account par koi bhi unpaid/open invoice nahi hai. Agar aap payment record karenge to ye poora amount Unapplied Cash (Account 2190) me reserve ho jayega.
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Amount ($)</label>
                  <input
                    type="text"
                    required
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Method</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="ACH">ACH (Texas Trust)</option>
                    <option value="CHECK">Lockbox Check</option>
                    <option value="WIRE">Wire Transfer</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Processor / Bank Reference</label>
                <input
                  type="text"
                  value={paymentForm.reference_number}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>
              {/* Payment Posting Rule Display & Validation */}
              <div className="p-3 bg-slate-850 rounded border border-slate-750 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-200 flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5 text-brand-400" />
                    <span>Applied Payment Rule (Texas Trust)</span>
                  </span>
                  {paymentRules.length > 0 ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {paymentRules.length} Rule(s) Active
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30">
                      No Rule Published
                    </span>
                  )}
                </div>

                {paymentRules.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={selectedPaymentRuleId || paymentRules[0]?._id}
                      onChange={(e) => setSelectedPaymentRuleId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white"
                    >
                      {paymentRules.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.rule_code} — {r.rule_name} (Priority {r.priority})
                        </option>
                      ))}
                    </select>
                    <div className="font-mono text-[11px] text-slate-300 space-y-0.5 pt-1">
                      <div>Dr 1010 Texas Premium Trust: ${paymentForm.amount || '0.00'}</div>
                      <div>Cr 1100 AR (Waterfall Cleared): ${paymentForm.amount || '0.00'}</div>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-400 space-y-1">
                    <div className="font-semibold flex items-center space-x-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Payment Rule Required</span>
                    </div>
                    <div>
                      No active rule found for <code>billing.payment.received</code>. Please publish a payment rule in Journal Entry Rules first.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRecordPaymentModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentRules.length === 0}
                  className={`px-4 py-1.5 rounded font-semibold text-white transition ${
                    paymentRules.length === 0
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  Capture Cash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Invoice Line Details */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-xl w-full space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Invoice {selectedInvoice.invoice.invoice_number}</h3>
                <p className="text-xs text-slate-400 font-mono">Status: {selectedInvoice.invoice.status}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="border border-slate-800 rounded overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-850 text-slate-400">
                  <tr>
                    <th className="p-2">Line</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Account</th>
                    <th className="p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {selectedInvoice.lines.map((l) => (
                    <tr key={l._id}>
                      <td className="p-2">{l.line_number}</td>
                      <td className="p-2 text-brand-400">{l.line_type}</td>
                      <td className="p-2 font-sans text-slate-300">{l.description}</td>
                      <td className="p-2">{l.ledger_account_code}</td>
                      <td className="p-2 text-right text-white font-semibold">${l.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-1.5 bg-slate-800 text-slate-200 rounded text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
