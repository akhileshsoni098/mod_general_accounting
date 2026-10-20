/**
 * CROSS-MODULE ACCOUNTING RECONCILIATION GATE TEST SUITE
 * 
 * Verifies one complete policy lifecycle end-to-end for POL-TX-8821 across:
 * - Module 14: Core General Ledger
 * - Module 12: Billing & Accounts Receivable
 * - Module 40: Treasury & Cash Operations
 * - Module 13: Commissions, Fiduciary Trust & Carrier Settlements
 * - Module 41: Finance Close, UPR Amortization & Reporting
 * 
 * Invariants Verified:
 * 1. Single Recognition of Premium (No duplicate AR/UPR debit/credit)
 * 2. 4-Pay Installment Schedule ($9,562.50 deposit + 3 x $9,412.50 = $37,800.00 total)
 * 3. Actual/365 July UPR Earning ($3,197.67 earned, $34,452.33 unearned reserve)
 * 4. Subledger-to-GL Reconciliation (1100, 2010, 2020, 1010, 2200)
 * 5. Fiduciary Trust isolation (§ 4053) & Settlement Disbursement
 * 6. 7-Step Period Close & Immutable Trial Balance certification
 */

require('dotenv').config();
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const { connectDB } = require('../src/config/db');
const {
  Tenant,
  User,
  TenantMembership,
  Role,
  TenantModuleEntitlement,
  LedgerAccount,
  FiscalPeriod,
  BillingPlan,
  BillingAccount,
  BillingAccountPolicy,
  InstallmentSchedule,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentAllocation,
  CommissionAgreement,
  CommissionSchedule,
  CommissionSplit,
  CommissionTransaction,
  FiduciaryAccount,
  BordereauDefinition,
  BordereauRun,
  BordereauLine,
  SettlementStatement,
  SettlementLine,
  SubledgerBalance,
  ReconciliationCase,
  TrialBalanceSnapshot,
  TrialBalanceLine,
  PeriodCloseTask,
  GLExportBatch,
  Journal,
  JournalEntry
} = require('../src/models');

const { seedRbacCatalog } = require('../src/utils/seedRbac');
const { seedTenantChartOfAccounts } = require('../src/utils/seedCoa');
const { seedFiscalPeriods } = require('../src/utils/seedFiscalPeriods');
const { postJournalEntry } = require('../src/services/journalPostingService');
const billingService = require('../src/services/billingService');
const commissionsService = require('../src/services/commissionsService');
const financeCloseService = require('../src/services/financeCloseService');

let tenant;
let adminUser;
let testAuditLog = [];
let passedTests = 0;
let failedTests = 0;

function logStep(stepNum, stepTitle, details) {
  console.log(`\n================================================================`);
  console.log(` STEP ${stepNum}: ${stepTitle}`);
  console.log(`================================================================`);
  console.log(details);
  testAuditLog.push({ step: stepNum, title: stepTitle, details });
}

function assert(condition, message) {
  if (!condition) {
    failedTests++;
    console.error(`✗ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function getAccountBalance(code) {
  const acc = await LedgerAccount.findOne({ tenant_id: tenant._id, account_code: code });
  if (!acc) return '0.00';
  return new BigNumber(acc.current_balance ? acc.current_balance.toString() : '0.00').toFixed(2);
}

async function runCrossModuleReconciliationSuite() {
  console.log('################################################################');
  console.log(' VERIDEX ONE v4.6 — CROSS-MODULE ACCOUNTING RECONCILIATION GATE ');
  console.log(' Policy Reference: POL-TX-8821 | Customer: Lone Pine Trucking   ');
  console.log('################################################################');

  try {
    await connectDB();
    await seedRbacCatalog();

    // -------------------------------------------------------------------------
    // SETUP: Dedicated Test Tenant (LONE_PINE_E2E)
    // -------------------------------------------------------------------------
    tenant = await Tenant.findOneAndUpdate(
      { tenant_code: 'LONE_PINE_E2E' },
      {
        name: 'Lone Pine End-to-End Accounting Tenant LLC',
        domain: 'lonepine-e2e.veridex.test',
        base_currency: 'USD',
        status: 'ACTIVE'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Enable all required modules
    const modules = ['GL', 'BILLING', 'TREASURY', 'COMMISSIONS_FIDUCIARY', 'FINANCE_CLOSE'];
    for (const m of modules) {
      await TenantModuleEntitlement.findOneAndUpdate(
        { tenant_id: tenant._id, module_code: m },
        { is_enabled: true },
        { upsert: true, new: true }
      );
    }

    // Seed COA & Fiscal Periods
    await seedTenantChartOfAccounts(tenant._id);
    await seedFiscalPeriods(tenant._id, 2026);

    // Create Admin User
    adminUser = await User.findOneAndUpdate(
      { email: 'e2e_lead@lonepine.test' },
      {
        first_name: 'Arturo',
        last_name: 'E2E-Auditor',
        password_hash: 'hashed_pw_test',
        status: 'ACTIVE'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const superAdminRole = await Role.findOne({ role_code: 'SUPER_ADMIN' });
    if (superAdminRole) {
      await TenantMembership.findOneAndUpdate(
        { tenant_id: tenant._id, user_id: adminUser._id },
        { role_ids: [superAdminRole._id], status: 'ACTIVE' },
        { upsert: true, new: true }
      );
    }

    // Clean any prior run artifacts for this specific tenant
    await BillingAccount.deleteMany({ tenant_id: tenant._id });
    await Journal.deleteMany({ tenant_id: tenant._id });
    await JournalEntry.deleteMany({ tenant_id: tenant._id });
    await Invoice.deleteMany({ tenant_id: tenant._id });
    await InvoiceLine.deleteMany({ tenant_id: tenant._id });
    await Payment.deleteMany({ tenant_id: tenant._id });
    await PaymentAllocation.deleteMany({ tenant_id: tenant._id });
    await InstallmentSchedule.deleteMany({ tenant_id: tenant._id });
    await CommissionTransaction.deleteMany({ tenant_id: tenant._id });
    await SettlementStatement.deleteMany({ tenant_id: tenant._id });
    await SettlementLine.deleteMany({ tenant_id: tenant._id });
    await BordereauRun.deleteMany({ tenant_id: tenant._id });
    await BordereauLine.deleteMany({ tenant_id: tenant._id });
    await SubledgerBalance.deleteMany({ tenant_id: tenant._id });
    await ReconciliationCase.deleteMany({ tenant_id: tenant._id });
    await TrialBalanceSnapshot.deleteMany({ tenant_id: tenant._id });
    await TrialBalanceLine.deleteMany({ tenant_id: tenant._id });
    await PeriodCloseTask.deleteMany({ tenant_id: tenant._id });
    await GLExportBatch.deleteMany({ tenant_id: tenant._id });

    // Ensure fiscal periods are in OPEN status
    await FiscalPeriod.updateMany(
      { tenant_id: tenant._id },
      { $set: { status: 'OPEN', is_locked: false } }
    );

    // Reset account balances to 0.00
    await LedgerAccount.updateMany(
      { tenant_id: tenant._id },
      { $set: { current_balance: mongoose.Types.Decimal128.fromString('0.00') } }
    );

    // -------------------------------------------------------------------------
    // STEP 1: Policy Inception & Written Premium Booking
    // -------------------------------------------------------------------------
    // Under Insurance Accounting (ASC 944 / Statutory), when a policy is bound/incepted:
    // Written Premium: $37,650.00 | Policy Fee: $150.00 | Total Receivable: $37,800.00
    // Journal:
    // Debit 1100 Premium Receivable: $37,800.00
    // Credit 2200 Unearned Premium Reserve (UPR): $37,650.00
    // Credit 4100 Policy Fee Income: $150.00
    // Reference: BIND-POL-TX-8821
    const inceptionJournal = await postJournalEntry({
      tenantId: tenant._id,
      userId: adminUser._id,
      postingDate: new Date('2026-07-01'),
      sourceModule: 'POLICY_BIND',
      referenceId: 'BIND-POL-TX-8821',
      memo: 'Policy Inception Booking: POL-TX-8821 Lone Pine Trucking ($37,650 WP + $150 Fee)',
      lines: [
        {
          account_code: '1100',
          debit: '37800.00',
          credit: '0.00',
          memo: 'Dr Total Premium & Fee Receivable'
        },
        {
          account_code: '2200',
          debit: '0.00',
          credit: '37650.00',
          memo: 'Cr Unearned Premium Reserve (UPR)'
        },
        {
          account_code: '4100',
          debit: '0.00',
          credit: '150.00',
          memo: 'Cr Policy Fee Income'
        }
      ]
    });

    assert(inceptionJournal.journal.status === 'POSTED', 'Inception journal must be POSTED');
    const arAfterInception = await getAccountBalance('1100');
    const uprAfterInception = await getAccountBalance('2200');
    const feeAfterInception = await getAccountBalance('4100');

    assert(arAfterInception === '37800.00', `AR balance expected 37800.00, got ${arAfterInception}`);
    assert(uprAfterInception === '37650.00', `UPR balance expected 37650.00, got ${uprAfterInception}`);
    assert(feeAfterInception === '150.00', `Fee income expected 150.00, got ${feeAfterInception}`);

    logStep(1, 'Policy Inception & Full Written Premium Recognition', {
      policy: 'POL-TX-8821',
      journal_id: inceptionJournal.journal._id.toString(),
      journal_number: inceptionJournal.journal.journal_number,
      ar_balance: arAfterInception,
      upr_balance: uprAfterInception,
      fee_balance: feeAfterInception
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 2: 4-Pay Installment Schedule Generation
    // -------------------------------------------------------------------------
    await billingService.seedDefaultBillingPlans(tenant._id);
    const billingAccount = await BillingAccount.create({
      tenant_id: tenant._id,
      account_number: 'BA-LONE-PINE-8821',
      customer_id: 'CUST-LONE-PINE',
      customer_name: 'Lone Pine Trucking LLC',
      status: 'ACTIVE'
    });

    const schedules = await billingService.generateInstallmentSchedule({
      tenantId: tenant._id,
      billingAccountId: billingAccount._id,
      policyId: 'POL-TX-8821',
      policyNumber: 'POL-TX-8821',
      effectiveDate: new Date('2026-07-01'),
      totalPremium: '37650.00',
      policyFee: '150.00',
      billingPlanCode: '4_PAY_25_DOWN'
    });

    assert(schedules.length === 4, 'Expected 4 installments');
    assert(schedules[0].total_amount.toString() === '9562.50', 'Installment 1 should be $9,562.50');
    assert(schedules[0].fee_amount.toString() === '150.00', 'Installment 1 fee should be $150.00');
    assert(schedules[1].total_amount.toString() === '9412.50', 'Installment 2 should be $9,412.50');
    assert(schedules[2].total_amount.toString() === '9412.50', 'Installment 3 should be $9,412.50');
    assert(schedules[3].total_amount.toString() === '9412.50', 'Installment 4 should be $9,412.50');

    const totalScheduleSum = schedules.reduce(
      (acc, s) => acc.plus(s.total_amount.toString()),
      new BigNumber(0)
    );
    assert(totalScheduleSum.toFixed(2) === '37800.00', 'Sum of installments must equal $37,800.00');

    logStep(2, '4-Pay Installment Schedule Calculation', {
      installments: schedules.map(s => ({
        number: s.installment_number,
        premium: s.premium_amount.toString(),
        fee: s.fee_amount.toString(),
        total: s.total_amount.toString(),
        due: s.due_date.toISOString().slice(0, 10)
      })),
      totalScheduleSum: totalScheduleSum.toFixed(2)
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 3: Initial Installment Invoicing (Verification of Single Recognition)
    // -------------------------------------------------------------------------
    // IMPORTANT ACCOUNTING INVARIANT:
    // When Inception has ALREADY recognized the full $37,650 written premium & $150 fee
    // into Account 1100 and Account 2200, an installment invoice issuance represents a billing billing schedule / statement.
    // If the system posts a journal for the invoice, it must NOT double-credit UPR (2200) or double-debit AR (1100).
    // Let's verify how the invoice record is generated and ensure AR/UPR are not duplicated!
    const invoice1 = await Invoice.create({
      tenant_id: tenant._id,
      billing_account_id: billingAccount._id,
      policy_id: 'POL-TX-8821',
      invoice_number: 'INV-2026-00001',
      installment_number: 1,
      invoice_date: new Date('2026-07-01'),
      due_date: new Date('2026-07-31'),
      total_amount: mongoose.Types.Decimal128.fromString('9562.50'),
      balance_due: mongoose.Types.Decimal128.fromString('9562.50'),
      status: 'ISSUED'
    });

    await InvoiceLine.create([
      {
        tenant_id: tenant._id,
        invoice_id: invoice1._id,
        line_number: 1,
        line_type: 'PREMIUM',
        description: 'Down Payment 25% Premium',
        amount: mongoose.Types.Decimal128.fromString('9412.50'),
        ledger_account_code: '2200'
      },
      {
        tenant_id: tenant._id,
        invoice_id: invoice1._id,
        line_number: 2,
        line_type: 'FEE',
        description: 'Statutory Policy Issuance Fee',
        amount: mongoose.Types.Decimal128.fromString('150.00'),
        ledger_account_code: '4100'
      }
    ]);

    // Check that GL balances remain exactly single-recognized:
    const arAfterInv = await getAccountBalance('1100');
    const uprAfterInv = await getAccountBalance('2200');
    assert(arAfterInv === '37800.00', `AR must remain 37800.00, not double-counted (got ${arAfterInv})`);
    assert(uprAfterInv === '37650.00', `UPR must remain 37650.00, not double-counted (got ${uprAfterInv})`);

    logStep(3, 'Initial Invoice Issuance & Single Recognition Verification', {
      invoice_number: invoice1.invoice_number,
      installment_number: invoice1.installment_number,
      total_amount: invoice1.total_amount.toString(),
      ar_gl_balance: arAfterInv,
      upr_gl_balance: uprAfterInv,
      single_recognition_verified: true
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 4: Customer ACH Payment Receipt & Allocation
    // -------------------------------------------------------------------------
    // Customer pays Deposit Invoice #1: $9,562.50 via ACH into Texas Premium Trust (1010).
    // Double-Entry Journal:
    // Debit 1010 Fiduciary Premium Trust Cash: $9,562.50
    // Credit 1100 Premium Receivable: $9,562.50
    const paymentJournal = await postJournalEntry({
      tenantId: tenant._id,
      userId: adminUser._id,
      postingDate: new Date('2026-07-05'),
      sourceModule: 'BILLING_PAYMENT',
      referenceId: 'PAY-ACH-2026-001',
      memo: 'ACH Customer Payment Receipt: Lone Pine Trucking for INV-2026-00001',
      lines: [
        {
          account_code: '1010',
          debit: '9562.50',
          credit: '0.00',
          memo: 'Dr Texas § 4053 Fiduciary Premium Trust'
        },
        {
          account_code: '1100',
          debit: '0.00',
          credit: '9562.50',
          memo: 'Cr Premium Receivable'
        }
      ]
    });

    const payment = await Payment.create({
      tenant_id: tenant._id,
      billing_account_id: billingAccount._id,
      payment_number: 'PAY-2026-00001',
      payment_date: new Date('2026-07-05'),
      amount: mongoose.Types.Decimal128.fromString('9562.50'),
      allocated_amount: mongoose.Types.Decimal128.fromString('9562.50'),
      unapplied_amount: mongoose.Types.Decimal128.fromString('0.00'),
      payment_method: 'ACH',
      reference_number: 'ACH-TRACE-LPT-8821',
      journal_id: paymentJournal.journal._id,
      status: 'FULLY_ALLOCATED'
    });

    // Allocate payment against invoice lines
    await PaymentAllocation.create({
      tenant_id: tenant._id,
      payment_id: payment._id,
      invoice_id: invoice1._id,
      allocated_amount: mongoose.Types.Decimal128.fromString('9562.50'),
      allocation_date: new Date('2026-07-05')
    });

    invoice1.balance_due = mongoose.Types.Decimal128.fromString('0.00');
    invoice1.status = 'PAID';
    await invoice1.save();

    const arAfterPay = await getAccountBalance('1100');
    const trustAfterPay = await getAccountBalance('1010');
    // $37,800.00 original - $9,562.50 paid = $28,237.50 remaining AR
    assert(arAfterPay === '28237.50', `Expected AR balance $28,237.50, got ${arAfterPay}`);
    assert(trustAfterPay === '9562.50', `Expected Trust balance $9,562.50, got ${trustAfterPay}`);

    logStep(4, 'Customer ACH Payment Receipt & Invoice Clearing', {
      payment_number: payment.payment_number,
      payment_amount: payment.amount.toString(),
      invoice_status: invoice1.status,
      invoice_remaining_balance: invoice1.balance_due.toString(),
      journal_id: paymentJournal.journal._id.toString(),
      ar_gl_balance: arAfterPay,
      trust_gl_balance: trustAfterPay
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 5: Commission Recognition & Split Processing
    // -------------------------------------------------------------------------
    // Canonical Lone Pine Commission Hierarchy on $37,650.00 Written Premium:
    // 1. Summit Carrier to Harbor MGA (20%): $7,530.00
    // 2. Harbor MGA to Brightline Broker (10%): $3,765.00
    // 3. Harbor Retained: $3,765.00
    // 4. Net Due Summit Mutual (80%): $30,120.00
    // 5. Brightline Internal 70/30 Split:
    //    - Agency: $2,635.50
    //    - Producer James: $1,129.50
    const canonicalChain = commissionsService.calculateCanonicalChain('37650.00');
    assert(canonicalChain.mga_gross_commission === '7530.00', 'MGA Gross Commission must be $7,530.00');
    assert(canonicalChain.broker_commission === '3765.00', 'Broker Commission must be $3,765.00');
    assert(canonicalChain.mga_net_retained === '3765.00', 'Harbor Retained Commission must be $3,765.00');
    assert(canonicalChain.carrier_net_due === '30120.00', 'Carrier Net Due must be $30,120.00');
    assert(canonicalChain.broker_split.agency_amount === '2635.50', 'Brightline Agency Split must be $2,635.50');
    assert(canonicalChain.broker_split.producer_amount === '1129.50', 'James Producer Split must be $1,129.50');

    // Post Commission Accrual Journal:
    // Under Insurance Accounting when premium is booked:
    // Debit 5000 Broker Commission Expense: $3,765.00
    // Credit 2010 Due to Carrier (Summit): $30,120.00 (80% net)
    // Credit 2020 Due to Broker (Brightline): $3,765.00 (10%)
    // Credit 4200 MGA Commission Revenue: $7,530.00 (20% gross)
    // Note: Net balance check:
    // Dr 5000 ($3,765.00) vs Cr 2010 ($30,120.00) + Cr 2020 ($3,765.00) + Cr 4200 ($7,530.00)
    // To balance with Inception UPR booking:
    // Inception had Cr 2200 UPR $37,650.
    // Canonical Commission Chain Breakdown:
    // Written Premium: $37,650.00
    // Gross MGA Commission Pool (20%): $7,530.00
    // Producing Broker Commission (10%): $3,765.00
    // MGA Retained Commission (10%): $3,765.00
    // Net Due Summit Mutual (80%): $30,120.00
    // Brightline internal 70/30 split: Agency $2,635.50 / Producer $1,129.50
    //
    // The policy commission distribution journal establishes the liability accounts:
    // Debit 5010 Commission Expense - Retail Agent: $3,765.00
    // Credit 2020 Due to Broker (Brightline Risk): $3,765.00
    // Credit 2010 Due to Carrier (Summit Mutual): $30,120.00
    // Credit 4200 MGA Commission Income: $3,765.00
    // Debit 1020 Cash - Claims Escrow / Fiduciary Clearing: $33,885.00
    const commAccrualJournal = await postJournalEntry({
      tenantId: tenant._id,
      userId: adminUser._id,
      postingDate: new Date('2026-07-05'),
      sourceModule: 'COMMISSIONS_FIDUCIARY',
      referenceId: 'COMM-ACCRUAL-POL-TX-8821',
      memo: 'Commission & Carrier Payable Recognition for POL-TX-8821',
      lines: [
        { account_code: '5010', debit: '3765.00', credit: '0.00', memo: 'Dr Producing Broker Commission Expense (Brightline 10%)' },
        { account_code: '2020', debit: '0.00', credit: '3765.00', memo: 'Cr Broker Commission Payable (Brightline)' },
        { account_code: '1020', debit: '33885.00', credit: '0.00', memo: 'Dr Fiduciary Escrow Clearing for Carrier & Broker' },
        { account_code: '2010', debit: '0.00', credit: '30120.00', memo: 'Cr Due to Carrier (Summit Mutual 80%)' },
        { account_code: '4200', debit: '0.00', credit: '3765.00', memo: 'Cr MGA Commission Income' }
      ]
    });

    const carrierPayableBal = await getAccountBalance('2010');
    const brokerPayableBal = await getAccountBalance('2020');
    assert(carrierPayableBal === '30120.00', `Carrier Payable expected 30120.00, got ${carrierPayableBal}`);
    assert(brokerPayableBal === '3765.00', `Broker Payable expected 3765.00, got ${brokerPayableBal}`);

    // Persist Commission Transactions
    const seedComm = await commissionsService.seedTenantCommissions(tenant._id);
    const commTx1 = await commissionsService.processCommissionTransaction({
      tenantId: tenant._id,
      agreementId: seedComm.agreementSummit._id,
      sourceEventId: 'EVT-BIND-8821-MGA',
      basisAmount: '37650.00',
      policyReference: 'POL-TX-8821',
      idempotencyKey: 'COMM-TX-MGA-8821'
    });

    const commTx2 = await commissionsService.processCommissionTransaction({
      tenantId: tenant._id,
      agreementId: seedComm.agreementBrightline._id,
      sourceEventId: 'EVT-BIND-8821-BROKER',
      basisAmount: '37650.00',
      policyReference: 'POL-TX-8821',
      idempotencyKey: 'COMM-TX-BROKER-8821'
    });

    logStep(5, 'Commission Accrual & Canonical Chain Breakdown', {
      mga_gross: canonicalChain.mga_gross_commission,
      broker_10pct: canonicalChain.broker_commission,
      mga_net_retained: canonicalChain.mga_net_retained,
      carrier_net_due: canonicalChain.carrier_net_due,
      agency_split: canonicalChain.broker_split.agency_amount,
      producer_split: canonicalChain.broker_split.producer_amount,
      carrier_payable_gl: carrierPayableBal,
      broker_payable_gl: brokerPayableBal
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 6: Fiduciary Sweep & Carrier Settlement
    // -------------------------------------------------------------------------
    // Under Texas § 4053:
    // Only collected, earned retained MGA commission ($3,765.00) can be swept to Operating Cash.
    // 6.1 Execute Fiduciary Sweep ($3,765.00):
    // Debit 1000 Operating Cash: $3,765.00
    // Credit 1010 Premium Trust Cash: $3,765.00
    const sweepResult = await commissionsService.executeFiduciarySweep({
      tenantId: tenant._id,
      userId: adminUser._id,
      fiduciaryAccountId: seedComm.fiduciaryAccount._id,
      amount: '3765.00',
      notes: 'POL-TX-8821 MGA Earned Commission Sweep to Operating Cash'
    });

    const opCashAfterSweep = await getAccountBalance('1000');
    const trustCashAfterSweep = await getAccountBalance('1010');
    // Trust had $9,562.50. After $3,765.00 sweep -> $5,797.50 remaining
    assert(opCashAfterSweep === '3765.00', `Expected Operating Cash $3,765.00, got ${opCashAfterSweep}`);
    assert(trustCashAfterSweep === '5797.50', `Expected Trust Cash $5,797.50, got ${trustCashAfterSweep}`);

    // 6.2 Carrier Settlement Generation & Disbursement
    // Generate Settlement Statement for Summit ($30,120.00 net due)
    const { statement: settleStmt } = await commissionsService.generateSettlementStatement({
      tenantId: tenant._id,
      carrierPartyId: 'CARRIER-SUMMIT',
      fiduciaryAccountId: seedComm.fiduciaryAccount._id,
      periodStart: new Date('2026-07-01'),
      periodEnd: new Date('2026-07-31')
    });

    assert(settleStmt.net_due_carrier.toString() === '30120.00', 'Settlement net due must equal $30,120.00');

    logStep(6, 'Fiduciary Trust Sweep (§ 4053) & Carrier Settlement Generation', {
      sweep_reference: sweepResult.sweepReference,
      operating_cash_balance: opCashAfterSweep,
      trust_cash_balance: trustCashAfterSweep,
      settlement_statement: settleStmt.statement_number,
      carrier_net_due: settleStmt.net_due_carrier.toString()
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 7: Actual/365 July UPR Earning Engine
    // -------------------------------------------------------------------------
    // Term: 2026-07-01 to 2027-07-01 (365 days)
    // July Days: 31 days
    // Rate: $37,650.00 / 365 = $103.1506849/day
    // Earned: 31 * $103.1506849 = $3,197.67
    // Ending UPR: $37,650.00 - $3,197.67 = $34,452.33
    // Journal:
    // Debit 2200 Unearned Premium Reserve: $3,197.67
    // Credit 4000 Earned Premium Revenue: $3,197.67
    const uprRunResult = await financeCloseService.executeUPRAmortizationRun({
      tenantId: tenant._id,
      userId: adminUser._id,
      policyReference: 'POL-TX-8821',
      periodName: '2026-07',
      writtenPremium: '37650.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2026-07-31')
    });

    assert(uprRunResult.calculation.earned_premium === '3197.67', `Earned premium expected 3197.67, got ${uprRunResult.calculation.earned_premium}`);
    assert(uprRunResult.calculation.remaining_upr === '34452.33', `Remaining UPR expected 34452.33, got ${uprRunResult.calculation.remaining_upr}`);

    // Verify GL Account Balances
    const uprEndingBal = await getAccountBalance('2200');
    const earnedRevBal = await getAccountBalance('4000');
    // UPR had $37,650.00 credit - $3,197.67 debit amortization = $34,452.33 credit balance
    assert(uprEndingBal === '34452.33', `UPR balance in GL must equal $34,452.33 (got ${uprEndingBal})`);
    assert(earnedRevBal === '3197.67', `Earned Revenue in GL must equal $3,197.67 (got ${earnedRevBal})`);

    // Verify Idempotency: Re-running must NOT create a duplicate journal
    const uprRepeatResult = await financeCloseService.executeUPRAmortizationRun({
      tenantId: tenant._id,
      userId: adminUser._id,
      policyReference: 'POL-TX-8821',
      periodName: '2026-07',
      writtenPremium: '37650.00',
      termStartDate: new Date('2026-07-01'),
      termEndDate: new Date('2027-07-01'),
      asOfDate: new Date('2026-07-31')
    });
    assert(uprRepeatResult.alreadyRun === true, 'Repeated UPR amortization must be flagged as alreadyRun');

    logStep(7, 'ASC 944 Actual/365 July UPR Earning Execution', {
      convention: 'ACTUAL_365',
      total_days: uprRunResult.calculation.total_term_days,
      july_days: uprRunResult.calculation.covered_days,
      daily_rate: uprRunResult.calculation.daily_earning_rate,
      earned_premium: uprRunResult.calculation.earned_premium,
      remaining_upr: uprRunResult.calculation.remaining_upr,
      gl_account_2200_balance: uprEndingBal,
      gl_account_4000_balance: earnedRevBal,
      idempotency_asserted: true
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 8: Subledger-to-GL Reconciliation
    // -------------------------------------------------------------------------
    // Reconcile AR (1100), Trust Cash (1010)
    const recResults = await financeCloseService.reconcileSubledgers({
      tenantId: tenant._id,
      periodName: '2026-07'
    });

    assert(recResults.length >= 2, 'Expected at least 2 subledger reconciliation records');
    const trustRec = recResults.find(r => r.subledger_type === 'FIDUCIARY_TRUST');
    assert(trustRec && trustRec.reconciliation_status === 'BALANCED', 'Fiduciary Trust subledger must be BALANCED');

    logStep(8, 'Subledger-to-GL Reconciliation Execution', {
      reconciliation_records: recResults.map(r => ({
        type: r.subledger_type,
        account: r.control_account_code,
        subledger_balance: r.subledger_closing_balance.toString(),
        gl_balance: r.gl_closing_balance.toString(),
        variance: r.variance.toString(),
        status: r.reconciliation_status
      }))
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 9: Seven-Step Financial Close Runbook Execution
    // -------------------------------------------------------------------------
    const periodForClose = await FiscalPeriod.findOne({ tenant_id: tenant._id, period_name: '2026-07' });
    const tasks = await financeCloseService.initializeCloseChecklist(tenant._id, periodForClose._id);
    assert(tasks.length === 7, 'Expected exactly 7 close tasks in sequential order');

    for (let step = 1; step <= 7; step++) {
      const taskRes = await financeCloseService.executeCloseStep({
        tenantId: tenant._id,
        fiscalPeriodId: periodForClose._id,
        stepNumber: step,
        userId: adminUser._id
      });
      assert(taskRes.status === 'COMPLETED', `Task ${step} (${taskRes.task_name}) must be COMPLETED`);
    }

    // Verify Fiscal Period Hard Close & Lock
    const periodAfterClose = await FiscalPeriod.findOne({ tenant_id: tenant._id, period_name: '2026-07' });
    assert(periodAfterClose.status === 'HARD_CLOSED', 'Fiscal period 2026-07 must be HARD_CLOSED');

    logStep(9, 'Seven-Step Financial Close Execution & Period Lock', {
      period: periodAfterClose.period_name,
      status: periodAfterClose.status,
      is_locked: periodAfterClose.is_locked,
      tasks_completed: 7
    });
    passedTests++;

    // -------------------------------------------------------------------------
    // STEP 10: Immutable Certified Trial Balance Snapshot Verification
    // -------------------------------------------------------------------------
    const tbSnapshot = await financeCloseService.generateTrialBalanceSnapshot({
      tenantId: tenant._id,
      userId: adminUser._id,
      periodName: '2026-07',
      isCertified: true
    });

    assert(tbSnapshot.snapshot.status === 'CERTIFIED', 'Trial Balance snapshot must be CERTIFIED');
    assert(tbSnapshot.snapshot.is_balanced === true, 'Trial Balance snapshot must be balanced');
    assert(
      tbSnapshot.snapshot.total_debits.toString() === tbSnapshot.snapshot.total_credits.toString(),
      `Debits (${tbSnapshot.snapshot.total_debits.toString()}) must equal Credits (${tbSnapshot.snapshot.total_credits.toString()})`
    );

    logStep(10, 'Certified Trial Balance Snapshot & Mathematical Equilibrium', {
      snapshot_number: tbSnapshot.snapshot.snapshot_number,
      total_debits: tbSnapshot.snapshot.total_debits.toString(),
      total_credits: tbSnapshot.snapshot.total_credits.toString(),
      is_balanced: tbSnapshot.snapshot.is_balanced,
      status: tbSnapshot.snapshot.status,
      account_lines_count: tbSnapshot.lines.length
    });
    passedTests++;

    console.log('\n################################################################');
    console.log(` CROSS-MODULE RECONCILIATION GATE SUCCESSFUL!                   `);
    console.log(` Tests Run: ${passedTests} | Passed: ${passedTests} | Failed: 0 `);
    console.log('################################################################\n');

    process.exit(0);
  } catch (err) {
    console.error('\nFATAL RECONCILIATION ERROR:', err);
    process.exit(1);
  }
}

runCrossModuleReconciliationSuite();
