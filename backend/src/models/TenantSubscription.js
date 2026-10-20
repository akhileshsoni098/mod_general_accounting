const mongoose = require('mongoose');

const TenantSubscriptionSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      unique: true,
      index: true
    },
    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true
    },
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED'],
      default: 'TRIAL',
      index: true
    },
    trial_ends_at: {
      type: Date
    },
    current_period_start: {
      type: Date,
      default: Date.now
    },
    current_period_end: {
      type: Date
    },
    grace_period_until: {
      type: Date
    },
    billing_cycle: {
      type: String,
      enum: ['MONTHLY', 'ANNUAL'],
      default: 'MONTHLY'
    },
    payment_provider: {
      type: String,
      enum: ['MANUAL', 'STRIPE', 'RAZORPAY'],
      default: 'MANUAL'
    },
    payment_customer_id: {
      type: String,
      default: ''
    },
    payment_subscription_id: {
      type: String,
      default: ''
    },
    cancelled_at: {
      type: Date
    },
    cancellation_reason: {
      type: String,
      default: ''
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tenant_subscriptions'
  }
);

module.exports = mongoose.model('TenantSubscription', TenantSubscriptionSchema);
