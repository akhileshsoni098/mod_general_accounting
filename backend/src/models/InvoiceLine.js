const mongoose = require('mongoose');

const InvoiceLineSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true
    },
    line_number: {
      type: Number,
      required: true
    },
    line_type: {
      type: String,
      enum: ['PREMIUM', 'FEE', 'TAX', 'SURCHARGE', 'ADJUSTMENT'],
      required: true
    },
    description: {
      type: String,
      required: true
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    ledger_account_code: {
      type: String,
      required: true // e.g. 2200 for UPR/Premium, 4100 for Policy Fee
    }
  },
  {
    timestamps: true,
    collection: 'invoice_lines'
  }
);

InvoiceLineSchema.index({ tenant_id: 1, invoice_id: 1, line_number: 1 }, { unique: true });

module.exports = mongoose.model('InvoiceLine', InvoiceLineSchema);
