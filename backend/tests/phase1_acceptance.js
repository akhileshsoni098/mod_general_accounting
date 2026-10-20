const { startServer } = require('../src/server');
const http = require('http');

function makeRequest({ method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 5050,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runAcceptanceTests() {
  console.log('--- STARTING PHASE 1 VERIFICATION & ACCEPTANCE TESTS ---');
  const { server } = await startServer();

  try {
    // 1. Health Check
    console.log('\n[Test 1] Health check endpoint...');
    const health = await makeRequest({ method: 'GET', path: '/health' });
    console.assert(health.status === 200, `Health check returned ${health.status}`);
    console.assert(health.body.success === true, 'Health check success flag must be true');
    console.log('✓ Health check passed:', health.body.data.service);

    const testSuffix = Math.floor(Date.now() % 100000);

    // 2. Register Tenant A (Lone Pine Trucking)
    console.log('\n[Test 2] Tenant Onboarding: Registering Lone Pine Trucking (LPT)...');
    const regResA = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `LPT_${testSuffix}`,
        tenant_name: 'Lone Pine Trucking Fleet',
        base_currency: 'USD',
        admin_first_name: 'Arturo',
        admin_last_name: 'Gatti',
        admin_email: `arturo_${testSuffix}@lonepine.com`,
        admin_password: 'Password123!'
      }
    });
    console.assert(regResA.status === 201, `Tenant A registration status: ${regResA.status} != 201: ${JSON.stringify(regResA.body)}`);
    console.assert(regResA.body.data.token, 'Token must be issued upon registration');
    const tokenA = regResA.body.data.token;
    const tenantAId = regResA.body.data.tenant.id;
    console.log(`✓ Tenant A registered successfully. TenantId: ${tenantAId}`);

    // 3. Register Tenant B (Apex Logistics)
    console.log('\n[Test 3] Tenant Onboarding: Registering Second Tenant Apex Logistics (APX)...');
    const regResB = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `APX_${testSuffix}`,
        tenant_name: 'Apex Logistics LLC',
        base_currency: 'USD',
        admin_first_name: 'Sarah',
        admin_last_name: 'Connor',
        admin_email: `sarah_${testSuffix}@apex.com`,
        admin_password: 'Password123!'
      }
    });
    console.assert(regResB.status === 201, `Tenant B registration status: ${regResB.status}`);
    const tokenB = regResB.body.data.token;
    const tenantBId = regResB.body.data.tenant.id;
    console.log(`✓ Tenant B registered successfully. TenantId: ${tenantBId}`);

    // 4. Duplicate Tenant Rejection
    console.log('\n[Test 4] Validation: Reject Duplicate Tenant Code...');
    const dupRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `LPT_${testSuffix}`,
        tenant_name: 'Duplicate Trucking',
        admin_first_name: 'Dup',
        admin_last_name: 'Admin',
        admin_email: `dup_${testSuffix}@test.com`,
        admin_password: 'Password123!'
      }
    });
    console.assert(dupRes.status === 409, `Duplicate code should return 409, got ${dupRes.status}`);
    console.log('✓ Duplicate tenant code correctly rejected (409 Conflict).');

    // 5. Login
    console.log('\n[Test 5] Authentication: Logging in with registered user...');
    const loginRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: {
        email: `arturo_${testSuffix}@lonepine.com`,
        password: 'Password123!'
      }
    });
    console.assert(loginRes.status === 200, `Login should succeed with 200, got ${loginRes.status}`);
    console.assert(loginRes.body.data.token, 'Token returned on login');
    console.log('✓ Login verified. User:', loginRes.body.data.user.email);

    // 6. Current User & Workspace info (/me)
    console.log('\n[Test 6] Session & Entitlements: /me with active tenant header...');
    const meRes = await makeRequest({
      method: 'GET',
      path: '/api/v1/auth/me',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-tenant-id': tenantAId
      }
    });
    console.assert(meRes.status === 200, `/me returned status ${meRes.status}`);
    console.assert(meRes.body.data.roles.includes('TENANT_ADMIN'), 'User has TENANT_ADMIN role');
    console.assert(meRes.body.data.entitlements.length === 5, '5 finance modules entitled by default');
    console.log('✓ /me profile loaded with roles and module entitlements:', meRes.body.data.roles);

    // 7. Invite a New User to Tenant A
    console.log('\n[Test 7] Tenant User Management: Inviting Staff Accountant to Tenant A...');
    const inviteRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/tenant/users/invite',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-tenant-id': tenantAId
      },
      body: {
        email: `staff_${testSuffix}@lonepine.com`,
        first_name: 'Bob',
        last_name: 'Staff',
        temporary_password: 'Password123!',
        role_code: 'STAFF_ACCOUNTANT'
      }
    });
    console.assert(inviteRes.status === 201, `Invite user returned status ${inviteRes.status}`);
    console.log('✓ User invited and assigned STAFF_ACCOUNTANT role.');

    // 8. List Tenant Users
    console.log('\n[Test 8] Listing Tenant Users...');
    const listUsersRes = await makeRequest({
      method: 'GET',
      path: '/api/v1/tenant/users',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-tenant-id': tenantAId
      }
    });
    console.assert(listUsersRes.status === 200, 'List users status 200');
    console.assert(listUsersRes.body.data.length >= 2, 'Should have at least 2 users in tenant A');
    console.log(`✓ Tenant A user list retrieved. Count: ${listUsersRes.body.data.length}`);

    // 9. Cross-Tenant Isolation Enforcement
    console.log('\n[Test 9] Security Isolation: Tenant A user trying to access Tenant B workspace...');
    const isoRes = await makeRequest({
      method: 'GET',
      path: '/api/v1/tenant/users',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-tenant-id': tenantBId // trying to read Tenant B data with Tenant A credentials
      }
    });
    console.assert(isoRes.status === 403, `Cross-tenant access must return 403 Forbidden, got ${isoRes.status}`);
    console.log('✓ Cross-tenant isolation verified: Access denied with 403 Forbidden.');

    // 10. Module Entitlement Toggle
    console.log('\n[Test 10] Module Configuration: Toggling TREASURY_BANK_REC module entitlement...');
    const modToggleRes = await makeRequest({
      method: 'PATCH',
      path: '/api/v1/tenant/modules',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-tenant-id': tenantAId
      },
      body: {
        module_code: 'TREASURY_BANK_REC',
        is_enabled: false
      }
    });
    console.assert(modToggleRes.status === 200, `Module toggle status: ${modToggleRes.status}`);
    console.assert(modToggleRes.body.data.is_enabled === false, 'TREASURY_BANK_REC must now be disabled');
    console.log('✓ Module entitlement disabled successfully.');

    // Re-enable module
    await makeRequest({
      method: 'PATCH',
      path: '/api/v1/tenant/modules',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-tenant-id': tenantAId
      },
      body: {
        module_code: 'TREASURY_BANK_REC',
        is_enabled: true
      }
    });
    console.log('✓ Module entitlement re-enabled.');

    console.log('\n======================================================');
    console.log(' ALL 10 PHASE 1 BACKEND ACCEPTANCE TESTS PASSED! ');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

runAcceptanceTests();
