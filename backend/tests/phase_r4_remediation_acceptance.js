/**
 * VERIDEX ONE v4.6 — PHASE R4 REMEDIATION ACCEPTANCE TEST SUITE
 * 
 * Verifies the production-safe fixes for findings F-01 through F-06:
 * - F-01 (BLOCKER): Legacy posting adapter security gates (3-gate authorization & setting protection)
 * - F-02 (BLOCKER): Atomic transactions (withOptionalTransaction) & failure injection rollback
 * - F-03 (HIGH): Fiduciary sweep over-execution prevention recognizing RULES_ENGINE journals
 * - F-04 (HIGH): Payment return subledger reconciliation (reversing allocations, restoring invoice & AR)
 * - F-05 (MEDIUM): Unapplied cash refund reconciliation & overdraft rejection
 * - F-06 (LOW): Billing adjustment validation against open invoice balance
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
  BillingAdjustment,
  PaymentReturn,
  Refund,
  FiduciaryAccount,
  CommissionTransaction
} = require('../src/models');

const { withOptionalTransaction } = require('../src/utils/transactionHelper');
const { authorizeMigrationAdapter } = require('../src/utils/migrationAdapterAuth');
const { publishAndProcessDomainEvent, dispatchOutboxEventRecord } = require('../src/services/domainEventPublisher');
const { issueInvoice, processPaymentReceipt, createAdjustment } = require('../src/services/billingService');
const { processPaymentReturn, processRefundDisbursement } = require('../src/services/treasuryService');
const { executeFiduciarySweep, seedTenantCommissions } = require('../src/services/commissionsService');

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

async function runRemediationAcceptanceTests() {
  console.log('================================================================');
  console.log(' VERIDEX ONE — PHASE R4 REMEDIATION ACCEPTANCE SUITE (F-01..F-06)');
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
    // SETUP: Isolated Tenant and Users
    // -------------------------------------------------------------
    console.log('[Setup] Registering Remediation Test Tenant...');
    const regRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `REM_TEST_${testSuffix}`,
        tenant_name: `Remediation Mutual ${testSuffix}`,
        tenant_type: 'CARRIER',
        base_currency: 'USD',
        admin_first_name: 'Rachel',
        admin_last_name: 'Remedy',
        admin_email: `rachel_${testSuffix}@remedy.com`,
        admin_password: 'Password123!'
      }
    });

    if (regRes.status !== 201) {
      throw new Error(`Failed to onboard test tenant: ${JSON.stringify(regRes.body)}`);
    }

    const tenantId = regRes.body.data.tenant.id;
    const userId = regRes.body.data.user.id;
    const token = regRes.body.data.token;
    const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };

    // Create chart of accounts & fiscal period
    await LedgerAccount.insertMany([
      { tenant_id: tenantId, account_code: '1000', account_name: 'Operating Cash', account_type: 'ASSET', normal_balance: 'DEBIT', current_balance: mongoose.Types.Decimal128.fromString('50000.00'), status: 'ACTIVE' },
      { tenant_id: tenantId, account_code: '1010', account_name: 'Premium Trust Cash', account_type: 'ASSET', normal_balance: 'DEBIT', current_balance: mongoose.Types.Decimal128.fromString('100000.00'), status: 'ACTIVE' },
      { tenant_id: tenantId, account_code: '1100', account_name: 'Premium Receivable', account_type: 'ASSET', normal_balance: 'DEBIT', current_balance: mongoose.Types.Decimal128.fromString('0.00'), status: 'ACTIVE' },
      { tenant_id: tenantId, account_code: '2100', account_name: 'Return Premium Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT', current_balance: mongoose.Types.Decimal128.fromString('0.00'), status: 'ACTIVE' },
      { tenant_id: tenantId, account_code: '2190', account_name: 'Unapplied Cash Suspense', account_type: 'LIABILITY', normal_balance: 'CREDIT', current_balance: mongoose.Types.Decimal128.fromString('0.00'), status: 'ACTIVE' },
      { tenant_id: tenantId, account_code: '2200', account_name: 'Unearned Premium Reserve', account_type: 'LIABILITY', normal_balance: 'CREDIT', current_balance: mongoose.Types.Decimal128.fromString('0.00'), status: 'ACTIVE' },
      { tenant_id: tenantId, account_code: '4000', account_name: 'Earned Premium Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT', current_balance: mongoose.Types.Decimal128.fromString('0.00'), status: 'ACTIVE' },
      { tenant_id: tenantId, account_code: '4100', account_name: 'Policy & NSF Fee Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT', current_balance: mongoose.Types.Decimal128.fromString('0.00'), status: 'ACTIVE' },
      { tenant_id: tenantId, account_code: '5000', account_name: 'Adjustment Expense', account_type: 'EXPENSE', normal_balance: 'DEBIT', current_balance: mongoose.Types.Decimal128.fromString('0.00'), status: 'ACTIVE' }
    ]);

    const fiscalPeriod = await FiscalPeriod.create({
      tenant_id: tenantId,
      period_name: '2026-10',
      fiscal_year: 2026,
      period_number: 10,
      start_date: new Date('2026-10-01'),
      end_date: new Date('2026-10-31'),
      status: 'OPEN'
    });

    const billingAccount = await BillingAccount.create({
      tenant_id: tenantId,
      account_number: `BA-REM-${testSuffix}`,
      customer_name: 'Remedy Logistics LLC',
      current_balance: mongoose.Types.Decimal128.fromString('0.00'),
      unapplied_cash: mongoose.Types.Decimal128.fromString('0.00'),
      status: 'ACTIVE'
    });

    // -------------------------------------------------------------
    // F-01: Legacy Posting Adapter Security Gates
    // -------------------------------------------------------------
    console.log('\n--- Test Group 1: Finding F-01 (Legacy Adapter 3-Gate Security) ---');

    // Case 1: Standard tenant user passes x-use-migration-adapter header -> 403 Forbidden
    const unauthAdapterRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/invoices',
      headers: { ...headers, 'x-use-migration-adapter': 'true' },
      body: {
        billing_account_id: String(billingAccount._id),
        policy_id: `POL-REM-${testSuffix}`,
        lines: [{ line_type: 'PREMIUM', description: 'Unauthorized Legacy Invoice', amount: '1000.00' }]
      }
    });
    assertTest(
      unauthAdapterRes.status === 403,
      'REM-F01-01',
      'x-use-migration-adapter header alone rejected with 403 Forbidden'
    );

    // Case 2: Non-platform admin tries to update settings.allow_legacy_adapter -> 403 Forbidden
    const unauthSettingUpdate = await makeRequest({
      method: 'PATCH',
      path: '/api/v1/tenant/settings',
      headers,
      body: {
        settings: { allow_legacy_adapter: true }
      }
    });
    assertTest(
      unauthSettingUpdate.status === 403,
      'REM-F01-02',
      'Non-platform admin cannot modify tenant settings.allow_legacy_adapter (403 Forbidden)'
    );

    // Case 3: Direct unit check on authorizeMigrationAdapter gates
    const fakeReqNoAuth = {
      user: { _id: userId, is_platform_admin: false },
      tenantId
    };
    const check1 = await authorizeMigrationAdapter(fakeReqNoAuth);
    assertTest(
      check1.authorized === false && check1.reason.includes('SYSTEM_ADMIN'),
      'REM-F01-03',
      'authorizeMigrationAdapter rejects non-admin actor'
    );

    const fakeReqAdminTenantDisabled = {
      user: { _id: userId, is_platform_admin: true },
      tenantId
    };
    const check2 = await authorizeMigrationAdapter(fakeReqAdminTenantDisabled);
    assertTest(
      check2.authorized === false && check2.reason.includes('not opted into migration adapter postings'),
      'REM-F01-04',
      'authorizeMigrationAdapter rejects admin if tenant allow_legacy_adapter is false'
    );

    // Enable tenant allow_legacy_adapter directly in database for platform-authorized tenant
    await Tenant.updateOne({ _id: tenantId }, { $set: { 'settings.allow_legacy_adapter': true } });

    const fakeReqAuthorized = {
      user: { _id: userId, is_platform_admin: true },
      tenantId
    };
    const check3 = await authorizeMigrationAdapter(fakeReqAuthorized);
    assertTest(
      check3.authorized === true,
      'REM-F01-05',
      'authorizeMigrationAdapter authorizes when all 3 gates are met (flag, admin, tenant opt-in)'
    );

    // Case 4: Platform admin CAN update settings via tenant controller when is_platform_admin is set
    await User.updateOne({ _id: userId }, { is_platform_admin: true });
    const authSettingUpdate = await makeRequest({
      method: 'PATCH',
      path: '/api/v1/tenant/settings',
      headers,
      body: {
        settings: { allow_legacy_adapter: true }
      }
    });
    assertTest(
      authSettingUpdate.status === 200 && authSettingUpdate.body.data.settings.allow_legacy_adapter === true,
      'REM-F01-06',
      'Platform admin can update organization settings.allow_legacy_adapter'
    );

    // -------------------------------------------------------------
    // F-02: Atomicity of Business Writes & Outbox Publication
    // -------------------------------------------------------------
    console.log('\n--- Test Group 2: Finding F-02 (Atomic Transactions & Rollback) ---');

    // Case 7: Atomicity inside withOptionalTransaction
    const txInvoiceCountBefore = await Invoice.countDocuments({ tenant_id: tenantId });
    const txOutboxCountBefore = await OutboxEvent.countDocuments({ tenant_id: tenantId });

    // Intentionally inject failure during an atomic transaction
    let caughtTxError = null;
    try {
      await withOptionalTransaction(async (session) => {
        // Step 1: Write an invoice inside session
        const [inv] = await Invoice.create([
          {
            tenant_id: tenantId,
            billing_account_id: billingAccount._id,
            policy_id: `POL-FAIL-${testSuffix}`,
            invoice_number: `INV-FAIL-${testSuffix}`,
            invoice_date: new Date(),
            due_date: new Date(),
            installment_number: 1,
            total_amount: mongoose.Types.Decimal128.fromString('750.00'),
            amount_paid: mongoose.Types.Decimal128.fromString('0.00'),
            balance_due: mongoose.Types.Decimal128.fromString('750.00'),
            status: 'ISSUED'
          }
        ], { session });

        // Step 2: Inject intentional runtime error before commit
        throw new Error('FAILURE_INJECTION_TRIGGERED_SIMULATED_DB_ERROR');
      });
    } catch (e) {
      caughtTxError = e;
    }

    assertTest(
      caughtTxError !== null && caughtTxError.message.includes('FAILURE_INJECTION'),
      'REM-F02-01',
      'Failure injection triggered as expected'
    );

    const txInvoiceCountAfter = await Invoice.countDocuments({ tenant_id: tenantId });
    const txOutboxCountAfter = await OutboxEvent.countDocuments({ tenant_id: tenantId });

    assertTest(
      txInvoiceCountBefore === txInvoiceCountAfter && txOutboxCountBefore === txOutboxCountAfter,
      'REM-F02-02',
      'No orphan business records or outbox records remain after transaction rollback'
    );

    // -------------------------------------------------------------
    // F-03: Fiduciary Sweep Over-Execution Prevention
    // -------------------------------------------------------------
    console.log('\n--- Test Group 3: Finding F-03 (Fiduciary Sweep RULES_ENGINE Recognition) ---');

    const fidAccount = await FiduciaryAccount.create({
      tenant_id: tenantId,
      account_code: `FID-REM-${testSuffix}`,
      account_name: 'Texas Segregated Premium Trust',
      bank_name: 'Frost Bank',
      bank_reference_token: 'FROST-TX-8821',
      trust_type: 'PREMIUM_TRUST',
      current_balance: mongoose.Types.Decimal128.fromString('50000.00'),
      is_segregated: true,
      status: 'ACTIVE'
    });

    // Seed canonical commission agreements & schedules
    const seededComms = await seedTenantCommissions(tenantId);

    // Seed approved MGA commission of $3,765 and zero broker payables
    await CommissionTransaction.create({
      tenant_id: tenantId,
      transaction_number: `CTX-REM-${testSuffix}`,
      agreement_id: seededComms.agreementSummit._id,
      schedule_id: seededComms.scheduleSummit._id,
      source_event_id: `POL-REM-${testSuffix}`,
      source_entity_type: 'POLICY',
      policy_id: `POL-REM-${testSuffix}`,
      policy_reference: `POL-REM-${testSuffix}`,
      payer_party_id: 'CARRIER-SUMMIT',
      payee_party_id: 'MGA-HARBOR',
      rate_applied: mongoose.Types.Decimal128.fromString('20.00'),
      basis_amount: mongoose.Types.Decimal128.fromString('18825.00'),
      calculated_amount: mongoose.Types.Decimal128.fromString('3765.00'),
      net_due_amount: mongoose.Types.Decimal128.fromString('3765.00'),
      effective_date: new Date(),
      accounting_date: new Date(),
      lifecycle_status: 'APPROVED',
      idempotency_key: `KEY-REM-${testSuffix}`
    });

    // Create a prior sweep journal with source_module: 'RULES_ENGINE' and memo: 'fiduciary.sweep.executed'
    await Journal.create({
      tenant_id: tenantId,
      fiscal_period_id: fiscalPeriod._id,
      journal_number: `JRN-SWEEP-PRIOR-${testSuffix}`,
      posting_date: new Date(),
      source_module: 'RULES_ENGINE',
      reference_id: `EVT-FIDUCIARY-SWEEP-PRIOR-${testSuffix}`,
      memo: 'Rule MGA_SWEEP (v1.0) for fiduciary.sweep.executed',
      status: 'POSTED',
      total_debit: mongoose.Types.Decimal128.fromString('2000.00'),
      total_credit: mongoose.Types.Decimal128.fromString('2000.00'),
      accounting_basis: 'GAAP'
    });

    // Now eligible retained commission is $3,765.00 - $2,000.00 = $1,765.00
    // Attempting to sweep $2,000.00 MUST be rejected because it exceeds $1,765.00
    let sweepOverError = null;
    try {
      await executeFiduciarySweep({
        tenantId,
        userId,
        fiduciaryAccountId: fidAccount._id,
        amount: '2000.00',
        useMigrationAdapter: true // using adapter directly for internal calculation check
      });
    } catch (e) {
      sweepOverError = e;
    }

    assertTest(
      sweepOverError !== null && sweepOverError.message.includes('exceeds eligible earned retained MGA commission'),
      'REM-F03-01',
      'Over-sweep rejected because RULES_ENGINE sweep journals are subtracted from eligible retained commission'
    );

    // Attempting to sweep $1,000.00 (<= $1,765.00) must succeed
    const validSweep = await executeFiduciarySweep({
      tenantId,
      userId,
      fiduciaryAccountId: fidAccount._id,
      amount: '1000.00',
      useMigrationAdapter: true
    });
    assertTest(
      validSweep && validSweep.amount === '1000.00',
      'REM-F03-02',
      'Valid sweep within remaining eligible retained commission succeeds'
    );

    // -------------------------------------------------------------
    // F-04: Payment Return Subledger Reconciliation
    // -------------------------------------------------------------
    console.log('\n--- Test Group 4: Finding F-04 (Payment Return Subledger Reconciliation) ---');

    // 1. Issue an invoice for $1,200.00
    const invIssueResult = await issueInvoice({
      tenantId,
      userId,
      billingAccountId: billingAccount._id,
      policyId: `POL-RET-${testSuffix}`,
      installmentNumber: 1,
      invoiceDate: new Date(),
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Trucking Liability', amount: '1200.00' }
      ],
      useMigrationAdapter: true
    });

    const invId = invIssueResult.invoice._id;
    let invAfterIssue = await Invoice.findById(invId);
    let baAfterIssue = await BillingAccount.findById(billingAccount._id);
    assertTest(
      new BigNumber(invAfterIssue.balance_due.toString()).isEqualTo(1200) && invAfterIssue.status === 'ISSUED',
      'REM-F04-01',
      'Invoice issued with balance $1,200.00 and status ISSUED'
    );

    // 2. Pay $1,200.00 in full
    const pmtResult = await processPaymentReceipt({
      tenantId,
      userId,
      billingAccountId: billingAccount._id,
      amount: '1200.00',
      paymentMethod: 'ACH',
      referenceNumber: `ACH-REC-${testSuffix}`,
      targetInvoiceId: invId,
      isFiduciary: true,
      useMigrationAdapter: true
    });

    let invAfterPay = await Invoice.findById(invId);
    let baAfterPay = await BillingAccount.findById(billingAccount._id);
    assertTest(
      new BigNumber(invAfterPay.balance_due.toString()).isZero() && invAfterPay.status === 'PAID',
      'REM-F04-02',
      'Invoice paid in full with balance $0.00 and status PAID'
    );

    // 3. Execute processPaymentReturn for this payment
    const retResult = await processPaymentReturn({
      tenantId,
      userId,
      paymentId: pmtResult.payment._id,
      returnCode: 'R01',
      reasonDescription: 'ACH Insufficient Funds',
      useMigrationAdapter: true
    });

    let invAfterReturn = await Invoice.findById(invId);
    let baAfterReturn = await BillingAccount.findById(billingAccount._id);
    let pmtAfterReturn = await Payment.findById(pmtResult.payment._id);
    let allocAfterReturn = await PaymentAllocation.findOne({ payment_id: pmtResult.payment._id });

    assertTest(
      pmtAfterReturn.status === 'RETURNED' && retResult.paymentReturn.status === 'SETTLED',
      'REM-F04-03',
      'Payment marked RETURNED and PaymentReturn record created'
    );
    assertTest(
      allocAfterReturn.status === 'REVERSED',
      'REM-F04-04',
      'PaymentAllocation status marked REVERSED'
    );
    assertTest(
      new BigNumber(invAfterReturn.balance_due.toString()).isEqualTo(1200) &&
      new BigNumber(invAfterReturn.amount_paid.toString()).isZero() &&
      invAfterReturn.status === 'ISSUED',
      'REM-F04-05',
      'Invoice balance_due ($1,200.00), amount_paid ($0.00), and status (ISSUED) fully restored'
    );
    assertTest(
      new BigNumber(baAfterReturn.current_balance.toString()).isEqualTo(new BigNumber(baAfterIssue.current_balance.toString())),
      'REM-F04-06',
      'BillingAccount current_balance restored after payment return'
    );

    // -------------------------------------------------------------
    // F-05: Unapplied Cash Refund Reconciliation
    // -------------------------------------------------------------
    console.log('\n--- Test Group 5: Finding F-05 (Unapplied Cash Refund Reconciliation) ---');

    // Reset account unapplied cash to $300.00
    await BillingAccount.updateOne(
      { _id: billingAccount._id },
      { $set: { unapplied_cash: mongoose.Types.Decimal128.fromString('300.00') } }
    );

    // Case 1: Attempt to refund $500.00 (> $300.00) from unapplied cash -> rejected
    let refundOverError = null;
    try {
      await processRefundDisbursement({
        tenantId,
        userId,
        billingAccountId: billingAccount._id,
        amount: '500.00',
        reason: 'Refund unapplied cash overpayment',
        refundSourceType: 'UNAPPLIED_CASH',
        useMigrationAdapter: true
      });
    } catch (e) {
      refundOverError = e;
    }

    assertTest(
      refundOverError !== null && refundOverError.message.includes('exceeds available unapplied cash'),
      'REM-F05-01',
      'Refund exceeding available unapplied cash is rejected with descriptive error'
    );

    // Case 2: Refund $200.00 (<= $300.00) from unapplied cash -> succeeds & unapplied cash is decremented
    const validRefund = await processRefundDisbursement({
      tenantId,
      userId,
      billingAccountId: billingAccount._id,
      amount: '200.00',
      reason: 'Refund unapplied cash overpayment',
      refundSourceType: 'UNAPPLIED_CASH',
      useMigrationAdapter: true
    });

    const baAfterRefund = await BillingAccount.findById(billingAccount._id);
    assertTest(
      validRefund && validRefund.refund.status === 'DISBURSED',
      'REM-F05-02',
      'Valid unapplied cash refund disbursed successfully'
    );
    assertTest(
      new BigNumber(baAfterRefund.unapplied_cash.toString()).isEqualTo(100),
      'REM-F05-03',
      'BillingAccount unapplied_cash decremented by exact refund amount ($300 - $200 = $100)'
    );

    // -------------------------------------------------------------
    // F-06: Reject Billing Adjustments Above Open Invoice Balance
    // -------------------------------------------------------------
    console.log('\n--- Test Group 6: Finding F-06 (Adjustment Bounds Check) ---');

    // Current invoice has balance $1,200.00
    // Attempt to apply adjustment of $1,500.00 -> must throw error
    let adjOverError = null;
    try {
      await createAdjustment({
        tenantId,
        userId,
        billingAccountId: billingAccount._id,
        invoiceId: invId,
        adjustmentType: 'CREDIT_MEMO',
        amount: '1500.00',
        reasonCode: 'CUSTOMER_SATISFACTION',
        reasonDescription: 'Excessive adjustment test',
        useMigrationAdapter: true
      });
    } catch (e) {
      adjOverError = e;
    }

    assertTest(
      adjOverError !== null && adjOverError.message.includes('cannot exceed open invoice balance'),
      'REM-F06-01',
      'Adjustment exceeding open invoice balance is rejected with exact BigNumber error'
    );

    // Apply valid adjustment of $200.00 -> invoice balance becomes $1,000.00
    const validAdj = await createAdjustment({
      tenantId,
      userId,
      billingAccountId: billingAccount._id,
      invoiceId: invId,
      adjustmentType: 'CREDIT_MEMO',
      amount: '200.00',
      reasonCode: 'CUSTOMER_SATISFACTION',
      reasonDescription: 'Goodwill adjustment',
      useMigrationAdapter: true
    });

    const invAfterAdj = await Invoice.findById(invId);
    assertTest(
      validAdj && validAdj.adjustment.status === 'APPLIED',
      'REM-F06-02',
      'Valid adjustment within invoice balance is successfully applied'
    );
    assertTest(
      new BigNumber(invAfterAdj.balance_due.toString()).isEqualTo(1000),
      'REM-F06-03',
      'Invoice balance_due reduced by exact adjustment amount ($1,200 - $200 = $1,000)'
    );

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(` REMEDIATION ACCEPTANCE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      console.error(`Remediation acceptance tests failed with ${failedCount} failures.`);
      process.exit(1);
    } else {
      console.log('ALL REMEDIATION ACCEPTANCE TESTS PASSED SUCCESSFULLY (F-01 through F-06)!');
      process.exit(0);
    }

  } catch (err) {
    console.error('Fatal error during remediation acceptance tests:', err);
    process.exit(1);
  }
}

runRemediationAcceptanceTests();
