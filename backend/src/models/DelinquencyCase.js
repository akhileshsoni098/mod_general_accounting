const mongoose = require('mongoose');

const DelinquencyCaseSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    billing_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BillingAccount',
      required: true,
      index: true
    },
    case_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    delinquent_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    current_stage: {
      type: String,
      enum: ['GRACE_PERIOD', 'NOTICE_SENT', 'INTENT_TO_CANCEL', 'CANCELLED_NONPAYMENT', 'REMEDIED'],
      default: 'GRACE_PERIOD',
      index: true
    },
    days_overdue: {
      type: Number,
      default: 0
    },
    dunning_plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DunningPlan',
      default: null
    },
    status: {
      type: String,
      enum: ['OPEN', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true
    },
    opened_date: {
      type: Date,
      default: Date.now
    },
    resolved_date: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'delinquency_cases'
  }
);

DelinquencyCaseSchema.index({ tenant_id: 1, case_number: 1 }, { unique: true });

module.exports = mongoose.model('DelinquencyCase', DelinquencyCaseSchema);
