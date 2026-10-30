const mongoose = require('mongoose');

const DepreciationHistorySchema = new mongoose.Schema(
  {
    period_name: {
      type: String,
      required: true // e.g. "2026-10"
    },
    posting_date: {
      type: Date,
      default: Date.now
    },
    depreciation_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    book_value_after: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    }
  },
  { _id: false }
);

const DisposalDetailsSchema = new mongoose.Schema(
  {
    disposal_date: {
      type: Date,
      default: Date.now
    },
    sale_proceeds: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    accumulated_depreciation: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    gain_or_loss: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    }
  },
  { _id: false }
);

const FixedAssetSchema = new mongoose.Schema(
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
    asset_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "AST-OVEN-001"
    },
    asset_name: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      enum: ['EQUIPMENT', 'FURNITURE', 'VEHICLE', 'BUILDING', 'COMPUTERS', 'OTHER'],
      default: 'EQUIPMENT'
    },
    asset_account_code: {
      type: String,
      required: true,
      default: '1410' // Plant, Machinery & Equipment
    },
    accumulated_depreciation_account_code: {
      type: String,
      required: true,
      default: '1490' // Accumulated Depreciation
    },
    depreciation_expense_account_code: {
      type: String,
      required: true,
      default: '5000' // General & Admin / Depreciation Expense
    },
    acquisition_date: {
      type: Date,
      required: true
    },
    acquisition_cost: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    salvage_value: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    useful_life_months: {
      type: Number,
      required: true,
      min: 1
    },
    depreciation_method: {
      type: String,
      enum: ['SLM', 'WDV'],
      default: 'SLM'
    },
    annual_rate_percent: {
      type: Number,
      default: 0
    },
    current_book_value: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    depreciation_history: [DepreciationHistorySchema],
    disposal_details: DisposalDetailsSchema,
    status: {
      type: String,
      enum: ['ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED', 'WRITTEN_OFF'],
      default: 'ACTIVE'
    },
    notes: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'fixed_assets'
  }
);

FixedAssetSchema.index({ tenant_id: 1, company_id: 1, asset_code: 1 }, { unique: true });

module.exports = mongoose.model('FixedAsset', FixedAssetSchema);
