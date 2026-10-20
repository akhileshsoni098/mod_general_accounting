const mongoose = require('mongoose');

const BankStatementLineSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    import_batch_id: {
      type: String,
      required: true,
      index: true
    },
    line_number: {
      type: Number,
      required: true
    },
    booking_date: {
      type: Date,
      required: true,
      index: true
    },
    value_date: {
      type: Date,
      default: null
    },
    bank_account_type: {
      type: String,
      enum: ['FIDUCIARY_TRUST', 'OPERATING'],
      default: 'FIDUCIARY_TRUST'
    },
    bank_account_number: {
      type: String,
      default: 'WF-TX-TRUST-1010'
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    direction: {
      type: String,
      enum: ['CR', 'DR'], // CR = deposit, DR = disbursement
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    bank_description: {
      type: String,
      required: true
    },
    bank_reference: {
      type: String,
      default: ''
    },
    normalized_reference: {
      type: String,
      default: '',
      index: true
    },
    reconciliation_status: {
      type: String,
      enum: ['UNMATCHED', 'MATCHED', 'EXCLUDED'],
      default: 'UNMATCHED',
      index: true
    },
    matched_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    }
  },
  {
    timestamps: true,
    collection: 'bank_statement_lines'
  }
);

BankStatementLineSchema.index({ tenant_id: 1, import_batch_id: 1, line_number: 1 }, { unique: true });

module.exports = mongoose.model('BankStatementLine', BankStatementLineSchema);
