const mongoose = require('mongoose');
const {
  Tenant,
  User,
  TenantMembership,
  Role,
  UserRole,
  TenantModuleEntitlement,
  Permission,
  RolePermission,
  LedgerAccount,
  BillingAccount,
  BillingAccountPolicy,
  InstallmentSchedule,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentAllocation,
  BillingAdjustment,
  Journal,
  JournalEntry,
  Party,
  PartyRole,
  OutboxEvent,
  InboxMessage,
  FiduciaryAccount,
  CommissionAgreement,
  CommissionSchedule,
  CommissionSplit,
  CommissionTransaction,
  CashReconciliationMatch,
  BankStatementLine,
  ProcessorTransaction,
  PaymentReturn,
  Refund,
  SettlementStatement,
  SettlementLine,
  BordereauRun,
  BordereauLine,
  SubledgerBalance,
  ReconciliationCase,
  TrialBalanceSnapshot,
  TrialBalanceLine,
  PeriodCloseTask,
  GLExportBatch,
  CommissionAdjustment,
  CommissionDispute,
  DelinquencyCase,
  DunningAction,
  CollectionAssignment,
  CommercialDocument,
  BillAllocation,
  StockMovement,
  StockBalance,
  PosShift,
  RestaurantOrder,
  HotelReservation,
  GuestFolio,
  WorkOrder
} = require('../models');
const { hashPassword } = require('../utils/crypto');
const { generateToken } = require('../middleware/authMiddleware');

/**
 * Switch active workspace and generate updated JWT token
 */
async function switchWorkspace(req, res) {
  try {
    const { tenant_id } = req.body;
    if (!tenant_id) {
      return res.error('tenant_id is required', 400);
    }

    const tenant = await Tenant.findById(tenant_id);
    if (!tenant || tenant.status !== 'ACTIVE') {
      return res.error('Tenant workspace not found or is inactive', 404);
    }

    // Verify user membership
    if (!req.user.is_platform_admin) {
      const membership = await TenantMembership.findOne({
        tenant_id: tenant._id,
        user_id: req.user._id,
        status: 'ACTIVE'
      });
      if (!membership) {
        return res.error('You do not have access to this tenant workspace', 403);
      }
    }

    // Set as default tenant
    await User.findByIdAndUpdate(req.user._id, { default_tenant_id: tenant._id });

    // Issue updated token
    const token = generateToken({
      userId: req.user._id.toString(),
      email: req.user.email,
      tenantId: tenant._id.toString()
    });

    return res.success({
      token,
      active_workspace: {
        id: tenant._id,
        tenant_code: tenant.tenant_code,
        name: tenant.name,
        tenant_type: tenant.tenant_type || 'MGA',
        base_currency: tenant.base_currency,
        status: tenant.status
      }
    }, { message: `Switched active workspace to ${tenant.name}` });
  } catch (err) {
    return res.error('Failed to switch workspace', 500, err.message);
  }
}

/**
 * List all users in active tenant workspace
 */
async function getTenantUsers(req, res) {
  try {
    const tenantId = req.tenantId;
    const memberships = await TenantMembership.find({ tenant_id: tenantId }).populate('user_id');

    const result = [];
    for (const m of memberships) {
      if (!m.user_id) continue;
      const userRoles = await UserRole.find({ tenant_id: tenantId, user_id: m.user_id._id }).populate('role_id');
      result.push({
        membership_id: m._id,
        user_id: m.user_id._id,
        email: m.user_id.email,
        first_name: m.user_id.first_name,
        last_name: m.user_id.last_name,
        status: m.status,
        joined_at: m.joined_at,
        roles: userRoles.map(ur => ur.role_id ? { id: ur.role_id._id, code: ur.role_id.code, name: ur.role_id.name } : null).filter(Boolean)
      });
    }

    return res.success(result);
  } catch (err) {
    return res.error('Failed to list tenant users', 500, err.message);
  }
}

/**
 * Add or invite user to tenant workspace with role assignment
 */
async function inviteTenantUser(req, res) {
  try {
    const tenantId = req.tenantId;
    const { email, first_name, last_name, temporary_password, role_code } = req.body;

    if (!email || !first_name || !last_name) {
      return res.error('email, first_name, and last_name are required', 400);
    }

    let user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      const password = temporary_password || 'VeridexTemp2026!';
      user = await User.create({
        email: email.toLowerCase().trim(),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        password_hash: hashPassword(password),
        default_tenant_id: tenantId,
        status: 'ACTIVE'
      });
    }

    // Upsert membership
    await TenantMembership.findOneAndUpdate(
      { tenant_id: tenantId, user_id: user._id },
      { status: 'ACTIVE', joined_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Assign Role
    const targetRoleCode = role_code || 'ACCOUNTANT';
    let role = await Role.findOne({
      code: targetRoleCode,
      $or: [{ tenant_id: tenantId }, { tenant_id: null }]
    });

    if (role) {
      await UserRole.findOneAndUpdate(
        { tenant_id: tenantId, user_id: user._id, role_id: role._id },
        {},
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    return res.success({
      user: {
        id: user._id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      },
      assigned_role: role ? role.code : null
    }, { message: `User ${user.email} added to tenant workspace` }, 201);
  } catch (err) {
    return res.error('Failed to add user to workspace', 500, err.message);
  }
}

/**
 * Get tenant module entitlements
 */
async function getModuleEntitlements(req, res) {
  try {
    const tenantId = req.tenantId;
    const entitlements = await TenantModuleEntitlement.find({ tenant_id: tenantId }).sort({ module_code: 1 });
    return res.success(entitlements);
  } catch (err) {
    return res.error('Failed to fetch module entitlements', 500, err.message);
  }
}

/**
 * Update module entitlement status (Enable / Disable)
 */
async function updateModuleEntitlement(req, res) {
  try {
    const tenantId = req.tenantId;
    const { module_code, is_enabled, config } = req.body;

    if (!module_code) {
      return res.error('module_code is required', 400);
    }

    const entitlement = await TenantModuleEntitlement.findOneAndUpdate(
      { tenant_id: tenantId, module_code: module_code.toUpperCase() },
      {
        ...(typeof is_enabled === 'boolean' ? { is_enabled } : {}),
        ...(config ? { config } : {}),
        $inc: { row_version: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.success(entitlement, { message: `Module ${module_code} configuration updated` });
  } catch (err) {
    return res.error('Failed to update module entitlement', 500, err.message);
  }
}

/**
 * List all available roles in system / tenant
 */
async function getRoles(req, res) {
  try {
    const tenantId = req.tenantId;
    const roles = await Role.find({
      $or: [{ tenant_id: null }, { tenant_id: tenantId }]
    });
    return res.success(roles);
  } catch (err) {
    return res.error('Failed to list roles', 500, err.message);
  }
}

/**
 * Get full organization settings for active tenant
 */
async function getOrganizationSettings(req, res) {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.error('Tenant not found', 404);
    return res.success({
      id: tenant._id,
      tenant_code: tenant.tenant_code,
      name: tenant.name,
      tenant_type: tenant.tenant_type || 'MGA',
      base_currency: tenant.base_currency,
      fiscal_year_start_month: tenant.fiscal_year_start_month,
      timezone: tenant.timezone,
      status: tenant.status,
      settings: tenant.settings || {},
      metadata: tenant.metadata || {}
    });
  } catch (err) {
    return res.error('Failed to get organization settings', 500, err.message);
  }
}

/**
 * Update organization settings
 */
async function updateOrganizationSettings(req, res) {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.error('Tenant not found', 404);

    const { name, tenant_type, timezone, base_currency, fiscal_year_start_month, metadata, settings } = req.body;
    if (name) tenant.name = name.trim();
    if (tenant_type) {
      const validTypes = ['ENTERPRISE', 'RETAIL', 'HOSPITALITY', 'MANUFACTURING', 'SERVICES', 'WHOLESALE', 'COMMERCIAL', 'OTHER', 'CARRIER', 'MGA', 'BROKER'];
      const normalized = tenant_type.toUpperCase().trim();
      if (!validTypes.includes(normalized)) {
        return res.error(`Invalid tenant_type. Must be one of: ${validTypes.join(', ')}`, 400);
      }
      tenant.tenant_type = normalized;
    }
    if (timezone) tenant.timezone = timezone.trim();
    if (base_currency) tenant.base_currency = base_currency.toUpperCase().trim();
    if (fiscal_year_start_month) {
      const m = Number(fiscal_year_start_month);
      if (m >= 1 && m <= 12) tenant.fiscal_year_start_month = m;
    }
    if (metadata && typeof metadata === 'object') {
      tenant.metadata = { ...tenant.metadata, ...metadata };
    }
    if (settings && typeof settings === 'object') {
      if (settings.allow_legacy_adapter !== undefined) {
        if (!req.user || !req.user.is_platform_admin) {
          return res.error('Only platform administrators can modify allow_legacy_adapter setting', 403);
        }
        tenant.settings = tenant.settings || {};
        tenant.settings.allow_legacy_adapter = Boolean(settings.allow_legacy_adapter);
      }
    }
    tenant.row_version = (tenant.row_version || 1) + 1;
    await tenant.save();

    return res.success({
      id: tenant._id,
      tenant_code: tenant.tenant_code,
      name: tenant.name,
      tenant_type: tenant.tenant_type,
      base_currency: tenant.base_currency,
      fiscal_year_start_month: tenant.fiscal_year_start_month,
      timezone: tenant.timezone,
      status: tenant.status,
      settings: tenant.settings,
      metadata: tenant.metadata
    }, { message: 'Organization settings updated successfully' });
  } catch (err) {
    return res.error('Failed to update organization settings', 500, err.message);
  }
}

/**
 * Development helper: Reset all transactional and operational data for the current active tenant.
 * Keeps User accounts, Tenant record, RBAC permissions, and system catalogs intact.
 */
async function resetDevData(req, res) {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_RESET !== 'true') {
      return res.error('Destructive reset endpoint is disabled. Set ENABLE_DEV_RESET=true in non-production environments to enable.', 403);
    }

    const confirmHeader = req.headers['x-confirm-destructive-reset'];
    if (confirmHeader !== 'CONFIRM_RESET_ALL_DATA') {
      return res.error('Destructive reset requires explicit header confirmation: x-confirm-destructive-reset: CONFIRM_RESET_ALL_DATA', 400);
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.error('tenantId is required', 400);
    }

    await Promise.all([
      CommercialDocument.deleteMany({ tenant_id: tenantId }),
      BillAllocation.deleteMany({ tenant_id: tenantId }),
      StockMovement.deleteMany({ tenant_id: tenantId }),
      StockBalance.deleteMany({ tenant_id: tenantId }),
      PosShift.deleteMany({ tenant_id: tenantId }),
      RestaurantOrder.deleteMany({ tenant_id: tenantId }),
      HotelReservation.deleteMany({ tenant_id: tenantId }),
      GuestFolio.deleteMany({ tenant_id: tenantId }),
      WorkOrder.deleteMany({ tenant_id: tenantId }),
      Invoice.deleteMany({ tenant_id: tenantId }),
      InvoiceLine.deleteMany({ tenant_id: tenantId }),
      Payment.deleteMany({ tenant_id: tenantId }),
      PaymentAllocation.deleteMany({ tenant_id: tenantId }),
      InstallmentSchedule.deleteMany({ tenant_id: tenantId }),
      BillingAccount.deleteMany({ tenant_id: tenantId }),
      BillingAccountPolicy.deleteMany({ tenant_id: tenantId }),
      BillingAdjustment.deleteMany({ tenant_id: tenantId }),
      Journal.deleteMany({ tenant_id: tenantId }),
      JournalEntry.deleteMany({ tenant_id: tenantId }),
      Party.deleteMany({ tenant_id: tenantId }),
      PartyRole.deleteMany({ tenant_id: tenantId }),
      OutboxEvent.deleteMany({ tenant_id: tenantId }),
      InboxMessage.deleteMany({ tenant_id: tenantId }),
      FiduciaryAccount.deleteMany({ tenant_id: tenantId }),
      CommissionAgreement.deleteMany({ tenant_id: tenantId }),
      CommissionSchedule.deleteMany({ tenant_id: tenantId }),
      CommissionSplit.deleteMany({ tenant_id: tenantId }),
      CommissionTransaction.deleteMany({ tenant_id: tenantId }),
      CashReconciliationMatch.deleteMany({ tenant_id: tenantId }),
      BankStatementLine.deleteMany({ tenant_id: tenantId }),
      ProcessorTransaction.deleteMany({ tenant_id: tenantId }),
      PaymentReturn.deleteMany({ tenant_id: tenantId }),
      Refund.deleteMany({ tenant_id: tenantId }),
      SettlementStatement.deleteMany({ tenant_id: tenantId }),
      SettlementLine.deleteMany({ tenant_id: tenantId }),
      BordereauRun.deleteMany({ tenant_id: tenantId }),
      BordereauLine.deleteMany({ tenant_id: tenantId }),
      SubledgerBalance.deleteMany({ tenant_id: tenantId }),
      ReconciliationCase.deleteMany({ tenant_id: tenantId }),
      TrialBalanceSnapshot.deleteMany({ tenant_id: tenantId }),
      TrialBalanceLine.deleteMany({ tenant_id: tenantId }),
      PeriodCloseTask.deleteMany({ tenant_id: tenantId }),
      GLExportBatch.deleteMany({ tenant_id: tenantId }),
      CommissionAdjustment.deleteMany({ tenant_id: tenantId }),
      CommissionDispute.deleteMany({ tenant_id: tenantId }),
      DelinquencyCase.deleteMany({ tenant_id: tenantId }),
      DunningAction.deleteMany({ tenant_id: tenantId }),
      CollectionAssignment.deleteMany({ tenant_id: tenantId }),
      LedgerAccount.updateMany(
        { tenant_id: tenantId },
        { $set: { current_balance: mongoose.Types.Decimal128.fromString('0.00') } }
      )
    ]);

    return res.success({
      cleared: true,
      tenantId: tenantId.toString()
    }, { message: 'Test data for this tenant workspace cleared successfully' });
  } catch (err) {
    return res.error('Failed to clear test data', 500, err.message);
  }
}

module.exports = {
  switchWorkspace,
  getTenantUsers,
  inviteTenantUser,
  getModuleEntitlements,
  updateModuleEntitlement,
  getRoles,
  getOrganizationSettings,
  updateOrganizationSettings,
  resetDevData
};

