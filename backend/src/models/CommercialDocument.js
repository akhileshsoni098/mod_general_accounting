const mongoose = require('mongoose');

const CommercialDocumentLineSchema = new mongoose.Schema(
  {
    line_number: {
      type: Number,
      required: true
    },
    line_type: {
      type: String,
      enum: ['ITEM', 'SERVICE', 'ACCOUNT', 'GOODS', 'SERVICES'],
      default: 'ITEM'
    },
    stock_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      default: null
    },
    item_code: {
      type: String,
      trim: true,
      default: ''
    },
    item_name: {
      type: String,
      trim: true,
      default: ''
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    hsn_sac_code: {
      type: String,
      trim: true,
      default: ''
    },
    godown_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Godown',
      default: null
    },
    uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      default: null
    },
    uom: {
      type: String,
      trim: true,
      default: ''
    },
    quantity: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('1.0000')
    },
    conversion_factor: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('1.0')
    },
    base_quantity: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('1.0000')
    },
    unit_rate: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    gross_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    discount_percent: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    discount_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    taxable_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    tax_rate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    cgst_rate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    cgst_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    sgst_rate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    sgst_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    igst_rate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    igst_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_tax: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    stock_movement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockMovement',
      default: null
    },
    issue_unit_cost: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_cogs_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    restockable: {
      type: Boolean,
      default: true
    },
    disposition: {
      type: String,
      enum: ['RESTOCK', 'QUARANTINE', 'SCRAP', 'SPOILAGE', 'PRICE_ADJUSTMENT_ONLY'],
      default: 'RESTOCK'
    },
    inspection_status: {
      type: String,
      enum: ['PASSED', 'PENDING_INSPECTION', 'FAILED', 'NOT_APPLICABLE'],
      default: 'NOT_APPLICABLE'
    },
    batch_number: {
      type: String,
      default: '',
      trim: true
    },
    serial_numbers: [
      {
        type: String,
        trim: true
      }
    ],
    expiry_date: {
      type: Date,
      default: null
    },
    is_tax_inclusive: {
      type: Boolean,
      default: false
    },
    excluded_ingredients: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem'
    }],
    modifiers: [{
      type: String
    }],
    // US Sales & Use Tax per-line attributes
    category_code: {
      type: String,
      default: 'GENERAL_TANGIBLE_GOODS',
      trim: true
    },
    is_exempt: {
      type: Boolean,
      default: false
    },
    exemption_reason: {
      type: String,
      default: '',
      trim: true
    },
    us_tax_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    us_tax_rate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.0000')
    }
  },
  { _id: true }
);

const CommercialDocumentSchema = new mongoose.Schema(
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
    document_type: {
      type: String,
      required: true,
      enum: [
        'SALES_INVOICE',
        'PURCHASE_INVOICE',
        'SALES_RETURN',
        'PURCHASE_RETURN',
        'CREDIT_NOTE',
        'DEBIT_NOTE',
        'RECEIPT',
        'PAYMENT',
        'CONTRA_TRANSFER',
        'JOURNAL_ADJUSTMENT'
      ],
      index: true
    },
    document_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    reference_number: {
      type: String,
      trim: true,
      default: '' // e.g. supplier invoice #, PO #, cheque #, UTR #
    },
    document_date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    posting_date: {
      type: Date,
      default: Date.now
    },
    due_date: {
      type: Date,
      default: null
    },
    party_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      default: null,
      index: true
    },
    party_name: {
      type: String,
      trim: true,
      default: ''
    },
    billing_name: {
      type: String,
      trim: true,
      default: ''
    },
    party_gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: ''
    },
    party_state_code: {
      type: String,
      trim: true,
      default: ''
    },
    place_of_supply: {
      type: String,
      trim: true,
      default: ''
    },
    supply_type: {
      type: String,
      enum: ['INTRA_STATE', 'INTER_STATE', 'EXEMPT', 'EXPORT'],
      default: 'INTRA_STATE'
    },
    is_tax_inclusive: {
      type: Boolean,
      default: false
    },
    // US Sales & Use Tax integration fields
    tax_regime: {
      type: String,
      enum: ['IN_GST', 'GST', 'INDIAN_GST', 'US_SALES_TAX', 'NONE'],
      default: 'IN_GST',
      index: true
    },
    tax_snapshot_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCalculationSnapshot',
      default: null,
      index: true
    },
    tax_calculation_status: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'CALCULATED', 'COMMITTED', 'ERROR', 'RECONCILIATION_PENDING'],
      default: 'NOT_REQUIRED',
      index: true
    },
    tax_reconciliation_status: {
      type: String,
      enum: ['NONE', 'SYNCED', 'PENDING_RETRY', 'FAILED', 'FAILED_PERMANENT'],
      default: 'NONE'
    },
    tax_retry_count: {
      type: Number,
      default: 0
    },
    origin_address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '', uppercase: true },
      zip: { type: String, default: '' },
      country: { type: String, default: 'US', uppercase: true }
    },
    destination_address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '', uppercase: true },
      zip: { type: String, default: '' },
      country: { type: String, default: 'US', uppercase: true }
    },
    freight_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    freight_tax_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    customer_tax_id: {
      type: String,
      default: '',
      trim: true
    },
    customer_exemption_code: {
      type: String,
      default: '',
      trim: true
    },
    is_mock_tax: {
      type: Boolean,
      default: false
    },
    tax_provider_name: {
      type: String,
      default: ''
    },
    tax_provider_transaction_id: {
      type: String,
      default: ''
    },
    bank_or_cash_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null
    },
    to_bank_or_cash_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null // For CONTRA_TRANSFER
    },
    status: {
      type: String,
      enum: ['DRAFT', 'POSTING', 'POSTED', 'CANCELLED', 'REVERSED'],
      default: 'DRAFT',
      index: true
    },
    lines: [CommercialDocumentLineSchema],
    subtotal_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_discount_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_taxable_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_cgst_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_sgst_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_igst_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_tax_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    round_off_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    grand_total: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true
    },
    amount_paid: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    balance_due: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    linked_source_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument',
      default: null,
      index: true // Original invoice for returns / credit & debit notes
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null,
      index: true
    },
    cogs_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    reversal_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument',
      default: null
    },
    reversal_reason: {
      type: String,
      default: ''
    },
    idempotency_key: {
      type: String,
      required: true,
      trim: true
    },
    notes: {
      type: String,
      default: ''
    },
    terms: {
      type: String,
      default: ''
    },
    created_by_user_id: {
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
    collection: 'commercial_documents'
  }
);

CommercialDocumentSchema.index({ tenant_id: 1, company_id: 1, document_number: 1 }, { unique: true });
CommercialDocumentSchema.index({ tenant_id: 1, company_id: 1, idempotency_key: 1 }, { unique: true });
CommercialDocumentSchema.index({ tenant_id: 1, company_id: 1, document_type: 1, document_date: -1 });
CommercialDocumentSchema.index({ tenant_id: 1, company_id: 1, party_id: 1, status: 1 });
CommercialDocumentSchema.index({ tenant_id: 1, company_id: 1, status: 1 });

module.exports = mongoose.model('CommercialDocument', CommercialDocumentSchema);
