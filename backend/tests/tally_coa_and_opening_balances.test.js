process.env.PORT = '5061';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');

const { startServer } = require('../src/server');
const {
  Tenant,
  Company,
  Journal,
  JournalEntry,
  LedgerAccount,
  OpeningBalanceSetup,
  CommercialDocument,
  Party
} = require('../src/models');
const { postJournalEntry } = require('../src/services/journalPostingService');

let serverInstance = null;
const PORT = 5061;

function makeRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      'x-bypass-rate-limit': 'true',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

// Global Fixtures
const runId = Math.floor(Date.now() % 100000);
let tokenA = '';
let tenantAId = '';
let companyAId = '';
let secondaryCompanyId = '';

function makeAuthRequestA({ method = 'GET', path, companyId = companyAId, body = null }) {
  const headers = {
    Authorization: `Bearer ${tokenA}`,
    'x-tenant-id': tenantAId
  };
  if (companyId) headers['x-company-id'] = companyId;
  return makeRequest({ method, path, headers, body });
}

test.before(async () => {
  const result = await startServer(PORT);
  serverInstance = result.server;
});

test.after(async () => {
  if (serverInstance) {
    if (typeof serverInstance.closeAllConnections === 'function') {
      serverInstance.closeAllConnections();
    }
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// ==========================================
// 1. SETUP: REGISTER TENANT & VERIFY TALLY COA
// ==========================================

test('1. Setup: Register Tenant and verify standard Tally Chart of Accounts hierarchy', async () => {
  const regRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TALLY_T_${runId}`,
      tenant_name: 'Tally Accounting Enterprise',
      admin_email: `tally_admin_${runId}@tallyenterprise.com`,
      admin_password: 'Password123!@#',
      admin_first_name: 'Tally',
      admin_last_name: 'Accountant'
    }
  });

  assert.strictEqual(regRes.status, 201, `Tenant registration failed: ${JSON.stringify(regRes.body)}`);
  tokenA = regRes.body.data.token;
  tenantAId = regRes.body.data.tenant.id;

  const primaryCompany = await Company.findOne({ tenant_id: tenantAId, company_code: 'MAIN' });
  assert.ok(primaryCompany, 'Primary company MAIN provisioned');
  companyAId = primaryCompany._id.toString();

  // Fetch COA via API
  const coaRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/gl/accounts'
  });

  assert.strictEqual(coaRes.status, 200, `Fetch accounts failed: ${JSON.stringify(coaRes.body)}`);
  const accounts = coaRes.body.data;
  assert.ok(accounts.length >= 40, `Expected at least 40 standard Tally accounts/groups, got ${accounts.length}`);

  // 15 Standard Tally Primary Groups
  const primaryGroups = accounts.filter(a => a.group_type === 'PRIMARY_GROUP');
  assert.ok(primaryGroups.length >= 15, `Expected 15 primary groups, got ${primaryGroups.length}`);

  const capitalGroup = accounts.find(a => a.account_code === 'GRP-CAPITAL');
  assert.ok(capitalGroup, 'GRP-CAPITAL must exist');
  assert.strictEqual(capitalGroup.is_group, true);
  assert.strictEqual(capitalGroup.is_posting_allowed, false);

  const currAssetsGroup = accounts.find(a => a.account_code === 'GRP-CURR-ASSET');
  assert.ok(currAssetsGroup, 'GRP-CURR-ASSET must exist');
  assert.strictEqual(currAssetsGroup.is_group, true);
  assert.strictEqual(currAssetsGroup.is_posting_allowed, false);

  // 13 Standard Tally Subgroups
  const subgroups = accounts.filter(a => a.group_type === 'SUBGROUP');
  assert.ok(subgroups.length >= 13, `Expected 13 subgroups, got ${subgroups.length}`);

  const bankSubgroup = accounts.find(a => a.account_code === 'SUB-BANK-ACC');
  assert.ok(bankSubgroup, 'SUB-BANK-ACC subgroup must exist');
  assert.strictEqual(bankSubgroup.is_group, true);
  assert.strictEqual(bankSubgroup.is_posting_allowed, false);
  assert.strictEqual(bankSubgroup.parent_account_id?.account_code, 'GRP-CURR-ASSET');

  // Posting accounts
  const bankAcc = accounts.find(a => a.account_code === '1002');
  assert.ok(bankAcc, 'Account 1002 Bank Account must exist');
  assert.strictEqual(bankAcc.is_posting_allowed, true);
  assert.strictEqual(bankAcc.group_type, 'LEDGER');
  assert.strictEqual(bankAcc.parent_account_id?.account_code, 'SUB-BANK-ACC');

  // Suspense account
  const suspenseAcc = accounts.find(a => a.account_code === '9999');
  assert.ok(suspenseAcc, 'Account 9999 Opening Balance Suspense Account must exist');
  assert.strictEqual(suspenseAcc.is_posting_allowed, true);
  assert.strictEqual(suspenseAcc.parent_account_id?.account_code, 'GRP-SUSPENSE');
});

// ==========================================
// 2. QUERY FILTERS & HIERARCHY NAVIGATION
// ==========================================

test('2. Query Filters: groups_only and is_posting_allowed filters in getAccounts', async () => {
  // Query only groups
  const groupsRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/gl/accounts?groups_only=true'
  });
  assert.strictEqual(groupsRes.status, 200);
  assert.ok(groupsRes.body.data.every(a => a.is_group === true || a.is_posting_allowed === false));

  // Query only posting ledgers
  const ledgersRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/gl/accounts?is_posting_allowed=true'
  });
  assert.strictEqual(ledgersRes.status, 200);
  assert.ok(ledgersRes.body.data.every(a => a.is_posting_allowed === true && !a.is_group));
});

// ==========================================
// 3. ACCOUNT CREATION & CYCLE DETECTION
// ==========================================

test('3. Account Creation: Create subgroup, posting account, and assert cycle detection', async () => {
  const currAssets = await LedgerAccount.findOne({
    tenant_id: tenantAId,
    company_id: companyAId,
    account_code: 'GRP-CURR-ASSET'
  });

  // Create custom subgroup
  const createSubgroupRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/gl/accounts',
    body: {
      account_code: 'GRP-CUSTOM-INVEST',
      account_name: 'Short Term Liquid Investments',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      parent_account_id: currAssets._id.toString(),
      is_group: true
    }
  });

  assert.strictEqual(createSubgroupRes.status, 201);
  assert.strictEqual(createSubgroupRes.body.data.is_posting_allowed, false);
  assert.strictEqual(createSubgroupRes.body.data.group_type, 'SUBGROUP');
  const customSubgroupId = createSubgroupRes.body.data._id;

  // Create custom posting account under new subgroup
  const createAccRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/gl/accounts',
    body: {
      account_code: '1099',
      account_name: 'Axis Liquid Fund',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      parent_account_id: customSubgroupId,
      is_group: false,
      opening_balance: '15000.00',
      opening_balance_type: 'DEBIT'
    }
  });

  assert.strictEqual(createAccRes.status, 201);
  assert.strictEqual(createAccRes.body.data.is_posting_allowed, true);
  assert.strictEqual(createAccRes.body.data.group_type, 'LEDGER');
  assert.strictEqual(parseFloat(createAccRes.body.data.opening_balance), 15000);

  // Cycle detection: setting an account as its own parent is rejected
  const selfCycleRes = await makeAuthRequestA({
    method: 'PATCH',
    path: `/api/v1/gl/accounts/${customSubgroupId}`,
    body: {
      parent_account_id: customSubgroupId
    }
  });
  assert.strictEqual(selfCycleRes.status, 400);
  const selfMsg = selfCycleRes.body.error?.message || selfCycleRes.body.message || '';
  assert.ok(selfMsg.includes('cannot be its own parent'));

  // Cycle detection: setting descendant as parent is rejected
  const cyclicRes = await makeAuthRequestA({
    method: 'PATCH',
    path: `/api/v1/gl/accounts/${currAssets._id}`,
    body: {
      parent_account_id: customSubgroupId
    }
  });
  assert.strictEqual(cyclicRes.status, 400);
  const cyclicMsg = cyclicRes.body.error?.message || cyclicRes.body.message || '';
  assert.ok(cyclicMsg.includes('Cyclic parent relationship detected'));
});

// ==========================================
// 4. NON-POSTING SUMMARY GROUP ENFORCEMENT
// ==========================================

test('4. Direct Posting Enforcement: Reject direct journal postings to non-posting summary groups', async () => {
  await assert.rejects(
    async () => {
      await postJournalEntry({
        tenantId: tenantAId,
        companyId: companyAId,
        sourceModule: 'GL_MANUAL',
        memo: 'Illegal Group Posting',
        lines: [
          { account_code: 'GRP-CURR-ASSET', debit: '1000.00', credit: '0.00' },
          { account_code: '3001', debit: '0.00', credit: '1000.00' }
        ]
      });
    },
    (err) => {
      return err.message.includes('is a summary/parent header and does not allow direct postings');
    }
  );
});

// ==========================================
// 5. OPENING BALANCE WORKFLOW (BALANCED)
// ==========================================

test('5. Opening Balance Workflow: Draft setup, equilibrium validation, and atomic posting', async () => {
  const currentYear = new Date().getFullYear();

  // 1. Get draft setup
  const getDraftRes = await makeAuthRequestA({
    method: 'GET',
    path: `/api/v1/gl/opening-balances?financial_year=${currentYear}`
  });

  assert.strictEqual(getDraftRes.status, 200);
  assert.ok(getDraftRes.body.data.lines.length > 0);
  assert.strictEqual(getDraftRes.body.data.status, 'DRAFT');

  // 2. Save draft balances (Balanced: Dr = 200,000, Cr = 200,000)
  const saveDraftRes = await makeAuthRequestA({
    method: 'PUT',
    path: '/api/v1/gl/opening-balances',
    body: {
      financial_year: currentYear,
      lines: [
        { account_code: '1001', debit: '100000.00', credit: '0.00' }, // HDFC Bank Dr
        { account_code: '1002', debit: '25000.00', credit: '0.00' },  // Petty Cash Dr
        { account_code: '1101', debit: '75000.00', credit: '0.00' },  // Trade Receivables Dr
        { account_code: '3001', debit: '0.00', credit: '200000.00' }  // Capital Account Cr
      ]
    }
  });

  assert.strictEqual(saveDraftRes.status, 200);
  assert.strictEqual(saveDraftRes.body.data.status, 'READY_TO_POST');
  assert.strictEqual(parseFloat(saveDraftRes.body.data.total_debit), 200000);
  assert.strictEqual(parseFloat(saveDraftRes.body.data.total_credit), 200000);
  assert.strictEqual(parseFloat(saveDraftRes.body.data.difference), 0);

  // 3. Verify Ledger balances NOT yet affected in GL before posting
  const hdfcBefore = await LedgerAccount.findOne({ tenant_id: tenantAId, company_id: companyAId, account_code: '1001' });
  assert.strictEqual(parseFloat(hdfcBefore.current_balance || 0), 0, 'GL balance must not change on draft save');

  // 4. Post Opening Balance Journal
  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/gl/opening-balances/post',
    body: {
      financial_year: currentYear
    }
  });

  assert.strictEqual(postRes.status, 201, `Post opening balances failed: ${JSON.stringify(postRes.body)}`);
  assert.ok(postRes.body.data.journal);
  assert.strictEqual(postRes.body.data.setup.status, 'POSTED');

  const postedJournalId = postRes.body.data.journal._id;
  const postedJournal = await Journal.findById(postedJournalId);
  assert.strictEqual(postedJournal.source_module, 'OPENING_BALANCE');
  assert.strictEqual(parseFloat(postedJournal.total_debit), 200000);
  assert.strictEqual(parseFloat(postedJournal.total_credit), 200000);

  // 5. Verify General Ledger updated atomically
  const hdfcAfter = await LedgerAccount.findOne({ tenant_id: tenantAId, company_id: companyAId, account_code: '1001' });
  assert.strictEqual(parseFloat(hdfcAfter.current_balance), 100000);
  assert.strictEqual(parseFloat(hdfcAfter.opening_balance), 100000);
  assert.strictEqual(hdfcAfter.opening_balance_type, 'DEBIT');

  const capitalAfter = await LedgerAccount.findOne({ tenant_id: tenantAId, company_id: companyAId, account_code: '3001' });
  assert.strictEqual(parseFloat(capitalAfter.current_balance), 200000);
  assert.strictEqual(capitalAfter.opening_balance_type, 'CREDIT');

  // 6. Verify Trial Balance equilibrium
  const tbRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/gl/trial-balance'
  });
  assert.strictEqual(tbRes.status, 200);
  assert.strictEqual(tbRes.body.data.is_balanced, true);
  assert.strictEqual(parseFloat(tbRes.body.data.total_debits), 200000);
  assert.strictEqual(parseFloat(tbRes.body.data.total_credits), 200000);

  // 7. Verify Idempotency: re-posting returns existing posted journal
  const repostRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/gl/opening-balances/post',
    body: {
      financial_year: currentYear
    }
  });

  assert.strictEqual(repostRes.status, 200);
  assert.strictEqual(repostRes.body.data.already_posted, true);
  assert.strictEqual(repostRes.body.data.journal._id, postedJournalId.toString());

  // Verify no duplicate journals created
  const journalCount = await Journal.countDocuments({
    tenant_id: tenantAId,
    company_id: companyAId,
    source_module: 'OPENING_BALANCE'
  });
  assert.strictEqual(journalCount, 1, 'Exactly 1 opening balance journal must exist');
});

// ==========================================
// 6. SUSPENSE ACCOUNT ALLOCATION
// ==========================================

test('6. Suspense Allocation: Handle unbalanced opening balance via authorized Suspense account', async () => {
  // Create Secondary Company
  const createCompRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/companies',
    body: {
      company_code: 'SEC02',
      company_name: 'Secondary Trading Branch',
      legal_name: 'Secondary Trading Branch Pvt Ltd',
      business_profile: 'GENERAL_RETAIL',
      base_currency: 'INR',
      country_code: 'IN',
      financial_year_start_month: 4
    }
  });

  assert.strictEqual(createCompRes.status, 201);
  secondaryCompanyId = createCompRes.body.data.company?.id || createCompRes.body.data._id;

  const currentYear = new Date().getFullYear();

  // Save unbalanced draft: Dr = 150,000, Cr = 100,000 (Discrepancy = 50,000 Dr)
  const saveUnbalancedRes = await makeAuthRequestA({
    method: 'PUT',
    path: '/api/v1/gl/opening-balances',
    companyId: secondaryCompanyId,
    body: {
      financial_year: currentYear,
      lines: [
        { account_code: '1001', debit: '150000.00', credit: '0.00' }, // Dr 150k
        { account_code: '3001', debit: '0.00', credit: '100000.00' }  // Cr 100k
      ]
    }
  });

  assert.strictEqual(saveUnbalancedRes.status, 200);
  assert.strictEqual(saveUnbalancedRes.body.data.status, 'DRAFT');
  assert.strictEqual(parseFloat(saveUnbalancedRes.body.data.difference), 50000);

  // Posting without suspense MUST fail
  const postFailRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/gl/opening-balances/post',
    companyId: secondaryCompanyId,
    body: {
      financial_year: currentYear,
      allow_suspense: false
    }
  });

  assert.strictEqual(postFailRes.status, 400);
  const postFailMsg = postFailRes.body.error?.message || postFailRes.body.message || '';
  assert.ok(postFailMsg.includes('out of equilibrium'));

  // Lookup Suspense Account 9999
  const suspenseAcc = await LedgerAccount.findOne({
    tenant_id: tenantAId,
    company_id: secondaryCompanyId,
    account_code: '9999'
  });
  assert.ok(suspenseAcc, 'Suspense account 9999 must exist in secondary company');

  // Post with authorized suspense
  const postSuspenseRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/gl/opening-balances/post',
    companyId: secondaryCompanyId,
    body: {
      financial_year: currentYear,
      allow_suspense: true,
      suspense_account_id: suspenseAcc._id.toString()
    }
  });

  assert.strictEqual(postSuspenseRes.status, 201, `Post with suspense failed: ${JSON.stringify(postSuspenseRes.body)}`);
  assert.strictEqual(postSuspenseRes.body.data.setup.status, 'POSTED');

  // Verify Suspense line credited for 50,000
  const journalLines = await JournalEntry.find({
    tenant_id: tenantAId,
    company_id: secondaryCompanyId,
    journal_id: postSuspenseRes.body.data.journal._id
  });

  const suspLine = journalLines.find(l => l.account_code === '9999');
  assert.ok(suspLine, 'Suspense journal line must exist');
  assert.strictEqual(parseFloat(suspLine.credit), 50000);

  // Verify Trial balance equilibrium in Secondary Company
  const tbSecRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/gl/trial-balance',
    companyId: secondaryCompanyId
  });
  assert.strictEqual(tbSecRes.status, 200);
  assert.strictEqual(tbSecRes.body.data.is_balanced, true);
  assert.strictEqual(parseFloat(tbSecRes.body.data.total_debits), 150000);
  assert.strictEqual(parseFloat(tbSecRes.body.data.total_credits), 150000);
});

// ==========================================
// 7. INVOICE REFERENCE TRACEABILITY
// ==========================================

test('7. Invoice Reference Traceability: Manual journal referencing commercial invoice with REFERENCE_ONLY mode', async () => {
  // 1. Create a Customer Party
  const party = await Party.create({
    tenant_id: tenantAId,
    company_id: companyAId,
    party_code: `CUST_INV_${runId}`,
    legal_name: 'Acme Test Customer',
    party_type: 'ORGANIZATION'
  });

  // 2. Create a posted Commercial Document
  const doc = await CommercialDocument.create({
    tenant_id: tenantAId,
    company_id: companyAId,
    idempotency_key: `IDEMP_INV_${runId}_001`,
    document_type: 'SALES_INVOICE',
    document_number: `INV-${runId}-001`,
    document_date: new Date(),
    party_id: party._id,
    party_name: party.legal_name,
    status: 'POSTED',
    grand_total: mongoose.Types.Decimal128.fromString('11800.00'),
    balance_due: mongoose.Types.Decimal128.fromString('11800.00')
  });

  // 3. Post a manual journal referencing this invoice
  const manualJeRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/gl/journals',
    body: {
      posting_date: new Date().toISOString().slice(0, 10),
      source_module: 'GL_MANUAL',
      reference_id: doc.document_number,
      commercial_document_id: doc._id.toString(),
      reference_type: 'REFERENCE_ONLY',
      reference_document_number: doc.document_number,
      memo: `Audit reconciliation for invoice ${doc.document_number}`,
      lines: [
        { account_code: '1001', debit: '5000.00', credit: '0.00', memo: 'Security Deposit' },
        { account_code: '2101', debit: '0.00', credit: '5000.00', memo: 'Deposit Liability' }
      ]
    }
  });

  assert.strictEqual(manualJeRes.status, 201, `Manual journal post failed: ${JSON.stringify(manualJeRes.body)}`);
  const createdJe = manualJeRes.body.data.journal;

  // 4. Verify reference fields on the Journal
  const journalDoc = await Journal.findById(createdJe._id);
  assert.strictEqual(journalDoc.commercial_document_id?.toString(), doc._id.toString());
  assert.strictEqual(journalDoc.reference_type, 'REFERENCE_ONLY');
  assert.strictEqual(journalDoc.reference_document_number, doc.document_number);
  assert.strictEqual(journalDoc.reference_id, doc.document_number);

  // 5. Verify invoice's balance_due remains untouched (REFERENCE_ONLY semantics)
  const freshDoc = await CommercialDocument.findById(doc._id);
  assert.strictEqual(parseFloat(freshDoc.balance_due), 11800, 'Invoice balance_due must NOT be altered by REFERENCE_ONLY journal');
});
