process.env.PORT = '5062';
process.env.NODE_ENV = 'test';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');

const { connectDB } = require('../src/config/db');
const {
  Tenant,
  Company,
  LedgerAccount,
  FiscalPeriod,
  Party,
  PartyRole,
  PostingRule,
  PostingRuleLine,
  EventDefinition,
  Journal,
  JournalEntry
} = require('../src/models');

const { evaluateFormula, parseFormula } = require('../src/services/formulaEngine');
const { resolvePublishedPostingRule } = require('../src/services/postingRuleResolver');
const { simulateJournalFromEvent, postJournalFromResolvedRule } = require('../src/services/eventSimulatorService');
const { computeTrialBalance, postJournalEntry } = require('../src/services/journalPostingService');
const { generateFinancialReports } = require('../src/services/financeCloseService');
const commissionsService = require('../src/services/commissionsService');
const { seedCompanyChartOfAccounts } = require('../src/utils/seedCoa');
const { seedCompanyFiscalPeriods } = require('../src/utils/seedFiscalPeriods');
const { seedDefaultCommercialRules } = require('../src/utils/seedCommercialRules');
const commissionsController = require('../src/controllers/commissionsController');

const TEST_ID = `fran_${Date.now()}`;
let tenantA, tenantB;
let companyA, companyB;
let hubParty;

test.before(async () => {
  await connectDB();

  // 1. Create Tenant A & Tenant B
  tenantA = await Tenant.create({
    tenant_code: `TEN_${TEST_ID}_A`,
    name: 'Franchise Global Network LLC',
    domain: `franchise-${TEST_ID}.test`,
    tenant_type: 'OTHER',
    status: 'ACTIVE'
  });

  tenantB = await Tenant.create({
    tenant_code: `TEN_${TEST_ID}_B`,
    name: 'Isolated Independent Tenant LLC',
    domain: `isolated-${TEST_ID}.test`,
    tenant_type: 'OTHER',
    status: 'ACTIVE'
  });

  // 2. Create Company A (Franchise Branch) and Company B (Isolated Branch) under Tenant A
  companyA = await Company.create({
    tenant_id: tenantA._id,
    company_code: 'FRAN01',
    company_name: 'Metro Center Franchise Branch',
    base_currency: 'INR',
    status: 'ACTIVE'
  });

  companyB = await Company.create({
    tenant_id: tenantA._id,
    company_code: 'FRAN02',
    company_name: 'Uptown Franchise Branch',
    base_currency: 'INR',
    status: 'ACTIVE'
  });

  // 3. Seed Chart of Accounts & Fiscal Periods for Company A
  await seedCompanyChartOfAccounts(tenantA._id, companyA._id, { currency: 'INR' });
  await seedCompanyFiscalPeriods(tenantA._id, companyA._id, 2026);

  // 4. Seed Chart of Accounts for Company B
  await seedCompanyChartOfAccounts(tenantA._id, companyB._id, { currency: 'INR' });
  await seedCompanyFiscalPeriods(tenantA._id, companyB._id, 2026);

  // 5. Create Main Hub Counterparty and PartyRole
  hubParty = await Party.create({
    tenant_id: tenantA._id,
    company_id: companyA._id,
    party_code: 'HUB-MAIN-CENTRAL',
    legal_name: 'Veridex Central Hub Franchisor Private Limited',
    trade_name: 'Veridex Central Hub',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCV1234F1Z5',
    status: 'ACTIVE'
  });

  await PartyRole.create({
    tenant_id: tenantA._id,
    party_id: hubParty._id,
    role_type: 'MAIN_HUB',
    status: 'ACTIVE',
    role_details: {
      franchisor_license: 'HUB-IND-2026',
      revenue_split_pct: 30.0
    }
  });

  // 6. Ensure EventDefinition for franchise.commission.calculated exists
  await EventDefinition.create({
    tenant_id: tenantA._id,
    event_code: 'franchise.commission.calculated',
    display_name: 'Franchise Commission Calculated',
    source_module: 'COMMERCIAL',
    category: 'TRANSACTION',
    status: 'ACTIVE',
    current_version: '1.0.0',
    versions: [
      {
        version: '1.0.0',
        status: 'ACTIVE',
        description: 'Franchise commission event contract',
        json_schema: {
          type: 'object',
          properties: {
            transaction_id: { type: 'string' },
            franchise_id: { type: 'string' },
            hub_party_id: { type: 'string' },
            transaction_amount: { type: 'number' },
            franchise_share_pct: { type: 'number' },
            hub_share_pct: { type: 'number' },
            franchise_amount: { type: 'number' },
            hub_amount: { type: 'number' }
          }
        }
      }
    ]
  });

  // 7. Seed standard commercial posting rules including RULE_FRANCHISE_COMMISSION_SPLIT
  await seedDefaultCommercialRules(tenantA._id, companyA._id);
});

test.after(async () => {
  // Clean up test documents created for this test run
  if (tenantA) {
    await Journal.deleteMany({ tenant_id: tenantA._id });
    await JournalEntry.deleteMany({ tenant_id: tenantA._id });
    await LedgerAccount.deleteMany({ tenant_id: tenantA._id });
    await FiscalPeriod.deleteMany({ tenant_id: tenantA._id });
    await PostingRule.deleteMany({ tenant_id: tenantA._id });
    await PostingRuleLine.deleteMany({ tenant_id: tenantA._id });
    await EventDefinition.deleteMany({ tenant_id: tenantA._id });
    await Party.deleteMany({ tenant_id: tenantA._id });
    await PartyRole.deleteMany({ tenant_id: tenantA._id });
    await Company.deleteMany({ tenant_id: tenantA._id });
    await Tenant.deleteOne({ _id: tenantA._id });
  }
  if (tenantB) {
    await Tenant.deleteOne({ _id: tenantB._id });
  }

  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// =========================================================================
// TEST SUITE: FRANCHISE COMMISSION ACCOUNTING SCENARIO (₹200 / 70% / 30%)
// =========================================================================

test('1. Domain Service: Franchise commission split arithmetic (₹200 = ₹140 Franchise + ₹60 Main Hub)', async () => {
  const result = commissionsService.calculateFranchiseCommission({
    transactionAmount: 200,
    franchiseSplitPct: 70,
    hubSplitPct: 30
  });

  assert.strictEqual(result.transaction_amount, '200.00', 'Total transaction amount must be 200.00');
  assert.strictEqual(result.franchise_share_pct, '70.00', 'Franchise share pct must be 70.00');
  assert.strictEqual(result.hub_share_pct, '30.00', 'Hub share pct must be 30.00');
  assert.strictEqual(result.franchise_amount, '140.00', 'Franchise share must be exactly ₹140.00');
  assert.strictEqual(result.hub_amount, '60.00', 'Main Hub share must be exactly ₹60.00');
  assert.strictEqual(result.total_split, '200.00', 'Total split sum must equal 200.00');
  assert.strictEqual(result.is_split_balanced, true, 'Split must be mathematically balanced');

  // Assert rejection if splits don't equal 100%
  assert.throws(() => {
    commissionsService.calculateFranchiseCommission({
      transactionAmount: 200,
      franchiseSplitPct: 60,
      hubSplitPct: 30
    });
  }, /Split percentages must total 100%/);
});

test('2. Formula Engine: Decimal evaluation of percentage formulas without hardcoding account names', async () => {
  const payload = {
    transaction_amount: 200,
    franchise_share_pct: 70,
    hub_share_pct: 30
  };

  // Franchise 70% direct expression
  const fShare = evaluateFormula('payload.transaction_amount * 0.70', { payload });
  assert.strictEqual(fShare, '140.00', 'payload.transaction_amount * 0.70 must evaluate to 140.00');

  // Hub 30% direct expression
  const hShare = evaluateFormula('payload.transaction_amount * 0.30', { payload });
  assert.strictEqual(hShare, '60.00', 'payload.transaction_amount * 0.30 must evaluate to 60.00');

  // Dynamic percentage division
  const fShareDyn = evaluateFormula('payload.transaction_amount * (payload.franchise_share_pct / 100)', { payload });
  assert.strictEqual(fShareDyn, '140.00', 'Dynamic formula payload.transaction_amount * (70/100) must equal 140.00');

  const hShareDyn = evaluateFormula('payload.transaction_amount * (payload.hub_share_pct / 100)', { payload });
  assert.strictEqual(hShareDyn, '60.00', 'Dynamic formula payload.transaction_amount * (30/100) must equal 60.00');

  // Formula engine injection rejection
  assert.throws(() => {
    parseFormula('process.exit(1)');
  }, /Forbidden identifier/);

  // Divide-by-zero rejection
  assert.throws(() => {
    evaluateFormula('payload.transaction_amount / 0', { payload });
  }, /Division by zero/);
});

test('3. Configurable JE Rule: RULE_FRANCHISE_COMMISSION_SPLIT resolution & validation', async () => {
  const rule = await PostingRule.findOne({
    tenant_id: tenantA._id,
    company_id: companyA._id,
    rule_code: 'RULE_FRANCHISE_COMMISSION_SPLIT'
  });

  assert.ok(rule, 'RULE_FRANCHISE_COMMISSION_SPLIT rule must exist for Company A');
  assert.strictEqual(rule.status, 'PUBLISHED', 'Rule must be in PUBLISHED status');
  assert.strictEqual(rule.event_code, 'franchise.commission.calculated');

  const lines = await PostingRuleLine.find({ posting_rule_id: rule._id }).sort({ line_number: 1 });
  assert.strictEqual(lines.length, 3, 'Rule must have 3 posting lines');

  // Line 1: Debit 1010 Clearing / Settlement Cash ₹200.00
  assert.strictEqual(lines[0].line_number, 1);
  assert.strictEqual(lines[0].direction, 'DEBIT');
  assert.strictEqual(lines[0].account_code, '1010');

  // Line 2: Credit 4200 Franchise Commission Revenue ₹140.00
  assert.strictEqual(lines[1].line_number, 2);
  assert.strictEqual(lines[1].direction, 'CREDIT');
  assert.strictEqual(lines[1].account_code, '4200');

  // Line 3: Credit 2020 Due to Main Hub / Commission Payable ₹60.00
  assert.strictEqual(lines[2].line_number, 3);
  assert.strictEqual(lines[2].direction, 'CREDIT');
  assert.strictEqual(lines[2].account_code, '2020');

  // Verify resolution via postingRuleResolver
  const resolved = await resolvePublishedPostingRule({
    tenantId: tenantA._id,
    companyId: companyA._id,
    eventCode: 'franchise.commission.calculated',
    payload: { transaction_amount: 200 }
  });

  assert.strictEqual(resolved.matched, true, 'Resolver must successfully match the published rule');
  assert.strictEqual(resolved.rule.rule_code, 'RULE_FRANCHISE_COMMISSION_SPLIT');
  assert.strictEqual(resolved.lines.length, 3);
});

test('4. Simulation: Pure read-only simulation verifies exact equilibrium (Δ = 0.00) without modifying GL', async () => {
  const initialJournals = await Journal.countDocuments({ tenant_id: tenantA._id, company_id: companyA._id });

  const simResult = await simulateJournalFromEvent({
    tenantId: tenantA._id,
    companyId: companyA._id,
    eventCode: 'franchise.commission.calculated',
    payload: {
      transaction_id: `TXN_SIM_${TEST_ID}`,
      transaction_amount: 200,
      franchise_share_pct: 70,
      hub_share_pct: 30,
      franchise_amount: 140,
      hub_amount: 60,
      hub_party_id: hubParty.party_code,
      hub_party_name: hubParty.legal_name
    }
  });

  assert.strictEqual(simResult.success, true, 'Simulation must succeed');
  assert.strictEqual(simResult.balanced, true, 'Simulation must be balanced');
  assert.strictEqual(simResult.total_debit, '200.00', 'Total simulated debit must be 200.00');
  assert.strictEqual(simResult.total_credit, '200.00', 'Total simulated credit must be 200.00');
  assert.strictEqual(simResult.difference, '0.00', 'Equilibrium difference must be 0.00');

  // Verify simulation lines
  assert.strictEqual(simResult.lines.length, 3);
  assert.strictEqual(simResult.lines[0].account_code, '1010');
  assert.strictEqual(simResult.lines[0].debit, '200.00');
  assert.strictEqual(simResult.lines[1].account_code, '4200');
  assert.strictEqual(simResult.lines[1].credit, '140.00');
  assert.strictEqual(simResult.lines[2].account_code, '2020');
  assert.strictEqual(simResult.lines[2].credit, '60.00');
  assert.strictEqual(simResult.lines[2].dimensions.counterparty_id, 'HUB-MAIN-CENTRAL');
  assert.strictEqual(simResult.lines[2].dimensions.counterparty_role, 'MAIN_HUB');

  // Verify simulation created zero journals (strictly read-only)
  const afterJournals = await Journal.countDocuments({ tenant_id: tenantA._id, company_id: companyA._id });
  assert.strictEqual(afterJournals, initialJournals, 'Simulation must NOT write any Journal records');
});

test('5. Atomic Posting: Post ₹200 Franchise Commission JE and verify atomic double-entry equilibrium', async () => {
  const transactionId = `TXN_POST_${TEST_ID}`;
  const sourceRef = `franchise.commission.calculated:${transactionId}`;

  const postResult = await postJournalFromResolvedRule({
    tenantId: tenantA._id,
    companyId: companyA._id,
    userId: new mongoose.Types.ObjectId(),
    eventCode: 'franchise.commission.calculated',
    occurrenceDate: new Date('2026-07-15'),
    sourceReference: sourceRef,
    memo: 'Franchise Commission Split for Terminal Sale TXN_POST',
    currency: 'INR',
    payload: {
      transaction_id: transactionId,
      transaction_amount: 200,
      franchise_share_pct: 70,
      hub_share_pct: 30,
      franchise_amount: 140,
      hub_amount: 60,
      franchise_id: companyA.company_code,
      hub_party_id: hubParty.party_code,
      hub_party_name: hubParty.legal_name
    }
  });

  assert.ok(postResult.journal, 'Journal must be returned from posting');
  assert.strictEqual(postResult.journal.status, 'POSTED', 'Journal status must be POSTED');
  assert.strictEqual(postResult.journal.source_module, 'RULES_ENGINE');
  assert.strictEqual(postResult.journal.reference_id, sourceRef);
  assert.strictEqual(postResult.journal.total_debit.toString(), '200.00');
  assert.strictEqual(postResult.journal.total_credit.toString(), '200.00');
  assert.strictEqual(postResult.journal.currency, 'INR');

  // Verify journal entries
  const entries = await JournalEntry.find({ journal_id: postResult.journal._id }).sort({ line_number: 1 });
  assert.strictEqual(entries.length, 3, 'Must have 3 JournalEntry lines');

  // Line 1: Dr 1010 ₹200.00
  assert.strictEqual(entries[0].account_code, '1010');
  assert.strictEqual(entries[0].debit.toString(), '200.00');
  assert.strictEqual(entries[0].credit.toString(), '0.00');

  // Line 2: Cr 4200 ₹140.00
  assert.strictEqual(entries[1].account_code, '4200');
  assert.strictEqual(entries[1].debit.toString(), '0.00');
  assert.strictEqual(entries[1].credit.toString(), '140.00');

  // Line 3: Cr 2020 ₹60.00 (Due to Main Hub with counterparty dimensions)
  assert.strictEqual(entries[2].account_code, '2020');
  assert.strictEqual(entries[2].debit.toString(), '0.00');
  assert.strictEqual(entries[2].credit.toString(), '60.00');
  assert.strictEqual(entries[2].dimensions.counterparty_id, 'HUB-MAIN-CENTRAL');
  assert.strictEqual(entries[2].dimensions.counterparty_role, 'MAIN_HUB');
  assert.strictEqual(entries[2].dimensions.counterparty_name, 'Veridex Central Hub Franchisor Private Limited');
});

test('6. Idempotency: Reject duplicate event posting with identical source reference', async () => {
  const transactionId = `TXN_POST_${TEST_ID}`;
  const sourceRef = `franchise.commission.calculated:${transactionId}`;

  await assert.rejects(
    async () => {
      await postJournalFromResolvedRule({
        tenantId: tenantA._id,
        companyId: companyA._id,
        userId: new mongoose.Types.ObjectId(),
        eventCode: 'franchise.commission.calculated',
        occurrenceDate: new Date('2026-07-15'),
        sourceReference: sourceRef,
        memo: 'Duplicate attempt',
        currency: 'INR',
        payload: {
          transaction_id: transactionId,
          transaction_amount: 200,
          franchise_share_pct: 70,
          hub_share_pct: 30,
          franchise_amount: 140,
          hub_amount: 60,
          hub_party_id: hubParty.party_code
        }
      });
    },
    /Duplicate posting prevented/
  );
});

test('7. General Ledger: Account balances reflect exact updated balances', async () => {
  const acc1010 = await LedgerAccount.findOne({
    tenant_id: tenantA._id,
    company_id: companyA._id,
    account_code: '1010'
  });
  const acc4200 = await LedgerAccount.findOne({
    tenant_id: tenantA._id,
    company_id: companyA._id,
    account_code: '4200'
  });
  const acc2020 = await LedgerAccount.findOne({
    tenant_id: tenantA._id,
    company_id: companyA._id,
    account_code: '2020'
  });

  // Account 1010 (ASSET, Normal DEBIT) -> +₹200.00
  assert.strictEqual(acc1010.current_balance.toString(), '200.00', '1010 current_balance must be ₹200.00');

  // Account 4200 (REVENUE, Normal CREDIT) -> +₹140.00
  assert.strictEqual(acc4200.current_balance.toString(), '140.00', '4200 current_balance must be ₹140.00');

  // Account 2020 (LIABILITY, Normal CREDIT) -> +₹60.00
  assert.strictEqual(acc2020.current_balance.toString(), '60.00', '2020 current_balance must be ₹60.00');
});

test('8. Trial Balance: Company A Trial Balance in exact mathematical equilibrium (Δ = 0.00)', async () => {
  const tb = await computeTrialBalance(tenantA._id, null, companyA._id);

  assert.strictEqual(tb.is_balanced, true, 'Trial balance must be balanced');
  assert.strictEqual(tb.total_debits, '200.00', 'Total Period Debits must be 200.00');
  assert.strictEqual(tb.total_credits, '200.00', 'Total Period Credits must be 200.00');
  assert.strictEqual(tb.difference, '0.00', 'Debit-Credit difference must be 0.00');

  // Check specific account lines in Trial Balance
  const tb1010 = tb.accounts.find(a => a.account_code === '1010');
  assert.ok(tb1010);
  assert.strictEqual(tb1010.current_balance, '200.00');
  assert.strictEqual(tb1010.ending_debit, '200.00');

  const tb4200 = tb.accounts.find(a => a.account_code === '4200');
  assert.ok(tb4200);
  assert.strictEqual(tb4200.current_balance, '140.00');
  assert.strictEqual(tb4200.ending_credit, '140.00');

  const tb2020 = tb.accounts.find(a => a.account_code === '2020');
  assert.ok(tb2020);
  assert.strictEqual(tb2020.current_balance, '60.00');
  assert.strictEqual(tb2020.ending_credit, '60.00');
});

test('9. Financial Statements: Profit & Loss and Balance Sheet equilibrium', async () => {
  const statements = await generateFinancialReports({
    tenantId: tenantA._id,
    companyId: companyA._id
  });

  const { balanceSheet, incomeStatement } = statements;

  // --- Profit & Loss Statement (Income Statement) ---
  assert.strictEqual(incomeStatement.total_revenue, '140.00', 'Total Revenue must be ₹140.00');
  assert.strictEqual(incomeStatement.total_expenses, '0.00', 'Total Expenses must be ₹0.00');
  assert.strictEqual(incomeStatement.net_income, '140.00', 'Net Income must be ₹140.00');

  const revLine = incomeStatement.revenue.find(r => r.account_code === '4200');
  assert.ok(revLine, 'Franchise Commission Revenue 4200 must be in Income Statement');
  assert.strictEqual(revLine.balance, '140.00');

  // --- Balance Sheet ---
  assert.strictEqual(balanceSheet.total_assets, '200.00', 'Total Assets must be ₹200.00');
  assert.strictEqual(balanceSheet.total_liabilities, '60.00', 'Total Liabilities must be ₹60.00');
  assert.strictEqual(balanceSheet.current_period_net_income, '140.00', 'Current period net income in equity must be ₹140.00');
  assert.strictEqual(balanceSheet.total_liabilities_and_equity, '200.00', 'Total Liabilities + Equity must equal Total Assets (₹200.00)');
  assert.strictEqual(balanceSheet.is_balanced, true, 'Balance sheet equation Assets = Liabilities + Equity must be satisfied');

  const assetLine = balanceSheet.assets.find(a => a.account_code === '1010');
  assert.ok(assetLine, 'Settlement Cash 1010 must be in Balance Sheet');
  assert.strictEqual(assetLine.balance, '200.00');

  const liabLine = balanceSheet.liabilities.find(l => l.account_code === '2020');
  assert.ok(liabLine, 'Due to Main Hub 2020 must be in Balance Sheet');
  assert.strictEqual(liabLine.balance, '60.00');
});

test('10. Multi-Company & Tenant Isolation: Company B and Tenant B remain completely clean', async () => {
  // Company B in Tenant A must have 0 journals and 0 account balances
  const journalsCompB = await Journal.countDocuments({
    tenant_id: tenantA._id,
    company_id: companyB._id
  });
  assert.strictEqual(journalsCompB, 0, 'Company B must have 0 journals');

  const tbCompB = await computeTrialBalance(tenantA._id, null, companyB._id);
  assert.strictEqual(tbCompB.total_debits, '0.00', 'Company B debits must be 0.00');
  assert.strictEqual(tbCompB.total_credits, '0.00', 'Company B credits must be 0.00');

  const statementsB = await generateFinancialReports({
    tenantId: tenantA._id,
    companyId: companyB._id
  });
  assert.strictEqual(statementsB.incomeStatement.net_income, '0.00', 'Company B net income must be 0.00');
  assert.strictEqual(statementsB.balanceSheet.total_assets, '0.00', 'Company B total assets must be 0.00');

  // Tenant B must have 0 journals
  const journalsTenantB = await Journal.countDocuments({ tenant_id: tenantB._id });
  assert.strictEqual(journalsTenantB, 0, 'Tenant B must have 0 journals');
});

test('11. Commissions Controller: previewFranchiseSplit returns standard JSON response for ₹200 scenario', async () => {
  const req = {
    query: {
      transaction_amount: '200',
      franchise_split_pct: '70',
      hub_split_pct: '30'
    }
  };
  let responseData = null;
  const res = {
    json: (payload) => { responseData = payload; return res; },
    status: (code) => res
  };

  await commissionsController.previewFranchiseSplit(req, res);

  assert.ok(responseData, 'Response data must not be null');
  assert.strictEqual(responseData.status, 'success');
  assert.strictEqual(responseData.data.transaction_amount, '200.00');
  assert.strictEqual(responseData.data.franchise_amount, '140.00');
  assert.strictEqual(responseData.data.hub_amount, '60.00');
  assert.strictEqual(responseData.data.total_split, '200.00');
  assert.strictEqual(responseData.data.is_split_balanced, true);
});
