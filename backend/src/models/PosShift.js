const mongoose = require('mongoose');

const PosShiftSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    shift_number: {
      type: String,
      required: true,
      trim: true
    },
    opened_at: {
      type: Date,
      default: Date.now
    },
    closed_at: {
      type: Date
    },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED'],
      default: 'OPEN',
      index: true
    },
    opening_float: {
      type: Number,
      default: 0
    },
    closing_cash_actual: {
      type: Number,
      default: 0
    },
    closing_cash_expected: {
      type: Number,
      default: 0
    },
    cash_variance: {
      type: Number,
      default: 0
    },
    total_cash_sales: {
      type: Number,
      default: 0
    },
    total_card_sales: {
      type: Number,
      default: 0
    },
    total_upi_sales: {
      type: Number,
      default: 0
    },
    total_refunds: {
      type: Number,
      default: 0
    },
    transaction_count: {
      type: Number,
      default: 0
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'pos_shifts'
  }
);

PosShiftSchema.index({ tenant_id: 1, company_id: 1, status: 1 });

module.exports = mongoose.model('PosShift', PosShiftSchema);
