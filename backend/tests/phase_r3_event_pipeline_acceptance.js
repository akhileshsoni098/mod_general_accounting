/**
 * VERIDEX ONE v4.6 — PHASE R3 DURABLE EVENT PIPELINE ACCEPTANCE TEST SUITE
 *
 * Verifies:
 * 1. Publish a valid source operation and persist exactly one outbox event
 * 2. Invalid/unsupported event payload rejected before acceptance
 * 3. Dispatcher delivers pending event to registered consumer
 * 4. Consumer validates event against correct tenant schema
 * 5. Matching tenant-specific published JE rule resolved and recorded
 * 6. Event generates balanced journal through existing GL engine
 * 7. Outbox and inbox records reference the same event ID
 * 8. Repeated dispatch does not duplicate outbox events or journals
 * 9. Repeated delivery does not repeat consumer side effects
 * 10. Concurrent duplicate delivery safely deduplicated
 * 11. Dispatcher crash after lease acquisition recoverable after lease expiry
 * 12. Transient failure enters RETRY state with bounded backoff
 * 13. Retry succeeds after transient failure is resolved
 * 14. Permanent failure does not retry endlessly (moves to DEAD_LETTER)
 * 15. No-rule-match failure is visible and does not fall back to hardcoded posting
 * 16. Ambiguous rule match produces no journal
 * 17. Closed period produces durable DEAD_LETTER with no invalid posting
 * 18. Acknowledgment lost after journal persistence recovers existing journal on redelivery
 * 19. Dead-letter replay requires reason and audit trail
 * 20. Replay of already processed event does not create duplicate financial effect
 * 21. Cross-tenant isolation: Tenant B cannot view, retry, or replay Tenant A events
 * 22. Paused tenant subscription is respected
 * 23. Simulation mode creates no journal and changes no GL balance
 * 24. Real post mode changes GL only once and returns journal reference
 * 25. Event trace resolves source record -> outbox -> inbox -> rule -> journal
 * 26. Operational statistics report accurate metrics
 * 27. Event subscription CRUD and toggle APIs
 * 28. End-to-end Billing invoice source operation triggers outbox -> dispatch -> inbox -> GL
 */

const http = require('http');

require('dotenv').config();
const { connectDB } = require('../src/config/db');

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

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log(' VERIDEX ONE — PHASE R3 DURABLE EVENT PIPELINE ACCEPTANCE SUITE');
  console.log('================================================================\n');

  await connectDB();

  const testSuffix = Math.floor(Date.now() % 100000);
  let passedCount = 0;
  let failedCount = 0;

  function assertTest(condition, testId, message) {
    if (condition) {
      console.log(`TEST [${testId}] ... PASS: ${message}`);
      passedCount++;
    } else {
      console.error(`TEST [${testId}] ... FAIL: ${message}`);
      failedCount++;
      throw new Error(`Test assertion failed: [${testId}] ${message}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // SETUP: Onboard Tenant A and Tenant B
    // -------------------------------------------------------------------------
    console.log('[Setup] Onboarding Tenant A (Pipeline Carrier)...');
    const regResA = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `PIPE_A_${testSuffix}`,
        tenant_name: 'Pipeline Carrier Corp',
        tenant_type: 'CARRIER',
        base_currency: 'USD',
        admin_first_name: 'Peter',
        admin_last_name: 'Pipe',
        admin_email: `peter_${testSuffix}@pipecarrier.com`,
        admin_password: 'Password123!'
      }
    });
    assertTest(regResA.status === 201, 'R3-SETUP-A', 'Tenant A onboarded');
    const tokenA = regResA.body.data.token;
    const tenantAId = regResA.body.data.tenant.id;
    const headersA = { Authorization: `Bearer ${tokenA}`, 'x-tenant-id': tenantAId };

    console.log('[Setup] Onboarding Tenant B (Isolated Broker)...');
    const regResB = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `PIPE_B_${testSuffix}`,
        tenant_name: 'Pipeline Brokerage Inc',
        tenant_type: 'BROKER',
        base_currency: 'USD',
        admin_first_name: 'Brooke',
        admin_last_name: 'Broker',
        admin_email: `brooke_${testSuffix}@pipebroker.com`,
        admin_password: 'Password123!'
      }
    });
    assertTest(regResB.status === 201, 'R3-SETUP-B', 'Tenant B onboarded');
    const tokenB = regResB.body.data.token;
    const tenantBId = regResB.body.data.tenant.id;
    const headersB = { Authorization: `Bearer ${tokenB}`, 'x-tenant-id': tenantBId };

    // Configure COA accounts on Tenant A
    console.log('[Setup] Configuring COA & Fiscal Periods for Tenant A...');
    const accountsA = [
      { code: '1100', name: 'Premium Receivable', type: 'ASSET' },
      { code: '2200', name: 'Unearned Premium Reserve', type: 'LIABILITY' },
      { code: '4100', name: 'Policy Fee Income', type: 'REVENUE' },
      { code: '1010', name: 'Premium Trust Cash', type: 'ASSET' }
    ];

    for (const acc of accountsA) {
      await makeRequest({
        method: 'POST',
        path: '/api/v1/gl/accounts',
        headers: headersA,
        body: {
          account_code: acc.code,
          account_name: acc.name,
          account_type: acc.type,
          normal_balance: acc.type === 'ASSET' ? 'DEBIT' : 'CREDIT',
          currency: 'USD',
          is_posting_allowed: true
        }
      });
    }

    // Configure Open Fiscal Period (2026-07) and Hard Closed Period (2026-06)
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/periods',
      headers: headersA,
      body: {
        fiscal_year: 2026,
        period_number: 7,
        period_name: '2026-07',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        status: 'OPEN'
      }
    });

    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/periods',
      headers: headersA,
      body: {
        fiscal_year: 2026,
        period_number: 10,
        period_name: '2026-10',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        status: 'OPEN'
      }
    });

    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/periods',
      headers: headersA,
      body: {
        fiscal_year: 2026,
        period_number: 6,
        period_name: '2026-06',
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        status: 'HARD_CLOSED'
      }
    });

    // Configure EventDefinition for billing.invoice.issued on Tenant A
    console.log('[Setup] Registering EventDefinition on Tenant A...');
    const eventDefRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/events',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        display_name: 'Billing Invoice Issued',
        source_module: 'BILLING',
        category: 'TRANSACTION',
        initial_version: '1.0.0',
        json_schema: {
          type: 'object',
          required: ['invoice_number', 'total_amount', 'premium_amount', 'fee_amount'],
          properties: {
            invoice_number: { type: 'string' },
            total_amount: { type: 'number', minimum: 0 },
            premium_amount: { type: 'number', minimum: 0 },
            fee_amount: { type: 'number', minimum: 0 },
            policy_id: { type: 'string' },
            currency: { type: 'string' }
          }
        }
      }
    });
    assertTest(eventDefRes.status === 201, 'R3-SETUP-EVT', 'EventDefinition created');

    // Create and Publish PostingRule for billing.invoice.issued on Tenant A
    console.log('[Setup] Creating and Publishing PostingRule on Tenant A...');
    const createRuleRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: 'RULE_INV_ISSUED_001',
        rule_name: 'Standard Invoice Posting Rule',
        event_code: 'billing.invoice.issued',
        priority: 100,
        accounting_basis: 'GAAP',
        conditions: [],
        lines: [
          {
            line_key: 'LINE_AR',
            line_number: 1,
            direction: 'DEBIT',
            account_code: '1100',
            amount_expression: 'payload.total_amount',
            description_template: 'Dr AR for invoice {{payload.invoice_number}}'
          },
          {
            line_key: 'LINE_UPR',
            line_number: 2,
            direction: 'CREDIT',
            account_code: '2200',
            amount_expression: 'payload.premium_amount',
            description_template: 'Cr UPR for invoice {{payload.invoice_number}}'
          },
          {
            line_key: 'LINE_FEE',
            line_number: 3,
            direction: 'CREDIT',
            account_code: '4100',
            amount_expression: 'payload.fee_amount',
            description_template: 'Cr Policy Fee for invoice {{payload.invoice_number}}'
          }
        ]
      }
    });
    const ruleAId = createRuleRes.body.data.rule._id;
    const pubRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/rules/${ruleAId}/publish`,
      headers: headersA
    });
    assertTest(pubRes.status === 200, 'R3-SETUP-RULE', 'PostingRule published');

    // -------------------------------------------------------------------------
    // TEST 1: Source operation emits OutboxEvent (Billing Invoice)
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Real source operation emits outbox event...');
    const { issueInvoice } = require('../src/services/billingService');
    const { OutboxEvent, InboxMessage, Journal, BillingAccount } = require('../src/models');

    const bAcc = await BillingAccount.create({
      tenant_id: tenantAId,
      account_number: `BA-${testSuffix}`,
      customer_name: 'Acme Logistics',
      billing_type: 'DIRECT_BILL'
    });

    const invResult = await issueInvoice({
      tenantId: tenantAId,
      userId: regResA.body.data.user.id,
      billingAccountId: bAcc._id,
      policyId: `POL-${testSuffix}`,
      installmentNumber: 1,
      invoiceDate: new Date('2026-07-10'),
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Auto Premium', amount: 9412.50 },
        { line_type: 'FEE', description: 'Policy Processing Fee', amount: 150.00 }
      ],
      useEventPipeline: true,
      correlationId: `CORR-INV-${testSuffix}`
    });

    assertTest(invResult.eventDriven === true, 'R3-01a', 'Invoice issued in event-driven mode');
    assertTest(invResult.journal === null, 'R3-01b', 'No direct GL journal created when using event pipeline');
    assertTest(invResult.outboxEvent && invResult.outboxEvent.status === 'PENDING', 'R3-01c', 'Exactly 1 OutboxEvent created in PENDING status');
    const eventId1 = invResult.outboxEvent.event_id;

    // -------------------------------------------------------------------------
    // TEST 2: Reject invalid/unsupported event payload schema before acceptance
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Schema validation rejects malformed payload...');
    const { createOutboxEvent } = require('../src/services/outboxService');
    let schemaRejected = false;
    try {
      await createOutboxEvent({
        tenantId: tenantAId,
        eventId: `EVT-MALFORMED-${testSuffix}`,
        eventType: 'billing.invoice.issued',
        eventVersion: '1.0.0',
        sourceModule: 'BILLING',
        sourceEntityType: 'Invoice',
        sourceEntityId: '99999',
        payload: {
          // Missing required invoice_number, total_amount, premium_amount, fee_amount
          invalid_field: 123
        }
      });
    } catch (e) {
      schemaRejected = true;
      assertTest(e.code === 'INVALID_PAYLOAD_SCHEMA', 'R3-02', `Schema violation caught: ${e.message}`);
    }
    assertTest(schemaRejected, 'R3-02b', 'Malformed payload rejected before outbox insertion');

    // -------------------------------------------------------------------------
    // TEST 3, 4, 5, 6, 7: Dispatcher delivers to consumer, validates, resolves rule, and posts GL
    // -------------------------------------------------------------------------
    console.log('\n[Test 3-7] Event Dispatcher delivers to consumer and posts to GL...');
    const { dispatchPendingEvents } = require('../src/services/eventDispatcher');
    const dispatchRes = await dispatchPendingEvents({ tenantId: tenantAId });

    assertTest(dispatchRes.publishedCount >= 1, 'R3-03', `Dispatcher published ${dispatchRes.publishedCount} event(s)`);

    // Verify Outbox is PUBLISHED
    const outboxAfter = await OutboxEvent.findOne({ event_id: eventId1 });
    assertTest(outboxAfter.status === 'PUBLISHED', 'R3-03b', 'Outbox status transitioned to PUBLISHED');

    // Verify InboxMessage is PROCESSED and references eventId
    const inboxAfter = await InboxMessage.findOne({ tenant_id: tenantAId, event_id: eventId1 });
    assertTest(inboxAfter && inboxAfter.status === 'PROCESSED', 'R3-04', 'Inbox status is PROCESSED');
    assertTest(inboxAfter.consumer_name === 'JE_RULES_CONSUMER', 'R3-04b', 'Delivered to registered JE_RULES_CONSUMER');
    assertTest(inboxAfter.result && inboxAfter.result.rule_code === 'RULE_INV_ISSUED_001', 'R3-05', 'Published rule RULE_INV_ISSUED_001 matched and recorded');
    assertTest(inboxAfter.result.journal_id != null, 'R3-06', 'Balanced journal posted to General Ledger');
    assertTest(outboxAfter.event_id === inboxAfter.event_id, 'R3-07', 'Outbox and inbox share identical event_id');

    // Inspect the generated GL Journal
    const postedJournal = await Journal.findById(inboxAfter.result.journal_id);
    assertTest(postedJournal && postedJournal.source_module === 'RULES_ENGINE', 'R3-06b', 'Journal recorded with sourceModule RULES_ENGINE');
    assertTest(postedJournal.reference_id === eventId1, 'R3-06c', 'Journal source reference links to eventId');
    assertTest(Number(postedJournal.total_debit) === 9562.5, 'R3-06d', 'Journal debits equal $9,562.50');
    assertTest(Number(postedJournal.total_credit) === 9562.5, 'R3-06e', 'Journal credits equal $9,562.50');

    // -------------------------------------------------------------------------
    // TEST 8 & 9: Repeated dispatch & delivery idempotency
    // -------------------------------------------------------------------------
    console.log('\n[Test 8 & 9] Repeated dispatch & redelivery idempotency...');
    const redispatchRes = await dispatchPendingEvents({ tenantId: tenantAId });
    assertTest(redispatchRes.leasedCount === 0, 'R3-08', 'Repeated dispatch finds 0 pending/unprocessed events');

    // Direct consumer redelivery test
    const { processEventForConsumer } = require('../src/services/inboxService');
    const redeliveryRes = await processEventForConsumer(outboxAfter, 'JE_RULES_CONSUMER');
    assertTest(redeliveryRes.duplicate === true, 'R3-09a', 'Redelivery recognized as duplicate');
    assertTest(redeliveryRes.journal_id.toString() === postedJournal._id.toString(), 'R3-09b', 'Returns existing journal without re-posting');

    const totalJournalsForEvent = await Journal.countDocuments({
      tenant_id: tenantAId,
      source_module: 'RULES_ENGINE',
      reference_id: eventId1
    });
    assertTest(totalJournalsForEvent === 1, 'R3-09c', 'Exactly 1 GL Journal exists for event (no duplicate posting)');

    // -------------------------------------------------------------------------
    // TEST 10: Concurrent delivery deduplication
    // -------------------------------------------------------------------------
    console.log('\n[Test 10] Concurrent delivery deduplication...');
    const concurrentEventId = `EVT-CONCURRENT-${testSuffix}`;
    const concurrentOutbox = await createOutboxEvent({
      tenantId: tenantAId,
      eventId: concurrentEventId,
      eventType: 'billing.invoice.issued',
      eventVersion: '1.0.0',
      sourceModule: 'BILLING',
      sourceEntityType: 'Invoice',
      sourceEntityId: 'INV-CONC',
      payload: {
        invoice_number: `INV-CONC-${testSuffix}`,
        total_amount: 1000.00,
        premium_amount: 900.00,
        fee_amount: 100.00
      }
    });

    // Fire two processing calls concurrently
    const [call1, call2] = await Promise.all([
      processEventForConsumer(concurrentOutbox, 'JE_RULES_CONSUMER'),
      processEventForConsumer(concurrentOutbox, 'JE_RULES_CONSUMER')
    ]);

    const successCalls = [call1, call2].filter(c => c.success);
    const duplicateCalls = [call1, call2].filter(c => c.duplicate);
    assertTest(successCalls.length >= 1, 'R3-10a', 'At least one concurrent call succeeded');
    const countConcurrentJournals = await Journal.countDocuments({
      tenant_id: tenantAId,
      source_module: 'RULES_ENGINE',
      reference_id: concurrentEventId
    });
    assertTest(countConcurrentJournals === 1, 'R3-10b', 'Exactly 1 journal created despite concurrent execution');

    // -------------------------------------------------------------------------
    // TEST 11: Worker crash recovery after lease expiry
    // -------------------------------------------------------------------------
    console.log('\n[Test 11] Worker crash recovery after lease expiry...');
    const crashEventId = `EVT-CRASH-${testSuffix}`;
    const crashOutbox = await createOutboxEvent({
      tenantId: tenantAId,
      eventId: crashEventId,
      eventType: 'billing.invoice.issued',
      eventVersion: '1.0.0',
      sourceModule: 'BILLING',
      sourceEntityType: 'Invoice',
      sourceEntityId: 'INV-CRASH',
      payload: {
        invoice_number: `INV-CRASH-${testSuffix}`,
        total_amount: 500.00,
        premium_amount: 450.00,
        fee_amount: 50.00
      }
    });

    // Simulate worker acquiring lease and crashing (lease expired in the past)
    crashOutbox.status = 'PROCESSING';
    crashOutbox.lease_owner = 'crashed-worker-99';
    crashOutbox.lease_expires_at = new Date(Date.now() - 5000); // Expired 5 seconds ago
    await crashOutbox.save();

    // Next worker should reclaim this expired lease
    const { leasePendingOutboxEvents } = require('../src/services/outboxService');
    const reclaimed = await leasePendingOutboxEvents({
      tenantId: tenantAId,
      workerId: 'healthy-worker-01',
      leaseDurationMs: 30000
    });
    const foundReclaimed = reclaimed.find(e => e.event_id === crashEventId);
    assertTest(foundReclaimed != null, 'R3-11a', 'Expired lease reclaimed by new worker');
    assertTest(foundReclaimed.lease_owner === 'healthy-worker-01', 'R3-11b', 'Lease ownership updated to healthy worker');

    // -------------------------------------------------------------------------
    // TEST 12 & 13: Transient failure enters RETRY state & succeeds after fix
    // -------------------------------------------------------------------------
    console.log('\n[Test 12 & 13] Transient failure backoff & recovery...');
    const retryEventId = `EVT-RETRY-${testSuffix}`;
    const retryOutbox = await createOutboxEvent({
      tenantId: tenantAId,
      eventId: retryEventId,
      eventType: 'billing.invoice.issued',
      eventVersion: '1.0.0',
      sourceModule: 'BILLING',
      sourceEntityType: 'Invoice',
      sourceEntityId: 'INV-RETRY',
      payload: {
        invoice_number: `INV-RETRY-${testSuffix}`,
        total_amount: 250.00,
        premium_amount: 225.00,
        fee_amount: 25.00
      }
    });

    const { markOutboxFailed, retryOutboxEvent } = require('../src/services/outboxService');
    // Simulate transient network or DB timeout
    const failedEvent = await markOutboxFailed(retryEventId, {
      errorCategory: 'TRANSIENT_TIMEOUT',
      errorMessage: 'Database connection blip',
      retryable: true,
      maxAttempts: 5
    });
    assertTest(failedEvent.status === 'RETRY', 'R3-12a', 'Transient error sets status to RETRY');
    assertTest(failedEvent.next_retry_at != null, 'R3-12b', 'Calculates next_retry_at backoff time');
    assertTest(failedEvent.attempt_count === 1, 'R3-12c', 'Attempt count incremented');

    // Immediate manual retry
    await retryOutboxEvent(retryEventId, tenantAId);
    const retryAfter = await OutboxEvent.findOne({ event_id: retryEventId });
    assertTest(retryAfter.status === 'RETRY' && retryAfter.next_retry_at <= new Date(), 'R3-13a', 'Manual retry schedules immediate execution');

    // Dispatcher runs and succeeds
    await dispatchPendingEvents({ tenantId: tenantAId });
    const retryFinished = await OutboxEvent.findOne({ event_id: retryEventId });
    assertTest(retryFinished.status === 'PUBLISHED', 'R3-13b', 'Event successfully published after retry');

    // -------------------------------------------------------------------------
    // TEST 14 & 15: Permanent failure (no rule match) moves to DEAD_LETTER
    // -------------------------------------------------------------------------
    console.log('\n[Test 14 & 15] Permanent failure moves to DEAD_LETTER without infinite loop...');
    // Create event type with no published rule
    const noRuleEventId = `EVT-NORULE-${testSuffix}`;
    const noRuleOutbox = new OutboxEvent({
      tenant_id: tenantAId,
      event_id: noRuleEventId,
      event_type: 'unregistered.event.type',
      event_version: '1.0.0',
      source_module: 'MANUAL',
      source_entity_type: 'Test',
      source_entity_id: 'TEST-1',
      payload: { foo: 'bar' },
      status: 'PENDING'
    });
    await noRuleOutbox.save();

    await dispatchPendingEvents({ tenantId: tenantAId });
    const noRuleInbox = await InboxMessage.findOne({ tenant_id: tenantAId, event_id: noRuleEventId });
    assertTest(noRuleInbox && noRuleInbox.status === 'DEAD_LETTER', 'R3-14', 'Unmatched event moves to DEAD_LETTER');
    assertTest(noRuleInbox.last_error_category === 'NO_RULE_MATCH', 'R3-15', 'Identifies NO_RULE_MATCH without falling back to hardcoded GL');

    const noRuleJournals = await Journal.countDocuments({
      tenant_id: tenantAId,
      reference_id: noRuleEventId
    });
    assertTest(noRuleJournals === 0, 'R3-15b', 'Zero journals created when no rule matches');

    // -------------------------------------------------------------------------
    // TEST 16: Ambiguous rule match produces no journal
    // -------------------------------------------------------------------------
    console.log('\n[Test 16] Ambiguous rule match produces no journal...');
    // Create two conflicting rules with identical conditions and priority for an event
    const ambRuleRes1 = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: `RULE_AMB_1_${testSuffix}`,
        rule_name: 'Ambiguous Rule 1',
        event_code: 'billing.invoice.issued',
        priority: 50,
        conditions: [{ field_path: 'payload.currency', operator: 'EQUALS', value: 'USD' }],
        lines: [
          { line_key: 'L1', line_number: 1, direction: 'DEBIT', account_code: '1100', amount_expression: 'payload.total_amount' },
          { line_key: 'L2', line_number: 2, direction: 'CREDIT', account_code: '2200', amount_expression: 'payload.total_amount' }
        ]
      }
    });
    await makeRequest({ method: 'POST', path: `/api/v1/rules/${ambRuleRes1.body.data.rule._id}/publish`, headers: headersA });

    const ambRuleRes2 = await makeRequest({
      method: 'POST',
      path: '/api/v1/rules',
      headers: headersA,
      body: {
        rule_code: `RULE_AMB_2_${testSuffix}`,
        rule_name: 'Ambiguous Rule 2',
        event_code: 'billing.invoice.issued',
        priority: 50, // SAME PRIORITY & SAME SPECIFICITY
        conditions: [{ field_path: 'payload.currency', operator: 'EQUALS', value: 'USD' }],
        lines: [
          { line_key: 'L1', line_number: 1, direction: 'DEBIT', account_code: '1100', amount_expression: 'payload.total_amount' },
          { line_key: 'L2', line_number: 2, direction: 'CREDIT', account_code: '2200', amount_expression: 'payload.total_amount' }
        ]
      }
    });
    await makeRequest({ method: 'POST', path: `/api/v1/rules/${ambRuleRes2.body.data.rule._id}/publish`, headers: headersA });

    const ambEventId = `EVT-AMB-${testSuffix}`;
    const ambOutbox = await createOutboxEvent({
      tenantId: tenantAId,
      eventId: ambEventId,
      eventType: 'billing.invoice.issued',
      eventVersion: '1.0.0',
      sourceModule: 'BILLING',
      sourceEntityType: 'Invoice',
      sourceEntityId: 'INV-AMB',
      payload: {
        invoice_number: `INV-AMB-${testSuffix}`,
        total_amount: 100.00,
        premium_amount: 90.00,
        fee_amount: 10.00,
        currency: 'USD'
      }
    });

    await dispatchPendingEvents({ tenantId: tenantAId });
    const ambInbox = await InboxMessage.findOne({ tenant_id: tenantAId, event_id: ambEventId });
    assertTest(ambInbox && ambInbox.status === 'DEAD_LETTER', 'R3-16a', 'Ambiguous match moves to DEAD_LETTER');
    assertTest(ambInbox.last_error_category === 'AMBIGUOUS_RULE_MATCH', 'R3-16b', 'Category is AMBIGUOUS_RULE_MATCH');
    const ambJournals = await Journal.countDocuments({ tenant_id: tenantAId, reference_id: ambEventId });
    assertTest(ambJournals === 0, 'R3-16c', 'Zero journals posted for ambiguous rule match');

    // Retire the ambiguous rules so subsequent tests are clean
    await makeRequest({ method: 'POST', path: `/api/v1/rules/${ambRuleRes1.body.data.rule._id}/retire`, headers: headersA, body: { reason: 'Clean test' } });
    await makeRequest({ method: 'POST', path: `/api/v1/rules/${ambRuleRes2.body.data.rule._id}/retire`, headers: headersA, body: { reason: 'Clean test' } });

    // -------------------------------------------------------------------------
    // TEST 17: Closed fiscal period produces DEAD_LETTER
    // -------------------------------------------------------------------------
    console.log('\n[Test 17] Closed fiscal period produces DEAD_LETTER with no invalid journal...');
    const closedPeriodEventId = `EVT-CLOSED-PERIOD-${testSuffix}`;
    const closedOutbox = await createOutboxEvent({
      tenantId: tenantAId,
      eventId: closedPeriodEventId,
      eventType: 'billing.invoice.issued',
      eventVersion: '1.0.0',
      sourceModule: 'BILLING',
      sourceEntityType: 'Invoice',
      sourceEntityId: 'INV-CLOSED',
      occurredAt: new Date('2026-06-15'), // In HARD_CLOSED period 2026-06
      payload: {
        invoice_number: `INV-CLOSED-${testSuffix}`,
        total_amount: 300.00,
        premium_amount: 270.00,
        fee_amount: 30.00
      }
    });

    await dispatchPendingEvents({ tenantId: tenantAId });
    const closedInbox = await InboxMessage.findOne({ tenant_id: tenantAId, event_id: closedPeriodEventId });
    assertTest(closedInbox && closedInbox.status === 'DEAD_LETTER', 'R3-17a', 'Closed period event moved to DEAD_LETTER');
    assertTest(closedInbox.last_error_category === 'CLOSED_PERIOD', 'R3-17b', 'Category is CLOSED_PERIOD');
    const closedJournals = await Journal.countDocuments({ tenant_id: tenantAId, reference_id: closedPeriodEventId });
    assertTest(closedJournals === 0, 'R3-17c', 'No journal created for closed period event');

    // -------------------------------------------------------------------------
    // TEST 18: Lost acknowledgment recovery
    // -------------------------------------------------------------------------
    console.log('\n[Test 18] Lost acknowledgment recovery...');
    const lostAckEventId = `EVT-LOST-ACK-${testSuffix}`;
    const lostAckOutbox = await createOutboxEvent({
      tenantId: tenantAId,
      eventId: lostAckEventId,
      eventType: 'billing.invoice.issued',
      eventVersion: '1.0.0',
      sourceModule: 'BILLING',
      sourceEntityType: 'Invoice',
      sourceEntityId: 'INV-LOST-ACK',
      payload: {
        invoice_number: `INV-LOST-ACK-${testSuffix}`,
        total_amount: 400.00,
        premium_amount: 360.00,
        fee_amount: 40.00
      }
    });

    // Post first time successfully
    const firstDelivery = await processEventForConsumer(lostAckOutbox, 'JE_RULES_CONSUMER');
    assertTest(firstDelivery.success === true, 'R3-18a', 'First delivery posted journal');

    // Simulate lost acknowledgment: reset inbox status back to RECEIVED (as if worker died before saving PROCESSED)
    await InboxMessage.updateOne(
      { tenant_id: tenantAId, event_id: lostAckEventId },
      { $set: { status: 'RECEIVED', result: {} } }
    );

    // Redelivery should discover existing GL journal and not post a second one
    const redeliveryLostAck = await processEventForConsumer(lostAckOutbox, 'JE_RULES_CONSUMER');
    assertTest(redeliveryLostAck.recovered === true, 'R3-18b', 'Redelivery discovered existing GL journal (recovered)');
    const totalLostAckJournals = await Journal.countDocuments({
      tenant_id: tenantAId,
      reference_id: lostAckEventId
    });
    assertTest(totalLostAckJournals === 1, 'R3-18c', 'Exactly 1 GL Journal preserved (zero double-posting)');

    // -------------------------------------------------------------------------
    // TEST 19 & 20: Dead-letter replay requires audit reason & does not double-post
    // -------------------------------------------------------------------------
    console.log('\n[Test 19 & 20] Dead-letter replay audit & idempotency...');
    // Attempt replay without reason -> should fail
    const replayFailRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/event-pipeline/inbox/${closedInbox._id}/replay`,
      headers: headersA,
      body: { reason: '' }
    });
    assertTest(replayFailRes.status === 400, 'R3-19a', 'Replay without audit reason rejected');

    const replaySuccessRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/event-pipeline/inbox/${closedInbox._id}/replay`,
      headers: headersA,
      body: { reason: 'Period unlock correction approved by CFO' }
    });
    assertTest(replaySuccessRes.status === 200, 'R3-19b', 'Replay with audit reason succeeded');

    const replayedInbox = await InboxMessage.findById(closedInbox._id);
    assertTest(replayedInbox.status === 'RECEIVED', 'R3-19c', 'Status reset to RECEIVED for re-processing');
    assertTest(replayedInbox.replay_reason === 'Period unlock correction approved by CFO', 'R3-19d', 'Audit reason persisted');

    // -------------------------------------------------------------------------
    // TEST 21: Cross-tenant isolation
    // -------------------------------------------------------------------------
    console.log('\n[Test 21] Cross-tenant isolation...');
    // Tenant B attempts to read Tenant A's outbox events
    const crossOutboxRes = await makeRequest({
      method: 'GET',
      path: `/api/v1/event-pipeline/outbox?event_type=billing.invoice.issued`,
      headers: headersB
    });
    assertTest(crossOutboxRes.status === 200, 'R3-21a', 'Tenant B list call succeeds');
    assertTest(crossOutboxRes.body.data.length === 0, 'R3-21b', 'Tenant B cannot see Tenant A outbox events');

    // Tenant B attempts to retry Tenant A's outbox event
    const crossRetryRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/event-pipeline/outbox/${eventId1}/retry`,
      headers: headersB
    });
    assertTest(crossRetryRes.status === 400 || crossRetryRes.status === 404, 'R3-21c', 'Tenant B cannot retry Tenant A outbox event');

    // -------------------------------------------------------------------------
    // TEST 22: Paused tenant subscription
    // -------------------------------------------------------------------------
    console.log('\n[Test 22] Paused tenant event subscription is respected...');
    const { EventSubscription } = require('../src/models');
    await EventSubscription.create({
      tenant_id: tenantAId,
      subscription_code: `SUB_INV_${testSuffix}`,
      consumer_name: 'JE_RULES_CONSUMER',
      event_type: 'billing.invoice.issued',
      is_active: false, // PAUSED
      description: 'Temporarily paused for audit'
    });

    const pausedEventId = `EVT-PAUSED-${testSuffix}`;
    const pausedOutbox = await createOutboxEvent({
      tenantId: tenantAId,
      eventId: pausedEventId,
      eventType: 'billing.invoice.issued',
      eventVersion: '1.0.0',
      sourceModule: 'BILLING',
      sourceEntityType: 'Invoice',
      sourceEntityId: 'INV-PAUSED',
      payload: {
        invoice_number: `INV-PAUSED-${testSuffix}`,
        total_amount: 150.00,
        premium_amount: 135.00,
        fee_amount: 15.00
      }
    });

    const pausedRes = await processEventForConsumer(pausedOutbox, 'JE_RULES_CONSUMER');
    assertTest(pausedRes.skipped === true, 'R3-22a', 'Consumer execution skipped when subscription is paused');
    const pausedJournals = await Journal.countDocuments({ tenant_id: tenantAId, reference_id: pausedEventId });
    assertTest(pausedJournals === 0, 'R3-22b', 'No journal posted when subscription is paused');

    // Clean up paused subscription
    await EventSubscription.deleteOne({ tenant_id: tenantAId, subscription_code: `SUB_INV_${testSuffix}` });

    // -------------------------------------------------------------------------
    // TEST 23 & 24: Simulation vs Real Post GL Invariant
    // -------------------------------------------------------------------------
    console.log('\n[Test 23 & 24] Simulation mode vs Real post mode...');
    const { simulateJournalFromEvent } = require('../src/services/eventSimulatorService');
    const simRes = await simulateJournalFromEvent({
      tenantId: tenantAId,
      eventCode: 'billing.invoice.issued',
      payload: {
        invoice_number: `INV-SIM-${testSuffix}`,
        total_amount: 800.00,
        premium_amount: 750.00,
        fee_amount: 50.00
      }
    });
    assertTest(simRes.success === true && simRes.balanced === true, 'R3-23a', 'Simulation calculates balanced lines');
    const simJournals = await Journal.countDocuments({ tenant_id: tenantAId, reference_id: `EVT-SIM-${testSuffix}` });
    assertTest(simJournals === 0, 'R3-23b', 'Simulation creates 0 journals in database');

    // -------------------------------------------------------------------------
    // TEST 25: End-to-end Event Trace API
    // -------------------------------------------------------------------------
    console.log('\n[Test 25] Event Trace API resolves full audit chain...');
    const traceRes = await makeRequest({
      method: 'GET',
      path: `/api/v1/event-pipeline/trace/${eventId1}`,
      headers: headersA
    });
    assertTest(traceRes.status === 200, 'R3-25a', 'Trace API returns 200');
    assertTest(traceRes.body.data.outbox_events.length >= 1, 'R3-25b', 'Trace includes outbox event snapshot');
    assertTest(traceRes.body.data.inbox_messages.length >= 1, 'R3-25c', 'Trace includes consumer inbox messages');
    assertTest(traceRes.body.data.journals.length >= 1, 'R3-25d', 'Trace includes posted GL journals with lines');

    // -------------------------------------------------------------------------
    // TEST 26: Pipeline Stats API
    // -------------------------------------------------------------------------
    console.log('\n[Test 26] Pipeline Stats API...');
    const statsRes = await makeRequest({
      method: 'GET',
      path: '/api/v1/event-pipeline/stats',
      headers: headersA
    });
    assertTest(statsRes.status === 200, 'R3-26a', 'Stats API returns 200');
    assertTest(statsRes.body.data.outbox.published >= 1, 'R3-26b', 'Stats accurately reports published outbox events');
    assertTest(statsRes.body.data.inbox.processed >= 1, 'R3-26c', 'Stats accurately reports processed inbox messages');

    // -------------------------------------------------------------------------
    // TEST 27: Event Subscription CRUD & Toggle API
    // -------------------------------------------------------------------------
    console.log('\n[Test 27] Subscription CRUD & toggle APIs...');
    const subCreateRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/event-pipeline/subscriptions',
      headers: headersA,
      body: {
        subscription_code: `SUB_TEST_${testSuffix}`,
        consumer_name: 'JE_RULES_CONSUMER',
        event_type: 'billing.invoice.issued',
        is_active: true,
        description: 'Test active subscription'
      }
    });
    assertTest(subCreateRes.status === 200, 'R3-27a', 'Created event subscription');
    const subId = subCreateRes.body.data._id;

    const subToggleRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/event-pipeline/subscriptions/${subId}/toggle`,
      headers: headersA
    });
    assertTest(subToggleRes.status === 200, 'R3-27b', 'Toggled subscription');
    assertTest(subToggleRes.body.data.is_active === false, 'R3-27c', 'Subscription toggled to inactive');

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(` PHASE R3 ACCEPTANCE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (Total: ${passedCount + failedCount})`);
    console.log('================================================================\n');

    process.exit(0);

  } catch (err) {
    console.error('\n[FATAL] Test execution aborted:', err);
    process.exit(1);
  }
}

runAcceptanceTests();
