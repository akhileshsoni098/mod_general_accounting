const mongoose = require('mongoose');

const CashReconciliationMatchSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    bank_statement_line_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankStatementLine',
      required: true,
      index: true
    },
    processor_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProcessorTransaction',
      required: true,
      index: true
    },
    match_type: {
      type: String,
      enum: ['AUTO', 'MANUAL'],
      default: 'AUTO'
    },
    matched_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    matched_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    match_date: {
      type: Date,
      default: Date.now
    },
    confidence_score: {
      type: Number,
      default: 1.0
    },
    unmatch_reason: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'UNMATCHED'],
      default: 'ACTIVE',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'cash_reconciliation_matches'
  }
);

CashReconciliationMatchSchema.index({ tenant_id: 1, bank_statement_line_id: 1, processor_transaction_id: 1 }, { unique: true });

module.exports = mongoose.model('CashReconciliationMatch', CashReconciliationMatchSchema);
