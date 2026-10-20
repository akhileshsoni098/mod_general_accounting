const mongoose = require('mongoose');

const PostingRuleLineSchema = new mongoose.Schema(
  {
    posting_rule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PostingRule',
      required: true,
      index: true
    },
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true
    },
    line_number: {
      type: Number,
      required: true
    },
    line_key: {
      type: String,
      trim: true,
      default: null // e.g. "DR_PREMIUM_RECEIVABLE"
    },
    ledger_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null
    },
    account_code: {
      type: String,
      required: true,
      trim: true // e.g. "1100", "2200", "4100"
    },
    direction: {
      type: String,
      required: true,
      enum: ['DEBIT', 'CREDIT'],
      uppercase: true
    },
    amount_expression: {
      type: String,
      default: null // e.g. "payload.premium_amount + payload.fee_amount", "payload.tax_rate * payload.gross"
    },
    amount_field: {
      type: String,
      default: null // legacy fallback e.g. "gross_premium"
    },
    amount_ast: {
      type: mongoose.Schema.Types.Mixed,
      default: null // structured safe AST
    },
    rounding_mode: {
      type: String,
      enum: ['ROUND_HALF_UP', 'ROUND_DOWN', 'ROUND_UP'],
      default: 'ROUND_HALF_UP'
    },
    currency_expression: {
      type: String,
      default: 'USD'
    },
    dimension_mappings: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    description_template: {
      type: String,
      default: '' // e.g. "Invoice {{payload.invoice_number}} premium receivable"
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'posting_rule_lines'
  }
);

PostingRuleLineSchema.index({ posting_rule_id: 1, line_number: 1 }, { unique: true });

module.exports = mongoose.model('PostingRuleLine', PostingRuleLineSchema);
