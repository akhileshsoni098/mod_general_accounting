const { FiscalPeriod } = require('../models');

async function seedFiscalPeriods(tenantId, year = 2026) {
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
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    periods.push(doc);
  }
  return periods;
}

module.exports = {
  seedFiscalPeriods
};
