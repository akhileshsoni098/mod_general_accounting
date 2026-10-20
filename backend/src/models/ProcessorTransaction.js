const mongoose = require('mongoose');

const ProcessorTransactionSchema = new mongoose.Schema(
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
      default: null,
      index: true
    },
    processor_name: {
      type: String,
      default: 'SIMULATED_GATEWAY'
    },
    processor_reference: {
      type: String,
      required: true,
      trim: true
    },
    transaction_type: {
      type: String,
      enum: ['CAPTURE', 'REFUND', 'REVERSAL', 'CHARGEBACK'],
      default: 'CAPTURE'
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    processor_fee: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    net_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    settlement_date: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['SETTLED', 'PENDING', 'FAILED', 'REVERSED'],
      default: 'SETTLED',
      index: true
    },
    reconciliation_status: {
      type: String,
      enum: ['UNMATCHED', 'MATCHED', 'MANUALLY_MATCHED'],
      default: 'UNMATCHED',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'processor_transactions'
  }
);

ProcessorTransactionSchema.index({ tenant_id: 1, processor_name: 1, processor_reference: 1 }, { unique: true });

module.exports = mongoose.model('ProcessorTransaction', ProcessorTransactionSchema);
