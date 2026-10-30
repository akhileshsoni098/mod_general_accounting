const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  CommercialDocument,
  Party,
  LedgerAccount,
  InterestRule
} = require('../models');
const { postJournalEntry } = require('./journalPostingService');

/**
 * Calculates overdue interest for all pending customer or vendor bills as of a given date.
 */
async function calculateOverdueInterest({
  tenantId,
  companyId,
  partyId = null,
  documentType = 'SALES_INVOICE',
  asOfDate = new Date()
}) {
  const cutoff = new Date(asOfDate);

  // 1. Resolve default or party-specific interest rule
  let rule = null;
  if (partyId) {
    rule = await InterestRule.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      party_id: partyId,
      status: 'ACTIVE'
    });
  }

  if (!rule) {
    rule = await InterestRule.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      party_id: null,
      status: 'ACTIVE'
    });
  }

  const annualRate = rule ? rule.rate_percent_per_annum : 18;
  const graceDays = rule ? (rule.grace_period_days || 0) : 0;
  const basisDays = (rule && rule.calculation_basis === '360_DAYS') ? 360 : 365;

  // 2. Query unpaid commercial invoices
  const docQuery = {
    tenant_id: tenantId,
    company_id: companyId,
    document_type: documentType,
    status: 'POSTED',
    balance_due: { $gt: 0 }
  };
  if (partyId) docQuery.party_id = partyId;

  const docs = await CommercialDocument.find(docQuery).populate('party_id', 'legal_name trade_name party_code');

  let totalPrincipalOverdue = new BigNumber(0);
  let totalInterestAccrued = new BigNumber(0);
  const items = [];

  for (const doc of docs) {
    const dueDate = new Date(doc.due_date || doc.issue_date);
    const diffMs = cutoff.getTime() - dueDate.getTime();
    const rawDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const effectiveOverdueDays = Math.max(0, rawDays - graceDays);

    const balanceDueBN = new BigNumber(doc.balance_due ? doc.balance_due.toString() : 0);

    let interestBN = new BigNumber(0);
    if (effectiveOverdueDays > 0) {
      // Interest = Principal * (Rate% / 100) * (Days / Basis)
      const rateFraction = new BigNumber(annualRate).dividedBy(100);
      const timeFraction = new BigNumber(effectiveOverdueDays).dividedBy(basisDays);
      interestBN = balanceDueBN.multipliedBy(rateFraction).multipliedBy(timeFraction).decimalPlaces(2, BigNumber.ROUND_HALF_UP);
    }

    if (effectiveOverdueDays > 0 && interestBN.isGreaterThan(0)) {
      totalPrincipalOverdue = totalPrincipalOverdue.plus(balanceDueBN);
      totalInterestAccrued = totalInterestAccrued.plus(interestBN);

      items.push({
        document_id: doc._id,
        document_number: doc.document_number,
        party_id: doc.party_id?._id,
        party_name: doc.party_id?.trade_name || doc.party_id?.legal_name || 'Customer',
        party_code: doc.party_id?.party_code || '',
        issue_date: doc.issue_date,
        due_date: doc.due_date,
        overdue_days: effectiveOverdueDays,
        grace_days_applied: graceDays,
        balance_due: balanceDueBN.toFixed(2),
        annual_rate_percent: annualRate,
        interest_amount: interestBN.toFixed(2)
      });
    }
  }

  return {
    as_of_date: cutoff.toISOString().slice(0, 10),
    annual_rate_percent: annualRate,
    basis_days: basisDays,
    grace_period_days: graceDays,
    total_overdue_invoices: items.length,
    total_principal_overdue: totalPrincipalOverdue.toFixed(2),
    total_interest_accrued: totalInterestAccrued.toFixed(2),
    items
  };
}

/**
 * Posts an Interest Debit Note to charge overdue interest on an invoice.
 */
async function postInterestDebitNote({
  tenantId,
  companyId,
  userId,
  invoiceId,
  interestAmount,
  asOfDate = new Date(),
  receivableAccountCode = '1100', // Sundry Debtors
  interestIncomeAccountCode = '4200', // Other Income / Interest Income
  notes = '',
  session = null
}) {
  const invoice = await CommercialDocument.findOne({
    _id: invoiceId,
    tenant_id: tenantId,
    company_id: companyId
  }).populate('party_id');

  if (!invoice) {
    throw new Error('Commercial invoice not found');
  }

  const interestBN = new BigNumber(interestAmount);
  if (interestBN.isLessThanOrEqualTo(0)) {
    throw new Error('Interest amount must be greater than zero');
  }

  // Ensure accounts exist
  const arAcc = await LedgerAccount.findOne({
    tenant_id: tenantId,
    account_code: receivableAccountCode,
    ...(companyId ? { company_id: companyId } : {})
  });
  if (!arAcc) throw new Error(`Receivable account ${receivableAccountCode} not found`);

  let incAcc = await LedgerAccount.findOne({
    tenant_id: tenantId,
    account_code: interestIncomeAccountCode,
    ...(companyId ? { company_id: companyId } : {})
  });
  if (!incAcc) {
    // Fallback to 4000 or 4003 if 4200 doesn't exist
    incAcc = await LedgerAccount.findOne({
      tenant_id: tenantId,
      account_code: { $in: ['4000', '4003', '4001'] },
      ...(companyId ? { company_id: companyId } : {})
    });
  }
  if (!incAcc) throw new Error(`Interest income account ${interestIncomeAccountCode} not found`);

  const debitNoteNumber = `IDN-${invoice.document_number}-${Date.now().toString().slice(-4)}`;

  // Post balanced Journal Entry:
  // Debit: Sundry Debtors (AR)
  // Credit: Interest Income
  const journalResult = await postJournalEntry({
    tenantId,
    companyId,
    userId,
    postingDate: asOfDate,
    sourceModule: 'INTEREST_NOTE',
    referenceId: debitNoteNumber,
    commercialDocumentId: invoice._id,
    referenceType: 'INVOICE_ADJUSTMENT',
    referenceDocumentNumber: invoice.document_number,
    memo: `Interest Debit Note for overdue Invoice ${invoice.document_number}: ${notes}`,
    currency: invoice.currency || 'INR',
    lines: [
      {
        account_code: arAcc.account_code,
        debit: interestBN.toFixed(2),
        credit: '0.00',
        memo: `Overdue interest charged to ${invoice.party_id?.legal_name || 'party'}`
      },
      {
        account_code: incAcc.account_code,
        debit: '0.00',
        credit: interestBN.toFixed(2),
        memo: `Overdue interest income from Invoice ${invoice.document_number}`
      }
    ],
    session
  });

  return {
    debit_note_number: debitNoteNumber,
    interest_amount: interestBN.toFixed(2),
    journal: journalResult.journal,
    invoice_number: invoice.document_number
  };
}

module.exports = {
  calculateOverdueInterest,
  postInterestDebitNote
};
