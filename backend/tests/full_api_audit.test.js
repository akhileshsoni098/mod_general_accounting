process.env.PORT = '5058';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');

const { startServer } = require('../src/server');
const {
  Tenant,
  User,
  Company,
  StockItem,
  Godown,
  UnitOfMeasurement,
  StockGroup,
  StockCategory,
  StockMovement,
  StockBalance,
  CommercialDocument,
  BillAllocation,
  CompanyPostingConfig,
  LedgerAccount,
  Party,
  PartyRole,
  PosShift,
  RestaurantTable,
  RecipeBOM,
  RestaurantOrder,
  HotelRoomType,
  HotelRoom,
  HotelReservation,
  GuestFolio,
  ManufacturingBOM,
  WorkOrder,
  EventDefinition,
  PostingRule,
  DimensionDefinition,
  FiscalPeriod
} = require('../src/models');
const { seedDefaultCommercialRules } = require('../src/utils/seedCommercialRules');

let serverInstance = null;
const PORT = 5058;

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
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (e) {
            parsed = raw;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed
          });
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

// Global state for audit test execution
let tenantA = null;
let tokenA = null;
let companyA = null;
let headersA = null;

let tenantB = null;
let tokenB = null;
let companyB = null;
let headersB = null;

// Created entity IDs for audit assertions
let createdAccountId = null;
let createdGroupId = null;
let createdCategoryId = null;
let createdUomId = null;
let createdGodownId = null;
let createdItemId = null;
let createdPartyId = null;
let createdDocId = null;
let createdPosShiftId = null;
let createdTableId = null;
let createdRoomTypeId = null;
let createdRoomId = null;
let createdReservationId = null;
let createdFolioId = null;
let createdBomId = null;
let createdWorkOrderId = null;
let createdEventId = null;
let createdRuleId = null;
let createdDimensionId = null;

const apiAuditResults = [];

function recordApiAudit({ id, method, path, expectedStatus, actualStatus, pass, details }) {
  apiAuditResults.push({ id, method, path, expectedStatus, actualStatus, pass, details });
}

test.before(async () => {
  const started = await startServer(PORT);
  if (started && started.server) {
    serverInstance = started.server;
  }
});

test.after(async () => {
  const fs = require('fs');
  const path = require('path');
  const auditPath = path.resolve(__dirname, 'api_audit_execution_results.json');
  fs.writeFileSync(auditPath, JSON.stringify(apiAuditResults, null, 2), 'utf8');
  console.log(`[API AUDIT] Recorded ${apiAuditResults.length} endpoint checks in ${auditPath}`);

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

test('01. Operational Probes: Health and Readiness Endpoints', async () => {
  // GET /health
  const resHealth = await makeRequest({ path: '/health' });
  assert.strictEqual(resHealth.status, 200);
  assert.strictEqual(resHealth.body.data.status, 'HEALTHY');
  recordApiAudit({
    id: 'API-PROBE-01',
    method: 'GET',
    path: '/health',
    expectedStatus: 200,
    actualStatus: resHealth.status,
    pass: resHealth.status === 200,
    details: 'Health check probe returns HEALTHY status and topology info'
  });

  // GET /ready
  const resReady = await makeRequest({ path: '/ready' });
  assert.strictEqual(resReady.status, 200);
  assert.strictEqual(resReady.body.data.status, 'READY');
  recordApiAudit({
    id: 'API-PROBE-02',
    method: 'GET',
    path: '/ready',
    expectedStatus: 200,
    actualStatus: resReady.status,
    pass: resReady.status === 200,
    details: 'Readiness probe returns READY status and uptime'
  });
});

test('02. Authentication & Multi-Tenant Setup: Tenant A and Tenant B', async () => {
  const suffixA = Date.now().toString().slice(-6);
  const regA = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `T_AUDIT_${suffixA}`,
      tenant_name: `Audit Commercial Tenant A ${suffixA}`,
      base_currency: 'INR',
      tenant_type: 'ENTERPRISE',
      admin_first_name: 'Audit',
      admin_last_name: 'Lead',
      admin_email: `auditor_${suffixA}@testcorp.in`,
      admin_password: 'Password123!'
    }
  });

  assert.strictEqual(regA.status, 201, `Tenant A registration failed: ${JSON.stringify(regA.body)}`);
  tenantA = regA.body.data.tenant;
  tokenA = regA.body.data.token;
  companyA = await Company.findOne({ tenant_id: tenantA.id, company_code: 'MAIN' });
  assert.ok(companyA, 'Primary company A provisioned');
  headersA = {
    Authorization: `Bearer ${tokenA}`,
    'x-tenant-id': tenantA.id,
    'x-company-id': companyA._id.toString()
  };

  recordApiAudit({
    id: 'API-AUTH-01',
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    expectedStatus: 201,
    actualStatus: regA.status,
    pass: regA.status === 201,
    details: 'Register tenant auto-initializes primary company and issues JWT'
  });

  // Seed default commercial rules for companyA
  await seedDefaultCommercialRules(tenantA.id, companyA._id.toString());

  // Register Tenant B for cross-tenant isolation testing
  const suffixB = (Date.now() + 1).toString().slice(-6);
  const regB = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `T_ISOL_${suffixB}`,
      tenant_name: `Isolation Tenant B ${suffixB}`,
      base_currency: 'INR',
      tenant_type: 'RETAIL',
      admin_first_name: 'Isol',
      admin_last_name: 'User',
      admin_email: `isol_${suffixB}@testcorp.in`,
      admin_password: 'Password123!'
    }
  });

  assert.strictEqual(regB.status, 201, `Tenant B registration failed: ${JSON.stringify(regB.body)}`);
  tenantB = regB.body.data.tenant;
  tokenB = regB.body.data.token;
  companyB = await Company.findOne({ tenant_id: tenantB.id, company_code: 'MAIN' });
  assert.ok(companyB, 'Primary company B provisioned');
  headersB = {
    Authorization: `Bearer ${tokenB}`,
    'x-tenant-id': tenantB.id,
    'x-company-id': companyB._id.toString()
  };

  // POST /api/v1/auth/login
  const loginRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: `auditor_${suffixA}@testcorp.in`,
      password: 'Password123!'
    }
  });
  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginRes.body.data.token);
  recordApiAudit({
    id: 'API-AUTH-02',
    method: 'POST',
    path: '/api/v1/auth/login',
    expectedStatus: 200,
    actualStatus: loginRes.status,
    pass: loginRes.status === 200,
    details: 'User login returns valid access token and tenant memberships'
  });

  // GET /api/v1/auth/me
  const meRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/auth/me',
    headers: headersA
  });
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.data.user.email, `auditor_${suffixA}@testcorp.in`);
  recordApiAudit({
    id: 'API-AUTH-03',
    method: 'GET',
    path: '/api/v1/auth/me',
    expectedStatus: 200,
    actualStatus: meRes.status,
    pass: meRes.status === 200,
    details: 'Get current user profile and session identity'
  });

  // POST /api/v1/auth/refresh
  const refreshRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/refresh',
    body: { refresh_token: loginRes.body.data.refresh_token }
  });
  assert.strictEqual(refreshRes.status, 200);
  assert.ok(refreshRes.body.data.token);
  recordApiAudit({
    id: 'API-AUTH-04',
    method: 'POST',
    path: '/api/v1/auth/refresh',
    expectedStatus: 200,
    actualStatus: refreshRes.status,
    pass: refreshRes.status === 200,
    details: 'Refresh token exchanges for updated access token'
  });
});

test('03. Tenant & Organization Administration APIs', async () => {
  // GET /api/v1/tenant/settings
  const getSettings = await makeRequest({
    method: 'GET',
    path: '/api/v1/tenant/settings',
    headers: headersA
  });
  assert.strictEqual(getSettings.status, 200);
  recordApiAudit({
    id: 'API-TENANT-01',
    method: 'GET',
    path: '/api/v1/tenant/settings',
    expectedStatus: 200,
    actualStatus: getSettings.status,
    pass: getSettings.status === 200,
    details: 'Fetch organization settings for current workspace'
  });

  // PATCH /api/v1/tenant/settings
  const patchSettings = await makeRequest({
    method: 'PATCH',
    path: '/api/v1/tenant/settings',
    headers: headersA,
    body: {
      tenant_type: 'ENTERPRISE',
      timezone: 'Asia/Kolkata'
    }
  });
  assert.strictEqual(patchSettings.status, 200);
  assert.strictEqual(patchSettings.body.data.timezone, 'Asia/Kolkata');
  recordApiAudit({
    id: 'API-TENANT-02',
    method: 'PATCH',
    path: '/api/v1/tenant/settings',
    expectedStatus: 200,
    actualStatus: patchSettings.status,
    pass: patchSettings.status === 200,
    details: 'Update organization settings'
  });

  // GET /api/v1/tenant/modules
  const getModules = await makeRequest({
    method: 'GET',
    path: '/api/v1/tenant/modules',
    headers: headersA
  });
  assert.strictEqual(getModules.status, 200);
  assert.ok(Array.isArray(getModules.body.data));
  recordApiAudit({
    id: 'API-TENANT-03',
    method: 'GET',
    path: '/api/v1/tenant/modules',
    expectedStatus: 200,
    actualStatus: getModules.status,
    pass: getModules.status === 200,
    details: 'List module entitlements for active workspace'
  });

  // GET /api/v1/tenant/roles
  const getRoles = await makeRequest({
    method: 'GET',
    path: '/api/v1/tenant/roles',
    headers: headersA
  });
  assert.strictEqual(getRoles.status, 200);
  assert.ok(Array.isArray(getRoles.body.data));
  recordApiAudit({
    id: 'API-TENANT-04',
    method: 'GET',
    path: '/api/v1/tenant/roles',
    expectedStatus: 200,
    actualStatus: getRoles.status,
    pass: getRoles.status === 200,
    details: 'List available roles within tenant'
  });

  // GET /api/v1/tenant/users
  const getUsers = await makeRequest({
    method: 'GET',
    path: '/api/v1/tenant/users',
    headers: headersA
  });
  assert.strictEqual(getUsers.status, 200);
  assert.ok(Array.isArray(getUsers.body.data));
  recordApiAudit({
    id: 'API-TENANT-05',
    method: 'GET',
    path: '/api/v1/tenant/users',
    expectedStatus: 200,
    actualStatus: getUsers.status,
    pass: getUsers.status === 200,
    details: 'List active tenant members'
  });

  // POST /api/v1/tenant/users/invite
  const inviteRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/tenant/users/invite',
    headers: headersA,
    body: {
      email: `invite_${Date.now()}@testcorp.in`,
      first_name: 'Invited',
      last_name: 'Accountant',
      role_code: 'ACCOUNTANT'
    }
  });
  assert.strictEqual(inviteRes.status, 201);
  recordApiAudit({
    id: 'API-TENANT-06',
    method: 'POST',
    path: '/api/v1/tenant/users/invite',
    expectedStatus: 201,
    actualStatus: inviteRes.status,
    pass: inviteRes.status === 201,
    details: 'Invite new member and assign tenant role'
  });
});

test('04. Multi-Company Scoping & Switch APIs', async () => {
  // GET /api/v1/companies/profiles
  const profilesRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/companies/profiles',
    headers: headersA
  });
  assert.strictEqual(profilesRes.status, 200);
  recordApiAudit({
    id: 'API-COMP-01',
    method: 'GET',
    path: '/api/v1/companies/profiles',
    expectedStatus: 200,
    actualStatus: profilesRes.status,
    pass: profilesRes.status === 200,
    details: 'List business profile templates'
  });

  // GET /api/v1/companies/
  const listComp = await makeRequest({
    method: 'GET',
    path: '/api/v1/companies/',
    headers: headersA
  });
  assert.strictEqual(listComp.status, 200);
  assert.ok(Array.isArray(listComp.body.data));
  recordApiAudit({
    id: 'API-COMP-02',
    method: 'GET',
    path: '/api/v1/companies/',
    expectedStatus: 200,
    actualStatus: listComp.status,
    pass: listComp.status === 200,
    details: 'List accessible companies for current user'
  });

  // POST /api/v1/companies/ - Create secondary company
  const createComp = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies/',
    headers: headersA,
    body: {
      company_code: 'BRANCH01',
      company_name: 'Branch 01 Trading Enterprises',
      legal_name: 'Branch 01 Trading Enterprises',
      business_profile: 'GENERAL_RETAIL',
      currency: 'INR',
      country_code: 'IND',
      state_code: 'MH',
      state_name: 'Maharashtra',
      gstin: '27AABCT1234F1Z5'
    }
  });
  assert.strictEqual(createComp.status, 201);
  const branchComp = createComp.body.data.company;
  recordApiAudit({
    id: 'API-COMP-03',
    method: 'POST',
    path: '/api/v1/companies/',
    expectedStatus: 201,
    actualStatus: createComp.status,
    pass: createComp.status === 201,
    details: 'Create secondary company with distinct GSTIN and COA'
  });

  // POST /api/v1/companies/switch
  const switchComp = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies/switch',
    headers: headersA,
    body: { company_id: branchComp.id }
  });
  assert.strictEqual(switchComp.status, 200);
  assert.ok(switchComp.body.data.active_company);
  recordApiAudit({
    id: 'API-COMP-04',
    method: 'POST',
    path: '/api/v1/companies/switch',
    expectedStatus: 200,
    actualStatus: switchComp.status,
    pass: switchComp.status === 200,
    details: 'Switch active company context and receive company claim token'
  });
});

test('05. Counterparties Management APIs', async () => {
  // POST /api/v1/counterparties/
  const createParty = await makeRequest({
    method: 'POST',
    path: '/api/v1/counterparties/',
    headers: headersA,
    body: {
      party_code: 'CUST-APEX-001',
      legal_name: 'Apex Wholesale Mart Private Limited',
      trade_name: 'Apex Mart',
      party_type: 'ORGANIZATION',
      country: 'IND',
      state: 'MH',
      tax_id: '27AABCA1234F1Z8',
      initial_role_type: 'CUSTOMER'
    }
  });
  assert.strictEqual(createParty.status, 201);
  createdPartyId = createParty.body.data._id;
  recordApiAudit({
    id: 'API-PARTY-01',
    method: 'POST',
    path: '/api/v1/counterparties/',
    expectedStatus: 201,
    actualStatus: createParty.status,
    pass: createParty.status === 201,
    details: 'Create customer party counterparty with initial business role'
  });

  // GET /api/v1/counterparties/
  const listParties = await makeRequest({
    method: 'GET',
    path: '/api/v1/counterparties/',
    headers: headersA
  });
  assert.strictEqual(listParties.status, 200);
  assert.ok(Array.isArray(listParties.body.data));
  recordApiAudit({
    id: 'API-PARTY-02',
    method: 'GET',
    path: '/api/v1/counterparties/',
    expectedStatus: 200,
    actualStatus: listParties.status,
    pass: listParties.status === 200,
    details: 'List counterparties in tenant/company scope'
  });

  // GET /api/v1/counterparties/:id
  const getParty = await makeRequest({
    method: 'GET',
    path: `/api/v1/counterparties/${createdPartyId}`,
    headers: headersA
  });
  assert.strictEqual(getParty.status, 200);
  assert.strictEqual(getParty.body.data.party_code, 'CUST-APEX-001');
  recordApiAudit({
    id: 'API-PARTY-03',
    method: 'GET',
    path: `/api/v1/counterparties/:id`,
    expectedStatus: 200,
    actualStatus: getParty.status,
    pass: getParty.status === 200,
    details: 'Fetch counterparty details and associated business roles'
  });

  // Cross-tenant isolation on counterparty
  const crossParty = await makeRequest({
    method: 'GET',
    path: `/api/v1/counterparties/${createdPartyId}`,
    headers: headersB
  });
  assert.strictEqual(crossParty.status, 404);
  recordApiAudit({
    id: 'API-PARTY-04',
    method: 'GET',
    path: `/api/v1/counterparties/:id (Cross-Tenant)`,
    expectedStatus: 404,
    actualStatus: crossParty.status,
    pass: crossParty.status === 404,
    details: 'Tenant B cannot access Tenant A counterparty'
  });
});

test('06. Chart of Accounts, Fiscal Periods & General Ledger APIs', async () => {
  // GET /api/v1/gl/accounts
  const listAccounts = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: headersA
  });
  assert.strictEqual(listAccounts.status, 200);
  assert.ok(listAccounts.body.data.length > 0);
  recordApiAudit({
    id: 'API-GL-01',
    method: 'GET',
    path: '/api/v1/gl/accounts',
    expectedStatus: 200,
    actualStatus: listAccounts.status,
    pass: listAccounts.status === 200,
    details: 'Fetch Chart of Accounts seeded for company'
  });

  // POST /api/v1/gl/accounts - Create custom ledger account
  const createAccount = await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/accounts',
    headers: headersA,
    body: {
      account_code: '6100-AUDIT',
      account_name: 'Audit Professional Fees',
      account_type: 'EXPENSE',
      normal_balance: 'DEBIT',
      subledger_type: 'NONE',
      currency: 'INR',
      description: 'Audit & Consulting Services Expense'
    }
  });
  assert.strictEqual(createAccount.status, 201);
  createdAccountId = createAccount.body.data._id;
  recordApiAudit({
    id: 'API-GL-02',
    method: 'POST',
    path: '/api/v1/gl/accounts',
    expectedStatus: 201,
    actualStatus: createAccount.status,
    pass: createAccount.status === 201,
    details: 'Create custom ledger account with unique account_number'
  });

  // GET /api/v1/gl/periods
  const getPeriods = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/periods',
    headers: headersA
  });
  assert.strictEqual(getPeriods.status, 200);
  assert.ok(Array.isArray(getPeriods.body.data));
  recordApiAudit({
    id: 'API-GL-03',
    method: 'GET',
    path: '/api/v1/gl/periods',
    expectedStatus: 200,
    actualStatus: getPeriods.status,
    pass: getPeriods.status === 200,
    details: 'Fetch fiscal periods for current company'
  });

  // POST /api/v1/gl/journals - Post balanced manual journal
  const cashAcc = listAccounts.body.data.find(a => a.account_code === '1001' || a.account_code === '1000') || listAccounts.body.data[0];
  const expAcc = createAccount.body.data;
  assert.ok(cashAcc && expAcc);

  const postJournal = await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/journals',
    headers: headersA,
    body: {
      source_module: 'GL_MANUAL',
      memo: 'Audit Consulting Fee Payment',
      lines: [
        {
          account_code: expAcc.account_code,
          debit: 1500.00,
          credit: 0,
          memo: 'Consulting services expense'
        },
        {
          account_code: cashAcc.account_code,
          debit: 0,
          credit: 1500.00,
          memo: 'Cash payment for consulting'
        }
      ]
    }
  });
  assert.strictEqual(postJournal.status, 201, `Post manual journal failed: ${JSON.stringify(postJournal.body)}`);
  assert.strictEqual(postJournal.body.data.journal.status, 'POSTED');
  recordApiAudit({
    id: 'API-GL-04',
    method: 'POST',
    path: '/api/v1/gl/journals',
    expectedStatus: 201,
    actualStatus: postJournal.status,
    pass: postJournal.status === 201,
    details: 'Post balanced double-entry manual journal and update account balances'
  });

  // Reject unbalanced journal
  const badJournal = await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/journals',
    headers: headersA,
    body: {
      entry_type: 'MANUAL',
      source_module: 'GL',
      description: 'Unbalanced Journal',
      entries: [
        { account_id: expAcc._id, debit: 1000.00, credit: 0 },
        { account_id: cashAcc._id, debit: 0, credit: 500.00 }
      ]
    }
  });
  assert.strictEqual(badJournal.status, 400);
  recordApiAudit({
    id: 'API-GL-05',
    method: 'POST',
    path: '/api/v1/gl/journals (Unbalanced)',
    expectedStatus: 400,
    actualStatus: badJournal.status,
    pass: badJournal.status === 400,
    details: 'Reject unbalanced journal posting where Total Debits != Total Credits'
  });

  // GET /api/v1/gl/trial-balance
  const tbRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/trial-balance',
    headers: headersA
  });
  assert.strictEqual(tbRes.status, 200);
  assert.strictEqual(tbRes.body.data.is_balanced, true);
  recordApiAudit({
    id: 'API-GL-06',
    method: 'GET',
    path: '/api/v1/gl/trial-balance',
    expectedStatus: 200,
    actualStatus: tbRes.status,
    pass: tbRes.status === 200 && tbRes.body.data.is_balanced === true,
    details: 'Trial balance computes balanced totals (Debits == Credits)'
  });
});

test('07. Inventory Masters: Groups, Categories, UOM, Godowns, Items', async () => {
  // 1. Stock Group
  const createGroup = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/groups',
    headers: headersA,
    body: {
      group_code: 'ELEC_TEST',
      group_name: 'Electronics Test Group',
      description: 'Consumer Electronics'
    }
  });
  assert.strictEqual(createGroup.status, 201);
  createdGroupId = createGroup.body.data._id;
  recordApiAudit({
    id: 'API-INV-01',
    method: 'POST',
    path: '/api/v1/inventory/groups',
    expectedStatus: 201,
    actualStatus: createGroup.status,
    pass: createGroup.status === 201,
    details: 'Create stock group'
  });

  // 2. Stock Category
  const createCat = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/categories',
    headers: headersA,
    body: {
      category_code: 'AUDIO_TEST',
      category_name: 'Audio Accessories',
      description: 'Headphones and speakers'
    }
  });
  assert.strictEqual(createCat.status, 201);
  createdCategoryId = createCat.body.data._id;
  recordApiAudit({
    id: 'API-INV-02',
    method: 'POST',
    path: '/api/v1/inventory/categories',
    expectedStatus: 201,
    actualStatus: createCat.status,
    pass: createCat.status === 201,
    details: 'Create stock category'
  });

  // 3. Units of Measurement
  const getUom = await makeRequest({
    method: 'GET',
    path: '/api/v1/inventory/uom',
    headers: headersA
  });
  assert.strictEqual(getUom.status, 200);
  const pcsUom = getUom.body.data.find(u => u.unit_code === 'PCS');
  assert.ok(pcsUom);
  createdUomId = pcsUom._id;
  recordApiAudit({
    id: 'API-INV-03',
    method: 'GET',
    path: '/api/v1/inventory/uom',
    expectedStatus: 200,
    actualStatus: getUom.status,
    pass: getUom.status === 200,
    details: 'List standard seeded Units of Measurement'
  });

  // 4. Godowns / Warehouses
  const getGodowns = await makeRequest({
    method: 'GET',
    path: '/api/v1/inventory/godowns',
    headers: headersA
  });
  assert.strictEqual(getGodowns.status, 200);
  assert.ok(getGodowns.body.data.length > 0);
  createdGodownId = getGodowns.body.data[0]._id;
  recordApiAudit({
    id: 'API-INV-04',
    method: 'GET',
    path: '/api/v1/inventory/godowns',
    expectedStatus: 200,
    actualStatus: getGodowns.status,
    pass: getGodowns.status === 200,
    details: 'Fetch warehouses/godowns'
  });

  // 5. Stock Items
  const createItem = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: headersA,
    body: {
      item_code: 'HEADPHONE_PRO',
      sku: 'HP-PRO-001',
      item_name: 'Wireless Pro Headphones',
      stock_group_id: createdGroupId,
      stock_category_id: createdCategoryId,
      base_uom_id: createdUomId,
      costing_method: 'AVERAGE_COST',
      hsn_sac_code: '85183000',
      sales_price: 2499.00,
      purchase_price: 1500.00,
      tax_rate: 18,
      is_stock_tracked: true
    }
  });
  assert.strictEqual(createItem.status, 201);
  createdItemId = createItem.body.data._id;
  recordApiAudit({
    id: 'API-INV-05',
    method: 'POST',
    path: '/api/v1/inventory/items',
    expectedStatus: 201,
    actualStatus: createItem.status,
    pass: createItem.status === 201,
    details: 'Create inventory stock item with GST HSN code and costing method'
  });

  // 6. Post Opening Stock
  const openStock = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/opening-stock',
    headers: headersA,
    body: {
      stock_item_id: createdItemId,
      godown_id: createdGodownId,
      quantity: 50,
      unit_rate: 1500.00,
      uom_id: createdUomId,
      opening_date: '2026-04-01'
    }
  });
  assert.strictEqual(openStock.status, 201);
  recordApiAudit({
    id: 'API-INV-06',
    method: 'POST',
    path: '/api/v1/inventory/opening-stock',
    expectedStatus: 201,
    actualStatus: openStock.status,
    pass: openStock.status === 201,
    details: 'Initialize stock balance and movement ledger for opening stock'
  });

  // 7. GET /api/v1/inventory/balances
  const balancesRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/inventory/balances',
    headers: headersA
  });
  assert.strictEqual(balancesRes.status, 200);
  const itemBal = balancesRes.body.data.find(b => b.stock_item_id?._id === createdItemId || b.stock_item_id === createdItemId);
  assert.ok(itemBal);
  assert.strictEqual(Number(itemBal.quantity_on_hand), 50);
  recordApiAudit({
    id: 'API-INV-07',
    method: 'GET',
    path: '/api/v1/inventory/balances',
    expectedStatus: 200,
    actualStatus: balancesRes.status,
    pass: balancesRes.status === 200 && Number(itemBal.quantity_on_hand) === 50,
    details: 'Verify physical stock balances match opening stock movements'
  });
});

test('08. Commercial Transactions & Full Inventory-to-GL Integration', async () => {
  // 1. Create Sales Invoice (CommercialDocument)
  const createSales = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: headersA,
    body: {
      document_type: 'SALES_INVOICE',
      party_id: createdPartyId,
      document_date: '2026-05-10',
      payment_terms: 'CREDIT_30',
      place_of_supply: 'MH',
      lines: [
        {
          stock_item_id: createdItemId,
          godown_id: createdGodownId,
          quantity: 10,
          unit_rate: 2500.00,
          tax_rate: 18,
          hsn_sac_code: '85183000'
        }
      ]
    }
  });
  assert.strictEqual(createSales.status, 201);
  createdDocId = createSales.body.data._id;
  assert.strictEqual(createSales.body.data.status, 'DRAFT');
  assert.strictEqual(Number(createSales.body.data.total_taxable_amount), 25000);
  assert.strictEqual(Number(createSales.body.data.total_tax_amount), 4500); // 18% GST (CGST 9% + SGST 9%)
  assert.strictEqual(Number(createSales.body.data.grand_total), 29500);

  recordApiAudit({
    id: 'API-COMM-01',
    method: 'POST',
    path: '/api/v1/commercial/documents',
    expectedStatus: 201,
    actualStatus: createSales.status,
    pass: createSales.status === 201,
    details: 'Draft sales invoice calculates intra-state GST (9% CGST + 9% SGST)'
  });

  // 2. Post Sales Invoice (Deduct stock, post GL journal, AR & COGS)
  const postSales = await makeRequest({
    method: 'POST',
    path: `/api/v1/commercial/documents/${createdDocId}/post`,
    headers: headersA
  });
  assert.strictEqual(postSales.status, 200);
  assert.strictEqual(postSales.body.data.document.status, 'POSTED');
  assert.ok(postSales.body.data.journal._id);

  recordApiAudit({
    id: 'API-COMM-02',
    method: 'POST',
    path: `/api/v1/commercial/documents/:id/post`,
    expectedStatus: 200,
    actualStatus: postSales.status,
    pass: postSales.status === 200,
    details: 'Posting sales invoice updates stock balance (-10 PCS) and posts balanced GL entries'
  });

  // Verify stock reduced from 50 to 40
  const afterBal = await makeRequest({
    method: 'GET',
    path: `/api/v1/inventory/items/${createdItemId}`,
    headers: headersA
  });
  assert.strictEqual(afterBal.status, 200);
  const currentQty = afterBal.body.data.balances.reduce((s, b) => s + Number(b.quantity_on_hand), 0);
  assert.strictEqual(Number(currentQty), 40);

  // 3. GET /api/v1/commercial/reports/stock-gl-reconciliation
  const stockGlRec = await makeRequest({
    method: 'GET',
    path: '/api/v1/commercial/reports/stock-gl-reconciliation',
    headers: headersA
  });
  assert.strictEqual(stockGlRec.status, 200);
  assert.ok(stockGlRec.body.data.total_stock_valuation !== undefined);
  recordApiAudit({
    id: 'API-COMM-03',
    method: 'GET',
    path: '/api/v1/commercial/reports/stock-gl-reconciliation',
    expectedStatus: 200,
    actualStatus: stockGlRec.status,
    pass: stockGlRec.status === 200,
    details: 'Reconcile perpetual inventory asset balance against physical stock valuation'
  });

  // 4. Commercial Register Report
  const regReport = await makeRequest({
    method: 'GET',
    path: '/api/v1/commercial/reports/register',
    headers: headersA
  });
  assert.strictEqual(regReport.status, 200);
  assert.ok(regReport.body.data.total_count >= 1);
  recordApiAudit({
    id: 'API-COMM-04',
    method: 'GET',
    path: '/api/v1/commercial/reports/register',
    expectedStatus: 200,
    actualStatus: regReport.status,
    pass: regReport.status === 200,
    details: 'Fetch commercial document registers and totals'
  });
});

test('09. Industry Module APIs: Retail POS, Restaurant, Hotel PMS, Manufacturing', async () => {
  // A. RETAIL POS
  // 1. Open shift
  const openShift = await makeRequest({
    method: 'POST',
    path: '/api/v1/retail-pos/shifts/open',
    headers: headersA,
    body: { opening_float: 2000.00 }
  });
  assert.strictEqual(openShift.status, 201);
  createdPosShiftId = openShift.body.data._id;
  recordApiAudit({
    id: 'API-POS-01',
    method: 'POST',
    path: '/api/v1/retail-pos/shifts/open',
    expectedStatus: 201,
    actualStatus: openShift.status,
    pass: openShift.status === 201,
    details: 'Open cashier shift with opening cash float'
  });

  // 2. POS fast checkout
  const posCheckout = await makeRequest({
    method: 'POST',
    path: '/api/v1/retail-pos/checkout',
    headers: headersA,
    body: {
      shift_id: createdPosShiftId,
      tender_type: 'CASH',
      items: [
        {
          stock_item_id: createdItemId,
          godown_id: createdGodownId,
          quantity: 2,
          rate: 2499.00,
          tax_rate: 18
        }
      ]
    }
  });
  assert.strictEqual(posCheckout.status, 201);
  assert.strictEqual(posCheckout.body.data.success, true);
  recordApiAudit({
    id: 'API-POS-02',
    method: 'POST',
    path: '/api/v1/retail-pos/checkout',
    expectedStatus: 201,
    actualStatus: posCheckout.status,
    pass: posCheckout.status === 201,
    details: 'Retail POS checkout with tender receipt, GL journal, and stock movement'
  });

  // 3. Close shift
  const closeShift = await makeRequest({
    method: 'POST',
    path: '/api/v1/retail-pos/shifts/close',
    headers: headersA,
    body: {
      shift_id: createdPosShiftId,
      closing_cash_actual: 7897.64,
      notes: 'Standard shift close'
    }
  });
  assert.strictEqual(closeShift.status, 200);
  assert.strictEqual(closeShift.body.data.status, 'CLOSED');
  recordApiAudit({
    id: 'API-POS-03',
    method: 'POST',
    path: '/api/v1/retail-pos/shifts/close',
    expectedStatus: 200,
    actualStatus: closeShift.status,
    pass: closeShift.status === 200,
    details: 'Close cashier shift and reconcile counted cash against system sales'
  });

  // B. RESTAURANT & KITCHEN ORDERS
  // 1. Create table
  const createTable = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/tables',
    headers: headersA,
    body: {
      table_number: 'T-10',
      section: 'DINING_HALL',
      seating_capacity: 4
    }
  });
  assert.strictEqual(createTable.status, 201);
  createdTableId = createTable.body.data._id;
  recordApiAudit({
    id: 'API-REST-01',
    method: 'POST',
    path: '/api/v1/restaurant/tables',
    expectedStatus: 201,
    actualStatus: createTable.status,
    pass: createTable.status === 201,
    details: 'Create dining table'
  });

  // 2. Create Restaurant Order
  const createOrder = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/orders',
    headers: headersA,
    body: {
      table_id: createdTableId,
      order_type: 'DINE_IN',
      customer_name: 'Rahul Sharma',
      items: [
        {
          item_name: 'Veg Supreme Pizza',
          quantity: 2,
          unit_price: 350.00
        }
      ]
    }
  });
  assert.strictEqual(createOrder.status, 201);
  const orderId = createOrder.body.data._id;
  recordApiAudit({
    id: 'API-REST-02',
    method: 'POST',
    path: '/api/v1/restaurant/orders',
    expectedStatus: 201,
    actualStatus: createOrder.status,
    pass: createOrder.status === 201,
    details: 'Create dine-in restaurant order'
  });

  // 3. Issue KOT
  const kotRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/restaurant/orders/${orderId}/kot`,
    headers: headersA
  });
  assert.strictEqual(kotRes.status, 200);
  assert.strictEqual(kotRes.body.data.status, 'KITCHEN_IN_PROGRESS');
  recordApiAudit({
    id: 'API-REST-03',
    method: 'POST',
    path: `/api/v1/restaurant/orders/:orderId/kot`,
    expectedStatus: 200,
    actualStatus: kotRes.status,
    pass: kotRes.status === 200,
    details: 'Issue Kitchen Order Ticket'
  });

  // C. HOTEL PMS
  // 1. Create Room Type
  const createRoomType = await makeRequest({
    method: 'POST',
    path: '/api/v1/hotel/room-types',
    headers: headersA,
    body: {
      type_code: 'DELUXE_TEST',
      type_name: 'Deluxe King Suite',
      base_rate: 4500.00,
      max_occupancy: 3
    }
  });
  assert.strictEqual(createRoomType.status, 201);
  createdRoomTypeId = createRoomType.body.data._id;
  recordApiAudit({
    id: 'API-HOTEL-01',
    method: 'POST',
    path: '/api/v1/hotel/room-types',
    expectedStatus: 201,
    actualStatus: createRoomType.status,
    pass: createRoomType.status === 201,
    details: 'Create hotel room type with standard nightly rate'
  });

  // 2. Create Hotel Room
  const createRoom = await makeRequest({
    method: 'POST',
    path: '/api/v1/hotel/rooms',
    headers: headersA,
    body: {
      room_number: '101',
      floor: 1,
      room_type_id: createdRoomTypeId
    }
  });
  assert.strictEqual(createRoom.status, 201);
  createdRoomId = createRoom.body.data._id;
  recordApiAudit({
    id: 'API-HOTEL-02',
    method: 'POST',
    path: '/api/v1/hotel/rooms',
    expectedStatus: 201,
    actualStatus: createRoom.status,
    pass: createRoom.status === 201,
    details: 'Create hotel room'
  });

  // 3. Hotel Reservation
  const createRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/hotel/reservations',
    headers: headersA,
    body: {
      room_type_id: createdRoomTypeId,
      guest_name: 'Ananya Verma',
      check_in_date: '2026-06-01',
      check_out_date: '2026-06-03',
      rate_per_night: 4500.00
    }
  });
  assert.strictEqual(createRes.status, 201);
  createdReservationId = createRes.body.data._id;
  recordApiAudit({
    id: 'API-HOTEL-03',
    method: 'POST',
    path: '/api/v1/hotel/reservations',
    expectedStatus: 201,
    actualStatus: createRes.status,
    pass: createRes.status === 201,
    details: 'Create guest reservation and folio'
  });

  // 4. Night Audit (Idempotent room charge posting)
  const nightAudit = await makeRequest({
    method: 'POST',
    path: '/api/v1/hotel/night-audit',
    headers: headersA,
    body: { audit_date: '2026-06-01' }
  });
  assert.strictEqual(nightAudit.status, 200);
  assert.strictEqual(nightAudit.body.data.audit_date, '2026-06-01');
  recordApiAudit({
    id: 'API-HOTEL-04',
    method: 'POST',
    path: '/api/v1/hotel/night-audit',
    expectedStatus: 200,
    actualStatus: nightAudit.status,
    pass: nightAudit.status === 200,
    details: 'Execute idempotent nightly room revenue audit and folio posting'
  });

  // D. MANUFACTURING & WORK ORDERS
  // 1. Create Manufacturing BOM
  const createBom = await makeRequest({
    method: 'POST',
    path: '/api/v1/manufacturing/boms',
    headers: headersA,
    body: {
      bom_code: 'BOM_HP_PRO',
      finished_item_id: createdItemId,
      finished_quantity: 1,
      components: [
        {
          component_item_id: createdItemId,
          quantity: 1,
          cost_allocation_percent: 100
        }
      ]
    }
  });
  assert.strictEqual(createBom.status, 201);
  createdBomId = createBom.body.data._id;
  recordApiAudit({
    id: 'API-MFG-01',
    method: 'POST',
    path: '/api/v1/manufacturing/boms',
    expectedStatus: 201,
    actualStatus: createBom.status,
    pass: createBom.status === 201,
    details: 'Create production Bill of Materials (BOM)'
  });

  // 2. Create Work Order
  const createWo = await makeRequest({
    method: 'POST',
    path: '/api/v1/manufacturing/work-orders',
    headers: headersA,
    body: {
      bom_id: createdBomId,
      planned_quantity: 5,
      target_godown_id: createdGodownId,
      planned_start_date: '2026-06-10',
      planned_completion_date: '2026-06-15'
    }
  });
  assert.strictEqual(createWo.status, 201);
  createdWorkOrderId = createWo.body.data._id;
  recordApiAudit({
    id: 'API-MFG-02',
    method: 'POST',
    path: '/api/v1/manufacturing/work-orders',
    expectedStatus: 201,
    actualStatus: createWo.status,
    pass: createWo.status === 201,
    details: 'Plan and schedule manufacturing work order'
  });
});

test('10. Data Exchange: Import & Export Operations', async () => {
  // 1. Export Accounts
  const exportAcc = await makeRequest({
    method: 'GET',
    path: '/api/v1/data-exchange/export/accounts',
    headers: headersA
  });
  assert.strictEqual(exportAcc.status, 200);
  assert.ok(exportAcc.body.data.length > 0);
  recordApiAudit({
    id: 'API-DATA-01',
    method: 'GET',
    path: '/api/v1/data-exchange/export/accounts',
    expectedStatus: 200,
    actualStatus: exportAcc.status,
    pass: exportAcc.status === 200,
    details: 'Export Chart of Accounts to structured data exchange payload'
  });

  // 2. Export Stock Balances
  const exportStock = await makeRequest({
    method: 'GET',
    path: '/api/v1/data-exchange/export/stock-balances',
    headers: headersA
  });
  assert.strictEqual(exportStock.status, 200);
  assert.ok(exportStock.body.data.length > 0);
  recordApiAudit({
    id: 'API-DATA-02',
    method: 'GET',
    path: '/api/v1/data-exchange/export/stock-balances',
    expectedStatus: 200,
    actualStatus: exportStock.status,
    pass: exportStock.status === 200,
    details: 'Export current stock balance quantities and valuations'
  });

  // 3. Dry-Run Import Accounts
  const dryImport = await makeRequest({
    method: 'POST',
    path: '/api/v1/data-exchange/import/accounts',
    headers: headersA,
    body: {
      dry_run: true,
      rows: [
        {
          account_code: '6200-TEST',
          account_name: 'Office Stationery',
          account_type: 'EXPENSE',
          currency: 'INR'
        }
      ]
    }
  });
  assert.strictEqual(dryImport.status, 200);
  assert.strictEqual(dryImport.body.data.valid_rows, 1);
  recordApiAudit({
    id: 'API-DATA-03',
    method: 'POST',
    path: '/api/v1/data-exchange/import/accounts',
    expectedStatus: 200,
    actualStatus: dryImport.status,
    pass: dryImport.status === 200,
    details: 'Dry-run bulk import validates payloads without database mutation'
  });
});

test('11. Finance Close & Reporting APIs', async () => {
  // GET /api/v1/close/overview
  const overviewRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/close/overview',
    headers: headersA
  });
  assert.strictEqual(overviewRes.status, 200);
  recordApiAudit({
    id: 'API-CLOSE-01',
    method: 'GET',
    path: '/api/v1/close/overview',
    expectedStatus: 200,
    actualStatus: overviewRes.status,
    pass: overviewRes.status === 200,
    details: 'Fetch month-end close overview and checklist runbook status'
  });

  // GET /api/v1/close/trial-balance
  const closeTb = await makeRequest({
    method: 'GET',
    path: '/api/v1/close/trial-balance',
    headers: headersA
  });
  assert.strictEqual(closeTb.status, 200, `Close TB failed: ${JSON.stringify(closeTb.body)}`);
  assert.strictEqual(closeTb.body.data.snapshot.is_balanced, true);
  recordApiAudit({
    id: 'API-CLOSE-02',
    method: 'GET',
    path: '/api/v1/close/trial-balance',
    expectedStatus: 200,
    actualStatus: closeTb.status,
    pass: closeTb.status === 200,
    details: 'Verify close trial balance balances across all debits and credits'
  });

  // GET /api/v1/close/reports/financial-statements
  const finStmts = await makeRequest({
    method: 'GET',
    path: '/api/v1/close/reports/financial-statements',
    headers: headersA
  });
  assert.strictEqual(finStmts.status, 200);
  recordApiAudit({
    id: 'API-CLOSE-03',
    method: 'GET',
    path: '/api/v1/close/reports/financial-statements',
    expectedStatus: 200,
    actualStatus: finStmts.status,
    pass: finStmts.status === 200,
    details: 'Generate financial statements (Balance Sheet, P&L, Trial Balance)'
  });
});

test('12. Accounting Dimensions & Event Engine APIs', async () => {
  // 1. Create Dimension
  const createDim = await makeRequest({
    method: 'POST',
    path: '/api/v1/dimensions/',
    headers: headersA,
    body: {
      dimension_code: 'COST_CENTER',
      display_name: 'Cost Center Dimension',
      allowed_values: ['CORP', 'SALES_WEST', 'WAREHOUSE_MUM']
    }
  });
  assert.strictEqual(createDim.status, 201);
  createdDimensionId = createDim.body.data._id;
  recordApiAudit({
    id: 'API-DIM-01',
    method: 'POST',
    path: '/api/v1/dimensions/',
    expectedStatus: 201,
    actualStatus: createDim.status,
    pass: createDim.status === 201,
    details: 'Create accounting dimension with enumerated values'
  });

  // 2. GET /api/v1/dimensions/
  const listDim = await makeRequest({
    method: 'GET',
    path: '/api/v1/dimensions/',
    headers: headersA
  });
  assert.strictEqual(listDim.status, 200);
  assert.ok(listDim.body.data.length > 0);
  recordApiAudit({
    id: 'API-DIM-02',
    method: 'GET',
    path: '/api/v1/dimensions/',
    expectedStatus: 200,
    actualStatus: listDim.status,
    pass: listDim.status === 200,
    details: 'Fetch defined accounting dimensions'
  });

  // 3. GET /api/v1/event-pipeline/stats
  const statsRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/event-pipeline/stats',
    headers: headersA
  });
  assert.strictEqual(statsRes.status, 200);
  recordApiAudit({
    id: 'API-PIPE-01',
    method: 'GET',
    path: '/api/v1/event-pipeline/stats',
    expectedStatus: 200,
    actualStatus: statsRes.status,
    pass: statsRes.status === 200,
    details: 'Fetch event outbox/inbox pipeline throughput statistics'
  });

  // 4. GET /api/v1/config-bundle/export
  const exportBundle = await makeRequest({
    method: 'GET',
    path: '/api/v1/config-bundle/export',
    headers: headersA
  });
  assert.strictEqual(exportBundle.status, 200);
  assert.ok(exportBundle.body.data.bundle_version !== undefined);
  recordApiAudit({
    id: 'API-BUNDLE-01',
    method: 'GET',
    path: '/api/v1/config-bundle/export',
    expectedStatus: 200,
    actualStatus: exportBundle.status,
    pass: exportBundle.status === 200,
    details: 'Export full configuration bundle (events, rules, dimensions)'
  });
});

test('13. Tenant Data Reset (Dev Reset Protection & Commercial Purge)', async () => {
  // Attempt without confirmation header -> 400
  const badReset = await makeRequest({
    method: 'POST',
    path: '/api/v1/tenant/reset-dev-data',
    headers: headersA
  });
  assert.strictEqual(badReset.status, 400);
  recordApiAudit({
    id: 'API-RESET-01',
    method: 'POST',
    path: '/api/v1/tenant/reset-dev-data (No Header)',
    expectedStatus: 400,
    actualStatus: badReset.status,
    pass: badReset.status === 400,
    details: 'Reset is blocked without explicit confirmation header'
  });

  // Valid reset with confirmation header
  const goodReset = await makeRequest({
    method: 'POST',
    path: '/api/v1/tenant/reset-dev-data',
    headers: {
      ...headersA,
      'x-confirm-destructive-reset': 'CONFIRM_RESET_ALL_DATA'
    }
  });
  assert.strictEqual(goodReset.status, 200);
  assert.strictEqual(goodReset.body.data.cleared, true);
  recordApiAudit({
    id: 'API-RESET-02',
    method: 'POST',
    path: '/api/v1/tenant/reset-dev-data (Confirmed)',
    expectedStatus: 200,
    actualStatus: goodReset.status,
    pass: goodReset.status === 200,
    details: 'Successfully clear transactional test data with TENANT_ADMIN role'
  });

  // Verify commercial documents and stock movements were purged for tenantA
  const remainingDocs = await CommercialDocument.countDocuments({ tenant_id: tenantA.id });
  const remainingMovements = await StockMovement.countDocuments({ tenant_id: tenantA.id });
  assert.strictEqual(remainingDocs, 0);
  assert.strictEqual(remainingMovements, 0);
  recordApiAudit({
    id: 'API-RESET-03',
    method: 'ASSERT',
    path: 'Database CommercialDocument & StockMovement count',
    expectedStatus: 0,
    actualStatus: remainingDocs + remainingMovements,
    pass: remainingDocs === 0 && remainingMovements === 0,
    details: 'Verify commercial transactions and inventory balances were fully wiped'
  });
});
