const mongoose = require('mongoose');

const CommissionTransactionSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    transaction_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "COMM-2026-00001"
    },
    agreement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionAgreement',
      required: true,
      index: true
    },
    schedule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionSchedule',
      required: true,
      index: true
    },
    source_event_id: {
      type: String,
      required: true,
      trim: true // e.g. "INV-2026-00001" or "POL-TX-8821"
    },
    source_entity_type: {
      type: String,
      required: true,
      enum: ['POLICY', 'INVOICE', 'PAYMENT', 'ENDORSEMENT', 'CANCELLATION'],
      default: 'POLICY'
    },
    policy_reference: {
      type: String,
      default: 'POL-TX-8821',
      trim: true
    },
    payer_party_id: {
      type: String,
      required: true
    },
    payee_party_id: {
      type: String,
      required: true
    },
    transaction_kind: {
      type: String,
      enum: ['EARNED', 'PAYABLE', 'CLAWBACK', 'ADJUSTMENT'],
      default: 'EARNED'
    },
    basis_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true // e.g. 37650.00
    },
    rate_applied: {
      type: mongoose.Schema.Types.Decimal128,
      required: true // e.g. 20.00 or 10.00
    },
    flat_amount_applied: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    calculated_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true // e.g. 7530.00 or 3765.00
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    effective_date: {
      type: Date,
      required: true
    },
    accounting_date: {
      type: Date,
      required: true
    },
    lifecycle_status: {
      type: String,
      enum: ['CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PAYABLE', 'PARTIALLY_PAID', 'PAID', 'REVERSED', 'HELD'],
      default: 'CALCULATED',
      index: true
    },
    schedule_version_snapshot: {
      type: String,
      default: '1.0'
    },
    calculation_basis_snapshot: {
      type: String,
      default: 'WRITTEN_PREMIUM'
    },
    calculation_notes: {
      type: String,
      default: ''
    },
    linked_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    linked_settlement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SettlementStatement',
      default: null
    },
    payment_reference: {
      type: String,
      default: null,
      trim: true
    },
    paid_at: {
      type: Date,
      default: null
    },
    idempotency_key: {
      type: String,
      required: true,
      trim: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'commission_transactions'
  }
);

CommissionTransactionSchema.index({ tenant_id: 1, transaction_number: 1 }, { unique: true });
CommissionTransactionSchema.index({ tenant_id: 1, idempotency_key: 1 }, { unique: true });

module.exports = mongoose.model('CommissionTransaction', CommissionTransactionSchema);
