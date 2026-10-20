const mongoose = require('mongoose');

const TaxRateConfigSchema = new mongoose.Schema(
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
    tax_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "GST_18", "GST_12", "GST_5", "GST_0", "GST_28"
    },
    tax_name: {
      type: String,
      required: true,
      trim: true // e.g. "GST 18% (Standard)"
    },
    rate_percent: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    cgst_rate: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    sgst_rate: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    igst_rate: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    applicable_to: {
      type: String,
      enum: ['GOODS', 'SERVICES', 'BOTH'],
      default: 'BOTH'
    },
    effective_from: {
      type: Date,
      default: () => new Date('2017-07-01')
    },
    effective_to: {
      type: Date,
      default: null
    },
    is_active: {
      type: Boolean,
      default: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tax_rate_configs'
  }
);

TaxRateConfigSchema.index({ tenant_id: 1, company_id: 1, tax_code: 1 }, { unique: true });
TaxRateConfigSchema.index({ tenant_id: 1, company_id: 1, is_active: 1 });

module.exports = mongoose.model('TaxRateConfig', TaxRateConfigSchema);
