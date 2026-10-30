import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { commercialApi, inventoryApi, counterpartiesApi, restaurantApi, authApi, rulesApi, eventsApi, usTaxApi } from '../services/api';
import SearchableDropdown from '../components/SearchableDropdown';
import PaymentModal from '../components/PaymentModal';
import {
  FileText,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  DollarSign,
  TrendingUp,
  Receipt,
  Layers,
  Search,
  UserPlus,
  Building,
  User,
  X,
  QrCode,
  Check,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ArrowRight,
  Sliders,
  Percent,
  Trash2,
  FileCode,
  ShieldCheck,
  Zap
} from 'lucide-react';

const isUomDimensionCompatible = (codeA, codeB) => {
  if (!codeA || !codeB) return false;
  const a = String(codeA).toUpperCase().trim();
  const b = String(codeB).toUpperCase().trim();
  if (a === b) return true;
  const groups = [
    ['MG', 'GRAM', 'KG', 'QUINTAL', 'TON'],
    ['ML', 'LTR', 'KL'],
    ['MM', 'CM', 'MTR', 'KM'],
    ['PCS', 'DOZEN', 'GROSS'],
    ['BOX', 'PACK', 'BAG', 'ROLL', 'CAN', 'BOTTLE']
  ];
  for (const grp of groups) {
    if (grp.includes(a) && grp.includes(b)) return true;
  }
  return false;
};

const isUomItemCompatible = (targetCode, baseCode, conversions = []) => {
  if (!targetCode || !baseCode) return false;
  if (isUomDimensionCompatible(targetCode, baseCode)) return true;
  const t = String(targetCode).toUpperCase().trim();
  return (conversions || []).some(c => {
    const cCode = c.alternate_uom_id?.unit_code || (typeof c.alternate_uom_id === 'string' ? c.alternate_uom_id : '');
    return String(cCode).toUpperCase().trim() === t;
  });
};

export default function CommercialWorkspacePage() {
  const { currentCompany } = useAuth();
  const isGstEnabled = currentCompany?.enabled_modules ? currentCompany.enabled_modules.includes('GST_TAX') : true;
  const isRestaurantEnabled = currentCompany?.enabled_modules ? currentCompany.enabled_modules.includes('RESTAURANT') : true;
  const isInventoryEnabled = currentCompany?.enabled_modules ? currentCompany.enabled_modules.includes('INVENTORY') : true;

  const [activeTab, setActiveTab] = useState('documents'); // 'documents' | 'reports' | 'opening_gl'
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Payment Settlement Modal State
  const [paymentModalState, setPaymentModalState] = useState({
    isOpen: false,
    documentId: null,
    documentNumber: 'DRAFT',
    amount: 0,
    customerName: 'Customer',
    companyName: 'Pizza Palace Enterprises Ltd',
    upiId: 'pizzapalace@icici'
  });
  const [paymentLoading, setPaymentLoading] = useState(false);

  // AP / AR Bill Settlement Modal State with Rule & Editable JE Lines
  const [showBillSettleModal, setShowBillSettleModal] = useState(false);
  const [settlingInvoice, setSettlingInvoice] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [allLedgerAccounts, setAllLedgerAccounts] = useState([]);
  const [postingRulesList, setPostingRulesList] = useState([]);
  const [selectedPostingRuleCode, setSelectedPostingRuleCode] = useState('RULE-AP-PAY-01');
  const [selectedEventCode, setSelectedEventCode] = useState('commercial.payment.settle');
  const [jeLines, setJeLines] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleSubmitting, setSettleSubmitting] = useState(false);

  // Live Journal Entry Balance Calculation
  const jeTotals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    jeLines.forEach((l) => {
      totalDebit += Number(l.debit || 0);
      totalCredit += Number(l.credit || 0);
    });
    const diff = Math.abs(totalDebit - totalCredit);
    const isBalanced = diff < 0.009 && totalDebit > 0;
    return {
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      diff: Number(diff.toFixed(2)),
      isBalanced
    };
  }, [jeLines]);

  // Document Post to GL Modal State (Event & Posting Rule Inspector)
  const [showDocPostModal, setShowDocPostModal] = useState(false);
  const [postingDoc, setPostingDoc] = useState(null);
  const [docPostEventCode, setDocPostEventCode] = useState('');
  const [docPostRuleCode, setDocPostRuleCode] = useState('');
  const [docPostJeLines, setDocPostJeLines] = useState([]);
  const [docPostSubmitting, setDocPostSubmitting] = useState(false);

  // Live JE Balance for Document Posting
  const docPostTotals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    docPostJeLines.forEach((l) => {
      totalDebit += Number(l.debit || 0);
      totalCredit += Number(l.credit || 0);
    });
    const diff = Math.abs(totalDebit - totalCredit);
    const isBalanced = diff < 0.009 && totalDebit > 0;
    return {
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      diff: Number(diff.toFixed(2)),
      isBalanced
    };
  }, [docPostJeLines]);

  // New Voucher Modal State
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState('PURCHASE_INVOICE');
  const [subType, setSubType] = useState('TAX_INVOICE');
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [customPartyMode, setCustomPartyMode] = useState(false);
  const [billingName, setBillingName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [partiesList, setPartiesList] = useState([]);
  const [stockItemsList, setStockItemsList] = useState([]);
  const [recipesList, setRecipesList] = useState([]);
  const [lines, setLines] = useState([
    { line_type: 'GOODS', item_name: '', stock_item_id: null, item_code: '', uom: 'UNIT', uom_id: null, available_uoms: [], quantity: 1, unit_price: 100, tax_rate_code: 'GST_0', excluded_ingredients: [], modifiers: [] }
  ]);
  const [isTaxInclusive, setIsTaxInclusive] = useState(false);

  // Quick Party Modal State
  const [showQuickPartyModal, setShowQuickPartyModal] = useState(false);
  const [creatingParty, setCreatingParty] = useState(false);
  const [quickPartyForm, setQuickPartyForm] = useState({
    party_type: 'INDIVIDUAL',
    party_code: '',
    legal_name: '',
    trade_name: '',
    phone: '',
    email: '',
    tax_id: '',
    initial_role_type: 'CUSTOMER',
    city: '',
    state: 'Maharashtra',
    street1: '',
    postal_code: ''
  });

  // Reports State
  const [reportType, setReportType] = useState('sales_register');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Opening GL Reconciliation State
  const [glPreview, setGlPreview] = useState(null);
  const [glLoading, setGlLoading] = useState(false);

  // Phase 5: US Tax Compliance State
  const [usComplianceSubTab, setUsComplianceSubTab] = useState('subledger'); // 'subledger' | 'periods' | 'returns' | 'payments' | 'reconciliation'
  const [usPeriods, setUsPeriods] = useState([]);
  const [usSubledger, setUsSubledger] = useState([]);
  const [usSubledgerSummary, setUsSubledgerSummary] = useState(null);
  const [usReturns, setUsReturns] = useState([]);
  const [usPayments, setUsPayments] = useState([]);
  const [usComplianceLoading, setUsComplianceLoading] = useState(false);
  const [usReconDocSubledger, setUsReconDocSubledger] = useState(null);
  const [usReconSubledgerGl, setUsReconSubledgerGl] = useState(null);
  const [usReconReturnPayment, setUsReconReturnPayment] = useState(null);
  const [providerRetryResult, setProviderRetryResult] = useState(null);

  const [newPeriodData, setNewPeriodData] = useState({
    jurisdictionCode: 'US-CA',
    periodStartDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    periodEndDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
    periodLabel: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    filingFrequency: 'MONTHLY'
  });
  const [paymentForm, setPaymentForm] = useState({
    returnId: '',
    amount: '',
    bankAccountCode: '1002',
    paymentReference: '',
    postToGl: true
  });

  // Indian GST Settlement State
  const [gstReportData, setGstReportData] = useState(null);
  const [gstLoading, setGstLoading] = useState(false);
  const [gstSettlementLoading, setGstSettlementLoading] = useState(false);
  const [gstSettlementResult, setGstSettlementResult] = useState(null);
  const [gstSettlementForm, setGstSettlementForm] = useState({
    bank_account_code: '1002',
    period_label: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')} (GSTR-3B)`,
    notes: 'Monthly Indian GST Set-off & Tax Settlement'
  });

  const loadGstReport = async () => {
    setGstLoading(true);
    try {
      const res = await commercialApi.getGstSummary();
      setGstReportData(res.data);
    } catch (err) {
      console.error('Failed to load GST Summary:', err);
    } finally {
      setGstLoading(false);
    }
  };

  const handleSettleGst = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setGstSettlementLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await commercialApi.settleGst(gstSettlementForm);
      setGstSettlementResult(res.data);
      setSuccess(res.data.message || 'GST Return settled successfully and journal posted to GL.');
      await loadGstReport();
      await fetchDocuments();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to settle GST return');
    } finally {
      setGstSettlementLoading(false);
    }
  };

  const loadUsComplianceData = async () => {
    setUsComplianceLoading(true);
    try {
      const [periodsRes, subledgerRes, summaryRes, returnsRes, paymentsRes] = await Promise.all([
        usTaxApi.getReturnPeriods().catch(() => ({ data: [] })),
        usTaxApi.getSubledgerEntries('?limit=50').catch(() => ({ data: { entries: [] } })),
        usTaxApi.getSubledgerSummary().catch(() => ({ data: null })),
        usTaxApi.getReturns('?limit=50').catch(() => ({ data: { returns: [] } })),
        usTaxApi.getPayments('?limit=50').catch(() => ({ data: { payments: [] } }))
      ]);

      if (periodsRes?.data) setUsPeriods(Array.isArray(periodsRes.data) ? periodsRes.data : []);
      if (subledgerRes?.data) setUsSubledger(subledgerRes.data.entries || (Array.isArray(subledgerRes.data) ? subledgerRes.data : []));
      if (summaryRes?.data) setUsSubledgerSummary(summaryRes.data);
      if (returnsRes?.data) setUsReturns(returnsRes.data.returns || (Array.isArray(returnsRes.data) ? returnsRes.data : []));
      if (paymentsRes?.data) setUsPayments(paymentsRes.data.payments || (Array.isArray(paymentsRes.data) ? paymentsRes.data : []));
    } catch (err) {
      console.error('Error loading US compliance data:', err);
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handleCreateReturnPeriod = async () => {
    try {
      setUsComplianceLoading(true);
      await usTaxApi.createReturnPeriod(newPeriodData);
      setSuccess(`Tax Return Period ${newPeriodData.periodLabel} created successfully.`);
      await loadUsComplianceData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create return period');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handlePrepareReturn = async (periodId) => {
    try {
      setUsComplianceLoading(true);
      const res = await usTaxApi.prepareDraftReturn({ return_period_id: periodId });
      setSuccess(`Draft Tax Return prepared: ${res.data?.return_number || 'OK'}`);
      await loadUsComplianceData();
      setUsComplianceSubTab('returns');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to prepare return');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handleTransitionReturn = async (returnId, targetStatus) => {
    try {
      let filingRef = '';
      if (targetStatus === 'FILED') {
        filingRef = window.prompt('Enter statutory filing confirmation reference:', `FILING-${Date.now()}`);
        if (!filingRef) return;
      }
      setUsComplianceLoading(true);
      await usTaxApi.updateReturnStatus(returnId, {
        status: targetStatus,
        filing_confirmation_reference: filingRef
      });
      setSuccess(`Tax Return status transitioned to ${targetStatus}`);
      await loadUsComplianceData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update return status');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handleRecordTaxPayment = async () => {
    try {
      if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
        setError('Payment amount must be greater than 0');
        return;
      }
      setUsComplianceLoading(true);
      await usTaxApi.recordPayment({
        return_id: paymentForm.returnId || undefined,
        amount: Number(paymentForm.amount),
        bank_account_code: paymentForm.bankAccountCode,
        payment_reference: paymentForm.paymentReference || `TAX-PMT-${Date.now()}`,
        post_to_gl: paymentForm.postToGl
      });
      setSuccess('Tax payment recorded and subledger/GL updated.');
      setPaymentForm({ returnId: '', amount: '', bankAccountCode: '1002', paymentReference: '', postToGl: true });
      await loadUsComplianceData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to record tax payment');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handleConfirmTaxPayment = async (paymentId) => {
    try {
      const confRef = window.prompt('Enter Bank / Clearance Confirmation Reference:', `BANK-CONF-${Date.now()}`);
      if (!confRef) return;
      setUsComplianceLoading(true);
      await usTaxApi.confirmPayment(paymentId, { confirmation_reference: confRef });
      setSuccess('Tax payment confirmed successfully.');
      await loadUsComplianceData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to confirm tax payment');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handleRunDocSubledgerRecon = async () => {
    try {
      setUsComplianceLoading(true);
      const res = await usTaxApi.reconcileDocsToSubledger();
      setUsReconDocSubledger(res.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Reconciliation failed');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handleRunSubledgerGlRecon = async () => {
    try {
      setUsComplianceLoading(true);
      const res = await usTaxApi.reconcileSubledgerToGl();
      setUsReconSubledgerGl(res.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'GL Reconciliation failed');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handleRunReturnPaymentRecon = async (returnId) => {
    try {
      if (!returnId) return;
      setUsComplianceLoading(true);
      const res = await usTaxApi.reconcileReturnToPayments(returnId);
      setUsReconReturnPayment(res.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Return Reconciliation failed');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const handleRetryProviderRecon = async () => {
    try {
      setUsComplianceLoading(true);
      const res = await usTaxApi.retryProviderReconciliations({ limit: 50 });
      setProviderRetryResult(res.data);
      setSuccess(`Provider retry completed: ${res.data?.retried_success || 0} succeeded, ${res.data?.retried_failed || 0} failed.`);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Provider retry failed');
    } finally {
      setUsComplianceLoading(false);
    }
  };

  const fetchMasters = async () => {
    try {
      const [partiesRes, itemsRes, recipesRes, accountsRes, rulesRes] = await Promise.all([
        counterpartiesApi.getParties().catch(() => ({ data: [] })),
        inventoryApi.getItems('?limit=200').catch(() => ({ data: { items: [] } })),
        restaurantApi.getRecipes ? restaurantApi.getRecipes().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        authApi.getAccounts().catch(() => ({ data: [] })),
        rulesApi.getRules ? rulesApi.getRules().catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      if (partiesRes && partiesRes.data) {
        setPartiesList(Array.isArray(partiesRes.data) ? partiesRes.data : []);
      }
      if (itemsRes && itemsRes.data) {
        const itms = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data.items || []);
        setStockItemsList(itms);
      }
      if (recipesRes && recipesRes.data) {
        const recs = Array.isArray(recipesRes.data) ? recipesRes.data : (recipesRes.data.recipes || []);
        setRecipesList(recs);
      }
      if (rulesRes && rulesRes.data) {
        setPostingRulesList(Array.isArray(rulesRes.data) ? rulesRes.data : []);
      }
      if (accountsRes && accountsRes.data) {
        const rawAccs = Array.isArray(accountsRes.data) ? accountsRes.data : [];
        const postingAccounts = rawAccs.filter(a => a.is_posting_allowed !== false && !a.is_group);
        setAllLedgerAccounts(postingAccounts.length > 0 ? postingAccounts : rawAccs);

        const bankOrCash = rawAccs.filter(a =>
          a.account_type === 'ASSET' ||
          ['1000', '1001', '1002', '1010', '1110'].includes(a.account_code) ||
          /bank|cash|cheque|clearing|settlement/i.test(a.account_name)
        );
        const finalList = bankOrCash.length > 0 ? bankOrCash : rawAccs;
        setBankAccounts(finalList);
        if (finalList.length > 0) {
          const defaultAcc = finalList.find(a => a.account_code === '1002') || finalList[0];
          setSelectedAccountId(defaultAcc._id || defaultAcc.account_code);
        }
      }
    } catch (err) {
      console.warn('Failed to load parties, inventory, recipes, or accounts:', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchMasters();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await commercialApi.getDocuments();
      const docList = Array.isArray(res.data) ? res.data : (res.data?.documents || []);
      setDocuments(docList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPaymentModal = (doc) => {
    setPaymentModalState({
      isOpen: true,
      documentId: doc._id,
      documentNumber: doc.document_number,
      amount: Number(doc.grand_total || doc.total_amount || 0),
      customerName: doc.billing_name || doc.party_name || 'Walk-in Customer',
      companyName: 'Pizza Palace Enterprises Ltd',
      upiId: 'pizzapalace@icici'
    });
  };

  const handleConfirmPayment = async (paymentData) => {
    try {
      setPaymentLoading(true);
      setError('');
      // Post document to GL & trigger BOM recipe consumption / finished goods deduction
      await commercialApi.postDocument(paymentModalState.documentId);
      setSuccess(`Payment of ₹${paymentData.amount.toFixed(2)} received via ${paymentData.method}! Invoice ${paymentModalState.documentNumber} posted & inventory auto-deducted.`);
      setPaymentModalState(prev => ({ ...prev, isOpen: false }));
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const generateJeLinesForDoc = (doc, eventCode) => {
    if (!doc) return [];
    const grandTotal = Number(doc.grand_total || doc.total_amount || 0).toFixed(2);
    const taxable = Number(doc.total_taxable_amount || doc.taxable_amount || 0).toFixed(2);
    const taxTotal = Number(doc.total_tax_amount || doc.tax_amount || 0);
    const halfTax = (taxTotal / 2).toFixed(2);
    const partyName = doc.billing_name || doc.party_name || doc.party_id?.trade_name || doc.party_id?.legal_name || 'Party';
    const isUs = doc.tax_regime === 'US_SALES_TAX';

    if (doc.document_type === 'CREDIT_NOTE' || doc.document_type === 'SALES_RETURN') {
      if (eventCode === 'commercial.credit_note.price_adjustment') {
        const lines = [
          { id: 'l1', account_code: '5030', direction: 'DEBIT', debit: taxable, credit: '0.00', memo: `Price discount / rebate allowance for ${doc.document_number}` }
        ];
        if (taxTotal > 0) {
          if (isUs) {
            lines.push({ id: 'l2', account_code: '2110', direction: 'DEBIT', debit: taxTotal.toFixed(2), credit: '0.00', memo: `Reverse Sales Tax Payable on ${doc.document_number}` });
          } else {
            lines.push({ id: 'l2', account_code: '2210', direction: 'DEBIT', debit: halfTax, credit: '0.00', memo: `Reverse CGST Output on ${doc.document_number}` });
            lines.push({ id: 'l3', account_code: '2220', direction: 'DEBIT', debit: halfTax, credit: '0.00', memo: `Reverse SGST Output on ${doc.document_number}` });
          }
        }
        lines.push({ id: 'l4', account_code: '1100', direction: 'CREDIT', debit: '0.00', credit: grandTotal, memo: `Credit customer AR for price rebate on ${doc.document_number} (${partyName})` });
        return lines;
      } else if (eventCode === 'commercial.credit_note.bad_debt_allowance') {
        return [
          { id: 'l1', account_code: '5210', direction: 'DEBIT', debit: grandTotal, credit: '0.00', memo: `Customer dispute / bad debt allowance write-off for ${doc.document_number}` },
          { id: 'l2', account_code: '1100', direction: 'CREDIT', debit: '0.00', credit: grandTotal, memo: `Credit customer AR account for dispute on ${doc.document_number} (${partyName})` }
        ];
      } else {
        // Standard sales return
        const lines = [
          { id: 'l1', account_code: '4000', direction: 'DEBIT', debit: taxable, credit: '0.00', memo: `Sales return adjustment on ${doc.document_number}` }
        ];
        if (taxTotal > 0) {
          if (isUs) {
            lines.push({ id: 'l2', account_code: '2110', direction: 'DEBIT', debit: taxTotal.toFixed(2), credit: '0.00', memo: `Reverse Sales Tax Payable on return ${doc.document_number}` });
          } else {
            lines.push({ id: 'l2', account_code: '2210', direction: 'DEBIT', debit: halfTax, credit: '0.00', memo: `Reverse Output CGST on return ${doc.document_number}` });
            lines.push({ id: 'l3', account_code: '2220', direction: 'DEBIT', debit: halfTax, credit: '0.00', memo: `Reverse Output SGST on return ${doc.document_number}` });
          }
        }
        lines.push({ id: 'l4', account_code: '1100', direction: 'CREDIT', debit: '0.00', credit: grandTotal, memo: `Credit customer AR for return ${doc.document_number} (${partyName})` });
        return lines;
      }
    } else if (doc.document_type === 'SALES_INVOICE') {
      if (eventCode === 'commercial.sales_invoice.cash_sale') {
        const lines = [
          { id: 'l1', account_code: '1002', direction: 'DEBIT', debit: grandTotal, credit: '0.00', memo: `Cash/Bank received for counter sale ${doc.document_number}` },
          { id: 'l2', account_code: '4000', direction: 'CREDIT', debit: '0.00', credit: taxable, memo: `Sales revenue on ${doc.document_number}` }
        ];
        if (taxTotal > 0) {
          if (isUs) {
            lines.push({ id: 'l3', account_code: '2110', direction: 'CREDIT', debit: '0.00', credit: taxTotal.toFixed(2), memo: `Sales Tax Payable on ${doc.document_number}` });
          } else {
            lines.push({ id: 'l3', account_code: '2210', direction: 'CREDIT', debit: '0.00', credit: halfTax, memo: `CGST Output Liability on ${doc.document_number}` });
            lines.push({ id: 'l4', account_code: '2220', direction: 'CREDIT', debit: '0.00', credit: halfTax, memo: `SGST Output Liability on ${doc.document_number}` });
          }
        }
        return lines;
      } else {
        const lines = [
          { id: 'l1', account_code: '1100', direction: 'DEBIT', debit: grandTotal, credit: '0.00', memo: `Receivable from customer for ${doc.document_number} (${partyName})` },
          { id: 'l2', account_code: '4000', direction: 'CREDIT', debit: '0.00', credit: taxable, memo: `Sales revenue on ${doc.document_number}` }
        ];
        if (taxTotal > 0) {
          if (isUs) {
            lines.push({ id: 'l3', account_code: '2110', direction: 'CREDIT', debit: '0.00', credit: taxTotal.toFixed(2), memo: `Sales Tax Payable on ${doc.document_number}` });
          } else {
            lines.push({ id: 'l3', account_code: '2210', direction: 'CREDIT', debit: '0.00', credit: halfTax, memo: `CGST Output Liability on ${doc.document_number}` });
            lines.push({ id: 'l4', account_code: '2220', direction: 'CREDIT', debit: '0.00', credit: halfTax, memo: `SGST Output Liability on ${doc.document_number}` });
          }
        }
        return lines;
      }
    } else if (doc.document_type === 'PURCHASE_INVOICE') {
      const assetOrExp = eventCode === 'commercial.purchase_invoice.direct_expense' ? '5020' : (eventCode === 'commercial.purchase_invoice.fixed_asset' ? '1500' : '1300');
      const lines = [
        { id: 'l1', account_code: assetOrExp, direction: 'DEBIT', debit: taxable, credit: '0.00', memo: `Purchase debit for ${doc.document_number}` }
      ];
      if (taxTotal > 0) {
        if (isUs) {
          lines.push({ id: 'l2', account_code: '5110', direction: 'DEBIT', debit: taxTotal.toFixed(2), credit: '0.00', memo: `Purchase tax expense on ${doc.document_number}` });
        } else {
          lines.push({ id: 'l2', account_code: '1210', direction: 'DEBIT', debit: halfTax, credit: '0.00', memo: `CGST Input Tax Credit on ${doc.document_number}` });
          lines.push({ id: 'l3', account_code: '1220', direction: 'DEBIT', debit: halfTax, credit: '0.00', memo: `SGST Input Tax Credit on ${doc.document_number}` });
        }
      }
      lines.push({ id: 'l4', account_code: '2000', direction: 'CREDIT', debit: '0.00', credit: grandTotal, memo: `Payable to vendor for ${doc.document_number} (${partyName})` });
      return lines;
    }

    return [
      { id: 'l1', account_code: '4000', direction: 'DEBIT', debit: grandTotal, credit: '0.00', memo: `Adjustment on ${doc.document_number}` },
      { id: 'l2', account_code: '1100', direction: 'CREDIT', debit: '0.00', credit: grandTotal, memo: `Adjustment on ${doc.document_number}` }
    ];
  };

  const handleOpenPostModal = (doc) => {
    setPostingDoc(doc);
    let defaultEvent = 'commercial.document.posted';
    let defaultRule = 'RULE-AUTO-POST';

    if (doc.document_type === 'CREDIT_NOTE' || doc.document_type === 'SALES_RETURN') {
      defaultEvent = 'commercial.credit_note.stock_return';
      defaultRule = 'RULE-CN-01';
    } else if (doc.document_type === 'SALES_INVOICE') {
      defaultEvent = 'commercial.sales_invoice.credit_sale';
      defaultRule = 'RULE-SI-01';
    } else if (doc.document_type === 'PURCHASE_INVOICE') {
      defaultEvent = 'commercial.purchase_invoice.stock_inflow';
      defaultRule = 'RULE-PI-01';
    }

    setDocPostEventCode(defaultEvent);
    setDocPostRuleCode(defaultRule);
    const initialLines = generateJeLinesForDoc(doc, defaultEvent);
    setDocPostJeLines(initialLines);
    setShowDocPostModal(true);
  };

  const handleDocEventChange = (newEventCode) => {
    setDocPostEventCode(newEventCode);
    let rule = 'RULE-AUTO-POST';
    if (newEventCode.includes('price_adjustment')) rule = 'RULE-CN-02';
    else if (newEventCode.includes('bad_debt')) rule = 'RULE-CN-03';
    else if (newEventCode.includes('stock_return')) rule = 'RULE-CN-01';
    else if (newEventCode.includes('cash_sale')) rule = 'RULE-SI-02';
    else if (newEventCode.includes('credit_sale')) rule = 'RULE-SI-01';
    else if (newEventCode.includes('direct_expense')) rule = 'RULE-PI-02';
    else if (newEventCode.includes('fixed_asset')) rule = 'RULE-PI-03';
    setDocPostRuleCode(rule);

    if (postingDoc) {
      const updatedLines = generateJeLinesForDoc(postingDoc, newEventCode);
      setDocPostJeLines(updatedLines);
    }
  };

  const handleUpdateDocJeLine = (idx, field, val) => {
    setDocPostJeLines(prev => {
      const updated = [...prev];
      const cur = { ...updated[idx] };
      cur[field] = val;
      if (field === 'direction') {
        if (val === 'DEBIT') {
          cur.debit = cur.credit && Number(cur.credit) > 0 ? cur.credit : (cur.debit || '0.00');
          cur.credit = '0.00';
        } else {
          cur.credit = cur.debit && Number(cur.debit) > 0 ? cur.debit : (cur.credit || '0.00');
          cur.debit = '0.00';
        }
      }
      updated[idx] = cur;
      return updated;
    });
  };

  const handleAddDocJeLine = (accountCode = '1002', direction = 'DEBIT', amt = '0.00', memo = '') => {
    setDocPostJeLines(prev => [
      ...prev,
      {
        id: `post-line-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        account_code: accountCode,
        direction: direction,
        debit: direction === 'DEBIT' ? amt : '0.00',
        credit: direction === 'CREDIT' ? amt : '0.00',
        memo: memo || ''
      }
    ]);
  };

  const handleRemoveDocJeLine = (idx) => {
    setDocPostJeLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmPostDoc = async () => {
    if (!postingDoc) return;
    if (!docPostTotals.isBalanced) {
      setError(`Journal Entry is unbalanced! Total Debit (${docPostTotals.totalDebit}) must equal Total Credit (${docPostTotals.totalCredit}).`);
      return;
    }
    setDocPostSubmitting(true);
    try {
      await commercialApi.postDocument(postingDoc._id, {
        customJournalLines: docPostJeLines,
        eventCode: docPostEventCode,
        postingRuleCode: docPostRuleCode
      });
      setSuccess(`Document "${postingDoc.document_number}" posted to GL with Event [${docPostEventCode}] and Rule [${docPostRuleCode}]!`);
      setShowDocPostModal(false);
      setPostingDoc(null);
      fetchDocuments();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to post document to GL');
    } finally {
      setDocPostSubmitting(false);
    }
  };

  const handleReverse = async (id) => {
    const reason = window.prompt('Enter reason for reversal:', 'Correction of transaction');
    if (!reason) return;
    try {
      await commercialApi.reverseDocument(id, { reason });
      setSuccess('Document reversed successfully with offsetting journals and stock return.');
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCalculateTax = async (id) => {
    try {
      const res = await commercialApi.calculateTax(id);
      const totalTax = res.data?.calculation?.total_tax_amount || res.calculation?.total_tax_amount || 'Calculated';
      setSuccess(`Tax calculation complete! Total tax: $${totalTax}`);
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancelDocument = async (id) => {
    if (!window.confirm('Cancel and delete this draft voucher?')) return;
    try {
      await commercialApi.cancelDocument(id);
      setSuccess('Draft voucher cancelled successfully.');
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenBillSettlement = (invoice) => {
    setSettlingInvoice(invoice);
    const totalAmt = Number(invoice.grand_total || invoice.total_amount || 0);
    const paidAmt = Number(invoice.amount_paid || 0);
    const rawBal = invoice.balance_due !== undefined ? Number(invoice.balance_due) : (paidAmt > 0 ? totalAmt - paidAmt : totalAmt);
    const dueAmt = rawBal > 0 ? rawBal : totalAmt;
    const dueAmtStr = dueAmt.toFixed(2);
    setSettleAmount(dueAmtStr);
    setPaymentMode('BANK_TRANSFER');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setReferenceNumber(`UTR-${Math.floor(10000000 + Math.random() * 90000000)}`);
    setSettleNotes(`Settlement against ${invoice.document_number} (${invoice.billing_name || invoice.party_name || 'Vendor'})`);

    const isSupplierBill = invoice.document_type === 'PURCHASE_INVOICE' || invoice.document_type === 'DEBIT_NOTE';
    const ruleCode = isSupplierBill ? 'RULE-AP-PAY-01' : 'RULE-AR-REC-01';
    const eventCode = isSupplierBill ? 'commercial.payment.settle' : 'commercial.receipt.settle';
    setSelectedPostingRuleCode(ruleCode);
    setSelectedEventCode(eventCode);

    const defaultBank = bankAccounts.find(a => a.account_code === '1002') || bankAccounts[0];
    const bankCode = defaultBank ? defaultBank.account_code : '1002';
    if (defaultBank) {
      setSelectedAccountId(defaultBank._id || defaultBank.account_code);
    }

    if (isSupplierBill) {
      setJeLines([
        {
          id: 'line-1',
          account_code: '2001',
          direction: 'DEBIT',
          debit: dueAmtStr,
          credit: '0.00',
          memo: `Settlement of AP for ${invoice.document_number} (${invoice.billing_name || invoice.party_name || 'Vendor'})`
        },
        {
          id: 'line-2',
          account_code: bankCode,
          direction: 'CREDIT',
          debit: '0.00',
          credit: dueAmtStr,
          memo: `Disbursed via Bank Transfer for ${invoice.document_number}`
        }
      ]);
    } else {
      setJeLines([
        {
          id: 'line-1',
          account_code: bankCode,
          direction: 'DEBIT',
          debit: dueAmtStr,
          credit: '0.00',
          memo: `Deposit received for ${invoice.document_number}`
        },
        {
          id: 'line-2',
          account_code: '1101',
          direction: 'CREDIT',
          debit: '0.00',
          credit: dueAmtStr,
          memo: `Settlement of AR for ${invoice.document_number} (${invoice.billing_name || invoice.party_name || 'Customer'})`
        }
      ]);
    }

    setShowBillSettleModal(true);
  };

  const handleUpdateJeLine = (idx, field, val) => {
    setJeLines(prev => {
      const updated = [...prev];
      const cur = { ...updated[idx] };
      cur[field] = val;
      if (field === 'direction') {
        if (val === 'DEBIT') {
          cur.debit = cur.credit && Number(cur.credit) > 0 ? cur.credit : (cur.debit || '0.00');
          cur.credit = '0.00';
        } else {
          cur.credit = cur.debit && Number(cur.debit) > 0 ? cur.debit : (cur.credit || '0.00');
          cur.debit = '0.00';
        }
      }
      updated[idx] = cur;
      return updated;
    });
  };

  const handleAddJeLine = (accountCode = '1001', direction = 'DEBIT', amt = '0.00', memo = '') => {
    setJeLines(prev => [
      ...prev,
      {
        id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        account_code: accountCode,
        direction: direction,
        debit: direction === 'DEBIT' ? amt : '0.00',
        credit: direction === 'CREDIT' ? amt : '0.00',
        memo: memo || ''
      }
    ]);
  };

  const handleRemoveJeLine = (idx) => {
    setJeLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleBankChange = (newAccId) => {
    setSelectedAccountId(newAccId);
    const selAcc = bankAccounts.find(a => String(a._id) === String(newAccId) || a.account_code === String(newAccId));
    if (!selAcc || !settlingInvoice) return;
    const newBankCode = selAcc.account_code;
    const isSupplier = settlingInvoice.document_type === 'PURCHASE_INVOICE' || settlingInvoice.document_type === 'DEBIT_NOTE';

    setJeLines(prev => prev.map(line => {
      const isBankLine = isSupplier
        ? line.direction === 'CREDIT' && (bankAccounts.some(b => b.account_code === line.account_code) || ['1000', '1001', '1002', '1003', '1010', '1110'].includes(line.account_code))
        : line.direction === 'DEBIT' && (bankAccounts.some(b => b.account_code === line.account_code) || ['1000', '1001', '1002', '1003', '1010', '1110'].includes(line.account_code));

      if (isBankLine) {
        return {
          ...line,
          account_code: newBankCode,
          memo: isSupplier ? `Disbursed via ${selAcc.account_name} (${newBankCode})` : `Deposited into ${selAcc.account_name} (${newBankCode})`
        };
      }
      return line;
    }));
  };

  const handleSettleAmountChange = (newAmt) => {
    setSettleAmount(newAmt);
    const numAmt = parseFloat(newAmt) || 0;
    if (numAmt > 0 && jeLines.length === 2 && selectedPostingRuleCode.startsWith('RULE-A')) {
      setJeLines(prev => prev.map(l => ({
        ...l,
        debit: l.direction === 'DEBIT' ? numAmt.toFixed(2) : '0.00',
        credit: l.direction === 'CREDIT' ? numAmt.toFixed(2) : '0.00'
      })));
    }
  };

  const handleApplyRuleTemplate = (ruleCode) => {
    setSelectedPostingRuleCode(ruleCode);
    if (!settlingInvoice) return;
    const isSupplier = settlingInvoice.document_type === 'PURCHASE_INVOICE' || settlingInvoice.document_type === 'DEBIT_NOTE';
    const totalDue = Number(settleAmount || settlingInvoice.balance_due || settlingInvoice.grand_total || 0);
    const bankCode = bankAccounts.find(a => String(a._id) === String(selectedAccountId) || a.account_code === String(selectedAccountId))?.account_code || '1002';

    if (ruleCode === 'RULE-AP-PAY-01' || ruleCode === 'RULE-AR-REC-01') {
      if (isSupplier) {
        setJeLines([
          { id: 'line-1', account_code: '2001', direction: 'DEBIT', debit: totalDue.toFixed(2), credit: '0.00', memo: `Settlement of AP for ${settlingInvoice.document_number}` },
          { id: 'line-2', account_code: bankCode, direction: 'CREDIT', debit: '0.00', credit: totalDue.toFixed(2), memo: `Bank disbursement for ${settlingInvoice.document_number}` }
        ]);
      } else {
        setJeLines([
          { id: 'line-1', account_code: bankCode, direction: 'DEBIT', debit: totalDue.toFixed(2), credit: '0.00', memo: `Bank receipt for ${settlingInvoice.document_number}` },
          { id: 'line-2', account_code: '1101', direction: 'CREDIT', debit: '0.00', credit: totalDue.toFixed(2), memo: `Settlement of AR for ${settlingInvoice.document_number}` }
        ]);
      }
    } else if (ruleCode === 'RULE-AP-PAY-DISCOUNT') {
      const discountAmt = Math.round(totalDue * 0.02 * 100) / 100;
      const netPaid = Number((totalDue - discountAmt).toFixed(2));
      setJeLines([
        { id: 'line-1', account_code: '2001', direction: 'DEBIT', debit: totalDue.toFixed(2), credit: '0.00', memo: `Gross settlement of AP for ${settlingInvoice.document_number}` },
        { id: 'line-2', account_code: bankCode, direction: 'CREDIT', debit: '0.00', credit: netPaid.toFixed(2), memo: `Net bank payment disbursed after discount` },
        { id: 'line-3', account_code: '4900', direction: 'CREDIT', debit: '0.00', credit: discountAmt.toFixed(2), memo: `Early payment cash discount / Kasar received` }
      ]);
    } else if (ruleCode === 'RULE-AP-PAY-TDS') {
      const tdsAmt = Math.round(totalDue * 0.01 * 100) / 100;
      const netPaid = Number((totalDue - tdsAmt).toFixed(2));
      setJeLines([
        { id: 'line-1', account_code: '2001', direction: 'DEBIT', debit: totalDue.toFixed(2), credit: '0.00', memo: `Gross AP liability cleared for ${settlingInvoice.document_number}` },
        { id: 'line-2', account_code: bankCode, direction: 'CREDIT', debit: '0.00', credit: netPaid.toFixed(2), memo: `Net bank payment disbursed after TDS` },
        { id: 'line-3', account_code: '2101', direction: 'CREDIT', debit: '0.00', credit: tdsAmt.toFixed(2), memo: `Statutory TDS withheld on bill settlement` }
      ]);
    }
  };

  const handleConfirmBillSettlement = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!settlingInvoice) return;
    const amountNum = Number(settleAmount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid payment amount greater than 0.');
      return;
    }
    if (!jeTotals.isBalanced) {
      setError(`Journal Entry is unbalanced! Total Debits (₹${jeTotals.totalDebit.toFixed(2)}) must equal Total Credits (₹${jeTotals.totalCredit.toFixed(2)}). Difference: ₹${jeTotals.diff.toFixed(2)}.`);
      return;
    }

    const isSupplierBill = settlingInvoice.document_type === 'PURCHASE_INVOICE' || settlingInvoice.document_type === 'DEBIT_NOTE';
    const targetDocType = isSupplierBill ? 'PAYMENT' : 'RECEIPT';

    try {
      setSettleSubmitting(true);
      setError('');

      // 1. Create draft voucher
      const draftRes = await commercialApi.createDraftDocument({
        document_type: targetDocType,
        sub_type: 'DIRECT',
        party_id: settlingInvoice.party_id?._id || settlingInvoice.party_id || null,
        party_name: settlingInvoice.billing_name || settlingInvoice.party_name,
        billing_name: settlingInvoice.billing_name || settlingInvoice.party_name,
        bank_or_cash_account_id: selectedAccountId,
        reference_number: referenceNumber || `REF-${Date.now()}`,
        document_date: paymentDate,
        notes: settleNotes || `Settlement for ${settlingInvoice.document_number}`,
        linked_source_document_id: settlingInvoice._id,
        lines: [
          {
            line_number: 1,
            line_type: 'ACCOUNT',
            item_name: `${isSupplierBill ? 'Supplier Bill Payment' : 'Customer Payment Receipt'}: ${settlingInvoice.document_number}`,
            quantity: 1,
            unit_price: amountNum,
            tax_rate_code: 'GST_0'
          }
        ]
      });

      const draftDoc = draftRes.data;
      if (!draftDoc || !draftDoc._id) {
        throw new Error('Failed to create payment draft voucher.');
      }

      // Format custom journal lines from the interactive grid
      const customJournalLines = jeLines.map((l) => ({
        account_code: String(l.account_code),
        debit: Number(l.debit || 0).toFixed(2),
        credit: Number(l.credit || 0).toFixed(2),
        memo: l.memo || `${isSupplierBill ? 'Settlement of AP' : 'Receipt for AR'}: ${settlingInvoice.document_number}`
      }));

      // 2. Post the voucher to GL with allocation and custom journal lines
      await commercialApi.postDocument(draftDoc._id, {
        allocations: [
          {
            invoice_id: settlingInvoice._id,
            amount: amountNum
          }
        ],
        customJournalLines
      });

      const selAccObj = bankAccounts.find(a => String(a._id) === String(selectedAccountId) || a.account_code === String(selectedAccountId));
      const accDesc = selAccObj ? `${selAccObj.account_code} - ${selAccObj.account_name}` : 'Bank Account';

      setShowBillSettleModal(false);
      setSettlingInvoice(null);
      setSuccess(`⚡ Successfully posted Payment Voucher ${draftDoc.document_number}! Settled ₹${amountNum.toFixed(2)} against ${settlingInvoice.document_number}. GL Journal Entry posted with ${customJournalLines.length} balanced lines under rule ${selectedPostingRuleCode}.`);
      await fetchDocuments();
    } catch (err) {
      setError(err.message || 'Payment settlement failed.');
    } finally {
      setSettleSubmitting(false);
    }
  };

  const handleCreateDocument = async (e, shouldCollectPayment = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!billingName.trim()) {
      setError('Please select or enter a Customer / Vendor name.');
      return;
    }
    try {
      const formattedLines = lines.map((l, idx) => ({
        line_number: idx + 1,
        line_type: l.line_type || 'GOODS',
        stock_item_id: l.stock_item_id || null,
        item_code: l.item_code || '',
        item_name: l.item_name || 'Standard Item',
        uom: l.uom || 'UNIT',
        uom_id: l.uom_id || null,
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        tax_rate_code: isGstEnabled ? (l.tax_rate_code || 'GST_0') : 'GST_0',
        excluded_ingredients: l.excluded_ingredients || [],
        modifiers: l.modifiers || []
      }));

      const res = await commercialApi.createDraftDocument({
        document_type: docType,
        sub_type: subType,
        is_tax_inclusive: isTaxInclusive,
        tax_regime: 'GST',
        party_id: selectedPartyId || null,
        party_name: billingName,
        billing_name: billingName,
        customer_phone: customerPhone,
        lines: formattedLines
      });

      const createdDoc = res.data;
      setShowModal(false);

      if (shouldCollectPayment && createdDoc) {
        setPaymentModalState({
          isOpen: true,
          documentId: createdDoc._id,
          documentNumber: createdDoc.document_number,
          amount: Number(createdDoc.grand_total || createdDoc.total_amount || 0),
          customerName: billingName,
          companyName: 'Pizza Palace Enterprises Ltd',
          upiId: 'pizzapalace@icici'
        });
      } else {
        setSuccess('Draft voucher created successfully.');
      }
      fetchDocuments();
    } catch (err) {
      setError(err.message);
    }
  };

  const openQuickPartyModal = () => {
    const isSupplier = docType.includes('PURCHASE') || docType === 'DEBIT_NOTE';
    const randomCode = `${isSupplier ? 'VEND' : 'CUST'}-${Math.floor(1000 + Math.random() * 9000)}`;
    setQuickPartyForm({
      party_type: 'INDIVIDUAL',
      party_code: randomCode,
      legal_name: billingName || '',
      trade_name: '',
      phone: customerPhone || '',
      email: '',
      tax_id: '',
      initial_role_type: isSupplier ? 'SUPPLIER' : 'CUSTOMER',
      city: 'Pune',
      state: 'Maharashtra',
      street1: '',
      postal_code: '411001'
    });
    setShowQuickPartyModal(true);
  };

  const handleSaveQuickParty = async (e) => {
    e.preventDefault();
    if (!quickPartyForm.legal_name.trim()) {
      setError('Party / Customer Name is required');
      return;
    }
    setCreatingParty(true);
    setError('');
    try {
      const payload = {
        party_code: quickPartyForm.party_code.trim().toUpperCase(),
        legal_name: quickPartyForm.legal_name.trim(),
        trade_name: quickPartyForm.trade_name.trim() || quickPartyForm.legal_name.trim(),
        party_type: quickPartyForm.party_type,
        phone: quickPartyForm.phone.trim(),
        email: quickPartyForm.email.trim(),
        tax_id: quickPartyForm.tax_id.trim().toUpperCase(),
        initial_role_type: quickPartyForm.initial_role_type,
        address: {
          street1: quickPartyForm.street1.trim(),
          city: quickPartyForm.city.trim(),
          state: quickPartyForm.state.trim(),
          postal_code: quickPartyForm.postal_code.trim()
        }
      };
      const res = await counterpartiesApi.createParty(payload);
      if (res.success && res.data) {
        const created = res.data;
        // Refresh parties list
        await fetchMasters();
        // Automatically select newly created party
        setSelectedPartyId(created._id);
        setBillingName(created.legal_name || created.trade_name);
        if (created.phone) setCustomerPhone(created.phone);
        setCustomPartyMode(false);
        setShowQuickPartyModal(false);
        setSuccess(`Party "${created.legal_name}" registered & selected successfully!`);
      }
    } catch (err) {
      setError(err.message || 'Failed to create party');
    } finally {
      setCreatingParty(false);
    }
  };

  const addLine = () => {
    setLines([
      ...lines,
      {
        line_type: 'GOODS',
        item_name: '',
        stock_item_id: null,
        item_code: '',
        uom: 'UNIT',
        uom_id: null,
        available_uoms: [],
        quantity: 1,
        unit_price: 100,
        tax_rate_code: 'GST_0',
        excluded_ingredients: [],
        modifiers: []
      }
    ]);
  };

  const updateLine = (idx, field, value) => {
    const updated = [...lines];
    updated[idx][field] = value;
    setLines(updated);
  };

  const handleLineUomChange = (idx, selectedVal) => {
    const updated = [...lines];
    const line = updated[idx];
    const matchedUom = (line.available_uoms || []).find(
      u => String(u._id) === String(selectedVal) || u.unit_code === selectedVal
    );
    if (matchedUom) {
      line.uom = matchedUom.unit_code;
      line.uom_id = matchedUom._id || null;
    } else {
      line.uom = selectedVal;
    }
    setLines(updated);
  };

  const removeLine = (idx) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const toggleExcludeCommercialLineIngredient = (idx, ingId, ingName) => {
    const updated = [...lines];
    const curExcluded = updated[idx].excluded_ingredients || [];
    const idStr = String(ingId);
    const isExcluded = curExcluded.includes(idStr);
    const modTag = `NO ${ingName.toUpperCase()}`;

    if (isExcluded) {
      updated[idx].excluded_ingredients = curExcluded.filter(id => id !== idStr);
      updated[idx].modifiers = (updated[idx].modifiers || []).filter(m => m !== modTag);
    } else {
      updated[idx].excluded_ingredients = [...curExcluded, idStr];
      updated[idx].modifiers = [...(updated[idx].modifiers || []), modTag];
    }
    setLines(updated);
  };

  const handleItemSelect = (idx, val, opt) => {
    const updated = [...lines];
    if (opt && opt.item) {
      const itm = opt.item;
      updated[idx].stock_item_id = itm._id;
      updated[idx].item_name = itm.item_name;
      updated[idx].item_code = itm.item_code || itm.sku || '';

      const isPurchaseDoc = docType === 'PURCHASE_INVOICE' || docType === 'DEBIT_NOTE';

      const autoRate = isPurchaseDoc
        ? (itm.purchase_price || itm.standard_cost || updated[idx].unit_price)
        : (itm.sales_price || itm.standard_selling_price || updated[idx].unit_price);
      if (autoRate !== undefined && autoRate !== null) {
        updated[idx].unit_price = Number(autoRate);
      }
      if (itm.tax_rate !== undefined && itm.tax_rate !== null) {
        const rateNum = Number(itm.tax_rate);
        updated[idx].tax_rate_code = rateNum === 0 ? 'GST_0' : `GST_${rateNum}`;
      }

      // Collect all configured UOMs for this stock item (Base, Purchase, Sales, Alternate conversions)
      const itemUoms = [];
      const baseUnit = itm.base_uom_id?.unit_code || (typeof itm.base_uom_id === 'string' ? itm.base_uom_id : 'UNIT');
      const baseUomId = itm.base_uom_id?._id || (typeof itm.base_uom_id === 'string' ? itm.base_uom_id : null);

      if (baseUnit) {
        itemUoms.push({
          _id: baseUomId,
          unit_code: baseUnit,
          factor: 1,
          label: `${baseUnit} (Base Unit)`
        });
      }

      const purchUnit = itm.purchase_uom_id?.unit_code;
      const purchUomId = itm.purchase_uom_id?._id || itm.purchase_uom_id;
      const isPurchCompatible = purchUnit && purchUnit !== baseUnit && isUomItemCompatible(purchUnit, baseUnit, itm.uom_conversions);
      if (isPurchCompatible) {
        itemUoms.push({
          _id: purchUomId,
          unit_code: purchUnit,
          factor: 1,
          label: `${purchUnit} (Purchase Unit)`
        });
      }

      const salesUnit = itm.sales_uom_id?.unit_code;
      const salesUomId = itm.sales_uom_id?._id || itm.sales_uom_id;
      const isSalesCompatible = salesUnit && salesUnit !== baseUnit && salesUnit !== purchUnit && isUomItemCompatible(salesUnit, baseUnit, itm.uom_conversions);
      if (isSalesCompatible) {
        itemUoms.push({
          _id: salesUomId,
          unit_code: salesUnit,
          factor: 1,
          label: `${salesUnit} (Sales Unit)`
        });
      }

      if (Array.isArray(itm.uom_conversions)) {
        itm.uom_conversions.forEach(c => {
          const convCode = c.alternate_uom_id?.unit_code || (typeof c.alternate_uom_id === 'string' ? c.alternate_uom_id : null);
          const convId = c.alternate_uom_id?._id || c.alternate_uom_id;
          if (convCode && !itemUoms.some(u => u.unit_code === convCode)) {
            const factorNum = Number(c.conversion_factor) || 1;
            itemUoms.push({
              _id: convId,
              unit_code: convCode,
              factor: factorNum,
              label: `${convCode} (1 = ${factorNum} ${baseUnit})`
            });
          }
        });
      }

      // Automatically set the appropriate UOM for Purchase vs Sales (strictly verified for compatibility)
      let selectedUom = baseUnit;
      let selectedUomId = baseUomId;
      if (isPurchaseDoc && isPurchCompatible) {
        selectedUom = purchUnit;
        selectedUomId = purchUomId;
      } else if (!isPurchaseDoc && isSalesCompatible) {
        selectedUom = salesUnit;
        selectedUomId = salesUomId;
      }

      updated[idx].uom = selectedUom;
      updated[idx].uom_id = selectedUomId;
      updated[idx].available_uoms = itemUoms;

      // Check if item has a Recipe BOM
      const matchedRecipe = recipesList.find(r => {
        const rItemId = r.menu_item_id?._id ? String(r.menu_item_id._id) : String(r.menu_item_id);
        return rItemId === String(itm._id);
      });
      updated[idx].recipe = matchedRecipe || null;
      updated[idx].excluded_ingredients = [];
      updated[idx].modifiers = [];
    } else if (opt && opt.isCustom) {
      updated[idx].stock_item_id = null;
      updated[idx].item_name = val || '';
      updated[idx].item_code = '';
      updated[idx].uom = 'UNIT';
      updated[idx].uom_id = null;
      updated[idx].available_uoms = [];
      updated[idx].recipe = null;
      updated[idx].excluded_ingredients = [];
      updated[idx].modifiers = [];
    } else if (!val) {
      updated[idx].stock_item_id = null;
      updated[idx].item_name = '';
      updated[idx].item_code = '';
      updated[idx].uom = 'UNIT';
      updated[idx].uom_id = null;
      updated[idx].available_uoms = [];
      updated[idx].recipe = null;
      updated[idx].excluded_ingredients = [];
      updated[idx].modifiers = [];
    }
    setLines(updated);
  };

  const voucherSummary = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    let totalQty = 0;
    const uomQtyMap = {};

    lines.forEach(l => {
      const q = Number(l.quantity) || 0;
      const r = Number(l.unit_price) || 0;
      const unit = l.uom || 'UNIT';
      const match = String(l.tax_rate_code || 'GST_0').match(/\d+/);
      const taxRate = isGstEnabled && match ? Number(match[0]) : 0;
      let gross = q * r;
      let taxAmt = 0;

      if (isGstEnabled && isTaxInclusive && taxRate > 0) {
        const factor = 1 + taxRate / 100;
        const taxable = gross / factor;
        taxAmt = gross - taxable;
        gross = taxable;
      } else if (isGstEnabled && taxRate > 0) {
        taxAmt = gross * (taxRate / 100);
      }

      totalQty += q;
      uomQtyMap[unit] = (uomQtyMap[unit] || 0) + q;
      subtotal += gross;
      totalTax += taxAmt;
    });

    const unrounded = subtotal + totalTax;
    const grandTotal = Math.round(unrounded);
    const roundOff = grandTotal - unrounded;

    const uomSummaryParts = Object.entries(uomQtyMap).map(
      ([unit, qty]) => `${Number(qty.toFixed(3))} ${unit}`
    );
    const uomSummaryText = uomSummaryParts.join(' • ');

    return {
      itemCount: lines.length,
      totalQty,
      uomSummaryText,
      subtotal,
      totalTax,
      roundOff,
      grandTotal
    };
  }, [lines, isTaxInclusive, isGstEnabled]);

  const partyOptions = useMemo(() => {
    const isSupplierDoc = docType === 'PURCHASE_INVOICE' || docType === 'DEBIT_NOTE';
    // 1. Strictly filter to ACTIVE counterparties only (exclude INACTIVE or ARCHIVED)
    const activeParties = partiesList.filter(p => p.status === 'ACTIVE' || !p.status);

    // 2. Strict role matching: Purchase/Debit Note -> Suppliers/Vendors, Sales/Credit Note -> Customers
    const roleMatched = activeParties.filter(p => {
      const hasVendorRole = p.roles?.some(r => ['VENDOR', 'SUPPLIER', 'CREDITOR'].includes(r.role_type)) ||
                            ['VENDOR', 'SUPPLIER', 'CREDITOR'].includes(p.initial_role_type);
      const hasCustomerRole = p.roles?.some(r => ['CUSTOMER', 'DEBTOR', 'CLIENT'].includes(r.role_type)) ||
                              ['CUSTOMER', 'DEBTOR', 'CLIENT'].includes(p.initial_role_type);
      return isSupplierDoc ? hasVendorRole : hasCustomerRole;
    });

    // Use roleMatched if any match; fallback to all active parties if none have been tagged yet
    const sourceList = roleMatched.length > 0 ? roleMatched : activeParties;

    return sourceList.map(p => {
      const role = (p.roles && p.roles[0]?.role_type) || p.initial_role_type || 'PARTY';
      const roleBadge = (p.roles && p.roles.length > 0) ? p.roles.map(r => r.role_type).join(', ') : role;
      const displayName = p.legal_name
        ? (p.trade_name && p.trade_name !== p.legal_name ? `${p.legal_name} (${p.trade_name})` : p.legal_name)
        : (p.trade_name || 'Party');
      return {
        value: p._id,
        label: displayName,
        secondary: `${p.party_code || 'CODE'}${p.phone ? ` • Ph: ${p.phone}` : ''}${p.tax_id ? ` • GST: ${p.tax_id}` : ''}`,
        badge: role,
        party: p,
        group: isSupplierDoc ? 'Active Vendors & Suppliers' : 'Active Customers'
      };
    });
  }, [partiesList, docType]);

  const itemOptions = useMemo(() => {
    const isSalesDoc = docType === 'SALES_INVOICE' || docType === 'CREDIT_NOTE';

    // Prioritize items: For Sales, Finished Goods / Pizzas appear at the top
    const sorted = [...stockItemsList].sort((a, b) => {
      const aIsFG = (Number(a.sales_price) > 0) || (a.item_code && a.item_code.startsWith('FG-'));
      const bIsFG = (Number(b.sales_price) > 0) || (b.item_code && b.item_code.startsWith('FG-'));
      if (isSalesDoc) {
        if (aIsFG && !bIsFG) return -1;
        if (!aIsFG && bIsFG) return 1;
      } else {
        if (!aIsFG && bIsFG) return -1;
        if (aIsFG && !bIsFG) return 1;
      }
      return (a.item_name || '').localeCompare(b.item_name || '');
    });

    return sorted.map(item => {
      const isFG = (Number(item.sales_price) > 0) || (item.item_code && item.item_code.startsWith('FG-'));
      const isPkg = item.item_code && item.item_code.startsWith('PKG-');
      const badge = isFG ? 'Finished Good' : (isPkg ? 'Packaging' : 'Raw Material');
      const rate = isSalesDoc
        ? (item.sales_price || 0)
        : (item.purchase_price || item.standard_cost || 0);
      const baseUnit = item.base_uom_id?.unit_code || (typeof item.base_uom_id === 'string' ? item.base_uom_id : 'UNIT');
      const purchUnit = item.purchase_uom_id?.unit_code;
      const salesUnit = item.sales_uom_id?.unit_code;
      const isPurchValid = purchUnit && isUomItemCompatible(purchUnit, baseUnit, item.uom_conversions);
      const isSalesValid = salesUnit && isUomItemCompatible(salesUnit, baseUnit, item.uom_conversions);
      const uom = (isSalesDoc ? (isSalesValid ? salesUnit : baseUnit) : (isPurchValid ? purchUnit : baseUnit)) || baseUnit;

      return {
        value: item._id,
        label: item.item_name,
        secondary: `${item.item_code || 'SKU'} • Unit: ${uom} • ${isSalesDoc ? 'Selling' : 'Cost'}: ₹${Number(rate).toFixed(2)} / ${uom}`,
        badge: `${badge} • ${uom}`,
        item,
        group: isFG ? 'Finished Goods (Sellable Pizzas)' : 'Raw Materials & Supplies'
      };
    });
  }, [stockItemsList, docType]);

  const loadReport = async (type) => {
    setReportType(type);
    setReportLoading(true);
    setReportData(null);
    try {
      let res;
      if (type === 'sales_register') res = await commercialApi.getSalesRegister();
      else if (type === 'purchase_register') res = await commercialApi.getPurchaseRegister();
      else if (type === 'customer_aging') res = await commercialApi.getCustomerAging();
      else if (type === 'supplier_aging') res = await commercialApi.getSupplierAging();
      else if (type === 'gst_summary') res = await commercialApi.getGstSummary();
      setReportData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setReportLoading(false);
    }
  };

  const loadGlPreview = async () => {
    setGlLoading(true);
    try {
      const res = await commercialApi.getOpeningStockGlPreview();
      setGlPreview(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setGlLoading(false);
    }
  };

  const executeGlCatchup = async () => {
    if (!window.confirm('Post Opening Stock GL catch-up entry to General Ledger?')) return;
    setGlLoading(true);
    try {
      const res = await commercialApi.postOpeningStockGlCatchup();
      setSuccess(`Catch-up posted successfully! Journal: ${res.data.journal ? res.data.journal.journal_number : 'Posted'}`);
      loadGlPreview();
    } catch (err) {
      setError(err.message);
    } finally {
      setGlLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <Receipt className="w-5 h-5 text-brand-400" />
            <span>Commercial Invoicing & Voucher Engine</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Sales & Purchase Invoices, GST Breakdown, Perpetual Inventory GL Posting, and Reversals.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Voucher</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-rose-400 font-bold ml-2">×</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-emerald-400 font-bold ml-2">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'documents' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Voucher Documents</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('reports');
            if (!reportData) loadReport('sales_register');
          }}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'reports' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Commercial & GST Reports</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('opening_gl');
            if (!glPreview) loadGlPreview();
          }}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'opening_gl' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Opening Stock GL Reconciliation</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('gst_settlement');
            loadGstReport();
          }}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'gst_settlement' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Indian GST Settlement & ITC</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('us_compliance');
            loadUsComplianceData();
          }}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'us_compliance' ? 'border-b-2 border-brand-500 text-brand-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>US Tax Compliance & Returns</span>
        </button>
      </div>

      {/* TAB 1: Voucher Documents */}
      {activeTab === 'documents' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-300">All Commercial Vouchers</span>
            <button
              onClick={fetchDocuments}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                  <th className="p-3">Doc Number</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Customer / Party</th>
                  <th className="p-3 text-right">Taxable</th>
                  <th className="p-3 text-right">Tax (GST)</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Paid / Due</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {(!Array.isArray(documents) || documents.length === 0) ? (
                  <tr>
                    <td colSpan="9" className="p-6 text-center text-slate-500">
                      No commercial vouchers created yet. Click "New Voucher" above to begin.
                    </td>
                  </tr>
                ) : (
                  (Array.isArray(documents) ? documents : []).map((doc) => (
                    <tr key={doc._id} className="hover:bg-slate-850/50 transition">
                      <td className="p-3 font-mono font-semibold text-brand-300">
                        <div>{doc.document_number}</div>
                        {doc.tax_regime === 'US_SALES_TAX' && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30">
                              US Tax
                            </span>
                            {doc.is_mock_tax && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/30" title="Calculated with Sandbox MockTaxProvider">
                                SIMULATED
                              </span>
                            )}
                            {doc.tax_calculation_status === 'RECONCILIATION_PENDING' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                Pending Sync
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-slate-300">
                          {doc.document_type}
                        </span>
                      </td>
                      <td className="p-3 font-medium">
                        <div className="text-white font-medium">{doc.billing_name || doc.party_name || doc.party_id?.trade_name || doc.party_id?.legal_name || 'Cash Customer'}</div>
                        {Array.isArray(doc.lines) && doc.lines.length > 0 && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-xs flex items-center space-x-1" title={doc.lines.map(l => `${Number(l.quantity || 0)} ${l.uom || l.uom_id?.unit_code || 'UNIT'} × ${l.item_name || ''}`).join(', ')}>
                            <span className="text-emerald-400 font-semibold">{doc.lines.length} item{doc.lines.length > 1 ? 's' : ''}:</span>
                            <span className="truncate">{doc.lines.map(l => `${Number(l.quantity || 0)} ${l.uom || l.uom_id?.unit_code || 'UNIT'} ${l.item_name || ''}`).join(', ')}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">{doc.currency === 'USD' ? '$' : '₹'}{Number(doc.total_taxable_amount || doc.taxable_amount || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-emerald-400">{doc.currency === 'USD' ? '$' : '₹'}{Number(doc.total_tax_amount || doc.tax_amount || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">{doc.currency === 'USD' ? '$' : '₹'}{Number(doc.grand_total || doc.total_amount || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono">
                        {doc.status === 'POSTED' && ['PURCHASE_INVOICE', 'SALES_INVOICE'].includes(doc.document_type) ? (
                          <div>
                            <span className="text-[10px] text-slate-400 block">Paid: <span className="text-emerald-400 font-semibold">{doc.currency === 'USD' ? '$' : '₹'}{Number(doc.amount_paid || 0).toFixed(2)}</span></span>
                            <span className="text-[10px] text-slate-400 block">Due: <span className={Number(doc.balance_due ?? (Number(doc.amount_paid) > 0 ? 0 : doc.grand_total) ?? 0) > 0 ? "text-amber-400 font-semibold" : "text-slate-500 font-normal"}>{doc.currency === 'USD' ? '$' : '₹'}{Number(doc.balance_due ?? (Number(doc.amount_paid) > 0 ? 0 : doc.grand_total) ?? 0).toFixed(2)}</span></span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">-</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                            doc.status === 'POSTED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : doc.status === 'REVERSED'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {doc.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {doc.status === 'DRAFT' && (
                          <div className="flex justify-end space-x-1.5">
                            {doc.tax_regime === 'US_SALES_TAX' && (
                              <button
                                onClick={() => handleCalculateTax(doc._id)}
                                className="px-2 py-1 rounded bg-blue-600/80 hover:bg-blue-500 text-white font-semibold text-[11px] transition shadow-sm"
                                title="Recalculate transaction taxes with external provider / mock engine"
                              >
                                ⚡ Tax
                              </button>
                            )}
                            {doc.document_type === 'SALES_INVOICE' && (
                              <button
                                onClick={() => handleOpenPaymentModal(doc)}
                                className="px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white font-semibold text-[11px] transition shadow-sm flex items-center space-x-1"
                                title="Collect payment via Dynamic UPI QR Code, Cash or Card"
                              >
                                <QrCode className="w-3 h-3" />
                                <span>⚡ Settle (UPI QR)</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenPostModal(doc)}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition shadow-sm cursor-pointer"
                              title="Inspect Event, Posting Rule and Double-Entry Lines before posting to GL"
                            >
                              Post to GL
                            </button>
                            <button
                              onClick={() => handleCancelDocument(doc._id)}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-900/40 text-rose-300 border border-slate-700 text-[11px] transition"
                              title="Cancel draft voucher"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {doc.status === 'POSTED' && (
                          <div className="flex justify-end items-center space-x-1.5">
                            {doc.document_type === 'PURCHASE_INVOICE' && (
                              Number(doc.balance_due ?? (Number(doc.amount_paid) > 0 ? 0 : doc.grand_total) ?? 0) > 0 ? (
                                <button
                                  onClick={() => handleOpenBillSettlement(doc)}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition shadow-sm flex items-center space-x-1 cursor-pointer"
                                  title="Pay supplier bill, clear AP liability and post journal entry to GL"
                                >
                                  <CreditCard className="w-3 h-3" />
                                  <span>⚡ Pay Bill</span>
                                </button>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 text-[10px] font-semibold flex items-center space-x-0.5">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Paid</span>
                                </span>
                              )
                            )}
                            {doc.document_type === 'SALES_INVOICE' && (
                              Number(doc.balance_due ?? (Number(doc.amount_paid) > 0 ? 0 : doc.grand_total) ?? 0) > 0 ? (
                                <button
                                  onClick={() => handleOpenBillSettlement(doc)}
                                  className="px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white font-semibold text-[11px] transition shadow-sm flex items-center space-x-1 cursor-pointer"
                                  title="Receive payment from customer, clear AR and post journal entry to GL"
                                >
                                  <Wallet className="w-3 h-3" />
                                  <span>⚡ Receive</span>
                                </button>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 text-[10px] font-semibold flex items-center space-x-0.5">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Settled</span>
                                </span>
                              )
                            )}
                            <button
                              onClick={() => handleReverse(doc._id)}
                              className="px-2 py-1 rounded bg-rose-900/40 hover:bg-rose-800/60 border border-rose-700/50 text-rose-300 text-[11px] transition"
                            >
                              Reverse
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Commercial Reports */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex space-x-2">
            {[
              { id: 'sales_register', label: 'Sales Register' },
              { id: 'purchase_register', label: 'Purchase Register' },
              { id: 'customer_aging', label: 'Customer Aging' },
              { id: 'supplier_aging', label: 'Supplier Aging' },
              ...(isGstEnabled ? [{ id: 'gst_summary', label: 'GST Summary (GSTR-1)' }] : [])
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => loadReport(r.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  reportType === r.id ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            {reportLoading ? (
              <div className="text-center py-10 text-slate-400">Loading report data...</div>
            ) : reportData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Records</span>
                    <div className="text-lg font-bold text-white mt-1">
                      {reportData.summary ? reportData.summary.count : (Array.isArray(reportData) ? reportData.length : 'N/A')}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Amount</span>
                    <div className="text-lg font-bold text-emerald-400 mt-1">
                      ₹{reportData.summary ? Number(reportData.summary.total_amount || 0).toFixed(2) : '0.00'}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Tax (GST)</span>
                    <div className="text-lg font-bold text-brand-400 mt-1">
                      ₹{reportData.summary ? Number(reportData.summary.tax_amount || 0).toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>

                <pre className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-96">
                  {JSON.stringify(reportData, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500">Select a report above to view analytics.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Opening Stock GL Reconciliation */}
      {activeTab === 'opening_gl' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-bold text-white">Opening Stock to General Ledger Catch-up</h3>
              <p className="text-xs text-slate-400 mt-1">
                Scans all opening stock inventory valuation and provides an idempotent GL catch-up posting tool (Debit Inventory Asset 1201, Credit Opening Stock Equity 3990).
              </p>
            </div>
            <button
              onClick={loadGlPreview}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold transition"
            >
              Scan & Refresh Preview
            </button>
          </div>

          {glLoading ? (
            <div className="text-center py-8 text-slate-400">Inspecting stock ledger balances...</div>
          ) : glPreview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase">Inventory Opening Value</span>
                  <div className="text-lg font-bold text-white mt-1">
                    ₹{Number(glPreview.opening_stock_value || 0).toFixed(2)}
                  </div>
                </div>
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase">Existing GL Posted Value</span>
                  <div className="text-lg font-bold text-white mt-1">
                    ₹{Number(glPreview.gl_posted_value || 0).toFixed(2)}
                  </div>
                </div>
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase">Reconciliation Status</span>
                  <div className="text-sm font-bold mt-2">
                    {glPreview.is_reconciled ? (
                      <span className="text-emerald-400 flex items-center space-x-1">
                        <CheckCircle className="w-4 h-4" />
                        <span>Reconciled (100% Synced)</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center space-x-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Delta Detected: ₹{Number(glPreview.unposted_delta || 0).toFixed(2)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!glPreview.is_reconciled && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
                  <div className="text-xs text-amber-300">
                    A discrepancy of ₹{Number(glPreview.unposted_delta || 0).toFixed(2)} exists between Inventory valuation and General Ledger.
                  </div>
                  <button
                    onClick={executeGlCatchup}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition"
                  >
                    Post GL Catch-up Entry
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">Click "Scan & Refresh Preview" to evaluate reconciliation.</div>
          )}
        </div>
      )}

      {/* TAB 3.5: Indian GST Compliance & Settlement */}
      {activeTab === 'gst_settlement' && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-brand-400" />
                <span>Indian GST Settlement, Input Tax Credit (ITC) & Offset</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                GSTR-3B monthly tax offset, Outward Sales Liability vs Inward Purchase ITC, Net Cash Challan calculation, and General Ledger tax settlement voucher.
              </p>
            </div>
            <button
              onClick={loadGstReport}
              disabled={gstLoading}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition self-start md:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gstLoading ? 'animate-spin' : ''}`} />
              <span>Refresh GST Figures</span>
            </button>
          </div>

          {gstLoading ? (
            <div className="text-center py-12 text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
              Computing GST Outward liabilities and Inward ITC balances...
            </div>
          ) : gstReportData ? (
            <div className="space-y-5">
              {/* Top KPI Summary Cards */}
              {(() => {
                const outTax = Number(gstReportData.outward_supplies?.total_tax || 0);
                const inTax = Number(gstReportData.inward_supplies?.total_tax || 0);
                const netPayable = Math.max(0, outTax - inTax);
                const remainingItc = Math.max(0, inTax - outTax);

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Card 1: Outward Liability */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
                      <div className="flex justify-between items-start">
                        <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                          1. Output Tax Liability (Sales)
                        </span>
                        <ArrowUpRight className="w-4 h-4 text-rose-400" />
                      </div>
                      <div className="text-2xl font-bold text-white mt-2">
                        ₹{outTax.toFixed(2)}
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1 text-xs font-mono">
                        <div className="flex justify-between text-slate-400">
                          <span>Taxable Sales:</span>
                          <span className="text-white">₹{Number(gstReportData.outward_supplies?.total_taxable || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>CGST (Output 2101):</span>
                          <span className="text-rose-300">₹{Number(gstReportData.outward_supplies?.total_cgst || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>SGST (Output 2102):</span>
                          <span className="text-rose-300">₹{Number(gstReportData.outward_supplies?.total_sgst || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>IGST (Output 2103):</span>
                          <span className="text-rose-300">₹{Number(gstReportData.outward_supplies?.total_igst || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Inward ITC */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
                      <div className="flex justify-between items-start">
                        <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                          2. Input Tax Credit - ITC (Purchases)
                        </span>
                        <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-2xl font-bold text-white mt-2">
                        ₹{inTax.toFixed(2)}
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1 text-xs font-mono">
                        <div className="flex justify-between text-slate-400">
                          <span>Taxable Purchases:</span>
                          <span className="text-white">₹{Number(gstReportData.inward_supplies?.total_taxable || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>CGST (Input 1301):</span>
                          <span className="text-emerald-300">₹{Number(gstReportData.inward_supplies?.total_cgst || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>SGST (Input 1302):</span>
                          <span className="text-emerald-300">₹{Number(gstReportData.inward_supplies?.total_sgst || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>IGST (Input 1303):</span>
                          <span className="text-emerald-300">₹{Number(gstReportData.inward_supplies?.total_igst || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Net Payable / ITC Carry Forward */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
                      <div className="flex justify-between items-start">
                        <span className="text-[11px] font-semibold text-brand-400 uppercase tracking-wider">
                          3. Net GST Position (Output - Input)
                        </span>
                        <Wallet className="w-4 h-4 text-brand-400" />
                      </div>
                      <div className={`text-2xl font-bold mt-2 ${netPayable > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {netPayable > 0 ? `₹${netPayable.toFixed(2)} (Payable)` : '₹0.00 (Fully Covered)'}
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1 text-xs font-mono">
                        <div className="flex justify-between text-slate-400">
                          <span>Net Cash Tax to Pay:</span>
                          <span className={`font-bold ${netPayable > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            ₹{netPayable.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Unutilized ITC Carry Forward:</span>
                          <span className="text-emerald-400 font-bold">₹{remainingItc.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>ITC Coverage Status:</span>
                          <span className="text-slate-300 font-sans">
                            {netPayable === 0 ? '✅ 100% Offset (No Cash Outflow)' : '⚠️ Tax Payable via Bank'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Settlement Action Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                      <Wallet className="w-4 h-4 text-emerald-400" />
                      <span>Post GST Set-off & Tax Settlement Voucher to General Ledger</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Debits Output CGST/SGST/IGST liability accounts to clear them, credits Input ITC accounts, and credits Bank Account 1002 for any net balance due.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSettleGst} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                      Select Bank Account for Challan (if Net Payable &gt; 0)
                    </label>
                    <select
                      value={gstSettlementForm.bank_account_code}
                      onChange={(e) => setGstSettlementForm({ ...gstSettlementForm, bank_account_code: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                    >
                      {bankAccounts.map((acc) => (
                        <option key={acc._id || acc.account_code} value={acc.account_code}>
                          {acc.account_code} - {acc.account_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                      Return Period Label
                    </label>
                    <input
                      type="text"
                      value={gstSettlementForm.period_label}
                      onChange={(e) => setGstSettlementForm({ ...gstSettlementForm, period_label: e.target.value })}
                      placeholder="e.g. 2026-10 (Monthly GSTR-3B)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-sans text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={gstSettlementLoading}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition shadow-md flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      <Zap className={`w-4 h-4 ${gstSettlementLoading ? 'animate-spin' : ''}`} />
                      <span>{gstSettlementLoading ? 'Posting Settlement to GL...' : '⚡ Settle GST & Post Journal to GL'}</span>
                    </button>
                  </div>
                </form>

                {gstSettlementResult && (
                  <div className="mt-4 p-4 bg-emerald-950/60 border border-emerald-700/60 rounded-xl space-y-2">
                    <div className="flex items-center space-x-2 text-emerald-300 font-bold text-xs">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span>{gstSettlementResult.message}</span>
                    </div>
                    {gstSettlementResult.journal && (
                      <div className="text-xs font-mono text-slate-300">
                        Posted Journal: <span className="text-emerald-400 font-bold">{gstSettlementResult.journal.journal_number}</span> • Total Settled: ₹{gstSettlementResult.utilized_itc?.total || '0.00'} ITC + ₹{gstSettlementResult.net_tax_payable?.total || '0.00'} Cash
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Rate Slab Breakdown Tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Outward Slabs */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h4 className="text-xs font-bold text-white mb-3 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    <span>Outward Supplies by Rate Slab (Sales / GSTR-1)</span>
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                          <th className="pb-2">Rate %</th>
                          <th className="pb-2 text-right">Taxable</th>
                          <th className="pb-2 text-right">CGST</th>
                          <th className="pb-2 text-right">SGST</th>
                          <th className="pb-2 text-right">Total Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {gstReportData.outward_supplies?.rates?.length > 0 ? (
                          gstReportData.outward_supplies.rates.map((r, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="py-2 text-white font-bold">{r.rate_percent}%</td>
                              <td className="py-2 text-right">₹{r.taxable_amount}</td>
                              <td className="py-2 text-right text-rose-300">₹{r.cgst_amount}</td>
                              <td className="py-2 text-right text-rose-300">₹{r.sgst_amount}</td>
                              <td className="py-2 text-right font-bold text-white">₹{r.total_tax_amount}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="5" className="py-4 text-center text-slate-500 font-sans">No outward supplies recorded.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Inward Slabs */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h4 className="text-xs font-bold text-white mb-3 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Inward Supplies by Rate Slab (Purchases / GSTR-2B ITC)</span>
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                          <th className="pb-2">Rate %</th>
                          <th className="pb-2 text-right">Taxable</th>
                          <th className="pb-2 text-right">CGST</th>
                          <th className="pb-2 text-right">SGST</th>
                          <th className="pb-2 text-right">Total ITC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {gstReportData.inward_supplies?.rates?.length > 0 ? (
                          gstReportData.inward_supplies.rates.map((r, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="py-2 text-white font-bold">{r.rate_percent}%</td>
                              <td className="py-2 text-right">₹{r.taxable_amount}</td>
                              <td className="py-2 text-right text-emerald-300">₹{r.cgst_amount}</td>
                              <td className="py-2 text-right text-emerald-300">₹{r.sgst_amount}</td>
                              <td className="py-2 text-right font-bold text-emerald-400">₹{r.total_tax_amount}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="5" className="py-4 text-center text-slate-500 font-sans">No inward supplies recorded.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
              Click "Refresh GST Figures" to inspect Indian GST balances.
            </div>
          )}
        </div>
      )}

      {/* TAB 4: US Tax Compliance & Returns (Phase 5) */}
      {activeTab === 'us_compliance' && (
        <div className="space-y-5">
          {/* Top KPI Cards from Subledger Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">Tax Collected (Sales)</span>
              <div className="text-xl font-bold text-white mt-1">
                ${Number(usSubledgerSummary?.additions_amount || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Subledger Gross Additions</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">Reductions & Returns</span>
              <div className="text-xl font-bold text-amber-400 mt-1">
                ${Number(usSubledgerSummary?.reductions_amount || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Credit notes & reversals</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">Tax Remittances Paid</span>
              <div className="text-xl font-bold text-emerald-400 mt-1">
                ${Number(usSubledgerSummary?.payments_amount || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Payments posted to state</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">Net Balance Due</span>
              <div className="text-xl font-bold text-brand-400 mt-1">
                ${Number(usSubledgerSummary?.net_liability_amount || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Outstanding US tax obligation</span>
            </div>
          </div>

          {/* Sub-navigation */}
          <div className="flex border-b border-slate-800 space-x-2 text-xs">
            {[
              { id: 'subledger', label: 'Tax Liability Subledger' },
              { id: 'periods', label: 'Return Periods' },
              { id: 'returns', label: 'Tax Returns & Filing' },
              { id: 'payments', label: 'Tax Payments & Credits' },
              { id: 'reconciliation', label: '4-Way Audit & Reconciliation Hub' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setUsComplianceSubTab(tab.id)}
                className={`px-3 py-2 rounded-t-lg font-medium transition ${
                  usComplianceSubTab === tab.id
                    ? 'bg-slate-800 text-brand-400 border-t-2 border-brand-500 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Subview 1: Subledger */}
          {usComplianceSubTab === 'subledger' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-200">US Tax Liability Subledger ({usSubledger.length} entries)</span>
                <button
                  onClick={loadUsComplianceData}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${usComplianceLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                      <th className="p-3">Tx Date</th>
                      <th className="p-3">Jurisdiction</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Document #</th>
                      <th className="p-3 text-right">Taxable Base</th>
                      <th className="p-3 text-right">Tax Amount</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Reversal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {usSubledger.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="p-6 text-center text-slate-500">
                          No US tax liability entries recorded yet. Post a US sales invoice or voucher to see entries.
                        </td>
                      </tr>
                    ) : (
                      usSubledger.map(entry => (
                        <tr key={entry._id} className="hover:bg-slate-850/50 transition">
                          <td className="p-3 font-mono text-slate-400">
                            {new Date(entry.tax_transaction_date).toLocaleDateString()}
                          </td>
                          <td className="p-3 font-semibold text-blue-400">{entry.jurisdiction_code}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300">
                              {entry.entry_type}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-brand-300">{entry.source_document_number || 'N/A'}</td>
                          <td className="p-3 text-right font-mono">${Number(entry.taxable_base_amount || 0).toFixed(2)}</td>
                          <td className={`p-3 text-right font-mono font-semibold ${Number(entry.tax_amount || 0) < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            ${Number(entry.tax_amount || 0).toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {entry.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {entry.is_reversal ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                REVERSED
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Subview 2: Return Periods */}
          {usComplianceSubTab === 'periods' && (
            <div className="space-y-4">
              {/* Create Period Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-slate-200">Configure Independent Tax Return Period</span>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Jurisdiction</label>
                    <input
                      type="text"
                      value={newPeriodData.jurisdictionCode}
                      onChange={e => setNewPeriodData({ ...newPeriodData, jurisdictionCode: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      placeholder="e.g. US-CA"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Period Start</label>
                    <input
                      type="date"
                      value={newPeriodData.periodStartDate}
                      onChange={e => setNewPeriodData({ ...newPeriodData, periodStartDate: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Period End</label>
                    <input
                      type="date"
                      value={newPeriodData.periodEndDate}
                      onChange={e => setNewPeriodData({ ...newPeriodData, periodEndDate: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Period Label</label>
                    <input
                      type="text"
                      value={newPeriodData.periodLabel}
                      onChange={e => setNewPeriodData({ ...newPeriodData, periodLabel: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      placeholder="e.g. 2026-10"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleCreateReturnPeriod}
                      disabled={usComplianceLoading}
                      className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-lg px-3 py-1.5 text-xs transition"
                    >
                      + Create Period
                    </button>
                  </div>
                </div>
              </div>

              {/* Periods List */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-semibold text-slate-200 block mb-3">Configured Return Periods</span>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                      <th className="p-3">Period Label</th>
                      <th className="p-3">Jurisdiction</th>
                      <th className="p-3">Start Date</th>
                      <th className="p-3">End Date</th>
                      <th className="p-3">Frequency</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {usPeriods.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-6 text-center text-slate-500">
                          No return periods configured. Use the form above to create one.
                        </td>
                      </tr>
                    ) : (
                      usPeriods.map(p => (
                        <tr key={p._id} className="hover:bg-slate-850/50 transition">
                          <td className="p-3 font-semibold text-white">{p.period_label}</td>
                          <td className="p-3 text-blue-400 font-mono">{p.jurisdiction_code}</td>
                          <td className="p-3 font-mono text-slate-400">{new Date(p.period_start_date).toLocaleDateString()}</td>
                          <td className="p-3 font-mono text-slate-400">{new Date(p.period_end_date).toLocaleDateString()}</td>
                          <td className="p-3">{p.filing_frequency}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${p.status === 'OPEN' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {p.status === 'OPEN' && (
                              <button
                                onClick={() => handlePrepareReturn(p._id)}
                                className="px-2.5 py-1 rounded bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-500/30 text-[11px] font-semibold transition"
                              >
                                Prepare Draft Return
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Subview 3: Tax Returns */}
          {usComplianceSubTab === 'returns' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <span className="text-xs font-semibold text-slate-200">Prepared US Tax Returns ({usReturns.length})</span>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                      <th className="p-3">Return #</th>
                      <th className="p-3">Jurisdiction</th>
                      <th className="p-3">Period</th>
                      <th className="p-3 text-right">Taxable Sales</th>
                      <th className="p-3 text-right">Net Tax Due</th>
                      <th className="p-3 text-right">Payments Applied</th>
                      <th className="p-3 text-right">Balance Due</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Lifecycle Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {usReturns.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="p-6 text-center text-slate-500">
                          No returns prepared yet. Create a return period and click "Prepare Draft Return".
                        </td>
                      </tr>
                    ) : (
                      usReturns.map(ret => (
                        <tr key={ret._id} className="hover:bg-slate-850/50 transition">
                          <td className="p-3 font-mono text-brand-300 font-semibold">{ret.return_number}</td>
                          <td className="p-3 text-blue-400 font-semibold">{ret.jurisdiction_code}</td>
                          <td className="p-3 text-slate-300">{ret.return_period_id?.period_label || 'Period'}</td>
                          <td className="p-3 text-right font-mono">${Number(ret.taxable_sales_amount || 0).toFixed(2)}</td>
                          <td className="p-3 text-right font-mono font-semibold text-emerald-400">${Number(ret.net_tax_due || 0).toFixed(2)}</td>
                          <td className="p-3 text-right font-mono text-slate-300">${Number(ret.total_payments_applied || 0).toFixed(2)}</td>
                          <td className="p-3 text-right font-mono font-bold text-amber-400">${Number(ret.balance_due ?? ret.net_tax_due ?? 0).toFixed(2)}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              ret.status === 'FILED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                              ret.status === 'APPROVED' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            }`}>
                              {ret.status}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            {ret.status === 'DRAFT' && (
                              <button
                                onClick={() => handleTransitionReturn(ret._id, 'PREPARED')}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]"
                              >
                                Mark Prepared
                              </button>
                            )}
                            {ret.status === 'PREPARED' && (
                              <button
                                onClick={() => handleTransitionReturn(ret._id, 'APPROVED')}
                                className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 text-[10px]"
                              >
                                Approve
                              </button>
                            )}
                            {ret.status === 'APPROVED' && (
                              <button
                                onClick={() => handleTransitionReturn(ret._id, 'FILED')}
                                className="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-[10px]"
                              >
                                Record Filing
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedReturnForPayment(ret._id);
                                setPaymentForm(p => ({ ...p, returnId: ret._id, amount: Number(ret.balance_due || ret.net_tax_due || 0).toFixed(2) }));
                                setUsComplianceSubTab('payments');
                              }}
                              className="px-2 py-0.5 rounded bg-brand-600/20 text-brand-300 border border-brand-500/30 text-[10px]"
                            >
                              Pay Return
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

          {/* Subview 4: Tax Payments */}
          {usComplianceSubTab === 'payments' && (
            <div className="space-y-4">
              {/* Payment Entry Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-slate-200">Record Tax Remittance / Payment</span>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Linked Return (Optional)</label>
                    <select
                      value={paymentForm.returnId}
                      onChange={e => setPaymentForm({ ...paymentForm, returnId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="">-- Direct Remittance --</option>
                      {usReturns.map(r => (
                        <option key={r._id} value={r._id}>
                          {r.return_number} ({r.jurisdiction_code} - Due: ${Number(r.balance_due || r.net_tax_due || 0).toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Bank GL Account</label>
                    <input
                      type="text"
                      value={paymentForm.bankAccountCode}
                      onChange={e => setPaymentForm({ ...paymentForm, bankAccountCode: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      placeholder="1002"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Payment Reference</label>
                    <input
                      type="text"
                      value={paymentForm.paymentReference}
                      onChange={e => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      placeholder="EFT / Check #"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleRecordTaxPayment}
                      disabled={usComplianceLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg px-3 py-1.5 text-xs transition"
                    >
                      Post Remittance
                    </button>
                  </div>
                </div>
              </div>

              {/* Payments List */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-semibold text-slate-200 block mb-3">Recorded Tax Payments ({usPayments.length})</span>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                      <th className="p-3">Payment Date</th>
                      <th className="p-3">Reference</th>
                      <th className="p-3">Jurisdiction</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3">GL Journal #</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {usPayments.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-6 text-center text-slate-500">
                          No tax payments recorded yet.
                        </td>
                      </tr>
                    ) : (
                      usPayments.map(pay => (
                        <tr key={pay._id} className="hover:bg-slate-850/50 transition">
                          <td className="p-3 font-mono text-slate-400">{new Date(pay.payment_date).toLocaleDateString()}</td>
                          <td className="p-3 font-mono text-white font-semibold">{pay.payment_reference}</td>
                          <td className="p-3 text-blue-400 font-mono">{pay.jurisdiction_code}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">${Number(pay.payment_amount || 0).toFixed(2)}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${pay.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-300'}`}>
                              {pay.status}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-brand-300">{pay.journal_id?.entry_number || (typeof pay.journal_id === 'string' ? pay.journal_id.slice(-6) : 'Dr 2110 / Cr Bank')}</td>
                          <td className="p-3 text-right">
                            {pay.status !== 'CONFIRMED' && (
                              <button
                                onClick={() => handleConfirmTaxPayment(pay._id)}
                                className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[10px]"
                              >
                                Confirm Clearance
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Subview 5: 4-Way Audit & Reconciliation Hub */}
          {usComplianceSubTab === 'reconciliation' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Audit 1: Documents vs Subledger */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">1. Documents vs Subledger</h4>
                  <button
                    onClick={handleRunDocSubledgerRecon}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                  >
                    Run Audit
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Verifies that every posted US commercial document has a corresponding matching entry in the tax liability subledger.
                </p>
                {usReconDocSubledger && (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Documents:</span>
                      <span className="text-white">{usReconDocSubledger.total_documents_checked}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Discrepancy Count:</span>
                      <span className={usReconDocSubledger.discrepancies_count === 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {usReconDocSubledger.discrepancies_count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Status:</span>
                      <span className={usReconDocSubledger.is_reconciled ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {usReconDocSubledger.is_reconciled ? "100% RECONCILED" : "MISMATCH DETECTED"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Audit 2: Subledger vs GL Account 2110 */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">2. Subledger vs GL (Account 2110)</h4>
                  <button
                    onClick={handleRunSubledgerGlRecon}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                  >
                    Run GL Check
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Compares subledger net liability with the General Ledger ending balance of Account 2110 (Sales Tax Payable).
                </p>
                {usReconSubledgerGl && (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Subledger Liability:</span>
                      <span className="text-white">${usReconSubledgerGl.subledger_net_liability}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">GL Account 2110 Balance:</span>
                      <span className="text-white">${usReconSubledgerGl.gl_liability_balance}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Delta:</span>
                      <span className={usReconSubledgerGl.is_reconciled ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        ${usReconSubledgerGl.difference_amount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Status:</span>
                      <span className={usReconSubledgerGl.is_reconciled ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {usReconSubledgerGl.is_reconciled ? "100% RECONCILED" : "DELTA DETECTED"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Audit 3: Return vs Payments */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">3. Return vs Payments Audit</h4>
                  {usReturns.length > 0 && (
                    <button
                      onClick={() => handleRunReturnPaymentRecon(usReturns[0]._id)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                    >
                      Audit Latest Return
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Verifies that return liability less recorded payments equals outstanding balance due.
                </p>
                {usReconReturnPayment && (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Return Net Due:</span>
                      <span className="text-white">${usReconReturnPayment.return_net_tax_due}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Payments:</span>
                      <span className="text-emerald-400">${usReconReturnPayment.total_payments_amount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Computed Balance:</span>
                      <span className="text-amber-400 font-bold">${usReconReturnPayment.computed_balance_due}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Audit 4: Provider Sync Retry Worker */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">4. External Provider Retry Worker</h4>
                  <button
                    onClick={handleRetryProviderRecon}
                    className="px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition"
                  >
                    Retry Pending Syncs
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Scans commercial documents with PENDING_RETRY provider status and executes an idempotent retry against the configured tax provider.
                </p>
                {providerRetryResult && (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pending Scanned:</span>
                      <span className="text-white">{providerRetryResult.total_pending}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Successfully Synced:</span>
                      <span className="text-emerald-400 font-bold">{providerRetryResult.retried_success}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Failed:</span>
                      <span className={providerRetryResult.retried_failed === 0 ? "text-slate-400" : "text-rose-400 font-bold"}>
                        {providerRetryResult.retried_failed}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Voucher Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full p-6 space-y-5 max-h-[94vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Create New Commercial Voucher
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Issue Sales Invoice, Purchase Bill, or Credit/Debit Notes with automated GL postings and GST tracking.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 text-lg leading-none transition"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-5 text-xs">
              {/* Top Controls: Voucher Type, Sub-type, Party in aligned card */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  {/* Column 1: Voucher Type */}
                  <div>
                    <div className="h-6 flex items-center mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Voucher Type <span className="text-rose-400">*</span>
                      </label>
                    </div>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="w-full h-10 bg-slate-900 border border-slate-750 rounded-lg px-3 text-white font-medium text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                    >
                      <option value="PURCHASE_INVOICE">Purchase Invoice (Inward Supply)</option>
                      <option value="SALES_INVOICE">Sales Invoice (Outward Supply)</option>
                      <option value="CREDIT_NOTE">Sales Return (Credit Note)</option>
                      <option value="DEBIT_NOTE">Purchase Return (Debit Note)</option>
                    </select>
                  </div>

                  {/* Column 2: Supply / Billing Type */}
                  <div>
                    <div className="h-6 flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Supply / Billing Type <span className="text-rose-400">*</span>
                      </label>
                      <label className="inline-flex items-center space-x-1.5 cursor-pointer text-[11px] text-emerald-400 hover:text-emerald-300 select-none">
                        <input
                          type="checkbox"
                          checked={isTaxInclusive}
                          onChange={(e) => setIsTaxInclusive(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                        />
                        <span>Tax-Inclusive</span>
                      </label>
                    </div>
                    <select
                      value={subType}
                      onChange={(e) => setSubType(e.target.value)}
                      className="w-full h-10 bg-slate-900 border border-slate-750 rounded-lg px-3 text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                    >
                      <option value="TAX_INVOICE">Regular Tax Invoice (Standard B2B / B2C)</option>
                      <option value="BILL_OF_SUPPLY">Bill of Supply (Exempt / Composition)</option>
                      <option value="EXPORT_INVOICE">Export / SEZ Supply</option>
                    </select>
                  </div>

                  {/* Column 3: Customer / Counterparty */}
                  <div>
                    <div className="h-6 flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        {docType.includes('PURCHASE') || docType === 'DEBIT_NOTE' ? 'Vendor / Supplier' : 'Customer / Client'} <span className="text-rose-400">*</span>
                      </label>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={openQuickPartyModal}
                          className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold transition flex items-center space-x-1 cursor-pointer"
                          title="Create new Counterparty"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>+ Add Party</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomPartyMode(!customPartyMode);
                            if (!customPartyMode) setSelectedPartyId('');
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border transition cursor-pointer ${
                            customPartyMode
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                          }`}
                          title="Switch between Party Search and Walk-in text"
                        >
                          {customPartyMode ? 'Search list' : 'Walk-in'}
                        </button>
                      </div>
                    </div>

                    {customPartyMode || partiesList.length === 0 ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={billingName}
                          onChange={(e) => {
                            setBillingName(e.target.value);
                            setSelectedPartyId('');
                          }}
                          placeholder={docType.includes('PURCHASE') ? "Vendor / Supplier Name *" : "Customer / Walk-in Name *"}
                          required
                          className="w-full h-10 bg-slate-900 border border-slate-750 rounded-lg px-3 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                        />
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="Mobile / Phone Number (e.g. 9876543210)"
                          className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-white placeholder-slate-500 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <SearchableDropdown
                          options={partyOptions}
                          value={selectedPartyId}
                          onChange={(val, opt) => {
                            setSelectedPartyId(val || '');
                            if (opt && opt.party) {
                              setBillingName(opt.party.trade_name || opt.party.legal_name);
                              if (opt.party.phone) setCustomerPhone(opt.party.phone);
                            } else if (opt && opt.isCustom) {
                              setBillingName(val || '');
                            } else if (!val) {
                              setBillingName('');
                              setCustomerPhone('');
                            }
                          }}
                          placeholder={docType.includes('PURCHASE') || docType === 'DEBIT_NOTE' ? "Select vendor / supplier..." : "Select customer..."}
                          searchPlaceholder="Search party by name, code or GSTIN..."
                          allowClear={true}
                          allowCustom={true}
                          customOptionPrefix="Use custom party:"
                        />
                        {selectedPartyId && customerPhone && (
                          <div className="text-[11px] text-slate-400 font-mono px-1 flex items-center space-x-1">
                            <span className="text-slate-500">Phone:</span>
                            <span className="text-slate-300 font-semibold">{customerPhone}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items Section */}
              <div className="space-y-2.5 pt-1">
                <div className="flex justify-between items-center pb-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-200 text-sm">Line Items</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-750">
                      {lines.length} {lines.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addLine}
                    className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 hover:text-emerald-300 font-semibold border border-emerald-500/30 transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item Line</span>
                  </button>
                </div>

                {/* Table Column Headers */}
                <div className="grid grid-cols-12 gap-2.5 px-3 py-2 bg-slate-950/80 rounded-lg text-[11px] font-semibold text-slate-400 uppercase tracking-wider border border-slate-800/90">
                  <div className={isGstEnabled ? "col-span-5" : "col-span-6"}>Item / Product / SKU</div>
                  <div className="col-span-2 text-right">Quantity & UOM</div>
                  <div className="col-span-2 text-right">Rate (₹ / Unit)</div>
                  {isGstEnabled && <div className="col-span-1 text-center">Tax Slab</div>}
                  <div className="col-span-2 text-right">Amount (₹)</div>
                </div>

                {/* Table Rows with overflow-visible to prevent dropdown clipping */}
                <div className="space-y-2.5 overflow-visible">
                  {lines.map((l, idx) => {
                    const q = Number(l.quantity) || 0;
                    const r = Number(l.unit_price) || 0;
                    const gross = q * r;
                    const match = String(l.tax_rate_code || 'GST_0').match(/\d+/);
                    const taxRate = isGstEnabled && match ? Number(match[0]) : 0;
                    const taxAmt = gross * (taxRate / 100);

                    return (
                      <div
                        key={idx}
                        className="relative grid grid-cols-12 gap-2.5 items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800/90 hover:border-slate-750 transition shadow-sm"
                        style={{ zIndex: lines.length - idx + 20 }}
                      >
                        {/* Item Dropdown */}
                        <div className={`${isGstEnabled ? "col-span-5" : "col-span-6"} relative`}>
                          {stockItemsList.length > 0 ? (
                            <SearchableDropdown
                              options={itemOptions}
                              value={l.stock_item_id || (l.item_name ? `custom:${l.item_name}` : null)}
                              onChange={(val, opt) => handleItemSelect(idx, val, opt)}
                              placeholder={l.item_name || "Select stock item..."}
                              searchPlaceholder="Search items by name or SKU..."
                              allowClear={true}
                              allowCustom={true}
                              customOptionPrefix="Use custom item:"
                            />
                          ) : (
                            <input
                              type="text"
                              placeholder="Item Name / SKU"
                              value={l.item_name}
                              onChange={(e) => updateLine(idx, 'item_name', e.target.value)}
                              required
                              className="w-full h-10 bg-slate-900 border border-slate-750 rounded-lg px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          )}
                          {l.item_code && (
                            <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-mono mt-1 px-1">
                              <span>Code: {l.item_code}</span>
                              <span className="text-slate-600">•</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 font-bold">
                                Unit: {l.uom || 'UNIT'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Quantity & UOM */}
                        <div className="col-span-2">
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              placeholder="Qty"
                              value={l.quantity}
                              onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                              min="0.001"
                              step="any"
                              required
                              className="w-full h-10 bg-slate-900 border border-slate-750 rounded-lg pl-2.5 pr-14 text-xs text-white text-right font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                            {l.available_uoms && l.available_uoms.length > 1 ? (
                              <select
                                value={l.uom_id || l.uom}
                                onChange={(e) => handleLineUomChange(idx, e.target.value)}
                                className="absolute right-1 h-7 bg-slate-800 hover:bg-slate-750 text-emerald-400 font-mono font-bold text-[10px] px-1.5 rounded border border-slate-700 focus:outline-none cursor-pointer"
                                title="Change purchase/sales unit"
                              >
                                {l.available_uoms.map((u) => (
                                  <option key={u._id || u.unit_code} value={u._id || u.unit_code}>
                                    {u.unit_code}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className="absolute right-1.5 px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-slate-800 text-emerald-400 border border-slate-700/80 pointer-events-none select-none uppercase truncate max-w-[48px]"
                                title={`Unit of Measure: ${l.uom || 'UNIT'}`}
                              >
                                {l.uom || 'UNIT'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-emerald-400/90 font-mono font-semibold text-right mt-0.5 pr-0.5 truncate">
                            {Number(l.quantity || 0)} {l.uom || 'UNIT'}
                          </div>
                        </div>

                        {/* Rate */}
                        <div className="col-span-2">
                          <div className="relative flex items-center">
                            <span className="absolute left-2.5 text-slate-500 text-xs font-mono select-none">₹</span>
                            <input
                              type="number"
                              placeholder="Rate"
                              value={l.unit_price}
                              onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                              min="0"
                              step="any"
                              required
                              className="w-full h-10 bg-slate-900 border border-slate-750 rounded-lg pl-6 pr-14 text-xs text-white text-right font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                            <span
                              className="absolute right-1.5 text-[10px] font-mono text-slate-400 select-none pointer-events-none truncate max-w-[46px]"
                              title={`Rate per ${l.uom || 'unit'}`}
                            >
                              /{l.uom || 'unit'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono text-right mt-0.5 pr-0.5 truncate">
                            ₹{Number(l.unit_price || 0).toFixed(2)} / {l.uom || 'unit'}
                          </div>
                        </div>

                        {/* Tax Slab */}
                        {isGstEnabled && (
                          <div className="col-span-1">
                            <select
                              value={l.tax_rate_code || 'GST_0'}
                              onChange={(e) => updateLine(idx, 'tax_rate_code', e.target.value)}
                              className="w-full h-10 bg-slate-900 border border-slate-750 rounded-lg px-2 text-xs text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            >
                              <option value="GST_0">0%</option>
                              <option value="GST_5">5%</option>
                              <option value="GST_12">12%</option>
                              <option value="GST_18">18%</option>
                              <option value="GST_28">28%</option>
                            </select>
                          </div>
                        )}

                        {/* Amount & Delete */}
                        <div className="col-span-2 flex items-center justify-between pl-1 h-10">
                          <div className="text-right flex-1 min-w-0 pr-1">
                            <div className="font-mono font-bold text-white text-xs truncate">
                              ₹{gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {taxRate > 0 && (
                              <div className="text-[10px] text-cyan-400 font-mono truncate">
                                +₹{taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tax
                              </div>
                            )}
                          </div>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-slate-500 hover:text-rose-400 p-1.5 transition rounded-lg hover:bg-slate-800 text-sm font-bold ml-1 cursor-pointer"
                              title="Remove item"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        {/* BOM Recipe Ingredients Exclusion Bar */}
                        {l.recipe && l.recipe.ingredients && l.recipe.ingredients.length > 0 && (
                          <div className="col-span-12 mt-1 p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px] flex flex-wrap items-center gap-2">
                            <span className="text-slate-400 font-semibold flex items-center space-x-1">
                              <Layers className="w-3.5 h-3.5 text-brand-400" />
                              <span>Recipe BOM (Customer Customization):</span>
                            </span>
                            {l.recipe.ingredients.map((ing) => {
                              const ingId = ing.ingredient_item_id?._id || ing.ingredient_item_id;
                              const ingName = ing.ingredient_item_id?.item_name || 'Ingredient';
                              const isExcluded = (l.excluded_ingredients || []).includes(String(ingId));
                              return (
                                <button
                                  type="button"
                                  key={ingId}
                                  onClick={() => toggleExcludeCommercialLineIngredient(idx, ingId, ingName)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer flex items-center space-x-1 ${
                                    isExcluded
                                      ? 'bg-rose-500/20 border-rose-500/60 text-rose-300 line-through'
                                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                                  }`}
                                  title={isExcluded ? "Click to include in recipe" : "Click to exclude (Stock will NOT be deducted)"}
                                >
                                  <span>{isExcluded ? `✕ NO ${ingName.toUpperCase()}` : `✓ ${ing.quantity} ${ing.uom_id?.unit_code || ''} ${ingName}`}</span>
                                  {isExcluded && <span className="text-[9px] font-mono text-amber-400 no-underline ml-1">(Stock Kept)</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Calculated Result Summary Banner */}
              <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center space-x-6 text-xs text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Total Items</span>
                    <span className="font-semibold text-white text-sm">{voucherSummary.itemCount} item{voucherSummary.itemCount > 1 ? 's' : ''}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Total Quantity & UOMs</span>
                    <span className="font-semibold text-emerald-300 text-sm font-mono">
                      {voucherSummary.uomSummaryText || `${voucherSummary.totalQty.toFixed(2)} units`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-5 text-right">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Subtotal (Taxable)</span>
                    <span className="text-sm font-bold font-mono text-slate-200">
                      ₹{voucherSummary.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {voucherSummary.totalTax > 0 && (
                    <div>
                      <span className="text-[11px] text-slate-400 block">Total GST</span>
                      <span className="text-sm font-bold font-mono text-cyan-400">
                        ₹{voucherSummary.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  <div className="border-l border-slate-800 pl-4">
                    <span className="text-[11px] uppercase font-bold tracking-wider text-emerald-400 block">Grand Total</span>
                    <span className="text-2xl font-black font-mono text-emerald-400">
                      ₹{voucherSummary.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                {docType === 'SALES_INVOICE' && (
                  <button
                    type="button"
                    onClick={(e) => handleCreateDocument(e, true)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-500 hover:to-emerald-500 text-white font-bold shadow-lg shadow-brand-950/40 transition flex items-center space-x-2 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>⚡ Pay & Issue Invoice</span>
                  </button>
                )}
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-950/40 transition flex items-center space-x-2 cursor-pointer"
                >
                  <span>Create Draft</span>
                  <span className="font-mono text-xs bg-emerald-700/80 px-2.5 py-0.5 rounded-md">
                    ₹{voucherSummary.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Party Creation Modal */}
      {showQuickPartyModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-brand-400" />
                <h3 className="text-base font-bold text-white">
                  {quickPartyForm.initial_role_type === 'CUSTOMER' ? 'Configure Customer (Single or Organization)' : 'Configure Vendor / Supplier'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickPartyModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickParty} className="space-y-4 text-xs">
              {/* Type Switcher: INDIVIDUAL vs ORGANIZATION */}
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Entity Classification</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickPartyForm({ ...quickPartyForm, party_type: 'INDIVIDUAL' })}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition flex items-center justify-center space-x-2 cursor-pointer ${
                      quickPartyForm.party_type === 'INDIVIDUAL'
                        ? 'bg-brand-600/20 border-brand-500 text-brand-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span>Individual (Walk-in / Single)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPartyForm({ ...quickPartyForm, party_type: 'ORGANIZATION' })}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition flex items-center justify-center space-x-2 cursor-pointer ${
                      quickPartyForm.party_type === 'ORGANIZATION'
                        ? 'bg-brand-600/20 border-brand-500 text-brand-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Building className="w-4 h-4" />
                    <span>Organization (Bulk Corporate)</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Party Code *</label>
                  <input
                    type="text"
                    required
                    value={quickPartyForm.party_code}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, party_code: e.target.value })}
                    placeholder="e.g. CUST-001"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono uppercase focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {quickPartyForm.party_type === 'INDIVIDUAL' ? 'Person Full Name *' : 'Company Legal Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={quickPartyForm.legal_name}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, legal_name: e.target.value })}
                    placeholder={quickPartyForm.party_type === 'INDIVIDUAL' ? "e.g. Rohan Verma" : "e.g. Tech Mahindra Cafeteria Ltd"}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Mobile / Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={quickPartyForm.phone}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Trade / Display Name</label>
                  <input
                    type="text"
                    value={quickPartyForm.trade_name}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, trade_name: e.target.value })}
                    placeholder="e.g. TechPark Counter (optional)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">GSTIN / Tax ID</label>
                  <input
                    type="text"
                    value={quickPartyForm.tax_id}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, tax_id: e.target.value })}
                    placeholder="27AAACT9988G1Z4 (optional)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono uppercase focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    value={quickPartyForm.email}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, email: e.target.value })}
                    placeholder="e.g. contact@email.com (optional)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-slate-300 font-medium mb-1">City</label>
                  <input
                    type="text"
                    value={quickPartyForm.city}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, city: e.target.value })}
                    placeholder="e.g. Pune"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-slate-300 font-medium mb-1">State</label>
                  <input
                    type="text"
                    value={quickPartyForm.state}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, state: e.target.value })}
                    placeholder="e.g. Maharashtra"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-slate-300 font-medium mb-1">Role Type</label>
                  <select
                    value={quickPartyForm.initial_role_type}
                    onChange={(e) => setQuickPartyForm({ ...quickPartyForm, initial_role_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-brand-500 font-mono"
                  >
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="SUPPLIER">SUPPLIER / VENDOR</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQuickPartyModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingParty}
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-md"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{creatingParty ? 'Saving...' : 'Save & Select in Voucher'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill Settlement Modal (AP Vendor Bill Pay & AR Customer Payment Receipt) */}
      {showBillSettleModal && settlingInvoice && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-xl ${
                  settlingInvoice.document_type === 'PURCHASE_INVOICE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                }`}>
                  {settlingInvoice.document_type === 'PURCHASE_INVOICE' ? (
                    <CreditCard className="w-5 h-5" />
                  ) : (
                    <Wallet className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <span>{settlingInvoice.document_type === 'PURCHASE_INVOICE' ? '⚡ Settle Supplier Bill (Clear AP)' : '⚡ Receive Customer Payment (Clear AR)'}</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-brand-300 border border-slate-700">
                      {settlingInvoice.document_number}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {settlingInvoice.document_type === 'PURCHASE_INVOICE'
                      ? 'Disburse money from bank/cash, debit Sundry Creditors (2001) & clear vendor liability in General Ledger'
                      : 'Deposit money into bank/cash, credit Sundry Debtors (1101) & clear customer receivable in General Ledger'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowBillSettleModal(false); setSettlingInvoice(null); }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmBillSettlement} className="p-5 overflow-y-auto space-y-4">
              {/* Invoice Summary Card */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Party / Vendor</span>
                  <span className="font-semibold text-white truncate block mt-0.5" title={settlingInvoice.billing_name || settlingInvoice.party_name}>
                    {settlingInvoice.billing_name || settlingInvoice.party_name || 'Counterparty'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Invoice Total</span>
                  <span className="font-mono font-bold text-white block mt-0.5">
                    ₹{Number(settlingInvoice.grand_total || settlingInvoice.total_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Paid So Far</span>
                  <span className="font-mono font-semibold text-emerald-400 block mt-0.5">
                    ₹{Number(settlingInvoice.amount_paid || 0).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Balance Due</span>
                  <span className="font-mono font-bold text-amber-400 block mt-0.5">
                    ₹{Number(settlingInvoice.balance_due ?? (Number(settlingInvoice.amount_paid) > 0 ? 0 : settlingInvoice.grand_total) ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Settlement Form Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Payment Amount */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-300 font-semibold">Payment Amount (₹) *</label>
                    <button
                      type="button"
                      onClick={() => {
                        const bal = Number(settlingInvoice.balance_due ?? settlingInvoice.grand_total ?? 0);
                        const fullAmt = (bal > 0 ? bal : Number(settlingInvoice.grand_total || 0)).toFixed(2);
                        handleSettleAmountChange(fullAmt);
                      }}
                      className="text-[10px] text-brand-400 hover:text-brand-300 underline cursor-pointer"
                    >
                      Fill Full Balance
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={settleAmount}
                    onChange={(e) => handleSettleAmountChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-brand-500"
                    placeholder="0.00"
                  />
                </div>

                {/* Bank / Cash Account Dropdown */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {settlingInvoice.document_type === 'PURCHASE_INVOICE' ? 'Disbursing Bank / Cash Ledger *' : 'Depositing Bank / Cash Ledger *'}
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => handleBankChange(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                  >
                    {bankAccounts.length === 0 ? (
                      <option value="">No Bank/Cash accounts loaded</option>
                    ) : (
                      bankAccounts.map((acc) => (
                        <option key={acc._id || acc.account_code} value={acc._id || acc.account_code}>
                          {acc.account_code} - {acc.account_name} ({acc.account_type || 'ASSET'})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Payment Mode */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
                    <option value="UPI">UPI / QR Code</option>
                    <option value="CASH">Cash in Hand</option>
                    <option value="CHEQUE">Cheque / Demand Draft</option>
                  </select>
                </div>

                {/* UTR / Reference */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Reference / UTR / Cheque #</label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. UTR-9876543210"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="text-xs">
                <label className="block text-slate-300 font-semibold mb-1">Narration / Memo</label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="Notes for General Ledger audit trail..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Section: Posting Rule & Accounting Policy Selection */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <div className="flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-brand-400" />
                    <span className="font-semibold text-slate-200">Posting Rule & Accounting Event:</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-slate-400">Trigger Event:</span>
                    <span className="px-2 py-0.5 rounded bg-brand-950/80 border border-brand-700/50 text-brand-300 font-mono text-[10px] font-semibold">
                      {selectedEventCode}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-400 font-medium mb-1">Accounting Posting Rule Template</label>
                    <select
                      value={selectedPostingRuleCode}
                      onChange={(e) => handleApplyRuleTemplate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                    >
                      {settlingInvoice.document_type === 'PURCHASE_INVOICE' ? (
                        <>
                          <option value="RULE-AP-PAY-01">RULE-AP-PAY-01: Standard AP Bill Settlement (Dr 2001, Cr Bank)</option>
                          <option value="RULE-AP-PAY-DISCOUNT">RULE-AP-PAY-DISCOUNT: Settlement with Cash Discount / Kasar (Cr 4900)</option>
                          <option value="RULE-AP-PAY-TDS">RULE-AP-PAY-TDS: Settlement with Statutory TDS Deduction (Cr 2101)</option>
                          <option value="RULE-CUSTOM">RULE-CUSTOM: Custom Multi-Line Journal Entry</option>
                        </>
                      ) : (
                        <>
                          <option value="RULE-AR-REC-01">RULE-AR-REC-01: Standard AR Receipt Settlement (Dr Bank, Cr 1101)</option>
                          <option value="RULE-CUSTOM">RULE-CUSTOM: Custom Multi-Line Journal Entry</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <FileCode className="w-4 h-4 text-emerald-400 mr-2 shrink-0" />
                    <span>
                      {selectedPostingRuleCode === 'RULE-AP-PAY-01' && 'Direct full settlement against Sundry Creditors liability via Bank/Cash disbursement.'}
                      {selectedPostingRuleCode === 'RULE-AP-PAY-DISCOUNT' && 'Applies prompt-payment discount / Kasar received, reducing net bank cash outflow.'}
                      {selectedPostingRuleCode === 'RULE-AP-PAY-TDS' && 'Withholds statutory tax deduction at source (TDS), crediting Duties & Taxes ledger.'}
                      {selectedPostingRuleCode === 'RULE-CUSTOM' && 'User-defined custom multi-line double-entry journal entry.'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section: Interactive Journal Entry (JE) Lines Grid */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-white text-xs">General Ledger Journal Entry Lines (Real-Time Double-Entry)</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                      {jeLines.length} lines
                    </span>
                  </div>

                  {/* Quick Preset Add Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAddJeLine('1001', 'DEBIT', '0.00', `Adjustment for ${settlingInvoice.document_number}`)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] transition flex items-center space-x-1 cursor-pointer"
                      title="Add a custom blank debit or credit line"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Line</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddJeLine('4900', 'CREDIT', '0.00', 'Cash discount / Kasar received')}
                      className="px-2 py-1 rounded bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/50 text-amber-300 font-medium text-[11px] transition flex items-center space-x-1 cursor-pointer"
                      title="Add Discount / Kasar Received account"
                    >
                      <Percent className="w-3 h-3" />
                      <span>+ Discount</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddJeLine('2101', 'CREDIT', '0.00', 'TDS deduction at source')}
                      className="px-2 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/50 text-indigo-300 font-medium text-[11px] transition flex items-center space-x-1 cursor-pointer"
                      title="Add TDS / Duties & Taxes account"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>+ TDS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddJeLine('5030', 'DEBIT', '0.00', 'Bank transfer / processing charges')}
                      className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 font-medium text-[11px] transition flex items-center space-x-1 cursor-pointer"
                      title="Add Bank Charges expense account"
                    >
                      <DollarSign className="w-3 h-3" />
                      <span>+ Charges</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddJeLine('5900', 'DEBIT', '0.00', 'Round-off difference')}
                      className="px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/50 text-cyan-300 font-medium text-[11px] transition flex items-center space-x-1 cursor-pointer"
                      title="Add Round-off difference account"
                    >
                      <Zap className="w-3 h-3" />
                      <span>+ Round-off</span>
                    </button>
                  </div>
                </div>

                {/* Table of JE Lines */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-1.5 px-2 w-8">#</th>
                        <th className="py-1.5 px-2 w-20">Type</th>
                        <th className="py-1.5 px-2">Ledger Account (COA)</th>
                        <th className="py-1.5 px-2 text-right w-28">Debit (Dr ₹)</th>
                        <th className="py-1.5 px-2 text-right w-28">Credit (Cr ₹)</th>
                        <th className="py-1.5 px-2">Memo / Narration</th>
                        <th className="py-1.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {jeLines.map((line, idx) => (
                        <tr key={line.id || idx} className="hover:bg-slate-900/50">
                          <td className="py-2 px-2 text-slate-500 font-mono">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <select
                              value={line.direction}
                              onChange={(e) => handleUpdateJeLine(idx, 'direction', e.target.value)}
                              className={`rounded px-1.5 py-1 text-[11px] font-bold font-mono border focus:outline-none ${
                                line.direction === 'DEBIT'
                                  ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-400'
                                  : 'bg-rose-950/80 border-rose-700/60 text-rose-400'
                              }`}
                            >
                              <option value="DEBIT">Dr</option>
                              <option value="CREDIT">Cr</option>
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={line.account_code}
                              onChange={(e) => handleUpdateJeLine(idx, 'account_code', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white font-mono text-[11px] focus:outline-none focus:border-brand-500"
                            >
                              {allLedgerAccounts.map((acc) => (
                                <option key={acc._id || acc.account_code} value={acc.account_code}>
                                  {acc.account_code} - {acc.account_name} ({acc.account_type})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2 text-right">
                            {line.direction === 'DEBIT' ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.debit}
                                onChange={(e) => handleUpdateJeLine(idx, 'debit', e.target.value)}
                                className="w-full bg-slate-900 border border-emerald-800/60 rounded p-1 text-emerald-400 font-mono font-bold text-right text-[11px] focus:outline-none focus:border-emerald-500"
                              />
                            ) : (
                              <span className="text-slate-600 font-mono block text-right pr-2">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {line.direction === 'CREDIT' ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.credit}
                                onChange={(e) => handleUpdateJeLine(idx, 'credit', e.target.value)}
                                className="w-full bg-slate-900 border border-rose-800/60 rounded p-1 text-rose-400 font-mono font-bold text-right text-[11px] focus:outline-none focus:border-rose-500"
                              />
                            ) : (
                              <span className="text-slate-600 font-mono block text-right pr-2">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={line.memo}
                              onChange={(e) => handleUpdateJeLine(idx, 'memo', e.target.value)}
                              placeholder="Line narration..."
                              className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-slate-300 text-[11px] focus:outline-none focus:border-brand-500"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            {jeLines.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveJeLine(idx)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                                title="Delete line"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Live Real-Time Double-Entry Balancing Bar */}
                <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs">
                  <div className="flex items-center space-x-3 font-mono">
                    <span className="text-slate-400">
                      Total Dr: <span className="text-emerald-400 font-bold">₹{jeTotals.totalDebit.toFixed(2)}</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400">
                      Total Cr: <span className="text-rose-400 font-bold">₹{jeTotals.totalCredit.toFixed(2)}</span>
                    </span>
                  </div>

                  <div>
                    {jeTotals.isBalanced ? (
                      <span className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-[11px] font-semibold flex items-center space-x-1.5 shadow-sm">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>✓ Balanced (Ready to Post to GL)</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-600/50 text-rose-300 text-[11px] font-semibold flex items-center space-x-1.5 shadow-sm">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        <span>⚠️ Unbalanced (Diff: ₹{jeTotals.diff.toFixed(2)}) — Dr must equal Cr</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-400">
                  {jeTotals.isBalanced
                    ? 'Posting will create both the Commercial Payment voucher and General Ledger Journal Entry.'
                    : 'Adjust lines above until Total Debits equal Total Credits to enable posting.'}
                </span>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => { setShowBillSettleModal(false); setSettlingInvoice(null); }}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={settleSubmitting || !jeTotals.isBalanced}
                    className={`px-5 py-2 rounded-lg text-white font-semibold text-xs transition flex items-center space-x-2 cursor-pointer shadow-lg ${
                      !jeTotals.isBalanced
                        ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                        : settlingInvoice.document_type === 'PURCHASE_INVOICE'
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-brand-600 hover:bg-brand-500'
                    }`}
                    title={!jeTotals.isBalanced ? 'Journal Entry must be balanced before posting' : 'Post to General Ledger'}
                  >
                    {settleSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Posting to General Ledger...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{settlingInvoice.document_type === 'PURCHASE_INVOICE' ? 'Confirm & Clear AP Bill' : 'Confirm & Clear AR Receipt'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Post to GL Modal (Event & Posting Rule Inspector) */}
      {showDocPostModal && postingDoc && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-4 max-h-[94vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center space-x-2">
                      <span>Post to General Ledger</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-brand-950 border border-brand-700/60 text-brand-300">
                        {postingDoc.document_type}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Inspect Event, choose Posting Rule template, and verify live Double-Entry GL lines before posting.
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setShowDocPostModal(false); setPostingDoc(null); }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Overview Summary Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-mono">Document #</span>
                <span className="font-mono font-bold text-white text-sm mt-0.5 block">{postingDoc.document_number}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-mono">Customer / Vendor</span>
                <span className="font-semibold text-slate-200 mt-0.5 block truncate">
                  {postingDoc.billing_name || postingDoc.party_name || postingDoc.party_id?.trade_name || 'Cash Customer'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-mono">Taxable / Tax</span>
                <span className="font-mono text-slate-300 mt-0.5 block">
                  {postingDoc.currency === 'USD' ? '$' : '₹'}{Number(postingDoc.total_taxable_amount || 0).toFixed(2)} + {postingDoc.currency === 'USD' ? '$' : '₹'}{Number(postingDoc.total_tax_amount || 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-mono">Grand Total</span>
                <span className="font-mono font-bold text-emerald-400 text-sm mt-0.5 block">
                  {postingDoc.currency === 'USD' ? '$' : '₹'}{Number(postingDoc.grand_total || postingDoc.total_amount || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Event & Posting Rule Template Selection */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div className="flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-brand-400" />
                  <span className="font-bold text-slate-200">Accounting Event & Policy Selection:</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-400">Active Rule Code:</span>
                  <span className="px-2 py-0.5 rounded bg-brand-950/80 border border-brand-700/50 text-brand-300 font-mono text-[10px] font-semibold">
                    {docPostRuleCode}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                    Select Event to Fire
                  </label>
                  <select
                    value={docPostEventCode}
                    onChange={(e) => handleDocEventChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                  >
                    {(postingDoc.document_type === 'CREDIT_NOTE' || postingDoc.document_type === 'SALES_RETURN') ? (
                      <>
                        <option value="commercial.credit_note.spoilage_return">
                          commercial.credit_note.spoilage_return (Perishable Food / Spoilage Return - NO Stock Inflow)
                        </option>
                        <option value="commercial.credit_note.stock_return">
                          commercial.credit_note.stock_return (Sales Return with Stock Inflow - Durable Retail)
                        </option>
                        <option value="commercial.credit_note.price_adjustment">
                          commercial.credit_note.price_adjustment (Price Rebate / Discount - No Stock)
                        </option>
                        <option value="commercial.credit_note.bad_debt_allowance">
                          commercial.credit_note.bad_debt_allowance (Customer Dispute / Goodwill Waiver)
                        </option>
                      </>
                    ) : postingDoc.document_type === 'SALES_INVOICE' ? (
                      <>
                        <option value="commercial.sales_invoice.credit_sale">
                          commercial.sales_invoice.credit_sale (Standard Credit Sale - AR Debtors)
                        </option>
                        <option value="commercial.sales_invoice.cash_sale">
                          commercial.sales_invoice.cash_sale (Counter Sale - Direct Bank/Cash Receipt)
                        </option>
                      </>
                    ) : postingDoc.document_type === 'PURCHASE_INVOICE' ? (
                      <>
                        <option value="commercial.purchase_invoice.stock_inflow">
                          commercial.purchase_invoice.stock_inflow (Stock Purchase - Inventory Asset)
                        </option>
                        <option value="commercial.purchase_invoice.direct_expense">
                          commercial.purchase_invoice.direct_expense (Operating Expense - Utility/Rent)
                        </option>
                        <option value="commercial.purchase_invoice.fixed_asset">
                          commercial.purchase_invoice.fixed_asset (Capital Goods - Kitchen Equipment/Asset)
                        </option>
                      </>
                    ) : (
                      <option value="commercial.document.posted">
                        commercial.document.posted (Standard Auto-Posting)
                      </option>
                    )}
                  </select>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <FileCode className="w-4 h-4 text-emerald-400 mr-2 shrink-0" />
                  <span>
                    {docPostEventCode.includes('price_adjustment') && 'Reverses AR Debtors against Sales Discount / Rebates Expense without increasing physical stock.'}
                    {docPostEventCode.includes('bad_debt') && 'Writes off uncollectible customer invoice to Bad Debt Allowance Expense.'}
                    {docPostEventCode.includes('stock_return') && 'Debits Sales Revenue & reverses Output Tax, credits AR Debtors, and restocks returned goods.'}
                    {docPostEventCode.includes('cash_sale') && 'Immediate counter sale: Debits Bank/Cash directly instead of Accounts Receivable.'}
                    {docPostEventCode.includes('credit_sale') && 'Debits Accounts Receivable (1100), credits Sales Revenue (4000) and Output Tax.'}
                    {docPostEventCode.includes('stock_inflow') && 'Debits Inventory Asset (1300), debits Input GST, credits Accounts Payable (2000).'}
                    {docPostEventCode.includes('direct_expense') && 'Debits Operating Expense GL account directly instead of Inventory Asset.'}
                    {docPostEventCode.includes('fixed_asset') && 'Capitalizes invoice amount into Fixed Asset (1500) rather than immediate expense.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Journal Entry Lines Table */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-white text-xs">Double-Entry Journal Lines Preview</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                    {docPostJeLines.length} lines
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddDocJeLine('1002', 'DEBIT', '0.00', `Adjustment on ${postingDoc.document_number}`)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] transition flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Add Line</span>
                </button>
              </div>

              {/* Lines Table */}
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th className="py-2 px-2">Account (GL Code & Name)</th>
                      <th className="py-2 px-2 w-28 text-center">Direction</th>
                      <th className="py-2 px-2 w-28 text-right">Debit (Dr)</th>
                      <th className="py-2 px-2 w-28 text-right">Credit (Cr)</th>
                      <th className="py-2 px-2">Memo / Narration</th>
                      <th className="py-2 px-2 w-8 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {docPostJeLines.map((line, idx) => (
                      <tr key={line.id || idx} className="hover:bg-slate-900/50">
                        <td className="py-2 px-2">
                          <select
                            value={line.account_code}
                            onChange={(e) => handleUpdateDocJeLine(idx, 'account_code', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-[11px] focus:outline-none focus:border-brand-500"
                          >
                            {allLedgerAccounts.map((a) => (
                              <option key={a._id || a.account_code} value={a.account_code}>
                                {a.account_code} - {a.account_name} ({a.account_type})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-900">
                            <button
                              type="button"
                              onClick={() => handleUpdateDocJeLine(idx, 'direction', 'DEBIT')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition ${
                                line.direction === 'DEBIT' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              Dr
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateDocJeLine(idx, 'direction', 'CREDIT')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition ${
                                line.direction === 'CREDIT' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              Cr
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          {line.direction === 'DEBIT' ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.debit}
                              onChange={(e) => handleUpdateDocJeLine(idx, 'debit', e.target.value)}
                              className="w-full bg-slate-900 border border-emerald-800/60 rounded p-1 text-emerald-400 font-mono font-bold text-right text-[11px] focus:outline-none focus:border-emerald-500"
                            />
                          ) : (
                            <span className="text-slate-600 font-mono block text-right pr-2">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {line.direction === 'CREDIT' ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.credit}
                              onChange={(e) => handleUpdateDocJeLine(idx, 'credit', e.target.value)}
                              className="w-full bg-slate-900 border border-rose-800/60 rounded p-1 text-rose-400 font-mono font-bold text-right text-[11px] focus:outline-none focus:border-rose-500"
                            />
                          ) : (
                            <span className="text-slate-600 font-mono block text-right pr-2">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={line.memo}
                            onChange={(e) => handleUpdateDocJeLine(idx, 'memo', e.target.value)}
                            placeholder="Line narration..."
                            className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-slate-300 text-[11px] focus:outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          {docPostJeLines.length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDocJeLine(idx)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                              title="Delete line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Balancing Bar */}
              <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs">
                <div className="flex items-center space-x-3 font-mono">
                  <span className="text-slate-400">
                    Total Dr: <span className="text-emerald-400 font-bold">{postingDoc.currency === 'USD' ? '$' : '₹'}{docPostTotals.totalDebit.toFixed(2)}</span>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400">
                    Total Cr: <span className="text-rose-400 font-bold">{postingDoc.currency === 'USD' ? '$' : '₹'}{docPostTotals.totalCredit.toFixed(2)}</span>
                  </span>
                </div>

                <div>
                  {docPostTotals.isBalanced ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-[11px] font-semibold flex items-center space-x-1.5 shadow-sm">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>✓ Balanced & Ready to Post</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-600/50 text-rose-300 text-[11px] font-semibold flex items-center space-x-1.5 shadow-sm">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>⚠️ Unbalanced (Diff: {postingDoc.currency === 'USD' ? '$' : '₹'}{docPostTotals.diff.toFixed(2)})</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-400">
                Triggering Event: <span className="text-brand-300 font-mono font-semibold">{docPostEventCode}</span>
              </span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => { setShowDocPostModal(false); setPostingDoc(null); }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={docPostSubmitting || !docPostTotals.isBalanced}
                  onClick={handleConfirmPostDoc}
                  className={`px-5 py-2 rounded-lg text-white font-semibold text-xs transition flex items-center space-x-2 cursor-pointer shadow-lg ${
                    !docPostTotals.isBalanced
                      ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {docPostSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Posting to General Ledger...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm & Post to General Ledger</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Payment & NPCI UPI QR Settlement Modal */}
      <PaymentModal
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirmPayment={handleConfirmPayment}
        amount={paymentModalState.amount}
        invoiceNumber={paymentModalState.documentNumber}
        customerName={paymentModalState.customerName}
        companyName={paymentModalState.companyName}
        upiId={paymentModalState.upiId}
        loading={paymentLoading}
      />
    </div>
  );
}
