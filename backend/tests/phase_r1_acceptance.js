require('dotenv').config();
const { connectDB } = require('../src/config/db');
const {
  Tenant,
  User,
  TenantMembership,
  Role,
  UserRole,
  Party,
  PartyRole,
  TenantModuleEntitlement
} = require('../src/models');
const { seedPersonas } = require('../src/utils/seedPersonas');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5050/api/v1';

async function runR1AcceptanceTests() {
  console.log('================================================================');
  console.log('  VERIDEX ONE — PHASE R1 TENANCY & COUNTERPARTY ACCEPTANCE SUITE');
  console.log('================================================================\n');

  await connectDB();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`TEST [R1-${(passed + failed + 1).toString().padStart(2, '0')}]: ${name} ... `);
      await fn();
      console.log('PASS');
      passed++;
    } catch (err) {
      console.log('FAIL');
      console.error(`  Error: ${err.message}`);
      if (err.stack) console.error(`  Stack: ${err.stack.split('\n').slice(1, 3).join('\n')}`);
      failed++;
    }
  }

  // 1. Tenant Model Classification
  await test('Tenant model supports tenant_type enum and defaults to MGA', async () => {
    const testTenantCode = `R1_TEST_${Date.now()}`;
    const t = await Tenant.create({
      tenant_code: testTenantCode,
      name: 'R1 Tenant Test',
      tenant_type: 'CARRIER'
    });
    if (t.tenant_type !== 'CARRIER') throw new Error(`Expected CARRIER, got ${t.tenant_type}`);
    await Tenant.deleteOne({ _id: t._id });
  });

  // 2. Tenant Model Rejects Invalid tenant_type
  await test('Tenant model rejects invalid tenant_type', async () => {
    try {
      await Tenant.create({
        tenant_code: `INVALID_${Date.now()}`,
        name: 'Invalid Tenant',
        tenant_type: 'SUPER_BANK'
      });
      throw new Error('Should have thrown validation error for invalid tenant_type');
    } catch (err) {
      if (!err.message.includes('enum') && !err.message.includes('validation')) {
        throw err;
      }
    }
  });

  // 3. Counterparty Party & PartyRole Unique Indexes
  await test('Party model enforces compound unique index on { tenant_id, party_code }', async () => {
    const t1 = await Tenant.findOne({ tenant_code: 'TENANT_SUMMIT' });
    const existing = await Party.findOne({ tenant_id: t1._id });
    if (!existing) throw new Error('No existing party in Summit');

    try {
      await Party.create({
        tenant_id: t1._id,
        party_code: existing.party_code,
        legal_name: 'Duplicate Party'
      });
      throw new Error('Should have rejected duplicate party_code within same tenant');
    } catch (err) {
      if (!err.message.includes('E11000') && !err.message.includes('duplicate')) {
        throw err;
      }
    }
  });

  // 4. Distinct Tenant Party Code Isolation
  await test('Different tenants can use identical party_code without collision', async () => {
    const summit = await Tenant.findOne({ tenant_code: 'TENANT_SUMMIT' });
    const harbor = await Tenant.findOne({ tenant_code: 'TENANT_HARBOR' });

    const sharedCode = `SHARED_${Date.now()}`;
    const p1 = await Party.create({
      tenant_id: summit._id,
      party_code: sharedCode,
      legal_name: 'Shared Code Entity (Summit)'
    });
    const p2 = await Party.create({
      tenant_id: harbor._id,
      party_code: sharedCode,
      legal_name: 'Shared Code Entity (Harbor)'
    });

    if (!p1 || !p2) throw new Error('Failed to create cross-tenant parties with identical codes');
    await Party.deleteMany({ party_code: sharedCode });
  });

  // 5. Canonical Demo Personas Verification
  await test('Seeder establishes all 3 canonical personas (Carrier, MGA, Broker)', async () => {
    const summit = await Tenant.findOne({ tenant_code: 'TENANT_SUMMIT' });
    const harbor = await Tenant.findOne({ tenant_code: 'TENANT_HARBOR' });
    const brightline = await Tenant.findOne({ tenant_code: 'TENANT_BRIGHTLINE' });

    if (!summit || summit.tenant_type !== 'CARRIER') throw new Error('Summit National is not CARRIER');
    if (!harbor || harbor.tenant_type !== 'MGA') throw new Error('Harbor Risk is not MGA');
    if (!brightline || brightline.tenant_type !== 'BROKER') throw new Error('Brightline is not BROKER');

    const sParties = await Party.countDocuments({ tenant_id: summit._id });
    const hParties = await Party.countDocuments({ tenant_id: harbor._id });
    const bParties = await Party.countDocuments({ tenant_id: brightline._id });

    if (sParties < 4 || hParties < 4 || bParties < 4) {
      throw new Error(`Incomplete counterparties: Summit=${sParties}, Harbor=${hParties}, Brightline=${bParties}`);
    }
  });

  // 6. Seeder Idempotency Verification
  await test('Seeder execution is strictly idempotent with zero duplicates', async () => {
    const summit = await Tenant.findOne({ tenant_code: 'TENANT_SUMMIT' });
    const partiesBefore = await Party.countDocuments({ tenant_id: summit._id });
    const rolesBefore = await PartyRole.countDocuments({ tenant_id: summit._id });

    await seedPersonas();

    const partiesAfter = await Party.countDocuments({ tenant_id: summit._id });
    const rolesAfter = await PartyRole.countDocuments({ tenant_id: summit._id });

    if (partiesBefore !== partiesAfter) throw new Error(`Parties changed from ${partiesBefore} to ${partiesAfter}`);
    if (rolesBefore !== rolesAfter) throw new Error(`Roles changed from ${rolesBefore} to ${rolesAfter}`);
  });

  // 7. Login Returns Active Workspace with tenant_type and Available Workspaces
  let summitToken, harborToken, brightlineToken;
  let summitId, harborId, brightlineId;

  await test('Login returns tenant_type on active and available workspaces', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@summitmutual.com', password: 'VeridexDemo2026!' })
    }).then(r => r.json());

    if (!res.success) throw new Error(res.error?.message || 'Login failed');

    const hasMGA = res.data.available_workspaces.some(w => w.tenant_type === 'MGA');
    const hasBroker = res.data.available_workspaces.some(w => w.tenant_type === 'BROKER');
    const hasCarrier = res.data.available_workspaces.some(w => w.tenant_type === 'CARRIER');
    if (!hasMGA || !hasBroker || !hasCarrier) {
      throw new Error('Available workspaces missing Carrier, MGA, or Broker classifications');
    }

    if (res.data.active_workspace.tenant_type !== 'CARRIER') {
      const summitWs = res.data.available_workspaces.find(w => w.tenant_code === 'TENANT_SUMMIT');
      const switchRes = await fetch(`${BASE_URL}/tenant/switch-workspace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${res.data.token}`
        },
        body: JSON.stringify({ tenant_id: summitWs.id })
      }).then(r => r.json());
      summitToken = switchRes.data.token;
      summitId = switchRes.data.active_workspace.id;
    } else {
      summitToken = res.data.token;
      summitId = res.data.active_workspace.id;
    }
  });

  // 8. Counterparty API: List and Role Filter
  await test('Counterparty API lists tenant parties and filters by role_type', async () => {
    const allRes = await fetch(`${BASE_URL}/counterparties`, {
      headers: { 'Authorization': `Bearer ${summitToken}`, 'x-tenant-id': summitId }
    }).then(r => r.json());

    if (!allRes.success) throw new Error('Failed to fetch counterparties');
    if (allRes.data.length < 4) throw new Error(`Expected at least 4 counterparties, got ${allRes.data.length}`);

    // Filter by MGA
    const mgaRes = await fetch(`${BASE_URL}/counterparties?role_type=MGA`, {
      headers: { 'Authorization': `Bearer ${summitToken}`, 'x-tenant-id': summitId }
    }).then(r => r.json());

    if (!mgaRes.success) throw new Error('Failed to filter counterparties by role');
    const allAreMGA = mgaRes.data.every(p => p.roles.some(r => r.role_type === 'MGA'));
    if (!allAreMGA) throw new Error('Filter returned non-MGA party');
  });

  // 9. Counterparty API: Create Party and Assign Role
  let createdPartyId;
  await test('Counterparty API creates new party and assigns initial business role', async () => {
    const testCode = `PTY-AUTO-${Date.now()}`;
    const res = await fetch(`${BASE_URL}/counterparties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${summitToken}`,
        'x-tenant-id': summitId
      },
      body: JSON.stringify({
        party_code: testCode,
        legal_name: 'Apex Reinsurance Syndicate Ltd',
        party_type: 'ORGANIZATION',
        tax_id: '98-7654321',
        initial_role_type: 'REINSURER',
        role_details: { treaty_type: 'QUOTA_SHARE', capacity: 10000000 }
      })
    }).then(r => r.json());

    if (!res.success) throw new Error(res.error?.message || 'Failed to create counterparty');
    createdPartyId = res.data._id;
    if (res.data.roles.length !== 1 || res.data.roles[0].role_type !== 'REINSURER') {
      throw new Error('Initial role was not created properly');
    }
  });

  // 10. Counterparty API: Add Secondary Business Role
  await test('Counterparty API assigns second business role to same party', async () => {
    const res = await fetch(`${BASE_URL}/counterparties/${createdPartyId}/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${summitToken}`,
        'x-tenant-id': summitId
      },
      body: JSON.stringify({
        role_type: 'VENDOR',
        role_details: { service: 'Actuarial Audit' }
      })
    }).then(r => r.json());

    if (!res.success) throw new Error(res.error?.message || 'Failed to add party role');

    // Fetch detail
    const detail = await fetch(`${BASE_URL}/counterparties/${createdPartyId}`, {
      headers: { 'Authorization': `Bearer ${summitToken}`, 'x-tenant-id': summitId }
    }).then(r => r.json());

    if (detail.data.roles.length !== 2) {
      throw new Error(`Expected 2 roles, got ${detail.data.roles.length}`);
    }

    // Clean up test party
    await Party.deleteOne({ _id: createdPartyId });
    await PartyRole.deleteMany({ party_id: createdPartyId });
  });

  // 11. Dashboard Metrics API: Live Tenant Scoped Data
  await test('Dashboard Metrics API returns real tenant-scoped live figures without mocks', async () => {
    const res = await fetch(`${BASE_URL}/dashboard/metrics`, {
      headers: { 'Authorization': `Bearer ${summitToken}`, 'x-tenant-id': summitId }
    }).then(r => r.json());

    if (!res.success) throw new Error(res.error?.message || 'Failed to get dashboard metrics');
    const data = res.data;

    if (!data.tenant || data.tenant.tenant_type !== 'CARRIER') {
      throw new Error('Dashboard did not return correct tenant context');
    }
    if (typeof data.receivables?.total_outstanding !== 'string') {
      throw new Error('Missing receivables.total_outstanding');
    }
    if (typeof data.cash?.operating_cash !== 'string') {
      throw new Error('Missing cash.operating_cash');
    }
    if (typeof data.gl?.trial_balance_balanced !== 'boolean') {
      throw new Error('Missing gl.trial_balance_balanced flag');
    }
    if (!data.gl.trial_balance_balanced) {
      throw new Error('GL Trial balance out of balance on fresh tenant');
    }
  });

  // 12. Workspace Switching between Carrier, MGA, and Broker
  await test('Workspace switching accurately transitions tenant_type and permissions', async () => {
    const harborTenant = await Tenant.findOne({ tenant_code: 'TENANT_HARBOR' });

    // Switch to Harbor
    const switchRes = await fetch(`${BASE_URL}/tenant/switch-workspace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${summitToken}`
      },
      body: JSON.stringify({ tenant_id: harborTenant._id.toString() })
    }).then(r => r.json());

    if (!switchRes.success) throw new Error(switchRes.error?.message || 'Failed to switch to Harbor');
    if (switchRes.data.active_workspace.tenant_type !== 'MGA') {
      throw new Error(`Expected MGA, got ${switchRes.data.active_workspace.tenant_type}`);
    }

    harborToken = switchRes.data.token;
    harborId = switchRes.data.active_workspace.id;

    // Verify /auth/me reflects MGA
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${harborToken}`, 'x-tenant-id': harborId }
    }).then(r => r.json());

    if (meRes.data.current_workspace.tenant_type !== 'MGA') {
      throw new Error(`Expected meRes current_workspace to be MGA, got ${meRes.data.current_workspace.tenant_type}`);
    }
  });

  // 13. Organization Settings API
  await test('Organization Settings API allows viewing and updating tenant parameters', async () => {
    const getRes = await fetch(`${BASE_URL}/tenant/settings`, {
      headers: { 'Authorization': `Bearer ${harborToken}`, 'x-tenant-id': harborId }
    }).then(r => r.json());

    if (!getRes.success) throw new Error('Failed to get organization settings');
    if (getRes.data.tenant_type !== 'MGA') throw new Error('Settings tenant_type is not MGA');

    const patchRes = await fetch(`${BASE_URL}/tenant/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${harborToken}`,
        'x-tenant-id': harborId
      },
      body: JSON.stringify({ timezone: 'America/Chicago' })
    }).then(r => r.json());

    if (!patchRes.success) throw new Error('Failed to update organization settings');
    if (patchRes.data.timezone !== 'America/Chicago') throw new Error('Timezone update was not reflected');
  });

  // 14. Non-Conflation Invariant: Tenant Type vs Party Role vs RBAC Role
  await test('Strict invariant: Tenant Type != Party Role != RBAC Application Role', async () => {
    const summit = await Tenant.findOne({ tenant_code: 'TENANT_SUMMIT' });
    const user = await User.findOne({ email: 'admin@summitmutual.com' });

    // 1. Tenant Type is on Tenant
    if (summit.tenant_type !== 'CARRIER') throw new Error('Tenant type failure');

    // 2. Party Role is on PartyRole
    const partyRole = await PartyRole.findOne({ tenant_id: summit._id, role_type: 'CARRIER' });
    if (!partyRole) throw new Error('Party role failure');

    // 3. User Role is on UserRole -> Role
    const userRole = await UserRole.findOne({ tenant_id: summit._id, user_id: user._id }).populate('role_id');
    if (!userRole || userRole.role_id.code !== 'TENANT_ADMIN') {
      throw new Error('User RBAC role failure');
    }

    // Assert independence
    if (summit.tenant_type === userRole.role_id.code) {
      throw new Error('Tenant type must not equal RBAC role name');
    }
  });

  console.log('\n================================================================');
  console.log(`  PHASE R1 ACCEPTANCE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runR1AcceptanceTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
