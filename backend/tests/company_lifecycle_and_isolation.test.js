process.env.PORT = '5055';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');

const { startServer } = require('../src/server');
const {
  Tenant,
  User,
  Role,
  UserRole,
  Company,
  CompanyMembership,
  LedgerAccount,
  FiscalPeriod,
  Journal,
  JournalEntry
} = require('../src/models');

const { initializeCompany } = require('../src/services/companyInitService');
const { runCompanyMigration } = require('../src/utils/companyMigrationTool');
const { postJournalEntry, computeTrialBalance } = require('../src/services/journalPostingService');

let serverInstance = null;
const PORT = 5055;

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

// Global fixtures across test suite
const runId = Math.floor(Date.now() % 100000);
let tenantA = null;
let tokenA = null;
let userA = null;
let companyAMain = null;
let companyARetail = null;

let tenantB = null;
let tokenB = null;
let userB = null;
let companyBMain = null;

let restrictedUserToken = null;
let restrictedUserId = null;

// =========================================================================
// Setup and Teardown
// =========================================================================
test.before(async () => {
  const result = await startServer();
  serverInstance = result.server;
});

test.after(async () => {
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// =========================================================================
// 1. Company Lifecycle & Auto-Provisioning
// =========================================================================
test('Lifecycle: Registering Tenant A auto-creates primary company MAIN with COA and Admin membership', async () => {
  const regRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TALLY_A_${runId}`,
      tenant_name: `Tally Test Tenant A ${runId}`,
      tenant_type: 'MGA',
      base_currency: 'USD',
      admin_email: `owner_a_${runId}@tallytest.com`,
      admin_password: 'TestPassword2026!#',
      admin_first_name: 'Owner',
      admin_last_name: 'Alpha'
    }
  });

  assert.strictEqual(regRes.status, 201, `Tenant registration failed: ${JSON.stringify(regRes.body)}`);
  assert.strictEqual(regRes.body.success, true);
  tokenA = regRes.body.data.token;
  userA = regRes.body.data.user;
  tenantA = regRes.body.data.tenant;

  // Verify Company MAIN was created in MongoDB
  companyAMain = await Company.findOne({ tenant_id: tenantA.id, company_code: 'MAIN' });
  assert.ok(companyAMain, 'Primary company MAIN must be auto-created for new tenant');
  assert.strictEqual(companyAMain.status, 'ACTIVE');
  assert.strictEqual(companyAMain.business_profile, 'GENERAL_RETAIL');

  // Verify Creator has ACTIVE membership
  const membership = await CompanyMembership.findOne({
    tenant_id: tenantA.id,
    company_id: companyAMain._id,
    user_id: userA.id
  });
  assert.ok(membership, 'Creator must be added to CompanyMembership');
  assert.strictEqual(membership.status, 'ACTIVE');

  // Verify Creator has TENANT_ADMIN role
  const userRole = await UserRole.findOne({
    tenant_id: tenantA.id,
    user_id: userA.id
  }).populate('role_id');
  assert.ok(userRole, 'User role assignment must exist');
  assert.strictEqual(userRole.role_id.code, 'TENANT_ADMIN');

  // Verify Standard Chart of Accounts seeded for MAIN
  const coaCount = await LedgerAccount.countDocuments({
    tenant_id: tenantA.id,
    company_id: companyAMain._id
  });
  assert.ok(coaCount >= 10, `Chart of accounts must have at least 10 seeded accounts, found ${coaCount}`);

  // Verify Fiscal Periods seeded
  const periodCount = await FiscalPeriod.countDocuments({
    tenant_id: tenantA.id,
    company_id: companyAMain._id
  });
  assert.strictEqual(periodCount, 12, `Must seed 12 monthly fiscal periods, found ${periodCount}`);
});

test('Lifecycle: Creating secondary company RET01 under Tenant A succeeds with independent COA', async () => {
  const createRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA.id
    },
    body: {
      company_code: 'RET01',
      company_name: 'Alpha Downtown Retail',
      legal_name: 'Alpha Downtown Retail Enterprises LLC',
      business_profile: 'HARDWARE',
      base_currency: 'USD',
      financial_year_start_month: 4
    }
  });

  assert.strictEqual(createRes.status, 201, `Failed to create company: ${JSON.stringify(createRes.body)}`);
  assert.strictEqual(createRes.body.success, true);
  companyARetail = createRes.body.data.company;

  assert.strictEqual(companyARetail.company_code, 'RET01');
  assert.strictEqual(companyARetail.business_profile, 'HARDWARE');

  // Verify independent COA for RET01
  const retailCoa = await LedgerAccount.countDocuments({
    tenant_id: tenantA.id,
    company_id: companyARetail._id || companyARetail.id
  });
  assert.ok(retailCoa >= 10, `Retail company must have independent seeded COA, found ${retailCoa}`);
});

test('Lifecycle: Reject duplicate company_code within the same tenant', async () => {
  const dupRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA.id
    },
    body: {
      company_code: 'RET01', // duplicate code in Tenant A
      company_name: 'Duplicate Retail Entity',
      business_profile: 'GENERAL_RETAIL'
    }
  });

  assert.strictEqual(dupRes.status, 409, `Expected 409 Conflict for duplicate company_code, got ${dupRes.status}`);
  assert.strictEqual(dupRes.body.success, false);
});

test('Lifecycle: Allow identical company_code across different tenants', async () => {
  // Register Tenant B
  const regBRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TALLY_B_${runId}`,
      tenant_name: `Tally Test Tenant B ${runId}`,
      tenant_type: 'MGA',
      base_currency: 'EUR',
      admin_email: `owner_b_${runId}@tallytest.com`,
      admin_password: 'TestPassword2026!#',
      admin_first_name: 'Owner',
      admin_last_name: 'Beta'
    }
  });

  assert.strictEqual(regBRes.status, 201);
  tokenB = regBRes.body.data.token;
  userB = regBRes.body.data.user;
  tenantB = regBRes.body.data.tenant;
  companyBMain = await Company.findOne({ tenant_id: tenantB.id, company_code: 'MAIN' });

  // Tenant B creates company with same code 'RET01'
  const createBRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'x-tenant-id': tenantB.id
    },
    body: {
      company_code: 'RET01', // Same code as in Tenant A, but in Tenant B
      company_name: 'Beta Downtown Retail',
      business_profile: 'GROCERY',
      base_currency: 'EUR',
      financial_year_start_month: 1
    }
  });

  assert.strictEqual(createBRes.status, 201, `Tenant B should be able to create RET01: ${JSON.stringify(createBRes.body)}`);
  assert.strictEqual(createBRes.body.data.company.company_code, 'RET01');
});

test('Lifecycle: initializeCompany idempotency check', async () => {
  // Re-running initialization on existing company should be safe and idempotent
  const initResult = await initializeCompany({
    tenantId: tenantA.id,
    creatorUserId: userA.id,
    companyCode: 'MAIN',
    companyName: 'Updated Name',
    businessProfile: 'GENERAL_RETAIL'
  });

  assert.strictEqual(initResult.is_new, false, 'Expected is_new flag to be false for existing company');
  assert.strictEqual(initResult.company._id.toString(), companyAMain._id.toString());
});

// =========================================================================
// 2. Company Isolation & Zero-Backdoor Security Tests
// =========================================================================
test('Isolation: User is forbidden from sending x-company-id of a company they are not a member of', async () => {
  // Create a restricted staff user in Tenant A who is ONLY a member of company MAIN
  const inviteRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/tenant/users/invite',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA.id
    },
    body: {
      email: `staff_only_main_${runId}@tallytest.com`,
      first_name: 'Staff',
      last_name: 'MainOnly',
      role: 'ACCOUNTANT'
    }
  });

  assert.strictEqual(inviteRes.status, 201);
  restrictedUserId = inviteRes.body.data.user.id;

  // Set password for restricted user
  const dbUser = await User.findById(restrictedUserId);
  dbUser.password_hash = require('../src/utils/crypto').hashPassword('StaffSecret2026!#');
  await dbUser.save();

  // Ensure restricted user only has membership in MAIN
  await CompanyMembership.deleteMany({
    tenant_id: tenantA.id,
    user_id: restrictedUserId
  });
  await CompanyMembership.create({
    tenant_id: tenantA.id,
    company_id: companyAMain._id,
    user_id: restrictedUserId,
    role: 'STAFF',
    status: 'ACTIVE'
  });

  // Login as restricted user
  const loginRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: `staff_only_main_${runId}@tallytest.com`,
      password: 'StaffSecret2026!#'
    }
  });
  assert.strictEqual(loginRes.status, 200);
  restrictedUserToken = loginRes.body.data.token;

  // Attempt header tampering: Restricted user requests Company RET01 accounts
  const retailId = companyARetail._id || companyARetail.id;
  const tamperRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: {
      Authorization: `Bearer ${restrictedUserToken}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': retailId.toString()
    }
  });

  assert.strictEqual(tamperRes.status, 403, `Must reject header tampering with 403 Forbidden, got ${tamperRes.status}`);
  assert.strictEqual(tamperRes.body.success, false);
});

test('Isolation: Cross-tenant tampering - Request with x-company-id of Tenant B rejected', async () => {
  const crossTenantCompanyId = companyBMain._id.toString();

  const crossRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': crossTenantCompanyId // Belongs to Tenant B!
    }
  });

  assert.strictEqual(crossRes.status, 403, `Cross-tenant company access must be rejected with 403, got ${crossRes.status}`);
  assert.strictEqual(crossRes.body.success, false);
});

test('Isolation: Account scoping - Company A queries return only Company A accounts', async () => {
  // Query with Company MAIN header
  const resMain = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': companyAMain._id.toString()
    }
  });

  assert.strictEqual(resMain.status, 200);
  const accountsMain = resMain.body.data;
  assert.ok(Array.isArray(accountsMain));
  assert.ok(accountsMain.length > 0);
  for (const acc of accountsMain) {
    assert.strictEqual(acc.company_id.toString(), companyAMain._id.toString(), 'All returned accounts must belong to MAIN');
  }

  // Query with Company RET01 header
  const retailId = (companyARetail._id || companyARetail.id).toString();
  const resRetail = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': retailId
    }
  });

  assert.strictEqual(resRetail.status, 200);
  const accountsRetail = resRetail.body.data;
  assert.ok(Array.isArray(accountsRetail));
  assert.ok(accountsRetail.length > 0);
  for (const acc of accountsRetail) {
    assert.strictEqual(acc.company_id.toString(), retailId, 'All returned accounts must belong to RET01');
  }
});

test('Isolation: Direct record tampering - Attempting to view Company B account with Company A context fails', async () => {
  // Find an account belonging to Company RET01
  const retailId = companyARetail._id || companyARetail.id;
  const retailAccount = await LedgerAccount.findOne({
    tenant_id: tenantA.id,
    company_id: retailId
  });
  assert.ok(retailAccount);

  // Restricted user (who only has access to MAIN) attempts to fetch this account by ID
  const directFetchRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/gl/accounts/${retailAccount._id}`,
    headers: {
      Authorization: `Bearer ${restrictedUserToken}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': companyAMain._id.toString()
    }
  });

  assert.ok(
    directFetchRes.status === 404 || directFetchRes.status === 403,
    `Direct tampering must yield 404 or 403, received ${directFetchRes.status}`
  );
});

test('Security: Zero-Backdoor - Platform admin cannot bypass financial company isolation', async () => {
  // Create platform admin user
  const platformAdmin = await User.create({
    email: `platform_admin_${runId}@veridexplatform.com`,
    password_hash: require('../src/utils/crypto').hashPassword('AdminMaster2026!#'),
    first_name: 'Platform',
    last_name: 'Admin',
    is_platform_admin: true,
    status: 'ACTIVE'
  });

  const platformToken = require('../src/middleware/authMiddleware').generateToken({
    userId: platformAdmin._id.toString(),
    email: platformAdmin.email,
    tenantId: tenantA.id
  });

  // Platform admin attempts to access Company RET01 GL accounts without company membership or tenant admin assignment
  const retailId = (companyARetail._id || companyARetail.id).toString();
  const bypassRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: {
      Authorization: `Bearer ${platformToken}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': retailId
    }
  });

  assert.strictEqual(bypassRes.status, 403, `Zero-Backdoor: Platform admin must not bypass financial scoping, got ${bypassRes.status}`);
});

// =========================================================================
// 3. RBAC & Company Access Revocation Tests
// =========================================================================
test('RBAC: User lacking COMPANY:CREATE permission cannot create a company', async () => {
  const unauthorizedCreate = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies',
    headers: {
      Authorization: `Bearer ${restrictedUserToken}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': companyAMain._id.toString()
    },
    body: {
      company_code: 'UNAUTH',
      company_name: 'Unauthorized Company'
    }
  });

  assert.strictEqual(unauthorizedCreate.status, 403, `Expected 403 Forbidden, received ${unauthorizedCreate.status}`);
});

test('RBAC: Revoking company membership terminates access to company-scoped endpoints immediately', async () => {
  // Temporarily grant restricted user access to RET01
  const retailId = companyARetail._id || companyARetail.id;
  const tempMembership = await CompanyMembership.create({
    tenant_id: tenantA.id,
    company_id: retailId,
    user_id: restrictedUserId,
    role: 'STAFF',
    status: 'ACTIVE'
  });

  // Check access works
  const accessBefore = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: {
      Authorization: `Bearer ${restrictedUserToken}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': retailId.toString()
    }
  });
  assert.strictEqual(accessBefore.status, 200);

  // Revoke membership (set status SUSPENDED)
  tempMembership.status = 'SUSPENDED';
  await tempMembership.save();

  // Subsequent request must be rejected with 403
  const accessAfter = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/accounts',
    headers: {
      Authorization: `Bearer ${restrictedUserToken}`,
      'x-tenant-id': tenantA.id,
      'x-company-id': retailId.toString()
    }
  });
  assert.strictEqual(accessAfter.status, 403, `Revoked member must receive 403 Forbidden, got ${accessAfter.status}`);
});

// =========================================================================
// 4. Double-Entry Accounting Engine & Trial Balance Per Company
// =========================================================================
test('Accounting Engine: Post double-entry journal in Company MAIN', async () => {
  const period = await FiscalPeriod.findOne({ tenant_id: tenantA.id, company_id: companyAMain._id, status: 'OPEN' });
  assert.ok(period, 'Open fiscal period must exist in MAIN');

  const postRes = await postJournalEntry({
    tenantId: tenantA.id,
    companyId: companyAMain._id,
    userId: userA.id,
    postingDate: period.start_date,
    sourceModule: 'GL_MANUAL',
    referenceId: `JV-MAIN-${runId}`,
    memo: 'Initial Cash Sale in MAIN',
    lines: [
      { account_code: '1001', debit: 1500, credit: 0, memo: 'Cash received' },
      { account_code: '4001', debit: 0, credit: 1500, memo: 'Revenue recognized' }
    ]
  });

  assert.ok(postRes && postRes.journal, 'Journal entry should be created');
  assert.strictEqual(postRes.journal.status, 'POSTED');
  assert.strictEqual(parseFloat(postRes.journal.total_debit.toString()), 1500);
  assert.strictEqual(parseFloat(postRes.journal.total_credit.toString()), 1500);
  assert.strictEqual(postRes.journal.company_id.toString(), companyAMain._id.toString());
});

test('Accounting Engine: Reject unbalanced journal entry (Debits != Credits)', async () => {
  const period = await FiscalPeriod.findOne({ tenant_id: tenantA.id, company_id: companyAMain._id, status: 'OPEN' });

  await assert.rejects(
    async () => {
      await postJournalEntry({
        tenantId: tenantA.id,
        companyId: companyAMain._id,
        userId: userA.id,
        postingDate: period.start_date,
        sourceModule: 'GL_MANUAL',
        referenceId: `JV-UNBAL-${runId}`,
        memo: 'Unbalanced journal',
        lines: [
          { account_code: '1001', debit: 1500, credit: 0, memo: 'Debit' },
          { account_code: '4001', debit: 0, credit: 1200, memo: 'Credit mismatch' }
        ]
      });
    },
    /Double-entry imbalance/,
    'Unbalanced journal must be rejected with Double-entry imbalance'
  );
});

test('Accounting Engine: Reject posting to closed/locked fiscal period', async () => {
  const targetPeriod = await FiscalPeriod.findOne({
    tenant_id: tenantA.id,
    company_id: companyAMain._id,
    status: 'OPEN'
  });
  assert.ok(targetPeriod);
  targetPeriod.status = 'LOCKED';
  await targetPeriod.save();

  await assert.rejects(
    async () => {
      await postJournalEntry({
        tenantId: tenantA.id,
        companyId: companyAMain._id,
        userId: userA.id,
        postingDate: targetPeriod.start_date,
        sourceModule: 'GL_MANUAL',
        referenceId: `JV-LOCKED-${runId}`,
        memo: 'Posting to locked period',
        lines: [
          { account_code: '1001', debit: 200, credit: 0, memo: 'Debit' },
          { account_code: '4001', debit: 0, credit: 200, memo: 'Credit' }
        ]
      });
    },
    /is LOCKED/,
    'Posting to locked period must be rejected'
  );

  // Re-open period for subsequent operations
  targetPeriod.status = 'OPEN';
  await targetPeriod.save();
});

test('Accounting Engine: Cross-company trial balance isolation', async () => {
  const retailId = companyARetail._id || companyARetail.id;
  const retPeriod = await FiscalPeriod.findOne({ tenant_id: tenantA.id, company_id: retailId, status: 'OPEN' });
  assert.ok(retPeriod);

  await postJournalEntry({
    tenantId: tenantA.id,
    companyId: retailId,
    userId: userA.id,
    postingDate: retPeriod.start_date,
    sourceModule: 'GL_MANUAL',
    referenceId: `JV-RET-${runId}`,
    memo: 'Cash Sale in RET01',
    lines: [
      { account_code: '1001', debit: 4500, credit: 0, memo: 'Debit cash' },
      { account_code: '4001', debit: 0, credit: 4500, memo: 'Credit sales' }
    ]
  });

  // Compute Trial Balance for Company MAIN
  const tbMain = await computeTrialBalance({
    tenantId: tenantA.id,
    companyId: companyAMain._id
  });

  // Verify Trial Balance for MAIN has Cash debit of exactly 1500, NOT 1500 + 4500
  const mainCashRow = tbMain.accounts.find((a) => a.account_code === '1001');
  assert.ok(mainCashRow, 'Cash account must appear in MAIN trial balance');
  assert.strictEqual(parseFloat(mainCashRow.debit), 1500, 'Company MAIN cash debit must be strictly 1,500');

  // Compute Trial Balance for Company RET01
  const tbRetail = await computeTrialBalance({
    tenantId: tenantA.id,
    companyId: retailId
  });

  // Verify Trial Balance for RET01 has Cash debit of exactly 4500
  const retCashRow = tbRetail.accounts.find((a) => a.account_code === '1001');
  assert.ok(retCashRow, 'Cash account must appear in RET01 trial balance');
  assert.strictEqual(parseFloat(retCashRow.debit), 4500, 'Company RET01 cash debit must be strictly 4,500');

  // Both trial balances must balance internally
  assert.strictEqual(parseFloat(tbMain.total_debits), parseFloat(tbMain.total_credits));
  assert.strictEqual(parseFloat(tbRetail.total_debits), parseFloat(tbRetail.total_credits));
});

// =========================================================================
// 5. Migration Tool Dry-Run & Safety Guards
// =========================================================================
test('Migration Tool: Dry-run mode produces reports without mutating database records', async () => {
  const dryReport = await runCompanyMigration({ apply: false, tenantId: tenantA.id });

  assert.strictEqual(dryReport.mode, 'DRY_RUN');
  assert.strictEqual(dryReport.total_records_updated, 0, 'Dry-run must not backfill or mutate any records');
  assert.ok(dryReport.tenants.length >= 1);
});

test('Migration Tool: Apply mode is blocked when ENABLE_MIGRATION_APPLY is not set', async () => {
  delete process.env.ENABLE_MIGRATION_APPLY;

  await assert.rejects(
    async () => {
      await runCompanyMigration({ apply: true, tenantId: tenantA.id });
    },
    /MIGRATION_APPLY_BLOCKED/,
    'Apply mode must be blocked without ENABLE_MIGRATION_APPLY=true'
  );
});
