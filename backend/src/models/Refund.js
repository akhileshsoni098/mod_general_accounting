const mongoose = require('mongoose');

const RefundSchema = new mongoose.Schema(
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
    refund_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    refund_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    refund_method: {
      type: String,
      enum: ['ACH', 'CHECK', 'CARD_REVERSAL', 'WIRE'],
      default: 'ACH'
    },
    reason: {
      type: String,
      required: true
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
    disbursed_at: {
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
      enum: ['REQUESTED', 'APPROVED', 'DISBURSED', 'REJECTED'],
      default: 'REQUESTED',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'refunds'
  }
);

RefundSchema.index({ tenant_id: 1, refund_number: 1 }, { unique: true });

module.exports = mongoose.model('Refund', RefundSchema);
