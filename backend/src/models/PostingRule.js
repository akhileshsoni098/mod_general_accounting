const mongoose = require('mongoose');

const ConditionClauseSchema = new mongoose.Schema(
  {
    field_path: {
      type: String,
      required: true,
      trim: true // e.g. "transaction.type", "policy.line_of_business", "amount.currency"
    },
    operator: {
      type: String,
      required: true,
      enum: ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'GREATER_THAN', 'LESS_THAN', 'EXISTS'],
      uppercase: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  },
  { _id: false }
);

const PostingRuleSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null, // null = system default rule template
      index: true
    },
    rule_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "RULE_INV_PREMIUM_DIRECT"
    },
    rule_name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    event_definition_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventDefinition',
      default: null,
      index: true
    },
    event_code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true // e.g. "billing.invoice.issued"
    },
    event_version_pattern: {
      type: String,
      default: '1.0.0' // exact or semver pattern
    },
    event_type: {
      // Retained for legacy backward compatibility
      type: String,
      trim: true,
      uppercase: true,
      default: null
    },
    applicable_module: {
      type: String,
      enum: ['GL', 'BILLING_AR', 'COMMISSIONS_FIDUCIARY', 'TREASURY_BANK_REC', 'FINANCE_CLOSE', 'POLICY', 'CLAIMS', 'REINSURANCE'],
      default: 'GL'
    },
    accounting_basis: {
      type: String,
      enum: ['GAAP', 'STATUTORY', 'TAX'],
      default: 'GAAP'
    },
    tenant_type_applicability: {
      type: [String],
      enum: ['CARRIER', 'MGA', 'BROKER', 'OTHER'],
      default: ['CARRIER', 'MGA', 'BROKER', 'OTHER']
    },
    priority: {
      type: Number,
      default: 100 // lower number = higher precedence (1 = highest, 100 = default)
    },
    conditions: [ConditionClauseSchema],
    effective_from: {
      type: Date,
      default: () => new Date('2020-01-01')
    },
    effective_to: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['DRAFT', 'VALIDATED', 'PUBLISHED', 'RETIRED', 'ACTIVE', 'INACTIVE'],
      default: 'DRAFT',
      index: true
    },
    version: {
      type: Number,
      default: 1
    },
    parent_rule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PostingRule',
      default: null
    },
    published_at: {
      type: Date,
      default: null
    },
    published_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    retired_at: {
      type: Date,
      default: null
    },
    retired_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    retirement_reason: {
      type: String,
      default: ''
    },
    validation_report: {
      is_valid: { type: Boolean, default: false },
      validated_at: Date,
      errors: [String],
      warnings: [String]
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'posting_rules'
  }
);

PostingRuleSchema.index({ tenant_id: 1, rule_code: 1, version: 1 }, { unique: true });
PostingRuleSchema.index({ tenant_id: 1, event_code: 1, status: 1 });
PostingRuleSchema.index({ tenant_id: 1, priority: 1 });

module.exports = mongoose.model('PostingRule', PostingRuleSchema);
