const mongoose = require('mongoose');

const PostingRuleTestCaseSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    posting_rule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PostingRule',
      required: true,
      index: true
    },
    test_name: {
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
      default: null
    },
    schema_version: {
      type: String,
      default: '1.0.0'
    },
    input_payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    expected_outcome: {
      matches_rule: { type: Boolean, default: true },
      expected_rule_code: { type: String, default: null },
      expected_lines: [
        {
          account_code: String,
          direction: { type: String, enum: ['DEBIT', 'CREDIT'] },
          amount: String
        }
      ],
      expected_total_debit: String,
      expected_total_credit: String
    },
    last_run_result: {
      status: { type: String, enum: ['PASSED', 'FAILED', 'PENDING'], default: 'PENDING' },
      run_at: Date,
      errors: [String],
      actual_total_debit: String,
      actual_total_credit: String
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'posting_rule_test_cases'
  }
);

PostingRuleTestCaseSchema.index({ tenant_id: 1, posting_rule_id: 1 });

module.exports = mongoose.model('PostingRuleTestCase', PostingRuleTestCaseSchema);
