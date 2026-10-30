const mongoose = require('mongoose');

const CompanyTaxProfileSchema = new mongoose.Schema(
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
    tax_country: {
      type: String,
      required: true,
      default: 'US',
      uppercase: true
    },
    tax_classification: {
      type: String,
      required: true,
      enum: [
        'C_CORP',
        'S_CORP',
        'LLC_DISREGARDED',
        'LLC_PARTNERSHIP',
        'LLC_C_CORP',
        'LLC_S_CORP',
        'PARTNERSHIP',
        'SOLE_PROPRIETORSHIP',
        'TAX_EXEMPT_501C',
        'INDIVIDUAL',
        'OTHER'
      ],
      default: 'C_CORP'
    },
    tax_year_end_month: {
      type: Number,
      min: 1,
      max: 12,
      default: 12 // Independent tax reporting anchor, defaults to calendar year-end
    },
    // Sensitive taxpayer identifier is stored masked for security compliance
    // Raw sensitive EIN requires dedicated secure vault/kms encryption before plaintext storage
    ein_masked: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: function (v) {
          if (!v) return true;
          // Validates masked format "XX-XXX1234" or 9-digit format "XX-XXXXXXX"
          return /^([0-9X]{2}-[0-9X]{7}|[0-9]{2}-[0-9]{7})$/i.test(v);
        },
        message: 'EIN must follow US Employer Identification Number format (e.g. "XX-XXX1234" or "12-3456789")'
      }
    },
    state_of_incorporation: {
      type: String,
      trim: true,
      uppercase: true,
      default: ''
    },
    tax_provider: {
      provider_name: {
        type: String,
        enum: ['MOCK', 'AVALARA', 'TAXJAR', 'VERTEX', 'STRIPE_TAX', 'NONE'],
        default: 'MOCK'
      },
      environment: {
        type: String,
        enum: ['SANDBOX', 'PRODUCTION'],
        default: 'SANDBOX'
      },
      is_active: {
        type: Boolean,
        default: false
      },
      connection_status: {
        type: String,
        enum: ['NOT_CONFIGURED', 'CONNECTED', 'ERROR', 'MOCK_ACTIVE'],
        default: 'NOT_CONFIGURED'
      },
      last_health_check_at: {
        type: Date,
        default: null
      },
      last_error_message: {
        type: String,
        default: ''
      }
    },
    profile_status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'UNDER_REVIEW', 'ARCHIVED'],
      default: 'ACTIVE'
    },
    effective_date: {
      type: Date,
      default: Date.now
    },
    audit_metadata: {
      created_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      updated_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      last_updated_at: { type: Date, default: Date.now },
      change_notes: { type: String, default: '' }
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'company_tax_profiles'
  }
);

// Enforce 1-to-1 relationship per tenant and company
CompanyTaxProfileSchema.index({ tenant_id: 1, company_id: 1 }, { unique: true });

module.exports = mongoose.model('CompanyTaxProfile', CompanyTaxProfileSchema);
