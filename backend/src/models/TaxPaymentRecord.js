const mongoose = require('mongoose');

const TaxPaymentRecordSchema = new mongoose.Schema(
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
    payment_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true
    },
    jurisdiction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxJurisdiction',
      default: null,
      index: true
    },
    jurisdiction_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    tax_type: {
      type: String,
      required: true,
      enum: [
        'SALES_USE_TAX',
        'SELLER_USE_TAX',
        'CONSUMER_USE_TAX',
        'LOCAL_BUSINESS_TAX',
        'OTHER'
      ],
      default: 'SALES_USE_TAX'
    },
    tax_registration_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxRegistration',
      default: null
    },
    return_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxReturn',
      default: null,
      index: true
    },
    return_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxReturnPeriod',
      default: null,
      index: true
    },
    payment_date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    amount: {
      type: String,
      required: true
    },
    applied_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    unapplied_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    currency: {
      type: String,
      uppercase: true,
      default: 'USD'
    },
    payment_method: {
      type: String,
      enum: ['ACH_DEBIT', 'EFT_WIRE', 'CHECK', 'CREDIT_APPLIED', 'OTHER'],
      default: 'EFT_WIRE'
    },
    bank_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null
    },
    bank_account_code: {
      type: String,
      default: '1002'
    },
    payment_reference: {
      type: String,
      default: '',
      trim: true
    },
    confirmation_reference: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: ['RECORDED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'REVERSED'],
      default: 'RECORDED',
      index: true
    },
    gl_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    idempotency_key: {
      type: String,
      required: true,
      trim: true
    },
    audit_trail: [
      {
        action: { type: String, required: true },
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: '' }
      }
    ],
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tax_payment_records'
  }
);

TaxPaymentRecordSchema.index(
  { tenant_id: 1, company_id: 1, idempotency_key: 1 },
  { unique: true }
);

module.exports = mongoose.model('TaxPaymentRecord', TaxPaymentRecordSchema);
