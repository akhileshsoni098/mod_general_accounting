const mongoose = require('mongoose');

const UnappliedCashSchema = new mongoose.Schema(
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
      default: null,
      index: true
    },
    billing_payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true
    },
    unapplied_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    original_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    remaining_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    suspense_account_code: {
      type: String,
      default: '2190' // Unapplied Cash Suspense Account
    },
    status: {
      type: String,
      enum: ['OPEN', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'REFUNDED'],
      default: 'OPEN',
      index: true
    },
    receipt_date: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'unapplied_cash'
  }
);

UnappliedCashSchema.index({ tenant_id: 1, unapplied_number: 1 }, { unique: true });

module.exports = mongoose.model('UnappliedCash', UnappliedCashSchema);
