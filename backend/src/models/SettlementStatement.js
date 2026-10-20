const mongoose = require('mongoose');

const SettlementStatementSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    statement_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "SETTLE-2026-00001"
    },
    carrier_party_id: {
      type: String,
      required: true,
      trim: true // e.g. "CARRIER-SUMMIT"
    },
    carrier_name: {
      type: String,
      required: true,
      trim: true
    },
    fiduciary_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FiduciaryAccount',
      required: true,
      index: true
    },
    period_start: {
      type: Date,
      required: true
    },
    period_end: {
      type: Date,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    gross_eligible_premium: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00') // $37,650.00
    },
    commission_withheld: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00') // $7,530.00 (MGA 20%)
    },
    claims_offset: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00') // $0.00
    },
    other_adjustments: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    net_due_carrier: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00') // $30,120.00
    },
    status: {
      type: String,
      enum: ['DRAFT', 'VALIDATED', 'APPROVED', 'PAYABLE', 'PARTIALLY_PAID', 'PAID', 'DISPUTED', 'VOIDED'],
      default: 'DRAFT',
      index: true
    },
    linked_bordereau_run_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BordereauRun',
      default: null
    },
    payment_reference: {
      type: String,
      default: null // Treasury/Bank payment reference when paid
    },
    linked_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    paid_at: {
      type: Date,
      default: null
    },
    settlement_formula_notes: {
      type: String,
      default: 'Net Due = Gross Eligible Premium ($37,650.00) - MGA Commission Withheld ($7,530.00) - Claims Offset ($0.00)'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'settlement_statements'
  }
);

SettlementStatementSchema.index({ tenant_id: 1, statement_number: 1 }, { unique: true });

module.exports = mongoose.model('SettlementStatement', SettlementStatementSchema);
