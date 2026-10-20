const mongoose = require('mongoose');

const JournalSchema = new mongoose.Schema(
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
    journal_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "JE-2026-0001"
    },
    posting_date: {
      type: Date,
      required: true,
      index: true
    },
    fiscal_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FiscalPeriod',
      required: true,
      index: true
    },
    source_module: {
      type: String,
      required: true,
      enum: [
        'GL_MANUAL',
        'BILLING_AR',
        'BILLING_INVOICE',
        'BILLING_PAYMENT',
        'BILLING_ADJUSTMENT',
        'COMMISSIONS_FIDUCIARY',
        'TREASURY_BANK_REC',
        'TREASURY_RETURN',
        'TREASURY_REFUND',
        'FINANCE_CLOSE',
        'POLICY_BIND',
        'RULES_ENGINE',
        'COMMERCIAL_DOCS',
        'COMMERCIAL_COGS',
        'OPENING_STOCK',
        'COMMERCIAL',
        'INVENTORY'
      ],
      default: 'GL_MANUAL'
    },
    reference_id: {
      type: String,
      default: null, // e.g. "POL-TX-8821" or "INV-001"
      index: true
    },
    memo: {
      type: String,
      required: true,
      trim: true
    },
    total_debit: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    total_credit: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
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
      enum: ['DRAFT', 'VALIDATED', 'POSTED', 'REVERSED'],
      default: 'POSTED'
    },
    created_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    validated_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    posted_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    posted_at: {
      type: Date,
      default: null
    },
    reversal_of_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    reversed_by_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'journals'
  }
);

JournalSchema.index({ tenant_id: 1, company_id: 1, journal_number: 1 }, { unique: true });
JournalSchema.index({ tenant_id: 1, company_id: 1, posting_date: -1 });

module.exports = mongoose.model('Journal', JournalSchema);
