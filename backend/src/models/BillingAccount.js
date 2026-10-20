const mongoose = require('mongoose');

const BillingAccountSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    account_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    customer_name: {
      type: String,
      required: true,
      trim: true
    },
    customer_email: {
      type: String,
      trim: true,
      default: ''
    },
    billing_address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postal_code: { type: String, default: '' },
      country: { type: String, default: 'USA' }
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    current_balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    past_due_balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    unapplied_cash: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    default_billing_plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BillingPlan',
      default: null
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'DELINQUENT', 'SUSPENDED', 'CLOSED'],
      default: 'ACTIVE',
      index: true
    },
    carrier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      default: null
    },
    carrier_name: {
      type: String,
      default: null,
      trim: true
    },
    broker_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      default: null
    },
    broker_name: {
      type: String,
      default: null,
      trim: true
    },
    dimensions: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    collection: 'billing_accounts'
  }
);

BillingAccountSchema.index({ tenant_id: 1, account_number: 1 }, { unique: true });

module.exports = mongoose.model('BillingAccount', BillingAccountSchema);
