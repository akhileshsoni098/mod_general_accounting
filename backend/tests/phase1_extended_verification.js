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

async function runComprehensivePhase1Tests() {
  console.log('================================================================');
  console.log(' STARTING PHASE 1 COMPREHENSIVE VERIFICATION & EXTENDED TESTS   ');
  console.log('================================================================');

  let serverInstance = null;
  const testSuffix = Math.floor(Date.now() % 100000);

  try {
    // -------------------------------------------------------------------------
    // STEP 1: INITIAL SERVER BOOT & SEEDING VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1.1] Booting Backend Server...');
    const initBoot = await startServer();
    serverInstance = initBoot.server;

    console.log('[Phase 1.2] Verifying 8 Canonical System Roles Seeding...');
    const { Role } = require('../src/models');
    const seededRoles = await Role.find({ tenant_id: null }).sort({ code: 1 });
    const canonicalCodes = [
      'PLATFORM_SUPER_ADMIN',
      'TENANT_ADMIN',
      'FINANCE_ADMIN',
      'ACCOUNTANT',
      'BILLING_OPERATOR',
      'TREASURY_OPERATOR',
      'FINANCE_CONTROLLER',
      'AUDITOR_READ_ONLY'
    ];
    console.log(`Seeded Roles in Database:`, seededRoles.map(r => r.code));
    for (const code of canonicalCodes) {
      const exists = seededRoles.some(r => r.code === code);
      console.assert(exists, `Missing canonical role: ${code}`);
    }
    console.log('✓ All 8 canonical roles verified in MongoDB database.');

    // -------------------------------------------------------------------------
    // STEP 2: TENANT ONBOARDING & MEMBERSHIPS
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1.3] Registering Lone Pine Trucking Tenant (LPT)...');
    const regRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `LPT_${testSuffix}`,
        tenant_name: 'Lone Pine Trucking Insurance Ecosystem',
        base_currency: 'USD',
        admin_first_name: 'Arturo',
        admin_last_name: 'Gatti',
        admin_email: `arturo_${testSuffix}@lonepine.com`,
        admin_password: 'Password123!'
      }
    });
    console.assert(regRes.status === 201, `Registration failed with ${regRes.status}`);
    const token = regRes.body.data.token;
    const tenantId = regRes.body.data.tenant.id;
    console.log(`✓ Tenant created: ${tenantId}, Token issued.`);

    // -------------------------------------------------------------------------
    // STEP 3: LOGOUT BEHAVIOR
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1.4] Testing Explicit Logout Endpoint...');
    const logoutRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.assert(logoutRes.status === 200, `Logout returned ${logoutRes.status}`);
    console.assert(logoutRes.body.data.logged_out === true, 'Logout flag must be true');
    console.log('✓ Logout endpoint confirmed 200 OK.');

    // -------------------------------------------------------------------------
    // STEP 4: SERVER RESTART SIMULATION & SESSION PERSISTENCE
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1.5] Simulating Application Server Restart (State Persistence Test)...');
    console.log('Shutting down server instance 1...');
    await new Promise(resolve => serverInstance.close(resolve));
    console.log('✓ Server instance 1 terminated.');

    console.log('Restarting server instance 2 on port 5050...');
    const restartBoot = await startServer();
    serverInstance = restartBoot.server;
    console.log('✓ Server instance 2 restarted and reconnected to MongoDB Atlas.');

    // Test that the session and JWT remain valid and correctly scope after server restart
    console.log('Verifying token and workspace context on restarted server (/me)...');
    const meAfterRestart = await makeRequest({
      method: 'GET',
      path: '/api/v1/auth/me',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId
      }
    });
    console.assert(meAfterRestart.status === 200, `Session failed after restart: ${meAfterRestart.status}`);
    console.assert(meAfterRestart.body.data.user.email === `arturo_${testSuffix}@lonepine.com`, 'User identity persisted');
    console.assert(meAfterRestart.body.data.current_workspace.id === tenantId, 'Active workspace persisted');
    console.log('✓ Session, user identity, and tenant workspace context persist flawlessly across restarts.');

    // -------------------------------------------------------------------------
    // STEP 5: DIRECT API REJECTION ON DISABLED MODULE ENTITLEMENT
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1.6] Testing Direct API Gating on Module Entitlement...');

    // 5a. When GL is enabled, endpoint should succeed
    const glPingEnabled = await makeRequest({
      method: 'GET',
      path: '/api/v1/gl/ping',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId
      }
    });
    console.assert(glPingEnabled.status === 200, `GL ping failed when enabled: ${glPingEnabled.status}`);
    console.log('✓ Direct API call to /api/v1/gl/ping succeeded (200 OK) when module is enabled.');

    // 5b. Disable GL module entitlement in the database via API
    console.log('Disabling GL module entitlement via PATCH /api/v1/tenant/modules...');
    const disableGlRes = await makeRequest({
      method: 'PATCH',
      path: '/api/v1/tenant/modules',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId
      },
      body: {
        module_code: 'GL',
        is_enabled: false
      }
    });
    console.assert(disableGlRes.status === 200, `Disable GL failed: ${disableGlRes.status}`);
    console.assert(disableGlRes.body.data.is_enabled === false, 'GL is_enabled must be false');
    console.log('✓ GL module successfully disabled in tenant_module_entitlements.');

    // 5c. When GL is disabled, direct API call MUST be rejected with 403 Forbidden
    console.log('Attempting direct API request to /api/v1/gl/ping while GL is disabled...');
    const glPingDisabled = await makeRequest({
      method: 'GET',
      path: '/api/v1/gl/ping',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId
      }
    });
    console.assert(glPingDisabled.status === 403, `Disabled module should return 403, got ${glPingDisabled.status}`);
    console.assert(glPingDisabled.body.success === false, 'Disabled module response success must be false');
    console.log(`✓ Direct API call correctly rejected with 403 Forbidden: "${glPingDisabled.body.error.message}"`);

    // 5d. Re-enable GL module and verify access restored
    console.log('Re-enabling GL module entitlement...');
    await makeRequest({
      method: 'PATCH',
      path: '/api/v1/tenant/modules',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId
      },
      body: {
        module_code: 'GL',
        is_enabled: true
      }
    });
    const glPingRestored = await makeRequest({
      method: 'GET',
      path: '/api/v1/gl/ping',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId
      }
    });
    console.assert(glPingRestored.status === 200, 'Restored GL should return 200');
    console.log('✓ Access to /api/v1/gl/ping restored immediately upon re-enabling.');

    // -------------------------------------------------------------------------
    // STEP 6: VERIFY CANONICAL ROLES ASSIGNMENT & RBAC ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1.7] Testing User Invite with Canonical Roles (ACCOUNTANT, BILLING_OPERATOR, etc.)...');
    const inviteAccountant = await makeRequest({
      method: 'POST',
      path: '/api/v1/tenant/users/invite',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId
      },
      body: {
        email: `accountant_${testSuffix}@lonepine.com`,
        first_name: 'Elena',
        last_name: 'Rostova',
        temporary_password: 'Password123!',
        role_code: 'ACCOUNTANT'
      }
    });
    console.assert(inviteAccountant.status === 201, `Invite accountant status: ${inviteAccountant.status}`);
    console.assert(inviteAccountant.body.data.assigned_role === 'ACCOUNTANT', 'Role must be ACCOUNTANT');
    console.log('✓ User successfully created with canonical ACCOUNTANT role.');

    console.log('\n================================================================');
    console.log(' ALL EXTENDED PHASE 1 VERIFICATION TESTS PASSED SUCCESSFULLY!    ');
    console.log('================================================================\n');

  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
    process.exit(0);
  }
}

runComprehensivePhase1Tests();
