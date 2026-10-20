const mongoose = require('mongoose');

const PaymentMandateSchema = new mongoose.Schema(
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
    mandate_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    method_type: {
      type: String,
      enum: ['ACH', 'CREDIT_CARD', 'CHECK_LOCKBOX', 'WIRE'],
      required: true
    },
    provider: {
      type: String,
      default: 'SIMULATED_PROVIDER'
    },
    external_mandate_token: {
      type: String,
      required: true
    },
    masked_details: {
      type: String, // e.g. "ACH •••• 9912 (Wells Fargo Checking)"
      required: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'REVOKED'],
      default: 'ACTIVE',
      index: true
    },
    authorized_at: {
      type: Date,
      default: Date.now
    },
    revoked_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'payment_mandates'
  }
);

PaymentMandateSchema.index({ tenant_id: 1, mandate_code: 1 }, { unique: true });

module.exports = mongoose.model('PaymentMandate', PaymentMandateSchema);
