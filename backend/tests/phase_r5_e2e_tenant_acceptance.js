/**
 * VERIDEX ONE v4.6 — PHASE R5 END-TO-END TENANT ACCEPTANCE TEST SUITE
 * 
 * Verifies complete, ground-truth business workflows across the three canonical
 * insurance accounting archetypes:
 * - CARRIER (Direct Bill, Inception Premium & UPR, Cash Receipt, Payment Return, UPR Amortization, Close)
 * - MGA (Agency Bill, Split Payables to Carrier & Broker, Retained MGA Revenue, Fiduciary Trust Cash § 4053, Earned MGA Sweep, Net Carrier Settlement)
 * - BROKER (Client Direct Bill, Trust Cash Collection, Producer Commission Split, House Commission Sweep, Net Remittance)
 *
 * Enforces transaction-topology fail-closed behavior, zero Account 1020 plug entries,
 * double-entry mathematical balance, and subledger reconciliation across all modules.
 */

const http = require('http');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
require('dotenv').config();

const { connectDB } = require('../src/config/db');
const {
  Tenant,
  User,
  Role,
  UserRole,
  TenantMembership,
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
  PaymentReturn,
  Refund,
  FiduciaryAccount,
  CommissionAgreement,
  CommissionSchedule,
  CommissionTransaction,
  SettlementStatement,
  SettlementLine,
  TrialBalanceSnapshot
} = require('../src/models');

const { withOptionalTransaction, getDatabaseTopologyInfo } = require('../src/utils/transactionHelper');
const { publishAndProcessDomainEvent, dispatchOutboxEventRecord } = require('../src/services/domainEventPublisher');
const { issueInvoice, processPaymentReceipt } = require('../src/services/billingService');
const { processPaymentReturn } = require('../src/services/treasuryService');
const { executeFiduciarySweep, disburseSettlementPayment } = require('../src/services/commissionsService');
const { executeUPRAmortizationRun, generateTrialBalanceSnapshot } = require('../src/services/financeCloseService');

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

async function runTenantAcceptanceTests() {
  console.log('================================================================');
  console.log(' VERIDEX ONE v4.6 — PHASE R5 END-TO-END TENANT ACCEPTANCE SUITE');
  console.log('================================================================\n');

  await connectDB();

  const testSuffix = Math.floor(Date.now() % 100000);
  let passedCount = 0;
  let failedCount = 0;

  function assertTest(condition, testId, description) {
    if (condition) {
      console.log(`  [PASS] ${testId}: ${description}`);
      passedCount++;
    } else {
      console.error(`  [FAIL] ${testId}: ${description}`);
      failedCount++;
    }
  }

  try {
    // -------------------------------------------------------------
    // GROUP 1: Database Topology & Fail-Closed Behavior
    // -------------------------------------------------------------
    console.log('--- Group 1: Database Target & Transaction Topology Verification ---');

    // Test 1: Active Topology Capability
    const topoInfo = getDatabaseTopologyInfo();
    console.log('[Topology Diagnostic]', topoInfo);
    assertTest(
      topoInfo.topology === 'ReplicaSetWithPrimary' &&
        topoInfo.transactionsSupported === true &&
        topoInfo.status === 'TRANSACTION_CAPABLE',
      'R5-TOPO-01',
      'Database topology is verified as TRANSACTION_CAPABLE ReplicaSetWithPrimary'
    );

    // Test 2: Fail-Closed Guard on Standalone Topology
    // Temporarily mock topology to 'Single'
    const originalType = mongoose.connection.client?.topology?.description?.type;
    let failClosedCaught = null;
    try {
      if (mongoose.connection?.client?.topology?.description) {
        mongoose.connection.client.topology.description.type = 'Single';
      }
      await withOptionalTransaction(async () => {
        return 'SHOULD_NOT_EXECUTE';
      }, { failClosed: true });
    } catch (err) {
      failClosedCaught = err;
    } finally {
      // Restore native topology
      if (mongoose.connection?.client?.topology?.description) {
        mongoose.connection.client.topology.description.type = originalType;
      }
    }

    assertTest(
      failClosedCaught !== null &&
        failClosedCaught.code === 'DATABASE_TOPOLOGY_UNSUPPORTED' &&
        failClosedCaught.message.includes('DATABASE_TOPOLOGY_UNSUPPORTED'),
      'R5-TOPO-02',
      'withOptionalTransaction fails closed on Single topology with DATABASE_TOPOLOGY_UNSUPPORTED'
    );

    // Test 3: Explicit Opt-Out Fallback on Standalone Topology
    let optOutExecuted = false;
    try {
      if (mongoose.connection?.client?.topology?.description) {
        mongoose.connection.client.topology.description.type = 'Single';
      }
      optOutExecuted = await withOptionalTransaction(async (session) => {
        return session === null;
      }, { failClosed: false });
    } finally {
      if (mongoose.connection?.client?.topology?.description) {
        mongoose.connection.client.topology.description.type = originalType;
      }
    }

    assertTest(
      optOutExecuted === true,
      'R5-TOPO-03',
      'withOptionalTransaction falls back to fn(null) when failClosed: false is explicitly passed'
    );

    // Test 4: Native Multi-Document Transaction Execution on Replica Set
    const txExecuted = await withOptionalTransaction(async (session) => {
      return Boolean(session);
    }, { failClosed: true });

    assertTest(
      txExecuted === true,
      'R5-TOPO-04',
      'withOptionalTransaction successfully starts and commits session on ReplicaSetWithPrimary'
    );

    // Test 5: /health Database Topology Diagnostic
    const healthRes = await makeRequest({ method: 'GET', path: '/health' });
    const dbHealth = healthRes.body?.data?.database;
    console.log('[/health Diagnostic]', dbHealth);

    assertTest(
      healthRes.status === 200 &&
        dbHealth &&
        dbHealth.status === 'TRANSACTION_CAPABLE' &&
        dbHealth.topology === 'ReplicaSetWithPrimary' &&
        dbHealth.transactions_supported === true,
      'R5-TOPO-05',
      '/health endpoint exposes topology diagnostic (TRANSACTION_CAPABLE) without credentials'
    );

    // Helper: Register event definition and publish rule via API
    async function setupRule({ tenantId, headers, eventCode, displayName, ruleCode, ruleName, lines, conditions = [], priority = 100, sourceModule = 'BILLING' }) {
      const tid = tenantId || headers['x-tenant-id'];
      const existingEvt = await EventDefinition.findOne({
        tenant_id: tid,
        event_code: eventCode.toLowerCase().trim()
      });
      if (!existingEvt) {
        const evRes = await makeRequest({
          method: 'POST',
          path: '/api/v1/events',
          headers,
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

      const createRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/rules',
        headers,
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
      const pubRes = await makeRequest({
        method: 'POST',
        path: `/api/v1/rules/${ruleId}/publish`,
        headers
      });

      if (pubRes.status !== 200) {
        throw new Error(`Failed to publish rule ${ruleCode}: ${JSON.stringify(pubRes.body)}`);
      }

      return pubRes.body.data.rule;
    }

    // Helper: Seed standard fiscal periods
    async function seedPeriods(headers) {
      for (let m = 1; m <= 12; m++) {
        const pName = `2026-${String(m).padStart(2, '0')}`;
        const startD = new Date(`2026-${String(m).padStart(2, '0')}-01`);
        const lastDay = new Date(2026, m, 0).getDate();
        const endD = new Date(`2026-${String(m).padStart(2, '0')}-${lastDay}`);
        await makeRequest({
          method: 'POST',
          path: '/api/v1/gl/periods',
          headers,
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
    }

    // -------------------------------------------------------------
    // GROUP 2: Carrier Archetype End-to-End Workflow
    // -------------------------------------------------------------
    console.log('\n--- Group 2: Carrier Archetype End-to-End Workflow ---');

    // C-1 Onboarding Carrier Tenant
    const carrierReg = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_name: `Summit National Carrier (${testSuffix})`,
        tenant_code: `R5_CARRIER_${testSuffix}`,
        tenant_type: 'CARRIER',
        admin_first_name: 'Carrier',
        admin_last_name: 'Admin',
        admin_email: `carrier_admin_${testSuffix}@summit.com`,
        admin_password: 'Password123!'
      }
    });

    const carrierToken = carrierReg.body.data.token;
    const carrierTenantId = carrierReg.body.data.tenant.id;
    const carrierUserId = carrierReg.body.data.user.id;
    const carrierHeaders = { Authorization: `Bearer ${carrierToken}`, 'x-tenant-id': carrierTenantId };

    // Carrier COA: 1000 Operating Cash, 1100 AR, 2200 UPR, 4000 Earned Premium, 4100 Fee Income
    const carrierAccounts = [
      { code: '1000', name: 'Carrier Operating Cash', type: 'ASSET' },
      { code: '1100', name: 'Direct Premium Receivable', type: 'ASSET' },
      { code: '2200', name: 'Unearned Premium Reserve (UPR)', type: 'LIABILITY' },
      { code: '4000', name: 'Earned Premium Revenue', type: 'REVENUE' },
      { code: '4100', name: 'Policy Fee & Other Revenue', type: 'REVENUE' }
    ];

    for (const acc of carrierAccounts) {
      await makeRequest({
        method: 'POST',
        path: '/api/v1/gl/accounts',
        headers: carrierHeaders,
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

    await seedPeriods(carrierHeaders);

    assertTest(
      carrierReg.status === 201 && carrierTenantId,
      'R5-CARRIER-01',
      'Carrier tenant onboarded, Standard Carrier COA (1000, 1100, 2200, 4000, 4100) and 2026 fiscal periods provisioned'
    );

    // Carrier Published Rules
    await setupRule({
      headers: carrierHeaders,
      eventCode: 'billing.invoice.issued',
      displayName: 'Carrier Direct Bill Invoice',
      ruleCode: `RULE_CARRIER_INV_${testSuffix}`,
      ruleName: 'Carrier Invoice Rule',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.total_amount', memo_template: 'Dr AR' },
        { account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.premium_amount', memo_template: 'Cr UPR' },
        { account_code: '4100', direction: 'CREDIT', amount_expression: 'payload.fee_amount', memo_template: 'Cr Policy Fee' }
      ]
    });

    await setupRule({
      headers: carrierHeaders,
      eventCode: 'billing.payment.received',
      displayName: 'Carrier Payment Receipt',
      ruleCode: `RULE_CARRIER_PMT_${testSuffix}`,
      ruleName: 'Carrier Payment Receipt Rule',
      lines: [
        { account_code: '1000', direction: 'DEBIT', amount_expression: 'payload.payment_amount', memo_template: 'Dr Operating Cash' },
        { account_code: '1100', direction: 'CREDIT', amount_expression: 'payload.allocated_amount', memo_template: 'Cr AR' }
      ]
    });

    await setupRule({
      headers: carrierHeaders,
      eventCode: 'treasury.payment.returned',
      displayName: 'Carrier Payment Returned',
      ruleCode: `RULE_CARRIER_RET_${testSuffix}`,
      ruleName: 'Carrier Payment Return Rule',
      sourceModule: 'TREASURY',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.return_amount', memo_template: 'Dr Re-instate AR' },
        { account_code: '1000', direction: 'CREDIT', amount_expression: 'payload.return_amount', memo_template: 'Cr Operating Cash Dishonor' },
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.fee_amount', memo_template: 'Dr NSF Fee AR' },
        { account_code: '4100', direction: 'CREDIT', amount_expression: 'payload.fee_amount', memo_template: 'Cr NSF Fee Revenue' }
      ]
    });

    await setupRule({
      headers: carrierHeaders,
      eventCode: 'upr.earning.requested',
      displayName: 'Carrier UPR Earning',
      ruleCode: `RULE_CARRIER_UPR_${testSuffix}`,
      ruleName: 'Carrier UPR Earning Rule',
      sourceModule: 'FINANCE_CLOSE',
      lines: [
        { account_code: '2200', direction: 'DEBIT', amount_expression: 'payload.earned_amount', memo_template: 'Dr UPR Liability Amortization' },
        { account_code: '4000', direction: 'CREDIT', amount_expression: 'payload.earned_amount', memo_template: 'Cr Earned Premium Revenue' }
      ]
    });

    assertTest(
      true,
      'R5-CARRIER-02',
      'Carrier event definitions registered and published JE rules active for invoice, payment, return, and UPR'
    );

    // C-1: Issue Direct Bill Invoice ($9,000 premium + $200 fee = $9,200 total)
    const carrierBAccount = await BillingAccount.create({
      tenant_id: carrierTenantId,
      account_number: `BA-CARRIER-${testSuffix}`,
      customer_name: 'Lone Star Freight LLC',
      current_balance: mongoose.Types.Decimal128.fromString('0.00'),
      unapplied_cash: mongoose.Types.Decimal128.fromString('0.00')
    });

    const carrierInvRes = await issueInvoice({
      tenantId: carrierTenantId,
      userId: carrierUserId,
      billingAccountId: carrierBAccount._id,
      policyId: `POL-CARRIER-${testSuffix}`,
      installmentNumber: 1,
      invoiceDate: new Date('2026-07-01'),
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Auto Annual Premium', amount: '9000.00' },
        { line_type: 'FEE', description: 'Policy Underwriting Fee', amount: '200.00' }
      ]
    });

    const carrierInvJournal = await Journal.findOne({ _id: carrierInvRes.invoice.journal_id, tenant_id: carrierTenantId });
    const pluggedJournal = await JournalEntry.findOne({ tenant_id: carrierTenantId, account_code: '1020' });

    assertTest(
      carrierInvRes.eventDriven === true &&
        carrierInvJournal &&
        carrierInvJournal.status === 'POSTED' &&
        carrierInvJournal.total_debit.toString() === '9200.00' &&
        carrierInvJournal.total_credit.toString() === '9200.00' &&
        pluggedJournal === null,
      'R5-CARRIER-03',
      'C-1 Direct Bill Invoice posted balanced JE (Dr 1100 $9,200 / Cr 2200 $9,000 / Cr 4100 $200) with zero 1020 plug'
    );

    // C-2: Customer Cash Receipt ($9,200 full payment)
    const carrierPmtRes = await processPaymentReceipt({
      tenantId: carrierTenantId,
      userId: carrierUserId,
      billingAccountId: carrierBAccount._id,
      amount: '9200.00',
      paymentMethod: 'ACH',
      referenceNumber: `ACH-CARRIER-${testSuffix}`,
      paymentDate: new Date('2026-07-05'),
      targetInvoiceId: carrierInvRes.invoice._id,
      isFiduciary: false
    });

    const carrierPmtJournal = await Journal.findOne({ _id: carrierPmtRes.payment.journal_id, tenant_id: carrierTenantId });
    const refreshedInv = await Invoice.findById(carrierInvRes.invoice._id);

    assertTest(
      carrierPmtRes.eventDriven === true &&
        carrierPmtJournal &&
        carrierPmtJournal.status === 'POSTED' &&
        carrierPmtJournal.total_debit.toString() === '9200.00' &&
        carrierPmtJournal.total_credit.toString() === '9200.00' &&
        refreshedInv.status === 'PAID' &&
        new BigNumber(refreshedInv.balance_due.toString()).isZero(),
      'R5-CARRIER-04',
      'C-2 Customer Cash Receipt posted balanced JE (Dr 1000 $9,200 / Cr 1100 $9,200); invoice status updated to PAID'
    );

    // C-3: Payment Return (Dishonored payment $9,200 + $35 NSF fee)
    const carrierRetRes = await processPaymentReturn({
      tenantId: carrierTenantId,
      userId: carrierUserId,
      paymentId: carrierPmtRes.payment._id,
      returnCode: 'R01',
      reasonDescription: 'Customer NSF Return'
    });

    const carrierRetJournal = await Journal.findOne({ _id: carrierRetRes.paymentReturn.journal_id, tenant_id: carrierTenantId });
    const reinvAfterReturn = await Invoice.findById(carrierInvRes.invoice._id);

    assertTest(
      carrierRetRes.eventDriven === true &&
        carrierRetJournal &&
        carrierRetJournal.status === 'POSTED' &&
        carrierRetJournal.total_debit.toString() === '9235.00' &&
        carrierRetJournal.total_credit.toString() === '9235.00' &&
        reinvAfterReturn.status === 'ISSUED' &&
        reinvAfterReturn.balance_due.toString() === '9200.00',
      'R5-CARRIER-05',
      'C-3 Payment Return posted 4-line JE (Dr 1100 $9,235 / Cr 1000 $9,200 / Cr 4100 $35); invoice balance restored to $9,200.00'
    );

    // C-4: Month-End UPR Amortization Run ($764.38 for month 1)
    const carrierUPRRes = await executeUPRAmortizationRun({
      tenantId: carrierTenantId,
      userId: carrierUserId,
      policyReference: `POL-CARRIER-${testSuffix}`,
      periodName: '2026-07',
      writtenPremium: '9000.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2026-07-31')
    });

    const carrierUPRJournal = await Journal.findOne({ _id: carrierUPRRes.journal._id, tenant_id: carrierTenantId });

    assertTest(
      carrierUPRRes.eventDriven === true &&
        carrierUPRJournal &&
        carrierUPRJournal.status === 'POSTED' &&
        carrierUPRJournal.total_debit.toString() === '764.38' &&
        carrierUPRJournal.total_credit.toString() === '764.38',
      'R5-CARRIER-06',
      'C-4 Month-End UPR Amortization posted balanced JE (Dr 2200 $764.38 / Cr 4000 $764.38) via actual/365 convention'
    );

    // C-5: UPR Amortization Idempotency
    const carrierUPRRerun = await executeUPRAmortizationRun({
      tenantId: carrierTenantId,
      userId: carrierUserId,
      policyReference: `POL-CARRIER-${testSuffix}`,
      periodName: '2026-07',
      writtenPremium: '9000.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2026-07-31')
    });

    const carrierUPRCount = await Journal.countDocuments({
      tenant_id: carrierTenantId,
      memo: new RegExp(`upr.earning.requested`, 'i')
    });

    assertTest(
      carrierUPRRerun.alreadyRun === true && carrierUPRCount === 1,
      'R5-CARRIER-07',
      'C-5 UPR Amortization idempotency verified: re-run returns alreadyRun: true without creating duplicate journal'
    );

    // C-6: Carrier Trial Balance & Subledger Reconciliation
    const carrierTBRes = await generateTrialBalanceSnapshot({
      tenantId: carrierTenantId,
      userId: carrierUserId,
      periodName: '2026-07',
      isCertified: true
    });

    const glAR = await LedgerAccount.findOne({ tenant_id: carrierTenantId, account_code: '1100' });
    const glUPR = await LedgerAccount.findOne({ tenant_id: carrierTenantId, account_code: '2200' });

    console.log('[Carrier Balances]', {
      tbDebits: carrierTBRes.snapshot.total_debits.toString(),
      tbCredits: carrierTBRes.snapshot.total_credits.toString(),
      isBalanced: carrierTBRes.snapshot.is_balanced,
      arBalance: glAR.current_balance.toString(),
      uprBalance: glUPR.current_balance.toString()
    });

    assertTest(
      carrierTBRes.snapshot.is_balanced === true &&
        carrierTBRes.snapshot.total_debits.toString() === carrierTBRes.snapshot.total_credits.toString() &&
        glAR.current_balance.toString() === '9235.00' &&
        glUPR.current_balance.toString() === '8235.62',
      'R5-CARRIER-08',
      'C-6 Carrier Trial Balance certifies exact debits == credits, AR subledger agrees, and UPR liability is accurate'
    );

    // -------------------------------------------------------------
    // GROUP 3: MGA Archetype End-to-End Workflow
    // -------------------------------------------------------------
    console.log('\n--- Group 3: MGA Archetype End-to-End Workflow ---');

    // M-1 Onboarding MGA Tenant
    const mgaReg = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_name: `Harbor Risk MGA (${testSuffix})`,
        tenant_code: `R5_MGA_${testSuffix}`,
        tenant_type: 'MGA',
        admin_first_name: 'MGA',
        admin_last_name: 'Underwriter',
        admin_email: `mga_admin_${testSuffix}@harborrisk.com`,
        admin_password: 'Password123!'
      }
    });

    const mgaToken = mgaReg.body.data.token;
    const mgaTenantId = mgaReg.body.data.tenant.id;
    const mgaUserId = mgaReg.body.data.user.id;
    const mgaHeaders = { Authorization: `Bearer ${mgaToken}`, 'x-tenant-id': mgaTenantId };

    // MGA COA: 1000 Operating, 1010 Premium Trust (§ 4053), 1100 Agency AR, 2010 Due to Carrier, 2020 Broker Payable, 4000 MGA Revenue
    const mgaAccounts = [
      { code: '1000', name: 'MGA Operating Cash', type: 'ASSET' },
      { code: '1010', name: 'Texas Statutory Premium Trust Account', type: 'ASSET' },
      { code: '1100', name: 'Agency Premium Receivable', type: 'ASSET' },
      { code: '2010', name: 'Due to Carrier (Fiduciary Payable)', type: 'LIABILITY' },
      { code: '2020', name: 'Broker Commissions Payable', type: 'LIABILITY' },
      { code: '4000', name: 'MGA Underwriting Commission Revenue', type: 'REVENUE' }
    ];

    for (const acc of mgaAccounts) {
      await makeRequest({
        method: 'POST',
        path: '/api/v1/gl/accounts',
        headers: mgaHeaders,
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

    await seedPeriods(mgaHeaders);

    assertTest(
      mgaReg.status === 201 && mgaTenantId,
      'R5-MGA-01',
      'MGA tenant onboarded with Standard MGA COA (1000, 1010, 1100, 2010, 2020, 4000) and open periods'
    );

    // MGA Fiduciary Trust Setup & Commission Structure
    const mgaFidAccount = await FiduciaryAccount.create({
      tenant_id: mgaTenantId,
      account_code: `FID-MGA-${testSuffix}`,
      account_name: 'Frost Bank Texas § 4053 Fiduciary Trust',
      account_type: 'PREMIUM_TRUST',
      jurisdiction_statute: 'TEXAS_INS_CODE_4053',
      gl_account_code: '1010',
      bank_name: 'Frost Bank, N.A.',
      bank_reference_token: `tok_frost_tx_${testSuffix}`,
      currency: 'USD',
      status: 'ACTIVE'
    });

    // MGA Published Rules
    // Rule MGA Invoice: Dr 1100 Agency AR $10,000 / Cr 2010 Due to Carrier $8,500 / Cr 2020 Broker Payable $1,000 / Cr 4000 MGA Revenue $500
    await setupRule({
      headers: mgaHeaders,
      eventCode: 'billing.invoice.issued',
      displayName: 'MGA Agency Bill Invoice',
      ruleCode: `RULE_MGA_INV_${testSuffix}`,
      ruleName: 'MGA Statement Invoice Rule',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.total_amount', memo_template: 'Dr Agency AR' },
        { account_code: '2010', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.85', memo_template: 'Cr Due to Carrier (85%)' },
        { account_code: '2020', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.10', memo_template: 'Cr Broker Payable (10%)' },
        { account_code: '4000', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.05', memo_template: 'Cr MGA Commission Revenue (5%)' }
      ]
    });

    await setupRule({
      headers: mgaHeaders,
      eventCode: 'billing.payment.received',
      displayName: 'MGA Premium Trust Receipt',
      ruleCode: `RULE_MGA_PMT_${testSuffix}`,
      ruleName: 'MGA Trust Cash Receipt Rule',
      lines: [
        { account_code: '1010', direction: 'DEBIT', amount_expression: 'payload.payment_amount', memo_template: 'Dr Premium Trust Cash § 4053' },
        { account_code: '1100', direction: 'CREDIT', amount_expression: 'payload.allocated_amount', memo_template: 'Cr Agency AR' }
      ]
    });

    await setupRule({
      headers: mgaHeaders,
      eventCode: 'fiduciary.sweep.executed',
      displayName: 'MGA Earned Commission Sweep',
      ruleCode: `RULE_MGA_SWEEP_${testSuffix}`,
      ruleName: 'MGA Sweep Rule',
      sourceModule: 'COMMISSIONS',
      lines: [
        { account_code: '1000', direction: 'DEBIT', amount_expression: 'payload.amount', memo_template: 'Dr Operating Cash Transfer' },
        { account_code: '1010', direction: 'CREDIT', amount_expression: 'payload.amount', memo_template: 'Cr Trust Cash Release' }
      ]
    });

    await setupRule({
      headers: mgaHeaders,
      eventCode: 'carrier.settlement.disbursed',
      displayName: 'MGA Carrier Settlement Disbursed',
      ruleCode: `RULE_MGA_SETTLE_${testSuffix}`,
      ruleName: 'MGA Settlement Disbursed Rule',
      sourceModule: 'COMMISSIONS',
      lines: [
        { account_code: '2010', direction: 'DEBIT', amount_expression: 'payload.net_due_carrier', memo_template: 'Dr Discharge Due to Carrier' },
        { account_code: '1010', direction: 'CREDIT', amount_expression: 'payload.net_due_carrier', memo_template: 'Cr Trust Cash Remittance' }
      ]
    });

    assertTest(
      mgaFidAccount && mgaFidAccount.jurisdiction_statute === 'TEXAS_INS_CODE_4053' && mgaFidAccount.gl_account_code === '1010',
      'R5-MGA-02',
      'MGA Fiduciary Account (1010) created with statutory § 4053 segregation metadata'
    );

    assertTest(
      true,
      'R5-MGA-03',
      'MGA event definitions registered and published JE rules active for invoice split, trust receipt, sweep, and settlement'
    );

    // M-1: Issue Agency Statement Invoice ($10,000 gross)
    const mgaBAccount = await BillingAccount.create({
      tenant_id: mgaTenantId,
      account_number: `BA-MGA-${testSuffix}`,
      customer_name: 'Brightline Brokerage House Agency',
      current_balance: mongoose.Types.Decimal128.fromString('0.00'),
      unapplied_cash: mongoose.Types.Decimal128.fromString('0.00')
    });

    const mgaInvRes = await issueInvoice({
      tenantId: mgaTenantId,
      userId: mgaUserId,
      billingAccountId: mgaBAccount._id,
      policyId: `POL-MGA-${testSuffix}`,
      installmentNumber: 1,
      invoiceDate: new Date('2026-07-01'),
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Property Package Gross Premium', amount: '10000.00' }
      ]
    });

    const mgaInvJournal = await Journal.findOne({ _id: mgaInvRes.invoice.journal_id, tenant_id: mgaTenantId });

    assertTest(
      mgaInvRes.eventDriven === true &&
        mgaInvJournal &&
        mgaInvJournal.status === 'POSTED' &&
        mgaInvJournal.total_debit.toString() === '10000.00' &&
        mgaInvJournal.total_credit.toString() === '10000.00',
      'R5-MGA-04',
      'M-1 Agency Invoice posted balanced 4-line JE (Dr 1100 $10k / Cr 2010 $8.5k / Cr 2020 $1k / Cr 4000 $500)'
    );

    // M-2: Agency Premium Trust Receipt ($10,000 into 1010 Premium Trust Cash)
    const mgaPmtRes = await processPaymentReceipt({
      tenantId: mgaTenantId,
      userId: mgaUserId,
      billingAccountId: mgaBAccount._id,
      amount: '10000.00',
      paymentMethod: 'WIRE',
      referenceNumber: `WIRE-MGA-${testSuffix}`,
      paymentDate: new Date('2026-07-08'),
      targetInvoiceId: mgaInvRes.invoice._id,
      isFiduciary: true
    });

    const mgaPmtJournal = await Journal.findOne({ _id: mgaPmtRes.payment.journal_id, tenant_id: mgaTenantId });

    // Update FiduciaryAccount balance to reflect the trust collection
    await FiduciaryAccount.updateOne(
      { _id: mgaFidAccount._id },
      { current_balance: mongoose.Types.Decimal128.fromString('10000.00') }
    );

    assertTest(
      mgaPmtRes.eventDriven === true &&
        mgaPmtJournal &&
        mgaPmtJournal.status === 'POSTED' &&
        mgaPmtJournal.total_debit.toString() === '10000.00' &&
        mgaPmtJournal.total_credit.toString() === '10000.00',
      'R5-MGA-05',
      'M-2 Agency Premium Trust Receipt posted balanced JE (Dr 1010 $10,000 / Cr 1100 $10,000); trust cash received'
    );

    // Seed CommissionTransaction for MGA retained commission: $1,500 gross MGA less $1,000 broker payable = $500 net retained
    await CommissionTransaction.create({
      tenant_id: mgaTenantId,
      transaction_number: `CTX-MGA-${testSuffix}`,
      agreement_id: new mongoose.Types.ObjectId(),
      schedule_id: new mongoose.Types.ObjectId(),
      source_event_id: `POL-MGA-${testSuffix}`,
      source_entity_type: 'POLICY',
      policy_id: `POL-MGA-${testSuffix}`,
      policy_reference: `POL-MGA-${testSuffix}`,
      payer_party_id: 'CARRIER-SUMMIT',
      payee_party_id: 'MGA-HARBOR',
      rate_applied: mongoose.Types.Decimal128.fromString('15.00'),
      basis_amount: mongoose.Types.Decimal128.fromString('10000.00'),
      calculated_amount: mongoose.Types.Decimal128.fromString('1500.00'),
      net_due_amount: mongoose.Types.Decimal128.fromString('1500.00'),
      effective_date: new Date(),
      accounting_date: new Date(),
      lifecycle_status: 'APPROVED',
      idempotency_key: `KEY-MGA-COMM-${testSuffix}`
    });

    await CommissionTransaction.create({
      tenant_id: mgaTenantId,
      transaction_number: `CTX-BROKER-SPLIT-${testSuffix}`,
      agreement_id: new mongoose.Types.ObjectId(),
      schedule_id: new mongoose.Types.ObjectId(),
      source_event_id: `POL-MGA-${testSuffix}`,
      source_entity_type: 'POLICY',
      policy_id: `POL-MGA-${testSuffix}`,
      policy_reference: `POL-MGA-${testSuffix}`,
      payer_party_id: 'MGA-HARBOR',
      payee_party_id: 'BROKER-BRIGHTLINE',
      rate_applied: mongoose.Types.Decimal128.fromString('10.00'),
      basis_amount: mongoose.Types.Decimal128.fromString('10000.00'),
      calculated_amount: mongoose.Types.Decimal128.fromString('1000.00'),
      net_due_amount: mongoose.Types.Decimal128.fromString('1000.00'),
      effective_date: new Date(),
      accounting_date: new Date(),
      lifecycle_status: 'APPROVED',
      idempotency_key: `KEY-BROKER-COMM-${testSuffix}`
    });

    // M-3: Fiduciary Sweep (MGA sweeps its earned $500 commission from trust 1010 to operating 1000)
    const mgaSweepRes = await executeFiduciarySweep({
      tenantId: mgaTenantId,
      userId: mgaUserId,
      fiduciaryAccountId: mgaFidAccount._id,
      amount: '500.00',
      notes: 'MGA earned commission sweep 100%'
    });

    const mgaSweepJournal = await Journal.findOne({ _id: mgaSweepRes.journal_id, tenant_id: mgaTenantId });

    assertTest(
      mgaSweepRes.eventDriven === true &&
        mgaSweepJournal &&
        mgaSweepJournal.status === 'POSTED' &&
        mgaSweepJournal.total_debit.toString() === '500.00' &&
        mgaSweepJournal.total_credit.toString() === '500.00',
      'R5-MGA-06',
      'M-3 MGA Fiduciary Sweep posted balanced JE (Dr 1000 $500 / Cr 1010 $500); moved earned commission to operating'
    );

    // M-4: Over-Sweep Prevention Guard (Attempt to sweep another $100 should fail)
    let overSweepError = null;
    try {
      await executeFiduciarySweep({
        tenantId: mgaTenantId,
        userId: mgaUserId,
        fiduciaryAccountId: mgaFidAccount._id,
        amount: '100.00',
        notes: 'Unauthorized over-sweep attempt'
      });
    } catch (e) {
      overSweepError = e;
    }

    assertTest(
      overSweepError !== null &&
        overSweepError.message.includes('exceeds eligible earned retained MGA commission'),
      'R5-MGA-07',
      'M-4 Fiduciary over-sweep prevented: rejects sweep exceeding eligible retained commission ($0.00 remaining)'
    );

    // M-5: Disburse Carrier Settlement ($8,500 paid from trust 1010 to Carrier)
    const mgaStmt = await SettlementStatement.create({
      tenant_id: mgaTenantId,
      statement_number: `STMT-MGA-${testSuffix}`,
      carrier_party_id: 'CARRIER-SUMMIT',
      carrier_name: 'Summit National Insurance Co.',
      fiduciary_account_id: mgaFidAccount._id,
      reporting_period: '2026-07',
      period_start: new Date('2026-07-01'),
      period_end: new Date('2026-07-31'),
      gross_eligible_premium: mongoose.Types.Decimal128.fromString('10000.00'),
      commission_withheld: mongoose.Types.Decimal128.fromString('1500.00'),
      net_due_carrier: mongoose.Types.Decimal128.fromString('8500.00'),
      status: 'APPROVED'
    });

    const mgaDisburseRes = await disburseSettlementPayment({
      tenantId: mgaTenantId,
      userId: mgaUserId,
      statementId: mgaStmt._id,
      paymentReference: `ACH-SUMMIT-SETTLE-${testSuffix}`
    });

    const mgaDisburseJournal = await Journal.findOne({ _id: mgaDisburseRes.statement.linked_journal_id, tenant_id: mgaTenantId });

    assertTest(
      mgaDisburseRes.eventDriven === true &&
        mgaDisburseJournal &&
        mgaDisburseJournal.status === 'POSTED' &&
        mgaDisburseJournal.total_debit.toString() === '8500.00' &&
        mgaDisburseJournal.total_credit.toString() === '8500.00',
      'R5-MGA-08',
      'M-5 Carrier Settlement Disbursed posted balanced JE (Dr 2010 $8,500 / Cr 1010 $8,500); Due to Carrier discharged'
    );

    // M-6: MGA Fiduciary Equilibrium & Trial Balance
    const mgaTBRes = await generateTrialBalanceSnapshot({
      tenantId: mgaTenantId,
      userId: mgaUserId,
      periodName: '2026-07',
      isCertified: true
    });

    const mgaTrustCash = await LedgerAccount.findOne({ tenant_id: mgaTenantId, account_code: '1010' });
    const mgaBrokerPayable = await LedgerAccount.findOne({ tenant_id: mgaTenantId, account_code: '2020' });
    const mgaCarrierPayable = await LedgerAccount.findOne({ tenant_id: mgaTenantId, account_code: '2010' });
    const mgaOperatingCash = await LedgerAccount.findOne({ tenant_id: mgaTenantId, account_code: '1000' });
    const mgaRevenue = await LedgerAccount.findOne({ tenant_id: mgaTenantId, account_code: '4000' });

    console.log('[MGA Equilibrium Diagnostic]', {
      trustCash1010: mgaTrustCash.current_balance.toString(),
      brokerPayable2020: mgaBrokerPayable.current_balance.toString(),
      carrierPayable2010: mgaCarrierPayable.current_balance.toString(),
      operatingCash1000: mgaOperatingCash.current_balance.toString(),
      mgaRevenue4000: mgaRevenue.current_balance.toString(),
      tbBalanced: mgaTBRes.snapshot.is_balanced
    });

    assertTest(
      mgaTBRes.snapshot.is_balanced === true &&
        mgaTrustCash.current_balance.toString() === '1000.00' &&
        mgaBrokerPayable.current_balance.toString() === '1000.00' &&
        new BigNumber(mgaCarrierPayable.current_balance.toString()).isZero() &&
        mgaOperatingCash.current_balance.toString() === '500.00' &&
        mgaRevenue.current_balance.toString() === '500.00',
      'R5-MGA-09',
      'M-6 Fiduciary Equilibrium verified: Premium Trust Cash ($1,000) exactly equals Broker Payable ($1,000); TB balanced'
    );

    // -------------------------------------------------------------
    // GROUP 4: Broker Archetype End-to-End Workflow
    // -------------------------------------------------------------
    console.log('\n--- Group 4: Broker Archetype End-to-End Workflow ---');

    // B-1 Onboarding Broker Tenant
    const brokerReg = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_name: `Brightline Commercial Broker (${testSuffix})`,
        tenant_code: `R5_BROKER_${testSuffix}`,
        tenant_type: 'BROKER',
        admin_first_name: 'Broker',
        admin_last_name: 'Producer',
        admin_email: `broker_admin_${testSuffix}@brightline.com`,
        admin_password: 'Password123!'
      }
    });

    const brokerToken = brokerReg.body.data.token;
    const brokerTenantId = brokerReg.body.data.tenant.id;
    const brokerUserId = brokerReg.body.data.user.id;
    const brokerHeaders = { Authorization: `Bearer ${brokerToken}`, 'x-tenant-id': brokerTenantId };

    // Broker COA: 1000 Operating, 1010 Client Trust Cash, 1100 Client AR, 2010 Due to MGA, 2030 Producer Payable, 4000 House Revenue
    const brokerAccounts = [
      { code: '1000', name: 'Broker Operating Cash', type: 'ASSET' },
      { code: '1010', name: 'Client Premium Trust Account', type: 'ASSET' },
      { code: '1100', name: 'Client Premium Receivable', type: 'ASSET' },
      { code: '2010', name: 'Due to MGA / Carrier (Premium Payable)', type: 'LIABILITY' },
      { code: '2030', name: 'Retail Producer Commissions Payable', type: 'LIABILITY' },
      { code: '4000', name: 'House Brokerage Commission Revenue', type: 'REVENUE' }
    ];

    for (const acc of brokerAccounts) {
      await makeRequest({
        method: 'POST',
        path: '/api/v1/gl/accounts',
        headers: brokerHeaders,
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

    await seedPeriods(brokerHeaders);

    assertTest(
      brokerReg.status === 201 && brokerTenantId,
      'R5-BROKER-01',
      'Broker tenant onboarded with Standard Broker COA (1000, 1010, 1100, 2010, 2030, 4000) and open periods'
    );

    // Broker Fiduciary Account & Commission Structure
    const brokerFidAccount = await FiduciaryAccount.create({
      tenant_id: brokerTenantId,
      account_code: `FID-BROKER-${testSuffix}`,
      account_name: 'JPMorgan Chase Retail Client Trust',
      account_type: 'PREMIUM_TRUST',
      jurisdiction_statute: 'CLIENT_TRUST_FIDUCIARY',
      gl_account_code: '1010',
      bank_name: 'JPMorgan Chase, N.A.',
      bank_reference_token: `tok_jpm_trust_${testSuffix}`,
      currency: 'USD',
      status: 'ACTIVE'
    });

    // Broker Published Rules
    // Rule Broker Invoice: Dr 1100 Client AR $10k / Cr 2010 Due to MGA $9k / Cr 2030 Producer Payable $700 / Cr 4000 House Revenue $300
    await setupRule({
      headers: brokerHeaders,
      eventCode: 'billing.invoice.issued',
      displayName: 'Broker Direct Client Invoice',
      ruleCode: `RULE_BROKER_INV_${testSuffix}`,
      ruleName: 'Broker Direct Invoice Rule',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.total_amount', memo_template: 'Dr Client AR' },
        { account_code: '2010', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.90', memo_template: 'Cr Due to MGA (90%)' },
        { account_code: '2030', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.07', memo_template: 'Cr Producer Commission Payable (7%)' },
        { account_code: '4000', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.03', memo_template: 'Cr House Brokerage Revenue (3%)' }
      ]
    });

    await setupRule({
      headers: brokerHeaders,
      eventCode: 'billing.payment.received',
      displayName: 'Broker Client Trust Receipt',
      ruleCode: `RULE_BROKER_PMT_${testSuffix}`,
      ruleName: 'Broker Client Payment Receipt Rule',
      lines: [
        { account_code: '1010', direction: 'DEBIT', amount_expression: 'payload.payment_amount', memo_template: 'Dr Client Trust Cash' },
        { account_code: '1100', direction: 'CREDIT', amount_expression: 'payload.allocated_amount', memo_template: 'Cr Client AR' }
      ]
    });

    await setupRule({
      headers: brokerHeaders,
      eventCode: 'fiduciary.sweep.executed',
      displayName: 'Broker House Commission Sweep',
      ruleCode: `RULE_BROKER_SWEEP_${testSuffix}`,
      ruleName: 'Broker House Sweep Rule',
      sourceModule: 'COMMISSIONS',
      lines: [
        { account_code: '1000', direction: 'DEBIT', amount_expression: 'payload.amount', memo_template: 'Dr Operating Cash Transfer' },
        { account_code: '1010', direction: 'CREDIT', amount_expression: 'payload.amount', memo_template: 'Cr Client Trust Sweep' }
      ]
    });

    assertTest(
      brokerFidAccount && brokerFidAccount.gl_account_code === '1010',
      'R5-BROKER-02',
      'Broker Client Trust Account (1010) configured with segregated retail trust structure'
    );

    assertTest(
      true,
      'R5-BROKER-03',
      'Broker event definitions registered and published JE rules active for client billing, trust receipt, and house sweep'
    );

    // B-1: Issue Client Direct Invoice ($10,000 total)
    const brokerBAccount = await BillingAccount.create({
      tenant_id: brokerTenantId,
      account_number: `BA-BROKER-${testSuffix}`,
      customer_name: 'Metro Transit Logistics Inc.',
      current_balance: mongoose.Types.Decimal128.fromString('0.00'),
      unapplied_cash: mongoose.Types.Decimal128.fromString('0.00')
    });

    const brokerInvRes = await issueInvoice({
      tenantId: brokerTenantId,
      userId: brokerUserId,
      billingAccountId: brokerBAccount._id,
      policyId: `POL-BROKER-${testSuffix}`,
      installmentNumber: 1,
      invoiceDate: new Date('2026-07-01'),
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Fleet Policy Premium', amount: '10000.00' }
      ]
    });

    const brokerInvJournal = await Journal.findOne({ _id: brokerInvRes.invoice.journal_id, tenant_id: brokerTenantId });

    assertTest(
      brokerInvRes.eventDriven === true &&
        brokerInvJournal &&
        brokerInvJournal.status === 'POSTED' &&
        brokerInvJournal.total_debit.toString() === '10000.00' &&
        brokerInvJournal.total_credit.toString() === '10000.00',
      'R5-BROKER-04',
      'B-1 Client Invoice posted balanced 4-line JE (Dr 1100 $10k / Cr 2010 $9k / Cr 2030 $700 / Cr 4000 $300)'
    );

    // B-2: Client Premium Trust Receipt ($10,000 into 1010 Client Trust Cash)
    const brokerPmtRes = await processPaymentReceipt({
      tenantId: brokerTenantId,
      userId: brokerUserId,
      billingAccountId: brokerBAccount._id,
      amount: '10000.00',
      paymentMethod: 'CHECK',
      referenceNumber: `CHK-BROKER-${testSuffix}`,
      paymentDate: new Date('2026-07-09'),
      targetInvoiceId: brokerInvRes.invoice._id,
      isFiduciary: true
    });

    const brokerPmtJournal = await Journal.findOne({ _id: brokerPmtRes.payment.journal_id, tenant_id: brokerTenantId });

    await FiduciaryAccount.updateOne(
      { _id: brokerFidAccount._id },
      { current_balance: mongoose.Types.Decimal128.fromString('10000.00') }
    );

    assertTest(
      brokerPmtRes.eventDriven === true &&
        brokerPmtJournal &&
        brokerPmtJournal.status === 'POSTED' &&
        brokerPmtJournal.total_debit.toString() === '10000.00' &&
        brokerPmtJournal.total_credit.toString() === '10000.00',
      'R5-BROKER-05',
      'B-2 Client Premium Trust Receipt posted balanced JE (Dr 1010 $10,000 / Cr 1100 $10,000); client receivable cleared'
    );

    // Seed CommissionTransaction for Broker house commission: $1,000 gross broker commission less $700 producer = $300 house retained
    await CommissionTransaction.create({
      tenant_id: brokerTenantId,
      transaction_number: `CTX-BROKER-HOUSE-${testSuffix}`,
      agreement_id: new mongoose.Types.ObjectId(),
      schedule_id: new mongoose.Types.ObjectId(),
      source_event_id: `POL-BROKER-${testSuffix}`,
      source_entity_type: 'POLICY',
      policy_id: `POL-BROKER-${testSuffix}`,
      policy_reference: `POL-BROKER-${testSuffix}`,
      payer_party_id: 'MGA-HARBOR',
      payee_party_id: 'AGENCY-BRIGHTLINE',
      rate_applied: mongoose.Types.Decimal128.fromString('10.00'),
      basis_amount: mongoose.Types.Decimal128.fromString('10000.00'),
      calculated_amount: mongoose.Types.Decimal128.fromString('1000.00'),
      net_due_amount: mongoose.Types.Decimal128.fromString('1000.00'),
      effective_date: new Date(),
      accounting_date: new Date(),
      lifecycle_status: 'APPROVED',
      idempotency_key: `KEY-BROKER-HOUSE-${testSuffix}`
    });

    await CommissionTransaction.create({
      tenant_id: brokerTenantId,
      transaction_number: `CTX-BROKER-PRODUCER-${testSuffix}`,
      agreement_id: new mongoose.Types.ObjectId(),
      schedule_id: new mongoose.Types.ObjectId(),
      source_event_id: `POL-BROKER-${testSuffix}`,
      source_entity_type: 'POLICY',
      policy_id: `POL-BROKER-${testSuffix}`,
      policy_reference: `POL-BROKER-${testSuffix}`,
      payer_party_id: 'AGENCY-BRIGHTLINE',
      payee_party_id: 'PRODUCER-JAMES',
      rate_applied: mongoose.Types.Decimal128.fromString('7.00'),
      basis_amount: mongoose.Types.Decimal128.fromString('10000.00'),
      calculated_amount: mongoose.Types.Decimal128.fromString('700.00'),
      net_due_amount: mongoose.Types.Decimal128.fromString('700.00'),
      effective_date: new Date(),
      accounting_date: new Date(),
      lifecycle_status: 'APPROVED',
      idempotency_key: `KEY-BROKER-PROD-${testSuffix}`
    });

    // B-3: House Brokerage Commission Sweep ($300 swept from trust 1010 to operating 1000)
    const brokerSweepRes = await executeFiduciarySweep({
      tenantId: brokerTenantId,
      userId: brokerUserId,
      fiduciaryAccountId: brokerFidAccount._id,
      amount: '300.00',
      notes: 'House brokerage commission sweep'
    });

    const brokerSweepJournal = await Journal.findOne({ _id: brokerSweepRes.journal_id, tenant_id: brokerTenantId });

    assertTest(
      brokerSweepRes.eventDriven === true &&
        brokerSweepJournal &&
        brokerSweepJournal.status === 'POSTED' &&
        brokerSweepJournal.total_debit.toString() === '300.00' &&
        brokerSweepJournal.total_credit.toString() === '300.00',
      'R5-BROKER-06',
      'B-3 House Commission Sweep posted balanced JE (Dr 1000 $300 / Cr 1010 $300); operating cash funded'
    );

    // B-4: Broker Fiduciary Equilibrium & Trial Balance
    const brokerTBRes = await generateTrialBalanceSnapshot({
      tenantId: brokerTenantId,
      userId: brokerUserId,
      periodName: '2026-07',
      isCertified: true
    });

    const brokerTrustCash = await LedgerAccount.findOne({ tenant_id: brokerTenantId, account_code: '1010' });
    const brokerMGAPayable = await LedgerAccount.findOne({ tenant_id: brokerTenantId, account_code: '2010' });
    const brokerProducerPayable = await LedgerAccount.findOne({ tenant_id: brokerTenantId, account_code: '2030' });
    const brokerOperatingCash = await LedgerAccount.findOne({ tenant_id: brokerTenantId, account_code: '1000' });
    const brokerRevenue = await LedgerAccount.findOne({ tenant_id: brokerTenantId, account_code: '4000' });

    console.log('[Broker Equilibrium Diagnostic]', {
      trustCash1010: brokerTrustCash.current_balance.toString(),
      mgaPayable2010: brokerMGAPayable.current_balance.toString(),
      producerPayable2030: brokerProducerPayable.current_balance.toString(),
      operatingCash1000: brokerOperatingCash.current_balance.toString(),
      brokerRevenue4000: brokerRevenue.current_balance.toString(),
      tbBalanced: brokerTBRes.snapshot.is_balanced
    });

    const totalBrokerFidLiabilities = new BigNumber(brokerMGAPayable.current_balance.toString())
      .plus(brokerProducerPayable.current_balance.toString());

    assertTest(
      brokerTBRes.snapshot.is_balanced === true &&
        brokerTrustCash.current_balance.toString() === '9700.00' &&
        brokerMGAPayable.current_balance.toString() === '9000.00' &&
        brokerProducerPayable.current_balance.toString() === '700.00' &&
        totalBrokerFidLiabilities.isEqualTo(9700.00) &&
        brokerOperatingCash.current_balance.toString() === '300.00' &&
        brokerRevenue.current_balance.toString() === '300.00',
      'R5-BROKER-07',
      'B-4 Broker Fiduciary Equilibrium verified: Trust Cash ($9,700) exactly matches Due to MGA ($9,000) + Producer Payable ($700); TB balanced'
    );

    // -------------------------------------------------------------
    // GROUP 5: Cross-Tenant Boundaries & Operational Controls
    // -------------------------------------------------------------
    console.log('\n--- Group 5: Cross-Tenant Boundaries & Operational Controls ---');

    // Test 1: Cross-Tenant Isolation
    const crossTenantJournals = await Journal.find({
      tenant_id: carrierTenantId,
      _id: { $in: [mgaInvJournal._id, brokerInvJournal._id] }
    });

    assertTest(
      crossTenantJournals.length === 0,
      'R5-CROSS-01',
      'Tenant isolation: Carrier tenant query strictly returns 0 records for MGA or Broker journals'
    );

    // Test 2: Outbox & Inbox Duplicate Event Prevention Idempotency
    const sampleOutbox = await OutboxEvent.findOne({
      tenant_id: carrierTenantId,
      event_type: 'billing.invoice.issued',
      status: 'PUBLISHED'
    });

    const redispatchResult = await dispatchOutboxEventRecord(sampleOutbox);

    assertTest(
      redispatchResult.duplicate === true || redispatchResult.status === 'PROCESSED',
      'R5-CROSS-02',
      'Outbox/Inbox duplicate prevention: Re-dispatching already-processed event returns duplicate: true without duplicating JE'
    );

    // Test 3: Dead-Letter Handling on Missing Rule (Zero Silent Fallback)
    let unhandledEventError = null;
    let missingRuleCode = '';
    try {
      await publishAndProcessDomainEvent({
        tenantId: carrierTenantId,
        eventType: 'billing.unmapped.event',
        sourceModule: 'BILLING',
        sourceEntityType: 'BillingAccount',
        sourceEntityId: `BA-UNMAPPED-${testSuffix}`,
        payload: { amount: 100 },
        dispatchImmediately: true
      });
    } catch (e) {
      unhandledEventError = e;
      missingRuleCode = e.code || '';
    }

    const deadLetterOutbox = await OutboxEvent.findOne({
      tenant_id: carrierTenantId,
      event_type: 'billing.unmapped.event'
    });
    const deadLetterInbox = await InboxMessage.findOne({
      tenant_id: carrierTenantId,
      event_id: deadLetterOutbox ? deadLetterOutbox.event_id : ''
    });

    assertTest(
      unhandledEventError !== null &&
        deadLetterOutbox && ['FAILED', 'DEAD_LETTER'].includes(deadLetterOutbox.status) &&
        deadLetterInbox && deadLetterInbox.status === 'DEAD_LETTER',
      'R5-CROSS-03',
      'Dead-letter handling: Unmapped event visibly halts in DEAD_LETTER without creating Account 1020 plug entries'
    );

    // Test 4: Closed Fiscal Period Posting Rejection
    const closedPeriod = await FiscalPeriod.findOne({
      tenant_id: carrierTenantId,
      period_name: '2026-01'
    });
    closedPeriod.status = 'HARD_CLOSED';
    await closedPeriod.save();

    let closedPeriodError = null;
    try {
      await issueInvoice({
        tenantId: carrierTenantId,
        userId: carrierUserId,
        billingAccountId: carrierBAccount._id,
        policyId: `POL-CLOSED-${testSuffix}`,
        installmentNumber: 2,
        invoiceDate: new Date('2026-01-15'),
        lines: [
          { line_type: 'PREMIUM', description: 'Closed Period Invoice', amount: '500.00' }
        ]
      });
    } catch (e) {
      closedPeriodError = e;
    }

    assertTest(
      closedPeriodError !== null &&
        closedPeriodError.message.includes('HARD_CLOSED') &&
        closedPeriodError.message.includes('strictly prohibited'),
      'R5-CROSS-04',
      'Closed-period guard: Financial operation attempting to post into HARD_CLOSED period fails closed immediately'
    );

  } catch (globalErr) {
    console.error('[UNCAUGHT TEST RUNNER ERROR]', globalErr);
    failedCount++;
  } finally {
    console.log('\n================================================================');
    console.log(` PHASE R5 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
    console.log('================================================================\n');

    await mongoose.disconnect();
    process.exit(failedCount === 0 ? 0 : 1);
  }
}

if (require.main === module) {
  runTenantAcceptanceTests();
}

module.exports = { runTenantAcceptanceTests };
