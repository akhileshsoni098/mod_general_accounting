const mongoose = require('mongoose');

const JournalEntrySchema = new mongoose.Schema(
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
      default: null,
      index: true
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      required: true,
      index: true
    },
    line_number: {
      type: Number,
      required: true
    },
    ledger_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      required: true,
      index: true
    },
    account_code: {
      type: String,
      required: true,
      trim: true
    },
    debit: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    credit: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    dimensions: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    memo: {
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
    collection: 'journal_entries'
  }
);

JournalEntrySchema.index({ tenant_id: 1, journal_id: 1, line_number: 1 }, { unique: true });
JournalEntrySchema.index({ tenant_id: 1, ledger_account_id: 1 });
JournalEntrySchema.index({ tenant_id: 1, company_id: 1, ledger_account_id: 1 });

module.exports = mongoose.model('JournalEntry', JournalEntrySchema);
