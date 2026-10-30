const mongoose = require('mongoose');

const TaxRegistrationSchema = new mongoose.Schema(
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
      required: true,
      index: true
    },
    tax_type: {
      type: String,
      required: true,
      enum: [
        'SALES_USE_TAX',
        'SELLER_USE_TAX',
        'CONSUMER_USE_TAX',
        'INCOME_TAX',
        'FRANCHISE_TAX',
        'GROSS_RECEIPTS_TAX',
        'LOCAL_BUSINESS_TAX'
      ],
      default: 'SALES_USE_TAX',
      index: true
    },
    registration_number: {
      type: String,
      required: true,
      trim: true
    },
    registration_status: {
      type: String,
      required: true,
      enum: [
        'PENDING_APPLICATION',
        'ACTIVE',
        'REVOKED',
        'EXPIRED',
        'VOLUNTARY_DISCLOSURE'
      ],
      default: 'ACTIVE',
      index: true
    },
    filing_frequency: {
      type: String,
      required: true,
      enum: [
        'MONTHLY',
        'QUARTERLY',
        'SEMI_ANNUALLY',
        'ANNUALLY',
        'OCCASIONAL'
      ],
      default: 'MONTHLY'
    },
    effective_from: {
      type: Date,
      required: true,
      default: Date.now
    },
    effective_to: {
      type: Date,
      default: null
    },
    verification_status: {
      type: String,
      enum: [
        'UNVERIFIED',
        'VERIFIED_OFFICIAL',
        'VERIFIED_PROVIDER',
        'REJECTED'
      ],
      default: 'UNVERIFIED'
    },
    verified_at: {
      type: Date,
      default: null
    },
    verified_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tax_registrations'
  }
);

// Standard query index
TaxRegistrationSchema.index({ tenant_id: 1, company_id: 1, jurisdiction_id: 1 });

// Duplicate active registration prevention:
// Only one ACTIVE registration with no expiration (effective_to: null) per company, jurisdiction, and tax type.
// Historical or expired registrations (effective_to set, or status !== 'ACTIVE') are preserved without collision.
TaxRegistrationSchema.index(
  { tenant_id: 1, company_id: 1, jurisdiction_id: 1, tax_type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      registration_status: 'ACTIVE',
      effective_to: null
    }
  }
);

module.exports = mongoose.model('TaxRegistration', TaxRegistrationSchema);
