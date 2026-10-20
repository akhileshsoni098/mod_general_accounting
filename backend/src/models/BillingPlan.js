const mongoose = require('mongoose');

const BillingPlanSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    plan_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    plan_name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    installment_count: {
      type: Number,
      required: true,
      min: 1
    },
    down_payment_pct: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: mongoose.Types.Decimal128.fromString('100.00')
    },
    installment_fee: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    interval_months: {
      type: Number,
      default: 1 // 1 for monthly, 3 for quarterly
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true
    },
    effective_from: {
      type: Date,
      default: Date.now
    },
    effective_to: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'billing_plans'
  }
);

BillingPlanSchema.index({ tenant_id: 1, plan_code: 1 }, { unique: true });

module.exports = mongoose.model('BillingPlan', BillingPlanSchema);
