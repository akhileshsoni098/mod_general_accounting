const mongoose = require('mongoose');

const DunningPlanSchema = new mongoose.Schema(
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
    grace_period_days: {
      type: Number,
      default: 5
    },
    cancellation_notice_days: {
      type: Number,
      default: 10
    },
    final_cancellation_days: {
      type: Number,
      default: 30
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'dunning_plans'
  }
);

DunningPlanSchema.index({ tenant_id: 1, plan_code: 1 }, { unique: true });

module.exports = mongoose.model('DunningPlan', DunningPlanSchema);
