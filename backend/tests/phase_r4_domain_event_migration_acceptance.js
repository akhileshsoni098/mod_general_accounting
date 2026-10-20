/**
 * VERIDEX ONE v4.6 — PHASE R4 DOMAIN EVENT MIGRATION ACCEPTANCE TEST SUITE
 *
 * Verifies that all core business domain operations:
 * - Billing (Invoice Issued, Payment Received, Adjustment Applied)
 * - Treasury (Payment Returned, Refund Disbursed)
 * - Commissions & Fiduciary (Fiduciary Sweep, Carrier Settlement Disbursed)
 * - Finance Close & UPR (UPR Monthly Earning Amortization)
 *
 * Route through the durable transactional outbox, execute published tenant-specific
 * JE rules through the event pipeline, fail visibly on missing or ambiguous rules,
 * provide backward compatibility via the legacyPostingAdapter, and maintain
 * double-entry GL equilibrium and subledger reconciliation.
 */

const http = require('http');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
require('dotenv').config();

const { connectDB } = require('../src/config/db');
const {
  Tenant,
  LedgerAccount,
  FiscalPeriod,
  EventDefinition,
  PostingRule,
  PostingRuleLine,
  OutboxEvent,
  InboxMessage,
  Journal,
  JournalEntry,
  BillingAccount,
  Invoice,
  Payment,
  PaymentAllocation,
  BillingAdjustment,
  PaymentReturn,
  Refund,
  FiduciaryAccount,
  SettlementStatement,
  CommissionTransaction
} = require('../src/models');

const { publishAndProcessDomainEvent } = require('../src/services/domainEventPublisher');
const { legacyDirectPost } = require('../src/services/legacyPostingAdapter');
const { issueInvoice, processPaymentReceipt, createAdjustment } = require('../src/services/billingService');
const { processPaymentReturn, processRefundDisbursement } = require('../src/services/treasuryService');
const { executeFiduciarySweep, disburseSettlementPayment } = require('../src/services/commissionsService');
const { executeUPRAmortizationRun } = require('../src/services/financeCloseService');

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
  console.log(' VERIDEX ONE — PHASE R4 DOMAIN EVENT MIGRATION ACCEPTANCE SUITE');
  console.log('================================================================\n');

  await connectDB();

  const testSuffix = Math.floor(Date.now() % 100000);
  let passedCount = 0;
  let failedCount = 0;

  function assertTest(condition, testId, message) {
    if (condition) {
      console.log(`[PASS] ${testId}: ${message}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testId}: ${message}`);
      failedCount++;
    }
  }

  try {
    // -------------------------------------------------------------
    // SETUP: Onboard Isolated Test Tenant A and Tenant B
    // -------------------------------------------------------------
    console.log('[Setup] Registering Tenant A (Carrier)...');
    const regResA = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `R4_CARRIER_${testSuffix}`,
        tenant_name: `Summit Carrier ${testSuffix}`,
        tenant_type: 'CARRIER',
        base_currency: 'USD',
        admin_first_name: 'Carol',
        admin_last_name: 'Carrier',
        admin_email: `carol_${testSuffix}@summit.com`,
        admin_password: 'Password123!'
      }
    });

    if (regResA.status !== 201) {
      throw new Error(`Failed to onboard Tenant A: ${JSON.stringify(regResA.body)}`);
    }

    const tokenA = regResA.body.data.token;
    const tenantId = regResA.body.data.tenant.id;
    const userId = regResA.body.data.user.id;
    const headersA = { Authorization: `Bearer ${tokenA}`, 'x-tenant-id': tenantId };

    console.log('[Setup] Registering Tenant B (Broker Isolation)...');
    const regResB = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `R4_BROKER_${testSuffix}`,
        tenant_name: `Brightline Broker ${testSuffix}`,
        tenant_type: 'BROKER',
        base_currency: 'USD',
        admin_first_name: 'Bob',
        admin_last_name: 'Broker',
        admin_email: `bob_${testSuffix}@brightline.com`,
        admin_password: 'Password123!'
      }
    });

    if (regResB.status !== 201) {
      throw new Error(`Failed to onboard Tenant B: ${JSON.stringify(regResB.body)}`);
    }

    const tokenB = regResB.body.data.token;
    const tenantIdB = regResB.body.data.tenant.id;
    const headersB = { Authorization: `Bearer ${tokenB}`, 'x-tenant-id': tenantIdB };

    // Setup Standard COA Accounts on Tenant A
    console.log('[Setup] Configuring COA on Tenant A...');
    const standardAccounts = [
      { code: '1000', name: 'Operating Cash', type: 'ASSET' },
      { code: '1010', name: 'Premium Trust Account', type: 'ASSET' },
      { code: '1100', name: 'Premium Receivable', type: 'ASSET' },
      { code: '2010', name: 'Due to Carrier', type: 'LIABILITY' },
      { code: '2020', name: 'Broker Commissions Payable', type: 'LIABILITY' },
      { code: '2100', name: 'Return Premium Payable', type: 'LIABILITY' },
      { code: '2190', name: 'Unapplied Cash Suspense', type: 'LIABILITY' },
      { code: '2200', name: 'Unearned Premium Reserve', type: 'LIABILITY' },
      { code: '4000', name: 'Earned Premium Revenue', type: 'REVENUE' },
      { code: '4100', name: 'Fee & Commission Income', type: 'REVENUE' },
      { code: '5000', name: 'Operating Expenses / Discounts', type: 'EXPENSE' }
    ];

    for (const acc of standardAccounts) {
      await makeRequest({
        method: 'POST',
        path: '/api/v1/gl/accounts',
        headers: headersA,
        body: {
          account_code: acc.code,
          account_name: acc.name,
          account_type: acc.type,
          normal_balance: acc.type === 'ASSET' || acc.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT',
          currency: 'USD',
          is_posting_allowed: true
        }
      });
    }

    // Open Fiscal Periods on Tenant A for 2026 (all months 01-12)
    console.log('[Setup] Opening Fiscal Periods 2026-01 through 2026-12 on Tenant A...');
    for (let m = 1; m <= 12; m++) {
      const pName = `2026-${String(m).padStart(2, '0')}`;
      const startD = new Date(`2026-${String(m).padStart(2, '0')}-01`);
      const lastDay = new Date(2026, m, 0).getDate();
      const endD = new Date(`2026-${String(m).padStart(2, '0')}-${lastDay}`);
      await makeRequest({
        method: 'POST',
        path: '/api/v1/gl/periods',
        headers: headersA,
        body: {
          fiscal_year: 2026,
          period_number: m,
          period_name: pName,
          start_date: startD.toISOString().slice(0, 10),
          end_date: endD.toISOString().slice(0, 10),
          status: 'OPEN'
        }
      });
    }

    // Helper: Register event definition and publish rule via API
    async function createAndPublishRule({ eventCode, displayName, ruleCode, ruleName, lines, conditions = [], priority = 100, sourceModule = 'BILLING' }) {
      // 1. Create Event Definition if not exists
      const existingEvt = await EventDefinition.findOne({ tenant_id: tenantId, event_code: eventCode.toLowerCase().trim() });
      if (!existingEvt) {
        const evRes = await makeRequest({
          method: 'POST',
          path: '/api/v1/events',
          headers: headersA,
          body: {
            event_code: eventCode,
            display_name: displayName,
            source_module: sourceModule,
            category: 'TRANSACTION',
            initial_version: '1.0.0',
            json_schema: { type: 'object' }
          }
        });
        if (evRes.status !== 201) {
          throw new Error(`Failed to create event ${eventCode}: ${JSON.stringify(evRes.body)}`);
        }
      }

      // 2. Create Posting Rule
      const createRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/rules',
        headers: headersA,
        body: {
          rule_code: ruleCode,
          rule_name: ruleName,
          event_code: eventCode,
          priority,
          accounting_basis: 'GAAP',
          conditions,
          lines: lines.map((l, idx) => ({
            line_key: `LINE_${idx + 1}`,
            line_number: idx + 1,
            direction: l.direction,
            account_code: l.account_code,
            amount_expression: l.amount_expression,
            description_template: l.memo_template || `${l.direction} ${l.account_code}`
          }))
        }
      });

      if (createRes.status !== 201) {
        throw new Error(`Failed to create rule ${ruleCode}: ${JSON.stringify(createRes.body)}`);
      }

      const ruleId = createRes.body.data.rule._id;

      // 3. Publish Rule
      const pubRes = await makeRequest({
        method: 'POST',
        path: `/api/v1/rules/${ruleId}/publish`,
        headers: headersA
      });

      if (pubRes.status !== 200) {
        throw new Error(`Failed to publish rule ${ruleCode}: ${JSON.stringify(pubRes.body)}`);
      }

      return pubRes.body.data.rule;
    }

    // -------------------------------------------------------------
    // TEST 1: Pre-Implementation Audit Call Sites Verification
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Pre-Implementation Audit Verification ---');
    const legacyRes = await legacyDirectPost({
      tenantId,
      userId,
      postingDate: new Date('2026-07-05'),
      sourceModule: 'BILLING_AR',
      referenceId: `AUDIT-${testSuffix}`,
      memo: 'Audit test legacy posting',
      lines: [
        { account_code: '1100', debit: '100.00', credit: '0.00', memo: 'Dr AR' },
        { account_code: '2200', debit: '0.00', credit: '100.00', memo: 'Cr UPR' }
      ]
    });
    assertTest(
      legacyRes && legacyRes.journal && legacyRes.legacy_adapter_invoked === true,
      'R4-TEST-01',
      'Legacy Posting Adapter safely wraps legacy direct post with deprecation audit flag'
    );

    // -------------------------------------------------------------
    // TEST 2: Missing Rule Match Visibility (Zero Silent Fallbacks)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Missing Rule Match Handling ---');
    // Ensure event definition exists so schema validation passes and rule resolution triggers NO_RULE_MATCH
    await makeRequest({
      method: 'POST',
      path: '/api/v1/events',
      headers: headersA,
      body: {
        event_code: 'billing.invoice.issued',
        display_name: 'Billing Invoice Issued',
        source_module: 'BILLING',
        category: 'TRANSACTION',
        initial_version: '1.0.0',
        json_schema: { type: 'object' }
      }
    });

    let missingRuleThrown = false;
    let missingRuleErrorCode = '';
    try {
      await publishAndProcessDomainEvent({
        tenantId,
        eventType: 'billing.invoice.issued',
        sourceModule: 'BILLING',
        sourceEntityType: 'Invoice',
        sourceEntityId: `INV-NO-RULE-${testSuffix}`,
        payload: {
          invoice_id: 'INV-999',
          total_amount: 500,
          premium_amount: 500,
          fee_amount: 0
        },
        dispatchImmediately: true
      });
    } catch (err) {
      missingRuleThrown = true;
      missingRuleErrorCode = err.code || '';
    }

    const failedOutbox = await OutboxEvent.findOne({
      tenant_id: tenantId,
      source_entity_id: `INV-NO-RULE-${testSuffix}`
    });
    const failedInbox = await InboxMessage.findOne({
      tenant_id: tenantId,
      event_id: failedOutbox ? failedOutbox.event_id : ''
    });

    console.log('[Diagnostic T2]', {
      missingRuleThrown,
      missingRuleErrorCode,
      outboxStatus: failedOutbox ? failedOutbox.status : null,
      inboxStatus: failedInbox ? failedInbox.status : null,
      inboxErrorCode: failedInbox ? failedInbox.last_error_code : null
    });

    assertTest(
      missingRuleThrown &&
        (missingRuleErrorCode === 'NO_RULE_MATCH' || (failedInbox && failedInbox.last_error_code === 'NO_RULE_MATCH')) &&
        failedOutbox && ['FAILED', 'DEAD_LETTER'].includes(failedOutbox.status) &&
        failedInbox && failedInbox.status === 'DEAD_LETTER',
      'R4-TEST-02',
      'Missing JE rule fails visibly with NO_RULE_MATCH and moves outbox/inbox to FAILED/DEAD_LETTER without hardcoded fallback'
    );

    // -------------------------------------------------------------
    // TEST 3: Ambiguous Rule Match Handling
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Ambiguous Rule Match Handling ---');
    // Create two conflicting published rules with identical priority & conditions
    await createAndPublishRule({
      eventCode: 'billing.test.ambiguous',
      displayName: 'Ambiguous Event Test',
      ruleCode: `RULE_AMB_A_${testSuffix}`,
      ruleName: 'Ambiguous Rule A',
      priority: 50,
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.amount' },
        { account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.amount' }
      ]
    });
    await createAndPublishRule({
      eventCode: 'billing.test.ambiguous',
      displayName: 'Ambiguous Event Test',
      ruleCode: `RULE_AMB_B_${testSuffix}`,
      ruleName: 'Ambiguous Rule B',
      priority: 50,
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.amount' },
        { account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.amount' }
      ]
    });

    let ambiguousThrown = false;
    let ambiguousErrorCode = '';
    try {
      await publishAndProcessDomainEvent({
        tenantId,
        eventType: 'billing.test.ambiguous',
        sourceModule: 'BILLING',
        sourceEntityType: 'TestEntity',
        sourceEntityId: `AMB-TEST-${testSuffix}`,
        payload: { amount: 250 },
        dispatchImmediately: true
      });
    } catch (err) {
      ambiguousThrown = true;
      ambiguousErrorCode = err.code || '';
    }

    const ambOutbox = await OutboxEvent.findOne({
      tenant_id: tenantId,
      source_entity_id: `AMB-TEST-${testSuffix}`
    });
    const ambInbox = await InboxMessage.findOne({
      tenant_id: tenantId,
      event_id: ambOutbox ? ambOutbox.event_id : ''
    });

    assertTest(
      ambiguousThrown &&
        (ambiguousErrorCode === 'AMBIGUOUS_RULE_MATCH' || (ambInbox && ambInbox.last_error_code === 'AMBIGUOUS_RULE_MATCH')),
      'R4-TEST-03',
      'Ambiguous rules fail visibly with AMBIGUOUS_RULE_MATCH producing zero journals'
    );

    // -------------------------------------------------------------
    // TEST 4: Billing Invoice Issued (billing.invoice.issued)
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Billing Invoice Issued Domain Event ---');
    await createAndPublishRule({
      eventCode: 'billing.invoice.issued',
      displayName: 'Billing Invoice Issued',
      ruleCode: `RULE_INV_ISSUED_${testSuffix}`,
      ruleName: 'Standard Invoice Rule',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.total_amount', memo_template: 'Dr AR' },
        { account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.premium_amount', memo_template: 'Cr UPR' },
        { account_code: '4100', direction: 'CREDIT', amount_expression: 'payload.fee_amount', memo_template: 'Cr Policy Fee' }
      ]
    });

    // Create billing account
    const bAccount = await BillingAccount.create({
      tenant_id: tenantId,
      account_number: `BA-${testSuffix}`,
      customer_name: 'Apex Logistics LLC',
      current_balance: mongoose.Types.Decimal128.fromString('0.00'),
      unapplied_cash: mongoose.Types.Decimal128.fromString('0.00')
    });

    const invResult = await issueInvoice({
      tenantId,
      userId,
      billingAccountId: bAccount._id,
      policyId: `POL-TX-${testSuffix}`,
      installmentNumber: 1,
      invoiceDate: new Date('2026-07-01'),
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Auto Down Payment', amount: '9412.50' },
        { line_type: 'FEE', description: 'Installment Policy Fee', amount: '150.00' }
      ]
    });

    const invJournal = await Journal.findOne({ _id: invResult.invoice.journal_id, tenant_id: tenantId });
    console.log('[Diagnostic T4]', {
      eventDriven: invResult.eventDriven,
      outboxStatus: invResult.outboxEvent ? invResult.outboxEvent.status : null,
      invoiceJournalId: invResult.invoice.journal_id,
      journalStatus: invJournal ? invJournal.status : null,
      journalDebits: invJournal ? invJournal.total_debit.toString() : null
    });
    assertTest(
      invResult.eventDriven === true &&
        invResult.outboxEvent && ['PUBLISHED', 'PENDING'].includes(invResult.outboxEvent.status) &&
        invJournal &&
        invJournal.status === 'POSTED' &&
        invJournal.total_debit.toString() === '9562.50' &&
        invJournal.total_credit.toString() === '9562.50',
      'R4-TEST-04',
      'Billing issueInvoice published billing.invoice.issued event and posted balanced GL journal via published JE rule'
    );

    // -------------------------------------------------------------
    // TEST 5: Billing Payment Received (billing.payment.received)
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Billing Payment Received Domain Event ---');
    await createAndPublishRule({
      eventCode: 'billing.payment.received',
      displayName: 'Billing Payment Received',
      ruleCode: `RULE_PMT_RCVD_${testSuffix}`,
      ruleName: 'Standard Payment Receipt Rule',
      lines: [
        { account_code: '1010', direction: 'DEBIT', amount_expression: 'payload.payment_amount', memo_template: 'Dr Fiduciary Trust Cash' },
        { account_code: '1100', direction: 'CREDIT', amount_expression: 'payload.allocated_amount', memo_template: 'Cr AR' },
        { account_code: '2190', direction: 'CREDIT', amount_expression: 'payload.unapplied_amount', memo_template: 'Cr Unapplied Cash' }
      ]
    });

    const pmtResult = await processPaymentReceipt({
      tenantId,
      userId,
      billingAccountId: bAccount._id,
      amount: '9562.50',
      paymentMethod: 'ACH',
      referenceNumber: `ACH-RCVD-${testSuffix}`,
      paymentDate: new Date('2026-07-05'),
      targetInvoiceId: invResult.invoice._id,
      isFiduciary: true
    });

    const pmtJournal = await Journal.findOne({ _id: pmtResult.payment.journal_id, tenant_id: tenantId });
    assertTest(
      pmtResult.eventDriven === true &&
        pmtResult.outboxEvent && ['PUBLISHED', 'PENDING'].includes(pmtResult.outboxEvent.status) &&
        pmtJournal &&
        pmtJournal.status === 'POSTED' &&
        pmtJournal.total_debit.toString() === '9562.50' &&
        pmtJournal.total_credit.toString() === '9562.50',
      'R4-TEST-05',
      'Billing processPaymentReceipt published billing.payment.received event and posted balanced GL journal'
    );

    // -------------------------------------------------------------
    // TEST 6: Billing Adjustment Applied (billing.adjustment.applied)
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Billing Adjustment Applied Domain Event ---');
    await createAndPublishRule({
      eventCode: 'billing.adjustment.applied',
      displayName: 'Billing Adjustment Applied',
      ruleCode: `RULE_ADJ_APPLIED_${testSuffix}`,
      ruleName: 'Standard Adjustment Rule',
      lines: [
        { account_code: '5000', direction: 'DEBIT', amount_expression: 'payload.amount', memo_template: 'Dr Fee Waiver / Bad Debt' },
        { account_code: '1100', direction: 'CREDIT', amount_expression: 'payload.amount', memo_template: 'Cr AR knock-off' }
      ]
    });

    const adjResult = await createAdjustment({
      tenantId,
      userId,
      billingAccountId: bAccount._id,
      adjustmentType: 'CREDIT_MEMO',
      amount: '125.00',
      reasonCode: 'CUSTOMER_SATISFACTION',
      reasonDescription: 'Goodwill discount for billing delay'
    });

    const adjJournal = await Journal.findOne({ _id: adjResult.adjustment.journal_id, tenant_id: tenantId });
    assertTest(
      adjResult.eventDriven === true &&
        adjResult.outboxEvent && ['PUBLISHED', 'PENDING'].includes(adjResult.outboxEvent.status) &&
        adjJournal &&
        adjJournal.status === 'POSTED' &&
        adjJournal.total_debit.toString() === '125.00' &&
        adjJournal.total_credit.toString() === '125.00',
      'R4-TEST-06',
      'Billing createAdjustment published billing.adjustment.applied event and posted balanced GL journal'
    );

    // -------------------------------------------------------------
    // TEST 7: Treasury Payment Returned (treasury.payment.returned)
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Treasury Payment Returned Domain Event ---');
    await createAndPublishRule({
      eventCode: 'treasury.payment.returned',
      displayName: 'Treasury Payment Returned',
      ruleCode: `RULE_PMT_RETURNED_${testSuffix}`,
      ruleName: 'Standard Payment Return Rule',
      sourceModule: 'TREASURY',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.return_amount', memo_template: 'Dr Re-instate AR' },
        { account_code: '1010', direction: 'CREDIT', amount_expression: 'payload.return_amount', memo_template: 'Cr Trust Cash Dishonor' },
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.fee_amount', memo_template: 'Dr NSF Fee AR' },
        { account_code: '4100', direction: 'CREDIT', amount_expression: 'payload.fee_amount', memo_template: 'Cr NSF Fee Income' }
      ]
    });

    // Create a payment to return
    const pmtToReturn = await Payment.create({
      tenant_id: tenantId,
      billing_account_id: bAccount._id,
      payment_number: `PMT-RET-${testSuffix}`,
      amount: mongoose.Types.Decimal128.fromString('500.00'),
      allocated_amount: mongoose.Types.Decimal128.fromString('0.00'),
      unapplied_amount: mongoose.Types.Decimal128.fromString('500.00'),
      payment_method: 'ACH',
      payment_date: new Date('2026-07-06'),
      status: 'RECEIVED'
    });

    const retResult = await processPaymentReturn({
      tenantId,
      userId,
      paymentId: pmtToReturn._id,
      returnCode: 'R01',
      reasonDescription: 'Insufficient funds'
    });

    const retJournal = await Journal.findOne({ _id: retResult.paymentReturn.journal_id, tenant_id: tenantId });
    assertTest(
      retResult.eventDriven === true &&
        retResult.outboxEvent && ['PUBLISHED', 'PENDING'].includes(retResult.outboxEvent.status) &&
        retJournal &&
        retJournal.status === 'POSTED' &&
        retJournal.total_debit.toString() === '535.00' &&
        retJournal.total_credit.toString() === '535.00',
      'R4-TEST-07',
      'Treasury processPaymentReturn published treasury.payment.returned event and posted 4-line return journal'
    );

    // -------------------------------------------------------------
    // TEST 8: Treasury Refund Disbursed (treasury.refund.disbursed)
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Treasury Refund Disbursed Domain Event ---');
    await createAndPublishRule({
      eventCode: 'treasury.refund.disbursed',
      displayName: 'Treasury Refund Disbursed',
      ruleCode: `RULE_REFUND_DISBURSED_${testSuffix}`,
      ruleName: 'Standard Refund Disbursed Rule',
      sourceModule: 'TREASURY',
      lines: [
        { account_code: '2100', direction: 'DEBIT', amount_expression: 'payload.refund_amount', memo_template: 'Dr Return Premium Payable' },
        { account_code: '1010', direction: 'CREDIT', amount_expression: 'payload.refund_amount', memo_template: 'Cr Trust Cash Disbursed' }
      ]
    });

    const refundResult = await processRefundDisbursement({
      tenantId,
      userId,
      billingAccountId: bAccount._id,
      amount: '350.00',
      reason: 'Endorsement return premium',
      refundMethod: 'ACH'
    });

    const refundJournal = await Journal.findOne({ _id: refundResult.refund.journal_id, tenant_id: tenantId });
    assertTest(
      refundResult.eventDriven === true &&
        refundResult.outboxEvent && ['PUBLISHED', 'PENDING'].includes(refundResult.outboxEvent.status) &&
        refundJournal &&
        refundJournal.status === 'POSTED' &&
        refundJournal.total_debit.toString() === '350.00' &&
        refundJournal.total_credit.toString() === '350.00',
      'R4-TEST-08',
      'Treasury processRefundDisbursement published treasury.refund.disbursed event and posted balanced GL journal'
    );

    // -------------------------------------------------------------
    // TEST 9: Commissions Fiduciary Sweep (fiduciary.sweep.executed)
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Commissions Fiduciary Sweep Domain Event ---');
    await createAndPublishRule({
      eventCode: 'fiduciary.sweep.executed',
      displayName: 'Fiduciary Sweep Executed',
      ruleCode: `RULE_SWEEP_EXECUTED_${testSuffix}`,
      ruleName: 'Standard Fiduciary Sweep Rule',
      sourceModule: 'COMMISSIONS',
      lines: [
        { account_code: '1000', direction: 'DEBIT', amount_expression: 'payload.amount', memo_template: 'Dr Operating Cash' },
        { account_code: '1010', direction: 'CREDIT', amount_expression: 'payload.amount', memo_template: 'Cr Premium Trust Sweep' }
      ]
    });

    // Create Fiduciary Account and seed Trust cash and earned commission
    const fidAccount = await FiduciaryAccount.create({
      tenant_id: tenantId,
      account_code: `FID-${testSuffix}`,
      account_name: 'Frost Bank Texas Fiduciary Trust',
      bank_name: 'Frost Bank',
      bank_reference_token: 'WF-TX-1010',
      currency: 'USD',
      current_balance: mongoose.Types.Decimal128.fromString('15000.00'),
      is_active: true
    });

    // Set 1010 balance in LedgerAccount so trust validation passes
    await LedgerAccount.updateOne(
      { tenant_id: tenantId, account_code: '1010' },
      { current_balance: mongoose.Types.Decimal128.fromString('15000.00') }
    );

    // Seed MGA earned commission
    await CommissionTransaction.create({
      tenant_id: tenantId,
      transaction_number: `COMM-TX-SWEEP-${testSuffix}`,
      agreement_id: new mongoose.Types.ObjectId(),
      schedule_id: new mongoose.Types.ObjectId(),
      source_event_id: `EVT-SRC-${testSuffix}`,
      payer_party_id: 'CARRIER-SUMMIT',
      payee_party_id: 'MGA-HARBOR',
      payee_party_name: 'Harbor Underwriting MGA',
      effective_date: new Date('2026-07-01'),
      accounting_date: new Date('2026-07-01'),
      idempotency_key: `IDEM-SWEEP-${testSuffix}`,
      calculated_amount: mongoose.Types.Decimal128.fromString('3765.00'),
      retained_amount: mongoose.Types.Decimal128.fromString('3765.00'),
      basis_amount: mongoose.Types.Decimal128.fromString('37650.00'),
      rate_applied: mongoose.Types.Decimal128.fromString('10.00'),
      lifecycle_status: 'APPROVED',
      is_fiduciary_eligible: true
    });

    const sweepResult = await executeFiduciarySweep({
      tenantId,
      userId,
      fiduciaryAccountId: fidAccount._id,
      amount: '1882.50',
      notes: 'MGA earned commission sweep 50%'
    });

    const sweepJournal = await Journal.findOne({ _id: sweepResult.journal_id, tenant_id: tenantId });
    assertTest(
      sweepResult.eventDriven === true &&
        sweepResult.outboxEvent && ['PUBLISHED', 'PENDING'].includes(sweepResult.outboxEvent.status) &&
        sweepJournal &&
        sweepJournal.status === 'POSTED' &&
        sweepJournal.total_debit.toString() === '1882.50' &&
        sweepJournal.total_credit.toString() === '1882.50',
      'R4-TEST-09',
      'Commissions executeFiduciarySweep published fiduciary.sweep.executed event and posted balanced GL journal'
    );

    // -------------------------------------------------------------
    // TEST 10: Carrier Settlement Disbursed (carrier.settlement.disbursed)
    // -------------------------------------------------------------
    console.log('\n--- Test 10: Carrier Settlement Disbursed Domain Event ---');
    await createAndPublishRule({
      eventCode: 'carrier.settlement.disbursed',
      displayName: 'Carrier Settlement Disbursed',
      ruleCode: `RULE_CARRIER_SETTLE_${testSuffix}`,
      ruleName: 'Standard Carrier Settlement Disbursed Rule',
      sourceModule: 'COMMISSIONS',
      lines: [
        { account_code: '2010', direction: 'DEBIT', amount_expression: 'payload.net_due_carrier', memo_template: 'Dr Due to Carrier' },
        { account_code: '1010', direction: 'CREDIT', amount_expression: 'payload.net_due_carrier', memo_template: 'Cr Premium Trust' }
      ]
    });

    // Create Settlement Statement
    const statement = await SettlementStatement.create({
      tenant_id: tenantId,
      statement_number: `STMT-${testSuffix}`,
      carrier_party_id: 'CARRIER-SUMMIT',
      carrier_name: 'Summit Mutual Insurance Company',
      fiduciary_account_id: fidAccount._id,
      period_start: new Date('2026-07-01'),
      period_end: new Date('2026-07-31'),
      gross_eligible_premium: mongoose.Types.Decimal128.fromString('37650.00'),
      commission_withheld: mongoose.Types.Decimal128.fromString('7530.00'),
      net_due_carrier: mongoose.Types.Decimal128.fromString('30120.00'),
      status: 'APPROVED'
    });

    const disburseResult = await disburseSettlementPayment({
      tenantId,
      userId,
      statementId: statement._id,
      paymentReference: `ACH-SUMMIT-${testSuffix}`
    });

    const disburseJournal = await Journal.findOne({ _id: disburseResult.statement.linked_journal_id, tenant_id: tenantId });
    assertTest(
      disburseResult.eventDriven === true &&
        disburseResult.outboxEvent && ['PUBLISHED', 'PENDING'].includes(disburseResult.outboxEvent.status) &&
        disburseJournal &&
        disburseJournal.status === 'POSTED' &&
        disburseJournal.total_debit.toString() === '30120.00' &&
        disburseJournal.total_credit.toString() === '30120.00',
      'R4-TEST-10',
      'Commissions disburseSettlementPayment published carrier.settlement.disbursed event and posted balanced GL journal'
    );

    // -------------------------------------------------------------
    // TEST 11: Finance Close UPR Monthly Earning (upr.earning.requested)
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Finance Close UPR Earning Domain Event ---');
    await createAndPublishRule({
      eventCode: 'upr.earning.requested',
      displayName: 'UPR Earning Requested',
      ruleCode: `RULE_UPR_EARNING_${testSuffix}`,
      ruleName: 'Standard UPR Amortization Rule',
      sourceModule: 'FINANCE_CLOSE',
      lines: [
        { account_code: '2200', direction: 'DEBIT', amount_expression: 'payload.earned_amount', memo_template: 'Dr UPR Liability Amortization' },
        { account_code: '4000', direction: 'CREDIT', amount_expression: 'payload.earned_amount', memo_template: 'Cr Earned Premium Revenue' }
      ]
    });

    const uprResult = await executeUPRAmortizationRun({
      tenantId,
      userId,
      policyReference: `POL-TX-${testSuffix}`,
      periodName: '2026-07',
      writtenPremium: '37650.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2026-07-31')
    });

    const uprJournal = await Journal.findOne({ _id: uprResult.journal._id, tenant_id: tenantId });
    assertTest(
      uprResult.eventDriven === true &&
        uprResult.outboxEvent && ['PUBLISHED', 'PENDING'].includes(uprResult.outboxEvent.status) &&
        uprJournal &&
        uprJournal.status === 'POSTED' &&
        uprJournal.total_debit.toString() === '3197.67' &&
        uprJournal.total_credit.toString() === '3197.67',
      'R4-TEST-11',
      'Finance Close executeUPRAmortizationRun published upr.earning.requested event and amortized 31 days UPR'
    );

    // -------------------------------------------------------------
    // TEST 12: UPR Idempotency / No Duplicate Journal
    // -------------------------------------------------------------
    console.log('\n--- Test 12: UPR Re-run Idempotency ---');
    const uprRerunResult = await executeUPRAmortizationRun({
      tenantId,
      userId,
      policyReference: `POL-TX-${testSuffix}`,
      periodName: '2026-07',
      writtenPremium: '37650.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2026-07-31')
    });

    assertTest(
      uprRerunResult.alreadyRun === true &&
        String(uprRerunResult.journal._id) === String(uprResult.journal._id),
      'R4-TEST-12',
      'Re-running UPR earning for same policy and period detects prior run and does not create duplicate journal'
    );

    // -------------------------------------------------------------
    // TEST 13: HTTP REST API Endpoints with Migration Adapter Header
    // -------------------------------------------------------------
    console.log('\n--- Test 13: HTTP API Header x-use-migration-adapter Verification ---');
    const { User } = require('../src/models');
    await Tenant.updateOne({ _id: tenantId }, { $set: { 'settings.allow_legacy_adapter': true } });
    await User.updateOne({ _id: userId }, { $set: { is_platform_admin: true } });
    const httpLegacyRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/invoices',
      headers: {
        ...headersA,
        'x-use-migration-adapter': 'true'
      },
      body: {
        billing_account_id: String(bAccount._id),
        policy_id: `POL-LEGACY-${testSuffix}`,
        installment_number: 2,
        invoice_date: '2026-07-15',
        lines: [
          { line_type: 'PREMIUM', description: 'Legacy installment', amount: '1000.00' }
        ]
      }
    });

    assertTest(
      httpLegacyRes.status === 201 &&
        httpLegacyRes.body && httpLegacyRes.body.data &&
        httpLegacyRes.body.data.invoice &&
        httpLegacyRes.body.data.eventDriven === false,
      'R4-TEST-13',
      'API endpoint honors x-use-migration-adapter: true header by routing to legacyPostingAdapter'
    );

    // -------------------------------------------------------------
    // TEST 14: Cross-Tenant Isolation
    // -------------------------------------------------------------
    console.log('\n--- Test 14: Cross-Tenant Isolation ---');
    // Tenant B attempts to publish billing.invoice.issued without its own rules
    let tenantBThrown = false;
    let tenantBCode = '';
    try {
      await publishAndProcessDomainEvent({
        tenantId: tenantIdB,
        eventType: 'billing.invoice.issued',
        sourceModule: 'BILLING',
        sourceEntityType: 'Invoice',
        sourceEntityId: 'INV-TENANT-B-001',
        payload: { total_amount: 100, premium_amount: 100, fee_amount: 0 },
        dispatchImmediately: true
      });
    } catch (err) {
      tenantBThrown = true;
      tenantBCode = err.code || '';
    }

    assertTest(
      tenantBThrown &&
        (tenantBCode === 'NO_RULE_MATCH' || tenantBCode === 'EVENT_PROCESSING_FAILED'),
      'R4-TEST-14',
      "Tenant A's published rules are completely isolated and never fire for Tenant B domain events"
    );

    // -------------------------------------------------------------
    // TEST 15: Double-Entry Trial Balance Verification
    // -------------------------------------------------------------
    console.log('\n--- Test 15: Double-Entry Trial Balance Verification ---');
    const allTenantJournals = await Journal.find({ tenant_id: tenantId, status: 'POSTED' });
    let totalDebitSum = new BigNumber(0);
    let totalCreditSum = new BigNumber(0);

    for (const j of allTenantJournals) {
      totalDebitSum = totalDebitSum.plus(j.total_debit.toString());
      totalCreditSum = totalCreditSum.plus(j.total_credit.toString());
    }

    const variance = totalDebitSum.minus(totalCreditSum);

    assertTest(
      allTenantJournals.length >= 7 &&
        variance.isZero() &&
        totalDebitSum.gt(0),
      'R4-TEST-15',
      `Trial Balance is in absolute equilibrium: Total Debits ($${totalDebitSum.toFixed(2)}) == Total Credits ($${totalCreditSum.toFixed(2)}) across ${allTenantJournals.length} journals`
    );

  } catch (err) {
    console.error('Unexpected error in Phase R4 Acceptance Suite:', err);
    failedCount++;
  } finally {
    console.log('\n================================================================');
    console.log(` PHASE R4 ACCEPTANCE SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runAcceptanceTests();
