const {
  Tenant,
  User,
  TenantMembership,
  Role,
  UserRole,
  TenantModuleEntitlement,
  Party,
  PartyRole
} = require('../models');
const { hashPassword } = require('./crypto');
const { seedTenantChartOfAccounts } = require('./seedCoa');
const { seedFiscalPeriods } = require('./seedFiscalPeriods');

const FINANCE_MODULES = [
  'GL',
  'BILLING_AR',
  'COMMISSIONS_FIDUCIARY',
  'TREASURY_BANK_REC',
  'FINANCE_CLOSE',
  'INVENTORY',
  'COMMERCIAL'
];

const CANONICAL_PERSONAS = [
  {
    tenant_code: 'TENANT_SUMMIT',
    name: 'Summit National Insurance Co.',
    tenant_type: 'CARRIER',
    base_currency: 'USD',
    timezone: 'America/New_York',
    fiscal_year_start_month: 1,
    admin: {
      email: 'admin@summitmutual.com',
      first_name: 'Sarah',
      last_name: 'Jenkins'
    },
    counterparties: [
      {
        party_code: 'PTY-SUMMIT-SELF',
        legal_name: 'Summit National Insurance Co.',
        trade_name: 'Summit Mutual Group',
        party_type: 'ORGANIZATION',
        tax_id: '12-3456780',
        email: 'finance@summitmutual.com',
        phone: '212-555-0100',
        role_type: 'CARRIER',
        role_details: { naic_code: '23450', state_of_domicile: 'NY', am_best_rating: 'A+' }
      },
      {
        party_code: 'PTY-HARBOR-MGA',
        legal_name: 'Harbor Risk Underwriting Managers',
        trade_name: 'Harbor Specialty',
        party_type: 'ORGANIZATION',
        tax_id: '74-1234567',
        email: 'underwriting@harborspecialty.com',
        phone: '512-555-0150',
        role_type: 'MGA',
        role_details: { underwriting_authority_limit: 5000000, agreement_ref: 'AGR-HARBOR-SUMMIT-2026' }
      },
      {
        party_code: 'PTY-BRIGHTLINE-BRK',
        legal_name: 'Brightline Commercial Insurance Services',
        trade_name: 'Brightline Brokers',
        party_type: 'ORGANIZATION',
        tax_id: '75-9876543',
        email: 'producers@brightlinebrokers.com',
        phone: '214-555-0180',
        role_type: 'BROKER',
        role_details: { license_number: 'TX-BRK-9921', producer_tier: 'PLATINUM' }
      },
      {
        party_code: 'PTY-LONEPINE-INS',
        legal_name: 'Lone Pine Trucking LLC',
        trade_name: 'Lone Pine Freight',
        party_type: 'ORGANIZATION',
        tax_id: '74-9876543',
        email: 'dispatch@lonepinetrucking.com',
        phone: '432-555-0199',
        role_type: 'POLICYHOLDER',
        role_details: { dot_number: '3189201', industry_code: '484121' }
      }
    ]
  },
  {
    tenant_code: 'TENANT_HARBOR',
    name: 'Harbor Risk Underwriting Managers',
    tenant_type: 'MGA',
    base_currency: 'USD',
    timezone: 'America/Chicago',
    fiscal_year_start_month: 1,
    admin: {
      email: 'admin@harborspecialty.com',
      first_name: 'Marcus',
      last_name: 'Vance'
    },
    counterparties: [
      {
        party_code: 'PTY-HARBOR-SELF',
        legal_name: 'Harbor Risk Underwriting Managers',
        trade_name: 'Harbor Specialty Underwriters',
        party_type: 'ORGANIZATION',
        tax_id: '74-1234567',
        email: 'operations@harborspecialty.com',
        phone: '512-555-0150',
        role_type: 'MGA',
        role_details: { texas_doi_license: 'TX-MGA-4053', fiduciary_trust_bank: 'Frost Bank' }
      },
      {
        party_code: 'PTY-SUMMIT-CARR',
        legal_name: 'Summit National Insurance Co.',
        trade_name: 'Summit Mutual Group',
        party_type: 'ORGANIZATION',
        tax_id: '12-3456780',
        email: 'carrier-accounting@summitmutual.com',
        phone: '212-555-0100',
        role_type: 'CARRIER',
        role_details: { treaty_quota_share: 0.85, loss_escrow_required: true }
      },
      {
        party_code: 'PTY-BRIGHTLINE-BRK',
        legal_name: 'Brightline Commercial Insurance Services',
        trade_name: 'Brightline Brokers',
        party_type: 'ORGANIZATION',
        tax_id: '75-9876543',
        email: 'accounting@brightlinebrokers.com',
        phone: '214-555-0180',
        role_type: 'BROKER',
        role_details: { commission_schedule: 'SCHED-TX-COMMERCIAL', payment_terms: 'NET_15' }
      },
      {
        party_code: 'PTY-LONEPINE-INS',
        legal_name: 'Lone Pine Trucking LLC',
        trade_name: 'Lone Pine Freight',
        party_type: 'ORGANIZATION',
        tax_id: '74-9876543',
        email: 'billing@lonepinetrucking.com',
        phone: '432-555-0199',
        role_type: 'POLICYHOLDER',
        role_details: { risk_score: 'A', primary_policy: 'POL-TX-8821' }
      }
    ]
  },
  {
    tenant_code: 'TENANT_BRIGHTLINE',
    name: 'Brightline Commercial Insurance Services',
    tenant_type: 'BROKER',
    base_currency: 'USD',
    timezone: 'America/Chicago',
    fiscal_year_start_month: 1,
    admin: {
      email: 'admin@brightlinebrokers.com',
      first_name: 'Elena',
      last_name: 'Rostova'
    },
    counterparties: [
      {
        party_code: 'PTY-BRIGHTLINE-SELF',
        legal_name: 'Brightline Commercial Insurance Services',
        trade_name: 'Brightline Insurance Group',
        party_type: 'ORGANIZATION',
        tax_id: '75-9876543',
        email: 'admin@brightlinebrokers.com',
        phone: '214-555-0180',
        role_type: 'BROKER',
        role_details: { agency_management_system: 'Applied Epic', producer_license: 'TX-AGT-1049' }
      },
      {
        party_code: 'PTY-HARBOR-MGA',
        legal_name: 'Harbor Risk Underwriting Managers',
        trade_name: 'Harbor Specialty Underwriters',
        party_type: 'ORGANIZATION',
        tax_id: '74-1234567',
        email: 'broker-relations@harborspecialty.com',
        phone: '512-555-0150',
        role_type: 'MGA',
        role_details: { commission_split_standard: 0.10, bordereau_frequency: 'MONTHLY' }
      },
      {
        party_code: 'PTY-SUMMIT-CARR',
        legal_name: 'Summit National Insurance Co.',
        trade_name: 'Summit Mutual',
        party_type: 'ORGANIZATION',
        tax_id: '12-3456780',
        email: 'agency-markets@summitmutual.com',
        phone: '212-555-0100',
        role_type: 'CARRIER',
        role_details: { direct_appointment: false, paper_type: 'SURPLUS_LINES' }
      },
      {
        party_code: 'PTY-LONEPINE-INS',
        legal_name: 'Lone Pine Trucking LLC',
        trade_name: 'Lone Pine Freight',
        party_type: 'ORGANIZATION',
        tax_id: '74-9876543',
        email: 'accounts@lonepinetrucking.com',
        phone: '432-555-0199',
        role_type: 'POLICYHOLDER',
        role_details: { client_account_manager: 'Elena Rostova', renewal_date: '2027-07-01' }
      }
    ]
  }
];

async function seedPersonas() {
  console.log('[SEED_PERSONAS] Initializing canonical Carrier, MGA, and Broker personas...');

  // Ensure default TENANT_ADMIN role exists
  let tenantAdminRole = await Role.findOne({ code: 'TENANT_ADMIN', tenant_id: null });
  if (!tenantAdminRole) {
    tenantAdminRole = await Role.create({
      code: 'TENANT_ADMIN',
      name: 'Tenant Administrator',
      description: 'Full administrative access across all tenant settings and finance modules',
      is_system_role: true
    });
  }

  // Ensure universal demo admin user exists
  const defaultPasswordHash = hashPassword('VeridexDemo2026!');
  let universalUser = await User.findOne({ email: 'admin@veridex.com' });
  if (!universalUser) {
    universalUser = await User.create({
      email: 'admin@veridex.com',
      password_hash: defaultPasswordHash,
      first_name: 'Veridex',
      last_name: 'Admin',
      is_platform_admin: true,
      status: 'ACTIVE'
    });
  }

  const seededTenants = [];

  for (const persona of CANONICAL_PERSONAS) {
    // 1. Upsert Tenant
    let tenant = await Tenant.findOne({ tenant_code: persona.tenant_code });
    if (!tenant) {
      tenant = await Tenant.create({
        tenant_code: persona.tenant_code,
        name: persona.name,
        tenant_type: persona.tenant_type,
        base_currency: persona.base_currency,
        timezone: persona.timezone,
        fiscal_year_start_month: persona.fiscal_year_start_month,
        status: 'ACTIVE'
      });
      console.log(`[SEED_PERSONAS] Created tenant: ${persona.name} (${persona.tenant_type})`);
    } else {
      tenant.name = persona.name;
      tenant.tenant_type = persona.tenant_type;
      tenant.status = 'ACTIVE';
      await tenant.save();
    }
    seededTenants.push(tenant);

    // 2. Upsert Dedicated Persona Admin User
    let personaAdmin = await User.findOne({ email: persona.admin.email.toLowerCase() });
    if (!personaAdmin) {
      personaAdmin = await User.create({
        email: persona.admin.email.toLowerCase(),
        password_hash: defaultPasswordHash,
        first_name: persona.admin.first_name,
        last_name: persona.admin.last_name,
        default_tenant_id: tenant._id,
        status: 'ACTIVE'
      });
      console.log(`[SEED_PERSONAS] Created persona admin user: ${persona.admin.email}`);
    } else {
      personaAdmin.default_tenant_id = tenant._id;
      await personaAdmin.save();
    }

    // 3. Ensure memberships and TENANT_ADMIN role for persona admin
    await TenantMembership.findOneAndUpdate(
      { tenant_id: tenant._id, user_id: personaAdmin._id },
      { status: 'ACTIVE', joined_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await UserRole.findOneAndUpdate(
      { tenant_id: tenant._id, user_id: personaAdmin._id, role_id: tenantAdminRole._id },
      {},
      { upsert: true, setDefaultsOnInsert: true }
    );

    // 4. Ensure universal user also has membership in this tenant for seamless switching
    await TenantMembership.findOneAndUpdate(
      { tenant_id: tenant._id, user_id: universalUser._id },
      { status: 'ACTIVE', joined_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await UserRole.findOneAndUpdate(
      { tenant_id: tenant._id, user_id: universalUser._id, role_id: tenantAdminRole._id },
      {},
      { upsert: true, setDefaultsOnInsert: true }
    );

    // Also link persona admins across each other's tenants for smooth demo testing
    for (const otherPersona of CANONICAL_PERSONAS) {
      const otherUser = await User.findOne({ email: otherPersona.admin.email.toLowerCase() });
      if (otherUser) {
        await TenantMembership.findOneAndUpdate(
          { tenant_id: tenant._id, user_id: otherUser._id },
          { status: 'ACTIVE', joined_at: new Date() },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        await UserRole.findOneAndUpdate(
          { tenant_id: tenant._id, user_id: otherUser._id, role_id: tenantAdminRole._id },
          {},
          { upsert: true, setDefaultsOnInsert: true }
        );
      }
    }

    // 5. Ensure all 5 Finance Modules are Entitled
    for (const mod of FINANCE_MODULES) {
      await TenantModuleEntitlement.findOneAndUpdate(
        { tenant_id: tenant._id, module_code: mod },
        { is_enabled: true, config: {} },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // 6. Seed Chart of Accounts & Fiscal Periods
    await seedTenantChartOfAccounts(tenant._id);
    await seedFiscalPeriods(tenant._id, 2026);

    // 7. Seed Counterparties (Party & PartyRole)
    for (const cp of persona.counterparties) {
      let party = await Party.findOne({ tenant_id: tenant._id, party_code: cp.party_code });
      if (!party) {
        party = await Party.create({
          tenant_id: tenant._id,
          party_code: cp.party_code,
          legal_name: cp.legal_name,
          trade_name: cp.trade_name,
          party_type: cp.party_type,
          tax_id: cp.tax_id,
          email: cp.email,
          phone: cp.phone,
          status: 'ACTIVE'
        });
      } else {
        party.legal_name = cp.legal_name;
        party.trade_name = cp.trade_name;
        party.tax_id = cp.tax_id;
        await party.save();
      }

      await PartyRole.findOneAndUpdate(
        { tenant_id: tenant._id, party_id: party._id, role_type: cp.role_type },
        {
          status: 'ACTIVE',
          role_details: cp.role_details
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  // 8. Backfill tenant_type on any existing tenants
  await Tenant.updateMany(
    { tenant_type: { $exists: false } },
    { $set: { tenant_type: 'MGA' } }
  );

  console.log('[SEED_PERSONAS] Completed successfully. 3 Canonical Personas active.');
  return seededTenants;
}

module.exports = {
  seedPersonas,
  CANONICAL_PERSONAS
};
