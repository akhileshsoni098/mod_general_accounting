const { AccountingCalendar, FiscalPeriod } = require('../models');

const DAY_MAP = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6
};

/**
 * Find the last occurrence of a specific weekday in a given year and month (1-indexed month)
 */
function getLastWeekdayOfMonth(year, month, targetDayOfWeek) {
  // Day 0 of month+1 is the last day of month
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastDayOfWeek = lastDayDate.getUTCDay();
  
  let diff = lastDayOfWeek - targetDayOfWeek;
  if (diff < 0) {
    diff += 7;
  }
  
  const targetDate = new Date(Date.UTC(year, month - 1, lastDayDate.getUTCDate() - diff, 23, 59, 59, 999));
  return targetDate;
}

/**
 * Find the closest occurrence of a specific weekday to the calendar end of a given month
 */
function getClosestWeekdayToMonthEnd(year, month, targetDayOfWeek) {
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastDayOfWeek = lastDayDate.getUTCDay();
  
  let diff = targetDayOfWeek - lastDayOfWeek;
  if (diff > 3) diff -= 7;
  if (diff < -3) diff += 7;
  
  const closestDate = new Date(Date.UTC(year, month - 1, lastDayDate.getUTCDate() + diff, 23, 59, 59, 999));
  return closestDate;
}

/**
 * Calculate the exact fiscal year end date for retail calendars
 */
function calculateRetailYearEnd(year, anchorMonth, yearEndRule, weekEndDay) {
  const targetDay = DAY_MAP[weekEndDay] !== undefined ? DAY_MAP[weekEndDay] : 6; // Default Saturday
  
  if (yearEndRule === 'CLOSEST_WEEKDAY_TO_MONTH_END') {
    return getClosestWeekdayToMonthEnd(year, anchorMonth, targetDay);
  }
  // Default to LAST_WEEKDAY_OF_MONTH
  return getLastWeekdayOfMonth(year, anchorMonth, targetDay);
}

/**
 * Calculate retail periods (4-4-5, 4-5-4, 5-4-4, 13-Period)
 */
function calculateRetailPeriods(calendar, fiscalYear) {
  const anchorMonth = calendar.anchor_month || 1;
  const yearEndRule = calendar.year_end_rule || 'LAST_WEEKDAY_OF_MONTH';
  const weekEndDay = calendar.week_end_day || 'SATURDAY';
  const fiftyThreeWeekPolicy = calendar.fifty_three_week_policy || 'ADD_TO_LAST_PERIOD';

  // Compute fiscal year end and previous fiscal year end
  // In NRF convention, FY 2026 with anchor month 1 ends around Jan 31 of 2026 (or 2027 depending on start_year vs end_year)
  // We use fiscalYear as the anchor year directly
  const currentEnd = calculateRetailYearEnd(fiscalYear, anchorMonth, yearEndRule, weekEndDay);
  const previousEnd = calculateRetailYearEnd(fiscalYear - 1, anchorMonth, yearEndRule, weekEndDay);
  
  // Fiscal year start is previous end + 1ms (Start of next day)
  const currentStart = new Date(previousEnd.getTime() + 1);

  // Total days and weeks
  const totalMs = currentEnd.getTime() - currentStart.getTime() + 1;
  const totalDays = Math.round(totalMs / 86400000);
  const totalWeeks = Math.round(totalDays / 7);

  const is53WeekYear = totalWeeks >= 53;

  // Determine quarter week pattern based on calendar_type
  let quarterPatterns = [];
  if (calendar.calendar_type === 'RETAIL_445') {
    quarterPatterns = [
      [4, 4, 5],
      [4, 4, 5],
      [4, 4, 5],
      [4, 4, 5]
    ];
  } else if (calendar.calendar_type === 'RETAIL_454') {
    quarterPatterns = [
      [4, 5, 4],
      [4, 5, 4],
      [4, 5, 4],
      [4, 5, 4]
    ];
  } else if (calendar.calendar_type === 'RETAIL_544') {
    quarterPatterns = [
      [5, 4, 4],
      [5, 4, 4],
      [5, 4, 4],
      [5, 4, 4]
    ];
  } else if (calendar.calendar_type === 'RETAIL_13_PERIOD') {
    quarterPatterns = [
      [4, 4, 4],
      [4, 4, 4],
      [4, 4, 4],
      [4, 4, 4, 4] // 13 periods total
    ];
  } else {
    throw new Error(`Unsupported retail calendar type: ${calendar.calendar_type}`);
  }

  // Handle 53-week policy
  let extraPeriod = null;
  if (is53WeekYear) {
    if (fiftyThreeWeekPolicy === 'ADD_TO_LAST_PERIOD') {
      if (calendar.calendar_type === 'RETAIL_13_PERIOD') {
        quarterPatterns[3][3] += 1; // Period 13 gets 5th week
      } else {
        quarterPatterns[3][2] += 1; // Period 12 gets extra week (e.g. 6 weeks in 4-4-5)
      }
    } else if (fiftyThreeWeekPolicy === 'ADD_TO_PERIOD_13' || fiftyThreeWeekPolicy === 'ADD_AS_EXTRA_PERIOD') {
      if (calendar.calendar_type === 'RETAIL_13_PERIOD') {
        extraPeriod = {
          period_number: 14,
          week_count: 1,
          quarter: 4,
          is_leap_week_period: true
        };
      } else {
        extraPeriod = {
          period_number: 13,
          week_count: 1,
          quarter: 4,
          is_leap_week_period: true
        };
      }
    }
  }

  // Generate periods sequentially
  const periods = [];
  let periodCounter = 1;
  let cursorTime = currentStart.getTime();

  for (let q = 0; q < quarterPatterns.length; q++) {
    const qWeeks = quarterPatterns[q];
    for (let p = 0; p < qWeeks.length; p++) {
      const weeks = qWeeks[p];
      const pStartDate = new Date(cursorTime);
      const pEndTime = cursorTime + (weeks * 7 * 86400000) - 1;
      const pEndDate = new Date(pEndTime);

      const periodNumberStr = periodCounter < 10 ? `0${periodCounter}` : `${periodCounter}`;
      const periodName = `${fiscalYear}-P${periodNumberStr}`;

      const isLeapPeriod = is53WeekYear && fiftyThreeWeekPolicy === 'ADD_TO_LAST_PERIOD' && 
        ((calendar.calendar_type === 'RETAIL_13_PERIOD' && periodCounter === 13) ||
         (calendar.calendar_type !== 'RETAIL_13_PERIOD' && periodCounter === 12));

      periods.push({
        calendar_id: calendar._id,
        tenant_id: calendar.tenant_id,
        company_id: calendar.company_id || null,
        period_name: periodName,
        fiscal_year: fiscalYear,
        period_number: periodCounter,
        quarter: q + 1,
        week_count: weeks,
        is_leap_week_period: isLeapPeriod,
        is_adjustment_period: false,
        start_date: pStartDate,
        end_date: pEndDate,
        status: 'OPEN',
        accounting_basis: 'GAAP'
      });

      cursorTime = pEndTime + 1;
      periodCounter++;
    }
  }

  if (extraPeriod) {
    const pStartDate = new Date(cursorTime);
    const pEndTime = cursorTime + (extraPeriod.week_count * 7 * 86400000) - 1;
    const pEndDate = new Date(pEndTime);
    const periodNumberStr = extraPeriod.period_number < 10 ? `0${extraPeriod.period_number}` : `${extraPeriod.period_number}`;

    periods.push({
      calendar_id: calendar._id,
      tenant_id: calendar.tenant_id,
      company_id: calendar.company_id || null,
      period_name: `${fiscalYear}-P${periodNumberStr}`,
      fiscal_year: fiscalYear,
      period_number: extraPeriod.period_number,
      quarter: extraPeriod.quarter,
      week_count: extraPeriod.week_count,
      is_leap_week_period: true,
      is_adjustment_period: false,
      start_date: pStartDate,
      end_date: pEndDate,
      status: 'OPEN',
      accounting_basis: 'GAAP'
    });
  }

  return {
    fiscalYear,
    totalWeeks,
    totalDays,
    is53WeekYear,
    startDate: currentStart,
    endDate: currentEnd,
    periods
  };
}

/**
 * Calculate Gregorian calendar periods
 */
function calculateGregorianPeriods(calendar, fiscalYear) {
  const startMonth = calendar.fiscal_year_start_month || 1; // 1 to 12
  const periods = [];

  for (let i = 0; i < 12; i++) {
    const monthZeroIndexed = (startMonth - 1 + i) % 12;
    const m = monthZeroIndexed + 1;
    const calYear = (startMonth - 1 + i) >= 12 ? fiscalYear + 1 : fiscalYear;
    const monthStr = m < 10 ? `0${m}` : `${m}`;
    const periodNumber = i + 1;
    const periodNumberStr = periodNumber < 10 ? `0${periodNumber}` : `${periodNumber}`;
    
    // Period name format e.g. "2026-07" or if non-calendar year "2026-P01"
    const periodName = startMonth === 1 ? `${calYear}-${monthStr}` : `${fiscalYear}-P${periodNumberStr}`;
    
    const startDate = new Date(Date.UTC(calYear, monthZeroIndexed, 1, 0, 0, 0, 0));
    // Day 0 of next month is the exact last day of the month at 23:59:59.999Z
    const endDate = new Date(Date.UTC(calYear, monthZeroIndexed + 1, 0, 23, 59, 59, 999));

    const quarter = Math.floor(i / 3) + 1;

    periods.push({
      calendar_id: calendar._id,
      tenant_id: calendar.tenant_id,
      company_id: calendar.company_id || null,
      period_name: periodName,
      fiscal_year: fiscalYear,
      period_number: periodNumber,
      quarter,
      week_count: null,
      is_leap_week_period: false,
      is_adjustment_period: false,
      start_date: startDate,
      end_date: endDate,
      status: 'OPEN',
      accounting_basis: 'GAAP'
    });
  }

  const startDate = periods[0].start_date;
  const endDate = periods[periods.length - 1].end_date;

  return {
    fiscalYear,
    totalWeeks: 52,
    totalDays: Math.round((endDate.getTime() - startDate.getTime() + 1) / 86400000),
    is53WeekYear: false,
    startDate,
    endDate,
    periods
  };
}

/**
 * Generate period calculation for any calendar definition
 */
function calculatePeriodsForCalendar(calendar, fiscalYear) {
  if (!calendar) throw new Error('AccountingCalendar object is required');
  if (!fiscalYear || isNaN(Number(fiscalYear))) throw new Error('Valid fiscalYear is required');

  const year = Number(fiscalYear);

  if (calendar.calendar_type === 'GREGORIAN') {
    return calculateGregorianPeriods(calendar, year);
  } else {
    return calculateRetailPeriods(calendar, year);
  }
}

/**
 * Persist generated periods to the database safely
 * Respects period-close locks: Never overwrites or modifies HARD_CLOSED or LOCKED periods!
 */
async function generateAndSavePeriods(calendarId, fiscalYear, options = {}) {
  const { session, tenantId, companyId, dryRun = false } = options;

  const calQuery = { _id: calendarId };
  if (tenantId) calQuery.tenant_id = tenantId;
  if (companyId) calQuery.company_id = companyId;

  const calendar = await AccountingCalendar.findOne(calQuery);
  if (!calendar) {
    throw new Error(`Accounting calendar not found or access denied: ${calendarId}`);
  }

  const calculation = calculatePeriodsForCalendar(calendar, fiscalYear);

  if (dryRun) {
    return calculation;
  }

  // Check existing periods for this calendar and year
  const existingPeriodsQuery = {
    tenant_id: calendar.tenant_id,
    fiscal_year: fiscalYear
  };
  if (calendar.company_id) {
    existingPeriodsQuery.company_id = calendar.company_id;
  }
  // Check either by calendar_id or existing matching period_names
  existingPeriodsQuery.$or = [
    { calendar_id: calendar._id },
    { period_name: { $in: calculation.periods.map(p => p.period_name) } }
  ];

  let q = FiscalPeriod.find(existingPeriodsQuery);
  if (session) q = q.session(session);
  const existingPeriods = await q;

  // Protect closed periods
  const closedPeriods = existingPeriods.filter(
    p => p.status === 'HARD_CLOSED' || p.status === 'LOCKED'
  );
  if (closedPeriods.length > 0) {
    const lockedNames = closedPeriods.map(p => p.period_name).join(', ');
    throw new Error(
      `Cannot regenerate periods for Fiscal Year ${fiscalYear}: existing period(s) [${lockedNames}] are closed or locked. Immutability violation prevented.`
    );
  }

  const savedPeriods = [];
  for (const periodData of calculation.periods) {
    const matchQuery = {
      tenant_id: calendar.tenant_id,
      company_id: calendar.company_id || null,
      period_name: periodData.period_name
    };

    const updateDoc = {
      calendar_id: calendar._id,
      fiscal_year: periodData.fiscal_year,
      period_number: periodData.period_number,
      quarter: periodData.quarter,
      week_count: periodData.week_count,
      is_leap_week_period: periodData.is_leap_week_period,
      is_adjustment_period: periodData.is_adjustment_period,
      start_date: periodData.start_date,
      end_date: periodData.end_date,
      status: periodData.status || 'OPEN',
      accounting_basis: periodData.accounting_basis || 'GAAP'
    };

    const saved = await FiscalPeriod.findOneAndUpdate(
      matchQuery,
      { $set: updateDoc },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        session
      }
    );
    savedPeriods.push(saved);
  }

  return {
    calendar,
    fiscalYear,
    totalPeriods: savedPeriods.length,
    is53WeekYear: calculation.is53WeekYear,
    startDate: calculation.startDate,
    endDate: calculation.endDate,
    periods: savedPeriods
  };
}

/**
 * Find the active FiscalPeriod encompassing a transaction date
 */
async function findPeriodForDate(tenantId, companyId, transactionDate, calendarId = null, session = null) {
  const pDate = new Date(transactionDate);
  const query = {
    tenant_id: tenantId,
    start_date: { $lte: pDate },
    end_date: { $gte: pDate }
  };

  if (companyId) {
    query.company_id = companyId;
  }
  if (calendarId) {
    query.calendar_id = calendarId;
  }

  let pQ = FiscalPeriod.findOne(query);
  if (session) pQ = pQ.session(session);
  return await pQ;
}

module.exports = {
  calculateRetailYearEnd,
  calculateRetailPeriods,
  calculateGregorianPeriods,
  calculatePeriodsForCalendar,
  generateAndSavePeriods,
  findPeriodForDate
};
