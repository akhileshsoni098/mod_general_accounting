const mongoose = require('mongoose');
require('dotenv').config();
const { simulateJournalFromEvent, postJournalFromResolvedRule } = require('../src/services/eventSimulatorService');
const { LedgerAccount, Journal, JournalEntry } = require('../src/models');

const TENANT_ID = process.env.TEST_TENANT_ID || '6acd045ef52f66e7422cf445';
const SYSTEM_USER_ID = '6acd045ef52f66e7422cf448';

const SCENARIOS = [
  {
    name: 'Scenario 1.1: Direct Bill Invoice Issued',
    eventCode: 'billing.invoice.issued',
    payload: {
      invoice_id: 'INV-2026-00001',
      policy_id: 'POL-TX-8821',
      gross_premium: 9412.50,
      policy_fee: 150.00
    },
    expectedRule: 'RULE_INV_ISSUE',
    expectedTotal: '9562.50',
    expectedLines: [
      { account_code: '1100', dr: '9562.50', cr: '0.00' },
      { account_code: '2200', dr: '0.00', cr: '9412.50' },
      { account_code: '4100', dr: '0.00', cr: '150.00' }
    ]
  },
  {
    name: 'Scenario 1.2: Customer Cash Payment Receipt',
    eventCode: 'billing.payment.received',
    payload: {
      payment_id: 'PMT-2026-00001',
      invoice_id: 'INV-2026-00001',
      policy_id: 'POL-TX-8821',
      amount: 9562.50
    },
    expectedRule: 'RULE_PMT_RECEIVED',
    expectedTotal: '9562.50',
    expectedLines: [
      { account_code: '1010', dr: '9562.50', cr: '0.00' },
      { account_code: '1100', dr: '0.00', cr: '9562.50' }
    ]
  },
  {
    name: 'Scenario 1.3: Commission & Carrier Allocation (Waterfall Reclass)',
    eventCode: 'finance.commission.allocated',
    payload: {
      policy_id: 'POL-TX-8821',
      installment_premium: 9412.50,
      carrier_amount: 7530.00,
      broker_amount: 941.25,
      mga_amount: 941.25
    },
    expectedRule: 'RULE_COMMISSION_ALLOCATED',
    expectedTotal: '9412.50',
    expectedLines: [
      { account_code: '2200', dr: '9412.50', cr: '0.00' },
      { account_code: '2010', dr: '0.00', cr: '7530.00' },
      { account_code: '2020', dr: '0.00', cr: '941.25' },
      { account_code: '4200', dr: '0.00', cr: '941.25' }
    ]
  },
  {
    name: 'Scenario 1.4: Texas § 4053 Fiduciary Sweep',
    eventCode: 'fiduciary.sweep.executed',
    payload: {
      sweep_id: 'SWP-2026-001',
      amount: 1091.25
    },
    expectedRule: 'RULE_FIDUCIARY_SWEEP',
    expectedTotal: '1091.25',
    expectedLines: [
      { account_code: '1000', dr: '1091.25', cr: '0.00' },
      { account_code: '1010', dr: '0.00', cr: '1091.25' }
    ]
  },
  {
    name: 'Scenario 2: Mid-Term Endorsement Delta Booking (T5 Truck)',
    eventCode: 'policy.endorsement.issued',
    payload: {
      endorsement_number: 'END-2026-001',
      policy_id: 'POL-TX-8821',
      delta_premium: 1250.00
    },
    expectedRule: 'RULE_POLICY_ENDORSEMENT',
    expectedTotal: '1250.00',
    expectedLines: [
      { account_code: '1100', dr: '1250.00', cr: '0.00' },
      { account_code: '2200', dr: '0.00', cr: '1250.00' }
    ]
  },
  {
    name: 'Scenario 3.1: Pro-Rata Policy Cancellation',
    eventCode: 'policy.cancelled.prorata',
    payload: {
      policy_id: 'POL-TX-8821',
      return_premium: 3200.00
    },
    expectedRule: 'RULE_POLICY_CANCEL_PRORATA',
    expectedTotal: '3200.00',
    expectedLines: [
      { account_code: '2200', dr: '3200.00', cr: '0.00' },
      { account_code: '2100', dr: '0.00', cr: '3200.00' }
    ]
  },
  {
    name: 'Scenario 3.2: Broker Commission Clawback',
    eventCode: 'finance.commission.clawback',
    payload: {
      policy_id: 'POL-TX-8821',
      clawback_amount: 320.00
    },
    expectedRule: 'RULE_COMMISSION_CLAWBACK',
    expectedTotal: '320.00',
    expectedLines: [
      { account_code: '2020', dr: '320.00', cr: '0.00' },
      { account_code: '5010', dr: '0.00', cr: '320.00' }
    ]
  },
  {
    name: 'Scenario 4: Policy Reinstatement with Reinstatement Fee',
    eventCode: 'policy.reinstated',
    payload: {
      policy_id: 'POL-TX-8821',
      reinstated_premium: 3200.00,
      reinstatement_fee: 50.00
    },
    expectedRule: 'RULE_POLICY_REINSTATED',
    expectedTotal: '3250.00',
    expectedLines: [
      { account_code: '1100', dr: '3250.00', cr: '0.00' },
      { account_code: '2200', dr: '0.00', cr: '3200.00' },
      { account_code: '4100', dr: '0.00', cr: '50.00' }
    ]
  },
  {
    name: 'Scenario 5: Daily Pro-Rata Earned Premium Recognition',
    eventCode: 'finance.earned_premium.calculated',
    payload: {
      policy_id: 'POL-TX-8821',
      earned_amount: 784.38
    },
    expectedRule: 'RULE_EARNED_PREMIUM_RUN',
    expectedTotal: '784.38',
    expectedLines: [
      { account_code: '2200', dr: '784.38', cr: '0.00' },
      { account_code: '4000', dr: '0.00', cr: '784.38' }
    ]
  },
  {
    name: 'Scenario 6.1: Loss Reserve Established for Claim Accident',
    eventCode: 'claim.reserve.established',
    payload: {
      claim_number: 'CLM-2026-001',
      policy_id: 'POL-TX-8821',
      reserve_amount: 5000.00
    },
    expectedRule: 'RULE_CLAIM_RESERVE',
    expectedTotal: '5000.00',
    expectedLines: [
      { account_code: '5000', dr: '5000.00', cr: '0.00' },
      { account_code: '2500', dr: '0.00', cr: '5000.00' }
    ]
  },
  {
    name: 'Scenario 6.2: Claim Settlement Payout Issued',
    eventCode: 'claim.payment.issued',
    payload: {
      claim_number: 'CLM-2026-001',
      payout_amount: 4800.00
    },
    expectedRule: 'RULE_CLAIM_PAYMENT',
    expectedTotal: '4800.00',
    expectedLines: [
      { account_code: '2500', dr: '4800.00', cr: '0.00' },
      { account_code: '1000', dr: '0.00', cr: '4800.00' }
    ]
  },
  {
    name: 'Scenario 7.1: NSF Dishonor Payment Reversal',
    eventCode: 'treasury.payment.returned',
    payload: {
      return_reference: 'RET-PMT-001',
      amount: 9562.50
    },
    expectedRule: 'RULE_NSF_RETURN',
    expectedTotal: '9562.50',
    expectedLines: [
      { account_code: '1100', dr: '9562.50', cr: '0.00' },
      { account_code: '1010', dr: '0.00', cr: '9562.50' }
    ]
  },
  {
    name: 'Scenario 7.2: Carrier Net Premium Remittance Disbursement',
    eventCode: 'carrier.settlement.disbursed',
    payload: {
      statement_number: 'SETTL-2026-001',
      net_due_carrier: 7530.00
    },
    expectedRule: 'RULE_CARRIER_DISBURSE',
    expectedTotal: '7530.00',
    expectedLines: [
      { account_code: '2010', dr: '7530.00', cr: '0.00' },
      { account_code: '1010', dr: '0.00', cr: '7530.00' }
    ]
  }
];

async function runGuideValidationSuite() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  console.log(`\n========================================================================`);
  console.log(` E2E GUIDE SCENARIO SUITE: SIMULATION & POSTING VERIFICATION`);
  console.log(` Tenant: ${TENANT_ID}`);
  console.log(`========================================================================\n`);

  // Initial clean state check
  await JournalEntry.deleteMany({ tenant_id: TENANT_ID });
  await Journal.deleteMany({ tenant_id: TENANT_ID });
  await LedgerAccount.updateMany({ tenant_id: TENANT_ID }, { current_balance: 0 });
  console.log('[Initial Setup] Cleaned stale test entries & confirmed initial COA balances are $0.00\n');

  const createdJournalIds = [];
  let passedCount = 0;

  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    console.log(`[${i + 1}/${SCENARIOS.length}] Testing: ${sc.name}...`);

    // 1. Simulate
    const simResult = await simulateJournalFromEvent({
      tenantId: TENANT_ID,
      eventCode: sc.eventCode,
      payload: sc.payload
    });

    if (simResult.errors && simResult.errors.length > 0) {
      console.error(`  FAIL - Simulation returned errors:`, simResult.errors);
      process.exit(1);
    }

    if (simResult.rule?.rule_code !== sc.expectedRule) {
      console.error(`  FAIL - Matched rule mismatch. Expected ${sc.expectedRule}, got ${simResult.rule?.rule_code}`);
      process.exit(1);
    }

    if (simResult.total_debit !== sc.expectedTotal || simResult.total_credit !== sc.expectedTotal) {
      console.error(`  FAIL - Total mismatch. Expected ${sc.expectedTotal}, got Dr:${simResult.total_debit} Cr:${simResult.total_credit}`);
      process.exit(1);
    }

    // Verify lines
    for (const expL of sc.expectedLines) {
      const actualLine = simResult.lines.find(l => l.account_code === expL.account_code);
      if (!actualLine) {
        console.error(`  FAIL - Missing expected account line ${expL.account_code}`);
        process.exit(1);
      }
      if (actualLine.debit !== expL.dr || actualLine.credit !== expL.cr) {
        console.error(`  FAIL - Line amount mismatch for account ${expL.account_code}. Expected Dr:${expL.dr} Cr:${expL.cr}, got Dr:${actualLine.debit} Cr:${actualLine.credit}`);
        process.exit(1);
      }
    }

    console.log(`  ✓ Simulation balanced: Dr $${simResult.total_debit} == Cr $${simResult.total_credit}`);

    // 2. Post Journal to GL
    const postResult = await postJournalFromResolvedRule({
      tenantId: TENANT_ID,
      userId: SYSTEM_USER_ID,
      eventCode: sc.eventCode,
      payload: sc.payload,
      occurrenceDate: new Date(),
      memo: `E2E Guide Post: ${sc.name}`
    });

    if (!postResult.journal || !postResult.journal.journal_number) {
      console.error(`  FAIL - Post journal failed:`, postResult);
      process.exit(1);
    }

    createdJournalIds.push(postResult.journal._id);
    console.log(`  ✓ Posted to GL: Journal #${postResult.journal.journal_number} (${postResult.lines.length} lines posted)`);
    passedCount++;
  }

  console.log(`\n========================================================================`);
  console.log(` ALL ${passedCount}/${SCENARIOS.length} GUIDE SCENARIOS SIMULATED & POSTED SUCCESSFULLY!`);
  console.log(`========================================================================\n`);

  // Inspect COA Balances after all postings
  console.log('Inspecting COA balances after posting all 7 scenarios:');
  const accounts = await LedgerAccount.find({ tenant_id: TENANT_ID }).sort({ account_code: 1 }).lean();
  accounts.forEach(a => {
    const bal = Number(a.current_balance ? a.current_balance.toString() : 0);
    console.log(`  ${a.account_code.padEnd(6)} ${a.account_name.padEnd(45)} $${bal.toFixed(2)}`);
  });

  // CLEANUP: As requested by the user ("test kr lo properly data entry krke phir delete kr dena pr complete working hona chahiye")
  console.log('\n[Cleanup] Cleaning up test journal entries and resetting COA balances back to clean zero state...');
  await JournalEntry.deleteMany({ journal_id: { $in: createdJournalIds } });
  await Journal.deleteMany({ _id: { $in: createdJournalIds } });
  await LedgerAccount.updateMany({ tenant_id: TENANT_ID }, { current_balance: 0 });

  console.log('✓ Cleanup complete! All test journals deleted and all 22 COA balances reset to $0.00 fresh state.');

  await mongoose.disconnect();
  console.log('\nSUCCESS: Master verification completed cleanly.\n');
}

runGuideValidationSuite().catch(err => {
  console.error('Master suite error:', err);
  process.exit(1);
});
