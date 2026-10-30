const mongoose = require('mongoose');

const TaxJurisdictionBreakdownSchema = new mongoose.Schema(
  {
    jurisdiction_code: { type: String, default: '' },
    jurisdiction_name: { type: String, required: true },
    jurisdiction_type: {
      type: String,
      enum: ['FEDERAL', 'STATE', 'DISTRICT', 'TERRITORY', 'COUNTY', 'CITY', 'SPECIAL_TAX_DISTRICT', 'OTHER'],
      default: 'STATE'
    },
    tax_type: {
      type: String,
      enum: ['SALES_TAX', 'USE_TAX', 'EXCISE_TAX', 'SPECIAL_TAX', 'OTHER'],
      default: 'SALES_TAX'
    },
    rate: { type: String, required: true }, // Formatted decimal string e.g. "0.0600"
    taxable_amount: { type: String, default: '0.00' },
    tax_amount: { type: String, required: true } // Formatted decimal string e.g. "9.00"
  },
  { _id: false }
);

const TaxLineItemSnapshotSchema = new mongoose.Schema(
  {
    line_number: { type: Number, required: true },
    line_id: { type: String, default: '' },
    item_code: { type: String, default: '' },
    item_description: { type: String, default: '' },
    category_code: { type: String, default: 'GENERAL_TANGIBLE_GOODS' },
    quantity: { type: Number, default: 1 },
    unit_price: { type: String, default: '0.00' },
    discount_amount: { type: String, default: '0.00' },
    line_amount: { type: String, required: true },
    taxable_amount: { type: String, required: true },
    exempt_amount: { type: String, default: '0.00' },
    tax_amount: { type: String, required: true },
    rate: { type: String, required: true },
    is_exempt: { type: Boolean, default: false },
    exemption_reason: { type: String, default: '' },
    jurisdiction_breakdown: [TaxJurisdictionBreakdownSchema]
  },
  { _id: false }
);

const TaxCalculationSnapshotSchema = new mongoose.Schema(
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
    transaction_id: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    transaction_type: {
      type: String,
      enum: ['SALE', 'PURCHASE', 'REFUND', 'ESTIMATE'],
      default: 'SALE',
      index: true
    },
    document_number: {
      type: String,
      trim: true,
      default: '',
      index: true
    },
    document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument',
      default: null
    },
    transaction_date: {
      type: Date,
      default: Date.now
    },
    calculation_date: {
      type: Date,
      default: Date.now
    },
    provider_name: {
      type: String,
      required: true,
      enum: ['MOCK', 'AVALARA', 'TAXJAR', 'VERTEX', 'STRIPE_TAX'],
      default: 'MOCK'
    },
    provider_transaction_id: {
      type: String,
      default: ''
    },
    environment: {
      type: String,
      enum: ['SANDBOX', 'PRODUCTION'],
      default: 'SANDBOX'
    },
    currency: {
      type: String,
      uppercase: true,
      default: 'USD'
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
      state: { type: String, required: true, uppercase: true },
      zip: { type: String, default: '' },
      country: { type: String, default: 'US', uppercase: true }
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
    sourcing_rule: {
      type: String,
      enum: ['DESTINATION', 'ORIGIN', 'MIXED'],
      default: 'DESTINATION'
    },
    subtotal_amount: {
      type: String,
      required: true
    },
    taxable_amount: {
      type: String,
      required: true
    },
    exempt_amount: {
      type: String,
      default: '0.00'
    },
    freight_amount: {
      type: String,
      default: '0.00'
    },
    freight_taxable: {
      type: Boolean,
      default: false
    },
    freight_tax_amount: {
      type: String,
      default: '0.00'
    },
    total_tax_amount: {
      type: String,
      required: true
    },
    grand_total_amount: {
      type: String,
      required: true
    },
    effective_combined_rate: {
      type: String,
      required: true
    },
    line_items: [TaxLineItemSnapshotSchema],
    jurisdiction_summaries: [TaxJurisdictionBreakdownSchema],
    status: {
      type: String,
      enum: ['CALCULATED', 'COMMITTED', 'CANCELLED', 'VOIDED', 'ERROR'],
      default: 'CALCULATED',
      index: true
    },
    is_mock: {
      type: Boolean,
      default: false
    },
    diagnostic_metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tax_calculation_snapshots'
  }
);

// Compound index: A transaction ID is unique per company & tenant
TaxCalculationSnapshotSchema.index(
  { tenant_id: 1, company_id: 1, transaction_id: 1 },
  { unique: true }
);

// Immutability Guard: Prevent modifying financial figures if committed
TaxCalculationSnapshotSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified() && this.status === 'COMMITTED') {
    const modifiedPaths = this.modifiedPaths();
    const immutableFields = [
      'subtotal_amount',
      'taxable_amount',
      'total_tax_amount',
      'grand_total_amount',
      'effective_combined_rate',
      'line_items',
      'jurisdiction_summaries',
      'provider_transaction_id'
    ];

    const hasIllegalEdit = modifiedPaths.some(p => immutableFields.some(imm => p.startsWith(imm)));
    if (hasIllegalEdit) {
      return next(new Error('IMMUTABLE_SNAPSHOT: Committed tax calculation snapshots cannot be modified.'));
    }
  }
  next();
});

module.exports = mongoose.model('TaxCalculationSnapshot', TaxCalculationSnapshotSchema);
