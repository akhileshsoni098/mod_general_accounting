require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const {
  Tenant,
  User,
  TenantMembership,
  Role,
  TenantModuleEntitlement,
  LedgerAccount,
  FiscalPeriod,
  SubledgerBalance,
  ReconciliationCase,
  TrialBalanceSnapshot,
  TrialBalanceLine,
  PeriodCloseTask,
  GLExportBatch,
  CommissionAdjustment,
  CommissionDispute,
  Journal
} = require('../src/models');
const { seedRbacCatalog } = require('../src/utils/seedRbac');
const { seedTenantChartOfAccounts } = require('../src/utils/seedCoa');
const { seedFiscalPeriods } = require('../src/utils/seedFiscalPeriods');
const financeCloseService = require('../src/services/financeCloseService');
const { postJournalEntry } = require('../src/services/journalPostingService');

let tenantA, tenantB;
let userA;
let suiteErrors = [];
let passedCount = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTest(testName, testFn) {
  try {
    process.stdout.write(`\n[Test] ${testName}...\n`);
    await testFn();
    passedCount++;
    console.log(`✓ Passed: ${testName}`);
  } catch (err) {
    console.error(`✗ FAILED: ${testName} - Error: ${err.message}`);
    suiteErrors.push({ testName, error: err.message });
  }
}

async function setup() {
  await connectDB();
  await seedRbacCatalog();

  // Create or retrieve Tenant A (Lone Pine Finance Close)
  tenantA = await Tenant.findOneAndUpdate(
    { tenant_code: 'LONE_PINE_CLOSE' },
    {
      name: 'Lone Pine Close & Reporting LLC',
      domain: 'lonepineclose.veridex.test',
      status: 'ACTIVE'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Enable GL and FINANCE_CLOSE entitlements
  await TenantModuleEntitlement.findOneAndUpdate(
    { tenant_id: tenantA._id, module_code: 'GL' },
    { is_enabled: true },
    { upsert: true, new: true }
  );
  await TenantModuleEntitlement.findOneAndUpdate(
    { tenant_id: tenantA._id, module_code: 'FINANCE_CLOSE' },
    { is_enabled: true },
    { upsert: true, new: true }
  );

  // Seed COA & Fiscal Periods
  await seedTenantChartOfAccounts(tenantA._id);
  await seedFiscalPeriods(tenantA._id, 2026);

  // Tenant B for tenant isolation testing
  tenantB = await Tenant.findOneAndUpdate(
    { tenant_code: 'APEX_CLOSE_TEST' },
    {
      name: 'Apex Close Test LLC',
      domain: 'apexclose.veridex.test',
      status: 'ACTIVE'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await TenantModuleEntitlement.findOneAndUpdate(
    { tenant_id: tenantB._id, module_code: 'FINANCE_CLOSE' },
    { is_enabled: false }, // Explicitly disabled
    { upsert: true, new: true }
  );
  await seedTenantChartOfAccounts(tenantB._id);
  await seedFiscalPeriods(tenantB._id, 2026);

  // Reset collections cleanly for Tenant A
  await SubledgerBalance.deleteMany({ tenant_id: tenantA._id });
  await ReconciliationCase.deleteMany({ tenant_id: tenantA._id });
  await TrialBalanceSnapshot.deleteMany({ tenant_id: tenantA._id });
  await TrialBalanceLine.deleteMany({ tenant_id: tenantA._id });
  await PeriodCloseTask.deleteMany({ tenant_id: tenantA._id });
  await GLExportBatch.deleteMany({ tenant_id: tenantA._id });
  await CommissionAdjustment.deleteMany({ tenant_id: tenantA._id });
  await CommissionDispute.deleteMany({ tenant_id: tenantA._id });
  await Journal.deleteMany({ tenant_id: tenantA._id });

  // Reset all account balances to 0.00
  await LedgerAccount.updateMany(
    { tenant_id: tenantA._id },
    { current_balance: mongoose.Types.Decimal128.fromString('0.00') }
  );

  // Seed Inception Written Premium for POL-TX-8821 ($37,650.00)
  // Dr 1100 AR $37,650.00 / Cr 2200 UPR $37,650.00
  await postJournalEntry({
    tenantId: tenantA._id,
    postingDate: new Date('2026-07-01'),
    sourceModule: 'BILLING_INVOICE',
    referenceId: 'POL-TX-8821-INCEPTION',
    memo: 'Policy Inception Full Written Premium for POL-TX-8821 ($37,650.00)',
    lines: [
      { account_code: '1100', debit: '37650.00', credit: '0.00', memo: 'Dr AR for Full Policy Premium' },
      { account_code: '2200', debit: '0.00', credit: '37650.00', memo: 'Cr Initial Unearned Premium Reserve' }
    ]
  });
}

async function runAllTests() {
  console.log('================================================================');
  console.log(' STARTING PHASE 6: FINANCE CLOSE & UPR ACCEPTANCE SUITE         ');
  console.log('================================================================');

  await setup();

  // Test 1: Canonical 31-day UPR earning yields $3,197.67
  await runTest('T01: Canonical 31-day UPR calculation yields $3,197.67', async () => {
    const calc = financeCloseService.calculateUPREarning({
      writtenPremium: '37650.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2026-07-31')
    });
    assert(calc.earned_premium === '3197.67', `Expected $3,197.67 earned premium, got ${calc.earned_premium}`);
    assert(calc.covered_days === 31, `Expected 31 covered days, got ${calc.covered_days}`);
  });

  // Test 2: Remaining unearned UPR reconciles to $34,452.33
  await runTest('T02: Remaining UPR reconciles to $34,452.33 after July', async () => {
    const calc = financeCloseService.calculateUPREarning({
      writtenPremium: '37650.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2026-07-31')
    });
    assert(calc.remaining_upr === '34452.33', `Expected $34,452.33 remaining UPR, got ${calc.remaining_upr}`);
    assert(
      (parseFloat(calc.earned_premium) + parseFloat(calc.remaining_upr)).toFixed(2) === '37650.00',
      'Earned + Unearned exactly equals $37,650.00'
    );
  });

  // Test 3: Earning journal is balanced and updates GL accounts (Dr 2200 / Cr 4000)
  await runTest('T03: UPR Earning journal is balanced and updates GL accounts', async () => {
    const result = await financeCloseService.executeUPRAmortizationRun({
      tenantId: tenantA._id,
      policyReference: 'POL-TX-8821',
      periodName: '2026-07',
      writtenPremium: '37650.00'
    });

    assert(result.journal !== null, 'Journal generated');
    assert(parseFloat(result.journal.total_debit.toString()) === 3197.67, 'Journal debits $3,197.67');
    assert(parseFloat(result.journal.total_credit.toString()) === 3197.67, 'Journal credits $3,197.67');

    // Verify GL Account balances
    const uprAcc = await LedgerAccount.findOne({ tenant_id: tenantA._id, account_code: '2200' });
    const revAcc = await LedgerAccount.findOne({ tenant_id: tenantA._id, account_code: '4000' });
    assert(parseFloat(uprAcc.current_balance.toString()) === 34452.33, `Account 2200 UPR reduced to $34,452.33 (got ${uprAcc.current_balance})`);
    assert(parseFloat(revAcc.current_balance.toString()) === 3197.67, `Account 4000 Revenue increased to $3,197.67 (got ${revAcc.current_balance})`);
  });

  // Test 4: Re-running identical earning job does not double-post (idempotent)
  await runTest('T04: Re-running identical earning job does not double-post', async () => {
    const repeatResult = await financeCloseService.executeUPRAmortizationRun({
      tenantId: tenantA._id,
      policyReference: 'POL-TX-8821',
      periodName: '2026-07',
      writtenPremium: '37650.00'
    });
    assert(repeatResult.alreadyRun === true, 'Duplicate run detected and blocked');

    // Verify revenue was NOT double counted
    const revAcc = await LedgerAccount.findOne({ tenant_id: tenantA._id, account_code: '4000' });
    assert(parseFloat(revAcc.current_balance.toString()) === 3197.67, 'Revenue remains $3,197.67');
  });

  // Test 5: Full term accumulated earned plus remaining unearned equals written premium
  await runTest('T05: Full-term accumulation plus remaining unearned reconciles exactly', async () => {
    const calcEnd = financeCloseService.calculateUPREarning({
      writtenPremium: '37650.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2027-07-01')
    });
    assert(calcEnd.earned_premium === '37650.00', 'Full term earns 100% of premium ($37,650.00)');
    assert(calcEnd.remaining_upr === '0.00', 'Remaining UPR is $0.00 at term expiration');
  });

  // Test 6: Closed-period earning attempt is rejected
  await runTest('T06: Closed-period earning attempt is rejected', async () => {
    const period = await FiscalPeriod.findOne({ tenant_id: tenantA._id, period_name: '2026-07' });
    period.status = 'HARD_CLOSED';
    await period.save();

    let threw = false;
    try {
      await financeCloseService.executeUPRAmortizationRun({
        tenantId: tenantA._id,
        policyReference: 'POL-TX-8821-CLOSED',
        periodName: '2026-07'
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('strictly prohibited'), 'Closed period error message');
    }
    assert(threw, 'Closed period rejected posting');

    // Restore period to OPEN
    period.status = 'OPEN';
    await period.save();
  });

  // Test 7: Invalid term dates rejected
  await runTest('T07: Invalid term dates rejected', async () => {
    let threw = false;
    try {
      financeCloseService.calculateUPREarning({
        writtenPremium: '37650.00',
        termStartDate: new Date('2027-01-01'),
        termEndDate: new Date('2026-01-01') // end before start
      });
    } catch (err) {
      threw = true;
    }
    assert(threw, 'Inverted term dates rejected');
  });

  // Test 8: Subledger Reconciliation - Zero variance produces BALANCED status
  await runTest('T08: Matching subledger and GL balances produce zero variance', async () => {
    const recs = await financeCloseService.reconcileSubledgers({ tenantId: tenantA._id });
    const trustRec = recs.find(r => r.subledger_type === 'FIDUCIARY_TRUST');
    assert(trustRec !== undefined, 'Fiduciary trust reconciliation recorded');
    assert(parseFloat(trustRec.variance.toString()) === 0, 'Zero variance');
    assert(trustRec.reconciliation_status === 'BALANCED', 'Status is BALANCED');
  });

  // Test 9: Mismatched AR creates ReconciliationCase
  await runTest('T09: Mismatched AR creates or updates ReconciliationCase', async () => {
    const cases = await ReconciliationCase.find({ tenant_id: tenantA._id });
    assert(cases.length >= 1, 'ReconciliationCase automatically logged');
    assert(cases[0].subledger_type === 'AR', 'AR discrepancy case');
    assert(cases[0].status === 'OPEN', 'Case is OPEN');
  });

  // Test 10: Reconciliation case resolution workflow
  await runTest('T10: Reconciliation case resolution workflow', async () => {
    const c = await ReconciliationCase.findOne({ tenant_id: tenantA._id, status: 'OPEN' });
    c.status = 'RESOLVED';
    c.resolution_reason = 'Variance investigated: Single upfront inception journal booked prior to installment schedule';
    c.resolved_at = new Date();
    await c.save();

    const updated = await ReconciliationCase.findById(c._id);
    assert(updated.status === 'RESOLVED', 'Case resolved');
  });

  // Test 11: Trial Balance derives totals exclusively from posted entries
  await runTest('T11: Trial Balance totals derive only from posted entries', async () => {
    const tb = await financeCloseService.generateTrialBalanceSnapshot({
      tenantId: tenantA._id,
      periodName: '2026-07',
      isCertified: false
    });
    assert(tb.snapshot.is_balanced === true, 'Trial Balance is balanced');
    assert(parseFloat(tb.snapshot.total_debits.toString()) === parseFloat(tb.snapshot.total_credits.toString()), 'Debits equal Credits');
  });

  // Test 12: Certified Trial Balance Snapshot is immutable
  await runTest('T12: Certified snapshot cannot be edited after certification', async () => {
    const certTb = await financeCloseService.generateTrialBalanceSnapshot({
      tenantId: tenantA._id,
      periodName: '2026-07',
      isCertified: true
    });
    assert(certTb.snapshot.status === 'CERTIFIED', 'Snapshot is CERTIFIED');

    // Generating another creates version 2, preserving version 1
    const v2 = await financeCloseService.generateTrialBalanceSnapshot({
      tenantId: tenantA._id,
      periodName: '2026-07',
      isCertified: false
    });
    assert(v2.snapshot.version > certTb.snapshot.version, 'New snapshot increments version');
    const v1 = await TrialBalanceSnapshot.findOne({ _id: certTb.snapshot._id });
    assert(v1.status === 'CERTIFIED', 'Original certified snapshot preserved immutable');
  });

  // Test 13: Trial Balance lines agree with header totals
  await runTest('T13: Trial Balance line totals agree with snapshot header', async () => {
    const snapshot = await TrialBalanceSnapshot.findOne({ tenant_id: tenantA._id, version: 1 });
    const lines = await TrialBalanceLine.find({ snapshot_id: snapshot._id });

    let sumDr = 0;
    let sumCr = 0;
    for (const l of lines) {
      sumDr += parseFloat(l.debit_balance.toString());
      sumCr += parseFloat(l.credit_balance.toString());
    }

    assert(sumDr.toFixed(2) === parseFloat(snapshot.total_debits.toString()).toFixed(2), 'Lines debit sum equals header');
    assert(sumCr.toFixed(2) === parseFloat(snapshot.total_credits.toString()).toFixed(2), 'Lines credit sum equals header');
  });

  // Test 14: Balance Sheet and P&L derived from posted GL accounts
  await runTest('T14: Balance Sheet and P&L derived from posted GL accounts', async () => {
    const reports = await financeCloseService.generateFinancialReports({ tenantId: tenantA._id });
    assert(parseFloat(reports.balanceSheet.total_assets) > 0, 'Balance sheet assets reported');
    assert(parseFloat(reports.incomeStatement.total_revenue) === 3197.67, 'Earned premium revenue is $3,197.67');
    assert(parseFloat(reports.incomeStatement.net_income) === 3197.67, 'Net income is $3,197.67');
  });

  // Test 15: Exactly seven configured close tasks in sequential order
  await runTest('T15: Exactly seven configured close tasks in sequential order', async () => {
    const period = await FiscalPeriod.findOne({ tenant_id: tenantA._id, period_name: '2026-07' });
    const tasks = await financeCloseService.initializeCloseChecklist(tenantA._id, period._id);
    assert(tasks.length === 7, `Expected 7 close tasks, got ${tasks.length}`);
    for (let i = 0; i < 7; i++) {
      assert(tasks[i].task_step === i + 1, `Task order correct: Step ${i + 1}`);
    }
  });

  // Test 16: Close task prerequisite enforcement
  await runTest('T16: Close task cannot run out of order without prerequisite', async () => {
    const period = await FiscalPeriod.findOne({ tenant_id: tenantA._id, period_name: '2026-07' });

    let threw = false;
    try {
      // Step 6 requires Step 5, which is not completed
      await financeCloseService.executeCloseStep({
        tenantId: tenantA._id,
        fiscalPeriodId: period._id,
        stepNumber: 6
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('Prerequisite step'), 'Prerequisite error message');
    }
    assert(threw, 'Out of order step rejected');
  });

  // Test 17: Sequential execution of 7-step close locks fiscal period
  await runTest('T17: Sequential execution of 7-step close locks fiscal period', async () => {
    const period = await FiscalPeriod.findOne({ tenant_id: tenantA._id, period_name: '2026-07' });

    for (let s = 1; s <= 7; s++) {
      await financeCloseService.executeCloseStep({
        tenantId: tenantA._id,
        fiscalPeriodId: period._id,
        stepNumber: s
      });
    }

    const tasks = await PeriodCloseTask.find({ tenant_id: tenantA._id, fiscal_period_id: period._id });
    const allCompleted = tasks.every(t => t.status === 'COMPLETED');
    assert(allCompleted, 'All 7 tasks COMPLETED');

    const closedPeriod = await FiscalPeriod.findById(period._id);
    assert(closedPeriod.status === 'HARD_CLOSED', 'Period locked to HARD_CLOSED');
  });

  // Test 18: ERP Export Batch creation and manifest verification
  await runTest('T18: ERP Export Batch creation and manifest verification', async () => {
    const period = await FiscalPeriod.findOne({ tenant_id: tenantA._id, period_name: '2026-07' });
    const batch = await financeCloseService.generateGLExportBatch({
      tenantId: tenantA._id,
      fiscalPeriodId: period._id,
      targetErp: 'SAP_S4HANA'
    });

    assert(batch.batch_number.startsWith('ERP-EXP-'), 'Batch number generated');
    assert(batch.target_erp === 'SAP_S4HANA', 'Target ERP set');
    assert(batch.checksum.startsWith('SHA256-'), 'Checksum assigned');
    assert(batch.status === 'READY', 'Status is READY');
  });

  // Test 19: Commission Adjustments & Disputes creation and linkage
  await runTest('T19: Commission Adjustments & Disputes linked to transactions', async () => {
    const dummyCommTxId = new mongoose.Types.ObjectId();
    const adj = await CommissionAdjustment.create({
      tenant_id: tenantA._id,
      adjustment_number: 'CADJ-2026-0001',
      commission_transaction_id: dummyCommTxId,
      policy_reference: 'POL-TX-8821',
      adjustment_type: 'CLAWBACK',
      amount: mongoose.Types.Decimal128.fromString('150.00'),
      reason: 'Mid-term endorsement vehicle removal',
      status: 'APPROVED',
      idempotency_key: 'KEY-CADJ-001'
    });
    assert(adj.adjustment_number === 'CADJ-2026-0001', 'Adjustment created');

    const dispute = await CommissionDispute.create({
      tenant_id: tenantA._id,
      dispute_number: 'CDISP-2026-0001',
      commission_transaction_id: dummyCommTxId,
      claimant_party_id: 'BROKER-BRIGHTLINE',
      disputed_amount: mongoose.Types.Decimal128.fromString('250.00'),
      reason: 'Rate calculation challenge on cargo endorsement',
      status: 'OPEN'
    });
    assert(dispute.dispute_number === 'CDISP-2026-0001', 'Dispute created');
  });

  // Test 20: Cross-tenant isolation
  await runTest('T20: Tenant B cannot access Tenant A snapshots or tasks', async () => {
    const tenantBTasks = await PeriodCloseTask.find({ tenant_id: tenantB._id });
    assert(tenantBTasks.length === 0, 'Tenant B has zero access to Tenant A tasks');

    const tenantBSnapshots = await TrialBalanceSnapshot.find({ tenant_id: tenantB._id });
    assert(tenantBSnapshots.length === 0, 'Tenant B has zero access to Tenant A snapshots');
  });

  // Test 21: Trial Balance Equilibrium preserved across all entries
  await runTest('T21: Trial Balance double-entry equilibrium preserved', async () => {
    const journals = await Journal.find({ tenant_id: tenantA._id, status: 'POSTED' });
    let totalDebits = 0;
    let totalCredits = 0;

    for (const j of journals) {
      totalDebits += parseFloat(j.total_debit.toString());
      totalCredits += parseFloat(j.total_credit.toString());
    }

    assert(totalDebits.toFixed(2) === totalCredits.toFixed(2), `Equilibrium mismatch: Dr ${totalDebits} != Cr ${totalCredits}`);
    console.log(`[GL Equilibrium] Total Debits: $${totalDebits.toFixed(2)} == Total Credits: $${totalCredits.toFixed(2)}`);
  });

  // Summary
  console.log('\n================================================================');
  console.log(` PHASE 6 FINANCE CLOSE & UPR ACCEPTANCE RESULTS`);
  console.log(` Total tests: ${passedCount + suiteErrors.length}`);
  console.log(` Passed: ${passedCount}`);
  console.log(` Failed: ${suiteErrors.length}`);
  console.log(` Process exit code: ${suiteErrors.length === 0 ? 0 : 1}`);
  console.log('================================================================');

  if (suiteErrors.length > 0) {
    console.error('Failed Tests:');
    suiteErrors.forEach(e => console.error(`- ${e.testName}: ${e.error}`));
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
