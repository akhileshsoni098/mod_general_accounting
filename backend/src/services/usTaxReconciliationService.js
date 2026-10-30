const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  CommercialDocument,
  TaxCalculationSnapshot,
  TaxLiabilityEntry,
  TaxReturn,
  TaxPaymentRecord,
  CompanyPostingConfig,
  Journal,
  JournalEntry,
  LedgerAccount
} = require('../models');

/**
 * US Tax Reconciliation Service
 * Provides auditable cross-system reconciliations between:
 * 1. Posted Commercial Documents vs Tax Liability Subledger
 * 2. Tax Liability Subledger vs General Ledger Liability Balance (Account 2110)
 * 3. Tax Return vs Tax Payments & Credits (Return Reconciliation)
 * 4. Provider Reconciliation Retry Worker (idempotent commit for PENDING_RETRY documents)
 */

/**
 * 1. Reconcile Posted Commercial Documents against Tax Liability Subledger.
 */
async function reconcileDocumentsToSubledger({
  tenantId,
  companyId,
  startDate = null,
  endDate = null
}) {
  const query = {
    tenant_id: tenantId,
    company_id: companyId,
    tax_regime: 'US_SALES_TAX',
    status: { $in: ['POSTED', 'REVERSED'] }
  };

  if (startDate || endDate) {
    query.transaction_date = {};
    if (startDate) query.transaction_date.$gte = new Date(startDate);
    if (endDate) query.transaction_date.$lte = new Date(endDate);
  }

  const docs = await CommercialDocument.find(query).lean();
  const discrepancies = [];
  let totalDocTaxBn = new BigNumber(0);
  let totalSubledgerTaxBn = new BigNumber(0);

  for (const doc of docs) {
    const docTaxBn = new BigNumber(doc.total_tax_amount ? doc.total_tax_amount.toString() : '0');
    if (doc.status === 'POSTED') {
      totalDocTaxBn = totalDocTaxBn.plus(docTaxBn);
    }

    // Look for matching subledger entry
    const subledgerEntries = await TaxLiabilityEntry.find({
      tenant_id: tenantId,
      company_id: companyId,
      source_document_id: doc._id
    }).lean();

    if (subledgerEntries.length === 0 && doc.status === 'POSTED' && docTaxBn.isGreaterThan(0)) {
      discrepancies.push({
        source_reference: doc.document_number,
        document_id: doc._id,
        category: 'MISSING_SUBLEDGER_ENTRY',
        expected_amount: docTaxBn.toFixed(2),
        actual_amount: '0.00',
        discrepancy_amount: docTaxBn.toFixed(2),
        status: 'UNRESOLVED',
        note: `Posted document ${doc.document_number} has no tax liability subledger record.`
      });
    } else {
      let docSubledgerSumBn = new BigNumber(0);
      for (const se of subledgerEntries) {
        docSubledgerSumBn = docSubledgerSumBn.plus(new BigNumber(se.tax_amount || 0));
      }
      totalSubledgerTaxBn = totalSubledgerTaxBn.plus(docSubledgerSumBn);

      // If posted sales invoice, compare tax
      if (doc.status === 'POSTED' && doc.document_type === 'SALES_INVOICE') {
        if (!docSubledgerSumBn.isEqualTo(docTaxBn)) {
          discrepancies.push({
            source_reference: doc.document_number,
            document_id: doc._id,
            category: 'AMOUNT_MISMATCH',
            expected_amount: docTaxBn.toFixed(2),
            actual_amount: docSubledgerSumBn.toFixed(2),
            discrepancy_amount: docTaxBn.minus(docSubledgerSumBn).toFixed(2),
            status: 'UNRESOLVED',
            note: `Subledger tax total ($${docSubledgerSumBn.toFixed(2)}) differs from document tax ($${docTaxBn.toFixed(2)}).`
          });
        }
      }
    }
  }

  const diffBn = totalDocTaxBn.minus(totalSubledgerTaxBn);

  return {
    reconciliation_type: 'DOCUMENTS_TO_SUBLEDGER',
    tenant_id: tenantId,
    company_id: companyId,
    timestamp: new Date(),
    total_documents_evaluated: docs.length,
    total_document_tax: totalDocTaxBn.toFixed(2),
    total_subledger_tax: totalSubledgerTaxBn.toFixed(2),
    net_difference: diffBn.toFixed(2),
    is_reconciled: discrepancies.length === 0,
    discrepancies
  };
}

/**
 * 2. Reconcile Tax Liability Subledger against General Ledger Liability Account (2110).
 */
async function reconcileSubledgerToGl({
  tenantId,
  companyId,
  asOfDate = new Date(),
  liabilityAccountCode = null
}) {
  const config = await CompanyPostingConfig.findOne({
    tenant_id: tenantId,
    company_id: companyId
  }) || {};

  const accCode = liabilityAccountCode || config.sales_tax_payable_account_code || '2110';
  const cutoff = new Date(asOfDate);

  // 1. Sum net subledger tax amount as of cutoff date
  const subledgerEntries = await TaxLiabilityEntry.find({
    tenant_id: tenantId,
    company_id: companyId,
    posting_date: { $lte: cutoff }
  }).lean();

  let subledgerLiabilityBn = new BigNumber(0);
  for (const se of subledgerEntries) {
    subledgerLiabilityBn = subledgerLiabilityBn.plus(new BigNumber(se.tax_amount || 0));
  }

  // 2. Sum General Ledger entries for liability account (Credit increases liability, Debit decreases liability)
  const postedJournals = await Journal.find({
    tenant_id: tenantId,
    company_id: companyId,
    status: 'POSTED',
    posting_date: { $lte: cutoff }
  }).select('_id').lean();
  const postedJournalIds = postedJournals.map(j => j._id);

  const glLines = postedJournalIds.length > 0 ? await JournalEntry.find({
    tenant_id: tenantId,
    company_id: companyId,
    journal_id: { $in: postedJournalIds },
    account_code: accCode
  }).lean() : [];

  let glNetCreditBn = new BigNumber(0);
  for (const gl of glLines) {
    const crBn = new BigNumber(gl.credit || 0);
    const drBn = new BigNumber(gl.debit || 0);
    glNetCreditBn = glNetCreditBn.plus(crBn).minus(drBn);
  }

  const differenceBn = subledgerLiabilityBn.minus(glNetCreditBn);
  const isReconciled = differenceBn.abs().isLessThan(0.01);

  const discrepancies = [];
  if (!isReconciled) {
    discrepancies.push({
      category: 'GL_SUBLEDGER_VARIANCE',
      liability_account_code: accCode,
      subledger_balance: subledgerLiabilityBn.toFixed(2),
      gl_balance: glNetCreditBn.toFixed(2),
      variance: differenceBn.toFixed(2),
      status: 'UNRESOLVED',
      note: `Variance of $${differenceBn.toFixed(2)} between tax liability subledger and GL account ${accCode}.`
    });
  }

  return {
    reconciliation_type: 'SUBLEDGER_TO_GL',
    tenant_id: tenantId,
    company_id: companyId,
    as_of_date: cutoff,
    liability_account_code: accCode,
    subledger_net_liability: subledgerLiabilityBn.toFixed(2),
    gl_net_liability: glNetCreditBn.toFixed(2),
    variance: differenceBn.toFixed(2),
    is_reconciled: isReconciled,
    discrepancies
  };
}

/**
 * 3. Reconcile Tax Return against Tax Payments & Credits.
 * Equation: Net Reported Tax Liability - Applied Payments = Remaining Balance Due / Credit Carryforward.
 */
async function reconcileReturnToPayments({
  tenantId,
  companyId,
  returnId
}) {
  const taxReturn = await TaxReturn.findOne({
    _id: returnId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!taxReturn) {
    throw new Error(`Tax return not found: ${returnId}`);
  }

  const payments = await TaxPaymentRecord.find({
    tenant_id: tenantId,
    company_id: companyId,
    return_id: taxReturn._id,
    status: { $in: ['RECORDED', 'SUBMITTED', 'CONFIRMED'] }
  }).lean();

  let totalPaymentsBn = new BigNumber(0);
  for (const p of payments) {
    totalPaymentsBn = totalPaymentsBn.plus(new BigNumber(p.amount || 0));
  }

  const netLiabilityBn = new BigNumber(taxReturn.net_tax_liability_amount || 0);
  const calculatedRemainingBn = netLiabilityBn.minus(totalPaymentsBn);
  const recordedAppliedBn = new BigNumber(taxReturn.payments_applied_amount || 0);

  const discrepancies = [];
  if (!recordedAppliedBn.isEqualTo(totalPaymentsBn)) {
    discrepancies.push({
      category: 'PAYMENT_ALLOCATION_MISMATCH',
      return_number: taxReturn.return_number,
      recorded_applied: recordedAppliedBn.toFixed(2),
      actual_payment_sum: totalPaymentsBn.toFixed(2),
      variance: recordedAppliedBn.minus(totalPaymentsBn).toFixed(2),
      status: 'UNRESOLVED',
      note: 'Sum of payment records does not match return applied payments amount.'
    });
  }

  return {
    reconciliation_type: 'RETURN_TO_PAYMENTS',
    return_id: taxReturn._id,
    return_number: taxReturn.return_number,
    net_tax_liability: netLiabilityBn.toFixed(2),
    total_payments_recorded: totalPaymentsBn.toFixed(2),
    remaining_balance_due: calculatedRemainingBn.isPositive() ? calculatedRemainingBn.toFixed(2) : '0.00',
    credit_carryforward: calculatedRemainingBn.isNegative() ? calculatedRemainingBn.abs().toFixed(2) : '0.00',
    payments_count: payments.length,
    is_reconciled: discrepancies.length === 0,
    discrepancies
  };
}

/**
 * 4. Provider Reconciliation Retry Worker.
 * Scans for commercial documents with tax_reconciliation_status === 'PENDING_RETRY',
 * and safely retries the provider commit operation idempotently.
 */
async function retryPendingProviderReconciliations({
  tenantId,
  companyId,
  limit = 20
}) {
  const pendingDocs = await CommercialDocument.find({
    tenant_id: tenantId,
    company_id: companyId,
    tax_regime: 'US_SALES_TAX',
    tax_reconciliation_status: 'PENDING_RETRY'
  }).limit(limit);

  if (pendingDocs.length === 0) {
    return {
      total_pending: 0,
      retried_success: 0,
      retried_failed: 0,
      results: []
    };
  }

  const TaxProviderFactory = require('./taxProvider/TaxProviderFactory');
  const CompanyTaxProfile = mongoose.model('CompanyTaxProfile');
  const taxProfile = await CompanyTaxProfile.findOne({ tenant_id: tenantId, company_id: companyId });

  const providerName = (taxProfile && taxProfile.provider_name) || 'MOCK';
  const provider = TaxProviderFactory.createProvider(providerName, {
    environment: (taxProfile && taxProfile.environment) || 'SANDBOX',
    apiKey: taxProfile?.api_credentials?.api_key,
    allowMockInProduction: false
  });

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (const doc of pendingDocs) {
    try {
      if (typeof provider.commitTransaction === 'function') {
        await provider.commitTransaction({
          provider_transaction_id: doc.tax_provider_transaction_id || `TX-${doc.document_number}`,
          document_number: doc.document_number,
          grand_total: Number(doc.grand_total || 0).toFixed(2)
        });
      }

      doc.tax_reconciliation_status = 'SYNCED';
      doc.tax_calculation_status = 'COMMITTED';
      doc.audit_trail.push({
        action: 'TAX_RECONCILIATION_RETRY_SUCCESS',
        timestamp: new Date(),
        note: `Idempotent provider reconciliation succeeded on retry with ${providerName}`
      });
      await doc.save();

      successCount++;
      results.push({
        document_number: doc.document_number,
        status: 'SUCCESS',
        provider: providerName
      });
    } catch (err) {
      failCount++;
      doc.tax_retry_count = (doc.tax_retry_count || 0) + 1;
      const isMaxRetries = doc.tax_retry_count >= 5;
      doc.tax_reconciliation_status = isMaxRetries ? 'FAILED_PERMANENT' : 'PENDING_RETRY';
      doc.audit_trail.push({
        action: 'TAX_RECONCILIATION_RETRY_FAILED',
        timestamp: new Date(),
        note: `Retry attempt #${doc.tax_retry_count} failed (${err.message}). Status: ${doc.tax_reconciliation_status}`
      });
      try {
        await doc.save();
      } catch (saveErr) {
        console.warn('[usTaxReconciliationService] Warning saving failed retry document state:', saveErr.message);
      }

      results.push({
        document_number: doc.document_number,
        status: 'FAILED',
        error: err.message,
        retry_count: doc.tax_retry_count,
        final_status: doc.tax_reconciliation_status
      });
    }
  }

  return {
    total_pending: pendingDocs.length,
    retried_success: successCount,
    retried_failed: failCount,
    results
  };
}

module.exports = {
  reconcileDocumentsToSubledger,
  reconcileSubledgerToGl,
  reconcileReturnToPayments,
  retryPendingProviderReconciliations
};
