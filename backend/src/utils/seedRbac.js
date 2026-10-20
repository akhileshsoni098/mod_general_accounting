const { Role, Permission, RolePermission } = require('../models');

const STANDARD_PERMISSIONS = [
  // PLATFORM & SAAS ADMIN
  { code: 'TENANT:CREATE', module: 'PLATFORM', description: 'Create and register new tenants' },
  { code: 'TENANT:VIEW', module: 'PLATFORM', description: 'View tenant details' },
  { code: 'TENANT:UPDATE', module: 'PLATFORM', description: 'Update tenant configuration' },
  { code: 'TENANT:SUSPEND', module: 'PLATFORM', description: 'Suspend or deactivate tenant' },
  
  // TENANT ADMIN / MEMBERSHIP / RBAC
  { code: 'USER:INVITE', module: 'TENANT_ADMIN', description: 'Invite users to tenant' },
  { code: 'USER:VIEW', module: 'TENANT_ADMIN', description: 'View tenant users' },
  { code: 'USER:MANAGE_ROLES', module: 'TENANT_ADMIN', description: 'Assign roles to tenant users' },
  { code: 'MODULE:CONFIGURE', module: 'TENANT_ADMIN', description: 'Configure module entitlements' },

  // COMPANY & BUSINESS PROFILE MANAGEMENT
  { code: 'COMPANY:VIEW', module: 'TENANT_ADMIN', description: 'View company details and accessible companies' },
  { code: 'COMPANY:CREATE', module: 'TENANT_ADMIN', description: 'Create and initialize a new company set of books' },
  { code: 'COMPANY:UPDATE', module: 'TENANT_ADMIN', description: 'Update company configuration and tax settings' },
  { code: 'COMPANY:MANAGE_MEMBERS', module: 'TENANT_ADMIN', description: 'Manage company user memberships and roles' },
  { code: 'COMPANY:ADMIN', module: 'TENANT_ADMIN', description: 'Full administrative control over company settings and status' },

  // GENERAL LEDGER
  { code: 'GL:VIEW', module: 'GL', description: 'View general ledger, accounts, journals' },
  { code: 'GL:POST', module: 'GL', description: 'Post manual or automated journal entries' },
  { code: 'GL:ADMIN', module: 'GL', description: 'Manage chart of accounts and subledgers' },
  { code: 'PERIOD:ADMIN', module: 'GL', description: 'Manage fiscal periods and period lock within company' },

  // BILLING & AR
  { code: 'BILLING:VIEW', module: 'BILLING_AR', description: 'View billing schedules, invoices, payments' },
  { code: 'BILLING:CREATE', module: 'BILLING_AR', description: 'Generate invoices and record payments' },
  { code: 'BILLING:ADMIN', module: 'BILLING_AR', description: 'Configure billing rules and tax configurations' },

  // COMMISSIONS & FIDUCIARY
  { code: 'COMMISSIONS:VIEW', module: 'COMMISSIONS_FIDUCIARY', description: 'View commission schedules, statements' },
  { code: 'COMMISSIONS:CALC', module: 'COMMISSIONS_FIDUCIARY', description: 'Calculate and approve commissions' },
  { code: 'COMMISSIONS:DISBURSE', module: 'COMMISSIONS_FIDUCIARY', description: 'Disburse fiduciary settlements' },

  // TREASURY & BANK RECONCILIATION
  { code: 'TREASURY:VIEW', module: 'TREASURY_BANK_REC', description: 'View bank accounts, statements, cash positions' },
  { code: 'TREASURY:RECONCILE', module: 'TREASURY_BANK_REC', description: 'Perform manual and automated bank reconciliation' },

  // FINANCE CLOSE & REPORTING
  { code: 'CLOSE:VIEW', module: 'FINANCE_CLOSE', description: 'View accounting periods and close runbooks' },
  { code: 'CLOSE:EXECUTE', module: 'FINANCE_CLOSE', description: 'Lock periods, run close, and generate trial balance' },

  // INVENTORY & STOCK MANAGEMENT (Phase 3)
  { code: 'INVENTORY:VIEW', module: 'INVENTORY', description: 'View stock items, groups, categories, balances, movements' },
  { code: 'INVENTORY:MANAGE_MASTERS', module: 'INVENTORY', description: 'Create and update stock items, groups, categories, UOM, godowns' },
  { code: 'INVENTORY:OPENING_STOCK', module: 'INVENTORY', description: 'Initialize and correct opening stock balances' },
  { code: 'INVENTORY:ADJUST', module: 'INVENTORY', description: 'Record physical stock adjustments and reconciliations' },
  { code: 'INVENTORY:ADMIN', module: 'INVENTORY', description: 'Full administrative control over inventory masters and policies' }
];

const STANDARD_ROLES = [
  {
    code: 'PLATFORM_SUPER_ADMIN',
    name: 'Platform Super Administrator',
    description: 'Global SaaS administrator across all tenants and platform configurations.',
    is_system_role: true,
    permissions: STANDARD_PERMISSIONS.map(p => p.code)
  },
  {
    code: 'TENANT_ADMIN',
    name: 'Tenant Administrator',
    description: 'Full administrative access across tenant settings, users, and all enabled finance modules.',
    is_system_role: true,
    permissions: STANDARD_PERMISSIONS.filter(p => !p.code.startsWith('TENANT:CREATE') && !p.code.startsWith('TENANT:SUSPEND')).map(p => p.code)
  },
  {
    code: 'FINANCE_ADMIN',
    name: 'Finance Administrator',
    description: 'Operational and financial administrator across GL, billing, commissions, treasury and close.',
    is_system_role: true,
    permissions: [
      'USER:VIEW',
      'COMPANY:VIEW', 'COMPANY:UPDATE',
      'GL:VIEW', 'GL:POST', 'GL:ADMIN', 'PERIOD:ADMIN',
      'INVENTORY:VIEW', 'INVENTORY:MANAGE_MASTERS', 'INVENTORY:OPENING_STOCK', 'INVENTORY:ADJUST', 'INVENTORY:ADMIN',
      'BILLING:VIEW', 'BILLING:CREATE', 'BILLING:ADMIN',
      'COMMISSIONS:VIEW', 'COMMISSIONS:CALC', 'COMMISSIONS:DISBURSE',
      'TREASURY:VIEW', 'TREASURY:RECONCILE',
      'CLOSE:VIEW', 'CLOSE:EXECUTE'
    ]
  },
  {
    code: 'ACCOUNTANT',
    name: 'Accountant',
    description: 'General ledger journal entry creation, posting, reconciliation and audit review.',
    is_system_role: true,
    permissions: [
      'COMPANY:VIEW',
      'GL:VIEW', 'GL:POST',
      'INVENTORY:VIEW', 'INVENTORY:MANAGE_MASTERS', 'INVENTORY:OPENING_STOCK',
      'BILLING:VIEW',
      'COMMISSIONS:VIEW',
      'TREASURY:VIEW', 'TREASURY:RECONCILE',
      'CLOSE:VIEW'
    ]
  },
  {
    code: 'BILLING_OPERATOR',
    name: 'Billing & AR Operator',
    description: 'Manages customer invoicing, payment plans, cash receipts and accounts receivable.',
    is_system_role: true,
    permissions: [
      'COMPANY:VIEW',
      'BILLING:VIEW', 'BILLING:CREATE',
      'GL:VIEW'
    ]
  },
  {
    code: 'TREASURY_OPERATOR',
    name: 'Treasury & Cash Operator',
    description: 'Manages bank statements, bank reconciliations, cash positioning and transfers.',
    is_system_role: true,
    permissions: [
      'COMPANY:VIEW',
      'TREASURY:VIEW', 'TREASURY:RECONCILE',
      'GL:VIEW'
    ]
  },
  {
    code: 'FINANCE_CONTROLLER',
    name: 'Finance Controller',
    description: 'Accounting controller with full oversight over posting, settlement, and month-end close execution.',
    is_system_role: true,
    permissions: [
      'COMPANY:VIEW', 'COMPANY:UPDATE',
      'GL:VIEW', 'GL:POST', 'GL:ADMIN', 'PERIOD:ADMIN',
      'INVENTORY:VIEW', 'INVENTORY:MANAGE_MASTERS', 'INVENTORY:OPENING_STOCK', 'INVENTORY:ADJUST',
      'BILLING:VIEW', 'BILLING:CREATE',
      'COMMISSIONS:VIEW', 'COMMISSIONS:CALC', 'COMMISSIONS:DISBURSE',
      'TREASURY:VIEW', 'TREASURY:RECONCILE',
      'CLOSE:VIEW', 'CLOSE:EXECUTE'
    ]
  },
  {
    code: 'AUDITOR_READ_ONLY',
    name: 'Auditor (Read-Only)',
    description: 'Read-only audit inspection across all finance modules, subledgers, and close artifacts.',
    is_system_role: true,
    permissions: [
      'TENANT:VIEW',
      'COMPANY:VIEW',
      'GL:VIEW',
      'INVENTORY:VIEW',
      'BILLING:VIEW',
      'COMMISSIONS:VIEW',
      'TREASURY:VIEW',
      'CLOSE:VIEW'
    ]
  }
];

async function seedRbacCatalog() {
  try {
    // 1. Seed Permissions
    const permMap = {};
    for (const p of STANDARD_PERMISSIONS) {
      const doc = await Permission.findOneAndUpdate(
        { code: p.code },
        { module: p.module, description: p.description },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      permMap[p.code] = doc._id;
    }

    // 2. Seed System Roles
    for (const r of STANDARD_ROLES) {
      const roleDoc = await Role.findOneAndUpdate(
        { tenant_id: null, code: r.code },
        { name: r.name, description: r.description, is_system_role: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Link RolePermissions
      for (const permCode of r.permissions) {
        const permId = permMap[permCode];
        if (permId) {
          await RolePermission.findOneAndUpdate(
            { role_id: roleDoc._id, permission_id: permId },
            {},
            { upsert: true, setDefaultsOnInsert: true }
          );
        }
      }
    }
    console.log('[RBAC SEEDER] Standard permissions and system roles catalog seeded.');
  } catch (err) {
    console.error('[RBAC SEEDER ERROR]', err);
  }
}

module.exports = {
  seedRbacCatalog,
  STANDARD_PERMISSIONS,
  STANDARD_ROLES
};
