const mongoose = require('mongoose');

const SettlementLineSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    statement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SettlementStatement',
      required: true,
      index: true
    },
    line_number: {
      type: Number,
      required: true
    },
    line_type: {
      type: String,
      enum: ['GROSS_PREMIUM', 'COMMISSION_WITHHELD', 'CLAIMS_OFFSET', 'ADJUSTMENT'],
      required: true
    },
    source_entity_type: {
      type: String,
      default: 'POLICY_TRANSACTION'
    },
    source_entity_id: {
      type: String,
      required: true // e.g. "POL-TX-8821" or "COMM-2026-00001"
    },
    description: {
      type: String,
      required: true
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true // Positive for gross, negative for withhold/claims offset
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'settlement_lines'
  }
);

SettlementLineSchema.index({ tenant_id: 1, statement_id: 1, line_number: 1 }, { unique: true });
SettlementLineSchema.index({ tenant_id: 1, statement_id: 1, source_entity_id: 1, line_type: 1 }, { unique: true });

module.exports = mongoose.model('SettlementLine', SettlementLineSchema);
