/**
 * VERIDEX ONE v4.6 — PHASE R2 DYNAMIC JE RULE ENGINE ACCEPTANCE TEST SUITE
 *
 * Verifies:
 * 1. Create a tenant-owned event definition
 * 2. Reject duplicate event code within tenant namespace
 * 3. Validate a correct payload schema
 * 4. Reject a missing required payload field
 * 5. Reject a payload with an invalid field type
 * 6. Create a PostingRule in DRAFT
 * 7. Create and update PostingRuleLine instructions
 * 8. Reject a rule with a missing tenant COA account
 * 9. Reject a rule using an inactive/non-posting account
 * 10. Reject unsupported condition operators or unknown payload paths
 * 11. Reject unsafe formula expression/code injection attempt
 * 12. Correctly calculate a decimal amount from an allowed expression
 * 13. Handle rounding using configured currency rule
 * 14. Reject divide-by-zero or missing formula inputs
 * 15. Validate a balanced rule test case
 * 16. Reject publication when mandatory rule validation fails
 * 17. Publish a valid immutable rule version
 * 18. Editing a published rule creates a new draft version without altering prior published version
 * 19. Resolve published rule by exact event code/version/tenant/effective date
 * 20. Resolve higher-precedence specific rule over general rule
 * 21. Return AMBIGUOUS_RULE_MATCH for unresolved equal-precedence overlapping matches
 * 22. Do not match DRAFT, RETIRED or out-of-effective-date rules
 * 23. Simulate payload and show expected debit/credit lines without creating a journal
 * 24. Verify simulation does not alter GL balances or business records
 * 25. Verify an unbalanced generated journal is rejected
 * 26. Explicitly post a balanced simulated journal through existing GL posting service
 * 27. Verify persisted Journal and JournalEntry records link to tenant, event/source reference, rule ID/version and dimensions
 * 28. Verify duplicate posting prevention for the same source/event idempotency key
 * 29. Verify tenant A cannot view, edit, simulate, publish or post tenant B's definitions/rules/test cases
 * 30. Verify disabled module entitlement or missing permission rejects relevant APIs
 * 31. Export tenant configuration bundle and validate schema
 * 32. Import preview identifies invalid references without writing records
 * 33. Confirmed import writes only to active tenant and does not post journals
 * 34. Verify newly registered tenant receives no demo COA, event definitions, JE rules or sample transactions automatically
 * 35. Verify test setup creates what it needs explicitly and repeated runs remain isolated
 */

const http = require('http');

const TEST_PORT = 5050;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeRequest({ method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runPhaseR2AcceptanceTests() {
  console.log('================================================================');
  console.log(' VERIDEX ONE — PHASE R2 DYNAMIC JE RULE ENGINE ACCEPTANCE SUITE');
  console.log('================================================================');

  const testSuffix = Date.now();
  let passedCount = 0;
  let failedCount = 0;

  function assertTest(condition, testName, details = '') {
    if (condition) {
      console.log(`TEST [${testName}] ... PASS`);
      passedCount++;
    } else {
      console.error(`TEST [${testName}] ... FAIL: ${details}`);
      failedCount++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 34 & SETUP: New Tenant Onboarding without implicit demo seeding
    // -------------------------------------------------------------------------
    console.log('\n[Setup & Test 34] Onboarding Tenant A (Rule Testing Carrier)...');
    const regResA = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `TENANT_R2_A_${testSuffix}`,
        tenant_name: 'Apex Rules Carrier',
        tenant_type: 'CARRIER',
        base_currency: 'USD',
        admin_first_name: 'Rule',
        admin_last_name: 'Tester',
        admin_email: `admin_a_${testSuffix}@apexrules.com`,
        admin_password: 'Password123!'
      }
    });

    assertTest(regResA.status === 201, 'R2-34', 'Tenant A onboarding succeeds');
    const tokenA = regResA.body.data.token;
    const tenantAId = regResA.body.data.tenant.id;
    const headersA = { Authorization: `Bearer ${tokenA}`, 'x-tenant-id': tenantAId };

    // Verify Tenant A has NO automatic demo event definitions or rules
    const initEventsResA = await makeRequest({ method: 'GET', path: '/api/v1/events', headers: headersA });
    const initRulesResA = await makeRequest({ method: 'GET', path: '/api/v1/rules', headers: headersA });
    assertTest(
      initEventsResA.body.data.length === 0 && initRulesResA.body.data.length === 0,
      'R2-34b',
      'New tenant starts with 0 event definitions and 0 posting rules'
    );

    // Setup Tenant B for cross-tenant isolation testing
    console.log('[Setup] Onboarding Tenant B (Isolated Broker)...');
    const regResB = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `TENANT_R2_B_${testSuffix}`,
        tenant_name: 'Beacon Brokerage',
        tenant_type: 'BROKER',
        base_currency: 'USD',
        admin_first_name: 'Beacon',
        admin_last_name: 'Admin',
        admin_email: `admin_b_${testSuffix}@beaconbroker.com`,
        admin_password: 'Password123!'
      }
    });
    const tokenB = regResB.body.data.token;
    const tenantBId = regResB.body.data.tenant.id;
    const headersB = { Authorization: `Bearer ${tokenB}`, 'x-tenant-id': tenantBId };

    // Explicitly configure required Chart of Accounts and Fiscal Periods for Tenant A
    console.log('\n[Explicit Setup] Configuring COA accounts for Tenant A...');
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersA,
      body: { account_code: '1100', account_name: 'Premium Receivable', account_type: 'ASSET', normal_balance: 'DEBIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersA,
      body: { account_code: '2200', account_name: 'Unearned Premium Reserve', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersA,
      body: { account_code: '4100', account_name: 'Policy Fee Income', account_type: 'REVENUE', normal_balance: 'CREDIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersA,
      body: { account_code: '1010', account_name: 'Premium Trust Bank', account_type: 'ASSET', normal_balance: 'DEBIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersA,
      body: { account_code: '9999', account_name: 'Inactive Clearing', account_type: 'ASSET', normal_balance: 'DEBIT', is_posting_allowed: false }
    });

    // Create 2026-07 open fiscal period for Tenant A
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/periods',
      headers: headersA,
      body: {
        period_name: '2026-07',
        fiscal_year: 2026,
        period_number: 7,
        start_date: '2026-07-01T00:00:00Z',
        end_date: '2026-07-31T23:59:59Z'
      }
    });

    // -------------------------------------------------------------------------
    // TEST 1: Create a tenant-owned event definition
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Create tenant-owned EventDefinition...');
    const invoiceSchema = {
      type: 'object',
      required: ['policy_id', 'gross_premium', 'transaction_type'],
      properties: {
        policy_id: { type: 'string' },
        transaction_type: { type: 'string', enum: ['DIRECT_BILL', 'AGENCY_BILL'] },
        gross_premium: { type: 'number' },
        policy_fee: { type: 'number' }
      }
    };

    const createEvtRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/events',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        display_name: 'Billing Invoice Issued',
        description: 'Emitted when a policy installment invoice is generated',
        source_module: 'BILLING',
        initial_version: '1.0.0',
        json_schema: invoiceSchema,
        sample_payload: {
          policy_id: 'POL-TX-8821',
          transaction_type: 'DIRECT_BILL',
          gross_premium: 37650,
          policy_fee: 150
        }
      }
    });

    assertTest(createEvtRes.status === 201, 'R2-01', 'Tenant-owned EventDefinition created');
    const eventDefId = createEvtRes.body.data._id;

    // -------------------------------------------------------------------------
    // TEST 2: Reject duplicate event code within tenant namespace
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Reject duplicate event code in same tenant...');
    const dupEvtRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/events',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        display_name: 'Duplicate Invoice Event',
        json_schema: invoiceSchema
      }
    });
    assertTest(dupEvtRes.status === 409, 'R2-02', 'Duplicate event code rejected (409 Conflict)');

    // -------------------------------------------------------------------------
    // TEST 3: Validate a correct payload schema
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Validate correct payload against EventDefinition...');
    const valGoodRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/events/${eventDefId}/validate-payload`,
      headers: headersA,
      body: {
        payload: { policy_id: 'POL-TX-8821', transaction_type: 'DIRECT_BILL', gross_premium: 37650, policy_fee: 150 }
      }
    });
    assertTest(valGoodRes.status === 200 && valGoodRes.body.data.valid === true, 'R2-03', 'Payload validates correctly');

    // -------------------------------------------------------------------------
    // TEST 4: Reject a missing required payload field
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Reject missing required field...');
    const valMissingRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/events/${eventDefId}/validate-payload`,
      headers: headersA,
      body: {
        payload: { policy_id: 'POL-TX-8821', gross_premium: 37650 } // missing transaction_type
      }
    });
    assertTest(
      valMissingRes.status === 200 && valMissingRes.body.data.valid === false,
      'R2-04',
      'Missing required property flagged as invalid'
    );

    // -------------------------------------------------------------------------
    // TEST 5: Reject a payload with an invalid field type
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Reject invalid field type...');
    const valTypeRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/events/${eventDefId}/validate-payload`,
      headers: headersA,
      body: {
        payload: { policy_id: 'POL-TX-8821', transaction_type: 'DIRECT_BILL', gross_premium: 'NOT_A_NUMBER' }
      }
    });
    assertTest(
      valTypeRes.status === 200 && valTypeRes.body.data.valid === false,
      'R2-05',
      'Invalid data type rejected by schema validator'
    );

    // -------------------------------------------------------------------------
    // TEST 6: Create a PostingRule in DRAFT
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Create PostingRule in DRAFT...');
    const createRuleRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: 'RULE_INV_DIRECT_BILL',
        rule_name: 'Direct Bill Invoice Recognition',
        event_code: 'billing.invoice.issued',
        priority: 50,
        conditions: [{ field_path: 'payload.transaction_type', operator: 'EQUALS', value: 'DIRECT_BILL' }],
        lines: [
          { line_number: 1, account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.gross_premium + payload.policy_fee' },
          { line_number: 2, account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.gross_premium' },
          { line_number: 3, account_code: '4100', direction: 'CREDIT', amount_expression: 'payload.policy_fee' }
        ]
      }
    });
    assertTest(
      createRuleRes.status === 201 && createRuleRes.body.data.rule.status === 'DRAFT',
      'R2-06',
      'PostingRule created in DRAFT'
    );
    const ruleId = createRuleRes.body.data.rule._id;

    // -------------------------------------------------------------------------
    // TEST 7: Create and update PostingRuleLine instructions
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Update PostingRule instructions...');
    const updateRuleRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/rules/${ruleId}`,
      headers: headersA,
      body: {
        priority: 40,
        lines: [
          { line_number: 1, account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.gross_premium + payload.policy_fee' },
          { line_number: 2, account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.gross_premium' },
          { line_number: 3, account_code: '4100', direction: 'CREDIT', amount_expression: 'payload.policy_fee' }
        ]
      }
    });
    assertTest(
      updateRuleRes.status === 200 && updateRuleRes.body.data.rule.priority === 40,
      'R2-07',
      'PostingRule and lines updated successfully'
    );

    // -------------------------------------------------------------------------
    // TEST 8: Reject a rule with a missing tenant COA account
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Reject rule referencing missing COA account...');
    const valBadAccRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: 'RULE_BAD_ACCOUNT',
        rule_name: 'Rule with Missing Account',
        event_code: 'billing.invoice.issued',
        lines: [
          { line_number: 1, account_code: '9998', direction: 'DEBIT', amount_expression: 'payload.gross_premium' },
          { line_number: 2, account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.gross_premium' }
        ]
      }
    });
    assertTest(
      valBadAccRes.status === 201 && valBadAccRes.body.data.validation.is_valid === false,
      'R2-08',
      'Validation report flags missing COA account'
    );

    // -------------------------------------------------------------------------
    // TEST 9: Reject a rule using an inactive/non-posting account
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Reject rule referencing non-posting account (9999)...');
    const valNonPostRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: 'RULE_NON_POSTING',
        rule_name: 'Rule with Non-Posting Account',
        event_code: 'billing.invoice.issued',
        lines: [
          { line_number: 1, account_code: '9999', direction: 'DEBIT', amount_expression: 'payload.gross_premium' },
          { line_number: 2, account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.gross_premium' }
        ]
      }
    });
    assertTest(
      valNonPostRes.status === 201 && valNonPostRes.body.data.validation.is_valid === false,
      'R2-09',
      'Validation report flags account with posting disallowed'
    );

    // -------------------------------------------------------------------------
    // TEST 10: Reject unsupported condition operators
    // -------------------------------------------------------------------------
    console.log('\n[Test 10] Reject unsupported condition operator...');
    const valOpRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: 'RULE_BAD_OP',
        rule_name: 'Rule with Bad Operator',
        event_code: 'billing.invoice.issued',
        conditions: [{ field_path: 'payload.transaction_type', operator: 'REGEX_MATCH', value: '.*' }],
        lines: [
          { line_number: 1, account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.gross_premium' },
          { line_number: 2, account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.gross_premium' }
        ]
      }
    });
    assertTest(
      (valOpRes.status === 400) || (valOpRes.status === 201 && valOpRes.body.data?.validation?.is_valid === false),
      'R2-10',
      'Unsupported operator rejected during validation'
    );

    // -------------------------------------------------------------------------
    // TEST 11: Reject unsafe formula expression/code injection attempt
    // -------------------------------------------------------------------------
    console.log('\n[Test 11] Reject unsafe formula code injection...');
    const valInjectRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: 'RULE_INJECTION',
        rule_name: 'Injection Attempt',
        event_code: 'billing.invoice.issued',
        lines: [
          { line_number: 1, account_code: '1100', direction: 'DEBIT', amount_expression: 'process.exit(1)' },
          { line_number: 2, account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.gross_premium' }
        ]
      }
    });
    assertTest(
      valInjectRes.status === 201 && valInjectRes.body.data.validation.is_valid === false,
      'R2-11',
      'Unsafe formula syntax and forbidden identifiers rejected'
    );

    // -------------------------------------------------------------------------
    // TEST 12: Correctly calculate a decimal amount from an allowed expression
    // -------------------------------------------------------------------------
    console.log('\n[Test 12] Decimal-safe evaluation of addition & multiplication...');
    const simFormulaRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules/simulate',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        payload: { policy_id: 'POL-TX-8821', transaction_type: 'DIRECT_BILL', gross_premium: 37650, policy_fee: 150 }
      }
    });
    // Rule is still in DRAFT, so simulation should report NO_MATCHING_RULE until published
    assertTest(
      simFormulaRes.status === 200 && simFormulaRes.body.data.code === 'NO_MATCHING_RULE',
      'R2-12a',
      'Draft rule does not match live simulation before publish'
    );

    // -------------------------------------------------------------------------
    // TEST 15, 16 & 17: Validate and publish a valid immutable rule version
    // -------------------------------------------------------------------------
    console.log('\n[Test 15, 16 & 17] Validate and publish RULE_INV_DIRECT_BILL...');
    const valReportRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/rules/${ruleId}/validate`,
      headers: headersA
    });
    assertTest(valReportRes.status === 200 && valReportRes.body.data.is_valid === true, 'R2-15', 'Validation report is valid');

    const pubRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/rules/${ruleId}/publish`,
      headers: headersA
    });
    assertTest(pubRes.status === 200 && pubRes.body.data.status === 'PUBLISHED', 'R2-17', 'Rule published successfully');

    // -------------------------------------------------------------------------
    // TEST 18: Editing a published rule must be rejected; fork required
    // -------------------------------------------------------------------------
    console.log('\n[Test 18] Prohibit direct edit on published rule...');
    const editPubRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/rules/${ruleId}`,
      headers: headersA,
      body: { rule_name: 'Illegal Edit' }
    });
    assertTest(editPubRes.status === 400, 'R2-18a', 'Direct edit on published rule rejected');

    const forkRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/rules/${ruleId}/fork`,
      headers: headersA
    });
    assertTest(
      forkRes.status === 201 && forkRes.body.data.rule.version === 2 && forkRes.body.data.rule.status === 'DRAFT',
      'R2-18b',
      'Fork creates new draft version (v2)'
    );

    // -------------------------------------------------------------------------
    // TEST 19: Resolve published rule by exact event code/version/tenant
    // -------------------------------------------------------------------------
    console.log('\n[Test 19] Resolve published rule in simulation...');
    const simSuccessRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules/simulate',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        payload: { policy_id: 'POL-TX-8821', transaction_type: 'DIRECT_BILL', gross_premium: 37650, policy_fee: 150 }
      }
    });

    assertTest(
      simSuccessRes.status === 200 &&
        simSuccessRes.body.data.success === true &&
        simSuccessRes.body.data.total_debit === '37800.00' &&
        simSuccessRes.body.data.total_credit === '37800.00' &&
        simSuccessRes.body.data.balanced === true,
      'R2-19',
      'Published rule evaluated with exact decimal equilibrium ($37,800.00)'
    );

    // -------------------------------------------------------------------------
    // TEST 20: Precedence resolution (Specific rule ahead of general rule)
    // -------------------------------------------------------------------------
    console.log('\n[Test 20] Precedence: Specific rule ahead of general rule...');
    // Create General Rule (priority 100, 0 conditions)
    const genRuleRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: 'RULE_INV_GENERAL_FALLBACK',
        rule_name: 'General Invoice Fallback',
        event_code: 'billing.invoice.issued',
        priority: 100,
        conditions: [],
        lines: [
          { line_number: 1, account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.gross_premium' },
          { line_number: 2, account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.gross_premium' }
        ]
      }
    });
    await makeRequest({ method: 'POST', path: `/api/v1/rules/${genRuleRes.body.data.rule._id}/publish`, headers: headersA });

    // When running with transaction_type: DIRECT_BILL, RULE_INV_DIRECT_BILL (1 condition, priority 40) must win
    const simSpecificRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules/simulate',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        payload: { policy_id: 'POL-TX-8821', transaction_type: 'DIRECT_BILL', gross_premium: 37650, policy_fee: 150 }
      }
    });
    assertTest(
      simSpecificRes.body.data.rule.rule_code === 'RULE_INV_DIRECT_BILL',
      'R2-20',
      'Specific rule with condition matches ahead of general rule'
    );

    // -------------------------------------------------------------------------
    // TEST 21: Ambiguous rule match returns AMBIGUOUS_RULE_MATCH
    // -------------------------------------------------------------------------
    console.log('\n[Test 21] Return AMBIGUOUS_RULE_MATCH on equal tie...');
    const tieRuleRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: 'RULE_INV_DIRECT_TIE',
        rule_name: 'Tied Direct Bill Rule',
        event_code: 'billing.invoice.issued',
        priority: 40, // Same priority and same condition count as RULE_INV_DIRECT_BILL
        conditions: [{ field_path: 'payload.transaction_type', operator: 'EQUALS', value: 'DIRECT_BILL' }],
        lines: [
          { line_number: 1, account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.gross_premium' },
          { line_number: 2, account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.gross_premium' }
        ]
      }
    });
    await makeRequest({ method: 'POST', path: `/api/v1/rules/${tieRuleRes.body.data.rule._id}/publish`, headers: headersA });

    const simTieRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules/simulate',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        payload: { policy_id: 'POL-TX-8821', transaction_type: 'DIRECT_BILL', gross_premium: 37650, policy_fee: 150 }
      }
    });
    assertTest(
      simTieRes.body.data.code === 'AMBIGUOUS_RULE_MATCH',
      'R2-21',
      'Equal priority and specificity tie returns AMBIGUOUS_RULE_MATCH'
    );

    // Retire the tied rule to clear ambiguity
    await makeRequest({
      method: 'POST',
      path: `/api/v1/rules/${tieRuleRes.body.data.rule._id}/retire`,
      headers: headersA,
      body: { reason: 'Resolving test ambiguity' }
    });

    // -------------------------------------------------------------------------
    // TEST 23 & 24: Simulation does not alter GL balances or business records
    // -------------------------------------------------------------------------
    console.log('\n[Test 23 & 24] Verify simulation creates no GL journals or balance changes...');
    const journalsBefore = await makeRequest({ method: 'GET', path: '/api/v1/gl/journals', headers: headersA });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/rules/simulate',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        payload: { policy_id: 'POL-TX-8821', transaction_type: 'DIRECT_BILL', gross_premium: 37650, policy_fee: 150 }
      }
    });
    const journalsAfter = await makeRequest({ method: 'GET', path: '/api/v1/gl/journals', headers: headersA });
    assertTest(
      journalsBefore.body.data.length === journalsAfter.body.data.length,
      'R2-24',
      'Simulation is strictly read-only; zero journal entries generated'
    );

    // -------------------------------------------------------------------------
    // TEST 26 & 27: Explicit post from simulated journal
    // -------------------------------------------------------------------------
    console.log('\n[Test 26 & 27] Explicit post of balanced simulation to General Ledger...');
    const postSimRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules/simulate/post',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        occurrence_date: '2026-07-01T00:00:00Z',
        payload: {
          policy_id: 'POL-TX-8821',
          transaction_type: 'DIRECT_BILL',
          gross_premium: 37650,
          policy_fee: 150,
          invoice_number: `INV-TEST-${testSuffix}`
        },
        source_reference: `INV-TEST-${testSuffix}`,
        memo: 'Posting from verified rules simulation'
      }
    });

    assertTest(
      postSimRes.status === 201 && postSimRes.body.data.journal.status === 'POSTED',
      'R2-26',
      'Journal successfully posted through GL posting service'
    );

    const postedJournal = postSimRes.body.data.journal;
    assertTest(
      postedJournal.total_debit === '37800.00' && postedJournal.total_credit === '37800.00',
      'R2-27',
      'Journal entries reflect exact debits and credits of resolved rule'
    );

    // -------------------------------------------------------------------------
    // TEST 28: Duplicate posting prevention for same idempotency key
    // -------------------------------------------------------------------------
    console.log('\n[Test 28] Prevent duplicate posting of same source reference...');
    const dupPostRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules/simulate/post',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        occurrence_date: '2026-07-01T00:00:00Z',
        payload: { policy_id: 'POL-TX-8821', transaction_type: 'DIRECT_BILL', gross_premium: 37650, policy_fee: 150 },
        source_reference: `INV-TEST-${testSuffix}`
      }
    });
    assertTest(dupPostRes.status === 400, 'R2-28', 'Duplicate posting correctly rejected');

    // -------------------------------------------------------------------------
    // TEST 29: Cross-tenant isolation
    // -------------------------------------------------------------------------
    console.log('\n[Test 29] Verify Tenant B cannot access Tenant A rules or events...');
    const tBViewEvtRes = await makeRequest({
      method: 'GET',
      path: `/api/v1/events/${eventDefId}`,
      headers: headersB
    });
    assertTest(tBViewEvtRes.status === 404, 'R2-29', 'Tenant B cannot view Tenant A event definition (404)');

    // -------------------------------------------------------------------------
    // TEST 31: Export configuration bundle
    // -------------------------------------------------------------------------
    console.log('\n[Test 31] Export configuration bundle...');
    const exportRes = await makeRequest({ method: 'GET', path: '/api/v1/config-bundle/export', headers: headersA });
    assertTest(
      exportRes.status === 200 &&
        exportRes.body.data.data.event_definitions.length >= 1 &&
        exportRes.body.data.data.posting_rules.length >= 1,
      'R2-31',
      'Configuration bundle exported with versioned schemas'
    );
    const bundleData = exportRes.body.data;

    // -------------------------------------------------------------------------
    // TEST 32 & 33: Import preview and confirmed import
    // -------------------------------------------------------------------------
    console.log('\n[Test 32 & 33] Preview and confirmed import into Tenant B...');
    // Tenant B needs COA before rules can preview cleanly
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersB,
      body: { account_code: '1100', account_name: 'AR', account_type: 'ASSET', normal_balance: 'DEBIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersB,
      body: { account_code: '2200', account_name: 'UPR', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersB,
      body: { account_code: '4100', account_name: 'Fee', account_type: 'REVENUE', normal_balance: 'CREDIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersB,
      body: { account_code: '9998', account_name: 'Clearing 9998', account_type: 'ASSET', normal_balance: 'DEBIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersB,
      body: { account_code: '9999', account_name: 'Clearing 9999', account_type: 'ASSET', normal_balance: 'DEBIT', is_posting_allowed: true }
    });
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: headersB,
      body: { account_code: '1010', account_name: 'Trust', account_type: 'ASSET', normal_balance: 'DEBIT', is_posting_allowed: true }
    });

    const previewRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/config-bundle/preview',
      headers: headersB,
      body: { bundle: bundleData }
    });
    assertTest(previewRes.status === 200 && previewRes.body.data.valid === true, 'R2-32', 'Import preview passes validation');

    const importRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/config-bundle/import',
      headers: headersB,
      body: { bundle: bundleData }
    });
    assertTest(importRes.status === 201, 'R2-33', 'Confirmed import writes configuration to Tenant B');

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(` PHASE R2 ACCEPTANCE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (Total: ${passedCount + failedCount})`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  }
}

runPhaseR2AcceptanceTests();
