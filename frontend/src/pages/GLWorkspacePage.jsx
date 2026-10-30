import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi, commercialApi } from '../services/api';
import SearchableDropdown from '../components/SearchableDropdown';
import {
  BookOpen,
  PlusCircle,
  Plus,
  Trash2,
  Edit3,
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
  X,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Scale,
  Check,
  ShieldCheck,
  Link2,
  ExternalLink,
  Sparkles,
  Calendar,
  CalendarDays
} from 'lucide-react';

const LEDGER_PRESETS = [
  {
    id: 'capital',
    name: 'Capital Account',
    icon: '💰',
    hint: 'Owner / Partner Capital (Equity)',
    groupSearch: 'Capital Account',
    account_type: 'EQUITY',
    normal_balance: 'CREDIT',
    codePrefix: '300',
    minCode: 3001
  },
  {
    id: 'bank',
    name: 'Bank Account',
    icon: '🏦',
    hint: 'Current / Savings Account',
    groupSearch: 'Bank Accounts',
    account_type: 'ASSET',
    normal_balance: 'DEBIT',
    codePrefix: '100',
    minCode: 1002
  },
  {
    id: 'cash',
    name: 'Cash-in-Hand',
    icon: '💵',
    hint: 'Physical Cash / Petty Cash',
    groupSearch: 'Cash-in-Hand',
    account_type: 'ASSET',
    normal_balance: 'DEBIT',
    codePrefix: '100',
    minCode: 1001
  },
  {
    id: 'debtor',
    name: 'Customer (Sundry Debtor)',
    icon: '👤',
    hint: 'Client / Buyer Receivable',
    groupSearch: 'Sundry Debtors',
    account_type: 'ASSET',
    normal_balance: 'DEBIT',
    codePrefix: '110',
    minCode: 1101
  },
  {
    id: 'creditor',
    name: 'Supplier (Sundry Creditor)',
    icon: '🏢',
    hint: 'Vendor / Raw Material Payable',
    groupSearch: 'Sundry Creditors',
    account_type: 'LIABILITY',
    normal_balance: 'CREDIT',
    codePrefix: '200',
    minCode: 2001
  },
  {
    id: 'sales',
    name: 'Sales Account',
    icon: '📈',
    hint: 'Goods / Product Sales Revenue',
    groupSearch: 'Sales Accounts',
    account_type: 'REVENUE',
    normal_balance: 'CREDIT',
    codePrefix: '400',
    minCode: 4001
  },
  {
    id: 'purchase',
    name: 'Purchase Account',
    icon: '🛒',
    hint: 'Trading Goods / Raw Material Buy',
    groupSearch: 'Purchase Accounts',
    account_type: 'EXPENSE',
    normal_balance: 'DEBIT',
    codePrefix: '500',
    minCode: 5001
  },
  {
    id: 'expense',
    name: 'Indirect Expense',
    icon: '💡',
    hint: 'Rent, Staff Salary, Electricity, Tea',
    groupSearch: 'Indirect Expenses',
    account_type: 'EXPENSE',
    normal_balance: 'DEBIT',
    codePrefix: '510',
    minCode: 5101
  },
  {
    id: 'duties_taxes',
    name: 'Duties & Taxes (GST/TDS)',
    icon: '🏛️',
    hint: 'GST Input / Output, TDS Payable',
    groupSearch: 'Duties & Taxes',
    account_type: 'LIABILITY',
    normal_balance: 'CREDIT',
    codePrefix: '210',
    minCode: 2101
  }
];

export default function GLWorkspacePage() {
  const { currentWorkspace } = useAuth();
  const [activeTab, setActiveTab] = useState('journals'); // 'journals' | 'coa' | 'opening_balances' | 'trial_balance' | 'statements' | 'periods' | 'rules' | 'fx'

  // Data states
  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [trialBalance, setTrialBalance] = useState(null);
  const [financialStatements, setFinancialStatements] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [showNewCalendarModal, setShowNewCalendarModal] = useState(false);
  const [calendarForm, setCalendarForm] = useState({
    calendar_code: 'US_RETAIL_445',
    calendar_name: 'US Retail 4-4-5 Calendar',
    calendar_type: 'RETAIL_445',
    fiscal_year_start_month: 2,
    week_start_day: 'SUNDAY',
    week_end_day: 'SATURDAY',
    year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
    anchor_month: 1,
    fifty_three_week_policy: 'ADD_TO_LAST_PERIOD',
    is_default: true,
    description: 'National Retail Federation (NRF) 4-4-5 Standard Retail Calendar'
  });
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());
  const [generatingPeriods, setGeneratingPeriods] = useState(false);
  const [postingRules, setPostingRules] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // COA Hierarchy View Mode
  const [coaViewMode, setCoaViewMode] = useState('tree'); // 'tree' | 'table'
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Opening Balances Setup State
  const [openingBalanceSetup, setOpeningBalanceSetup] = useState(null);
  const [openingBalanceLines, setOpeningBalanceLines] = useState([]);
  const [obFinancialYear, setObFinancialYear] = useState(new Date().getFullYear());
  const [obAllowSuspense, setObAllowSuspense] = useState(false);
  const [obSuspenseAccountId, setObSuspenseAccountId] = useState('');
  const [obSearchTerm, setObSearchTerm] = useState('');
  const [savingObDraft, setSavingObDraft] = useState(false);
  const [postingObJournal, setPostingObJournal] = useState(false);

  // Invoices for Reference Lookup in Manual Journal
  const [commercialInvoices, setCommercialInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

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
    commercial_document_id: null,
    reference_type: 'NONE',
    reference_document_number: null,
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
    parent_account_id: '',
    is_group: false,
    group_type: 'LEDGER',
    is_posting_allowed: true,
    opening_balance: '',
    is_fiduciary: false,
    subledger_type: 'NONE'
  });
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [showAdvancedAccountSettings, setShowAdvancedAccountSettings] = useState(false);
  const [activePresetId, setActivePresetId] = useState(null);

  // Edit Account State
  const [editingAccount, setEditingAccount] = useState(null);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [editAccountForm, setEditAccountForm] = useState({
    account_code: '',
    account_name: '',
    description: '',
    account_type: 'ASSET',
    normal_balance: 'DEBIT',
    parent_account_id: '',
    is_group: false,
    group_type: 'LEDGER',
    is_posting_allowed: true,
    opening_balance: '',
    opening_balance_type: 'DEBIT',
    is_fiduciary: false,
    is_control_account: false,
    subledger_type: 'NONE',
    currency: 'USD',
    status: 'ACTIVE'
  });
  const [submittingEditAccount, setSubmittingEditAccount] = useState(false);
  const [showAdvancedEditAccountSettings, setShowAdvancedEditAccountSettings] = useState(false);

  // Helper to suggest next account code in sequence for a group or series
  const suggestNextAccountCode = (parentGroup, accType, allAccounts) => {
    let minCode = 1000;
    let maxCode = 1999;

    const parentCode = (parentGroup?.account_code || '').toUpperCase();
    const parentName = (parentGroup?.account_name || '').toLowerCase();

    if (parentCode.includes('BANK') || parentName.includes('bank')) {
      minCode = 1002;
      maxCode = 1099;
    } else if (parentCode.includes('CASH') || parentName.includes('cash')) {
      minCode = 1001;
      maxCode = 1009;
    } else if (parentCode.includes('DEBTOR') || parentName.includes('debtor')) {
      minCode = 1101;
      maxCode = 1199;
    } else if (parentCode.includes('STOCK') || parentName.includes('stock')) {
      minCode = 1201;
      maxCode = 1299;
    } else if (parentCode.includes('CREDITOR') || parentName.includes('creditor')) {
      minCode = 2001;
      maxCode = 2099;
    } else if (parentCode.includes('TAX') || parentCode.includes('DUTIES') || parentName.includes('duties')) {
      minCode = 2101;
      maxCode = 2199;
    } else if (parentCode.includes('CAPITAL') || parentName.includes('capital') || accType === 'EQUITY') {
      minCode = 3001;
      maxCode = 3099;
    } else if (parentCode.includes('SALES') || parentName.includes('sales') || accType === 'REVENUE') {
      minCode = 4001;
      maxCode = 4999;
    } else if (parentCode.includes('PURCHASE') || parentName.includes('purchase')) {
      minCode = 5001;
      maxCode = 5099;
    } else if (parentCode.includes('DIR-EXP') || parentName.includes('direct exp')) {
      minCode = 5003;
      maxCode = 5099;
    } else if (parentCode.includes('INDIR-EXP') || parentName.includes('indirect exp') || accType === 'EXPENSE') {
      minCode = 5101;
      maxCode = 5999;
    } else if (accType === 'ASSET') {
      minCode = 1000;
      maxCode = 1999;
    } else if (accType === 'LIABILITY') {
      minCode = 2000;
      maxCode = 2999;
    }

    const existingCodes = (allAccounts || [])
      .map(a => parseInt(a.account_code, 10))
      .filter(c => !isNaN(c) && c >= minCode && c <= maxCode);

    if (existingCodes.length === 0) {
      return String(minCode);
    }

    const maxExisting = Math.max(...existingCodes);
    return String(maxExisting + 1);
  };

  // Quick apply template preset
  const handleApplyPreset = (preset) => {
    setActivePresetId(preset.id);
    const matchedGroup = accounts.find(a =>
      (a.is_group || a.is_posting_allowed === false) &&
      (a.account_name.toLowerCase().includes(preset.groupSearch.toLowerCase()) ||
       a.account_code.toLowerCase().includes(preset.groupSearch.toLowerCase()))
    );

    const parentId = matchedGroup ? matchedGroup._id : '';
    const nextCode = suggestNextAccountCode(matchedGroup, preset.account_type, accounts);

    setNewAccountForm(prev => ({
      ...prev,
      account_code: nextCode,
      parent_account_id: parentId,
      account_type: preset.account_type,
      normal_balance: preset.normal_balance,
      opening_balance_type: preset.normal_balance,
      is_group: false,
      is_posting_allowed: true
    }));
  };

  // Smart code detection when user types an account code
  const handleAccountCodeChange = (code) => {
    let inferredType = newAccountForm.account_type;
    let inferredBalance = newAccountForm.normal_balance;

    const trimmed = code.trim();
    if (trimmed.length > 0 && !newAccountForm.is_group) {
      const firstChar = trimmed[0];
      if (firstChar === '1') {
        inferredType = 'ASSET';
        inferredBalance = 'DEBIT';
      } else if (firstChar === '2') {
        inferredType = 'LIABILITY';
        inferredBalance = 'CREDIT';
      } else if (firstChar === '3') {
        inferredType = 'EQUITY';
        inferredBalance = 'CREDIT';
      } else if (firstChar === '4') {
        inferredType = 'REVENUE';
        inferredBalance = 'CREDIT';
      } else if (firstChar === '5') {
        inferredType = 'EXPENSE';
        inferredBalance = 'DEBIT';
      }
    }

    setNewAccountForm(prev => ({
      ...prev,
      account_code: code,
      account_type: inferredType,
      normal_balance: inferredBalance,
      opening_balance_type: inferredBalance
    }));
  };

  // Helper description of current code series
  const getCodeSeriesInfo = (code) => {
    const trimmed = (code || '').trim();
    if (!trimmed) return null;
    const first = trimmed[0];
    switch (first) {
      case '1':
        return { label: '1000s: Current / Fixed Asset', type: 'ASSET', balance: 'DEBIT (Dr)', color: 'text-emerald-400 border-emerald-800/60 bg-emerald-950/40' };
      case '2':
        return { label: '2000s: Current / Term Liability', type: 'LIABILITY', balance: 'CREDIT (Cr)', color: 'text-amber-400 border-amber-800/60 bg-amber-950/40' };
      case '3':
        return { label: '3000s: Capital / Owner Equity', type: 'EQUITY', balance: 'CREDIT (Cr)', color: 'text-purple-400 border-purple-800/60 bg-purple-950/40' };
      case '4':
        return { label: '4000s: Sales / Operating Revenue', type: 'REVENUE', balance: 'CREDIT (Cr)', color: 'text-blue-400 border-blue-800/60 bg-blue-950/40' };
      case '5':
        return { label: '5000s: Purchase / Operating Expense', type: 'EXPENSE', balance: 'DEBIT (Dr)', color: 'text-rose-400 border-rose-800/60 bg-rose-950/40' };
      default:
        return null;
    }
  };

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

  // Posting Rule States (CRUD)
  const DEFAULT_GL_RULE = {
    rule_code: 'RULE_COMMERCIAL_SALES',
    event_type: 'COMMERCIAL_INVOICE_ISSUED',
    rule_name: 'Commercial Sales Invoice AR & Revenue Recognition',
    description: 'Debit Trade Receivables 1101, Credit Sales Revenue 4001',
    applicable_module: 'GL',
    lines: [
      { account_code: '1101', direction: 'DEBIT', amount_field: 'subtotal', description_template: 'Trade AR' },
      { account_code: '4001', direction: 'CREDIT', amount_field: 'subtotal', description_template: 'Sales Revenue' }
    ]
  };
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [newRuleForm, setNewRuleForm] = useState(DEFAULT_GL_RULE);
  const [showEditRuleModal, setShowEditRuleModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editRuleForm, setEditRuleForm] = useState({
    rule_code: '',
    event_type: '',
    rule_name: '',
    description: '',
    applicable_module: 'GL',
    lines: []
  });
  const [submittingRule, setSubmittingRule] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState(null);

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
  }, [currentWorkspace, activeTab, obFinancialYear]);

  const loadCommercialInvoices = async () => {
    if (commercialInvoices.length > 0) return;
    setLoadingInvoices(true);
    try {
      const res = await commercialApi.getDocuments('?status=POSTED&limit=100');
      if (res && res.success && res.data?.documents) {
        setCommercialInvoices(res.data.documents);
      }
    } catch (err) {
      console.warn('Failed to load commercial documents for journal lookup:', err.message);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const openNewJournalModal = () => {
    setShowNewJournalModal(true);
    if (accounts.length === 0) {
      authApi.getAccounts().then(res => { if (res && res.success) setAccounts(res.data); });
    }
    loadCommercialInvoices();
  };

  const openNewAccountModal = () => {
    setShowNewAccountModal(true);
    if (accounts.length === 0 || !accounts.some(a => a.is_group)) {
      authApi.getAccounts().then(res => { if (res && res.success) setAccounts(res.data); });
    }
  };

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
      } else if (activeTab === 'opening_balances') {
        const [obRes, accsRes] = await Promise.all([
          authApi.getOpeningBalances({ financial_year: obFinancialYear }),
          authApi.getAccounts()
        ]);
        if (obRes.success && obRes.data) {
          setOpeningBalanceSetup(obRes.data);
          setOpeningBalanceLines(obRes.data.lines || []);
          setObAllowSuspense(!!obRes.data.allow_suspense);
          setObSuspenseAccountId(obRes.data.suspense_account_id || '');
        }
        if (accsRes.success) setAccounts(accsRes.data);
      } else if (activeTab === 'trial_balance') {
        const res = await authApi.getTrialBalance();
        if (res.success) setTrialBalance(res.data);
      } else if (activeTab === 'statements') {
        const res = await authApi.getFinancialStatements();
        if (res.success) setFinancialStatements(res.data);
      } else if (activeTab === 'periods') {
        const [periodsRes, calsRes] = await Promise.all([
          authApi.getPeriods(),
          authApi.getAccountingCalendars()
        ]);
        if (periodsRes.success) setPeriods(periodsRes.data);
        if (calsRes.success) {
          setCalendars(calsRes.data);
          const defaultCal = calsRes.data.find(c => c.is_default) || calsRes.data[0];
          if (defaultCal && !selectedCalendarId) {
            setSelectedCalendarId(defaultCal._id);
          }
        }
      } else if (activeTab === 'rules') {
        const [rulesRes, accsRes] = await Promise.all([
          authApi.getPostingRules(),
          authApi.getAccounts()
        ]);
        if (rulesRes.success) setPostingRules(rulesRes.data);
        if (accsRes.success) setAccounts(accsRes.data);
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

  // Handle Opening Balance Line Changes
  const handleObLineChange = (index, field, value) => {
    const updated = [...openingBalanceLines];
    updated[index] = { ...updated[index], [field]: value };
    // Clear opposite side to prevent having both Dr and Cr on same account
    if (field === 'debit' && parseFloat(value) > 0) {
      updated[index].credit = '';
    } else if (field === 'credit' && parseFloat(value) > 0) {
      updated[index].debit = '';
    }
    setOpeningBalanceLines(updated);
  };

  const obTotals = useMemo(() => {
    let dr = 0;
    let cr = 0;
    for (const l of openingBalanceLines) {
      dr += parseFloat(l.debit || 0);
      cr += parseFloat(l.credit || 0);
    }
    const diff = dr - cr;
    return {
      totalDr: dr.toFixed(2),
      totalCr: cr.toFixed(2),
      diff: diff.toFixed(2),
      diffAbs: Math.abs(diff).toFixed(2),
      isBalanced: Math.abs(diff) < 0.005 && dr > 0
    };
  }, [openingBalanceLines]);

  const handleSaveObDraft = async () => {
    setSavingObDraft(true);
    setErrorMsg(null);
    try {
      const res = await authApi.saveOpeningBalancesDraft({
        financial_year: obFinancialYear,
        lines: openingBalanceLines.map(l => ({
          account_code: l.account_code,
          ledger_account_id: l.ledger_account_id,
          debit: l.debit || '0.00',
          credit: l.credit || '0.00'
        })),
        allow_suspense: obAllowSuspense,
        suspense_account_id: obSuspenseAccountId || null
      });
      if (res.success) {
        setSuccessMsg('Opening balances draft saved successfully!');
        setOpeningBalanceSetup(res.data);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSavingObDraft(false);
    }
  };

  const handlePostObJournal = async () => {
    setPostingObJournal(true);
    setErrorMsg(null);
    try {
      const res = await authApi.postOpeningBalances({
        financial_year: obFinancialYear,
        allow_suspense: obAllowSuspense,
        suspense_account_id: obSuspenseAccountId || null
      });
      if (res.success) {
        setSuccessMsg(res.message || 'Opening balances posted successfully to General Ledger!');
        if (res.data?.setup) setOpeningBalanceSetup(res.data.setup);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setPostingObJournal(false);
    }
  };

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
      lines: [...newJournalForm.lines, { account_code: '', debit: '', credit: '', memo: '' }]
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
          commercial_document_id: null,
          reference_type: 'NONE',
          reference_document_number: null,
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
      const payload = {
        ...newAccountForm,
        is_posting_allowed: newAccountForm.is_group ? false : true,
        group_type: newAccountForm.is_group
          ? (newAccountForm.parent_account_id ? 'SUBGROUP' : 'PRIMARY_GROUP')
          : 'LEDGER',
        opening_balance: !newAccountForm.is_group && newAccountForm.opening_balance ? Number(newAccountForm.opening_balance) : 0,
        opening_balance_type: !newAccountForm.is_group && newAccountForm.opening_balance ? newAccountForm.opening_balance_type : null
      };
      const res = await authApi.createAccount(payload);
      if (res.success) {
        setSuccessMsg(`Account / Group ${newAccountForm.account_code} created successfully!`);
        setShowNewAccountModal(false);
        setNewAccountForm({
          account_code: '',
          account_name: '',
          description: '',
          account_type: 'ASSET',
          normal_balance: 'DEBIT',
          parent_account_id: '',
          is_group: false,
          group_type: 'LEDGER',
          is_posting_allowed: true,
          opening_balance: '',
          opening_balance_type: 'DEBIT',
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

  // Open Edit Modal for Account / Group
  const openEditAccountModal = (account) => {
    if (!account) return;
    setEditingAccount(account);
    const isGrp = Boolean(account.is_group || account.is_posting_allowed === false);
    setEditAccountForm({
      account_code: account.account_code || '',
      account_name: account.account_name || '',
      description: account.description || '',
      account_type: account.account_type || 'ASSET',
      normal_balance: account.normal_balance || 'DEBIT',
      parent_account_id: account.parent_account_id?._id || account.parent_account_id || '',
      is_group: isGrp,
      group_type: account.group_type || (isGrp ? 'SUBGROUP' : 'LEDGER'),
      is_posting_allowed: typeof account.is_posting_allowed === 'boolean' ? account.is_posting_allowed : !isGrp,
      opening_balance: account.opening_balance ? parseFloat(account.opening_balance).toString() : '',
      opening_balance_type: account.opening_balance_type || account.normal_balance || 'DEBIT',
      is_fiduciary: Boolean(account.is_fiduciary),
      is_control_account: Boolean(account.is_control_account),
      subledger_type: account.subledger_type || 'NONE',
      currency: account.currency || 'USD',
      status: account.status || 'ACTIVE'
    });
    setShowEditAccountModal(true);
  };

  // Submit Account / Group Updates
  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSubmittingEditAccount(true);
    setErrorMsg(null);
    try {
      const payload = {
        account_code: editAccountForm.account_code,
        account_name: editAccountForm.account_name,
        description: editAccountForm.description,
        account_type: editAccountForm.account_type,
        normal_balance: editAccountForm.normal_balance,
        parent_account_id: editAccountForm.parent_account_id || null,
        is_group: editAccountForm.is_group,
        group_type: editAccountForm.is_group
          ? (editAccountForm.parent_account_id ? 'SUBGROUP' : 'PRIMARY_GROUP')
          : 'LEDGER',
        is_posting_allowed: editAccountForm.is_group ? false : editAccountForm.is_posting_allowed,
        is_fiduciary: editAccountForm.is_fiduciary,
        is_control_account: editAccountForm.is_control_account,
        subledger_type: editAccountForm.subledger_type,
        currency: editAccountForm.currency,
        status: editAccountForm.status,
        opening_balance: !editAccountForm.is_group && editAccountForm.opening_balance !== ''
          ? Number(editAccountForm.opening_balance)
          : undefined,
        opening_balance_type: editAccountForm.opening_balance_type
      };

      const res = await authApi.updateAccount(editingAccount._id, payload);
      if (res.success) {
        setSuccessMsg(res.message || `Account "${editAccountForm.account_code} - ${editAccountForm.account_name}" updated successfully!`);
        setShowEditAccountModal(false);
        setEditingAccount(null);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingEditAccount(false);
    }
  };

  // Posting Rule CRUD Operations
  const handleAddRuleLine = () => {
    const nextNum = newRuleForm.lines.length + 1;
    setNewRuleForm({
      ...newRuleForm,
      lines: [
        ...newRuleForm.lines,
        {
          account_code: accounts.length > 0 ? accounts[0].account_code : '1101',
          direction: 'CREDIT',
          amount_field: 'subtotal',
          description_template: `Line ${nextNum}`
        }
      ]
    });
  };

  const handleRemoveRuleLine = (idxToRemove) => {
    if (newRuleForm.lines.length <= 2) {
      setErrorMsg('A valid double-entry posting rule requires at least 2 lines (Debit and Credit).');
      return;
    }
    setNewRuleForm({
      ...newRuleForm,
      lines: newRuleForm.lines.filter((_, idx) => idx !== idxToRemove)
    });
  };

  const handleCreatePostingRule = async (e) => {
    e.preventDefault();
    setSubmittingRule(true);
    setErrorMsg(null);
    try {
      const res = await authApi.createPostingRule(newRuleForm);
      if (res.success) {
        setSuccessMsg(`Posting rule ${newRuleForm.rule_code} created successfully!`);
        setShowNewRuleModal(false);
        setNewRuleForm(DEFAULT_GL_RULE);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingRule(false);
    }
  };

  const handleOpenEditRule = (rule) => {
    setEditingRuleId(rule._id);
    setEditRuleForm({
      rule_code: rule.rule_code,
      event_type: rule.event_type || rule.event_code || 'COMMERCIAL_INVOICE_ISSUED',
      rule_name: rule.rule_name,
      description: rule.description || '',
      applicable_module: rule.applicable_module || 'GL',
      lines: (rule.lines && rule.lines.length > 0)
        ? rule.lines.map((l, idx) => ({
            line_key: l.line_key || `LINE_${idx + 1}`,
            account_code: l.account_code || '',
            direction: l.direction || 'DEBIT',
            amount_field: l.amount_field || 'subtotal',
            description_template: l.description_template || ''
          }))
        : [
            { account_code: '1101', direction: 'DEBIT', amount_field: 'subtotal', description_template: 'Trade AR' },
            { account_code: '4001', direction: 'CREDIT', amount_field: 'subtotal', description_template: 'Sales Revenue' }
          ]
    });
    setShowEditRuleModal(true);
  };

  const handleAddEditRuleLine = () => {
    const nextNum = editRuleForm.lines.length + 1;
    setEditRuleForm({
      ...editRuleForm,
      lines: [
        ...editRuleForm.lines,
        {
          account_code: accounts.length > 0 ? accounts[0].account_code : '1101',
          direction: 'CREDIT',
          amount_field: 'subtotal',
          description_template: `Line ${nextNum}`
        }
      ]
    });
  };

  const handleRemoveEditRuleLine = (idxToRemove) => {
    if (editRuleForm.lines.length <= 2) {
      setErrorMsg('A valid double-entry posting rule requires at least 2 lines (Debit and Credit).');
      return;
    }
    setEditRuleForm({
      ...editRuleForm,
      lines: editRuleForm.lines.filter((_, idx) => idx !== idxToRemove)
    });
  };

  const handleUpdatePostingRule = async (e) => {
    e.preventDefault();
    if (!editingRuleId) return;
    setSubmittingRule(true);
    setErrorMsg(null);
    try {
      const res = await authApi.updatePostingRule(editingRuleId, editRuleForm);
      if (res.success) {
        setSuccessMsg(`Posting rule ${editRuleForm.rule_code} updated successfully!`);
        setShowEditRuleModal(false);
        setEditingRuleId(null);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingRule(false);
    }
  };

  const handleDeletePostingRule = async (ruleId, ruleCode) => {
    if (!window.confirm(`Are you sure you want to permanently delete posting rule "${ruleCode}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingRuleId(ruleId);
    setErrorMsg(null);
    try {
      const res = await authApi.deletePostingRule(ruleId);
      if (res.success) {
        setSuccessMsg(`Posting rule ${ruleCode} deleted successfully`);
        await loadData();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setDeletingRuleId(null);
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

  // US Accounting Calendar & Period Engine Handlers
  const handleCreateCalendar = async (e) => {
    e.preventDefault();
    try {
      const res = await authApi.createAccountingCalendar(calendarForm);
      if (res.success) {
        setSuccessMsg(res.message || 'Accounting calendar created');
        setShowNewCalendarModal(false);
        const calsRes = await authApi.getAccountingCalendars();
        if (calsRes.success) {
          setCalendars(calsRes.data);
          setSelectedCalendarId(res.data._id);
        }
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleGenerateCalendarPeriods = async () => {
    if (!selectedCalendarId) {
      setErrorMsg('Please select an accounting calendar first');
      return;
    }
    setGeneratingPeriods(true);
    try {
      const res = await authApi.generateCalendarPeriods(selectedCalendarId, {
        fiscal_year: Number(generateYear)
      });
      if (res.success) {
        setSuccessMsg(res.message || `Generated periods for FY ${generateYear}`);
        const [periodsRes, calsRes] = await Promise.all([
          authApi.getPeriods(),
          authApi.getAccountingCalendars()
        ]);
        if (periodsRes.success) setPeriods(periodsRes.data);
        if (calsRes.success) setCalendars(calsRes.data);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setGeneratingPeriods(false);
    }
  };

  // Group accounts into hierarchy tree
  const accountTree = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];
    const map = {};
    const roots = [];

    accounts.forEach(a => {
      map[a._id] = { ...a, children: [] };
    });

    accounts.forEach(a => {
      const parentId = a.parent_account_id?._id || a.parent_account_id;
      if (parentId && map[parentId] && map[parentId] !== map[a._id]) {
        map[parentId].children.push(map[a._id]);
      } else {
        roots.push(map[a._id]);
      }
    });

    const sortNodes = (nodes) => {
      nodes.sort((a, b) => {
        if (a.is_group !== b.is_group) return a.is_group ? -1 : 1;
        return (a.account_code || '').localeCompare(b.account_code || '');
      });
      nodes.forEach(n => {
        if (n.children?.length > 0) sortNodes(n.children);
      });
    };
    sortNodes(roots);

    return roots;
  }, [accounts]);

  const renderAccountTreeNode = (node, depth = 0) => {
    const isGroup = node.is_group || node.is_posting_allowed === false;
    const isCollapsed = collapsedGroups[node._id];
    const hasChildren = node.children && node.children.length > 0;

    return (
      <React.Fragment key={node._id}>
        <tr
          onClick={() => {
            if (isGroup && hasChildren) {
              toggleGroupCollapse(node._id);
            } else if (!isGroup) {
              openAccountDrilldown(node);
            }
          }}
          className={`transition ${
            isGroup
              ? 'bg-slate-900/90 font-medium hover:bg-slate-850/80 cursor-pointer border-t border-slate-800/80'
              : 'hover:bg-slate-850/60 cursor-pointer border-t border-slate-800/40 text-slate-300'
          }`}
        >
          <td className="py-2.5 px-4 font-mono font-bold text-xs" style={{ paddingLeft: `${depth * 24 + 16}px` }}>
            <div className="flex items-center space-x-2">
              {isGroup ? (
                hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupCollapse(node._id);
                    }}
                    className="p-0.5 hover:text-white text-slate-400"
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-emerald-400" />}
                  </button>
                ) : (
                  <span className="w-4" />
                )
              ) : (
                <span className="w-4 text-slate-600 text-center">•</span>
              )}

              {isGroup ? (
                isCollapsed ? <Folder className="w-4 h-4 text-brand-400 shrink-0" /> : <FolderOpen className="w-4 h-4 text-brand-300 shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
              )}

              <span className={isGroup ? 'text-brand-300 font-semibold' : 'text-slate-200'}>
                {node.account_code}
              </span>
            </div>
          </td>

          <td className="py-2.5 px-4 font-medium text-xs">
            <div className="flex items-center space-x-2">
              <span className={isGroup ? 'text-white font-semibold text-xs tracking-wide' : 'text-slate-200'}>
                {node.account_name}
              </span>
              {node.is_fiduciary && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-mono">
                  Texas § 4053
                </span>
              )}
            </div>
          </td>

          <td className="py-2.5 px-4 text-xs">
            {isGroup ? (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono text-[10px] uppercase">
                {node.group_type || 'GROUP'}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                {node.account_type}
              </span>
            )}
          </td>

          <td className="py-2.5 px-4 font-mono text-slate-400 text-xs">
            {node.normal_balance}
          </td>

          <td className="py-2.5 px-4 text-right font-mono text-xs">
            {!isGroup && node.opening_balance && parseFloat(node.opening_balance) > 0 ? (
              <span className="text-slate-300">
                ₹{parseFloat(node.opening_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} ({node.opening_balance_type?.[0] || 'D'})
              </span>
            ) : (
              <span className="text-slate-600">—</span>
            )}
          </td>

          <td className="py-2.5 px-4 text-right font-mono text-xs text-emerald-400 font-semibold">
            {!isGroup && parseFloat(node.total_debits || 0) > 0 ? (
              `₹${parseFloat(node.total_debits).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            ) : (
              <span className="text-slate-600">—</span>
            )}
          </td>

          <td className="py-2.5 px-4 text-right font-mono text-xs text-amber-400 font-semibold">
            {!isGroup && parseFloat(node.total_credits || 0) > 0 ? (
              `₹${parseFloat(node.total_credits).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            ) : (
              <span className="text-slate-600">—</span>
            )}
          </td>

          <td className="py-2.5 px-4 text-right font-mono font-bold text-xs">
            {!isGroup ? (
              <span className="text-white">
                ₹{parseFloat(node.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            ) : (
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Summary Header
              </span>
            )}
          </td>

          <td className="py-2.5 px-4 text-center">
            <div className="flex items-center justify-center space-x-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditAccountModal(node);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-brand-600 hover:text-white text-slate-300 font-medium text-[11px] inline-flex items-center space-x-1 transition border border-slate-700"
                title="Edit GL Code, Name & Details"
              >
                <Edit3 className="w-3 h-3 text-brand-400" />
                <span>Edit</span>
              </button>
              {!isGroup ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAccountDrilldown(node);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium text-[11px] inline-flex items-center space-x-1 transition border border-slate-700"
                >
                  <FileText className="w-3 h-3 text-slate-400" />
                  <span>Ledger</span>
                </button>
              ) : (
                <span className="text-[10px] text-slate-500 italic">
                  {hasChildren ? `${node.children.length} items` : 'Group'}
                </span>
              )}
            </div>
          </td>
        </tr>

        {isGroup && !isCollapsed && hasChildren && node.children.map(child => renderAccountTreeNode(child, depth + 1))}
      </React.Fragment>
    );
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
              onClick={openNewAccountModal}
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
            onClick={openNewJournalModal}
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
          <span>Journal Register & Day Book</span>
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
          onClick={() => setActiveTab('statements')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'statements'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Profit & Loss / Balance Sheet</span>
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
          onClick={() => setActiveTab('opening_balances')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === 'opening_balances'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Opening Balances</span>
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

      {/* Tab: Financial Statements (Profit & Loss / Balance Sheet) */}
      {activeTab === 'statements' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs font-medium">Balance Sheet Status</div>
              <div className="text-base font-bold text-emerald-400 flex items-center space-x-1.5 mt-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{financialStatements?.balanceSheet?.is_balanced ? 'Equilibrium Maintained' : 'Variance Detected'}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">Assets = Liabilities + Equity</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs font-medium">Total Assets</div>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                ${parseFloat(financialStatements?.balanceSheet?.total_assets || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Liabilities: ${parseFloat(financialStatements?.balanceSheet?.total_liabilities || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs font-medium">Total Operating Revenue</div>
              <div className="text-lg font-bold text-brand-400 font-mono mt-1">
                ${parseFloat(financialStatements?.incomeStatement?.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Expenses: ${parseFloat(financialStatements?.incomeStatement?.total_expenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs font-medium">Net Profit / Income</div>
              <div className={`text-lg font-bold font-mono mt-1 ${parseFloat(financialStatements?.incomeStatement?.net_income || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${parseFloat(financialStatements?.incomeStatement?.net_income || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">Retained into Owner's Equity</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profit & Loss Statement */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
              <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-850/50">
                <div>
                  <h3 className="text-sm font-semibold text-white">Profit & Loss Statement (Income Statement)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Operational revenues recognized minus cost of sales and expenses</p>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Net: ${parseFloat(financialStatements?.incomeStatement?.net_income || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs font-mono">
                {/* Revenue Section */}
                <div>
                  <div className="font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-800 pb-1 mb-2">
                    Operating Revenue & Income (4000 series)
                  </div>
                  {loading || !financialStatements ? (
                    <div className="py-4 text-center text-slate-500">Loading revenues...</div>
                  ) : (!financialStatements.incomeStatement?.revenue || financialStatements.incomeStatement.revenue.length === 0) ? (
                    <div className="py-2 text-slate-500 italic">No revenue activity recorded</div>
                  ) : (
                    <div className="space-y-1.5">
                      {financialStatements.incomeStatement.revenue.map((r) => (
                        <div key={r.account_code} className="flex justify-between items-center py-1 px-2 rounded hover:bg-slate-800/60 transition">
                          <span className="text-slate-300">{r.account_code} - {r.account_name}</span>
                          <span className="text-emerald-400 font-semibold">${parseFloat(r.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-200 border-t border-slate-800 pt-1.5 mt-2 px-2">
                    <span>Total Revenue</span>
                    <span className="text-emerald-400">${parseFloat(financialStatements?.incomeStatement?.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Expenses Section */}
                <div className="pt-2">
                  <div className="font-bold text-rose-400 uppercase tracking-wider border-b border-slate-800 pb-1 mb-2">
                    Operating Expenses & COGS (5000 series)
                  </div>
                  {loading || !financialStatements ? (
                    <div className="py-4 text-center text-slate-500">Loading expenses...</div>
                  ) : (!financialStatements.incomeStatement?.expenses || financialStatements.incomeStatement.expenses.length === 0) ? (
                    <div className="py-2 text-slate-500 italic">No expenses recorded</div>
                  ) : (
                    <div className="space-y-1.5">
                      {financialStatements.incomeStatement.expenses.map((e) => (
                        <div key={e.account_code} className="flex justify-between items-center py-1 px-2 rounded hover:bg-slate-800/60 transition">
                          <span className="text-slate-300">{e.account_code} - {e.account_name}</span>
                          <span className="text-rose-400 font-semibold">${parseFloat(e.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-200 border-t border-slate-800 pt-1.5 mt-2 px-2">
                    <span>Total Expenses</span>
                    <span className="text-rose-400">${parseFloat(financialStatements?.incomeStatement?.total_expenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Net Profit Summary */}
                <div className="p-3 bg-slate-850 rounded-lg border border-slate-800 flex justify-between items-center font-bold text-sm">
                  <span className="text-slate-200">Net Profit / (Loss)</span>
                  <span className={parseFloat(financialStatements?.incomeStatement?.net_income || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    ${parseFloat(financialStatements?.incomeStatement?.net_income || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Balance Sheet */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
              <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-850/50">
                <div>
                  <h3 className="text-sm font-semibold text-white">Balance Sheet Statement</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Financial position: Current Assets, Liabilities, and Equity</p>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {financialStatements?.balanceSheet?.is_balanced ? 'Balanced' : 'Imbalance'}
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs font-mono">
                {/* Assets */}
                <div>
                  <div className="font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-800 pb-1 mb-2">
                    Assets (1000 series)
                  </div>
                  {loading || !financialStatements ? (
                    <div className="py-4 text-center text-slate-500">Loading assets...</div>
                  ) : (!financialStatements.balanceSheet?.assets || financialStatements.balanceSheet.assets.length === 0) ? (
                    <div className="py-2 text-slate-500 italic">No asset balances</div>
                  ) : (
                    <div className="space-y-1.5">
                      {financialStatements.balanceSheet.assets.map((a) => (
                        <div key={a.account_code} className="flex justify-between items-center py-1 px-2 rounded hover:bg-slate-800/60 transition">
                          <span className="text-slate-300">{a.account_code} - {a.account_name}</span>
                          <span className="text-emerald-400 font-semibold">${parseFloat(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-200 border-t border-slate-800 pt-1.5 mt-2 px-2">
                    <span>Total Assets</span>
                    <span className="text-emerald-400">${parseFloat(financialStatements?.balanceSheet?.total_assets || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Liabilities */}
                <div className="pt-2">
                  <div className="font-bold text-amber-400 uppercase tracking-wider border-b border-slate-800 pb-1 mb-2">
                    Liabilities (2000 series)
                  </div>
                  {loading || !financialStatements ? (
                    <div className="py-4 text-center text-slate-500">Loading liabilities...</div>
                  ) : (!financialStatements.balanceSheet?.liabilities || financialStatements.balanceSheet.liabilities.length === 0) ? (
                    <div className="py-2 text-slate-500 italic">No liabilities</div>
                  ) : (
                    <div className="space-y-1.5">
                      {financialStatements.balanceSheet.liabilities.map((l) => (
                        <div key={l.account_code} className="flex justify-between items-center py-1 px-2 rounded hover:bg-slate-800/60 transition">
                          <span className="text-slate-300">{l.account_code} - {l.account_name}</span>
                          <span className="text-amber-400 font-semibold">${parseFloat(l.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-200 border-t border-slate-800 pt-1.5 mt-2 px-2">
                    <span>Total Liabilities</span>
                    <span className="text-amber-400">${parseFloat(financialStatements?.balanceSheet?.total_liabilities || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Equity */}
                <div className="pt-2">
                  <div className="font-bold text-purple-400 uppercase tracking-wider border-b border-slate-800 pb-1 mb-2">
                    Owner's Equity & Retained Earnings (3000 series)
                  </div>
                  {financialStatements?.balanceSheet?.equity?.map((eq) => (
                    <div key={eq.account_code} className="flex justify-between items-center py-1 px-2 rounded hover:bg-slate-800/60 transition">
                      <span className="text-slate-300">{eq.account_code} - {eq.account_name}</span>
                      <span className="text-purple-400 font-semibold">${parseFloat(eq.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-1 px-2 rounded hover:bg-slate-800/60 transition">
                    <span className="text-slate-300">Current Period Net Profit</span>
                    <span className="text-emerald-400 font-semibold">${parseFloat(financialStatements?.balanceSheet?.current_period_net_income || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-200 border-t border-slate-800 pt-1.5 mt-2 px-2">
                    <span>Total Liabilities & Equity</span>
                    <span className="text-purple-400">${parseFloat(financialStatements?.balanceSheet?.total_liabilities_and_equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Chart of Accounts */}
      {activeTab === 'coa' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-400" />
                <span>Chart of Accounts & Tally Groups ({accounts.length})</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Primary Groups, Subgroups, and individual Posting Ledgers with debit/credit activity and opening balances
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-slate-800 p-0.5 rounded-lg border border-slate-700 flex text-xs">
                <button
                  type="button"
                  onClick={() => setCoaViewMode('tree')}
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    coaViewMode === 'tree'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tree View
                </button>
                <button
                  type="button"
                  onClick={() => setCoaViewMode('table')}
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    coaViewMode === 'table'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Flat Table
                </button>
              </div>

              <button
                type="button"
                onClick={openNewAccountModal}
                className="py-1 px-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 shadow transition"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Account / Group</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Account / Group Name</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Normal</th>
                  <th className="py-3 px-4 text-right">Opening Balance</th>
                  <th className="py-3 px-4 text-right">Debit Activity</th>
                  <th className="py-3 px-4 text-right">Credit Activity</th>
                  <th className="py-3 px-4 text-right">Current Balance</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-8 text-center text-slate-500">Loading accounts and group hierarchy...</td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-8 text-center text-slate-500">No accounts found in this company set of books.</td>
                  </tr>
                ) : coaViewMode === 'tree' ? (
                  accountTree.map(rootNode => renderAccountTreeNode(rootNode, 0))
                ) : (
                  accounts.map((a) => {
                    const isGroup = a.is_group || a.is_posting_allowed === false;
                    return (
                      <tr
                        key={a._id}
                        onClick={() => !isGroup && openAccountDrilldown(a)}
                        className={`hover:bg-slate-850/70 transition group ${isGroup ? 'bg-slate-900/60 font-medium' : 'cursor-pointer'}`}
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-brand-400 group-hover:underline">
                          <div className="flex items-center gap-1.5">
                            {isGroup ? <Folder className="w-3.5 h-3.5 text-brand-400" /> : <FileText className="w-3.5 h-3.5 text-slate-500" />}
                            <span>{a.account_code}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-white">
                          <div className="flex items-center space-x-2">
                            <span>{a.account_name}</span>
                            {a.parent_account_id && (
                              <span className="text-[10px] text-slate-500">
                                (under {a.parent_account_id.account_name || a.parent_account_id.account_code})
                              </span>
                            )}
                            {a.is_fiduciary && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-mono">
                                Texas § 4053
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {isGroup ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono text-[10px] uppercase">
                              {a.group_type || 'GROUP'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                              {a.account_type}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">{a.normal_balance}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                          {!isGroup && a.opening_balance && parseFloat(a.opening_balance) > 0 ? (
                            `₹${parseFloat(a.opening_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} (${a.opening_balance_type?.[0] || 'D'})`
                          ) : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-semibold">
                          {!isGroup && parseFloat(a.total_debits || 0) > 0 ? `₹${parseFloat(a.total_debits).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-amber-400 font-semibold">
                          {!isGroup && parseFloat(a.total_credits || 0) > 0 ? `₹${parseFloat(a.total_credits).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-white text-[13px]">
                          {!isGroup ? `₹${parseFloat(a.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Summary'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditAccountModal(a);
                              }}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-brand-600 hover:text-white text-slate-300 font-medium text-[11px] inline-flex items-center space-x-1 transition border border-slate-700"
                              title="Edit GL Code, Name, Group & Parameters"
                            >
                              <Edit3 className="w-3 h-3 text-brand-400 group-hover:text-white" />
                              <span>Edit</span>
                            </button>
                            {!isGroup ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAccountDrilldown(a);
                                }}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium text-[11px] inline-flex items-center space-x-1.5 transition border border-slate-700"
                                title="View Ledger Activity"
                              >
                                <FileText className="w-3 h-3 text-slate-400" />
                                <span>Ledger</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-mono">GROUP</span>
                            )}
                          </div>
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

      {/* Tab: Opening Balances Management */}
      {activeTab === 'opening_balances' && (
        <div className="space-y-6">
          {/* Header & KPI Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs font-medium">Total Opening Debits</div>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                ₹{obTotals.totalDr}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">Asset / Expense Accounts</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs font-medium">Total Opening Credits</div>
              <div className="text-lg font-bold text-amber-400 font-mono mt-1">
                ₹{obTotals.totalCr}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">Liability / Equity Accounts</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs font-medium">Trial Balance Equilibrium</div>
              <div className={`text-lg font-bold font-mono mt-1 ${obTotals.isBalanced ? 'text-emerald-400' : 'text-rose-400'}`}>
                {obTotals.isBalanced ? '₹ 0.00' : `Δ ₹ ${obTotals.diffAbs}`}
              </div>
              <div className="text-[11px] font-mono mt-0.5">
                {obTotals.isBalanced ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Exact Equilibrium
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Unbalanced Discrepancy
                  </span>
                )}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs font-medium">Posting Status</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono border ${
                  openingBalanceSetup?.status === 'POSTED'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : obTotals.isBalanced
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {openingBalanceSetup?.status || 'DRAFT'}
                </span>
                {openingBalanceSetup?.status === 'POSTED' && (
                  <Lock className="w-4 h-4 text-emerald-400" />
                )}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-1 truncate">
                {openingBalanceSetup?.posted_journal_id ? (
                  <span className="text-brand-400">
                    Journal: {openingBalanceSetup.posted_journal_id.journal_number || 'POSTED'}
                  </span>
                ) : (
                  'Draft not yet posted to GL'
                )}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-0.5">Financial Year</label>
                <select
                  value={obFinancialYear}
                  onChange={(e) => setObFinancialYear(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                >
                  <option value={2025}>FY 2025-2026</option>
                  <option value={2026}>FY 2026-2027</option>
                  <option value={2027}>FY 2027-2028</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-0.5">Filter Ledgers</label>
                <input
                  type="text"
                  placeholder="Search code or name..."
                  value={obSearchTerm}
                  onChange={(e) => setObSearchTerm(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 w-48"
                />
              </div>

              <div className="pt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="obSuspenseCheck"
                  disabled={openingBalanceSetup?.status === 'POSTED'}
                  checked={obAllowSuspense}
                  onChange={(e) => setObAllowSuspense(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-brand-500"
                />
                <label htmlFor="obSuspenseCheck" className="text-xs text-slate-300">
                  Allocate Discrepancy to Suspense
                </label>
              </div>

              {obAllowSuspense && (
                <div className="w-56">
                  <label className="block text-[11px] font-medium text-slate-400 mb-0.5">Suspense Account</label>
                  <SearchableDropdown
                    disabled={openingBalanceSetup?.status === 'POSTED'}
                    options={accounts
                      .filter(a => a.is_posting_allowed !== false)
                      .map(a => ({
                        value: a._id,
                        label: `${a.account_code} - ${a.account_name}`,
                        badge: a.account_code === '9999' ? 'DEFAULT' : a.account_type
                      }))}
                    value={obSuspenseAccountId || accounts.find(a => a.account_code === '9999')?._id}
                    onChange={(val) => setObSuspenseAccountId(val)}
                    placeholder="Select Suspense Account"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <button
                type="button"
                disabled={savingObDraft || openingBalanceSetup?.status === 'POSTED'}
                onClick={handleSaveObDraft}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition disabled:opacity-40"
              >
                {savingObDraft ? 'Saving Draft...' : 'Save Draft'}
              </button>

              <button
                type="button"
                disabled={
                  postingObJournal ||
                  openingBalanceSetup?.status === 'POSTED' ||
                  (!obTotals.isBalanced && !obAllowSuspense) ||
                  openingBalanceLines.length < 2
                }
                onClick={handlePostObJournal}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-40 flex items-center gap-1.5"
              >
                {postingObJournal ? (
                  <span>Posting...</span>
                ) : (
                  <>
                    <Scale className="w-3.5 h-3.5" />
                    <span>Post Opening Journal</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Posting notice if already posted */}
          {openingBalanceSetup?.status === 'POSTED' && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Opening balances for FY {obFinancialYear} have been finalized and posted to the General Ledger via journal{' '}
                  <strong className="font-mono text-white">{openingBalanceSetup.posted_journal_id?.journal_number || 'POSTED'}</strong>.
                  Balances are locked to preserve audit trail integrity.
                </span>
              </div>
            </div>
          )}

          {/* Opening Balance Lines Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider sticky top-0 z-10 text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Ledger Account</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Normal</th>
                    <th className="py-3 px-4 text-right w-44">Opening Debit (₹)</th>
                    <th className="py-3 px-4 text-right w-44">Opening Credit (₹)</th>
                    <th className="py-3 px-4 text-right">Net Effect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {openingBalanceLines.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-500">
                        No posting ledgers found for opening balance setup.
                      </td>
                    </tr>
                  ) : (
                    openingBalanceLines
                      .filter(line => {
                        if (!obSearchTerm.trim()) return true;
                        const term = obSearchTerm.toLowerCase();
                        return (
                          (line.account_code && line.account_code.toLowerCase().includes(term)) ||
                          (line.account_name && line.account_name.toLowerCase().includes(term))
                        );
                      })
                      .map((line, idx) => {
                        const isPosted = openingBalanceSetup?.status === 'POSTED';
                        const dr = parseFloat(line.debit || 0);
                        const cr = parseFloat(line.credit || 0);

                        return (
                          <tr key={line.ledger_account_id || line.account_code || idx} className="hover:bg-slate-850/50 transition">
                            <td className="py-2.5 px-4 font-mono font-bold text-brand-400">
                              {line.account_code}
                            </td>
                            <td className="py-2.5 px-4 font-medium text-white">
                              {line.account_name}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                                {line.account_type}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-400">
                              {line.normal_balance}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                disabled={isPosted}
                                placeholder="0.00"
                                value={line.debit || ''}
                                onChange={(e) => handleObLineChange(idx, 'debit', e.target.value)}
                                className={`w-full px-2.5 py-1 text-right bg-slate-800 border rounded text-xs font-mono focus:outline-none ${
                                  dr > 0
                                    ? 'border-emerald-500 text-emerald-400 font-semibold'
                                    : 'border-slate-700 text-slate-400'
                                } ${isPosted ? 'opacity-50 cursor-not-allowed' : 'focus:border-brand-500'}`}
                              />
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                disabled={isPosted}
                                placeholder="0.00"
                                value={line.credit || ''}
                                onChange={(e) => handleObLineChange(idx, 'credit', e.target.value)}
                                className={`w-full px-2.5 py-1 text-right bg-slate-800 border rounded text-xs font-mono focus:outline-none ${
                                  cr > 0
                                    ? 'border-amber-500 text-amber-400 font-semibold'
                                    : 'border-slate-700 text-slate-400'
                                } ${isPosted ? 'opacity-50 cursor-not-allowed' : 'focus:border-brand-500'}`}
                              />
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-medium text-xs">
                              {dr > 0 ? (
                                <span className="text-emerald-400">₹{dr.toFixed(2)} Dr</span>
                              ) : cr > 0 ? (
                                <span className="text-amber-400">₹{cr.toFixed(2)} Cr</span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

            {/* Sticky Table Footer with Totals */}
            <div className="bg-slate-850 px-5 py-3 border-t border-slate-800 flex justify-between items-center text-xs font-mono">
              <span className="text-slate-400 font-medium">Equilibrium Summary:</span>
              <div className="flex items-center space-x-8">
                <span className="text-emerald-400 font-bold">Total Debits: ₹{obTotals.totalDr}</span>
                <span className="text-amber-400 font-bold">Total Credits: ₹{obTotals.totalCr}</span>
                <span className={`font-bold ${obTotals.isBalanced ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Difference: ₹{obTotals.diffAbs}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Periods */}
      {activeTab === 'periods' && (
        <div className="space-y-4">
          {/* Calendar Management Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <CalendarDays className="w-5 h-5 text-brand-400" />
                <h3 className="text-sm font-semibold text-white">US Accounting Calendars & Period Engine</h3>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl">
                Configure Gregorian or National Retail Federation (NRF) 4-4-5, 4-5-4, 5-4-4, or 13-period retail calendars with automated 53-week leap year handling and period-lock protection.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setShowNewCalendarModal(true)}
                className="py-1.5 px-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Calendar</span>
              </button>
            </div>
          </div>

          {/* Calendar Controls & Period Generator Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs font-medium text-slate-300">Active Calendar:</div>
              <select
                value={selectedCalendarId}
                onChange={(e) => setSelectedCalendarId(e.target.value)}
                className="bg-slate-850 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-500"
              >
                <option value="">-- All Calendars / Standard Periods --</option>
                {calendars.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.calendar_name} ({c.calendar_type}) {c.is_default ? '★ Default' : ''}
                  </option>
                ))}
              </select>

              {selectedCalendarId && (() => {
                const cal = calendars.find(c => c._id === selectedCalendarId);
                if (!cal) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono">
                      {cal.calendar_type}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {cal.week_start_day?.slice(0, 3)} - {cal.week_end_day?.slice(0, 3)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      53-Wk: {cal.fifty_three_week_policy}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">Fiscal Year:</span>
              <input
                type="number"
                value={generateYear}
                onChange={(e) => setGenerateYear(e.target.value)}
                className="w-20 bg-slate-850 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 font-mono text-center focus:outline-none focus:border-brand-500"
              />
              <button
                onClick={handleGenerateCalendarPeriods}
                disabled={generatingPeriods || !selectedCalendarId}
                className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow"
              >
                {generatingPeriods ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                <span>{generatingPeriods ? 'Generating...' : 'Generate Periods'}</span>
              </button>
            </div>
          </div>

          {/* Periods Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Generated Accounting Periods</h3>
              <span className="text-xs text-slate-400 font-mono">
                {periods.length} {periods.length === 1 ? 'Period' : 'Periods'} Found
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Period</th>
                    <th className="py-3 px-5">Fiscal Year</th>
                    <th className="py-3 px-5">Quarter</th>
                    <th className="py-3 px-5">Weeks</th>
                    <th className="py-3 px-5">Date Boundary (UTC)</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5 text-right">Lock Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-500">Loading periods...</td>
                    </tr>
                  ) : periods.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-500">
                        No periods found. Select an accounting calendar above and click &quot;Generate Periods&quot;.
                      </td>
                    </tr>
                  ) : (
                    periods.map((p) => {
                      const isLocked = p.status === 'LOCKED' || p.status === 'HARD_CLOSED';
                      return (
                        <tr key={p._id} className="hover:bg-slate-850/50 transition">
                          <td className="py-3.5 px-5 font-mono font-bold text-white flex items-center space-x-2">
                            <span>{p.period_name}</span>
                            {p.is_leap_week_period && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                53rd Wk
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 font-mono text-slate-400">{p.fiscal_year}</td>
                          <td className="py-3.5 px-5 font-mono text-slate-400">
                            {p.quarter ? `Q${p.quarter}` : '-'}
                          </td>
                          <td className="py-3.5 px-5 font-mono text-slate-400">
                            {p.week_count ? `${p.week_count} wks` : '-'}
                          </td>
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
                              <span>{isLocked ? 'Re-open' : 'Hard Close'}</span>
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

          {/* New Calendar Modal */}
          {showNewCalendarModal && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 text-slate-200">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                  <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-brand-400" />
                    <span>Create US Accounting Calendar</span>
                  </h3>
                  <button
                    onClick={() => setShowNewCalendarModal(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateCalendar} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Calendar Code</label>
                    <input
                      type="text"
                      required
                      value={calendarForm.calendar_code}
                      onChange={(e) => setCalendarForm({ ...calendarForm, calendar_code: e.target.value.toUpperCase() })}
                      className="w-full bg-slate-850 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-brand-500"
                      placeholder="e.g. US_RETAIL_445"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Calendar Name</label>
                    <input
                      type="text"
                      required
                      value={calendarForm.calendar_name}
                      onChange={(e) => setCalendarForm({ ...calendarForm, calendar_name: e.target.value })}
                      className="w-full bg-slate-850 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                      placeholder="e.g. US Retail 4-4-5 Calendar"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Calendar Pattern</label>
                      <select
                        value={calendarForm.calendar_type}
                        onChange={(e) => setCalendarForm({ ...calendarForm, calendar_type: e.target.value })}
                        className="w-full bg-slate-850 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="GREGORIAN">Gregorian (12 Months)</option>
                        <option value="RETAIL_445">Retail 4-4-5 (NRF)</option>
                        <option value="RETAIL_454">Retail 4-5-4</option>
                        <option value="RETAIL_544">Retail 5-4-4</option>
                        <option value="RETAIL_13_PERIOD">13-Period (4 Wks x 13)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">53-Week Policy</label>
                      <select
                        value={calendarForm.fifty_three_week_policy}
                        onChange={(e) => setCalendarForm({ ...calendarForm, fifty_three_week_policy: e.target.value })}
                        className="w-full bg-slate-850 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="ADD_TO_LAST_PERIOD">Add to Last Period (P12 / P13)</option>
                        <option value="ADD_AS_EXTRA_PERIOD">Create Standalone Period (P13 / P14)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Week Ending Day</label>
                      <select
                        value={calendarForm.week_end_day}
                        onChange={(e) => setCalendarForm({ ...calendarForm, week_end_day: e.target.value })}
                        className="w-full bg-slate-850 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="SATURDAY">Saturday (NRF Standard)</option>
                        <option value="SUNDAY">Sunday</option>
                        <option value="FRIDAY">Friday</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Anchor Rule</label>
                      <select
                        value={calendarForm.year_end_rule}
                        onChange={(e) => setCalendarForm({ ...calendarForm, year_end_rule: e.target.value })}
                        className="w-full bg-slate-850 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="LAST_WEEKDAY_OF_MONTH">Last Weekday of Anchor Month</option>
                        <option value="CLOSEST_WEEKDAY_TO_MONTH_END">Closest Weekday to Month-End</option>
                        <option value="CALENDAR_MONTH_END">Calendar Month-End (Gregorian)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={calendarForm.description}
                      onChange={(e) => setCalendarForm({ ...calendarForm, description: e.target.value })}
                      className="w-full bg-slate-850 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                      placeholder="Optional notes or operational usage details..."
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      type="checkbox"
                      id="isDefaultCal"
                      checked={calendarForm.is_default}
                      onChange={(e) => setCalendarForm({ ...calendarForm, is_default: e.target.checked })}
                      className="rounded bg-slate-800 border-slate-700 text-brand-600 focus:ring-0"
                    />
                    <label htmlFor="isDefaultCal" className="text-xs text-slate-300">
                      Set as Default Accounting Calendar for Company
                    </label>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowNewCalendarModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition shadow"
                    >
                      Save Calendar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Posting Rules */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1 flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-brand-400" />
                <span>Event-Driven Accounting Posting Rules</span>
              </h3>
              <p className="text-xs text-slate-400">
                Posting rules translate operational commercial events (e.g., Sales Invoicing, Commercial Receipt, Goods Purchase, Stock Adjustments) into double-entry balanced journals without arbitrary scripts.
              </p>
            </div>
            <button
              onClick={() => setShowNewRuleModal(true)}
              className="py-2 px-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-brand-600/20 transition shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Posting Rule</span>
            </button>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs">Loading posting rules...</div>
            ) : postingRules.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-3 bg-slate-900 border border-slate-800 rounded-xl">
                <Sliders className="w-8 h-8 mx-auto text-slate-600" />
                <div className="text-xs font-semibold text-slate-400">No custom posting rules defined.</div>
                <p className="text-[11px] text-slate-500">Define custom double-entry rules to automate GL journal generation.</p>
                <button
                  onClick={() => setShowNewRuleModal(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Posting Rule</span>
                </button>
              </div>
            ) : (
              postingRules.map(r => (
                <div key={r._id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 font-bold border border-brand-500/20">
                          {r.rule_code}
                        </span>
                        <h4 className="text-sm font-bold text-white">{r.rule_name}</h4>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {r.event_type || r.event_code}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {r.status || 'ACTIVE'}
                        </span>
                      </div>
                      {r.description && <p className="text-xs text-slate-400">{r.description}</p>}
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditRule(r)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-amber-600 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition border border-slate-700"
                        title="Edit Posting Rule"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePostingRule(r._id, r.rule_code)}
                        disabled={deletingRuleId === r._id}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition border border-slate-700 disabled:opacity-50"
                        title="Delete Posting Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{deletingRuleId === r._id ? 'Deleting...' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>

                  {r.lines && r.lines.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80">
                      <div className="text-[11px] font-semibold text-slate-400 mb-2">Double-Entry Posting Lines:</div>
                      <div className="space-y-1.5">
                        {r.lines.map((l, idx) => (
                          <div key={idx} className="flex items-center space-x-3 text-xs font-mono bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800/60">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              l.direction === 'DEBIT'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {l.direction}
                            </span>
                            <span className="text-white font-semibold">Account {l.account_code}</span>
                            <span className="text-slate-400">← {l.amount_expression || l.amount_field || 'amount'}</span>
                            {l.description_template && (
                              <span className="text-slate-500 italic text-[11px]">"{l.description_template}"</span>
                            )}
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm overflow-y-auto flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto my-auto">
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm overflow-y-auto flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-base font-bold text-white">Post Balanced Double-Entry Journal</h3>
              <button
                type="button"
                onClick={() => setShowNewJournalModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              All debits must equal credits. You can reference existing commercial invoices for audit traceability without modifying invoice balances.
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
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Voucher Type / Source</label>
                  <select
                    value={newJournalForm.source_module}
                    onChange={(e) => setNewJournalForm({ ...newJournalForm, source_module: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="GL_MANUAL">GL_MANUAL (Journal Voucher)</option>
                    <option value="BANKING_CASH">BANKING_CASH (Cash / Bank Contra Transfer)</option>
                    <option value="COMMERCIAL">COMMERCIAL (Sales / Purchase Voucher)</option>
                    <option value="TREASURY_BANK_REC">TREASURY_BANK_REC (Receipt / Deposit)</option>
                    <option value="FINANCE_CLOSE">FINANCE_CLOSE (Period Close)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Manual Reference ID</label>
                  <input
                    type="text"
                    placeholder="e.g. REF-2026-0001"
                    value={newJournalForm.reference_id}
                    onChange={(e) => setNewJournalForm({ ...newJournalForm, reference_id: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                </div>
              </div>

              {/* Commercial Invoice Reference Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-brand-400" />
                    <span>Reference Existing Commercial Invoice (Optional)</span>
                  </span>
                  {newJournalForm.commercial_document_id && (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      Mode: REFERENCE_ONLY (Audit link only)
                    </span>
                  )}
                </label>
                <SearchableDropdown
                  options={commercialInvoices.map(doc => ({
                    value: doc._id,
                    label: `${doc.document_number} — ${doc.party_name || 'Counterparty'}`,
                    secondary: `${doc.document_type} | Date: ${new Date(doc.document_date).toISOString().slice(0, 10)} | Grand Total: ₹${parseFloat(doc.grand_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} | Balance Due: ₹${parseFloat(doc.balance_due || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    badge: doc.status,
                    doc
                  }))}
                  value={newJournalForm.commercial_document_id}
                  onChange={(val, opt) => {
                    if (val && opt?.doc) {
                      setNewJournalForm({
                        ...newJournalForm,
                        reference_id: opt.doc.document_number,
                        commercial_document_id: val,
                        reference_document_number: opt.doc.document_number,
                        reference_type: 'REFERENCE_ONLY'
                      });
                    } else {
                      setNewJournalForm({
                        ...newJournalForm,
                        commercial_document_id: null,
                        reference_document_number: null,
                        reference_type: 'NONE'
                      });
                    }
                  }}
                  placeholder={loadingInvoices ? 'Loading commercial invoices...' : 'Search invoice # or counterparty (e.g. INV-2026-0001, Acme Corp)...'}
                  searchPlaceholder="Type invoice # or customer/supplier name..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Memo / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Commercial Sales Invoice Revenue Recognition"
                  value={newJournalForm.memo}
                  onChange={(e) => setNewJournalForm({ ...newJournalForm, memo: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
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

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {newJournalForm.lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-850 p-2 rounded-lg border border-slate-800">
                      <div className="col-span-5">
                        <SearchableDropdown
                          options={accounts.map(acc => ({
                            value: acc.account_code,
                            label: `${acc.account_code} - ${acc.account_name}`,
                            secondary: acc.parent_account_id?.account_name ? `under ${acc.parent_account_id.account_name}` : acc.account_type,
                            badge: acc.is_group || acc.is_posting_allowed === false ? 'GROUP' : acc.account_type,
                            disabled: acc.is_group === true || acc.is_posting_allowed === false,
                            disabledReason: (acc.is_group || acc.is_posting_allowed === false) ? 'Summary Group' : null
                          }))}
                          value={line.account_code}
                          onChange={(val) => handleLineChange(idx, 'account_code', val)}
                          placeholder="Select Posting Ledger..."
                          searchPlaceholder="Search code or account name..."
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Debit (₹)"
                          value={line.debit}
                          onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-emerald-400 font-mono text-right"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Credit (₹)"
                          value={line.credit}
                          onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-amber-400 font-mono text-right"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Line memo"
                          value={line.memo}
                          onChange={(e) => handleLineChange(idx, 'memo', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeJournalLine(idx)}
                          disabled={newJournalForm.lines.length <= 2}
                          className="text-slate-500 hover:text-rose-400 text-xs disabled:opacity-30 cursor-pointer p-1"
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
                    <span className="text-white font-bold">₹{journalPreview.total_debit}</span>
                    <span className="text-slate-400 ml-4">Total Cr: </span>
                    <span className="text-white font-bold">₹{journalPreview.total_credit}</span>
                  </div>
                  <div className={journalPreview.is_balanced ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {journalPreview.is_balanced ? '✓ Balanced Equilibrium' : `Imbalance: ₹${journalPreview.difference}`}
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

      {/* Modal: New Account / Group */}
      {showNewAccountModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm overflow-y-auto flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  Create Ledger Account or Tally Group
                </h3>
                <p className="text-xs text-slate-400">
                  Smart referenced Chart of Accounts master with automatic code series & hierarchy linking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewAccountModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              {/* Type Toggle: Ledger vs Group */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Entity Nature</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setNewAccountForm({ ...newAccountForm, is_group: false, is_posting_allowed: true })}
                    className={`py-1.5 px-3 rounded-md text-xs font-semibold transition ${
                      !newAccountForm.is_group
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Posting Ledger Account
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePresetId(null);
                      setNewAccountForm({ ...newAccountForm, is_group: true, is_posting_allowed: false, opening_balance: '' });
                    }}
                    className={`py-1.5 px-3 rounded-md text-xs font-semibold transition ${
                      newAccountForm.is_group
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Account Group / Subgroup
                  </button>
                </div>
              </div>

              {/* Quick Template Presets for Posting Ledgers */}
              {!newAccountForm.is_group && (
                <div className="bg-slate-850 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      Quick Tally Presets (Click to Auto-fill Code & Group):
                    </span>
                    {activePresetId && (
                      <span className="text-[10px] text-brand-400 font-mono">Preset Active</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {LEDGER_PRESETS.map(preset => {
                      const isSelected = activePresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          title={preset.hint}
                          className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 border ${
                            isSelected
                              ? 'bg-brand-600/30 text-brand-300 border-brand-500 shadow-sm'
                              : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-750 hover:text-white hover:border-slate-600'
                          }`}
                        >
                          <span>{preset.icon}</span>
                          <span>{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Code & Name Row */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-5">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">Account Code</label>
                    {!newAccountForm.is_group && (
                      <button
                        type="button"
                        onClick={() => {
                          const matchedGroup = accounts.find(a => a._id === newAccountForm.parent_account_id);
                          const next = suggestNextAccountCode(matchedGroup, newAccountForm.account_type, accounts);
                          handleAccountCodeChange(next);
                        }}
                        className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-0.5"
                        title="Auto-calculate next free code in current series"
                      >
                        ⚡ Suggest Next
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    placeholder={newAccountForm.is_group ? "e.g. GRP-CURRENT-ASSETS" : "e.g. 1005"}
                    value={newAccountForm.account_code}
                    onChange={(e) => handleAccountCodeChange(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono focus:border-brand-500 focus:outline-none"
                  />
                  {/* Code series live feedback badge */}
                  {getCodeSeriesInfo(newAccountForm.account_code) && (
                    <div className={`mt-1 text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1 ${getCodeSeriesInfo(newAccountForm.account_code).color}`}>
                      <span>•</span>
                      <span>{getCodeSeriesInfo(newAccountForm.account_code).label}</span>
                    </div>
                  )}
                </div>

                <div className="col-span-7">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Account / Ledger Name</label>
                  <input
                    type="text"
                    required
                    placeholder={newAccountForm.is_group ? "e.g. Sundry Debtors - Maharashtra" : "e.g. HDFC Bank Current A/c, Rahul Soni Capital"}
                    value={newAccountForm.account_name}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, account_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Parent Group Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Parent Group (Hierarchy)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Auto-aligns Type & Normal Balance
                  </span>
                </div>
                <SearchableDropdown
                  options={accounts
                    .filter(a => a.is_group || a.is_posting_allowed === false)
                    .map(g => ({
                      value: g._id,
                      label: `${g.account_code} - ${g.account_name}`,
                      secondary: `${g.group_type || 'GROUP'} (${g.account_type} • ${g.normal_balance})`,
                      badge: g.group_type || 'GROUP',
                      account_type: g.account_type,
                      normal_balance: g.normal_balance
                    }))}
                  value={newAccountForm.parent_account_id}
                  onChange={(val, opt) => {
                    const selectedGroup = accounts.find(a => a._id === val);
                    const inferredType = opt?.account_type || newAccountForm.account_type;
                    const inferredBalance = opt?.normal_balance || newAccountForm.normal_balance;
                    const nextCode = (!newAccountForm.account_code || newAccountForm.account_code === '1005')
                      ? suggestNextAccountCode(selectedGroup, inferredType, accounts)
                      : newAccountForm.account_code;

                    setNewAccountForm({
                      ...newAccountForm,
                      parent_account_id: val,
                      account_code: nextCode,
                      account_type: inferredType,
                      normal_balance: inferredBalance,
                      opening_balance_type: inferredBalance
                    });
                  }}
                  placeholder="Select Parent Group (e.g. Current Assets, Bank Accounts, Capital Account)..."
                  searchPlaceholder="Type group code or name..."
                />
              </div>

              {/* Classification & Balance Type */}
              <div className="grid grid-cols-2 gap-3 bg-slate-850 p-2.5 rounded-lg border border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Classification Type</label>
                  <select
                    value={newAccountForm.account_type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      const newBal = (newType === 'ASSET' || newType === 'EXPENSE') ? 'DEBIT' : 'CREDIT';
                      setNewAccountForm({
                        ...newAccountForm,
                        account_type: newType,
                        normal_balance: newBal,
                        opening_balance_type: newBal
                      });
                    }}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  >
                    <option value="ASSET">ASSET (Assets / Bank / Cash)</option>
                    <option value="LIABILITY">LIABILITY (Creditors / Taxes / Loans)</option>
                    <option value="EQUITY">EQUITY (Capital / Reserves)</option>
                    <option value="REVENUE">REVENUE (Sales / Operating Incomes)</option>
                    <option value="EXPENSE">EXPENSE (Purchases / Overhead)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Normal Balance</label>
                  <select
                    value={newAccountForm.normal_balance}
                    onChange={(e) => setNewAccountForm({
                      ...newAccountForm,
                      normal_balance: e.target.value,
                      opening_balance_type: e.target.value
                    })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  >
                    <option value="DEBIT">DEBIT (Dr) • Increases on Debit</option>
                    <option value="CREDIT">CREDIT (Cr) • Increases on Credit</option>
                  </select>
                </div>
              </div>

              {/* Opening Balance fields (for posting accounts only) */}
              {!newAccountForm.is_group && (
                <div className="grid grid-cols-2 gap-3 bg-slate-850 p-3 rounded-lg border border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Opening Balance (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newAccountForm.opening_balance}
                      onChange={(e) => setNewAccountForm({ ...newAccountForm, opening_balance: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Opening Balance Type</label>
                    <select
                      value={newAccountForm.opening_balance_type}
                      onChange={(e) => setNewAccountForm({ ...newAccountForm, opening_balance_type: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                    >
                      <option value="DEBIT">DEBIT (Dr)</option>
                      <option value="CREDIT">CREDIT (Cr)</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description / Notes</label>
                <input
                  type="text"
                  placeholder="Optional description"
                  value={newAccountForm.description}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, description: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                />
              </div>

              {/* Advanced Settings Collapsible */}
              {!newAccountForm.is_group && (
                <div className="border border-slate-800/80 rounded-lg p-2.5 bg-slate-900/60">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedAccountSettings(!showAdvancedAccountSettings)}
                    className="flex items-center justify-between w-full text-left text-xs font-medium text-slate-400 hover:text-white"
                  >
                    <span className="flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-400" />
                      Advanced Settings (Fiduciary & Subledger Type)
                    </span>
                    {showAdvancedAccountSettings ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>

                  {showAdvancedAccountSettings && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Subledger Tracking Type</label>
                        <select
                          value={newAccountForm.subledger_type || 'NONE'}
                          onChange={(e) => setNewAccountForm({ ...newAccountForm, subledger_type: e.target.value })}
                          className="w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                        >
                          <option value="NONE">NONE (Standard General Ledger)</option>
                          <option value="AR">AR (Accounts Receivable / Debtors)</option>
                          <option value="AP">AP (Accounts Payable / Creditors)</option>
                          <option value="FIDUCIARY">FIDUCIARY (Trust / Escrow)</option>
                          <option value="COMMISSIONS">COMMISSIONS (Franchise / Partner)</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <input
                          type="checkbox"
                          id="fiduciaryCheck"
                          checked={newAccountForm.is_fiduciary}
                          onChange={(e) => setNewAccountForm({ ...newAccountForm, is_fiduciary: e.target.checked })}
                          className="rounded bg-slate-800 border-slate-700 text-brand-500"
                        />
                        <label htmlFor="fiduciaryCheck" className="text-xs text-slate-300">
                          Statutory Fiduciary Trust Account (Texas § 4053)
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewAccountModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAccount}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 transition disabled:opacity-50"
                >
                  {submittingAccount ? 'Saving...' : (newAccountForm.is_group ? 'Create Group' : 'Create Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Account / Group */}
      {showEditAccountModal && editingAccount && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm overflow-y-auto flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-brand-400" />
                  Edit {editAccountForm.is_group ? 'Account Group' : 'Ledger Account'}
                </h3>
                <p className="text-xs text-slate-400">
                  Update GL code, ledger name, classification, parent hierarchy, and parameters.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditAccountModal(false);
                  setEditingAccount(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateAccount} className="space-y-4">
              {/* Entity Nature Info & Status */}
              <div className="grid grid-cols-2 gap-3 bg-slate-850 p-2.5 rounded-lg border border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Entity Nature</label>
                  <div className="text-xs font-mono font-semibold text-brand-300 bg-slate-800 py-1.5 px-3 rounded border border-slate-700">
                    {editAccountForm.is_group ? 'ACCOUNT GROUP / SUMMARY' : 'POSTING LEDGER ACCOUNT'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Account Status</label>
                  <select
                    value={editAccountForm.status}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, status: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  >
                    <option value="ACTIVE">ACTIVE (Normal Posting & Hierarchy)</option>
                    <option value="INACTIVE">INACTIVE (Disabled for New Postings)</option>
                    <option value="ARCHIVED">ARCHIVED (Locked Historical)</option>
                  </select>
                </div>
              </div>

              {/* Code & Name Row */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-5">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">GL Account Code</label>
                  </div>
                  <input
                    type="text"
                    required
                    value={editAccountForm.account_code}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, account_code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono uppercase focus:border-brand-500 focus:outline-none"
                    placeholder="e.g. 1001"
                  />
                  {/* Code series live feedback badge */}
                  {getCodeSeriesInfo(editAccountForm.account_code) && (
                    <div className={`mt-1 text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1 ${getCodeSeriesInfo(editAccountForm.account_code).color}`}>
                      <span>•</span>
                      <span>{getCodeSeriesInfo(editAccountForm.account_code).label}</span>
                    </div>
                  )}
                </div>

                <div className="col-span-7">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Account / Ledger Name</label>
                  <input
                    type="text"
                    required
                    value={editAccountForm.account_name}
                    onChange={(e) => setEditAccountForm({ ...editAccountForm, account_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:border-brand-500 focus:outline-none"
                    placeholder="e.g. HDFC Bank Current A/c"
                  />
                </div>
              </div>

              {/* Parent Group Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Parent Group (Hierarchy)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Move or re-assign under group
                  </span>
                </div>
                <SearchableDropdown
                  options={[
                    { value: '', label: '— No Parent (Top-Level Primary Group / Root) —', secondary: 'Root level' },
                    ...accounts
                      .filter(a => (a.is_group || a.is_posting_allowed === false) && a._id !== editingAccount._id)
                      .map(g => ({
                        value: g._id,
                        label: `${g.account_code} - ${g.account_name}`,
                        secondary: `${g.group_type || 'GROUP'} (${g.account_type} • ${g.normal_balance})`,
                        badge: g.group_type || 'GROUP',
                        account_type: g.account_type,
                        normal_balance: g.normal_balance
                      }))
                  ]}
                  value={editAccountForm.parent_account_id}
                  onChange={(val, opt) => {
                    const inferredType = opt?.account_type || editAccountForm.account_type;
                    const inferredBalance = opt?.normal_balance || editAccountForm.normal_balance;
                    setEditAccountForm({
                      ...editAccountForm,
                      parent_account_id: val,
                      account_type: inferredType,
                      normal_balance: inferredBalance
                    });
                  }}
                  placeholder="Select Parent Group..."
                  searchPlaceholder="Type group code or name..."
                />
              </div>

              {/* Classification & Balance Type */}
              <div className="grid grid-cols-2 gap-3 bg-slate-850 p-2.5 rounded-lg border border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Classification Type</label>
                  <select
                    value={editAccountForm.account_type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      const newBal = (newType === 'ASSET' || newType === 'EXPENSE') ? 'DEBIT' : 'CREDIT';
                      setEditAccountForm({
                        ...editAccountForm,
                        account_type: newType,
                        normal_balance: newBal
                      });
                    }}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  >
                    <option value="ASSET">ASSET (Assets / Bank / Cash)</option>
                    <option value="LIABILITY">LIABILITY (Creditors / Taxes / Loans)</option>
                    <option value="EQUITY">EQUITY (Capital / Reserves)</option>
                    <option value="REVENUE">REVENUE (Sales / Operating Incomes)</option>
                    <option value="EXPENSE">EXPENSE (Purchases / Overhead)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Normal Balance</label>
                  <select
                    value={editAccountForm.normal_balance}
                    onChange={(e) => setEditAccountForm({
                      ...editAccountForm,
                      normal_balance: e.target.value
                    })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  >
                    <option value="DEBIT">DEBIT (Dr) • Increases on Debit</option>
                    <option value="CREDIT">CREDIT (Cr) • Increases on Credit</option>
                  </select>
                </div>
              </div>

              {/* Opening Balance fields (for posting accounts only) */}
              {!editAccountForm.is_group && (
                <div className="grid grid-cols-2 gap-3 bg-slate-850 p-3 rounded-lg border border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Opening Balance (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={editAccountForm.opening_balance}
                      onChange={(e) => setEditAccountForm({ ...editAccountForm, opening_balance: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Opening Balance Type</label>
                    <select
                      value={editAccountForm.opening_balance_type}
                      onChange={(e) => setEditAccountForm({ ...editAccountForm, opening_balance_type: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono"
                    >
                      <option value="DEBIT">DEBIT (Dr)</option>
                      <option value="CREDIT">CREDIT (Cr)</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description / Notes</label>
                <input
                  type="text"
                  placeholder="Optional description"
                  value={editAccountForm.description}
                  onChange={(e) => setEditAccountForm({ ...editAccountForm, description: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                />
              </div>

              {/* Advanced Settings Collapsible */}
              <div className="border border-slate-800/80 rounded-lg p-2.5 bg-slate-900/60">
                <button
                  type="button"
                  onClick={() => setShowAdvancedEditAccountSettings(!showAdvancedEditAccountSettings)}
                  className="flex items-center justify-between w-full text-left text-xs font-medium text-slate-400 hover:text-white"
                >
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-slate-400" />
                    Advanced Accounting Parameters & Subledger Settings
                  </span>
                  {showAdvancedEditAccountSettings ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {showAdvancedEditAccountSettings && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Subledger Tracking Type</label>
                        <select
                          value={editAccountForm.subledger_type || 'NONE'}
                          onChange={(e) => setEditAccountForm({ ...editAccountForm, subledger_type: e.target.value })}
                          className="w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                        >
                          <option value="NONE">NONE (Standard General Ledger)</option>
                          <option value="AR">AR (Accounts Receivable / Debtors)</option>
                          <option value="AP">AP (Accounts Payable / Creditors)</option>
                          <option value="FIDUCIARY">FIDUCIARY (Trust / Escrow)</option>
                          <option value="COMMISSIONS">COMMISSIONS (Franchise / Partner)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">Currency</label>
                        <input
                          type="text"
                          value={editAccountForm.currency}
                          onChange={(e) => setEditAccountForm({ ...editAccountForm, currency: e.target.value.toUpperCase() })}
                          className="w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white font-mono uppercase"
                          placeholder="e.g. USD, INR"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="editFiduciaryCheck"
                          checked={editAccountForm.is_fiduciary}
                          onChange={(e) => setEditAccountForm({ ...editAccountForm, is_fiduciary: e.target.checked })}
                          className="rounded bg-slate-800 border-slate-700 text-brand-500"
                        />
                        <label htmlFor="editFiduciaryCheck" className="text-xs text-slate-300">
                          Statutory Fiduciary Trust Account (Texas § 4053)
                        </label>
                      </div>

                      {!editAccountForm.is_group && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="editPostingCheck"
                            checked={editAccountForm.is_posting_allowed}
                            onChange={(e) => setEditAccountForm({ ...editAccountForm, is_posting_allowed: e.target.checked })}
                            className="rounded bg-slate-800 border-slate-700 text-brand-500"
                          />
                          <label htmlFor="editPostingCheck" className="text-xs text-slate-300">
                            Allow Direct Postings
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditAccountModal(false);
                    setEditingAccount(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEditAccount}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingEditAccount ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
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
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const acc = drilldownAccount;
                    setDrilldownAccount(null);
                    openEditAccountModal(acc);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-sm"
                  title="Edit GL Code, Name & Details"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrilldownAccount(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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

      {/* Modal: Create Posting Rule */}
      {showNewRuleModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Sliders className="w-5 h-5 text-brand-400" />
                <span>Create Double-Entry Posting Rule</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewRuleModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePostingRule} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Rule Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. RULE_COMMERCIAL_SALES"
                    value={newRuleForm.rule_code}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, rule_code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Trigger Event Code / Type *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. commercial.sales.invoice"
                    value={newRuleForm.event_type}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, event_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Rule Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Commercial Sales Invoice AR & Revenue Recognition"
                  value={newRuleForm.rule_name}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, rule_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Describe what double-entry journal is generated by this rule"
                  value={newRuleForm.description}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-brand-500 focus:outline-none"
                />
              </div>

              {/* Posting Rule Lines */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">
                    Double-Entry Posting Lines ({newRuleForm.lines.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddRuleLine}
                    className="px-2.5 py-1 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 border border-brand-500/30 rounded text-xs font-semibold flex items-center space-x-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {newRuleForm.lines.map((l, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center space-x-2">
                      <span className="text-slate-500 font-mono text-[11px] w-5 text-center shrink-0">
                        #{idx + 1}
                      </span>
                      <select
                        required
                        value={l.account_code}
                        onChange={(e) => {
                          const updated = [...newRuleForm.lines];
                          updated[idx].account_code = e.target.value;
                          setNewRuleForm({ ...newRuleForm, lines: updated });
                        }}
                        className="w-48 bg-slate-800 border border-slate-700 rounded p-1.5 font-mono text-xs text-white shrink-0 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">-- Select GL Account --</option>
                        {accounts.length > 0 ? (
                          accounts.map((acc) => (
                            <option key={acc._id || acc.account_code} value={acc.account_code}>
                              {acc.account_code} - {acc.account_name} ({acc.account_type})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="1101">1101 - Sundry Debtors (ASSET)</option>
                            <option value="1000">1000 - Operating Cash (ASSET)</option>
                            <option value="1002">1002 - Bank Current Account (ASSET)</option>
                            <option value="2001">2001 - Sundry Creditors (LIABILITY)</option>
                            <option value="2101">2101 - Output CGST (LIABILITY)</option>
                            <option value="4001">4001 - Sales Revenue (REVENUE)</option>
                            <option value="5001">5001 - Purchase Cost (EXPENSE)</option>
                          </>
                        )}
                      </select>
                      <select
                        value={l.direction}
                        onChange={(e) => {
                          const updated = [...newRuleForm.lines];
                          updated[idx].direction = e.target.value;
                          setNewRuleForm({ ...newRuleForm, lines: updated });
                        }}
                        className={`w-24 rounded p-1.5 text-xs font-semibold border shrink-0 ${
                          l.direction === 'DEBIT'
                            ? 'bg-blue-950/40 text-blue-400 border-blue-800/60'
                            : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                        }`}
                      >
                        <option value="DEBIT">DEBIT</option>
                        <option value="CREDIT">CREDIT</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Amount Field / Expr (e.g. subtotal)"
                        required
                        value={l.amount_field}
                        onChange={(e) => {
                          const updated = [...newRuleForm.lines];
                          updated[idx].amount_field = e.target.value;
                          setNewRuleForm({ ...newRuleForm, lines: updated });
                        }}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded p-1.5 font-mono text-xs text-white min-w-0 focus:border-brand-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveRuleLine(idx)}
                        disabled={newRuleForm.lines.length <= 2}
                        className={`p-1.5 rounded transition shrink-0 ${
                          newRuleForm.lines.length <= 2
                            ? 'text-slate-600 cursor-not-allowed opacity-40'
                            : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40'
                        }`}
                        title={newRuleForm.lines.length <= 2 ? 'Minimum 2 lines required for double-entry' : 'Delete line'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewRuleModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRule}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 shadow-md shadow-brand-500/20 transition disabled:opacity-50"
                >
                  {submittingRule ? 'Saving Rule...' : 'Create Posting Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Posting Rule */}
      {showEditRuleModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                <span>Edit Posting Rule ({editRuleForm.rule_code})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditRuleModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePostingRule} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Rule Code</label>
                  <input
                    type="text"
                    disabled
                    value={editRuleForm.rule_code}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-400 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Trigger Event Code / Type *</label>
                  <input
                    type="text"
                    required
                    value={editRuleForm.event_type}
                    onChange={(e) => setEditRuleForm({ ...editRuleForm, event_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Rule Name *</label>
                <input
                  type="text"
                  required
                  value={editRuleForm.rule_name}
                  onChange={(e) => setEditRuleForm({ ...editRuleForm, rule_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={editRuleForm.description}
                  onChange={(e) => setEditRuleForm({ ...editRuleForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-brand-500 focus:outline-none"
                />
              </div>

              {/* Posting Rule Lines */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">
                    Double-Entry Posting Lines ({editRuleForm.lines.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddEditRuleLine}
                    className="px-2.5 py-1 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 border border-brand-500/30 rounded text-xs font-semibold flex items-center space-x-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {editRuleForm.lines.map((l, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center space-x-2">
                      <span className="text-slate-500 font-mono text-[11px] w-5 text-center shrink-0">
                        #{idx + 1}
                      </span>
                      <select
                        required
                        value={l.account_code}
                        onChange={(e) => {
                          const updated = [...editRuleForm.lines];
                          updated[idx].account_code = e.target.value;
                          setEditRuleForm({ ...editRuleForm, lines: updated });
                        }}
                        className="w-48 bg-slate-800 border border-slate-700 rounded p-1.5 font-mono text-xs text-white shrink-0 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">-- Select GL Account --</option>
                        {accounts.length > 0 ? (
                          accounts.map((acc) => (
                            <option key={acc._id || acc.account_code} value={acc.account_code}>
                              {acc.account_code} - {acc.account_name} ({acc.account_type})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="1101">1101 - Sundry Debtors (ASSET)</option>
                            <option value="1000">1000 - Operating Cash (ASSET)</option>
                            <option value="1002">1002 - Bank Current Account (ASSET)</option>
                            <option value="2001">2001 - Sundry Creditors (LIABILITY)</option>
                            <option value="2101">2101 - Output CGST (LIABILITY)</option>
                            <option value="4001">4001 - Sales Revenue (REVENUE)</option>
                            <option value="5001">5001 - Purchase Cost (EXPENSE)</option>
                          </>
                        )}
                      </select>
                      <select
                        value={l.direction}
                        onChange={(e) => {
                          const updated = [...editRuleForm.lines];
                          updated[idx].direction = e.target.value;
                          setEditRuleForm({ ...editRuleForm, lines: updated });
                        }}
                        className={`w-24 rounded p-1.5 text-xs font-semibold border shrink-0 ${
                          l.direction === 'DEBIT'
                            ? 'bg-blue-950/40 text-blue-400 border-blue-800/60'
                            : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                        }`}
                      >
                        <option value="DEBIT">DEBIT</option>
                        <option value="CREDIT">CREDIT</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Amount Field / Expr (e.g. subtotal)"
                        required
                        value={l.amount_field}
                        onChange={(e) => {
                          const updated = [...editRuleForm.lines];
                          updated[idx].amount_field = e.target.value;
                          setEditRuleForm({ ...editRuleForm, lines: updated });
                        }}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded p-1.5 font-mono text-xs text-white min-w-0 focus:border-brand-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveEditRuleLine(idx)}
                        disabled={editRuleForm.lines.length <= 2}
                        className={`p-1.5 rounded transition shrink-0 ${
                          editRuleForm.lines.length <= 2
                            ? 'text-slate-600 cursor-not-allowed opacity-40'
                            : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40'
                        }`}
                        title={editRuleForm.lines.length <= 2 ? 'Minimum 2 lines required for double-entry' : 'Delete line'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditRuleModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRule}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 shadow-md shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {submittingRule ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
