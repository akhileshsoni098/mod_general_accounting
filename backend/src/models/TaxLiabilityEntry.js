const mongoose = require('mongoose');

const TaxLiabilityEntrySchema = new mongoose.Schema(
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
      uppercase: true, // e.g. "US-CA", "US-NY"
      index: true
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
      default: 'SALES_USE_TAX',
      index: true
    },
    tax_registration_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxRegistration',
      default: null
    },
    source_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument',
      default: null,
      index: true
    },
    source_document_type: {
      type: String,
      default: '',
      trim: true
    },
    source_document_number: {
      type: String,
      default: '',
      trim: true,
      index: true
    },
    source_snapshot_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCalculationSnapshot',
      default: null
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    tax_transaction_date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    posting_date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    taxable_base_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    tax_amount: {
      type: String,
      required: true,
      default: '0.00' // Formatted signed decimal string e.g. "45.00" or "-45.00"
    },
    currency: {
      type: String,
      uppercase: true,
      default: 'USD'
    },
    entry_type: {
      type: String,
      required: true,
      enum: [
        'TAX_COLLECTED_SALES',
        'SALES_RETURN_REVERSAL',
        'TAX_ADJUSTMENT',
        'PURCHASE_USE_TAX',
        'TAX_PAYMENT',
        'TAX_CREDIT_REFUND',
        'ENTRY_REVERSAL'
      ],
      index: true
    },
    reversal_of_entry_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxLiabilityEntry',
      default: null
    },
    is_reversal: {
      type: Boolean,
      default: false,
      index: true
    },
    idempotency_key: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['POSTED', 'REVERSED', 'ADJUSTED'],
      default: 'POSTED',
      index: true
    },
    return_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxReturnPeriod',
      default: null,
      index: true
    },
    return_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxReturn',
      default: null,
      index: true
    },
    notes: {
      type: String,
      default: ''
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
    collection: 'tax_liability_entries'
  }
);

// Idempotency: Unique key per company
TaxLiabilityEntrySchema.index(
  { tenant_id: 1, company_id: 1, idempotency_key: 1 },
  { unique: true }
);

module.exports = mongoose.model('TaxLiabilityEntry', TaxLiabilityEntrySchema);
