const mongoose = require('mongoose');
const { TaxReturnPeriod, TaxJurisdiction, TaxRegistration } = require('../models');

/**
 * Service for managing US Tax Return Periods (separate from accounting periods).
 */

async function createReturnPeriod({
  tenantId,
  companyId,
  jurisdictionCode,
  taxType = 'SALES_USE_TAX',
  periodStartDate,
  periodEndDate,
  periodLabel,
  filingFrequency = 'MONTHLY',
  schemaVersion = 'US-GENERIC-V1',
  dueDate = null,
  dueDateSource = 'MANUAL_OR_CONFIGURATION',
  userId = null
}) {
  if (!tenantId || !companyId) {
    throw new Error('tenantId and companyId are required');
  }
  if (!jurisdictionCode) {
    throw new Error('jurisdictionCode is required');
  }
  if (!periodStartDate || !periodEndDate) {
    throw new Error('periodStartDate and periodEndDate are required');
  }

  const start = new Date(periodStartDate);
  const end = new Date(periodEndDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid period start or end date format');
  }
  if (start >= end) {
    throw new Error('periodStartDate must precede periodEndDate');
  }

  const normJurisdiction = String(jurisdictionCode).toUpperCase().trim();
  const label = periodLabel || `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;

  // Check for duplicate period
  const duplicate = await TaxReturnPeriod.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    jurisdiction_code: normJurisdiction,
    tax_type: taxType,
    period_start_date: start,
    period_end_date: end
  });

  if (duplicate) {
    const err = new Error(
      `DUPLICATE_PERIOD: A tax return period for ${normJurisdiction} (${taxType}) from ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]} already exists.`
    );
    err.code = 'DUPLICATE_PERIOD';
    throw err;
  }

  // Lookup registration if exists
  const reg = await TaxRegistration.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    tax_type: taxType,
    registration_status: 'ACTIVE'
  });

  const period = new TaxReturnPeriod({
    tenant_id: tenantId,
    company_id: companyId,
    jurisdiction_id: reg ? reg.jurisdiction_id : null,
    jurisdiction_code: normJurisdiction,
    tax_type: taxType,
    tax_registration_id: reg ? reg._id : null,
    period_start_date: start,
    period_end_date: end,
    period_label: label,
    filing_frequency: filingFrequency,
    schema_version: schemaVersion,
    status: 'OPEN',
    due_date: dueDate ? new Date(dueDate) : null,
    due_date_source: dueDateSource,
    audit_trail: [
      {
        action: 'CREATED',
        user_id: userId,
        timestamp: new Date(),
        note: `Created tax return period "${label}" for ${normJurisdiction}`
      }
    ]
  });

  await period.save();
  return period;
}

async function listReturnPeriods({
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

  const [periods, totalCount] = await Promise.all([
    TaxReturnPeriod.find(query)
      .sort({ period_start_date: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    TaxReturnPeriod.countDocuments(query)
  ]);

  return {
    periods,
    pagination: {
      page: p,
      limit: l,
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / l)
    }
  };
}

async function getReturnPeriodById({ tenantId, companyId, periodId }) {
  const period = await TaxReturnPeriod.findOne({
    _id: periodId,
    tenant_id: tenantId,
    company_id: companyId
  });
  if (!period) {
    throw new Error(`Tax return period not found: ${periodId}`);
  }
  return period;
}

async function closeReturnPeriod({ tenantId, companyId, periodId, userId = null }) {
  const period = await getReturnPeriodById({ tenantId, companyId, periodId });
  period.status = 'CLOSED';
  period.audit_trail.push({
    action: 'CLOSED',
    user_id: userId,
    timestamp: new Date(),
    note: `Tax return period ${period.period_label} marked CLOSED`
  });
  period.row_version = (period.row_version || 1) + 1;
  await period.save();
  return period;
}

module.exports = {
  createReturnPeriod,
  listReturnPeriods,
  getReturnPeriodById,
  closeReturnPeriod
};
