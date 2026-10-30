const mongoose = require('mongoose');

const InterestRuleSchema = new mongoose.Schema(
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
    rule_name: {
      type: String,
      required: true,
      trim: true
    },
    party_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      default: null, // null means company-wide default
      index: true
    },
    rate_percent_per_annum: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 18 // 18% per annum standard commercial rate
    },
    grace_period_days: {
      type: Number,
      default: 0,
      min: 0
    },
    calculation_basis: {
      type: String,
      enum: ['365_DAYS', '360_DAYS'],
      default: '365_DAYS'
    },
    interest_type: {
      type: String,
      enum: ['SIMPLE', 'COMPOUND'],
      default: 'SIMPLE'
    },
    receivable_ledger_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null
    },
    interest_income_ledger_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'interest_rules'
  }
);

InterestRuleSchema.index({ tenant_id: 1, company_id: 1, rule_name: 1 }, { unique: true });

module.exports = mongoose.model('InterestRule', InterestRuleSchema);
