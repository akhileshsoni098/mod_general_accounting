const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  TaxPaymentRecord,
  TaxReturn,
  TaxReturnPeriod,
  TaxLiabilityEntry,
  LedgerAccount,
  CompanyPostingConfig
} = require('../models');
const journalPostingService = require('./journalPostingService');

/**
 * Service for recording and confirming statutory tax remittances, payments, and credits.
 */

async function recordTaxPayment({
  tenantId,
  companyId,
  returnId = null,
  returnPeriodId = null,
  amount,
  paymentDate = new Date(),
  paymentMethod = 'EFT_WIRE',
  bankAccountId = null,
  bankAccountCode = '1002',
  paymentReference = '',
  confirmationReference = '',
  postToGl = true,
  userId = null,
  session = null
}) {
  if (!tenantId || !companyId) {
    throw new Error('tenantId and companyId are required');
  }

  const amtBn = new BigNumber(amount);
  if (amtBn.isNaN() || !amtBn.isPositive() || amtBn.isZero()) {
    throw new Error('Payment amount must be a positive decimal number greater than 0.');
  }

  let taxReturn = null;
  let period = null;
  let jurisdictionCode = 'US';

  if (returnId) {
    taxReturn = await TaxReturn.findOne({
      _id: returnId,
      tenant_id: tenantId,
      company_id: companyId
    }).session(session);

    if (!taxReturn) {
      throw new Error(`Tax return not found for payment: ${returnId}`);
    }
    jurisdictionCode = taxReturn.jurisdiction_code;
    returnPeriodId = taxReturn.return_period_id;
  } else if (returnPeriodId) {
    period = await TaxReturnPeriod.findOne({
      _id: returnPeriodId,
      tenant_id: tenantId,
      company_id: companyId
    }).session(session);

    if (period) {
      jurisdictionCode = period.jurisdiction_code;
    }
  }

  const paymentNumber = `TXPAY-${jurisdictionCode}-${Date.now().toString().slice(-6)}`;
  const idempotencyKey = `TXPAY-${tenantId}-${companyId}-${returnId || returnPeriodId || 'GENERAL'}-${amtBn.toFixed(2)}-${new Date(paymentDate).toISOString().split('T')[0]}-${paymentReference || 'NONE'}`;

  const existing = await TaxPaymentRecord.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    idempotency_key: idempotencyKey
  }).session(session);

  if (existing) {
    return existing; // Idempotent duplicate return
  }

  // Resolve CompanyPostingConfig for Sales Tax Payable GL account
  let glJournalId = null;
  let resolvedBankCode = bankAccountCode || '1002';
  let resolvedBankId = bankAccountId || null;
  let resolvedLiabilityCode = '2110';

  if (postToGl) {
    const config = await CompanyPostingConfig.findOne({
      tenant_id: tenantId,
      company_id: companyId
    }).session(session);

    // Determine liability account based on tax type
    const isUseTax = taxReturn?.tax_type === 'CONSUMER_USE_TAX' || period?.tax_type === 'CONSUMER_USE_TAX';
    resolvedLiabilityCode = isUseTax
      ? (config?.use_tax_payable_account_code || config?.sales_tax_payable_account_code || '2115')
      : (config?.sales_tax_payable_account_code || '2110');

    // Determine bank account code
    const targetBankCode = bankAccountCode || config?.bank_account_code || '1002';

    // Validate account configurations against LedgerAccount in active DB connection
    if (mongoose.connection.readyState === 1) {
      // 1. Verify Liability Account
      let liabilityAccount = await LedgerAccount.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        account_code: resolvedLiabilityCode
      }).session(session);

      if (!liabilityAccount) {
        liabilityAccount = await LedgerAccount.findOne({
          tenant_id: tenantId,
          company_id: companyId,
          account_type: 'LIABILITY',
          account_code: { $in: ['2110', '2115', '2210', '2101'] }
        }).session(session);
      }

      if (!liabilityAccount) {
        const err = new Error(`MAPPING_REQUIRED: Tax liability account "${resolvedLiabilityCode}" is not mapped or does not exist in Chart of Accounts.`);
        err.statusCode = 400;
        throw err;
      }
      if (liabilityAccount.is_posting_allowed === false || liabilityAccount.status === 'INACTIVE') {
        const err = new Error(`POSTING_DISALLOWED: Tax liability account "${liabilityAccount.account_code}" is inactive or posting is prohibited.`);
        err.statusCode = 400;
        throw err;
      }
      resolvedLiabilityCode = liabilityAccount.account_code;

      // 2. Verify Bank Account
      let bankAccount = null;
      if (bankAccountId) {
        bankAccount = await LedgerAccount.findOne({
          _id: bankAccountId,
          tenant_id: tenantId,
          company_id: companyId
        }).session(session);
      }
      if (!bankAccount) {
        bankAccount = await LedgerAccount.findOne({
          tenant_id: tenantId,
          company_id: companyId,
          account_code: targetBankCode
        }).session(session);
      }

      if (!bankAccount) {
        const err = new Error(`MAPPING_REQUIRED: Bank account "${targetBankCode}" is not mapped or does not exist in Chart of Accounts.`);
        err.statusCode = 400;
        throw err;
      }
      if (bankAccount.is_posting_allowed === false || bankAccount.status === 'INACTIVE') {
        const err = new Error(`POSTING_DISALLOWED: Bank account "${bankAccount.account_code}" is inactive or posting is prohibited.`);
        err.statusCode = 400;
        throw err;
      }
      resolvedBankCode = bankAccount.account_code;
      resolvedBankId = bankAccount._id;
    }

    // Post double-entry journal: Debit Sales Tax Payable, Credit Bank
    const pDate = new Date(paymentDate);
    const postRes = await journalPostingService.postJournalEntry({
      tenantId,
      companyId,
      userId,
      postingDate: pDate,
      sourceModule: 'COMMERCIAL_DOCS',
      referenceId: `TAX_PAYMENT:${paymentNumber}`,
      memo: `Tax remittance for ${jurisdictionCode} (${paymentReference || confirmationReference || 'Remittance'})`,
      currency: 'USD',
      accountingBasis: 'GAAP',
      lines: [
        {
          account_code: resolvedLiabilityCode,
          debit: amtBn.toFixed(2),
          credit: '0.00',
          memo: `Tax liability remittance to ${jurisdictionCode}`
        },
        {
          account_code: resolvedBankCode,
          debit: '0.00',
          credit: amtBn.toFixed(2),
          memo: `Disbursement via ${paymentMethod} (${paymentReference || 'Tax Payment'})`
        }
      ],
      session
    });
    glJournalId = postRes.journal?._id || null;
  }

  const isConfirmed = !!confirmationReference;
  const paymentRecord = new TaxPaymentRecord({
    tenant_id: tenantId,
    company_id: companyId,
    payment_number: paymentNumber,
    jurisdiction_id: taxReturn ? taxReturn.jurisdiction_id : (period ? period.jurisdiction_id : null),
    jurisdiction_code: jurisdictionCode,
    tax_type: taxReturn ? taxReturn.tax_type : 'SALES_USE_TAX',
    return_id: returnId || null,
    return_period_id: returnPeriodId || null,
    payment_date: new Date(paymentDate),
    amount: amtBn.toFixed(2),
    applied_amount: amtBn.toFixed(2),
    unapplied_amount: '0.00',
    currency: 'USD',
    payment_method: paymentMethod,
    bank_account_id: resolvedBankId,
    bank_account_code: resolvedBankCode,
    payment_reference: paymentReference,
    confirmation_reference: confirmationReference,
    status: isConfirmed ? 'CONFIRMED' : 'RECORDED',
    gl_journal_id: glJournalId,
    idempotency_key: idempotencyKey,
    audit_trail: [
      {
        action: 'RECORDED',
        user_id: userId,
        timestamp: new Date(),
        note: `Tax payment of $${amtBn.toFixed(2)} recorded for ${jurisdictionCode}`
      }
    ]
  });

  await paymentRecord.save({ session });

  // Update return balances if linked
  if (taxReturn) {
    const curAppliedBn = new BigNumber(taxReturn.payments_applied_amount || 0);
    const newAppliedBn = curAppliedBn.plus(amtBn);
    taxReturn.payments_applied_amount = newAppliedBn.toFixed(2);

    const netTaxBn = new BigNumber(taxReturn.net_tax_liability_amount || 0);
    const remainingDueBn = netTaxBn.minus(newAppliedBn);

    taxReturn.balance_due_amount = remainingDueBn.isPositive() ? remainingDueBn.toFixed(2) : '0.00';
    taxReturn.credit_carryforward_amount = remainingDueBn.isNegative() ? remainingDueBn.abs().toFixed(2) : '0.00';
    taxReturn.audit_trail.push({
      action: 'PAYMENT_APPLIED',
      user_id: userId,
      timestamp: new Date(),
      note: `Applied tax payment ${paymentNumber} ($${amtBn.toFixed(2)})`
    });
    taxReturn.row_version = (taxReturn.row_version || 1) + 1;
    await taxReturn.save({ session });
  }

  // Also record a subledger entry for this payment (negative liability entry)
  const subledgerEntry = new TaxLiabilityEntry({
    tenant_id: tenantId,
    company_id: companyId,
    jurisdiction_id: paymentRecord.jurisdiction_id,
    jurisdiction_code: jurisdictionCode,
    tax_type: paymentRecord.tax_type,
    source_document_id: null,
    source_document_type: 'TAX_PAYMENT',
    source_document_number: paymentNumber,
    journal_id: glJournalId,
    tax_transaction_date: new Date(paymentDate),
    posting_date: new Date(paymentDate),
    taxable_base_amount: '0.00',
    tax_amount: amtBn.negated().toFixed(2), // Negative to reduce outstanding liability
    currency: 'USD',
    entry_type: 'TAX_PAYMENT',
    idempotency_key: `TLE-${paymentNumber}`,
    status: 'POSTED',
    return_period_id: returnPeriodId,
    return_id: returnId,
    notes: `Tax liability reduction via remittance ${paymentNumber}`,
    audit_trail: [
      {
        action: 'PAYMENT_SUBLEDGER_POSTED',
        user_id: userId,
        timestamp: new Date(),
        note: `Tax payment ${paymentNumber} reduced subledger liability by $${amtBn.toFixed(2)}`
      }
    ]
  });

  await subledgerEntry.save({ session });

  return paymentRecord;
}

async function confirmTaxPayment({
  tenantId,
  companyId,
  paymentId,
  confirmationReference,
  userId = null
}) {
  const payment = await TaxPaymentRecord.findOne({
    _id: paymentId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!payment) {
    throw new Error(`Tax payment not found: ${paymentId}`);
  }
  if (!confirmationReference) {
    throw new Error('confirmationReference is required to confirm tax payment');
  }

  payment.confirmation_reference = confirmationReference;
  payment.status = 'CONFIRMED';
  payment.audit_trail.push({
    action: 'CONFIRMED',
    user_id: userId,
    timestamp: new Date(),
    note: `Tax payment confirmed with external reference: ${confirmationReference}`
  });
  payment.row_version = (payment.row_version || 1) + 1;

  await payment.save();
  return payment;
}

async function listPayments({
  tenantId,
  companyId,
  jurisdictionCode = null,
  status = null,
  page = 1,
  limit = 50
}) {
  const query = { tenant_id: tenantId, company_id: companyId };
  if (jurisdictionCode) {
    query.jurisdiction_code = String(jurisdictionCode).toUpperCase().trim();
  }
  if (status) {
    query.status = status;
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (p - 1) * l;

  const [payments, totalCount] = await Promise.all([
    TaxPaymentRecord.find(query)
      .sort({ payment_date: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    TaxPaymentRecord.countDocuments(query)
  ]);

  return {
    payments,
    pagination: {
      page: p,
      limit: l,
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / l)
    }
  };
}

module.exports = {
  recordTaxPayment,
  confirmTaxPayment,
  listPayments
};
