const mongoose = require('mongoose');

const TaxJurisdictionSchema = new mongoose.Schema(
  {
    jurisdiction_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true // e.g. "US-FED", "US-CA", "US-CA-037"
    },
    jurisdiction_name: {
      type: String,
      required: true,
      trim: true // e.g. "California", "United States", "Los Angeles County"
    },
    jurisdiction_type: {
      type: String,
      required: true,
      enum: [
        'FEDERAL',
        'STATE',
        'FEDERAL_DISTRICT',
        'TERRITORY',
        'COUNTY',
        'CITY',
        'MUNICIPALITY',
        'SPECIAL_TAX_DISTRICT',
        'OTHER_PROVIDER_DEFINED_LOCALITY'
      ],
      default: 'STATE',
      index: true
    },
    country_code: {
      type: String,
      required: true,
      default: 'US',
      uppercase: true,
      minlength: 2,
      maxlength: 3,
      index: true
    },
    state_code: {
      type: String,
      trim: true,
      uppercase: true,
      default: null, // 2-letter state code e.g. "CA", "NY" (null for Federal)
      index: true
    },
    parent_jurisdiction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxJurisdiction',
      default: null,
      index: true
    },
    fips_code: {
      type: String,
      trim: true,
      default: null // Preserves leading zeros: e.g. "06", "06037"
    },
    gnis_id: {
      type: String,
      trim: true,
      default: null
    },
    // Provider specific identifiers mapped by provider key
    provider_code_map: {
      type: mongoose.Schema.Types.Mixed,
      default: {} // e.g. { taxjar: "CA", avalara: "CALIFORNIA" }
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    },
    effective_from: {
      type: Date,
      default: null
    },
    effective_to: {
      type: Date,
      default: null
    },
    source: {
      type: String,
      required: true,
      default: 'US_CENSUS_BUREAU'
    },
    source_version: {
      type: String,
      required: true,
      default: '2024.1.0'
    },
    // Distinguish geographic reference availability from confirmed provider tax calculation support
    provider_coverage_status: {
      type: String,
      enum: [
        'SUPPORTED',
        'UNSUPPORTED',
        'UNVERIFIED',
        'NOT_YET_IMPORTED'
      ],
      default: 'UNVERIFIED',
      index: true
    },
    reference_data_status: {
      type: String,
      enum: [
        'REFERENCE_DATA_AVAILABLE',
        'PROVIDER_TAX_SUPPORT_VERIFIED',
        'PENDING_VERIFICATION'
      ],
      default: 'REFERENCE_DATA_AVAILABLE'
    },
    imported_at: {
      type: Date,
      default: Date.now
    },
    metadata: {
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
    collection: 'tax_jurisdictions'
  }
);

TaxJurisdictionSchema.index({ country_code: 1, state_code: 1 });
TaxJurisdictionSchema.index({ parent_jurisdiction_id: 1, is_active: 1 });

module.exports = mongoose.model('TaxJurisdiction', TaxJurisdictionSchema);
