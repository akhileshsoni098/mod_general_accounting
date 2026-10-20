const mongoose = require('mongoose');

const InstallmentScheduleSchema = new mongoose.Schema(
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
    policy_id: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    policy_number: {
      type: String,
      required: true,
      trim: true
    },
    installment_number: {
      type: Number,
      required: true
    },
    due_date: {
      type: Date,
      required: true
    },
    premium_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    fee_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    tax_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    total_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    paid_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    balance_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    status: {
      type: String,
      enum: ['SCHEDULED', 'BILLED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'installment_schedules'
  }
);

InstallmentScheduleSchema.index({ tenant_id: 1, policy_id: 1, installment_number: 1 }, { unique: true });

module.exports = mongoose.model('InstallmentSchedule', InstallmentScheduleSchema);
