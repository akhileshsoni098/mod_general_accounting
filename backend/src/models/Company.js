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
    industry_code: {
      type: String,
      uppercase: true,
      trim: true,
      default: 'GENERAL_TRADING'
    },
    industry_subcategory: {
      type: String,
      trim: true,
      default: ''
    },
    operating_models: {
      type: [String],
      default: ['BUY_AND_RESELL']
    },
    inventory_policies: {
      tracking_mode: {
        type: String,
        enum: ['STANDARD', 'BATCH_LOT', 'SERIAL', 'PERISHABLE'],
        default: 'STANDARD'
      },
      require_batch: { type: Boolean, default: false },
      require_serial: { type: Boolean, default: false },
      require_expiry: { type: Boolean, default: false },
      enable_quarantine: { type: Boolean, default: false },
      allow_negative_stock: { type: Boolean, default: false },
      default_costing_method: {
        type: String,
        enum: ['FIFO', 'MOVING_AVERAGE', 'AVERAGE_COST', 'STANDARD_COST'],
        default: 'MOVING_AVERAGE'
      }
    },
    operational_capabilities: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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
    calendar_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountingCalendar',
      default: null,
      index: true
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
    // Configurable Business Modules
    enabled_modules: {
      type: [String],
      default: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS']
    },
    // Module-specific company parameters
    modules_config: {
      franchise: {
        is_franchise: { type: Boolean, default: false },
        main_hub_party_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', default: null },
        franchise_share_pct: { type: Number, default: 70, min: 0, max: 100 },
        hub_share_pct: { type: Number, default: 30, min: 0, max: 100 },
        income_account_code: { type: String, default: '4200' },
        payable_account_code: { type: String, default: '2020' },
        settlement_account_code: { type: String, default: '1010' }
      },
      inventory: {
        multi_godown: { type: Boolean, default: false },
        batch_tracking: { type: Boolean, default: false },
        enable_barcodes: { type: Boolean, default: false }
      },
      pos: {
        default_counter: { type: String, default: 'COUNTER-1' },
        auto_print: { type: Boolean, default: true }
      },
      restaurant: {
        enable_kot: { type: Boolean, default: true },
        enable_tables: { type: Boolean, default: true }
      },
      hotel: {
        night_audit_time: { type: String, default: '00:00' },
        enable_rooms: { type: Boolean, default: true }
      },
      manufacturing: {
        enable_bom: { type: Boolean, default: true },
        track_scrap: { type: Boolean, default: true }
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
    collection: 'companies'
  }
);

const { CORE_MODULE_KEYS } = require('../config/moduleRegistry');

/**
 * Check if a business module is enabled for this company set of books.
 * Core accounting modules are always enabled.
 */
CompanySchema.methods.isModuleEnabled = function (moduleKey) {
  if (!moduleKey) return false;
  const normKey = String(moduleKey).toUpperCase().trim();
  if (CORE_MODULE_KEYS.includes(normKey)) return true;
  if (!Array.isArray(this.enabled_modules)) return false;
  return this.enabled_modules.some(m => String(m).toUpperCase().trim() === normKey);
};

// Enforce company_code uniqueness within each tenant
CompanySchema.index({ tenant_id: 1, company_code: 1 }, { unique: true });
CompanySchema.index({ tenant_id: 1, status: 1 });
CompanySchema.index({ tenant_id: 1, business_profile: 1 });

module.exports = mongoose.model('Company', CompanySchema);
