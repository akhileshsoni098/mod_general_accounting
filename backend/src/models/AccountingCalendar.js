const mongoose = require('mongoose');

const AccountingCalendarSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true
    },
    calendar_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "MAIN_GREGORIAN", "RETAIL_445", "RETAIL_13P"
    },
    calendar_name: {
      type: String,
      required: true,
      trim: true // e.g. "US Retail 4-4-5 Calendar"
    },
    calendar_type: {
      type: String,
      required: true,
      enum: [
        'GREGORIAN',
        'RETAIL_445',
        'RETAIL_454',
        'RETAIL_544',
        'RETAIL_13_PERIOD'
      ],
      default: 'GREGORIAN'
    },
    fiscal_year_start_month: {
      type: Number,
      min: 1,
      max: 12,
      default: 1 // 1 = January, 2 = February (standard NRF retail), 4 = April
    },
    week_start_day: {
      type: String,
      enum: ['SUNDAY', 'MONDAY', 'SATURDAY'],
      default: 'SUNDAY'
    },
    week_end_day: {
      type: String,
      enum: ['SATURDAY', 'SUNDAY', 'FRIDAY'],
      default: 'SATURDAY'
    },
    year_end_rule: {
      type: String,
      enum: [
        'LAST_WEEKDAY_OF_MONTH',        // NRF Standard: Last Saturday of the anchor month
        'CLOSEST_WEEKDAY_TO_MONTH_END', // Saturday closest to the last day of the anchor month
        'CALENDAR_MONTH_END'            // Gregorian calendar month-end
      ],
      default: 'CALENDAR_MONTH_END'
    },
    anchor_month: {
      type: Number,
      min: 1,
      max: 12,
      default: 1 // Month anchoring the retail year end (e.g. 1 = January)
    },
    fifty_three_week_policy: {
      type: String,
      enum: [
        'ADD_TO_LAST_PERIOD',    // Week 53 added to Period 12 (or P13 in 13-period)
        'ADD_TO_PERIOD_13',      // Week 53 becomes standalone Period 13 in a 12-period calendar
        'ADD_AS_EXTRA_PERIOD'    // Period 13 in 12-period or Period 14 in 13-period
      ],
      default: 'ADD_TO_LAST_PERIOD'
    },
    is_default: {
      type: Boolean,
      default: false
    },
    is_active: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      default: 'ACTIVE'
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'accounting_calendars'
  }
);

AccountingCalendarSchema.index(
  { tenant_id: 1, company_id: 1, calendar_code: 1 },
  { unique: true }
);

module.exports = mongoose.model('AccountingCalendar', AccountingCalendarSchema);
