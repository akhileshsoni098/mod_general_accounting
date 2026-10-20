const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
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
    payment_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    payment_date: {
      type: Date,
      required: true,
      default: Date.now
    },
    payment_method: {
      type: String,
      enum: ['ACH', 'CREDIT_CARD', 'CHECK', 'WIRE', 'LOCKBOX'],
      required: true
    },
    reference_number: {
      type: String,
      default: ''
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    allocated_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    unapplied_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'RETURNED', 'VOID'],
      default: 'RECEIVED',
      index: true
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    collection: 'payments'
  }
);

PaymentSchema.index({ tenant_id: 1, payment_number: 1 }, { unique: true });

module.exports = mongoose.model('Payment', PaymentSchema);
