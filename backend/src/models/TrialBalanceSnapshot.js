const mongoose = require('mongoose');

const TrialBalanceSnapshotSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    snapshot_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "TB-SNAP-2026-07-v1"
    },
    fiscal_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FiscalPeriod',
      required: true,
      index: true
    },
    as_of_date: {
      type: Date,
      required: true
    },
    total_debits: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    total_credits: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    difference: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    is_balanced: {
      type: Boolean,
      required: true,
      default: false
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PREVIEW', 'CERTIFIED', 'FINAL_LOCKED'],
      default: 'DRAFT',
      index: true
    },
    version: {
      type: Number,
      default: 1
    },
    snapshot_hash: {
      type: String,
      default: null
    },
    certified_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    certified_at: {
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
    collection: 'trial_balance_snapshots'
  }
);

TrialBalanceSnapshotSchema.index({ tenant_id: 1, snapshot_number: 1 }, { unique: true });
TrialBalanceSnapshotSchema.index({ tenant_id: 1, fiscal_period_id: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('TrialBalanceSnapshot', TrialBalanceSnapshotSchema);
