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
  'INVENTORY',
  'COMMERCIAL',
  'RETAIL_POS',
  'RESTAURANT',
  'HOTEL_PMS',
  'MANUFACTURING',
  'SERVICES',
  'FINANCE_CLOSE'
];

const CANONICAL_PERSONAS = [
  {
    tenant_code: 'TENANT_SUMMIT',
    name: 'Summit Commercial Trading Ltd',
    tenant_type: 'ENTERPRISE',
    base_currency: 'INR',
    timezone: 'Asia/Kolkata',
    fiscal_year_start_month: 4,
    admin: {
      email: 'admin@summitmutual.com',
      first_name: 'Sarah',
      last_name: 'Jenkins'
    },
    counterparties: [
      {
        party_code: 'PTY-SUMMIT-SELF',
        legal_name: 'Summit Commercial Trading Ltd',
        trade_name: 'Summit Trading Group',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCS1429B1Z1',
        email: 'finance@summittrading.com',
        phone: '022-25550100',
        role_type: 'CUSTOMER',
        role_details: { credit_limit: 1000000, credit_days: 30 }
      },
      {
        party_code: 'PTY-HARBOR-SUPP',
        legal_name: 'Harbor Wholesale Suppliers LLP',
        trade_name: 'Harbor Wholesale',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCH2429B1Z2',
        email: 'orders@harborwholesale.com',
        phone: '022-25550150',
        role_type: 'SUPPLIER',
        role_details: { payment_terms: 'NET_30', gstin: '27AABCH2429B1Z2' }
      },
      {
        party_code: 'PTY-BRIGHTLINE-VEND',
        legal_name: 'Brightline Industrial Hardware',
        trade_name: 'Brightline Hardware',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCB3429B1Z3',
        email: 'sales@brightlinehardware.com',
        phone: '022-25550180',
        role_type: 'VENDOR',
        role_details: { vendor_tier: 'PREFERRED', lead_time_days: 7 }
      },
      {
        party_code: 'PTY-LONEPINE-LOG',
        legal_name: 'Lone Pine Freight & Logistics Ltd',
        trade_name: 'Lone Pine Express',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCL4429B1Z4',
        email: 'dispatch@lonepinefreight.com',
        phone: '022-25550199',
        role_type: 'VENDOR',
        role_details: { transporter_id: 'TR-44291', fleet_type: 'HEAVY_CARRIER' }
      }
    ]
  },
  {
    tenant_code: 'TENANT_HARBOR',
    name: 'Harbor Retail & Supermarket Mart',
    tenant_type: 'RETAIL',
    base_currency: 'INR',
    timezone: 'Asia/Kolkata',
    fiscal_year_start_month: 4,
    admin: {
      email: 'admin@harborspecialty.com',
      first_name: 'Marcus',
      last_name: 'Vance'
    },
    counterparties: [
      {
        party_code: 'PTY-HARBOR-SELF',
        legal_name: 'Harbor Retail & Supermarket Mart',
        trade_name: 'Harbor Supermarket',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCH2429B1Z2',
        email: 'operations@harborsupermarket.com',
        phone: '022-25550150',
        role_type: 'CUSTOMER',
        role_details: { store_format: 'SUPERMARKET', billing_counter_count: 8 }
      },
      {
        party_code: 'PTY-SUMMIT-DIST',
        legal_name: 'Summit Commercial Trading Ltd',
        trade_name: 'Summit Distributors',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCS1429B1Z1',
        email: 'distributors@summittrading.com',
        phone: '022-25550100',
        role_type: 'SUPPLIER',
        role_details: { distributor_tier: 'MASTER', discount_percent: 15 }
      },
      {
        party_code: 'PTY-BRIGHTLINE-FMCG',
        legal_name: 'Brightline Consumer Goods Co.',
        trade_name: 'Brightline FMCG',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCB3429B1Z3',
        email: 'accounts@brightlinefmcg.com',
        phone: '022-25550180',
        role_type: 'SUPPLIER',
        role_details: { return_policy: 'REPLACE_DEFECTIVE', payment_terms: 'NET_15' }
      },
      {
        party_code: 'PTY-LONEPINE-RET',
        legal_name: 'Lone Pine Retail Customers Club',
        trade_name: 'Lone Pine Club',
        party_type: 'INDIVIDUAL',
        tax_id: '',
        email: 'loyalty@lonepineretail.com',
        phone: '022-25550199',
        role_type: 'CUSTOMER',
        role_details: { loyalty_tier: 'GOLD', reward_points_balance: 450 }
      }
    ]
  },
  {
    tenant_code: 'TENANT_BRIGHTLINE',
    name: 'Brightline Hospitality & Dining Suites',
    tenant_type: 'HOSPITALITY',
    base_currency: 'INR',
    timezone: 'Asia/Kolkata',
    fiscal_year_start_month: 4,
    admin: {
      email: 'admin@brightlinebrokers.com',
      first_name: 'Elena',
      last_name: 'Rostova'
    },
    counterparties: [
      {
        party_code: 'PTY-BRIGHTLINE-SELF',
        legal_name: 'Brightline Hospitality & Dining Suites',
        trade_name: 'Brightline Hotel & Suites',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCB3429B1Z3',
        email: 'admin@brightlinehotel.com',
        phone: '022-25550180',
        role_type: 'CUSTOMER',
        role_details: { total_rooms: 45, dining_tables: 20 }
      },
      {
        party_code: 'PTY-HARBOR-FOOD',
        legal_name: 'Harbor Fresh Produce & Provisions',
        trade_name: 'Harbor Food Supplies',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCH2429B1Z2',
        email: 'kitchen-orders@harborfood.com',
        phone: '022-25550150',
        role_type: 'SUPPLIER',
        role_details: { category: 'DAIRY_PRODUCE', delivery_frequency: 'DAILY' }
      },
      {
        party_code: 'PTY-SUMMIT-LINEN',
        legal_name: 'Summit Linen & Hotel Amenities Ltd',
        trade_name: 'Summit Amenities',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCS1429B1Z1',
        email: 'supplies@summitamenities.com',
        phone: '022-25550100',
        role_type: 'SUPPLIER',
        role_details: { category: 'ROOM_AMENITIES', contracted_rate: 'DISCOUNTED' }
      },
      {
        party_code: 'PTY-LONEPINE-CORP',
        legal_name: 'Lone Pine Corporate Travel Group',
        trade_name: 'Lone Pine Travel',
        party_type: 'ORGANIZATION',
        tax_id: '27AABCL4429B1Z4',
        email: 'bookings@lonepinetravel.com',
        phone: '022-25550199',
        role_type: 'CUSTOMER',
        role_details: { corporate_rate_code: 'CORP-LONEPINE-2026', room_quota: 10 }
      }
    ]
  }
];

async function seedPersonas() {
  console.log('[SEED_PERSONAS] Initializing canonical Enterprise, Retail, and Hospitality personas...');

  // Ensure default TENANT_ADMIN role exists
  let tenantAdminRole = await Role.findOne({ code: 'TENANT_ADMIN', tenant_id: null });
  if (!tenantAdminRole) {
    tenantAdminRole = await Role.create({
      code: 'TENANT_ADMIN',
      name: 'Tenant Administrator',
      description: 'Full administrative access across all tenant settings and ERP modules',
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

    // 5. Ensure all standard ERP Modules are Entitled
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
    { $set: { tenant_type: 'ENTERPRISE' } }
  );

  console.log('[SEED_PERSONAS] Completed successfully. Commercial ERP Personas active.');
  return seededTenants;
}

module.exports = {
  seedPersonas,
  CANONICAL_PERSONAS
};
