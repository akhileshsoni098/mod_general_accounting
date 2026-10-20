const mongoose = require('mongoose');
const { VALID_PROFILE_IDS } = require('../config/businessProfiles');

const CompanySchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    company_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 32
    },
    company_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128
    },
    legal_name: {
      type: String,
      trim: true,
      default: '',
      maxlength: 256
    },
    business_profile: {
      type: String,
      required: true,
      uppercase: true,
      enum: VALID_PROFILE_IDS,
      default: 'GENERAL_RETAIL'
    },
    description: {
      type: String,
      default: '',
      maxlength: 500
    },
    country_code: {
      type: String,
      default: 'IN',
      uppercase: true,
      minlength: 2,
      maxlength: 3
    },
    base_currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      minlength: 3,
      maxlength: 3
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    },
    locale: {
      type: String,
      default: 'en-IN'
    },
    financial_year_start_month: {
      type: Number,
      default: 4,
      min: 1,
      max: 12
    },
    financial_year_config: {
      start_month: { type: Number, default: 4, min: 1, max: 12 },
      close_day: { type: Number, default: 31, min: 1, max: 31 }
    },
    books_beginning_from: {
      type: Date,
      default: Date.now
    },
    tax_jurisdiction: {
      type: String,
      default: 'GST_INDIA',
      trim: true
    },
    tax_details: {
      gstin: { type: String, default: '', trim: true, uppercase: true },
      pan: { type: String, default: '', trim: true, uppercase: true },
      state_code: { type: String, default: '', trim: true },
      is_composition: { type: Boolean, default: false }
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true
    },
    is_legacy_default: {
      type: Boolean,
      default: false,
      index: true
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
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
    collection: 'companies'
  }
);

// Enforce company_code uniqueness within each tenant
CompanySchema.index({ tenant_id: 1, company_code: 1 }, { unique: true });
CompanySchema.index({ tenant_id: 1, status: 1 });
CompanySchema.index({ tenant_id: 1, business_profile: 1 });

module.exports = mongoose.model('Company', CompanySchema);
