const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  TaxReturn,
  TaxReturnPeriod,
  TaxLiabilityEntry,
  TaxRegistration
} = require('../models');

/**
 * Service for preparing, reviewing, approving, and recording filing for US Tax Returns.
 */

async function prepareDraftReturn({
  tenantId,
  companyId,
  returnPeriodId,
  schemaVersion = 'US-GENERIC-V1',
  userId = null
}) {
  if (!tenantId || !companyId || !returnPeriodId) {
    throw new Error('tenantId, companyId, and returnPeriodId are required');
  }

  const period = await TaxReturnPeriod.findOne({
    _id: returnPeriodId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!period) {
    throw new Error(`Tax return period not found: ${returnPeriodId}`);
  }

  // Check if a return already exists for this period that is already FILED
  const filedReturn = await TaxReturn.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    return_period_id: period._id,
    status: 'FILED'
  });
  if (filedReturn) {
    throw new Error(`FILED_RETURN_IMMUTABLE: Tax return ${filedReturn.return_number} for period ${period.period_label} is already FILED and immutable. File an AMENDED return if adjustments are required.`);
  }

  // Find all posted liability subledger entries within this period's date boundary & jurisdiction
  const entries = await TaxLiabilityEntry.find({
    tenant_id: tenantId,
    company_id: companyId,
    jurisdiction_code: period.jurisdiction_code,
    status: 'POSTED',
    tax_transaction_date: {
      $gte: period.period_start_date,
      $lte: period.period_end_date
    }
  });

  let grossSalesBn = new BigNumber(0);
  let taxableSalesBn = new BigNumber(0);
  let exemptSalesBn = new BigNumber(0);
  let taxCollectedBn = new BigNumber(0);
  let adjustmentsBn = new BigNumber(0);
  let netLiabilityBn = new BigNumber(0);
  const sourceEntryIds = [];

  for (const e of entries) {
    sourceEntryIds.push(e._id);
    const taxAmtBn = new BigNumber(e.tax_amount || 0);
    const taxableBaseBn = new BigNumber(e.taxable_base_amount || 0);

    if (e.entry_type === 'TAX_COLLECTED_SALES') {
      taxableSalesBn = taxableSalesBn.plus(taxableBaseBn);
      taxCollectedBn = taxCollectedBn.plus(taxAmtBn);
      netLiabilityBn = netLiabilityBn.plus(taxAmtBn);
    } else if (e.entry_type === 'SALES_RETURN_REVERSAL' || e.entry_type === 'ENTRY_REVERSAL') {
      adjustmentsBn = adjustmentsBn.plus(taxAmtBn); // Will be negative or reducing
      netLiabilityBn = netLiabilityBn.plus(taxAmtBn);
    } else if (e.entry_type === 'PURCHASE_USE_TAX') {
      taxCollectedBn = taxCollectedBn.plus(taxAmtBn);
      netLiabilityBn = netLiabilityBn.plus(taxAmtBn);
    } else if (e.entry_type === 'TAX_ADJUSTMENT') {
      adjustmentsBn = adjustmentsBn.plus(taxAmtBn);
      netLiabilityBn = netLiabilityBn.plus(taxAmtBn);
    }
  }

  grossSalesBn = taxableSalesBn.plus(exemptSalesBn);
  const netTaxBn = taxCollectedBn.plus(adjustmentsBn);

  const returnNumber = `TR-${period.jurisdiction_code}-${period.period_label}-${Date.now().toString().slice(-4)}`;

  // Find existing draft or prepared return for this period to update or create
  let taxReturn = await TaxReturn.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    return_period_id: period._id,
    status: { $in: ['DRAFT', 'PREPARED', 'REVIEW_REQUIRED'] }
  });

  if (!taxReturn) {
    taxReturn = new TaxReturn({
      tenant_id: tenantId,
      company_id: companyId,
      return_number: returnNumber,
      jurisdiction_id: period.jurisdiction_id,
      jurisdiction_code: period.jurisdiction_code,
      tax_type: period.tax_type,
      tax_registration_id: period.tax_registration_id,
      return_period_id: period._id,
      period_label: period.period_label,
      schema_version: schemaVersion,
      gross_sales_amount: grossSalesBn.toFixed(2),
      taxable_sales_amount: taxableSalesBn.toFixed(2),
      exempt_sales_amount: exemptSalesBn.toFixed(2),
      tax_collected_amount: taxCollectedBn.toFixed(2),
      adjustments_amount: adjustmentsBn.toFixed(2),
      net_tax_liability_amount: netTaxBn.toFixed(2),
      payments_applied_amount: '0.00',
      balance_due_amount: netTaxBn.toFixed(2),
      credit_carryforward_amount: '0.00',
      status: 'PREPARED',
      source_entry_ids: sourceEntryIds,
      audit_trail: [
        {
          action: 'PREPARED',
          user_id: userId,
          timestamp: new Date(),
          note: `Prepared return from ${entries.length} liability subledger entries`
        }
      ]
    });
  } else {
    // If not locked/approved, recalculate figures
    taxReturn.gross_sales_amount = grossSalesBn.toFixed(2);
    taxReturn.taxable_sales_amount = taxableSalesBn.toFixed(2);
    taxReturn.exempt_sales_amount = exemptSalesBn.toFixed(2);
    taxReturn.tax_collected_amount = taxCollectedBn.toFixed(2);
    taxReturn.adjustments_amount = adjustmentsBn.toFixed(2);
    taxReturn.net_tax_liability_amount = netTaxBn.toFixed(2);

    const paymentsAppliedBn = new BigNumber(taxReturn.payments_applied_amount || 0);
    const balDueBn = netTaxBn.minus(paymentsAppliedBn);
    taxReturn.balance_due_amount = balDueBn.isPositive() ? balDueBn.toFixed(2) : '0.00';
    taxReturn.credit_carryforward_amount = balDueBn.isNegative() ? balDueBn.abs().toFixed(2) : '0.00';
    taxReturn.source_entry_ids = sourceEntryIds;
    taxReturn.status = 'PREPARED';
    taxReturn.audit_trail.push({
      action: 'RECALCULATED',
      user_id: userId,
      timestamp: new Date(),
      note: `Updated prepared return from ${entries.length} liability subledger entries`
    });
  }

  await taxReturn.save();

  // Link subledger entries to this return
  await TaxLiabilityEntry.updateMany(
    { _id: { $in: sourceEntryIds } },
    { $set: { return_id: taxReturn._id, return_period_id: period._id } }
  );

  return taxReturn;
}

/**
 * State machine for lifecycle transitions of tax returns.
 */
async function transitionReturnStatus(arg1, arg2, arg3, arg4) {
  let tenantId, companyId, returnId, newStatus, userId, notes, externalReference, externalFiledAt, filingMethod, verificationStatus, filingNotes;

  if (typeof arg1 === 'object' && arg1 !== null && !arg2) {
    ({
      tenantId,
      companyId,
      returnId,
      newStatus,
      userId = null,
      notes = '',
      externalReference = '',
      externalFiledAt = null,
      filingMethod = 'RECORDED_EXTERNAL',
      verificationStatus = 'SELF_CERTIFIED',
      filingNotes = ''
    } = arg1);
  } else {
    returnId = arg1;
    newStatus = arg2;
    const opts = arg3 || {};
    const ctx = arg4 || {};
    tenantId = ctx.tenantId;
    companyId = ctx.companyId;
    userId = ctx.userId;
    notes = opts.notes || '';
    externalReference = opts.filingConfirmationReference || opts.externalReference || '';
    externalFiledAt = opts.externalFiledAt || null;
    filingMethod = opts.filingMethod || opts.filing_method || 'RECORDED_EXTERNAL';
    verificationStatus = opts.verificationStatus || opts.verification_status || 'SELF_CERTIFIED';
    filingNotes = opts.filingNotes || opts.filing_notes || '';
  }

  const query = { _id: returnId };
  if (tenantId) query.tenant_id = tenantId;
  if (companyId) query.company_id = companyId;

  const taxReturn = await TaxReturn.findOne(query);

  if (!taxReturn) {
    throw new Error(`Tax return not found: ${returnId}`);
  }

  const cur = taxReturn.status;
  const allowed = {
    DRAFT: ['PREPARED', 'CANCELLED'],
    PREPARED: ['REVIEW_REQUIRED', 'APPROVED', 'DRAFT', 'CANCELLED'],
    REVIEW_REQUIRED: ['APPROVED', 'DRAFT', 'CANCELLED'],
    APPROVED: ['FILED', 'CANCELLED'],
    FILED: ['AMENDED'],
    AMENDED: [],
    CANCELLED: []
  };

  if (!allowed[cur] || !allowed[cur].includes(newStatus)) {
    throw new Error(`ILLEGAL_RETURN_TRANSITION: Cannot transition tax return from "${cur}" to "${newStatus}".`);
  }

  if (newStatus === 'FILED') {
    if (!externalReference && !taxReturn.external_filing_reference) {
      throw new Error('FILING_REFERENCE_REQUIRED: An external state filing confirmation reference number is required to mark a return FILED.');
    }
    taxReturn.external_filing_reference = externalReference || taxReturn.external_filing_reference;
    taxReturn.external_filed_at = externalFiledAt ? new Date(externalFiledAt) : new Date();
    taxReturn.filed_by_user_id = userId;
    taxReturn.filing_method = filingMethod || 'RECORDED_EXTERNAL';
    taxReturn.filing_verification_status = verificationStatus || 'SELF_CERTIFIED';
    taxReturn.filing_notes = filingNotes || 'User-recorded external filing confirmation reference (no automated electronic filing claimed).';
  }

  if (newStatus === 'APPROVED') {
    taxReturn.approved_by_user_id = userId;
    taxReturn.approved_at = new Date();
  }

  if (newStatus === 'REVIEW_REQUIRED') {
    taxReturn.reviewed_by_user_id = userId;
    taxReturn.reviewed_at = new Date();
    if (notes) taxReturn.review_notes = notes;
  }

  taxReturn.status = newStatus;
  const auditNote = newStatus === 'FILED'
    ? `${notes || 'Return marked FILED'}. Method: ${taxReturn.filing_method}, Ref: ${taxReturn.external_filing_reference}`
    : (notes || `Status changed from ${cur} to ${newStatus}`);

  taxReturn.audit_trail.push({
    action: `STATUS_${newStatus}`,
    user_id: userId,
    timestamp: new Date(),
    note: auditNote
  });
  taxReturn.row_version = (taxReturn.row_version || 1) + 1;

  await taxReturn.save();
  return taxReturn;
}

async function listReturns({
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

  const [returns, totalCount] = await Promise.all([
    TaxReturn.find(query)
      .populate('return_period_id', 'period_label period_start_date period_end_date status')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    TaxReturn.countDocuments(query)
  ]);

  return {
    returns,
    pagination: {
      page: p,
      limit: l,
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / l)
    }
  };
}

async function getReturnById({ tenantId, companyId, returnId }) {
  const ret = await TaxReturn.findOne({
    _id: returnId,
    tenant_id: tenantId,
    company_id: companyId
  }).populate('source_entry_ids');

  if (!ret) {
    throw new Error(`Tax return not found: ${returnId}`);
  }
  return ret;
}

module.exports = {
  prepareDraftReturn,
  prepareTaxReturn: prepareDraftReturn,
  transitionReturnStatus,
  listReturns,
  getReturnById
};
