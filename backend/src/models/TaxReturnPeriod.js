const mongoose = require('mongoose');

const TaxReturnPeriodSchema = new mongoose.Schema(
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
      uppercase: true // e.g. "US-CA", "US-NY", "US-TX"
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
    period_start_date: {
      type: Date,
      required: true
    },
    period_end_date: {
      type: Date,
      required: true
    },
    period_label: {
      type: String,
      required: true,
      trim: true // e.g. "2026-Q1", "2026-03"
    },
    filing_frequency: {
      type: String,
      required: true,
      enum: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'OCCASIONAL'],
      default: 'MONTHLY'
    },
    schema_version: {
      type: String,
      default: 'US-GENERIC-V1'
    },
    status: {
      type: String,
      enum: ['OPEN', 'PREPARING', 'FILED', 'CLOSED'],
      default: 'OPEN',
      index: true
    },
    due_date: {
      type: Date,
      default: null
    },
    due_date_source: {
      type: String,
      default: 'MANUAL_OR_CONFIGURATION'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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
    collection: 'tax_return_periods'
  }
);

// Prevent duplicate active periods for same company, jurisdiction, tax type, and date range
TaxReturnPeriodSchema.index(
  {
    tenant_id: 1,
    company_id: 1,
    jurisdiction_code: 1,
    tax_type: 1,
    period_start_date: 1,
    period_end_date: 1
  },
  { unique: true }
);

module.exports = mongoose.model('TaxReturnPeriod', TaxReturnPeriodSchema);
