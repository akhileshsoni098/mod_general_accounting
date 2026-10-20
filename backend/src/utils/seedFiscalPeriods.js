const { FiscalPeriod } = require('../models');

async function seedFiscalPeriods(tenantId, year = 2026, options = {}) {
  const periods = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = m < 10 ? `0${m}` : `${m}`;
    const periodName = `${year}-${monthStr}`;
    const startDate = new Date(Date.UTC(year, m - 1, 1));
    const endDate = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    const doc = await FiscalPeriod.findOneAndUpdate(
      { tenant_id: tenantId, period_name: periodName },
      {
        fiscal_year: year,
        period_number: m,
        start_date: startDate,
        end_date: endDate,
        status: 'OPEN'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
    );
    periods.push(doc);
  }
  return periods;
}

async function seedCompanyFiscalPeriods(tenantId, companyId, year = 2026, startMonth = 4, options = {}) {
  const periods = [];
  for (let i = 0; i < 12; i++) {
    const monthZeroIndexed = (startMonth - 1 + i) % 12;
    const m = monthZeroIndexed + 1;
    const calYear = (startMonth - 1 + i) >= 12 ? year + 1 : year;
    const monthStr = m < 10 ? `0${m}` : `${m}`;
    const periodName = `${calYear}-${monthStr}`;
    const startDate = new Date(Date.UTC(calYear, monthZeroIndexed, 1));
    const endDate = new Date(Date.UTC(calYear, monthZeroIndexed + 1, 0, 23, 59, 59, 999));

    const doc = await FiscalPeriod.findOneAndUpdate(
      { tenant_id: tenantId, company_id: companyId, period_name: periodName },
      {
        fiscal_year: year,
        period_number: i + 1,
        start_date: startDate,
        end_date: endDate,
        status: 'OPEN'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
    );
    periods.push(doc);
  }
  return periods;
}

module.exports = {
  seedFiscalPeriods,
  seedCompanyFiscalPeriods
};
