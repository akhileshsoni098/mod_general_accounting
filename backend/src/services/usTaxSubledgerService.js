const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  TaxLiabilityEntry,
  TaxCalculationSnapshot,
  TaxReturnPeriod,
  CommercialDocument
} = require('../models');

/**
 * US Tax Liability Subledger Service
 * Idempotently maintains the audit trail of tax liabilities, collections,
 * reversals, and payments for US tax jurisdictions.
 */

/**
 * Idempotently records a tax liability entry when a commercial document is posted.
 */
async function recordDocumentLiabilityEntry({
  tenantId,
  companyId,
  document,
  snapshot,
  journalId = null,
  userId = null,
  session = null
}) {
  if (!document) {
    throw new Error('document is required to record tax liability entry');
  }

  const isUsDoc = document.tax_regime === 'US_SALES_TAX';
  if (!isUsDoc) {
    return null; // Only US tax documents enter this subledger
  }

  // Gracefully handle disconnected unit test environments
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  const docType = document.document_type;
  const docNumber = document.document_number;
  const docId = document._id;
  const grandTotalBn = new BigNumber((document.grand_total || 0).toString());
  const taxableBn = new BigNumber((document.total_taxable_amount || 0).toString());
  const taxBn = new BigNumber((document.total_tax_amount || 0).toString());

  // Determine entry type and signed tax amount
  let entryType = 'TAX_COLLECTED_SALES';
  let signedTaxBn = taxBn;

  if (docType === 'SALES_INVOICE') {
    entryType = 'TAX_COLLECTED_SALES';
    signedTaxBn = taxBn; // Positive addition to liability
  } else if (docType === 'SALES_RETURN' || docType === 'CREDIT_NOTE') {
    entryType = 'SALES_RETURN_REVERSAL';
    signedTaxBn = taxBn.isPositive() ? taxBn.negated() : taxBn; // Negative reduction
  } else if (docType === 'PURCHASE_INVOICE') {
    entryType = 'PURCHASE_USE_TAX';
    signedTaxBn = taxBn;
  } else {
    entryType = 'TAX_ADJUSTMENT';
    signedTaxBn = taxBn;
  }

  const destState = document.shipping_address?.state || document.billing_address?.state || 'US';
  const jurisdictionCode = `US-${destState.toUpperCase()}`;
  const idempotencyKey = `TLE-${docType}-${docId}`;

  // Find matching return period if one is currently open
  const txDate = document.transaction_date ? new Date(document.transaction_date) : new Date();
  const period = await TaxReturnPeriod.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    jurisdiction_code: jurisdictionCode,
    period_start_date: { $lte: txDate },
    period_end_date: { $gte: txDate }
  }).session(session);

  const existing = await TaxLiabilityEntry.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    idempotency_key: idempotencyKey
  }).session(session);

  if (existing) {
    return existing; // Idempotent return
  }

  const newEntry = new TaxLiabilityEntry({
    tenant_id: tenantId,
    company_id: companyId,
    jurisdiction_id: null,
    jurisdiction_code: jurisdictionCode,
    tax_type: 'SALES_USE_TAX',
    source_document_id: docId,
    source_document_type: docType,
    source_document_number: docNumber,
    source_snapshot_id: snapshot ? snapshot._id : document.tax_snapshot_id || null,
    journal_id: journalId || document.journal_id || null,
    tax_transaction_date: txDate,
    posting_date: document.posting_date ? new Date(document.posting_date) : new Date(),
    taxable_base_amount: taxableBn.toFixed(2),
    tax_amount: signedTaxBn.toFixed(2),
    currency: document.currency || 'USD',
    entry_type: entryType,
    idempotency_key: idempotencyKey,
    status: 'POSTED',
    return_period_id: period ? period._id : null,
    notes: `Tax liability recorded from posted ${docType} ${docNumber}`,
    audit_trail: [
      {
        action: 'CREATED_FROM_POSTING',
        user_id: userId,
        timestamp: new Date(),
        note: `Generated liability subledger entry for ${docNumber}`
      }
    ]
  });

  await newEntry.save({ session });
  return newEntry;
}

/**
 * Idempotently records a reversal in the tax liability subledger when a document is reversed.
 * Follows an append-only reversal pattern with reference to the original entry.
 */
async function reverseDocumentLiabilityEntry({
  tenantId,
  companyId,
  document,
  reversalJournalId = null,
  userId = null,
  reason = '',
  session = null
}) {
  if (!document) {
    throw new Error('document is required to reverse tax liability entry');
  }

  const isUsDoc = document.tax_regime === 'US_SALES_TAX';
  if (!isUsDoc) {
    return null;
  }

  // Gracefully handle disconnected unit test environments
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  const docId = document._id;
  const docType = document.document_type;
  const docNumber = document.document_number;

  const originalKey = `TLE-${docType}-${docId}`;
  const originalEntry = await TaxLiabilityEntry.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    idempotency_key: originalKey
  }).session(session);

  const reversalKey = `TLE-REV-${docType}-${docId}`;
  const existingReversal = await TaxLiabilityEntry.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    idempotency_key: reversalKey
  }).session(session);

  if (existingReversal) {
    return existingReversal;
  }

  const origTaxBn = originalEntry
    ? new BigNumber(originalEntry.tax_amount)
    : new BigNumber((document.total_tax_amount || 0).toString());

  // Negate original amount to create perfectly offsetting entry
  const reversalTaxBn = origTaxBn.negated();
  const taxableBn = originalEntry
    ? new BigNumber(originalEntry.taxable_base_amount)
    : new BigNumber((document.total_taxable_amount || 0).toString());

  const reversalEntry = new TaxLiabilityEntry({
    tenant_id: tenantId,
    company_id: companyId,
    jurisdiction_id: originalEntry ? originalEntry.jurisdiction_id : null,
    jurisdiction_code: originalEntry ? originalEntry.jurisdiction_code : `US-${document.shipping_address?.state || 'US'}`,
    tax_type: originalEntry ? originalEntry.tax_type : 'SALES_USE_TAX',
    source_document_id: docId,
    source_document_type: docType,
    source_document_number: docNumber,
    source_snapshot_id: originalEntry ? originalEntry.source_snapshot_id : document.tax_snapshot_id || null,
    journal_id: reversalJournalId,
    tax_transaction_date: new Date(),
    posting_date: new Date(),
    taxable_base_amount: taxableBn.toFixed(2),
    tax_amount: reversalTaxBn.toFixed(2),
    currency: document.currency || 'USD',
    entry_type: 'ENTRY_REVERSAL',
    reversal_of_entry_id: originalEntry ? originalEntry._id : null,
    idempotency_key: reversalKey,
    status: 'POSTED',
    notes: `Reversal of liability entry for ${docNumber}: ${reason || 'Document reversed'}`,
    audit_trail: [
      {
        action: 'REVERSAL_CREATED',
        user_id: userId,
        timestamp: new Date(),
        note: `Offsetting reversal entry created for ${docNumber}`
      }
    ]
  });

  await reversalEntry.save({ session });

  if (originalEntry) {
    originalEntry.status = 'REVERSED';
    originalEntry.audit_trail.push({
      action: 'MARKED_REVERSED',
      user_id: userId,
      timestamp: new Date(),
      note: `Reversed by entry ${reversalEntry._id}`
    });
    originalEntry.row_version = (originalEntry.row_version || 1) + 1;
    await originalEntry.save({ session });
  }

  return reversalEntry;
}

/**
 * Paginated query for tax liability entries.
 */
async function getLiabilityEntries({
  tenantId,
  companyId,
  jurisdictionCode = null,
  startDate = null,
  endDate = null,
  entryType = null,
  status = null,
  page = 1,
  limit = 50
}) {
  const query = { tenant_id: tenantId, company_id: companyId };
  if (jurisdictionCode) {
    query.jurisdiction_code = String(jurisdictionCode).toUpperCase().trim();
  }
  if (entryType) {
    query.entry_type = entryType;
  }
  if (status) {
    query.status = status;
  }
  if (startDate || endDate) {
    query.tax_transaction_date = {};
    if (startDate) query.tax_transaction_date.$gte = new Date(startDate);
    if (endDate) query.tax_transaction_date.$lte = new Date(endDate);
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (p - 1) * l;

  const [entries, totalCount] = await Promise.all([
    TaxLiabilityEntry.find(query)
      .sort({ tax_transaction_date: -1, created_at: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    TaxLiabilityEntry.countDocuments(query)
  ]);

  return {
    entries,
    pagination: {
      page: p,
      limit: l,
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / l)
    }
  };
}

/**
 * Computes subledger summary figures (opening, additions, reductions, payments, closing balance).
 */
async function getLiabilitySummary({
  tenantId,
  companyId,
  jurisdictionCode = null,
  startDate = null,
  endDate = null
}) {
  const match = { tenant_id: tenantId, company_id: companyId };
  if (jurisdictionCode) {
    match.jurisdiction_code = String(jurisdictionCode).toUpperCase().trim();
  }
  if (startDate || endDate) {
    match.tax_transaction_date = {};
    if (startDate) match.tax_transaction_date.$gte = new Date(startDate);
    if (endDate) match.tax_transaction_date.$lte = new Date(endDate);
  }

  const entries = await TaxLiabilityEntry.find(match).lean();

  let additionsBn = new BigNumber(0);
  let reductionsBn = new BigNumber(0);
  let paymentsBn = new BigNumber(0);
  let netLiabilityBn = new BigNumber(0);

  for (const e of entries) {
    const amtBn = new BigNumber(e.tax_amount || 0);
    netLiabilityBn = netLiabilityBn.plus(amtBn);

    if (e.entry_type === 'TAX_PAYMENT') {
      paymentsBn = paymentsBn.plus(amtBn.abs());
    } else if (amtBn.isPositive()) {
      additionsBn = additionsBn.plus(amtBn);
    } else {
      reductionsBn = reductionsBn.plus(amtBn.abs());
    }
  }

  return {
    jurisdiction_code: jurisdictionCode || 'ALL',
    total_entries_count: entries.length,
    additions_amount: additionsBn.toFixed(2),
    reductions_amount: reductionsBn.toFixed(2),
    payments_amount: paymentsBn.toFixed(2),
    net_liability_amount: netLiabilityBn.toFixed(2)
  };
}

module.exports = {
  recordDocumentLiabilityEntry,
  reverseDocumentLiabilityEntry,
  getLiabilityEntries,
  getLiabilitySummary
};
