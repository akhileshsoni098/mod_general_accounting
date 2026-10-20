const mongoose = require('mongoose');

const PaymentAttemptSchema = new mongoose.Schema(
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
    mandate_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMandate',
      default: null
    },
    attempt_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    attempt_date: {
      type: Date,
      default: Date.now
    },
    outcome: {
      type: String,
      enum: ['SUCCESS', 'DECLINED', 'INSUFFICIENT_FUNDS', 'GATEWAY_ERROR'],
      required: true
    },
    is_simulated: {
      type: Boolean,
      default: true
    },
    provider_response_code: {
      type: String,
      default: 'SIM_200'
    },
    diagnostic_detail: {
      type: String,
      default: ''
    },
    billing_payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'payment_attempts'
  }
);

PaymentAttemptSchema.index({ tenant_id: 1, attempt_number: 1 }, { unique: true });

module.exports = mongoose.model('PaymentAttempt', PaymentAttemptSchema);
