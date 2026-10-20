const { PostingRuleTestCase, PostingRule, EventDefinition } = require('../models');
const { simulateJournalFromEvent } = require('../services/eventSimulatorService');

// List test cases for tenant
async function getTestCases(req, res) {
  try {
    const tenantId = req.tenantId;
    const { posting_rule_id } = req.query;

    const query = { tenant_id: tenantId };
    if (posting_rule_id) query.posting_rule_id = posting_rule_id;

    const cases = await PostingRuleTestCase.find(query).sort({ created_at: -1 });
    return res.success(cases);
  } catch (err) {
    return res.error('Failed to list rule test cases', 500, err.message);
  }
}

// Create test case
async function createTestCase(req, res) {
  try {
    const tenantId = req.tenantId;
    const {
      posting_rule_id,
      test_name,
      description,
      event_definition_id,
      schema_version = '1.0.0',
      input_payload,
      expected_outcome
    } = req.body;

    if (!posting_rule_id || !test_name || !input_payload) {
      return res.error('posting_rule_id, test_name, and input_payload are required', 400);
    }

    const testCase = await PostingRuleTestCase.create({
      tenant_id: tenantId,
      posting_rule_id,
      test_name: test_name.trim(),
      description: description || '',
      event_definition_id: event_definition_id || null,
      schema_version,
      input_payload,
      expected_outcome: expected_outcome || {}
    });

    return res.success(testCase, { message: 'Rule test case created' }, 201);
  } catch (err) {
    return res.error('Failed to create rule test case', 500, err.message);
  }
}

// Run test case (Without posting journals or modifying GL balances)
async function runTestCase(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const testCase = await PostingRuleTestCase.findOne({ _id: id, tenant_id: tenantId });
    if (!testCase) {
      return res.error('Test case not found', 404);
    }

    const rule = await PostingRule.findOne({ _id: testCase.posting_rule_id });
    if (!rule) {
      return res.error('Referenced posting rule not found', 404);
    }

    const simResult = await simulateJournalFromEvent({
      tenantId,
      eventCode: rule.event_code,
      schemaVersion: testCase.schema_version,
      occurrenceDate: new Date(),
      payload: testCase.input_payload
    });

    const errors = [];
    if (!simResult.success) {
      errors.push(...(simResult.errors || ['Simulation failed']));
    }

    if (testCase.expected_outcome) {
      if (testCase.expected_outcome.expected_total_debit && simResult.total_debit !== testCase.expected_outcome.expected_total_debit) {
        errors.push(`Total debit mismatch: expected $${testCase.expected_outcome.expected_total_debit}, got $${simResult.total_debit}`);
      }
      if (testCase.expected_outcome.expected_total_credit && simResult.total_credit !== testCase.expected_outcome.expected_total_credit) {
        errors.push(`Total credit mismatch: expected $${testCase.expected_outcome.expected_total_credit}, got $${simResult.total_credit}`);
      }
    }

    const passed = errors.length === 0;

    testCase.last_run_result = {
      status: passed ? 'PASSED' : 'FAILED',
      run_at: new Date(),
      errors,
      actual_total_debit: simResult.total_debit || '0.00',
      actual_total_credit: simResult.total_credit || '0.00'
    };
    await testCase.save();

    return res.success({
      testCase,
      simResult,
      passed,
      errors
    });
  } catch (err) {
    return res.error('Failed to run test case', 500, err.message);
  }
}

module.exports = {
  getTestCases,
  createTestCase,
  runTestCase
};
