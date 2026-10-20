const mongoose = require('mongoose');

const CommissionScheduleSchema = new mongoose.Schema(
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
      uppercase: true // e.g. "SCH-SUMMIT-20", "SCH-HARBOR-10"
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
    business_type: {
      type: String,
      enum: ['NEW', 'RENEWAL', 'ENDORSEMENT', 'CANCELLATION', 'ALL'],
      default: 'NEW'
    },
    line_of_business: {
      type: String,
      default: 'COMMERCIAL_AUTO'
    },
    state_jurisdiction: {
      type: String,
      default: 'TX' // or "ALL"
    },
    calculation_basis: {
      type: String,
      enum: ['WRITTEN_PREMIUM', 'COLLECTED_PREMIUM', 'NET_PREMIUM'],
      default: 'WRITTEN_PREMIUM'
    },
    calculation_mode: {
      type: String,
      enum: ['PERCENTAGE', 'FLAT', 'COMBINED'],
      default: 'PERCENTAGE'
    },
    rate_percentage: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    flat_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    priority: {
      type: Number,
      default: 10
    },
    effective_from: {
      type: Date,
      required: true
    },
    effective_to: {
      type: Date,
      default: null
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'commission_schedules'
  }
);

CommissionScheduleSchema.index({ tenant_id: 1, agreement_id: 1, schedule_code: 1 }, { unique: true });

module.exports = mongoose.model('CommissionSchedule', CommissionScheduleSchema);
