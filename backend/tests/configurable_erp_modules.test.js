process.env.PORT = '5056';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');

const { startServer } = require('../src/server');
const {
  Tenant,
  User,
  Role,
  UserRole,
  Company,
  CompanyMembership,
  LedgerAccount,
  Party,
  StockItem,
  UnitOfMeasurement,
  Godown
} = require('../src/models');

const { initializeCompany } = require('../src/services/companyInitService');
const { postJournalEntry, computeTrialBalance } = require('../src/services/journalPostingService');
const commissionsService = require('../src/services/commissionsService');

let serverInstance = null;
const PORT = 5056;

function makeRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
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
    if (payload) req.write(payload);
    req.end();
  });
}

const runId = Math.floor(Date.now() % 100000);
let tenant = null;
let token = null;
let user = null;
let companySimple = null;
let companyRetail = null;
let mainHubParty = null;

test.before(async () => {
  const serverObj = await startServer(PORT);
  serverInstance = serverObj ? serverObj.server : null;

  // 1. Create a test tenant
  const tenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TEN_CFG_${runId}`,
      tenant_name: `Configurable ERP Tenant ${runId}`,
      admin_email: `admin_cfg_${runId}@example.com`,
      admin_password: 'Password123!Safe',
      admin_first_name: 'Config',
      admin_last_name: 'Admin',
      tenant_type: 'ENTERPRISE',
      base_currency: 'INR'
    }
  });

  assert.equal(tenantRes.status, 201, `Failed to register tenant: ${JSON.stringify(tenantRes.body)}`);
  token = tenantRes.body.data.token;
  tenant = await Tenant.findOne({ tenant_code: `TEN_CFG_${runId}` });
  user = await User.findOne({ email: `admin_cfg_${runId}@example.com` });

  // 2. Create Main Hub Party in this tenant
  mainHubParty = await Party.create({
    tenant_id: tenant._id,
    party_code: `HUB_${runId}`,
    legal_name: `Main Regional Logistics Hub ${runId}`,
    trade_name: 'Central Hub',
    party_type: 'ORGANIZATION',
    roles: ['MAIN_HUB', 'VENDOR']
  });
});

test.after(async () => {
  if (serverInstance && typeof serverInstance.closeAllConnections === 'function') {
    serverInstance.closeAllConnections();
  }
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// ==========================================
// Test 1: Default Company Creation (Simple Core Only)
// ==========================================
test('1. Default Company Creation: Newly created general company has only core modules enabled', async () => {
  const initRes = await initializeCompany({
    tenantId: tenant._id,
    creatorUserId: user._id,
    companyCode: `CMP_GEN_${runId}`,
    companyName: 'General Accounting Sole Proprietor',
    businessProfile: 'CUSTOM_OTHER'
  });

  companySimple = initRes.company;
  assert.ok(companySimple, 'Company should be created');
  assert.ok(Array.isArray(companySimple.enabled_modules), 'enabled_modules should be an array');

  // Verify only core modules
  assert.deepEqual(companySimple.enabled_modules.sort(), ['BANKING_CASH', 'GL', 'PARTIES', 'REPORTS'].sort());
  assert.equal(companySimple.isModuleEnabled('GL'), true);
  assert.equal(companySimple.isModuleEnabled('BANKING_CASH'), true);
  assert.equal(companySimple.isModuleEnabled('PARTIES'), true);
  assert.equal(companySimple.isModuleEnabled('REPORTS'), true);

  // Optional modules should NOT be enabled
  assert.equal(companySimple.isModuleEnabled('INVENTORY'), false);
  assert.equal(companySimple.isModuleEnabled('RETAIL_POS'), false);
  assert.equal(companySimple.isModuleEnabled('RESTAURANT'), false);
  assert.equal(companySimple.isModuleEnabled('HOTEL_PMS'), false);
  assert.equal(companySimple.isModuleEnabled('MANUFACTURING'), false);
  assert.equal(companySimple.isModuleEnabled('FRANCHISE_COMMISSIONS'), false);
});

// ==========================================
// Test 2: Business Profile Preset (Retail & Wholesale)
// ==========================================
test('2. Business Profile Preset: GENERAL_RETAIL presets recommended retail & inventory modules', async () => {
  const initRes = await initializeCompany({
    tenantId: tenant._id,
    creatorUserId: user._id,
    companyCode: `CMP_RET_${runId}`,
    companyName: 'Retail & Trading Store',
    businessProfile: 'GENERAL_RETAIL'
  });

  companyRetail = initRes.company;
  assert.ok(companyRetail, 'Retail company should be created');

  // Should include core + INVENTORY + COMMERCIAL_BILLING + GST_TAX + RETAIL_POS
  assert.equal(companyRetail.isModuleEnabled('GL'), true);
  assert.equal(companyRetail.isModuleEnabled('INVENTORY'), true);
  assert.equal(companyRetail.isModuleEnabled('COMMERCIAL_BILLING'), true);
  assert.equal(companyRetail.isModuleEnabled('GST_TAX'), true);
  assert.equal(companyRetail.isModuleEnabled('RETAIL_POS'), true);

  // Restaurant, Hotel, Manufacturing should remain disabled
  assert.equal(companyRetail.isModuleEnabled('RESTAURANT'), false);
  assert.equal(companyRetail.isModuleEnabled('HOTEL_PMS'), false);
  assert.equal(companyRetail.isModuleEnabled('MANUFACTURING'), false);
});

// ==========================================
// Test 3: Module Enable API
// ==========================================
test('3. Module Enable API: Admin enables optional module (INVENTORY) via PATCH /api/v1/companies/:id/modules', async () => {
  const patchRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      enable: ['INVENTORY']
    }
  });

  assert.equal(patchRes.status, 200, `PATCH modules failed: ${JSON.stringify(patchRes.body)}`);
  assert.ok(patchRes.body.data.enabled_modules.includes('INVENTORY'), 'INVENTORY should be enabled');

  // Verify persistence via GET /api/v1/companies/:id/modules
  const getRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    }
  });

  assert.equal(getRes.status, 200);
  assert.ok(getRes.body.data.enabled_modules.includes('INVENTORY'), 'Retrieved modules should include INVENTORY');
});

// ==========================================
// Test 4: Module Disable API & Core Protection
// ==========================================
test('4. Module Disable API: Disabling optional module succeeds; disabling core module is rejected', async () => {
  // Attempt to disable core module GL -> should be rejected with 400
  const disableCoreRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      module_code: 'GL',
      is_enabled: false
    }
  });

  assert.equal(disableCoreRes.status, 400, 'Disabling core module GL must be rejected');
  assert.match(disableCoreRes.body.message || disableCoreRes.body.error?.message, /cannot be disabled/i);

  // Successfully disable optional module INVENTORY
  const disableOptRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      disable: ['INVENTORY']
    }
  });

  assert.equal(disableOptRes.status, 200);
  assert.equal(disableOptRes.body.data.enabled_modules.includes('INVENTORY'), false, 'INVENTORY should now be disabled');
});

// ==========================================
// Test 5: Middleware Blocking
// ==========================================
test('5. Middleware Blocking: Accessing restaurant route when RESTAURANT is disabled returns 403 MODULE_DISABLED', async () => {
  const res = await makeRequest({
    method: 'GET',
    path: '/api/v1/restaurant/tables',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companySimple._id.toString()
    }
  });

  assert.equal(res.status, 403, 'Should be forbidden when RESTAURANT module is disabled');
  const details = res.body.error?.details || res.body.details || {};
  assert.equal(details.code, 'MODULE_DISABLED');
  assert.equal(details.required_module, 'RESTAURANT');
});

// ==========================================
// Test 6: Middleware Allowance
// ==========================================
test('6. Middleware Allowance: Calling /api/v1/restaurant/tables after enabling RESTAURANT succeeds (200 OK)', async () => {
  // Enable RESTAURANT module
  await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      enable: ['RESTAURANT', 'INVENTORY']
    }
  });

  // Call restaurant endpoint now
  const res = await makeRequest({
    method: 'GET',
    path: '/api/v1/restaurant/tables',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companySimple._id.toString()
    }
  });

  assert.equal(res.status, 200, `Expected 200 OK after enabling RESTAURANT, got: ${res.status}`);
  assert.ok(Array.isArray(res.body.data), 'Expected array of restaurant tables');
});

// ==========================================
// Test 7: Dependency Validation
// ==========================================
test('7. Dependency Validation: Enabling RETAIL_POS automatically resolves dependency on INVENTORY', async () => {
  const patchRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      enable: ['RETAIL_POS'],
      auto_resolve_dependencies: true
    }
  });

  assert.equal(patchRes.status, 200);
  assert.ok(patchRes.body.data.enabled_modules.includes('RETAIL_POS'), 'RETAIL_POS should be enabled');
  assert.ok(patchRes.body.data.enabled_modules.includes('INVENTORY'), 'INVENTORY dependency should be auto-enabled');
});

// ==========================================
// Test 8: Non-destructive Disabling
// ==========================================
test('8. Non-destructive Disabling: Creating record, disabling module, verifies DB record persists', async () => {
  const uom = await UnitOfMeasurement.findOne({ company_id: companySimple._id })
    || await UnitOfMeasurement.create({
      tenant_id: tenant._id,
      company_id: companySimple._id,
      uom_code: `PCS_${runId}`,
      uom_name: 'Pieces',
      uom_type: 'SIMPLE'
    });

  const item = await StockItem.create({
    tenant_id: tenant._id,
    company_id: companySimple._id,
    item_code: `ITEM_TEST_${runId}`,
    item_name: 'Historical Test Item',
    sku: `SKU_TEST_${runId}`,
    base_uom_id: uom._id,
    standard_selling_price: 150
  });

  assert.ok(item, 'Stock item created successfully');

  // Disable INVENTORY module
  await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      disable: ['INVENTORY', 'RETAIL_POS', 'RESTAURANT']
    }
  });

  // Verify item document is NOT deleted and remains safely in database
  const itemInDb = await StockItem.findById(item._id);
  assert.ok(itemInDb, 'Item record must still exist in MongoDB after disabling INVENTORY module');
  assert.equal(itemInDb.item_code, `ITEM_TEST_${runId}`);
});

// ==========================================
// Test 9: Franchise Config Persistence
// ==========================================
test('9. Franchise Config Persistence: Configure 75/25 split with custom accounts, retrieve via API', async () => {
  const putRes = await makeRequest({
    method: 'PUT',
    path: `/api/v1/companies/${companySimple._id}/franchise-config`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      is_franchise: true,
      main_hub_party_id: mainHubParty._id.toString(),
      franchise_share_pct: 75,
      hub_share_pct: 25,
      income_account_code: '4200',
      payable_account_code: '2020',
      settlement_account_code: '1010'
    }
  });

  assert.equal(putRes.status, 200, `PUT franchise-config failed: ${JSON.stringify(putRes.body)}`);
  assert.equal(putRes.body.data.config.franchise_share_pct, 75);
  assert.equal(putRes.body.data.config.hub_share_pct, 25);
  assert.equal(putRes.body.data.is_franchise_module_enabled, true);

  // Retrieve via GET /api/v1/companies/:id/franchise-config
  const getRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/companies/${companySimple._id}/franchise-config`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    }
  });

  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.data.config.franchise_share_pct, 75);
  assert.equal(getRes.body.data.config.hub_share_pct, 25);
  assert.equal(getRes.body.data.config.main_hub_party?._id, mainHubParty._id.toString());
  assert.ok(getRes.body.data.accounts.income_account, 'Income account 4200 should be resolved');
  assert.ok(getRes.body.data.accounts.payable_account, 'Payable account 2020 should be resolved');
  assert.ok(getRes.body.data.accounts.settlement_account, 'Settlement account 1010 should be resolved');
});

// ==========================================
// Test 10: Franchise Config Validation
// ==========================================
test('10. Franchise Config Validation: Attempting split where percentages do not sum to 100% returns 400', async () => {
  const badRes = await makeRequest({
    method: 'PUT',
    path: `/api/v1/companies/${companySimple._id}/franchise-config`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      franchise_share_pct: 70,
      hub_share_pct: 40 // sum = 110%
    }
  });

  assert.equal(badRes.status, 400, 'Non-100% split must be rejected');
  assert.match(badRes.body.message || badRes.body.error?.message, /must sum to exactly 100%/i);
});

// ==========================================
// Test 11: Dynamic Commission Calculation
// ==========================================
test('11. Dynamic Commission Calculation: 75/25 split on ₹200 yields ₹150 Franchise & ₹50 Main Hub', async () => {
  const calc = commissionsService.calculateFranchiseCommission({
    transactionAmount: 200.00,
    franchiseSplitPct: 75,
    hubSplitPct: 25
  });

  assert.equal(calc.transaction_amount, '200.00');
  assert.equal(calc.franchise_amount, '150.00');
  assert.equal(calc.hub_amount, '50.00');
  assert.equal(calc.total_split, '200.00');
  assert.equal(calc.is_split_balanced, true);
});

// ==========================================
// Test 12: Multi-Company Isolation
// ==========================================
test('12. Company Isolation: Company A with Franchise ON does not affect Company B in same tenant', async () => {
  // Fetch Company Retail's franchise config
  const resB = await makeRequest({
    method: 'GET',
    path: `/api/v1/companies/${companyRetail._id}/franchise-config`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    }
  });

  assert.equal(resB.status, 200);
  assert.equal(resB.body.data.config.is_franchise, false);
  assert.equal(resB.body.data.config.main_hub_party_id, null);
  // Default values untouched
  assert.equal(resB.body.data.config.franchise_share_pct, 70);
  assert.equal(resB.body.data.config.hub_share_pct, 30);
});

// ==========================================
// Test 13: Navigation Payload
// ==========================================
test('13. Navigation Payload: Switch company returns enabled_modules for client dynamic rendering', async () => {
  const switchRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies/switch',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      company_id: companySimple._id.toString()
    }
  });

  assert.equal(switchRes.status, 200);
  assert.ok(switchRes.body.data.active_company.enabled_modules, 'active_company should include enabled_modules');
  assert.ok(Array.isArray(switchRes.body.data.active_company.enabled_modules));
});

// ==========================================
// Test 14: End-to-End Voucher to Reports
// ==========================================
test('14. End-to-End Commercial Voucher: Posts balanced JE, verifies Trial Balance debits = credits', async () => {
  const cashAcc = await LedgerAccount.findOne({ company_id: companySimple._id, account_code: '1001' });
  const salesAcc = await LedgerAccount.findOne({ company_id: companySimple._id, account_code: '4001' });

  assert.ok(cashAcc, 'Cash account 1001 should exist');
  assert.ok(salesAcc, 'Sales account 4001 should exist');

  const postRes = await postJournalEntry({
    tenantId: tenant._id,
    companyId: companySimple._id,
    userId: user._id,
    postingDate: new Date(),
    sourceModule: 'COMMERCIAL',
    referenceId: `INV_TEST_${runId}`,
    memo: 'Cash sale voucher for general accounting',
    lines: [
      {
        account_code: '1001',
        debit: 500,
        credit: 0,
        memo: 'Cash received'
      },
      {
        account_code: '4001',
        debit: 0,
        credit: 500,
        memo: 'Sales revenue recognized'
      }
    ]
  });

  assert.ok(postRes.journal, 'Journal should be posted');
  assert.equal(postRes.journal.status, 'POSTED');

  // Compute Trial Balance
  const tb = await computeTrialBalance({
    tenantId: tenant._id,
    companyId: companySimple._id
  });

  assert.equal(tb.is_balanced, true, 'Trial Balance must be in exact mathematical equilibrium');
  assert.equal(tb.difference, '0.00');
  assert.equal(tb.total_debits, tb.total_credits);
});

// ==========================================
// Test 15: Frontend Production Build
// ==========================================
test('15. Frontend Production Build: Validates dist bundle assets exist without bundler errors', async () => {
  const fs = require('fs');
  const path = require('path');
  const distIndex = path.resolve(__dirname, '../../frontend/dist/index.html');
  assert.ok(fs.existsSync(distIndex), 'frontend/dist/index.html should exist from production build');
});

// ==========================================
// Test 16: Core General Accounting Experience (P&L, Balance Sheet, Contra Voucher)
// ==========================================
test('16. Core General Accounting: P&L, Balance Sheet, and Contra Vouchers work without optional modules', async () => {
  // 1. Post a Cash/Bank Contra Voucher (source_module: 'BANKING_CASH')
  const contraPost = await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/journals',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companySimple._id.toString()
    },
    body: {
      posting_date: new Date().toISOString().slice(0, 10),
      source_module: 'BANKING_CASH',
      reference_id: `CONTRA_${runId}`,
      memo: 'Cash deposit into operating bank account (Contra Voucher)',
      lines: [
        { account_code: '1002', debit: '1500.00', credit: '0.00', memo: 'Bank debit' },
        { account_code: '1001', debit: '0.00', credit: '1500.00', memo: 'Cash credit' }
      ]
    }
  });

  assert.equal(contraPost.status, 201, `Contra journal posting failed: ${JSON.stringify(contraPost.body)}`);
  assert.equal(contraPost.body.data.journal.status, 'POSTED');
  assert.equal(contraPost.body.data.journal.source_module, 'BANKING_CASH');

  // 2. Fetch Trial Balance from core GL endpoint
  const tbRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/trial-balance',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companySimple._id.toString()
    }
  });

  assert.equal(tbRes.status, 200, 'Trial balance must be reachable on core GL router');
  assert.equal(tbRes.body.data.is_balanced, true);

  // 3. Fetch Financial Statements (P&L and Balance Sheet) from core GL endpoint
  const stmtRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/financial-statements',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companySimple._id.toString()
    }
  });

  assert.equal(stmtRes.status, 200, `Financial statements failed: ${JSON.stringify(stmtRes.body)}`);
  const { balanceSheet, incomeStatement } = stmtRes.body.data;

  assert.ok(balanceSheet, 'Balance sheet must exist');
  assert.ok(incomeStatement, 'Income statement (P&L) must exist');
  assert.equal(balanceSheet.is_balanced, true, 'Balance sheet must maintain exact assets == liabilities + equity equilibrium');
  assert.ok(Array.isArray(balanceSheet.assets), 'Assets array must exist');
  assert.ok(Array.isArray(incomeStatement.revenue), 'Revenue array must exist');
});

// ==========================================
// Test 17: Route Protection for Optional Modules
// ==========================================
test('17. Optional Route Protection: Disabled optional modules return 403 MODULE_DISABLED for simple company', async () => {
  const compHeaders = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': tenant._id.toString(),
    'x-company-id': companySimple._id.toString()
  };

  // 1. Commercial Documents (COMMERCIAL_BILLING)
  const commRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/commercial/documents',
    headers: compHeaders
  });
  assert.equal(commRes.status, 403, 'Commercial route should be blocked when COMMERCIAL_BILLING is disabled');
  assert.equal(commRes.body.error?.details?.code, 'MODULE_DISABLED');
  assert.equal(commRes.body.error?.details?.required_module, 'COMMERCIAL_BILLING');

  // 2. Accounting Dimensions (DIMENSIONS)
  const dimRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/dimensions',
    headers: compHeaders
  });
  assert.equal(dimRes.status, 403, 'Dimensions route should be blocked when DIMENSIONS is disabled');
  assert.equal(dimRes.body.error?.details?.code, 'MODULE_DISABLED');
  assert.equal(dimRes.body.error?.details?.required_module, 'DIMENSIONS');

  // 3. Finance Close (FINANCE_CLOSE)
  const closeRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/close/checklist',
    headers: compHeaders
  });
  assert.equal(closeRes.status, 403, 'Finance close checklist should be blocked when FINANCE_CLOSE is disabled');
  assert.equal(closeRes.body.error?.details?.code, 'MODULE_DISABLED');
  assert.equal(closeRes.body.error?.details?.required_module, 'FINANCE_CLOSE');

  // 4. Posting Rules Engine (RULES_ENGINE)
  const rulesRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/rules',
    headers: compHeaders
  });
  assert.equal(rulesRes.status, 403, 'Rules engine should be blocked when RULES_ENGINE is disabled');
  assert.equal(rulesRes.body.error?.details?.code, 'MODULE_DISABLED');
  assert.equal(rulesRes.body.error?.details?.required_module, 'RULES_ENGINE');

  // 5. Franchise Commissions (FRANCHISE_COMMISSIONS disabled on companyRetail)
  const commsRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/commissions/overview',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companyRetail._id.toString()
    }
  });
  assert.equal(commsRes.status, 403, 'Commissions should be blocked when FRANCHISE_COMMISSIONS is disabled');
  assert.equal(commsRes.body.error?.details?.code, 'MODULE_DISABLED');
  assert.equal(commsRes.body.error?.details?.required_module, 'FRANCHISE_COMMISSIONS');
});

// ==========================================
// Test 18: Enable Optional Module & Allowance
// ==========================================
test('18. Module Enabling & Allowance: Enabling COMMERCIAL_BILLING unlocks commercial endpoints with 200 OK', async () => {
  // 1. Enable COMMERCIAL_BILLING on companySimple
  const patchRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      enable: ['COMMERCIAL_BILLING']
    }
  });

  assert.equal(patchRes.status, 200);
  assert.ok(patchRes.body.data.enabled_modules.includes('COMMERCIAL_BILLING'));

  // 2. Commercial route now succeeds
  const commRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/commercial/documents',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companySimple._id.toString()
    }
  });

  assert.equal(commRes.status, 200, 'Commercial route should return 200 OK after enabling COMMERCIAL_BILLING');
  assert.ok(Array.isArray(commRes.body.data.documents));
});

// ==========================================
// Test 19: Cascading Disable & Pruning
// ==========================================
test('19. Cascading Disable: Disabling INVENTORY when RETAIL_POS is active disables both without resurrecting INVENTORY', async () => {
  // 1. Ensure RETAIL_POS and INVENTORY are both enabled on companySimple
  const enableRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      enable: ['RETAIL_POS', 'INVENTORY']
    }
  });

  assert.equal(enableRes.status, 200);
  assert.ok(enableRes.body.data.enabled_modules.includes('RETAIL_POS'));
  assert.ok(enableRes.body.data.enabled_modules.includes('INVENTORY'));

  // 2. Disable INVENTORY individually via toggle (is_enabled: false)
  const disableRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      module_code: 'INVENTORY',
      is_enabled: false,
      auto_resolve_dependencies: false
    }
  });

  assert.equal(disableRes.status, 200, `Disable should succeed: ${JSON.stringify(disableRes.body)}`);
  assert.equal(disableRes.body.data.enabled_modules.includes('INVENTORY'), false, 'INVENTORY must be disabled');
  assert.equal(disableRes.body.data.enabled_modules.includes('RETAIL_POS'), false, 'RETAIL_POS must be cascaded and disabled');
  assert.ok(disableRes.body.data.cascaded_disabled.includes('RETAIL_POS'), 'cascaded_disabled should list RETAIL_POS');
});

// ==========================================
// Test 20: 1-Click Clean General Accounting Reset
// ==========================================
test('20. 1-Click Reset: Applying GENERAL_ACCOUNTING preset disables all optional modules cleanly', async () => {
  // 1. Enable multiple optional modules on companySimple
  await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      enable: ['INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RULES_ENGINE']
    }
  });

  // 2. Apply GENERAL_ACCOUNTING preset
  const resetRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      template_id: 'GENERAL_ACCOUNTING'
    }
  });

  assert.equal(resetRes.status, 200);
  const coreOnly = ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS'].sort();
  assert.deepEqual(resetRes.body.data.enabled_modules.sort(), coreOnly, 'Only core general accounting modules must remain');
  assert.equal(resetRes.body.data.enabled_modules.includes('INVENTORY'), false);
  assert.equal(resetRes.body.data.enabled_modules.includes('COMMERCIAL_BILLING'), false);
  assert.equal(resetRes.body.data.enabled_modules.includes('GST_TAX'), false);
  assert.equal(resetRes.body.data.enabled_modules.includes('RULES_ENGINE'), false);
});

// ==========================================
// Test 21: Preset Replacement Semantics
// ==========================================
test('21. Preset Replacement: Applying RESTAURANT_CAFE after RETAIL_TRADING replaces RETAIL_POS with RESTAURANT without module accumulation', async () => {
  // 1. Apply RETAIL_TRADING preset
  const retailRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      template_id: 'RETAIL_TRADING'
    }
  });

  assert.equal(retailRes.status, 200);
  assert.ok(retailRes.body.data.enabled_modules.includes('RETAIL_POS'), 'RETAIL_POS must be enabled in Retail preset');
  assert.equal(retailRes.body.data.enabled_modules.includes('RESTAURANT'), false, 'RESTAURANT should not be enabled yet');

  // 2. Apply RESTAURANT_CAFE preset (replaces configuration)
  const restaurantRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      template_id: 'RESTAURANT_CAFE'
    }
  });

  assert.equal(restaurantRes.status, 200);
  assert.ok(restaurantRes.body.data.enabled_modules.includes('RESTAURANT'), 'RESTAURANT must now be enabled');
  assert.equal(
    restaurantRes.body.data.enabled_modules.includes('RETAIL_POS'),
    false,
    'RETAIL_POS must be cleanly replaced and NOT accumulated'
  );
  // Shared dependencies like INVENTORY and COMMERCIAL_BILLING are preserved
  assert.ok(restaurantRes.body.data.enabled_modules.includes('INVENTORY'));
  assert.ok(restaurantRes.body.data.enabled_modules.includes('COMMERCIAL_BILLING'));
});

// ==========================================
// Test 22: Integrity & State Retention on Failed / Cancelled Updates
// ==========================================
test('22. State Retention: Invalid or rejected module update attempts leave existing database configuration unchanged', async () => {
  // 1. Capture current enabled modules
  const beforeRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    }
  });
  assert.equal(beforeRes.status, 200);
  const beforeModules = [...beforeRes.body.data.enabled_modules].sort();

  // 2. Attempt illegal action: disabling a core module (GL)
  const failRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      module_code: 'GL',
      is_enabled: false
    }
  });
  assert.equal(failRes.status, 400, 'Attempt to disable core GL must return 400 Bad Request');

  // 3. Verify database configuration is completely untouched
  const afterRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    }
  });
  assert.equal(afterRes.status, 200);
  assert.deepEqual(afterRes.body.data.enabled_modules.sort(), beforeModules, 'Configuration must remain unchanged');
});

// ==========================================
// Test 23: Toggle Cycle & Profile Refresh Persistence
// ==========================================
test('23. Toggle Cycle: Enabling and disabling an optional module via individual switch persists across getMe and session refresh', async () => {
  // 1. Clean reset to core
  await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      template_id: 'GENERAL_ACCOUNTING'
    }
  });

  // 2. Enable COMMERCIAL_BILLING via switch (is_enabled: true)
  const enableSwitchRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      module_code: 'COMMERCIAL_BILLING',
      is_enabled: true
    }
  });
  assert.equal(enableSwitchRes.status, 200);
  assert.ok(enableSwitchRes.body.data.enabled_modules.includes('COMMERCIAL_BILLING'));

  // 3. Verify getMe (session refresh) reflects COMMERCIAL_BILLING
  const meRes1 = await makeRequest({
    method: 'GET',
    path: '/api/v1/auth/me',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companySimple._id.toString()
    }
  });
  assert.equal(meRes1.status, 200);
  assert.ok(meRes1.body.data.current_company.enabled_modules.includes('COMMERCIAL_BILLING'));

  // 4. Disable COMMERCIAL_BILLING via switch (is_enabled: false)
  const disableSwitchRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/companies/${companySimple._id}/modules`,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString()
    },
    body: {
      module_code: 'COMMERCIAL_BILLING',
      is_enabled: false
    }
  });
  assert.equal(disableSwitchRes.status, 200);
  assert.equal(disableSwitchRes.body.data.enabled_modules.includes('COMMERCIAL_BILLING'), false);

  // 5. Verify getMe reflects the disabled state after refresh
  const meRes2 = await makeRequest({
    method: 'GET',
    path: '/api/v1/auth/me',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenant._id.toString(),
      'x-company-id': companySimple._id.toString()
    }
  });
  assert.equal(meRes2.status, 200);
  assert.equal(meRes2.body.data.current_company.enabled_modules.includes('COMMERCIAL_BILLING'), false);
});


