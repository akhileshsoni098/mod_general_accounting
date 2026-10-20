const mongoose = require('mongoose');

const BillingAdjustmentSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    billing_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BillingAccount',
      required: true,
      index: true
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true
    },
    adjustment_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    adjustment_type: {
      type: String,
      enum: ['CREDIT_MEMO', 'FEE_WAIVER', 'BAD_DEBT_WRITEOFF', 'DISCOUNT', 'SURCHARGE_WAIVER'],
      required: true
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    reason_code: {
      type: String,
      required: true
    },
    reason_description: {
      type: String,
      default: ''
    },
    approved_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approved_at: {
      type: Date,
      default: null
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'APPROVED', 'APPLIED', 'REJECTED'],
      default: 'APPROVED',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'billing_adjustments'
  }
);

BillingAdjustmentSchema.index({ tenant_id: 1, adjustment_number: 1 }, { unique: true });

module.exports = mongoose.model('BillingAdjustment', BillingAdjustmentSchema);
