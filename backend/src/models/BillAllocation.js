const mongoose = require('mongoose');

const BillAllocationSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    payment_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument',
      required: true,
      index: true
    },
    invoice_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument',
      required: true,
      index: true
    },
    allocated_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    allocation_date: {
      type: Date,
      default: Date.now,
      index: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVERSED'],
      default: 'ACTIVE',
      index: true
    },
    reversal_reason: {
      type: String,
      default: ''
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'bill_allocations'
  }
);

BillAllocationSchema.index(
  { tenant_id: 1, company_id: 1, payment_document_id: 1, invoice_document_id: 1 },
  { unique: false }
);
BillAllocationSchema.index({ tenant_id: 1, company_id: 1, invoice_document_id: 1, status: 1 });

module.exports = mongoose.model('BillAllocation', BillAllocationSchema);
