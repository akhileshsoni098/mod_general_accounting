const mongoose = require('mongoose');

const FiscalPeriodSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    period_name: {
      type: String,
      required: true,
      trim: true // e.g. "2026-07"
    },
    fiscal_year: {
      type: Number,
      required: true // e.g. 2026
    },
    period_number: {
      type: Number,
      required: true,
      min: 1,
      max: 13 // 1..12 + optional adjustment period
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

FiscalPeriodSchema.index({ tenant_id: 1, period_name: 1 }, { unique: true });
FiscalPeriodSchema.index({ tenant_id: 1, start_date: 1, end_date: 1 });

module.exports = mongoose.model('FiscalPeriod', FiscalPeriodSchema);
