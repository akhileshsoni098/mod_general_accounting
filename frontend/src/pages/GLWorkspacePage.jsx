import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import {
  BookOpen,
  PlusCircle,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  DollarSign,
  Layers,
  ArrowRight,
  RotateCcw,
  Sliders,
  Globe,
  Eye,
  X
} from 'lucide-react';

export default function GLWorkspacePage() {
  const { currentWorkspace } = useAuth();
  const [activeTab, setActiveTab] = useState('journals'); // 'journals' | 'coa' | 'trial_balance' | 'periods' | 'rules' | 'fx'

  // Data states
  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [trialBalance, setTrialBalance] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [postingRules, setPostingRules] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Journal Drilldown Modal
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [journalLines, setJournalLines] = useState([]);
  const [loadingJournalLines, setLoadingJournalLines] = useState(false);

  // Reversal Confirmation
  const [reversingJournalId, setReversingJournalId] = useState(null);
  const [reversing, setReversing] = useState(false);

  // New Journal Modal with Live Preview
  const [showNewJournalModal, setShowNewJournalModal] = useState(false);
  const [newJournalForm, setNewJournalForm] = useState({
    posting_date: new Date().toISOString().slice(0, 10),
    memo: '',
    source_module: 'GL_MANUAL',
    reference_id: '',
    lines: [
      { account_code: '1000', debit: '', credit: '', memo: '' },
      { account_code: '3000', debit: '', credit: '', memo: '' }
    ]
  });
  const [journalPreview, setJournalPreview] = useState(null);
  const [submittingJournal, setSubmittingJournal] = useState(false);

  // New Account Modal
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({
    account_code: '',
    account_name: '',
    description: '',
    account_type: 'ASSET',
    normal_balance: 'DEBIT',
    is_posting_allowed: true,
    is_fiduciary: false,
    subledger_type: 'NONE'
  });
  const [submittingAccount, setSubmittingAccount] = useState(false);

  // Account Ledger Drilldown Drawer State
  const [drilldownAccount, setDrilldownAccount] = useState(null);
  const [drilldownActivity, setDrilldownActivity] = useState([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const openAccountDrilldown = async (acc) => {
    setDrilldownAccount(acc);
    setDrilldownLoading(true);
    try {
      const res = await authApi.getAccountDetail(acc._id || acc.account_code);
      if (res && res.data) {
        setDrilldownAccount(res.data.account || acc);
        setDrilldownActivity(res.data.activity || []);
      } else {
        setDrilldownActivity([]);
      }
    } catch (err) {
      console.error('Failed to load account activity:', err);
      setDrilldownActivity([]);
    } finally {
      setDrilldownLoading(false);
    }
  };

  // New Posting Rule Modal
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [newRuleForm, setNewRuleForm] = useState({
    rule_code: 'RULE_POLICY_BIND',
    event_type: 'POLICY_BOUND',
    rule_name: 'Policy Bound Gross Premium & UPR Initial Recognition',
    description: 'Debit Premium Receivable 1100, Credit Unearned Premium Reserve 2200',
    applicable_module: 'GL',
    lines: [
      { account_code: '1100', direction: 'DEBIT', amount_field: 'gross_premium', description_template: 'Gross Premium AR' },
      { account_code: '2200', direction: 'CREDIT', amount_field: 'gross_premium', description_template: 'Initial UPR Reserve' }
    ]
  });
  const [submittingRule, setSubmittingRule] = useState(false);

  // New FX Rate Modal
  const [showNewFxModal, setShowNewFxModal] = useState(false);
  const [newFxForm, setNewFxForm] = useState({
    from_currency: 'CAD',
    to_currency: 'USD',
    effective_date: new Date().toISOString().slice(0, 10),
    rate: '0.740000',
    source: 'BANK_OF_CANADA'
  });
  const [submittingFx, setSubmittingFx] = useState(false);

  useEffect(() => {
    loadData();
  }, [currentWorkspace, activeTab]);

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (activeTab === 'journals') {
        const res = await authApi.getJournals();
        if (res.success) setJournals(res.data);
      } else if (activeTab === 'coa') {
        const res = await authApi.getAccounts();
        if (res.success) setAccounts(res.data);
      } else if (activeTab === 'trial_balance') {
        const res = await authApi.getTrialBalance();
        if (res.success) setTrialBalance(res.data);
      } else if (activeTab === 'periods') {
        const res = await authApi.getPeriods();
        if (res.success) setPeriods(res.data);
      } else if (activeTab === 'rules') {
        const res = await authApi.getPostingRules();
        if (res.success) setPostingRules(res.data);
      } else if (activeTab === 'fx') {
        const res = await authApi.getExchangeRates();
        if (res.success) setExchangeRates(res.data);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Handle New Journal Line Change and Update Live Preview
  const handleLineChange = (index, field, value) => {
    const updated = [...newJournalForm.lines];
    updated[index][field] = value;
    setNewJournalForm({ ...newJournalForm, lines: updated });

    // Calculate totals
    let dr = 0;
    let cr = 0;
    for (const l of updated) {
      dr += parseFloat(l.debit || 0);
      cr += parseFloat(l.credit || 0);
    }
    setJournalPreview({
      total_debit: dr.toFixed(2),
      total_credit: cr.toFixed(2),
      difference: (dr - cr).toFixed(2),
      is_balanced: Math.abs(dr - cr) < 0.0001 && dr > 0
    });
  };

  const addJournalLine = () => {
    setNewJournalForm({
      ...newJournalForm,
      lines: [...newJournalForm.lines, { account_code: '1100', debit: '', credit: '', memo: '' }]
    });
  };

  const removeJournalLine = (index) => {
    if (newJournalForm.lines.length <= 2) return;
    const updated = newJournalForm.lines.filter((_, idx) => idx !== index);
    setNewJournalForm({ ...newJournalForm, lines: updated });
  };

  const handlePostJournal = async (e) => {
    e.preventDefault();
    setSubmittingJournal(true);
    setErrorMsg(null);
    try {
      const payload = {
        ...newJournalForm,
        lines: newJournalForm.lines.map(l => ({
          account_code: l.account_code,
          debit: l.debit || '0.00',
          credit: l.credit || '0.00',
          memo: l.memo
        }))
      };
      const res = await authApi.postJournal(payload);
      if (res.success) {
        setSuccessMsg(`Journal ${res.data.journal.journal_number} posted successfully!`);
        setShowNewJournalModal(false);
        setNewJournalForm({
          posting_date: new Date().toISOString().slice(0, 10),
          memo: '',
          source_module: 'GL_MANUAL',
          reference_id: '',
          lines: [
            { account_code: '1000', debit: '', credit: '', memo: '' },
            { account_code: '3000', debit: '', credit: '', memo: '' }
          ]
        });
        setJournalPreview(null);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingJournal(false);
    }
  };

  // Inspect Journal Details
  const handleInspectJournal = async (journal) => {
    setSelectedJournal(journal);
    setLoadingJournalLines(true);
    try {
      const res = await authApi.getJournalById(journal._id);
      if (res.success) {
        setJournalLines(res.data.lines);
      }
    } catch (err) {
      setErrorMsg('Failed to load journal lines: ' + err.message);
    } finally {
      setLoadingJournalLines(false);
    }
  };

  // Reverse Journal
  const handleReverseJournal = async (journalId) => {
    setReversing(true);
    setErrorMsg(null);
    try {
      const res = await authApi.reverseJournal(journalId, {
        reversal_date: new Date().toISOString().slice(0, 10),
        reversal_memo: `Reversal of journal ${selectedJournal?.journal_number}`
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setSelectedJournal(null);
        setJournalLines([]);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setReversing(false);
      setReversingJournalId(null);
    }
  };

  // Create Custom Account
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setSubmittingAccount(true);
    setErrorMsg(null);
    try {
      const res = await authApi.createAccount(newAccountForm);
      if (res.success) {
        setSuccessMsg(`Account ${newAccountForm.account_code} created successfully!`);
        setShowNewAccountModal(false);
        setNewAccountForm({
          account_code: '',
          account_name: '',
          description: '',
          account_type: 'ASSET',
          normal_balance: 'DEBIT',
          is_posting_allowed: true,
          is_fiduciary: false,
          subledger_type: 'NONE'
        });
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingAccount(false);
    }
  };

  // Create Posting Rule
  const handleCreatePostingRule = async (e) => {
    e.preventDefault();
    setSubmittingRule(true);
    setErrorMsg(null);
    try {
      const res = await authApi.createPostingRule(newRuleForm);
      if (res.success) {
        setSuccessMsg(`Posting rule ${newRuleForm.rule_code} created!`);
        setShowNewRuleModal(false);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingRule(false);
    }
  };

  // Create FX Rate
  const handleCreateFx = async (e) => {
    e.preventDefault();
    setSubmittingFx(true);
    setErrorMsg(null);
    try {
      const res = await authApi.createExchangeRate(newFxForm);
      if (res.success) {
        setSuccessMsg(`Exchange rate ${newFxForm.from_currency}/${newFxForm.to_currency} saved!`);
        setShowNewFxModal(false);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingFx(false);
    }
  };

  // Lock / Unlock Period
  const handleTogglePeriodLock = async (periodId, currentStatus) => {
    const nextStatus = (currentStatus === 'HARD_CLOSED' || currentStatus === 'LOCKED') ? 'OPEN' : 'HARD_CLOSED';
    try {
      const res = await authApi.updatePeriodStatus(periodId, nextStatus);
      if (res.success) {
        setSuccessMsg(res.message);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-bold border border-brand-500/20">
              GL
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">General Ledger (GL) Workspace</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Operational
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl">
            Chart of Accounts, balanced double-entry posting engine, journal reversals, period lock guards, and certified trial balance.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center transition"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {activeTab === 'coa' && (
            <button
              onClick={() => setShowNewAccountModal(true)}
              className="py-2 px-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-brand-600/20 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Account</span>
            </button>
          )}
          {activeTab === 'rules' && (
            <button
              onClick={() => setShowNewRuleModal(true)}
              className="py-2 px-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-brand-600/20 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Posting Rule</span>
            </button>
          )}
          {activeTab === 'fx' && (
            <button
              onClick={() => setShowNewFxModal(true)}
              className="py-2 px-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-brand-600/20 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Record FX Rate</span>
            </button>
          )}
          <button
            onClick={() => setShowNewJournalModal(true)}
            className="py-2 px-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-brand-600/20 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Post Manual Journal</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-xs text-rose-400 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg text-xs text-emerald-400 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Subtab Navigation */}
      <div className="flex border-b border-slate-800 space-x-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('journals')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'journals'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Journal Register</span>
        </button>

        <button
          onClick={() => setActiveTab('trial_balance')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'trial_balance'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Trial Balance</span>
        </button>

        <button
          onClick={() => setActiveTab('coa')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'coa'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Chart of Accounts (COA)</span>
        </button>

        <button
          onClick={() => setActiveTab('periods')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'periods'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Fiscal Periods & Lock</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'rules'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Posting Rules</span>
        </button>

        <button
          onClick={() => setActiveTab('fx')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'fx'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Exchange Rates</span>
        </button>
      </div>

      {/* Tab: Journals */}
      {activeTab === 'journals' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">General Ledger Journal Entries ({journals.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-5">Journal #</th>
                  <th className="py-3 px-5">Posting Date</th>
                  <th className="py-3 px-5">Source / Ref</th>
                  <th className="py-3 px-5">Memo</th>
                  <th className="py-3 px-5 text-right">Debit</th>
                  <th className="py-3 px-5 text-right">Credit</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-slate-500">Loading journals...</td>
                  </tr>
                ) : journals.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-slate-500">No journal entries posted yet.</td>
                  </tr>
                ) : (
                  journals.map((j) => (
                    <tr key={j._id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-5 font-mono font-bold text-brand-400">{j.journal_number}</td>
                      <td className="py-3.5 px-5 font-mono text-slate-400">{new Date(j.posting_date).toISOString().slice(0, 10)}</td>
                      <td className="py-3.5 px-5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                          {j.source_module}
                        </span>
                        {j.reference_id && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{j.reference_id}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-5 max-w-xs truncate text-slate-200">{j.memo}</td>
                      <td className="py-3.5 px-5 text-right font-mono font-semibold text-emerald-400">
                        ${parseFloat(j.total_debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono font-semibold text-emerald-400">
                        ${parseFloat(j.total_credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            j.status === 'POSTED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => handleInspectJournal(j)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] transition inline-flex items-center space-x-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Lines</span>
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

      {/* Tab: Trial Balance */}
      {activeTab === 'trial_balance' && (
        <div className="space-y-4">
          {trialBalance && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 text-xs">Trial Balance Status</div>
                <div className="text-lg font-bold text-emerald-400 flex items-center space-x-1.5 mt-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>{trialBalance.is_balanced ? 'Balanced in Equilibrium' : 'Imbalance Detected'}</span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">Double-Entry Variance: ${trialBalance.difference}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 text-xs">Total Debits Incurred (Dr Turnover)</div>
                <div className="text-lg font-bold text-emerald-400 font-mono mt-1">${parseFloat(trialBalance.total_debits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Net Ending Dr: ${parseFloat(trialBalance.total_ending_debits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 text-xs">Total Credits Relieved (Cr Turnover)</div>
                <div className="text-lg font-bold text-amber-400 font-mono mt-1">${parseFloat(trialBalance.total_credits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Net Ending Cr: ${parseFloat(trialBalance.total_ending_credits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-white">Trial Balance Accounts & Turnover Activity</h3>
                <p className="text-xs text-slate-400 mt-0.5">Shows full period debit/credit turnover and ending balances. Click any row to inspect underlying ledger journals.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Account</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Normal</th>
                    <th className="py-3 px-4 text-right">Debit Activity (Dr)</th>
                    <th className="py-3 px-4 text-right">Credit Activity (Cr)</th>
                    <th className="py-3 px-4 text-right">Ending Balance</th>
                    <th className="py-3 px-4 text-center">Ledger</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {loading || !trialBalance ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-500">Computing trial balance...</td>
                    </tr>
                  ) : (
                    trialBalance.accounts.map((a) => {
                      const drAct = parseFloat(a.period_debit ?? a.debit ?? 0);
                      const crAct = parseFloat(a.period_credit ?? a.credit ?? 0);
                      const endBal = parseFloat(a.current_balance ?? 0);

                      return (
                        <tr
                          key={a.account_code}
                          onClick={() => openAccountDrilldown(a)}
                          className="hover:bg-slate-850/70 cursor-pointer transition group"
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-brand-400 mr-2 group-hover:underline">{a.account_code}</span>
                            <span className="text-white font-medium">{a.account_name}</span>
                            {a.is_fiduciary && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-mono">
                                Texas § 4053
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                              {a.account_type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">{a.normal_balance}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-semibold">
                            {drAct > 0 ? `$${drAct.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-amber-400 font-semibold">
                            {crAct > 0 ? `$${crAct.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-white text-[13px]">
                            ${endBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAccountDrilldown(a);
                              }}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-brand-600 hover:text-white text-slate-300 font-medium text-[11px] inline-flex items-center space-x-1.5 transition border border-slate-700"
                            >
                              <FileText className="w-3 h-3 text-brand-400 group-hover:text-white" />
                              <span>View Ledger</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Chart of Accounts */}
      {activeTab === 'coa' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">Chart of Accounts ({accounts.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Normal</th>
                  <th className="py-3 px-4 text-right">Debit Activity</th>
                  <th className="py-3 px-4 text-right">Credit Activity</th>
                  <th className="py-3 px-4 text-right">Current Balance</th>
                  <th className="py-3 px-4 text-center">Ledger Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-slate-500">Loading accounts...</td>
                  </tr>
                ) : (
                  accounts.map((a) => (
                    <tr
                      key={a._id}
                      onClick={() => openAccountDrilldown(a)}
                      className="hover:bg-slate-850/70 cursor-pointer transition group"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-brand-400 group-hover:underline">{a.account_code}</td>
                      <td className="py-3.5 px-4 font-medium text-white">
                        <div className="flex items-center space-x-2">
                          <span>{a.account_name}</span>
                          {a.is_fiduciary && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-mono">
                              Texas § 4053
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                          {a.account_type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">{a.normal_balance}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-semibold">
                        {parseFloat(a.total_debits || 0) > 0 ? `$${parseFloat(a.total_debits).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-400 font-semibold">
                        {parseFloat(a.total_credits || 0) > 0 ? `$${parseFloat(a.total_credits).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white text-[13px]">
                        ${parseFloat(a.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAccountDrilldown(a);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-brand-600 hover:text-white text-slate-300 font-medium text-[11px] inline-flex items-center space-x-1.5 transition border border-slate-700"
                        >
                          <FileText className="w-3 h-3 text-brand-400 group-hover:text-white" />
                          <span>View Ledger</span>
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

      {/* Tab: Periods */}
      {activeTab === 'periods' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">Fiscal Accounting Periods (Period Lock Protection)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-5">Period</th>
                  <th className="py-3 px-5">Year</th>
                  <th className="py-3 px-5">Date Range</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Lock Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500">Loading periods...</td>
                  </tr>
                ) : (
                  periods.map((p) => {
                    const isLocked = p.status === 'LOCKED' || p.status === 'HARD_CLOSED';
                    return (
                      <tr key={p._id} className="hover:bg-slate-850/50 transition">
                        <td className="py-3.5 px-5 font-mono font-bold text-white">{p.period_name}</td>
                        <td className="py-3.5 px-5 font-mono text-slate-400">{p.fiscal_year}</td>
                        <td className="py-3.5 px-5 font-mono text-slate-400 text-[11px]">
                          {new Date(p.start_date).toISOString().slice(0, 10)} to {new Date(p.end_date).toISOString().slice(0, 10)}
                        </td>
                        <td className="py-3.5 px-5">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              isLocked
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            onClick={() => handleTogglePeriodLock(p._id, p.status)}
                            className={`py-1 px-2.5 rounded text-[11px] font-semibold flex items-center space-x-1 ml-auto transition ${
                              isLocked
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                                : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40'
                            }`}
                          >
                            {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            <span>{isLocked ? 'Re-open Period' : 'Hard Close Period'}</span>
                          </button>
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

      {/* Tab: Posting Rules */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Event-Driven Accounting Posting Rules</h3>
            <p className="text-xs text-slate-400">
              Posting rules translate operational insurance lifecycle events (e.g., Policy Bound, Direct Invoice, Down Payment) into double-entry balanced journals without arbitrary scripts.
            </p>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs">Loading posting rules...</div>
            ) : postingRules.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
                No custom posting rules defined. Standard hardcoded engine defaults active.
              </div>
            ) : (
              postingRules.map(r => (
                <div key={r._id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 font-bold">
                          {r.rule_code}
                        </span>
                        <h4 className="text-sm font-bold text-white">{r.rule_name}</h4>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                          {r.event_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{r.description}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400 uppercase">{r.status}</span>
                  </div>

                  {r.lines && r.lines.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1.5">Rule Lines:</div>
                      <div className="space-y-1">
                        {r.lines.map((l, idx) => (
                          <div key={idx} className="flex items-center space-x-3 text-xs font-mono text-slate-300">
                            <span className={l.direction === 'DEBIT' ? 'text-emerald-400 font-bold' : 'text-blue-400 font-bold'}>
                              {l.direction}
                            </span>
                            <span>Account {l.account_code}</span>
                            <span className="text-slate-500">← {l.amount_field}</span>
                            <span className="text-slate-400 italic text-[11px]">"{l.description_template}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: Exchange Rates */}
      {activeTab === 'fx' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">Multi-Currency Exchange Rates ({exchangeRates.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-5">Pair</th>
                  <th className="py-3 px-5">Effective Date</th>
                  <th className="py-3 px-5 text-right">Conversion Rate</th>
                  <th className="py-3 px-5">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-slate-500">Loading exchange rates...</td>
                  </tr>
                ) : exchangeRates.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-slate-500">No exchange rates recorded. Base currency USD applied.</td>
                  </tr>
                ) : (
                  exchangeRates.map((fx) => (
                    <tr key={fx._id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-5 font-mono font-bold text-brand-400">
                        {fx.from_currency} / {fx.to_currency}
                      </td>
                      <td className="py-3.5 px-5 font-mono text-slate-400">
                        {new Date(fx.effective_date).toISOString().slice(0, 10)}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono font-semibold text-white">
                        {parseFloat(fx.rate).toFixed(6)}
                      </td>
                      <td className="py-3.5 px-5 text-slate-400 font-mono text-[11px]">{fx.source}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: View Journal Lines Drilldown */}
      {selectedJournal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-base text-brand-400">{selectedJournal.journal_number}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      selectedJournal.status === 'POSTED'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}
                  >
                    {selectedJournal.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1">{selectedJournal.memo}</div>
                <div className="flex space-x-4 text-[11px] font-mono text-slate-500 mt-2">
                  <span>Posting Date: {new Date(selectedJournal.posting_date).toISOString().slice(0, 10)}</span>
                  <span>Source: {selectedJournal.source_module}</span>
                  {selectedJournal.reference_id && <span>Ref: {selectedJournal.reference_id}</span>}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {selectedJournal.status === 'POSTED' && (
                  <button
                    onClick={() => handleReverseJournal(selectedJournal._id)}
                    disabled={reversing}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/40 flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{reversing ? 'Reversing...' : 'Reverse Journal'}</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedJournal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Lines list */}
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-4">Account Code</th>
                    <th className="py-2.5 px-4">Memo / Dimensions</th>
                    <th className="py-2.5 px-4 text-right">Debit</th>
                    <th className="py-2.5 px-4 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {loadingJournalLines ? (
                    <tr>
                      <td colSpan="5" className="py-6 text-center text-slate-500">Loading journal lines...</td>
                    </tr>
                  ) : journalLines.map((l) => (
                    <tr key={l._id}>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{l.line_number}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-white">{l.account_code}</td>
                      <td className="py-2.5 px-4 text-slate-300">
                        <div>{l.memo || '—'}</div>
                        {l.dimensions && Object.keys(l.dimensions).some(k => l.dimensions[k]) && (
                          <div className="flex flex-wrap gap-1 mt-1 font-mono text-[9px]">
                            {Object.entries(l.dimensions)
                              .filter(([k, v]) => v && !['policy_id'].includes(k))
                              .map(([k, v]) => {
                                let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
                                if (k.includes('carrier')) badgeColor = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
                                else if (k.includes('broker') || k.includes('producer')) badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                                else if (k.includes('mga')) badgeColor = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
                                else if (k.includes('cost_center') || k === 'cc') badgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                                else if (k.includes('comp')) badgeColor = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';

                                return (
                                  <span key={k} className={`px-1.5 py-0.5 rounded border ${badgeColor}`}>
                                    <strong className="opacity-75">{k}:</strong> {String(v)}
                                  </span>
                                );
                              })}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-400">
                        {parseFloat(l.debit) > 0 ? `$${parseFloat(l.debit).toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-400">
                        {parseFloat(l.credit) > 0 ? `$${parseFloat(l.credit).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-800 text-xs font-mono mt-4">
              <span className="text-slate-400">Double-Entry Balanced Totals:</span>
              <div className="space-x-6 text-emerald-400 font-bold">
                <span>Total Dr: ${parseFloat(selectedJournal.total_debit).toFixed(2)}</span>
                <span>Total Cr: ${parseFloat(selectedJournal.total_credit).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Journal */}
      {showNewJournalModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Post Balanced Double-Entry Journal</h3>
            <p className="text-xs text-slate-400 mb-4">
              All debits must equal credits. Backdated posting is prohibited in locked or hard-closed accounting periods.
            </p>

            <form onSubmit={handlePostJournal} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Posting Date</label>
                  <input
                    type="date"
                    required
                    value={newJournalForm.posting_date}
                    onChange={(e) => setNewJournalForm({ ...newJournalForm, posting_date: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Source Module</label>
                  <select
                    value={newJournalForm.source_module}
                    onChange={(e) => setNewJournalForm({ ...newJournalForm, source_module: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="GL_MANUAL">GL_MANUAL (Manual Journal)</option>
                    <option value="POLICY_BIND">POLICY_BIND (Policy Gross AR & UPR)</option>
                    <option value="BILLING_AR">BILLING_AR (Billing Clearance)</option>
                    <option value="TREASURY_BANK_REC">TREASURY_BANK_REC (Cash Receipt)</option>
                    <option value="FINANCE_CLOSE">FINANCE_CLOSE (UPR Recognition)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Reference ID</label>
                  <input
                    type="text"
                    placeholder="e.g. POL-TX-8821"
                    value={newJournalForm.reference_id}
                    onChange={(e) => setNewJournalForm({ ...newJournalForm, reference_id: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Memo / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Initial Policy Gross Premium & UPR Reserve"
                  value={newJournalForm.memo}
                  onChange={(e) => setNewJournalForm({ ...newJournalForm, memo: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Lines Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-300">Journal Lines (Debits & Credits)</span>
                  <button
                    type="button"
                    onClick={addJournalLine}
                    className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {newJournalForm.lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-850 p-2 rounded-lg border border-slate-800">
                      <div className="col-span-4">
                        <select
                          required
                          value={line.account_code}
                          onChange={(e) => handleLineChange(idx, 'account_code', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white font-mono focus:border-brand-500 focus:outline-none"
                        >
                          <option value="">Select Account...</option>
                          {accounts.map((acc) => (
                            <option key={acc._id || acc.account_code} value={acc.account_code}>
                              {acc.account_code} - {acc.account_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Debit ($)"
                          value={line.debit}
                          onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-emerald-400 font-mono"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Credit ($)"
                          value={line.credit}
                          onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-emerald-400 font-mono"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="Line memo"
                          value={line.memo}
                          onChange={(e) => handleLineChange(idx, 'memo', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeJournalLine(idx)}
                          disabled={newJournalForm.lines.length <= 2}
                          className="text-slate-500 hover:text-rose-400 text-xs disabled:opacity-30 cursor-pointer"
                          title={newJournalForm.lines.length <= 2 ? 'Minimum 2 lines required' : 'Delete line'}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Preview Box */}
              {journalPreview && (
                <div className="p-3 rounded-lg bg-slate-850 border border-slate-800 flex justify-between items-center text-xs font-mono">
                  <div>
                    <span className="text-slate-400">Total Dr: </span>
                    <span className="text-white font-bold">${journalPreview.total_debit}</span>
                    <span className="text-slate-400 ml-4">Total Cr: </span>
                    <span className="text-white font-bold">${journalPreview.total_credit}</span>
                  </div>
                  <div className={journalPreview.is_balanced ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {journalPreview.is_balanced ? '✓ Balanced (Equilibrium)' : `Imbalance: $${journalPreview.difference}`}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewJournalModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingJournal || (journalPreview && !journalPreview.is_balanced)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 transition disabled:opacity-50"
                >
                  {submittingJournal ? 'Posting...' : 'Post Journal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Account */}
      {showNewAccountModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Add Chart of Accounts (COA) Account</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add a custom ledger account to this tenant workspace.
            </p>

            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Account Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1005"
                  value={newAccountForm.account_code}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, account_code: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Petty Cash"
                  value={newAccountForm.account_name}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, account_name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
                  <select
                    value={newAccountForm.account_type}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, account_type: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  >
                    <option value="ASSET">ASSET</option>
                    <option value="LIABILITY">LIABILITY</option>
                    <option value="EQUITY">EQUITY</option>
                    <option value="REVENUE">REVENUE</option>
                    <option value="EXPENSE">EXPENSE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Normal Balance</label>
                  <select
                    value={newAccountForm.normal_balance}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, normal_balance: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  >
                    <option value="DEBIT">DEBIT</option>
                    <option value="CREDIT">CREDIT</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="fiduciaryCheck"
                  checked={newAccountForm.is_fiduciary}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, is_fiduciary: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-brand-500"
                />
                <label htmlFor="fiduciaryCheck" className="text-xs text-slate-300">
                  Statutory Fiduciary Account (Texas § 4053)
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewAccountModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAccount}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 transition disabled:opacity-50"
                >
                  {submittingAccount ? 'Saving...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New FX Rate */}
      {showNewFxModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Record Multi-Currency Exchange Rate</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter daily or monthly effective currency conversion factor.
            </p>

            <form onSubmit={handleCreateFx} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">From Currency</label>
                  <input
                    type="text"
                    required
                    value={newFxForm.from_currency}
                    onChange={(e) => setNewFxForm({ ...newFxForm, from_currency: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">To Currency</label>
                  <input
                    type="text"
                    required
                    value={newFxForm.to_currency}
                    onChange={(e) => setNewFxForm({ ...newFxForm, to_currency: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Effective Date</label>
                <input
                  type="date"
                  required
                  value={newFxForm.effective_date}
                  onChange={(e) => setNewFxForm({ ...newFxForm, effective_date: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Exchange Rate (to 6 decimals)</label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={newFxForm.rate}
                  onChange={(e) => setNewFxForm({ ...newFxForm, rate: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewFxModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFx}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 transition disabled:opacity-50"
                >
                  {submittingFx ? 'Saving...' : 'Record Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Account Activity & Ledger Drilldown Drawer */}
      {drilldownAccount && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <div className="flex items-center space-x-2.5">
                  <span className="font-mono text-lg font-bold text-brand-400">{drilldownAccount.account_code}</span>
                  <span className="text-lg font-semibold text-white">{drilldownAccount.account_name}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs">{drilldownAccount.account_type}</span>
                  {drilldownAccount.is_fiduciary && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-mono">
                      Texas § 4053
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Full General Ledger double-entry postings for {drilldownAccount.account_name} (Normal: {drilldownAccount.normal_balance}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrilldownAccount(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary KPI Chips */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Total Debits Incurred</div>
                <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">
                  ${parseFloat(drilldownAccount.total_debits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Total Credits Relieved</div>
                <div className="text-base font-mono font-bold text-amber-400 mt-0.5">
                  ${parseFloat(drilldownAccount.total_credits || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Current Net Ending Balance</div>
                <div className="text-base font-mono font-bold text-white mt-0.5">
                  ${parseFloat(drilldownAccount.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Transactions Activity Table */}
            <div className="flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950">
              {drilldownLoading ? (
                <div className="py-12 text-center text-slate-500 font-sans text-xs">Loading ledger journal activity...</div>
              ) : drilldownActivity.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-sans text-xs">
                  No individual journal postings recorded for Account {drilldownAccount.account_code} yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-850 text-slate-400 uppercase font-mono text-[10px] sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Journal #</th>
                      <th className="py-2.5 px-3">Source Module</th>
                      <th className="py-2.5 px-3">Memo / Justification</th>
                      <th className="py-2.5 px-3 text-right">Debit ($)</th>
                      <th className="py-2.5 px-3 text-right">Credit ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                    {drilldownActivity.map((line) => {
                      const drVal = parseFloat(line.debit?.$numberDecimal || line.debit || 0);
                      const crVal = parseFloat(line.credit?.$numberDecimal || line.credit || 0);
                      return (
                        <tr key={line._id} className="hover:bg-slate-900/60 transition">
                          <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                            {line.journal_id?.posting_date?.slice(0, 10) || line.createdAt?.slice(0, 10)}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-brand-400 whitespace-nowrap">
                            {line.journal_id?.journal_number || 'JE-ENTRY'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[9px]">
                              {line.journal_id?.source_module || 'GL'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-200">
                            {line.memo || line.journal_id?.memo || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold whitespace-nowrap">
                            {drVal > 0 ? `$${drVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-amber-400 font-semibold whitespace-nowrap">
                            {crVal > 0 ? `$${crVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800 mt-4">
              <button
                type="button"
                onClick={() => setDrilldownAccount(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
              >
                Close Ledger Drilldown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
