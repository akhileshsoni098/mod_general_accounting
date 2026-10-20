const mongoose = require('mongoose');

const PaymentAllocationSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true
    },
    installment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InstallmentSchedule',
      default: null
    },
    allocated_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    allocation_date: {
      type: Date,
      default: Date.now
    },
    allocation_type: {
      type: String,
      enum: ['WATERFALL', 'MANUAL_INVOICE', 'MANUAL_LINE'],
      default: 'WATERFALL'
    },
    status: {
      type: String,
      enum: ['APPLIED', 'REVERSED'],
      default: 'APPLIED'
    }
  },
  {
    timestamps: true,
    collection: 'payment_allocations'
  }
);

PaymentAllocationSchema.index({ tenant_id: 1, payment_id: 1, invoice_id: 1 });

module.exports = mongoose.model('PaymentAllocation', PaymentAllocationSchema);
