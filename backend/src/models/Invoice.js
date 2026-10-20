const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema(
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
      trim: true,
      index: true
    },
    invoice_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    invoice_date: {
      type: Date,
      required: true,
      default: Date.now
    },
    due_date: {
      type: Date,
      required: true
    },
    installment_number: {
      type: Number,
      default: 1
    },
    total_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    amount_paid: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    balance_due: {
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
      enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'WRITTEN_OFF'],
      default: 'DRAFT',
      index: true
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    voided_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    memo: {
      type: String,
      default: ''
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
    },
    allocation_status: {
      type: String,
      enum: ['UNALLOCATED', 'ALLOCATED'],
      default: 'UNALLOCATED'
    },
    is_allocated: {
      type: Boolean,
      default: false
    },
    allocation_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    allocation_journal_number: {
      type: String,
      default: null
    },
    allocated_carrier_id: {
      type: String,
      default: null
    },
    allocated_carrier_name: {
      type: String,
      default: null
    },
    allocated_broker_id: {
      type: String,
      default: null
    },
    allocated_broker_name: {
      type: String,
      default: null
    },
    allocated_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'invoices'
  }
);

InvoiceSchema.index({ tenant_id: 1, invoice_number: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', InvoiceSchema);
