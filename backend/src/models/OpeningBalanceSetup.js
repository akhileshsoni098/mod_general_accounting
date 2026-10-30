const mongoose = require('mongoose');

const OpeningBalanceLineSchema = new mongoose.Schema(
  {
    ledger_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      required: true
    },
    account_code: {
      type: String,
      required: true,
      trim: true
    },
    account_name: {
      type: String,
      required: true,
      trim: true
    },
    account_type: {
      type: String,
      required: true
    },
    normal_balance: {
      type: String,
      enum: ['DEBIT', 'CREDIT'],
      required: true
    },
    debit: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    credit: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    }
  },
  { _id: true }
);

const OpeningBalanceSetupSchema = new mongoose.Schema(
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
    financial_year: {
      type: Number,
      required: true,
      index: true
    },
    as_of_date: {
      type: Date,
      required: true,
      default: Date.now
    },
    lines: [OpeningBalanceLineSchema],
    total_debit: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_credit: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    difference: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    ledger_count: {
      type: Number,
      default: 0
    },
    allow_suspense: {
      type: Boolean,
      default: false
    },
    suspense_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null
    },
    suspense_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    status: {
      type: String,
      enum: ['DRAFT', 'READY_TO_POST', 'POSTED'],
      default: 'DRAFT',
      index: true
    },
    posted_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null,
      index: true
    },
    posted_at: {
      type: Date,
      default: null
    },
    posted_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'opening_balance_setups'
  }
);

OpeningBalanceSetupSchema.index(
  { tenant_id: 1, company_id: 1, financial_year: 1 },
  { unique: true }
);

module.exports = mongoose.model('OpeningBalanceSetup', OpeningBalanceSetupSchema);
