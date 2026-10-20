const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema(
  {
    tenant_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 32
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'ONBOARDING'],
      default: 'ACTIVE'
    },
    tenant_type: {
      type: String,
      enum: ['ENTERPRISE', 'RETAIL', 'HOSPITALITY', 'MANUFACTURING', 'SERVICES', 'WHOLESALE', 'OTHER', 'CARRIER', 'MGA', 'BROKER'],
      default: 'ENTERPRISE',
      required: true,
      uppercase: true
    },
    base_currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      minlength: 3,
      maxlength: 3
    },
    fiscal_year_start_month: {
      type: Number,
      default: 1,
      min: 1,
      max: 12
    },
    timezone: {
      type: String,
      default: 'America/New_York'
    },
    settings: {
      allow_legacy_adapter: {
        type: Boolean,
        default: false
      }
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
    collection: 'tenant_masters'
  }
);

module.exports = mongoose.model('Tenant', TenantSchema);
