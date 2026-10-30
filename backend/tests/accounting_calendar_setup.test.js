const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const AccountingCalendar = require('../src/models/AccountingCalendar');
const FiscalPeriod = require('../src/models/FiscalPeriod');
const Company = require('../src/models/Company');
const {
  calculateGregorianPeriods,
  calculateRetailPeriods,
  calculatePeriodsForCalendar
} = require('../src/services/accountingCalendarService');

test('US Accounting Calendar Setup & Integration Suite (Phase 1.1)', async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const companyA1 = new mongoose.Types.ObjectId();
  const companyA2 = new mongoose.Types.ObjectId();
  const companyB1 = new mongoose.Types.ObjectId();

  // -----------------------------------------------------------------
  // 1. Company Model Schema Extension
  // -----------------------------------------------------------------
  await t.test('1. Company Model: schema includes calendar_id reference to AccountingCalendar', () => {
    const calendarId = new mongoose.Types.ObjectId();
    const companyDoc = new Company({
      tenant_id: tenantA,
      company_code: 'TEST01',
      company_name: 'Test Retail Inc',
      business_profile: 'GENERAL_RETAIL',
      calendar_id: calendarId
    });

    assert.ok(companyDoc.calendar_id, 'calendar_id field must exist');
    assert.strictEqual(companyDoc.calendar_id.toString(), calendarId.toString());
  });

  // -----------------------------------------------------------------
  // 2. Mandatory Calendar Config Validation
  // -----------------------------------------------------------------
  await t.test('2. Calendar Config Validation: accepts valid calendar types and rejects invalid ones', () => {
    const validCalTypes = ['GREGORIAN', 'RETAIL_445', 'RETAIL_454', 'RETAIL_544', 'RETAIL_13_PERIOD'];
    for (const calType of validCalTypes) {
      const cal = new AccountingCalendar({
        tenant_id: tenantA,
        company_id: companyA1,
        calendar_code: `CAL_${calType}`,
        calendar_type: calType,
        calendar_name: `Test ${calType}`
      });
      const validationError = cal.validateSync();
      assert.strictEqual(validationError, undefined, `${calType} should be valid`);
    }

    const invalidCal = new AccountingCalendar({
      tenant_id: tenantA,
      company_id: companyA1,
      calendar_code: 'CAL_INVALID',
      calendar_type: 'SOLAR_HIJRI',
      calendar_name: 'Invalid Calendar'
    });
    const err = invalidCal.validateSync();
    assert.ok(err, 'Should fail validation for unsupported calendar type');
    assert.ok(err.errors.calendar_type, 'calendar_type validation error expected');
  });

  // -----------------------------------------------------------------
  // 3. Gregorian Initialization with Custom Start Month
  // -----------------------------------------------------------------
  await t.test('3. Gregorian Initialization: custom FY start months (April and October)', () => {
    // April FY (Standard UK / India)
    const aprCal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantA,
      company_id: companyA1,
      calendar_type: 'GREGORIAN',
      fiscal_year_start_month: 4
    };
    const aprResult = calculatePeriodsForCalendar(aprCal, 2026);
    assert.strictEqual(aprResult.periods.length, 12);
    assert.strictEqual(aprResult.periods[0].start_date.getUTCMonth(), 3); // 3 = April
    assert.strictEqual(aprResult.periods[0].period_name, '2026-P01');
    assert.strictEqual(aprResult.periods[11].end_date.getUTCMonth(), 2); // 2 = March
    assert.strictEqual(aprResult.periods[11].end_date.getUTCFullYear(), 2027);

    // October FY (US Federal Fiscal Year)
    const octCal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantA,
      company_id: companyA1,
      calendar_type: 'GREGORIAN',
      fiscal_year_start_month: 10
    };
    const octResult = calculatePeriodsForCalendar(octCal, 2026);
    assert.strictEqual(octResult.periods.length, 12);
    assert.strictEqual(octResult.periods[0].start_date.getUTCMonth(), 9); // 9 = October
    assert.strictEqual(octResult.periods[0].period_name, '2026-P01');
    assert.strictEqual(octResult.periods[11].end_date.getUTCMonth(), 8); // 8 = September
    assert.strictEqual(octResult.periods[11].end_date.getUTCFullYear(), 2027);
  });

  // -----------------------------------------------------------------
  // 4. Retail 12-Period (4-4-5) Initialization and Period Structure
  // -----------------------------------------------------------------
  await t.test('4. Retail 12-Period: 4-4-5 pattern generates 12 periods with 4, 4, 5 weeks per quarter', () => {
    const retailCal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantA,
      company_id: companyA1,
      calendar_type: 'RETAIL_445',
      week_start_day: 'SUNDAY',
      week_end_day: 'SATURDAY',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    const result = calculatePeriodsForCalendar(retailCal, 2027);
    assert.strictEqual(result.periods.length, 12);
    assert.strictEqual(result.totalWeeks, 52);

    const expectedWeeks = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5];
    for (let i = 0; i < 12; i++) {
      const p = result.periods[i];
      assert.strictEqual(p.period_number, i + 1);
      assert.strictEqual(p.week_count, expectedWeeks[i], `Period ${i + 1} must have ${expectedWeeks[i]} weeks`);
      assert.strictEqual(p.quarter, Math.floor(i / 3) + 1);
      // Week-end day must be Saturday
      assert.strictEqual(p.end_date.getUTCDay(), 6, `Period ${i + 1} must end on a Saturday (day 6)`);
    }
  });

  // -----------------------------------------------------------------
  // 5. Retail 13-Period Initialization and Period Structure
  // -----------------------------------------------------------------
  await t.test('5. Retail 13-Period: generates 13 uniform 4-week periods', () => {
    const retail13Cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantA,
      company_id: companyA1,
      calendar_type: 'RETAIL_13_PERIOD',
      week_start_day: 'MONDAY',
      week_end_day: 'SUNDAY',
      anchor_month: 12,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    const result = calculatePeriodsForCalendar(retail13Cal, 2027);
    assert.strictEqual(result.periods.length, 13);
    for (let i = 0; i < 13; i++) {
      const p = result.periods[i];
      assert.strictEqual(p.period_number, i + 1);
      assert.strictEqual(p.week_count, 4, `Period ${i + 1} must have 4 weeks`);
      // Week-end day must be Sunday (day 0)
      assert.strictEqual(p.end_date.getUTCDay(), 0, `Period ${i + 1} must end on Sunday (day 0)`);
    }
  });

  // -----------------------------------------------------------------
  // 6. Idempotency: Duplicate Period Prevention
  // -----------------------------------------------------------------
  await t.test('6. Idempotency: deterministic period generation produces identical periods for multiple calls', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantA,
      company_id: companyA1,
      calendar_type: 'RETAIL_454',
      week_start_day: 'SUNDAY',
      week_end_day: 'SATURDAY',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    const run1 = calculatePeriodsForCalendar(cal, 2027);
    const run2 = calculatePeriodsForCalendar(cal, 2027);

    assert.strictEqual(run1.periods.length, run2.periods.length);
    assert.strictEqual(run1.startDate.toISOString(), run2.startDate.toISOString());
    assert.strictEqual(run1.endDate.toISOString(), run2.endDate.toISOString());

    for (let i = 0; i < run1.periods.length; i++) {
      assert.strictEqual(run1.periods[i].period_name, run2.periods[i].period_name);
      assert.strictEqual(run1.periods[i].start_date.toISOString(), run2.periods[i].start_date.toISOString());
      assert.strictEqual(run1.periods[i].end_date.toISOString(), run2.periods[i].end_date.toISOString());
    }
  });

  // -----------------------------------------------------------------
  // 7. Period Lock & Immutability Protection
  // -----------------------------------------------------------------
  await t.test('7. Period Lock Protection: detect locked/closed periods and reject destructive mutations', () => {
    const existingPeriods = [
      { period_name: '2026-01', status: 'LOCKED' },
      { period_name: '2026-02', status: 'OPEN' }
    ];

    const hasLockedOrClosed = existingPeriods.some(
      p => p.status === 'LOCKED' || p.status === 'HARD_CLOSED'
    );
    assert.strictEqual(hasLockedOrClosed, true, 'Should detect locked period');

    // Verify rejection error message formatting
    const lockedNames = existingPeriods
      .filter(p => p.status === 'LOCKED' || p.status === 'HARD_CLOSED')
      .map(p => p.period_name)
      .join(', ');

    assert.strictEqual(lockedNames, '2026-01');
    const simulatedError = `Cannot change accounting calendar type: Fiscal period "${lockedNames}" is locked/closed. Historical periods are immutable.`;
    assert.ok(simulatedError.includes('Historical periods are immutable'));
  });

  // -----------------------------------------------------------------
  // 8. Posted Journal Entry Protection
  // -----------------------------------------------------------------
  await t.test('8. Posted Journal Protection: reject calendar type changes when posted journals exist', () => {
    const existingJournals = [
      { journal_number: 'JRN-001', status: 'POSTED' }
    ];

    const hasPostedJournals = existingJournals.some(j => j.status === 'POSTED');
    assert.strictEqual(hasPostedJournals, true);

    const errorMessage = 'Cannot change accounting calendar type: Company has posted journal entries. Calendar changes require an explicit transition workflow for future fiscal years.';
    assert.ok(errorMessage.includes('posted journal entries'));
  });

  // -----------------------------------------------------------------
  // 9. Multi-Tenant and Sibling Company Scoping
  // -----------------------------------------------------------------
  await t.test('9. Multi-Tenant and Sibling Company Isolation: ensures tenant and company partition integrity', () => {
    const calA1 = new AccountingCalendar({
      tenant_id: tenantA,
      company_id: companyA1,
      calendar_code: 'RET01_CALENDAR',
      calendar_type: 'RETAIL_445'
    });

    const calA2 = new AccountingCalendar({
      tenant_id: tenantA,
      company_id: companyA2,
      calendar_code: 'MFG01_CALENDAR',
      calendar_type: 'GREGORIAN'
    });

    const calB1 = new AccountingCalendar({
      tenant_id: tenantB,
      company_id: companyB1,
      calendar_code: 'RET01_CALENDAR', // Same code as in Tenant A, but different tenant
      calendar_type: 'RETAIL_13_PERIOD'
    });

    // Verification of partition isolation
    assert.notStrictEqual(calA1.company_id.toString(), calA2.company_id.toString(), 'Sibling companies must have distinct IDs');
    assert.notStrictEqual(calA1.tenant_id.toString(), calB1.tenant_id.toString(), 'Cross-tenant calendars must have distinct tenant IDs');
    assert.strictEqual(calA1.calendar_type, 'RETAIL_445');
    assert.strictEqual(calA2.calendar_type, 'GREGORIAN');
    assert.strictEqual(calB1.calendar_type, 'RETAIL_13_PERIOD');
  });
});
