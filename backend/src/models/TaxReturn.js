const mongoose = require('mongoose');

const TaxReturnSchema = new mongoose.Schema(
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
    return_number: {
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
    return_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxReturnPeriod',
      required: true,
      index: true
    },
    period_label: {
      type: String,
      default: ''
    },
    schema_version: {
      type: String,
      default: 'US-GENERIC-V1'
    },
    gross_sales_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    taxable_sales_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    exempt_sales_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    tax_collected_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    adjustments_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    net_tax_liability_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    payments_applied_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    balance_due_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    credit_carryforward_amount: {
      type: String,
      required: true,
      default: '0.00'
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PREPARED',
        'REVIEW_REQUIRED',
        'APPROVED',
        'FILED',
        'AMENDED',
        'CANCELLED'
      ],
      default: 'DRAFT',
      index: true
    },
    source_entry_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxLiabilityEntry'
      }
    ],
    review_notes: {
      type: String,
      default: ''
    },
    reviewed_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewed_at: {
      type: Date,
      default: null
    },
    approved_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approved_at: {
      type: Date,
      default: null
    },
    external_filing_reference: {
      type: String,
      default: '',
      trim: true
    },
    external_filed_at: {
      type: Date,
      default: null
    },
    filed_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    filing_method: {
      type: String,
      enum: ['MANUAL_OFFLINE', 'RECORDED_EXTERNAL', 'ELECTRONIC_INTEGRATION'],
      default: 'RECORDED_EXTERNAL'
    },
    filing_verification_status: {
      type: String,
      enum: ['UNVERIFIED', 'SELF_CERTIFIED', 'INTEGRATION_VERIFIED'],
      default: 'SELF_CERTIFIED'
    },
    filing_notes: {
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
    collection: 'tax_returns'
  }
);

TaxReturnSchema.index(
  { tenant_id: 1, company_id: 1, return_number: 1 },
  { unique: true }
);

module.exports = mongoose.model('TaxReturn', TaxReturnSchema);
