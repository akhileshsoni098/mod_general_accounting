const mongoose = require('mongoose');

const CommissionDisputeSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    dispute_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "CDISP-2026-0001"
    },
    commission_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionTransaction',
      required: true,
      index: true
    },
    claimant_party_id: {
      type: String,
      required: true
    },
    disputed_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED'],
      default: 'OPEN',
      index: true
    },
    resolution_notes: {
      type: String,
      default: null
    },
    resolution_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    resolved_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    resolved_at: {
      type: Date,
      default: null
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'commission_disputes'
  }
);

CommissionDisputeSchema.index({ tenant_id: 1, dispute_number: 1 }, { unique: true });

module.exports = mongoose.model('CommissionDispute', CommissionDisputeSchema);
