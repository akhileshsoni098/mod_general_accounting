const mongoose = require('mongoose');

const CommissionAdjustmentSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    adjustment_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "CADJ-2026-0001"
    },
    commission_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionTransaction',
      required: true,
      index: true
    },
    policy_reference: {
      type: String,
      required: true
    },
    adjustment_type: {
      type: String,
      enum: ['CLAWBACK', 'CORRECTION', 'DISPUTE_SETTLEMENT', 'MANUAL_OVERRIDE'],
      required: true
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    reason: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED'],
      default: 'PENDING_APPROVAL',
      index: true
    },
    linked_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
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
    collection: 'commission_adjustments'
  }
);

CommissionAdjustmentSchema.index({ tenant_id: 1, adjustment_number: 1 }, { unique: true });
CommissionAdjustmentSchema.index({ tenant_id: 1, idempotency_key: 1 }, { unique: true });

module.exports = mongoose.model('CommissionAdjustment', CommissionAdjustmentSchema);
