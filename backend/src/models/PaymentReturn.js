const mongoose = require('mongoose');

const PaymentReturnSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    billing_payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true
    },
    processor_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProcessorTransaction',
      default: null
    },
    return_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    return_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    fee_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('35.00') // NSF Return Fee default
    },
    return_code: {
      type: String,
      required: true // e.g. "R01" (Insufficient Funds), "R08" (Payment Stopped)
    },
    reason_description: {
      type: String,
      default: 'ACH Dishonor / Insufficient Funds'
    },
    return_date: {
      type: Date,
      default: Date.now
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    status: {
      type: String,
      enum: ['SETTLED', 'DISPUTED', 'PENDING'],
      default: 'SETTLED',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'payment_returns'
  }
);

PaymentReturnSchema.index({ tenant_id: 1, return_number: 1 }, { unique: true });

module.exports = mongoose.model('PaymentReturn', PaymentReturnSchema);
