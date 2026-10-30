const mongoose = require('mongoose');

const PartySchema = new mongoose.Schema(
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
    party_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 64
    },
    legal_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256
    },
    trade_name: {
      type: String,
      trim: true,
      default: '',
      maxlength: 256
    },
    party_type: {
      type: String,
      enum: ['ORGANIZATION', 'INDIVIDUAL'],
      default: 'ORGANIZATION',
      required: true
    },
    tax_id: {
      type: String,
      trim: true,
      default: '',
      maxlength: 32
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      maxlength: 128
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      maxlength: 32
    },
    address: {
      street1: { type: String, default: '', trim: true },
      street2: { type: String, default: '', trim: true },
      city: { type: String, default: '', trim: true },
      state: { type: String, default: '', trim: true },
      postal_code: { type: String, default: '', trim: true },
      country: { type: String, default: 'USA', trim: true }
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE'
    },
    price_level: {
      type: String,
      trim: true,
      default: null // e.g. 'WHOLESALE', 'RETAIL', 'DEALER'
    },
    credit_period_days: {
      type: Number,
      default: 30
    },
    msme_registered: {
      type: Boolean,
      default: false
    },
    msme_category: {
      type: String,
      enum: ['NONE', 'MICRO', 'SMALL', 'MEDIUM'],
      default: 'NONE'
    },
    tds_applicable: {
      type: Boolean,
      default: false
    },
    tds_section: {
      type: String,
      default: null,
      trim: true
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
    collection: 'counterparty_parties'
  }
);

// Compound tenant and company boundary index
PartySchema.index({ tenant_id: 1, company_id: 1, party_code: 1 }, { unique: true });
PartySchema.index({ tenant_id: 1, company_id: 1, legal_name: 1 });
PartySchema.index({ tenant_id: 1, company_id: 1, status: 1 });

module.exports = mongoose.model('Party', PartySchema);
