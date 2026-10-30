const mongoose = require('mongoose');

const BudgetLineSchema = new mongoose.Schema(
  {
    ledger_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      required: true
    },
    annual_budget_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    monthly_breakdown: [
      {
        month: { type: Number, min: 1, max: 12 },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true }
      }
    ]
  },
  { _id: false }
);

const BudgetDefinitionSchema = new mongoose.Schema(
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
    budget_name: {
      type: String,
      required: true,
      trim: true
    },
    fiscal_year: {
      type: String,
      required: true,
      trim: true // e.g. "2026"
    },
    cost_center_dimension_value: {
      type: String,
      default: null,
      trim: true
    },
    lines: [BudgetLineSchema],
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
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
    collection: 'budget_definitions'
  }
);

BudgetDefinitionSchema.index(
  { tenant_id: 1, company_id: 1, budget_name: 1, fiscal_year: 1 },
  { unique: true }
);

module.exports = mongoose.model('BudgetDefinition', BudgetDefinitionSchema);
