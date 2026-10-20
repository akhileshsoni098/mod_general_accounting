const mongoose = require('mongoose');

const LedgerAccountSchema = new mongoose.Schema(
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
      default: null,
      index: true
    },
    account_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    account_name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    account_type: {
      type: String,
      required: true,
      enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
      uppercase: true
    },
    normal_balance: {
      type: String,
      required: true,
      enum: ['DEBIT', 'CREDIT'],
      uppercase: true
    },
    parent_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null,
      index: true
    },
    is_posting_allowed: {
      type: Boolean,
      default: true
    },
    is_fiduciary: {
      type: Boolean,
      default: false
    },
    is_control_account: {
      type: Boolean,
      default: false
    },
    subledger_type: {
      type: String,
      enum: ['NONE', 'AR', 'AP', 'FIDUCIARY', 'COMMISSIONS', 'UPR'],
      default: 'NONE'
    },
    current_balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    accounting_basis: {
      type: String,
      enum: ['GAAP', 'STATUTORY', 'TAX'],
      default: 'GAAP'
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'ledger_accounts'
  }
);

LedgerAccountSchema.index({ tenant_id: 1, company_id: 1, account_code: 1 }, { unique: true });
LedgerAccountSchema.index({ tenant_id: 1, company_id: 1, status: 1 });

module.exports = mongoose.model('LedgerAccount', LedgerAccountSchema);
