const mongoose = require('mongoose');

const ProfitCommissionScheduleSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    agreement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionAgreement',
      required: true,
      index: true
    },
    schedule_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "PCS-SUMMIT-2026"
    },
    schedule_name: {
      type: String,
      required: true,
      trim: true
    },
    version: {
      type: String,
      default: '1.0'
    },
    eligibility_period_months: {
      type: Number,
      default: 12
    },
    loss_ratio_threshold_pct: {
      type: mongoose.Schema.Types.Decimal128,
      default: null // null indicates NOT CONFIGURED until authorized user configures it
    },
    contingent_rate_pct: {
      type: mongoose.Schema.Types.Decimal128,
      default: null
    },
    max_profit_commission_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: null
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    effective_from: {
      type: Date,
      required: true
    },
    effective_to: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['NOT_CONFIGURED', 'ACTIVE', 'INACTIVE'],
      default: 'NOT_CONFIGURED'
    },
    description: {
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
    collection: 'profit_commission_schedules'
  }
);

ProfitCommissionScheduleSchema.index({ tenant_id: 1, agreement_id: 1, schedule_code: 1 }, { unique: true });

module.exports = mongoose.model('ProfitCommissionSchedule', ProfitCommissionScheduleSchema);
