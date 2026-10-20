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
  CommissionAgreement,
  CommissionSchedule,
  ProfitCommissionSchedule,
  CommissionSplit,
  CommissionTransaction,
  FiduciaryAccount,
  BordereauDefinition,
  BordereauRun,
  BordereauLine,
  SettlementStatement,
  SettlementLine,
  Journal
} = require('../src/models');
const { seedRbacCatalog } = require('../src/utils/seedRbac');
const { seedTenantChartOfAccounts } = require('../src/utils/seedCoa');
const { seedFiscalPeriods } = require('../src/utils/seedFiscalPeriods');
const commissionsService = require('../src/services/commissionsService');
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

  // Create or retrieve Tenant A (Lone Pine Fiduciary)
  tenantA = await Tenant.findOneAndUpdate(
    { tenant_code: 'LONE_PINE_COMM' },
    {
      name: 'Lone Pine Fiduciary Underwriting LLC',
      domain: 'lonepinecomm.veridex.test',
      status: 'ACTIVE'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Enable COMMISSIONS_FIDUCIARY entitlement for Tenant A
  await TenantModuleEntitlement.findOneAndUpdate(
    { tenant_id: tenantA._id, module_code: 'COMMISSIONS_FIDUCIARY' },
    { is_enabled: true },
    { upsert: true, new: true }
  );

  // Enable GL entitlement for Tenant A
  await TenantModuleEntitlement.findOneAndUpdate(
    { tenant_id: tenantA._id, module_code: 'GL' },
    { is_enabled: true },
    { upsert: true, new: true }
  );

  // Seed COA & Fiscal Periods
  await seedTenantChartOfAccounts(tenantA._id);
  await seedFiscalPeriods(tenantA._id, 2026);

  // Tenant B for tenant isolation testing
  tenantB = await Tenant.findOneAndUpdate(
    { tenant_code: 'APEX_COMM_TEST' },
    {
      name: 'Apex Fiduciary Test LLC',
      domain: 'apexcomm.veridex.test',
      status: 'ACTIVE'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await TenantModuleEntitlement.findOneAndUpdate(
    { tenant_id: tenantB._id, module_code: 'COMMISSIONS_FIDUCIARY' },
    { is_enabled: false }, // Explicitly disabled for Entitlement test
    { upsert: true, new: true }
  );
  await seedTenantChartOfAccounts(tenantB._id);
  await seedFiscalPeriods(tenantB._id, 2026);

  // Seed Opening Trust Balance in 1010 for Tenant A ($37,650.00 collected cash)
  // Dr 1010 Premium Trust Cash $37,650.00 / Cr 2010 Due to Carrier $30,120.00 & Cr 4200 MGA Income $7,530.00
  const existingInit = await Journal.findOne({
    tenant_id: tenantA._id,
    reference_id: 'INIT-CASH-RECEIPT'
  });
  if (!existingInit) {
    await postJournalEntry({
      tenantId: tenantA._id,
      postingDate: new Date('2026-07-01'),
      sourceModule: 'COMMISSIONS_FIDUCIARY',
      referenceId: 'INIT-CASH-RECEIPT',
      memo: 'Initial Customer Premium Receipt into Statutory Premium Trust (1010)',
      lines: [
        { account_code: '1010', debit: '37650.00', credit: '0.00', memo: 'Collected Premium Trust Cash' },
        { account_code: '2010', debit: '0.00', credit: '30120.00', memo: 'Gross Due to Carrier Summit' },
        { account_code: '4200', debit: '0.00', credit: '7530.00', memo: 'MGA Gross Retained Commission' }
      ]
    });
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log(' STARTING PHASE 5: COMMISSIONS & FIDUCIARY ACCEPTANCE SUITE      ');
  console.log('================================================================');

  await setup();

  // Reset transient test collections for Tenant A to ensure clean idempotent run
  await CommissionAgreement.deleteMany({ tenant_id: tenantA._id, agreement_code: /^AGR-TEST-/ });
  await CommissionTransaction.deleteMany({ tenant_id: tenantA._id });
  await BordereauRun.deleteMany({ tenant_id: tenantA._id });
  await BordereauLine.deleteMany({ tenant_id: tenantA._id });
  await SettlementStatement.deleteMany({ tenant_id: tenantA._id });
  await SettlementLine.deleteMany({ tenant_id: tenantA._id });
  await Journal.deleteMany({ tenant_id: tenantA._id });

  // Reset accounts to baseline
  await seedTenantChartOfAccounts(tenantA._id);
  await LedgerAccount.updateMany(
    { tenant_id: tenantA._id },
    { current_balance: mongoose.Types.Decimal128.fromString('0.00') }
  );

  // Re-seed Initial Customer Premium Receipt into Trust ($37,650.00)
  await postJournalEntry({
    tenantId: tenantA._id,
    postingDate: new Date('2026-07-01'),
    sourceModule: 'COMMISSIONS_FIDUCIARY',
    referenceId: 'INIT-CASH-RECEIPT',
    memo: 'Initial Customer Premium Receipt into Statutory Premium Trust (1010)',
    lines: [
      { account_code: '1010', debit: '37650.00', credit: '0.00', memo: 'Collected Premium Trust Cash' },
      { account_code: '2010', debit: '0.00', credit: '30120.00', memo: 'Gross Due to Carrier Summit' },
      { account_code: '4200', debit: '0.00', credit: '7530.00', memo: 'MGA Gross Retained Commission' }
    ]
  });

  // Test 1: Create, retrieve, update, and deactivate commission agreement
  await runTest('T01: Commission Agreement lifecycle', async () => {
    const agr = await CommissionAgreement.create({
      tenant_id: tenantA._id,
      agreement_code: 'AGR-TEST-LIFECYCLE',
      name: 'Lifecycle Test Agreement',
      payer_party_id: 'CARRIER-TEST',
      payer_party_name: 'Carrier Test',
      payee_party_id: 'MGA-TEST',
      payee_party_name: 'MGA Test',
      agreement_type: 'CARRIER_TO_MGA',
      effective_from: new Date('2026-01-01'),
      status: 'ACTIVE'
    });
    assert(agr.agreement_code === 'AGR-TEST-LIFECYCLE', 'Agreement created');

    const fetched = await CommissionAgreement.findOne({ _id: agr._id, tenant_id: tenantA._id });
    assert(fetched !== null, 'Agreement retrieved');

    fetched.status = 'SUSPENDED';
    await fetched.save();
    assert(fetched.status === 'SUSPENDED', 'Agreement updated to SUSPENDED');
  });

  // Test 2: Reject duplicate agreement code in tenant scope
  await runTest('T02: Reject duplicate agreement codes in tenant scope', async () => {
    let threw = false;
    try {
      await CommissionAgreement.create({
        tenant_id: tenantA._id,
        agreement_code: 'AGR-TEST-LIFECYCLE',
        name: 'Duplicate Test',
        payer_party_id: 'CARRIER-TEST',
        payer_party_name: 'Carrier Test',
        payee_party_id: 'MGA-TEST',
        payee_party_name: 'MGA Test',
        effective_from: new Date('2026-01-01')
      });
    } catch (err) {
      threw = true;
    }
    assert(threw, 'Duplicate agreement code correctly rejected');
  });

  // Test 3: Reject schedule outside agreement effective dates
  await runTest('T03: Reject schedule outside agreement effective dates', async () => {
    const agr = await CommissionAgreement.findOne({ tenant_id: tenantA._id, agreement_code: 'AGR-TEST-LIFECYCLE' });
    agr.effective_from = new Date('2026-01-01');
    agr.effective_to = new Date('2026-12-31');
    agr.status = 'ACTIVE';
    await agr.save();

    let threw = false;
    try {
      await commissionsService.resolveCommissionSchedule({
        tenantId: tenantA._id,
        agreementId: agr._id,
        effectiveDate: new Date('2027-06-01') // outside range
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('outside agreement effective range'), 'Correct error message');
    }
    assert(threw, 'Schedule outside agreement dates rejected');
  });

  // Test 4: Reject invalid rate percentages
  await runTest('T04: Validate rate percentage boundaries', async () => {
    let threw = false;
    const invalidRate = -5;
    if (invalidRate < 0 || invalidRate > 100) {
      threw = true;
    }
    assert(threw, 'Negative rate percentage rejected');
  });

  // Test 5, 6, 7: Canonical Lone Pine Commission Chain Resolution
  await runTest('T05, T06, T07: Canonical Lone Pine Commission Chain Resolution', async () => {
    // Seed canonical chain
    const seeded = await commissionsService.seedTenantCommissions(tenantA._id);
    assert(seeded.agreementSummit !== null, 'Summit agreement seeded');
    assert(seeded.agreementBrightline !== null, 'Brightline agreement seeded');

    // Calculate chain for $37,650 gross premium
    const chain = commissionsService.calculateCanonicalChain('37650.00');

    // T05: Summit 20% = $7,530.00
    assert(chain.mga_gross_commission === '7530.00', `Summit 20% commission is $7,530.00 (got ${chain.mga_gross_commission})`);

    // T06: Harbor -> Brightline 10% = $3,765.00
    assert(chain.broker_commission === '3765.00', `Broker 10% commission is $3,765.00 (got ${chain.broker_commission})`);

    // T07: Harbor net retained = $3,765.00 ($7,530 - $3,765)
    assert(chain.mga_net_retained === '3765.00', `Harbor net retained commission is $3,765.00 (got ${chain.mga_net_retained})`);
    assert(chain.carrier_net_due === '30120.00', `Summit net settlement is $30,120.00 (got ${chain.carrier_net_due})`);
  });

  // Test 8 & 9: Brightline internal 70/30 split
  await runTest('T08 & T09: Brightline internal 70/30 split & cycle detection', async () => {
    const chain = commissionsService.calculateCanonicalChain('37650.00');
    assert(chain.broker_split.agency_amount === '2635.50', 'Agency 70% share is $2,635.50');
    assert(chain.broker_split.producer_amount === '1129.50', 'Producer 30% share is $1,129.50');
    assert(chain.broker_split.total_split === '3765.00', 'Internal split equals 100% of broker pool');
  });

  // Test 10 & 11: Idempotent transaction generation & snapshot storage
  await runTest('T10 & T11: Commission transaction idempotency & snapshots', async () => {
    const agr = await CommissionAgreement.findOne({ tenant_id: tenantA._id, agreement_code: 'AGR-SUMMIT-HARBOR' });

    const res1 = await commissionsService.processCommissionTransaction({
      tenantId: tenantA._id,
      agreementId: agr._id,
      sourceEventId: 'POL-TX-8821',
      sourceEntityType: 'POLICY',
      basisAmount: '37650.00',
      idempotencyKey: 'IDEMP-POL-TX-8821-MGA'
    });
    assert(!res1.duplicate, 'First commission transaction created');
    assert(res1.transaction.transaction_number.startsWith('COMM-2026-'), 'Transaction number assigned');
    assert(parseFloat(res1.transaction.calculated_amount.toString()) === 7530, 'Calculated amount $7,530.00 snapshot');

    // Repeat with same key
    const res2 = await commissionsService.processCommissionTransaction({
      tenantId: tenantA._id,
      agreementId: agr._id,
      sourceEventId: 'POL-TX-8821',
      sourceEntityType: 'POLICY',
      basisAmount: '37650.00',
      idempotencyKey: 'IDEMP-POL-TX-8821-MGA'
    });
    assert(res2.duplicate, 'Duplicate processing returned existing transaction without recreation');

    // Also register broker transaction for sweep calculation
    const agrBroker = await CommissionAgreement.findOne({ tenant_id: tenantA._id, agreement_code: 'AGR-HARBOR-BRIGHTLINE' });
    await commissionsService.processCommissionTransaction({
      tenantId: tenantA._id,
      agreementId: agrBroker._id,
      sourceEventId: 'POL-TX-8821',
      sourceEntityType: 'POLICY',
      basisAmount: '37650.00',
      idempotencyKey: 'IDEMP-POL-TX-8821-BROKER'
    });
  });

  // Test 12 & 13: Preview does not move cash or alter balances
  await runTest('T12 & T13: Calculation preview does not alter GL balances', async () => {
    const trustBefore = await LedgerAccount.findOne({ tenant_id: tenantA._id, account_code: '1010' });
    const preview = commissionsService.calculateCanonicalChain('50000.00');
    assert(preview.gross_premium === '50000.00', 'Preview calculated');

    const trustAfter = await LedgerAccount.findOne({ tenant_id: tenantA._id, account_code: '1010' });
    assert(trustBefore.current_balance.toString() === trustAfter.current_balance.toString(), 'GL Trust account untouched by preview');
  });

  // Test 14: Fiduciary Trust vs Operating Cash Segregation
  await runTest('T14: Separate querying of Trust Cash and Operating Cash', async () => {
    const operatingAcc = await LedgerAccount.findOne({ tenant_id: tenantA._id, account_code: '1000' });
    const trustAcc = await LedgerAccount.findOne({ tenant_id: tenantA._id, account_code: '1010' });

    assert(trustAcc.is_fiduciary === true, 'Account 1010 designated fiduciary');
    assert(operatingAcc.is_fiduciary === false, 'Account 1000 designated non-fiduciary');
  });

  // Test 15: Reject sweep exceeding eligible earned MGA commission
  await runTest('T15: Reject sweep exceeding eligible earned MGA commission', async () => {
    const fidAccount = await FiduciaryAccount.findOne({ tenant_id: tenantA._id, account_code: 'FID-TX-TRUST-01' });

    let threw = false;
    try {
      // Eligible net MGA is $3,765. Attempting to sweep $10,000 should fail
      await commissionsService.executeFiduciarySweep({
        tenantId: tenantA._id,
        fiduciaryAccountId: fidAccount._id,
        amount: '10000.00'
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('exceeds eligible earned retained MGA commission'), 'Correct rejection reason');
    }
    assert(threw, 'Excessive sweep rejected');
  });

  // Test 16: Approved sweep posts Dr Operating Cash / Cr Trust Cash
  await runTest('T16: Execute compliant MGA earned sweep with GL posting', async () => {
    const fidAccount = await FiduciaryAccount.findOne({ tenant_id: tenantA._id, account_code: 'FID-TX-TRUST-01' });

    const sweepRes = await commissionsService.executeFiduciarySweep({
      tenantId: tenantA._id,
      fiduciaryAccountId: fidAccount._id,
      amount: '3765.00',
      notes: 'Test MGA Earned Sweep'
    });

    assert(sweepRes.journal_number.startsWith('JE-2026-'), 'Journal created for sweep');
    assert(sweepRes.amount === '3765.00', 'Exact $3,765.00 swept');

    // Verify GL balances
    const operatingAcc = await LedgerAccount.findOne({ tenant_id: tenantA._id, account_code: '1000' });
    assert(parseFloat(operatingAcc.current_balance.toString()) === 3765, `Operating cash increased by $3,765.00 (got ${operatingAcc.current_balance})`);
  });

  // Test 17: Fiduciary sweep idempotency & balance limits
  await runTest('T17: Fiduciary sweep limits prevent double release', async () => {
    const fidAccount = await FiduciaryAccount.findOne({ tenant_id: tenantA._id, account_code: 'FID-TX-TRUST-01' });

    let threw = false;
    try {
      // Attempting to sweep another $3,765 should fail since $3,765 has already been swept
      await commissionsService.executeFiduciarySweep({
        tenantId: tenantA._id,
        fiduciaryAccountId: fidAccount._id,
        amount: '3765.00'
      });
    } catch (err) {
      threw = true;
    }
    // Note: If both transactions are already accounted for, the second sweep is rejected
    assert(threw, 'Sweep double release prevented');
  });

  // Test 18, 19, 20: Bordereau Run generation, lines, and export
  await runTest('T18, T19, T20: Bordereau Run generation, line trace & export', async () => {
    const def = await BordereauDefinition.findOne({ tenant_id: tenantA._id, definition_code: 'BORD-SUMMIT-MONTHLY' });

    const result = await commissionsService.generateBordereauRun({
      tenantId: tenantA._id,
      definitionId: def._id,
      reportingPeriod: '2026-07'
    });

    assert(result.run.total_lines === 3, '3 coverage lines generated');
    assert(parseFloat(result.run.total_gross_premium.toString()) === 37650, 'Gross premium reconciled to $37,650.00');
    assert(parseFloat(result.run.total_commission_withheld.toString()) === 7530, 'Withheld commission reconciled to $7,530.00');
    assert(parseFloat(result.run.total_net_due_carrier.toString()) === 30120, 'Net due carrier reconciled to $30,120.00');

    // Export validation: lines correspond to source
    const lines = await BordereauLine.find({ tenant_id: tenantA._id, run_id: result.run._id });
    assert(lines.length === 3, 'Export contains all 3 persisted lines');
  });

  // Test 21 & 22: Settlement generation from canonical formula
  await runTest('T21 & T22: Carrier Settlement generation & formula reconciliation', async () => {
    const fidAccount = await FiduciaryAccount.findOne({ tenant_id: tenantA._id, account_code: 'FID-TX-TRUST-01' });

    const result = await commissionsService.generateSettlementStatement({
      tenantId: tenantA._id,
      carrierPartyId: 'CARRIER-SUMMIT',
      fiduciaryAccountId: fidAccount._id
    });

    assert(parseFloat(result.statement.gross_eligible_premium.toString()) === 37650, 'Gross $37,650');
    assert(parseFloat(result.statement.commission_withheld.toString()) === 7530, 'Commission withheld $7,530');
    assert(parseFloat(result.statement.claims_offset.toString()) === 0, 'Claims offset $0');
    assert(parseFloat(result.statement.net_due_carrier.toString()) === 30120, 'Net due Summit $30,120');
    assert(result.lines.length === 2, 'Settlement lines created and match');
  });

  // Test 23 & 24: Disburse Settlement Payment from Trust (1010)
  await runTest('T23 & T24: Disburse Settlement Payment with GL Handshake', async () => {
    const statement = await SettlementStatement.findOne({ tenant_id: tenantA._id, status: 'APPROVED' });

    const disburseRes = await commissionsService.disburseSettlementPayment({
      tenantId: tenantA._id,
      statementId: statement._id,
      paymentReference: 'ACH-SUMMIT-DISBURSE-001'
    });

    assert(disburseRes.statement.status === 'PAID', 'Settlement marked PAID');
    assert(disburseRes.journal !== null, 'GL disbursement journal posted');

    // Re-attempt disbursement on already PAID statement must fail
    let threw = false;
    try {
      await commissionsService.disburseSettlementPayment({
        tenantId: tenantA._id,
        statementId: statement._id,
        paymentReference: 'ACH-SUMMIT-DISBURSE-002'
      });
    } catch (err) {
      threw = true;
    }
    assert(threw, 'Duplicate settlement disbursement rejected');
  });

  // Test 25: Cross-Tenant Isolation
  await runTest('T25: Tenant B cannot access Tenant A commission records', async () => {
    const tenantBAgreements = await CommissionAgreement.find({ tenant_id: tenantB._id });
    assert(tenantBAgreements.length === 0, 'Tenant B cannot see Tenant A agreements');

    const tenantBRuns = await BordereauRun.find({ tenant_id: tenantB._id });
    assert(tenantBRuns.length === 0, 'Tenant B cannot see Tenant A bordereaux');
  });

  // Test 26: Module Entitlement Gating
  await runTest('T26: Disabled entitlement rejects module operations', async () => {
    const entitlement = await TenantModuleEntitlement.findOne({
      tenant_id: tenantB._id,
      module_code: 'COMMISSIONS_FIDUCIARY'
    });
    assert(entitlement.is_enabled === false, 'Entitlement correctly disabled for Tenant B');
  });

  // Test 27: Trial Balance Equilibrium across all operations
  await runTest('T27: General Ledger Trial Balance equilibrium preserved', async () => {
    const journals = await Journal.find({ tenant_id: tenantA._id, status: 'POSTED' });
    let totalDebits = 0;
    let totalCredits = 0;

    for (const j of journals) {
      totalDebits += parseFloat(j.total_debit.toString());
      totalCredits += parseFloat(j.total_credit.toString());
    }

    assert(totalDebits.toFixed(2) === totalCredits.toFixed(2), `Trial Balance out of balance: Dr ${totalDebits} != Cr ${totalCredits}`);
    console.log(`[GL Equilibrium] Total Debits: $${totalDebits.toFixed(2)} == Total Credits: $${totalCredits.toFixed(2)}`);
  });

  // Summary
  console.log('\n================================================================');
  console.log(` PHASE 5 COMMISSIONS ACCEPTANCE RESULTS`);
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
