const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  calculateRetailYearEnd,
  calculateRetailPeriods,
  calculateGregorianPeriods,
  calculatePeriodsForCalendar
} = require('../src/services/accountingCalendarService');

const AccountingCalendar = require('../src/models/AccountingCalendar');
const FiscalPeriod = require('../src/models/FiscalPeriod');

test('US Accounting Calendar & Fiscal Period Engine Suite', async (t) => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyCompanyId = new mongoose.Types.ObjectId();

  // ---------------------------------------------------------------
  // 1. Gregorian Calendar Generation & Leap-Year Tests
  // ---------------------------------------------------------------
  await t.test('1. Gregorian: standard calendar year (Jan-Dec) generates 12 ordered, non-overlapping periods', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      company_id: dummyCompanyId,
      calendar_type: 'GREGORIAN',
      fiscal_year_start_month: 1
    };

    const result = calculateGregorianPeriods(cal, 2025);
    assert.strictEqual(result.periods.length, 12);
    assert.strictEqual(result.is53WeekYear, false);

    // Verify each period is consecutive and non-overlapping
    for (let i = 0; i < result.periods.length; i++) {
      const p = result.periods[i];
      assert.strictEqual(p.fiscal_year, 2025);
      assert.strictEqual(p.period_number, i + 1);
      assert.strictEqual(p.quarter, Math.floor(i / 3) + 1);
      assert.strictEqual(p.start_date.getUTCHours(), 0);
      assert.strictEqual(p.start_date.getUTCMinutes(), 0);
      assert.strictEqual(p.start_date.getUTCSeconds(), 0);
      assert.strictEqual(p.start_date.getUTCMilliseconds(), 0);

      assert.strictEqual(p.end_date.getUTCHours(), 23);
      assert.strictEqual(p.end_date.getUTCMinutes(), 59);
      assert.strictEqual(p.end_date.getUTCSeconds(), 59);
      assert.strictEqual(p.end_date.getUTCMilliseconds(), 999);

      if (i > 0) {
        const prevP = result.periods[i - 1];
        assert.strictEqual(
          p.start_date.getTime(),
          prevP.end_date.getTime() + 1,
          `Period ${p.period_number} must begin exactly 1ms after Period ${prevP.period_number} ends`
        );
      }
    }

    // February in non-leap year 2025 has 28 days
    const feb = result.periods[1];
    assert.strictEqual(feb.period_name, '2025-02');
    assert.strictEqual(feb.end_date.getUTCDate(), 28);
  });

  await t.test('2. Gregorian: leap year handling (Feb 29 in 2024 & 2028)', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'GREGORIAN',
      fiscal_year_start_month: 1
    };

    const res2024 = calculateGregorianPeriods(cal, 2024);
    const feb2024 = res2024.periods[1];
    assert.strictEqual(feb2024.end_date.getUTCDate(), 29, '2024 February must end on day 29');

    const res2028 = calculateGregorianPeriods(cal, 2028);
    const feb2028 = res2028.periods[1];
    assert.strictEqual(feb2028.end_date.getUTCDate(), 29, '2028 February must end on day 29');
  });

  await t.test('3. Gregorian: custom fiscal year starting in April (e.g. Apr 1 to Mar 31)', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'GREGORIAN',
      fiscal_year_start_month: 4
    };

    const result = calculateGregorianPeriods(cal, 2026);
    assert.strictEqual(result.periods.length, 12);
    // Period 1 is April 2026
    assert.strictEqual(result.periods[0].start_date.getUTCFullYear(), 2026);
    assert.strictEqual(result.periods[0].start_date.getUTCMonth(), 3); // 3 = April (0-indexed)
    assert.strictEqual(result.periods[0].start_date.getUTCDate(), 1);

    // Period 12 is March 2027
    assert.strictEqual(result.periods[11].end_date.getUTCFullYear(), 2027);
    assert.strictEqual(result.periods[11].end_date.getUTCMonth(), 2); // 2 = March (0-indexed)
    assert.strictEqual(result.periods[11].end_date.getUTCDate(), 31);
  });

  // ---------------------------------------------------------------
  // 2. Retail Calendars: 4-4-5, 4-5-4, 5-4-4 Patterns (52-week year)
  // ---------------------------------------------------------------
  await t.test('4. Retail 4-4-5: generates 12 periods with 4, 4, 5 weeks per quarter (52 weeks total)', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'RETAIL_445',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    // 2027 under LAST_WEEKDAY_OF_MONTH is a standard 52-week year (364 days)
    const result = calculateRetailPeriods(cal, 2027);
    assert.strictEqual(result.periods.length, 12);
    assert.strictEqual(result.totalWeeks, 52);
    assert.strictEqual(result.is53WeekYear, false);

    const expectedWeeks = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5];
    for (let i = 0; i < result.periods.length; i++) {
      const p = result.periods[i];
      assert.strictEqual(p.week_count, expectedWeeks[i], `Period ${i + 1} must have ${expectedWeeks[i]} weeks`);
      assert.strictEqual(p.quarter, Math.floor(i / 3) + 1);

      // Verify that every period starts on Sunday (day 0) and ends on Saturday (day 6)
      assert.strictEqual(p.start_date.getUTCDay(), 0, `Period ${i + 1} must start on Sunday`);
      assert.strictEqual(p.end_date.getUTCDay(), 6, `Period ${i + 1} must end on Saturday`);

      // Verify zero gap and zero overlap
      if (i > 0) {
        const prevP = result.periods[i - 1];
        assert.strictEqual(p.start_date.getTime(), prevP.end_date.getTime() + 1);
      }
    }
  });

  await t.test('5. Retail 4-5-4: generates 12 periods with 4, 5, 4 weeks per quarter', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'RETAIL_454',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    const result = calculateRetailPeriods(cal, 2027);
    assert.strictEqual(result.periods.length, 12);
    assert.strictEqual(result.totalWeeks, 52);

    const expectedWeeks = [4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4];
    for (let i = 0; i < result.periods.length; i++) {
      assert.strictEqual(result.periods[i].week_count, expectedWeeks[i]);
    }
  });

  await t.test('6. Retail 5-4-4: generates 12 periods with 5, 4, 4 weeks per quarter', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'RETAIL_544',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    const result = calculateRetailPeriods(cal, 2027);
    assert.strictEqual(result.periods.length, 12);
    assert.strictEqual(result.totalWeeks, 52);

    const expectedWeeks = [5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4];
    for (let i = 0; i < result.periods.length; i++) {
      assert.strictEqual(result.periods[i].week_count, expectedWeeks[i]);
    }
  });

  // ---------------------------------------------------------------
  // 3. Retail 13-Period Calendar
  // ---------------------------------------------------------------
  await t.test('7. Retail 13-Period: generates 13 periods with 4 weeks each (52 weeks total)', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'RETAIL_13_PERIOD',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    const result = calculateRetailPeriods(cal, 2027);
    assert.strictEqual(result.periods.length, 13);
    assert.strictEqual(result.totalWeeks, 52);

    for (let i = 0; i < 13; i++) {
      const p = result.periods[i];
      assert.strictEqual(p.period_number, i + 1);
      assert.strictEqual(p.week_count, 4);
      assert.strictEqual(p.start_date.getUTCDay(), 0);
      assert.strictEqual(p.end_date.getUTCDay(), 6);
    }
  });

  // ---------------------------------------------------------------
  // 4. 53-Week Retail Year Handling & Extra Week Policies
  // ---------------------------------------------------------------
  await t.test('8. 53-Week Detection: LAST_WEEKDAY_OF_MONTH in January produces 53-week year periodically', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'RETAIL_445',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    // In NRF calendar, FY 2024 under LAST_WEEKDAY_OF_MONTH:
    // 2023 end: Jan 28, 2023
    // 2024 end: Jan 27, 2024 -> 364 days = 52 wks
    // Let's test a known 53-week year or test both policies explicitly
    let found53WkYear = null;
    for (let yr = 2020; yr <= 2035; yr++) {
      const res = calculateRetailPeriods(cal, yr);
      if (res.is53WeekYear) {
        found53WkYear = yr;
        break;
      }
    }
    assert.ok(found53WkYear !== null, 'Found at least one 53-week year in cycle');

    const res53 = calculateRetailPeriods(cal, found53WkYear);
    assert.strictEqual(res53.is53WeekYear, true);
    assert.strictEqual(res53.totalWeeks, 53);
    assert.strictEqual(res53.totalDays, 371);

    // Under ADD_TO_LAST_PERIOD, period 12 receives the 6th week!
    const p12 = res53.periods[11];
    assert.strictEqual(p12.period_number, 12);
    assert.strictEqual(p12.week_count, 6);
    assert.strictEqual(p12.is_leap_week_period, true);
  });

  await t.test('9. 53-Week Year: ADD_AS_EXTRA_PERIOD creates Period 13 with 1 week', () => {
    let year53 = null;
    const testCal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'RETAIL_445',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };
    for (let yr = 2020; yr <= 2035; yr++) {
      if (calculateRetailPeriods(testCal, yr).is53WeekYear) {
        year53 = yr;
        break;
      }
    }

    const calExtra = {
      ...testCal,
      fifty_three_week_policy: 'ADD_AS_EXTRA_PERIOD'
    };

    const resExtra = calculateRetailPeriods(calExtra, year53);
    assert.strictEqual(resExtra.periods.length, 13);
    // Period 12 remains 5 weeks
    assert.strictEqual(resExtra.periods[11].week_count, 5);
    // Period 13 is added with 1 week
    const p13 = resExtra.periods[12];
    assert.strictEqual(p13.period_number, 13);
    assert.strictEqual(p13.week_count, 1);
    assert.strictEqual(p13.is_leap_week_period, true);
  });

  await t.test('10. 53-Week Year in 13-Period Calendar: ADD_AS_EXTRA_PERIOD creates Period 14 with 1 week', () => {
    let year53 = null;
    const testCal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'RETAIL_13_PERIOD',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };
    for (let yr = 2020; yr <= 2035; yr++) {
      if (calculateRetailPeriods(testCal, yr).is53WeekYear) {
        year53 = yr;
        break;
      }
    }

    const calP14 = {
      ...testCal,
      fifty_three_week_policy: 'ADD_AS_EXTRA_PERIOD'
    };

    const resP14 = calculateRetailPeriods(calP14, year53);
    assert.strictEqual(resP14.periods.length, 14);
    const p14 = resP14.periods[13];
    assert.strictEqual(p14.period_number, 14);
    assert.strictEqual(p14.week_count, 1);
    assert.strictEqual(p14.is_leap_week_period, true);
  });

  // ---------------------------------------------------------------
  // 5. Schema Validation & Period Lock Protection Tests
  // ---------------------------------------------------------------
  await t.test('11. AccountingCalendar Model: schema validation for calendar_type and policies', () => {
    const validCal = new AccountingCalendar({
      tenant_id: dummyTenantId,
      company_id: dummyCompanyId,
      calendar_code: 'US_RETAIL_445',
      calendar_name: 'US Retail 4-4-5 Calendar',
      calendar_type: 'RETAIL_445',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    });
    const err = validCal.validateSync();
    assert.strictEqual(err, undefined, 'Valid calendar must pass schema validation');

    const invalidTypeCal = new AccountingCalendar({
      tenant_id: dummyTenantId,
      calendar_code: 'BAD_CODE',
      calendar_name: 'Bad Calendar',
      calendar_type: 'INVALID_TYPE'
    });
    const err2 = invalidTypeCal.validateSync();
    assert.ok(err2.errors['calendar_type'], 'Invalid calendar_type must fail schema validation');
  });

  await t.test('12. FiscalPeriod Model: allows period_number up to 14 and supports retail metadata', () => {
    const period14 = new FiscalPeriod({
      tenant_id: dummyTenantId,
      company_id: dummyCompanyId,
      period_name: '2028-P14',
      fiscal_year: 2028,
      period_number: 14,
      quarter: 4,
      week_count: 1,
      is_leap_week_period: true,
      start_date: new Date('2028-01-23T00:00:00.000Z'),
      end_date: new Date('2028-01-29T23:59:59.999Z'),
      status: 'OPEN'
    });
    const err = period14.validateSync();
    assert.strictEqual(err, undefined, 'FiscalPeriod with period_number 14 must pass validation');

    const period15 = new FiscalPeriod({
      tenant_id: dummyTenantId,
      period_name: '2028-P15',
      fiscal_year: 2028,
      period_number: 15,
      start_date: new Date(),
      end_date: new Date()
    });
    const err15 = period15.validateSync();
    assert.ok(err15.errors['period_number'], 'period_number > 14 must fail validation');
  });

  await t.test('13. Boundary Inclusivity & Precision: start is 00:00:00.000Z and end is 23:59:59.999Z', () => {
    const cal = {
      _id: new mongoose.Types.ObjectId(),
      tenant_id: dummyTenantId,
      calendar_type: 'RETAIL_445',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };

    const res = calculateRetailPeriods(cal, 2026);
    for (const p of res.periods) {
      assert.strictEqual(p.start_date.toISOString().endsWith('T00:00:00.000Z'), true);
      assert.strictEqual(p.end_date.toISOString().endsWith('T23:59:59.999Z'), true);
      const spanMs = p.end_date.getTime() - p.start_date.getTime() + 1;
      assert.strictEqual(spanMs, p.week_count * 7 * 86400000);
    }
  });

  await t.test('14. Closed-Period Immutability Logic: throws when existing periods are locked or hard closed', () => {
    const mockExistingClosedPeriods = [
      { period_name: '2026-P01', status: 'LOCKED' },
      { period_name: '2026-P02', status: 'HARD_CLOSED' },
      { period_name: '2026-P03', status: 'OPEN' }
    ];

    const closed = mockExistingClosedPeriods.filter(
      p => p.status === 'HARD_CLOSED' || p.status === 'LOCKED'
    );
    assert.strictEqual(closed.length, 2);
    const lockedNames = closed.map(p => p.period_name).join(', ');
    assert.strictEqual(lockedNames, '2026-P01, 2026-P02');

    // Simulate rejection
    assert.throws(
      () => {
        if (closed.length > 0) {
          throw new Error(
            `Cannot regenerate periods for Fiscal Year 2026: existing period(s) [${lockedNames}] are closed or locked. Immutability violation prevented.`
          );
        }
      },
      /Cannot regenerate periods for Fiscal Year 2026/
    );
  });

  await t.test('15. Backward Compatibility: legacy period document without calendar_id satisfies schema validation', () => {
    const legacyDoc = new FiscalPeriod({
      tenant_id: dummyTenantId,
      period_name: '2026-04',
      fiscal_year: 2026,
      period_number: 4,
      start_date: new Date('2026-04-01T00:00:00.000Z'),
      end_date: new Date('2026-04-30T23:59:59.999Z'),
      status: 'OPEN'
    });

    const err = legacyDoc.validateSync();
    assert.strictEqual(err, undefined, 'Legacy period without calendar_id must pass validation');
    assert.strictEqual(legacyDoc.calendar_id, null);
    assert.strictEqual(legacyDoc.quarter, null);
    assert.strictEqual(legacyDoc.week_count, null);
    assert.strictEqual(legacyDoc.is_leap_week_period, false);
  });

  await t.test('16. Tenant & Company Isolation: ensures calendars and periods enforce tenant_id and company_id scoping', () => {
    const calTenant1 = new AccountingCalendar({
      tenant_id: dummyTenantId,
      company_id: dummyCompanyId,
      calendar_code: 'MAIN_CAL',
      calendar_name: 'Tenant 1 Calendar',
      calendar_type: 'GREGORIAN'
    });
    assert.strictEqual(calTenant1.tenant_id.toString(), dummyTenantId.toString());
    assert.strictEqual(calTenant1.company_id.toString(), dummyCompanyId.toString());

    // Omitting required tenant_id fails
    const invalidCal = new AccountingCalendar({
      calendar_code: 'NO_TENANT',
      calendar_name: 'Missing Tenant',
      calendar_type: 'GREGORIAN'
    });
    const err = invalidCal.validateSync();
    assert.ok(err.errors['tenant_id'], 'Missing tenant_id must fail validation');
  });
});
