const mongoose = require('mongoose');

const BillingAccountPolicySchema = new mongoose.Schema(
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
    policy_id: {
      type: String,
      required: true,
      trim: true
    },
    policy_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    carrier_name: {
      type: String,
      default: ''
    },
    line_of_business: {
      type: String,
      default: 'COMMERCIAL_AUTO'
    },
    effective_date: {
      type: Date,
      required: true
    },
    expiration_date: {
      type: Date,
      required: true
    },
    total_premium: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    total_fees: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    total_taxes: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    status: {
      type: String,
      enum: ['BOUND', 'ACTIVE', 'CANCELLED', 'EXPIRED'],
      default: 'BOUND'
    }
  },
  {
    timestamps: true,
    collection: 'billing_account_policies'
  }
);

BillingAccountPolicySchema.index({ tenant_id: 1, policy_number: 1 });
BillingAccountPolicySchema.index({ tenant_id: 1, billing_account_id: 1, policy_id: 1 }, { unique: true });

module.exports = mongoose.model('BillingAccountPolicy', BillingAccountPolicySchema);
