const mongoose = require('mongoose');

const TrialBalanceLineSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    snapshot_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TrialBalanceSnapshot',
      required: true,
      index: true
    },
    ledger_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      required: true
    },
    account_code: {
      type: String,
      required: true
    },
    account_name: {
      type: String,
      required: true
    },
    account_type: {
      type: String,
      required: true,
      enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
    },
    normal_balance: {
      type: String,
      required: true,
      enum: ['DEBIT', 'CREDIT']
    },
    debit_balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    credit_balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'trial_balance_lines'
  }
);

TrialBalanceLineSchema.index({ tenant_id: 1, snapshot_id: 1, account_code: 1 }, { unique: true });

module.exports = mongoose.model('TrialBalanceLine', TrialBalanceLineSchema);
