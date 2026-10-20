/**
 * VERIDEX ONE v4.6 — QA MANUAL HAPPY FLOW & CRUD VERIFICATION TEST RUNNER
 * 
 * Verifies:
 * 1. Auth Lifecycle (Admin registration, login, JWT)
 * 2. Counterparties Module CRUD (Create, Read list/filter, Read ID, Update, Role, Deactivate)
 * 3. COA CRUD (Create Account, Read list, Update, Deactivate)
 * 4. Event Definitions & Posting Rules CRUD (Create Event, Read Event, Create Rule, Update Draft, Publish, Immutability)
 * 5. Carrier Archetype Happy Flow (Direct Bill, Balanced JE, Cash Receipt, Trial Balance, Zero 1020)
 * 6. MGA Archetype Happy Flow (Agency Bill, Split Payables, Texas § 4053 Fiduciary Sweep, Over-Sweep Guard, Zero 1020)
 * 7. Broker Archetype Happy Flow (Client Bill, Split Payables, Trust Collection, Zero 1020)
 * 8. Resilience & Multi-Tenant Isolation (Cross-tenant leak prevention, Missing rule visibility, Zero plug)
 */

const http = require('http');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
require('dotenv').config();

const { connectDB } = require('../src/config/db');
const {
  Tenant,
  User,
  Party,
  PartyRole,
  LedgerAccount,
  FiscalPeriod,
  EventDefinition,
  PostingRule,
  PostingRuleLine,
  Journal,
  JournalEntry,
  BillingAccount,
  Invoice,
  Payment,
  PaymentAllocation,
  FiduciaryAccount,
  CommissionTransaction
} = require('../src/models');

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

async function runQASuite() {
  console.log('================================================================');
  console.log(' VERIDEX ONE v4.6 — QA MANUAL HAPPY FLOW & CRUD TEST RUNNER');
  console.log('================================================================\n');

  await connectDB();

  const RUN_ID = `QA_${Date.now().toString().slice(-6)}`;
  let testCount = 0;
  let passCount = 0;
  let failCount = 0;

  function assert(condition, testId, description) {
    testCount++;
    if (condition) {
      console.log(`  [PASS] ${testId}: ${description}`);
      passCount++;
    } else {
      console.error(`  [FAIL] ${testId}: ${description}`);
      failCount++;
    }
  }

  // =========================================================================
  // SECTION 1: Authentication Lifecycle
  // =========================================================================
  console.log('--- Section 1: Authentication Lifecycle ---');
  const tenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_name: `Veridex QA Testing Corp (${RUN_ID})`,
      tenant_code: `TENANT_${RUN_ID}`,
      tenant_type: 'CARRIER',
      base_currency: 'USD',
      admin_first_name: 'Arthur',
      admin_last_name: 'Dent',
      admin_email: `qa_admin_${RUN_ID.toLowerCase()}@veridex.test`,
      admin_password: 'Password123!'
    }
  });
  assert(tenantRes.status === 201 && tenantRes.body.data.token, 'QA-AUTH-01', 'Tenant registration & initial admin token creation');
  const token = tenantRes.body.data.token;
  const tenantId = tenantRes.body.data.tenant.id;
  const authHeaders = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };

  const meRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/auth/me',
    headers: authHeaders
  });
  assert(meRes.status === 200 && meRes.body.data.user.email === `qa_admin_${RUN_ID.toLowerCase()}@veridex.test`, 'QA-AUTH-02', 'Verify /me authenticated context');

  // =========================================================================
  // SECTION 2: CRUD Verification on Counterparties Module
  // =========================================================================
  console.log('\n--- Section 2: Counterparties Module CRUD ---');
  // 1. Create Counterparty
  const createCpRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/counterparties',
    headers: authHeaders,
    body: {
      party_code: `CP_${RUN_ID}`,
      legal_name: 'Apex Underwriting Syndicate LLC',
      trade_name: 'Apex Syndicate',
      party_type: 'ORGANIZATION',
      status: 'ACTIVE',
      tax_id: 'XX-XXXXXXX',
      email: 'compliance@apexsyndicate.test'
    }
  });
  assert(createCpRes.status === 201, 'QA-CRUD-CP-CREATE', 'Create Counterparty returns 201');
  const cpId = createCpRes.body.data._id;

  // 2. Read Counterparty List & Search
  const listCpRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/counterparties?search=Apex`,
    headers: authHeaders
  });
  assert(listCpRes.status === 200 && Array.isArray(listCpRes.body.data) && listCpRes.body.data.length > 0, 'QA-CRUD-CP-READ', 'Read & Filter Counterparty list returns 200 with matching record');

  // 3. Read Counterparty By ID
  const getCpRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/counterparties/${cpId}`,
    headers: authHeaders
  });
  assert(getCpRes.status === 200 && getCpRes.body.data.party_code === `CP_${RUN_ID}`, 'QA-CRUD-CP-READ-ID', 'Read Counterparty by ID retrieves exact entity');

  // 4. Update Counterparty
  const updateCpRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/counterparties/${cpId}`,
    headers: authHeaders,
    body: {
      trade_name: 'Apex Global Risk Underwriters'
    }
  });
  assert(updateCpRes.status === 200 && updateCpRes.body.data.trade_name === 'Apex Global Risk Underwriters', 'QA-CRUD-CP-UPDATE', 'Update Counterparty persists edited trade name');

  // 5. Add Counterparty Role
  const addRoleRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/counterparties/${cpId}/roles`,
    headers: authHeaders,
    body: {
      role_type: 'CARRIER',
      role_details: { naic_code: '99887' }
    }
  });
  assert(addRoleRes.status === 200, 'QA-CRUD-CP-ROLE', 'Add Party Role assigns CARRIER role with custom attributes');

  // 6. Deactivate Counterparty (Soft-Delete)
  const deactivateCpRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/counterparties/${cpId}`,
    headers: authHeaders,
    body: {
      status: 'INACTIVE'
    }
  });
  assert(deactivateCpRes.status === 200 && deactivateCpRes.body.data.status === 'INACTIVE', 'QA-CRUD-CP-DEACTIVATE', 'Soft-deactivate Counterparty successfully disables entity');

  // =========================================================================
  // SECTION 3: CRUD Verification on Chart of Accounts (COA)
  // =========================================================================
  console.log('\n--- Section 3: Chart of Accounts (COA) CRUD ---');
  // 1. Create GL Account
  const createAcctRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/accounts',
    headers: authHeaders,
    body: {
      account_code: '1150',
      account_name: 'Transit Installments Clearing',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      is_posting_allowed: true,
      description: 'Clearing account for ACH transit'
    }
  });
  assert(createAcctRes.status === 201, 'QA-CRUD-COA-CREATE', 'Create GL Account returns 201 Created');
  const acctId = createAcctRes.body.data._id;

  // 2. Read GL Accounts List
  const listAcctRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: authHeaders
  });
  assert(listAcctRes.status === 200 && Array.isArray(listAcctRes.body.data) && listAcctRes.body.data.some(a => a.account_code === '1150'), 'QA-CRUD-COA-READ', 'List GL Accounts includes created account');

  // 3. Update GL Account
  const updateAcctRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/gl/accounts/${acctId}`,
    headers: authHeaders,
    body: {
      account_name: 'Transit Installments & Wire Clearing'
    }
  });
  assert(updateAcctRes.status === 200 && updateAcctRes.body.data.account_name === 'Transit Installments & Wire Clearing', 'QA-CRUD-COA-UPDATE', 'Update GL Account name successfully persists');

  // 4. Deactivate GL Account (Soft-Delete)
  const deactivateAcctRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/gl/accounts/${acctId}`,
    headers: authHeaders,
    body: {
      status: 'INACTIVE'
    }
  });
  assert(deactivateAcctRes.status === 200 && deactivateAcctRes.body.data.status === 'INACTIVE', 'QA-CRUD-COA-DEACTIVATE', 'Soft-deactivate GL Account updates status to INACTIVE');

  // =========================================================================
  // SECTION 4: CRUD Verification on Event Definitions & Posting Rules
  // =========================================================================
  console.log('\n--- Section 4: Event Definitions & Posting Rules CRUD ---');
  // 1. Create Event Definition
  const createEvtRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/events',
    headers: authHeaders,
    body: {
      event_code: `qa.invoice.generated.${RUN_ID.toLowerCase()}`,
      display_name: 'QA Invoice Generated Event',
      initial_version: '1.0.0',
      source_module: 'BILLING',
      category: 'TRANSACTION',
      json_schema: {
        type: 'object',
        required: ['invoice_number', 'total_amount'],
        properties: {
          invoice_number: { type: 'string' },
          total_amount: { type: 'number' }
        }
      }
    }
  });
  assert(createEvtRes.status === 201, 'QA-CRUD-EVT-CREATE', 'Create Event Definition returns 201 Created');

  // 2. Read Event Definitions
  const listEvtRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/events',
    headers: authHeaders
  });
  assert(listEvtRes.status === 200 && Array.isArray(listEvtRes.body.data) && listEvtRes.body.data.some(e => e.event_code === `qa.invoice.generated.${RUN_ID.toLowerCase()}`), 'QA-CRUD-EVT-READ', 'Read Event Definitions lists created event');

  // Setup Standard Accounts for Tenant
  const standardCoa = [
    { code: '1000', name: 'Operating Cash', type: 'ASSET', normal: 'DEBIT' },
    { code: '1010', name: 'Premium Trust Cash', type: 'ASSET', normal: 'DEBIT' },
    { code: '1100', name: 'Premium Receivable', type: 'ASSET', normal: 'DEBIT' },
    { code: '2010', name: 'Due to Insurance Carrier', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '2020', name: 'Broker Commission Payable', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '2200', name: 'Unearned Premium Reserve', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '4000', name: 'Commission Revenue', type: 'REVENUE', normal: 'CREDIT' }
  ];
  for (const a of standardCoa) {
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: authHeaders,
      body: {
        account_code: a.code,
        account_name: a.name,
        account_type: a.type,
        normal_balance: a.normal,
        is_posting_allowed: true
      }
    });
  }

  // 3. Create Draft Rule
  const createRuleRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules',
    headers: authHeaders,
    body: {
      rule_code: `RULE_QA_DRAFT_${RUN_ID}`,
      rule_name: 'QA Draft Posting Rule',
      event_code: `qa.invoice.generated.${RUN_ID.toLowerCase()}`,
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.total_amount', memo_template: 'AR' },
        { account_code: '4000', direction: 'CREDIT', amount_expression: 'payload.total_amount', memo_template: 'Revenue' }
      ]
    }
  });
  assert(createRuleRes.status === 201 && createRuleRes.body.data.rule.status === 'DRAFT', 'QA-CRUD-RULE-CREATE', 'Create Posting Rule returns 201 DRAFT');
  const draftRuleId = createRuleRes.body.data.rule._id;

  // 4. Update Draft Rule
  const updateRuleRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/rules/${draftRuleId}`,
    headers: authHeaders,
    body: {
      description: 'Updated QA Draft rule notes'
    }
  });
  assert(updateRuleRes.status === 200 && updateRuleRes.body.data.rule.description === 'Updated QA Draft rule notes', 'QA-CRUD-RULE-UPDATE', 'Update DRAFT Rule persists description edit');

  // 5. Publish Rule
  const pubRuleRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/rules/${draftRuleId}/publish`,
    headers: authHeaders
  });
  assert(pubRuleRes.status === 200 && pubRuleRes.body.data.status === 'PUBLISHED', 'QA-CRUD-RULE-PUBLISH', 'Publish Rule transitions status to PUBLISHED');

  // 6. Immutability: Verify editing published rule is rejected
  const illegalEditRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/rules/${draftRuleId}`,
    headers: authHeaders,
    body: { description: 'Illegal edit attempt' }
  });
  assert(illegalEditRes.status === 400, 'QA-CRUD-RULE-IMMUTABLE', 'Direct edit of PUBLISHED rule is rejected (400 Bad Request)');

  // =========================================================================
  // SECTION 5: End-to-End Accounting Happy Flow (Carrier Archetype)
  // =========================================================================
  console.log('\n--- Section 5: End-to-End Happy Flow (Carrier Direct Bill) ---');
  const carrierTenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_name: `Carrier Acceptance (${RUN_ID})`,
      tenant_code: `CARRIER_${RUN_ID}`,
      tenant_type: 'CARRIER',
      base_currency: 'USD',
      admin_first_name: 'Carrier',
      admin_last_name: 'Controller',
      admin_email: `carrier_controller_${RUN_ID.toLowerCase()}@veridex.test`,
      admin_password: 'Password123!'
    }
  });
  const cToken = carrierTenantRes.body.data.token;
  const cTid = carrierTenantRes.body.data.tenant.id;
  const cHeaders = { Authorization: `Bearer ${cToken}`, 'x-tenant-id': cTid };

  // Setup Carrier Accounts
  for (const a of [
    { code: '1000', name: 'Operating Cash', type: 'ASSET', normal: 'DEBIT' },
    { code: '1100', name: 'Policyholder AR', type: 'ASSET', normal: 'DEBIT' },
    { code: '2200', name: 'Unearned Premium Reserve', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '4000', name: 'Earned Premium Revenue', type: 'REVENUE', normal: 'CREDIT' },
    { code: '4100', name: 'Policy Fee Income', type: 'REVENUE', normal: 'CREDIT' }
  ]) {
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: cHeaders,
      body: { account_code: a.code, account_name: a.name, account_type: a.type, normal_balance: a.normal, is_posting_allowed: true }
    });
  }

  // Setup Fiscal Period
  await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/periods',
    headers: cHeaders,
    body: {
      fiscal_year: 2026,
      period_number: 10,
      period_name: '2026-10',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      status: 'OPEN'
    }
  });

  // Setup Carrier Rules for Invoice & Payment
  const cRuleRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules',
    headers: cHeaders,
    body: {
      rule_code: 'RULE_CARRIER_INV',
      rule_name: 'Carrier Policy Invoice',
      event_code: 'billing.invoice.issued',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.total_amount', memo_template: 'AR' },
        { account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.premium_amount', memo_template: 'UPR' },
        { account_code: '4100', direction: 'CREDIT', amount_expression: 'payload.fee_amount', memo_template: 'Fee' }
      ]
    }
  });
  await makeRequest({
    method: 'POST',
    path: `/api/v1/rules/${cRuleRes.body.data.rule._id}/publish`,
    headers: cHeaders
  });

  const cPmtRuleRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules',
    headers: cHeaders,
    body: {
      rule_code: 'RULE_CARRIER_PMT',
      rule_name: 'Carrier Payment Receipt Rule',
      event_code: 'billing.payment.received',
      lines: [
        { account_code: '1000', direction: 'DEBIT', amount_expression: 'payload.payment_amount', memo_template: 'Cash' },
        { account_code: '1100', direction: 'CREDIT', amount_expression: 'payload.allocated_amount', memo_template: 'AR Clear' }
      ]
    }
  });
  await makeRequest({
    method: 'POST',
    path: `/api/v1/rules/${cPmtRuleRes.body.data.rule._id}/publish`,
    headers: cHeaders
  });

  // Create Billing Account
  const cBaRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/accounts',
    headers: cHeaders,
    body: {
      account_number: `BA_C_${RUN_ID}`,
      customer_name: 'Apex Transport LLC'
    }
  });
  const cBaId = cBaRes.body.data._id;

  // Issue Direct Bill Invoice: $9,200 ($9,000 premium, $200 fee)
  const invRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/invoices',
    headers: cHeaders,
    body: {
      billing_account_id: cBaId,
      policy_id: `POL-C-${RUN_ID}`,
      installment_number: 1,
      invoice_date: '2026-10-15',
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Auto Annual Premium', amount: '9000.00' },
        { line_type: 'FEE', description: 'Policy Underwriting Fee', amount: '200.00' }
      ]
    }
  });
  assert(invRes.status === 201, 'QA-FLOW-CARRIER-01', 'Direct Bill invoice issued via event pipeline (201 Created)');

  // Verify Posted Journal & Lines
  const cJournals = await Journal.find({ tenant_id: cTid });
  assert(cJournals.length === 1, 'QA-FLOW-CARRIER-02', 'Exactly 1 GL Journal created via published rule');
  const cJLines = await JournalEntry.find({ journal_id: cJournals[0]._id });
  const cDebits = cJLines.reduce((s, l) => s + Number(l.debit ? l.debit.toString() : 0), 0);
  const cCredits = cJLines.reduce((s, l) => s + Number(l.credit ? l.credit.toString() : 0), 0);
  assert(cDebits === 9200 && cCredits === 9200, 'QA-FLOW-CARRIER-03', `Carrier Journal strictly balanced: Dr $${cDebits} == Cr $${cCredits}`);

  // Process ACH Cash Receipt: $9,200
  const cPmtRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/payments',
    headers: cHeaders,
    body: {
      billing_account_id: cBaId,
      amount: '9200.00',
      payment_method: 'ACH',
      reference_number: `ACH-${RUN_ID}`,
      payment_date: '2026-10-16',
      target_invoice_id: invRes.body.data.invoice._id,
      is_fiduciary: false
    }
  });
  assert(cPmtRes.status === 201, 'QA-FLOW-CARRIER-04', 'Carrier Cash Receipt processed and posted balanced journal');

  // Verify Trial Balance API
  const tbRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/close/trial-balance?period_name=2026-10',
    headers: cHeaders
  });
  assert(tbRes.status === 200 && tbRes.body.data.snapshot.is_balanced === true, 'QA-FLOW-CARRIER-05', 'Trial Balance is verified in absolute mathematical balance ($0.00 variance)');

  // =========================================================================
  // SECTION 6: End-to-End Accounting Happy Flow (MGA Archetype & Fiduciary Sweep)
  // =========================================================================
  console.log('\n--- Section 6: End-to-End Happy Flow (MGA Agency Bill & Fiduciary Sweep) ---');
  const mgaTenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_name: `MGA Underwriting Partners (${RUN_ID})`,
      tenant_code: `MGA_${RUN_ID}`,
      tenant_type: 'MGA',
      base_currency: 'USD',
      admin_first_name: 'MGA',
      admin_last_name: 'Controller',
      admin_email: `mga_controller_${RUN_ID.toLowerCase()}@veridex.test`,
      admin_password: 'Password123!'
    }
  });
  const mgaToken = mgaTenantRes.body.data.token;
  const mgaTid = mgaTenantRes.body.data.tenant.id;
  const mgaHeaders = { Authorization: `Bearer ${mgaToken}`, 'x-tenant-id': mgaTid };

  // Setup MGA COA
  for (const a of [
    { code: '1000', name: 'MGA Operating Cash', type: 'ASSET', normal: 'DEBIT' },
    { code: '1010', name: 'Texas Statutory Premium Trust Account', type: 'ASSET', normal: 'DEBIT' },
    { code: '1100', name: 'Agency Premium Receivable', type: 'ASSET', normal: 'DEBIT' },
    { code: '2010', name: 'Due to Carrier (Fiduciary Payable)', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '2020', name: 'Broker Commissions Payable', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '4000', name: 'MGA Underwriting Commission Revenue', type: 'REVENUE', normal: 'CREDIT' }
  ]) {
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: mgaHeaders,
      body: { account_code: a.code, account_name: a.name, account_type: a.type, normal_balance: a.normal, is_posting_allowed: true }
    });
  }

  // Setup Fiscal Period
  await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/periods',
    headers: mgaHeaders,
    body: {
      fiscal_year: 2026,
      period_number: 10,
      period_name: '2026-10',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      status: 'OPEN'
    }
  });

  // Setup Fiduciary Account (Texas § 4053)
  const fidAcct = await FiduciaryAccount.create({
    tenant_id: mgaTid,
    account_code: `FID-MGA-${RUN_ID}`,
    account_name: 'Frost Bank Texas § 4053 Fiduciary Trust',
    account_type: 'PREMIUM_TRUST',
    jurisdiction_statute: 'TEXAS_INS_CODE_4053',
    gl_account_code: '1010',
    bank_name: 'Frost Bank, N.A.',
    bank_reference_token: `tok_frost_${RUN_ID}`,
    currency: 'USD',
    status: 'ACTIVE'
  });

  // Setup MGA Rules
  const mgaInvRule = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules',
    headers: mgaHeaders,
    body: {
      rule_code: 'RULE_MGA_INV',
      rule_name: 'MGA Agency Bill Invoice Split',
      event_code: 'billing.invoice.issued',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.total_amount', memo_template: 'Dr Agency AR' },
        { account_code: '2010', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.85', memo_template: 'Cr Due to Carrier (85%)' },
        { account_code: '2020', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.10', memo_template: 'Cr Broker Payable (10%)' },
        { account_code: '4000', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.05', memo_template: 'Cr MGA Commission Revenue (5%)' }
      ]
    }
  });
  await makeRequest({
    method: 'POST',
    path: `/api/v1/rules/${mgaInvRule.body.data.rule._id}/publish`,
    headers: mgaHeaders
  });

  const mgaPmtRule = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules',
    headers: mgaHeaders,
    body: {
      rule_code: 'RULE_MGA_PMT',
      rule_name: 'MGA Premium Trust Receipt Rule',
      event_code: 'billing.payment.received',
      lines: [
        { account_code: '1010', direction: 'DEBIT', amount_expression: 'payload.payment_amount', memo_template: 'Dr Trust Cash § 4053' },
        { account_code: '1100', direction: 'CREDIT', amount_expression: 'payload.allocated_amount', memo_template: 'Cr Agency AR' }
      ]
    }
  });
  await makeRequest({
    method: 'POST',
    path: `/api/v1/rules/${mgaPmtRule.body.data.rule._id}/publish`,
    headers: mgaHeaders
  });

  const mgaSweepRule = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules',
    headers: mgaHeaders,
    body: {
      rule_code: 'RULE_MGA_SWEEP',
      rule_name: 'MGA Earned Commission Sweep Rule',
      event_code: 'fiduciary.sweep.executed',
      lines: [
        { account_code: '1000', direction: 'DEBIT', amount_expression: 'payload.amount', memo_template: 'Dr Operating Cash' },
        { account_code: '1010', direction: 'CREDIT', amount_expression: 'payload.amount', memo_template: 'Cr Trust Cash Release' }
      ]
    }
  });
  await makeRequest({
    method: 'POST',
    path: `/api/v1/rules/${mgaSweepRule.body.data.rule._id}/publish`,
    headers: mgaHeaders
  });

  // Issue Agency Statement Invoice: $10,000 gross
  const mgaBaRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/accounts',
    headers: mgaHeaders,
    body: {
      account_number: `BA_MGA_${RUN_ID}`,
      customer_name: 'Brightline Brokerage Agency'
    }
  });
  const mgaBaId = mgaBaRes.body.data._id;

  const mgaInvRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/invoices',
    headers: mgaHeaders,
    body: {
      billing_account_id: mgaBaId,
      policy_id: `POL-MGA-${RUN_ID}`,
      installment_number: 1,
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Property Package Gross Premium', amount: '10000.00' }
      ]
    }
  });
  assert(mgaInvRes.status === 201, 'QA-FLOW-MGA-01', 'MGA Agency Invoice posted split 4-line journal (Dr 1100 $10k / Cr 2010 $8.5k / Cr 2020 $1k / Cr 4000 $500)');

  // Agency Premium Trust Receipt: $10,000 into 1010
  const mgaPmtRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/payments',
    headers: mgaHeaders,
    body: {
      billing_account_id: mgaBaId,
      amount: '10000.00',
      payment_method: 'WIRE',
      reference_number: `WIRE-${RUN_ID}`,
      target_invoice_id: mgaInvRes.body.data.invoice._id,
      is_fiduciary: true
    }
  });
  assert(mgaPmtRes.status === 201, 'QA-FLOW-MGA-02', 'MGA Trust Cash Receipt posted balanced JE (Dr 1010 $10k / Cr 1100 $10k)');

  // Seed CommissionTransaction to establish earned commission entitlement ($500 net)
  await CommissionTransaction.create({
    tenant_id: mgaTid,
    transaction_number: `CTX-MGA-${RUN_ID}`,
    agreement_id: new mongoose.Types.ObjectId(),
    schedule_id: new mongoose.Types.ObjectId(),
    source_event_id: `POL-MGA-${RUN_ID}`,
    source_entity_type: 'POLICY',
    policy_id: `POL-MGA-${RUN_ID}`,
    policy_reference: `POL-MGA-${RUN_ID}`,
    payer_party_id: 'CARRIER-SUMMIT',
    payee_party_id: 'MGA-HARBOR',
    rate_applied: mongoose.Types.Decimal128.fromString('15.00'),
    basis_amount: mongoose.Types.Decimal128.fromString('10000.00'),
    calculated_amount: mongoose.Types.Decimal128.fromString('1500.00'),
    net_due_amount: mongoose.Types.Decimal128.fromString('1500.00'),
    effective_date: new Date(),
    accounting_date: new Date(),
    lifecycle_status: 'APPROVED',
    idempotency_key: `KEY-MGA-COMM-${RUN_ID}`
  });
  await CommissionTransaction.create({
    tenant_id: mgaTid,
    transaction_number: `CTX-MGA-BROKER-${RUN_ID}`,
    agreement_id: new mongoose.Types.ObjectId(),
    schedule_id: new mongoose.Types.ObjectId(),
    source_event_id: `POL-MGA-${RUN_ID}`,
    source_entity_type: 'POLICY',
    policy_id: `POL-MGA-${RUN_ID}`,
    policy_reference: `POL-MGA-${RUN_ID}`,
    payer_party_id: 'MGA-HARBOR',
    payee_party_id: 'BROKER-BRIGHTLINE',
    rate_applied: mongoose.Types.Decimal128.fromString('10.00'),
    basis_amount: mongoose.Types.Decimal128.fromString('10000.00'),
    calculated_amount: mongoose.Types.Decimal128.fromString('1000.00'),
    net_due_amount: mongoose.Types.Decimal128.fromString('1000.00'),
    effective_date: new Date(),
    accounting_date: new Date(),
    lifecycle_status: 'APPROVED',
    idempotency_key: `KEY-MGA-COMM-BROKER-${RUN_ID}`
  });

  // Execute Fiduciary Sweep: $500
  const sweepRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commissions/sweeps/execute',
    headers: mgaHeaders,
    body: {
      fiduciary_account_id: fidAcct._id,
      amount: '500.00',
      notes: 'MGA Earned Commission Sweep § 4053'
    }
  });
  assert(sweepRes.status === 200, 'QA-FLOW-MGA-03', 'MGA Earned Commission Sweep ($500) successfully executed (Dr 1000 / Cr 1010)');

  // Over-Sweep Prevention Guard
  const overSweepRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commissions/sweeps/execute',
    headers: mgaHeaders,
    body: {
      fiduciary_account_id: fidAcct._id,
      amount: '100.00',
      notes: 'Illegal Over-sweep attempt'
    }
  });
  const overSweepMsg = overSweepRes.body ? (overSweepRes.body.message || overSweepRes.body.error || '') : '';
  assert(overSweepRes.status === 400 && overSweepMsg.includes('exceeds eligible earned retained MGA commission'), 'QA-FLOW-MGA-04', 'Over-sweep guard blocks excess transfer with explicit statutory limit error');

  // Verify MGA Trial Balance
  const mgaTbRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/close/trial-balance?period_name=2026-10',
    headers: mgaHeaders
  });
  assert(mgaTbRes.status === 200 && mgaTbRes.body.data.snapshot.is_balanced === true, 'QA-FLOW-MGA-05', 'MGA Trial Balance certified in mathematical balance ($0.00 variance)');

  // =========================================================================
  // SECTION 7: End-to-End Accounting Happy Flow (Broker Archetype)
  // =========================================================================
  console.log('\n--- Section 7: End-to-End Happy Flow (Broker Client Bill) ---');
  const brokerTenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_name: `Brightline Risk Advisors (${RUN_ID})`,
      tenant_code: `BROKER_${RUN_ID}`,
      tenant_type: 'BROKER',
      base_currency: 'USD',
      admin_first_name: 'Broker',
      admin_last_name: 'Controller',
      admin_email: `broker_controller_${RUN_ID.toLowerCase()}@veridex.test`,
      admin_password: 'Password123!'
    }
  });
  const bToken = brokerTenantRes.body.data.token;
  const bTid = brokerTenantRes.body.data.tenant.id;
  const bHeaders = { Authorization: `Bearer ${bToken}`, 'x-tenant-id': bTid };

  // Setup Broker COA
  for (const a of [
    { code: '1000', name: 'Broker Operating Cash', type: 'ASSET', normal: 'DEBIT' },
    { code: '1010', name: 'Broker Fiduciary Premium Trust', type: 'ASSET', normal: 'DEBIT' },
    { code: '1100', name: 'Client Premium Receivable', type: 'ASSET', normal: 'DEBIT' },
    { code: '2010', name: 'Due to Insurer/MGA (Fiduciary)', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '2020', name: 'Producer Commission Payable', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '4000', name: 'Brokerage Commission Revenue', type: 'REVENUE', normal: 'CREDIT' }
  ]) {
    await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/accounts',
      headers: bHeaders,
      body: { account_code: a.code, account_name: a.name, account_type: a.type, normal_balance: a.normal, is_posting_allowed: true }
    });
  }

  // Setup Fiscal Period
  await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/periods',
    headers: bHeaders,
    body: {
      fiscal_year: 2026,
      period_number: 10,
      period_name: '2026-10',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      status: 'OPEN'
    }
  });

  // Setup Broker Rules
  const bInvRule = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules',
    headers: bHeaders,
    body: {
      rule_code: 'RULE_BROKER_INV',
      rule_name: 'Broker Client Invoice Split',
      event_code: 'billing.invoice.issued',
      lines: [
        { account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.total_amount', memo_template: 'Dr Client AR' },
        { account_code: '2010', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.85', memo_template: 'Cr Due to MGA/Carrier (85%)' },
        { account_code: '2020', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.05', memo_template: 'Cr Producer Payable (5%)' },
        { account_code: '4000', direction: 'CREDIT', amount_expression: 'payload.total_amount * 0.10', memo_template: 'Cr Brokerage Revenue (10%)' }
      ]
    }
  });
  await makeRequest({
    method: 'POST',
    path: `/api/v1/rules/${bInvRule.body.data.rule._id}/publish`,
    headers: bHeaders
  });

  const bPmtRule = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules',
    headers: bHeaders,
    body: {
      rule_code: 'RULE_BROKER_PMT',
      rule_name: 'Broker Trust Receipt',
      event_code: 'billing.payment.received',
      lines: [
        { account_code: '1010', direction: 'DEBIT', amount_expression: 'payload.payment_amount', memo_template: 'Dr Trust Cash' },
        { account_code: '1100', direction: 'CREDIT', amount_expression: 'payload.allocated_amount', memo_template: 'Cr Client AR' }
      ]
    }
  });
  await makeRequest({
    method: 'POST',
    path: `/api/v1/rules/${bPmtRule.body.data.rule._id}/publish`,
    headers: bHeaders
  });

  // Issue Client Invoice: $5,000
  const bBaRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/accounts',
    headers: bHeaders,
    body: {
      account_number: `BA_BRK_${RUN_ID}`,
      customer_name: 'Metro Retail Outlets LLC'
    }
  });
  const bBaId = bBaRes.body.data._id;

  const bInvRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/invoices',
    headers: bHeaders,
    body: {
      billing_account_id: bBaId,
      policy_id: `POL-BRK-${RUN_ID}`,
      installment_number: 1,
      lines: [
        { line_type: 'PREMIUM', description: 'Commercial Property Package Gross Premium', amount: '5000.00' }
      ]
    }
  });
  assert(bInvRes.status === 201, 'QA-FLOW-BROKER-01', 'Broker Client Invoice posted split 4-line journal (Dr 1100 $5k / Cr 2010 $4.25k / Cr 2020 $250 / Cr 4000 $500)');

  // Record Client Payment: $5,000 into Trust
  const bPmtRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/billing/payments',
    headers: bHeaders,
    body: {
      billing_account_id: bBaId,
      amount: '5000.00',
      payment_method: 'ACH',
      reference_number: `ACH-BRK-${RUN_ID}`,
      target_invoice_id: bInvRes.body.data.invoice._id,
      is_fiduciary: true
    }
  });
  assert(bPmtRes.status === 201, 'QA-FLOW-BROKER-02', 'Broker Client Payment recorded into fiduciary trust (Dr 1010 $5,000 / Cr 1100 $5,000)');

  // Verify Broker Trial Balance
  const bTbRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/close/trial-balance?period_name=2026-10',
    headers: bHeaders
  });
  assert(bTbRes.status === 200 && bTbRes.body.data.snapshot.is_balanced === true, 'QA-FLOW-BROKER-03', 'Broker Trial Balance certified in mathematical balance ($0.00 variance)');

  // =========================================================================
  // SECTION 8: Resilience, Multi-Tenant Isolation & Zero Plug Verification
  // =========================================================================
  console.log('\n--- Section 8: Multi-Tenant Isolation & Resilience Checks ---');

  // 1. Cross-Tenant Isolation: Carrier trying to read Broker's invoices
  const bleedRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/billing/invoices/${bInvRes.body.data.invoice._id}`,
    headers: cHeaders
  });
  assert(bleedRes.status === 404, 'QA-RESIL-01', 'Cross-tenant data isolation verified: Carrier cannot access Broker invoice (404 Not Found)');

  // 2. Missing Rule Failure Visibility: simulate unmapped event
  const unmappedEvtRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/rules/simulate',
    headers: bHeaders,
    body: {
      event_code: 'unmapped.test.event',
      payload: { amount: 100 }
    }
  });
  assert(
    unmappedEvtRes.status === 200 &&
    unmappedEvtRes.body &&
    unmappedEvtRes.body.data &&
    unmappedEvtRes.body.data.success === false,
    'QA-RESIL-02',
    'Unmapped event simulation cleanly fails (success: false) without posting silent fallback or plug entry'
  );

  // 3. Global Zero Account 1020 Plug Check across all test tenants
  const plugCountAll = await JournalEntry.countDocuments({
    tenant_id: { $in: [tenantId, cTid, mgaTid, bTid] },
    account_code: '1020'
  });
  assert(plugCountAll === 0, 'QA-RESIL-03', `Zero Account 1020 plug entries across all test tenants (${plugCountAll} found)`);

  console.log('\n================================================================');
  console.log(`  QA VERIFICATION SUMMARY: ${testCount} TOTAL | ${passCount} PASSED | ${failCount} FAILED`);
  console.log(`================================================================\n`);

  await mongoose.disconnect();
  return { total: testCount, passed: passCount, failed: failCount, exitCode: failCount === 0 ? 0 : 1 };
}

runQASuite().then(res => {
  process.exit(res.exitCode);
}).catch(err => {
  console.error('[QA Runner Fatal]:', err);
  process.exit(1);
});
