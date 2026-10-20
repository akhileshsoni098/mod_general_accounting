const mongoose = require('mongoose');

const ReconciliationCaseSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    case_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "REC-CASE-2026-0001"
    },
    fiscal_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FiscalPeriod',
      required: true,
      index: true
    },
    subledger_type: {
      type: String,
      required: true,
      enum: ['AR', 'CARRIER_PAYABLE', 'BROKER_PAYABLE', 'FIDUCIARY_TRUST', 'OPERATING_CASH', 'UPR']
    },
    control_account_code: {
      type: String,
      required: true
    },
    expected_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    actual_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    variance: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    status: {
      type: String,
      enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'WAIVED'],
      default: 'OPEN',
      index: true
    },
    description: {
      type: String,
      required: true
    },
    assigned_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    resolution_reason: {
      type: String,
      default: null
    },
    resolved_at: {
      type: Date,
      default: null
    },
    resolved_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'reconciliation_cases'
  }
);

ReconciliationCaseSchema.index({ tenant_id: 1, case_number: 1 }, { unique: true });

module.exports = mongoose.model('ReconciliationCase', ReconciliationCaseSchema);
