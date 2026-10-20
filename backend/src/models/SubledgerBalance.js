const mongoose = require('mongoose');

const SubledgerBalanceSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
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
      enum: ['AR', 'CARRIER_PAYABLE', 'BROKER_PAYABLE', 'FIDUCIARY_TRUST', 'OPERATING_CASH', 'UPR'],
      index: true
    },
    control_account_code: {
      type: String,
      required: true,
      trim: true // e.g. "1100", "2010", "2020", "1010", "1000", "2200"
    },
    opening_balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    period_debits: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    period_credits: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    subledger_closing_balance: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    gl_closing_balance: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    variance: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    reconciliation_status: {
      type: String,
      enum: ['BALANCED', 'DISCREPANCY', 'INVESTIGATING'],
      default: 'BALANCED'
    },
    snapshot_timestamp: {
      type: Date,
      default: Date.now
    },
    is_certified: {
      type: Boolean,
      default: false
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'subledger_balances'
  }
);

SubledgerBalanceSchema.index({ tenant_id: 1, fiscal_period_id: 1, subledger_type: 1 }, { unique: true });

module.exports = mongoose.model('SubledgerBalance', SubledgerBalanceSchema);
