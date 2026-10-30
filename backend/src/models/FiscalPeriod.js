const mongoose = require('mongoose');

const FiscalPeriodSchema = new mongoose.Schema(
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
    calendar_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountingCalendar',
      default: null,
      index: true
    },
    period_name: {
      type: String,
      required: true,
      trim: true // e.g. "2026-07" or "2026-P01"
    },
    fiscal_year: {
      type: Number,
      required: true // e.g. 2026
    },
    period_number: {
      type: Number,
      required: true,
      min: 1,
      max: 14 // 1..13 + optional retail leap week period 14
    },
    quarter: {
      type: Number,
      min: 1,
      max: 4,
      default: null // 1..4 for retail/reporting quarters
    },
    week_count: {
      type: Number,
      default: null // 4, 5, or 6 weeks for retail calendars
    },
    is_leap_week_period: {
      type: Boolean,
      default: false // True if this period contains the 53rd leap week
    },
    is_adjustment_period: {
      type: Boolean,
      default: false
    },
    start_date: {
      type: Date,
      required: true
    },
    end_date: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['FUTURE', 'OPEN', 'SOFT_CLOSED', 'HARD_CLOSED', 'LOCKED'],
      default: 'OPEN'
    },
    accounting_basis: {
      type: String,
      enum: ['GAAP', 'STATUTORY', 'TAX'],
      default: 'GAAP'
    },
    locked_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    locked_at: {
      type: Date,
      default: null
    },
    close_notes: {
      type: String,
      default: ''
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'fiscal_periods'
  }
);

FiscalPeriodSchema.index({ tenant_id: 1, company_id: 1, period_name: 1 }, { unique: true });
FiscalPeriodSchema.index({ tenant_id: 1, company_id: 1, start_date: 1, end_date: 1 });
FiscalPeriodSchema.index({ tenant_id: 1, company_id: 1, calendar_id: 1, fiscal_year: 1, period_number: 1 });

module.exports = mongoose.model('FiscalPeriod', FiscalPeriodSchema);
