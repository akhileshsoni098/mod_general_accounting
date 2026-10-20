const { Tenant, UserRole, Role } = require('../models');

/**
 * Validates whether an incoming HTTP request is authorized to invoke
 * the legacy direct posting adapter.
 *
 * Enforces all 3 required gates:
 * 1. Deployment-level gate: process.env.ENABLE_LEGACY_POSTING_ADAPTER === 'true'
 * 2. Actor authorization gate: User must be SYSTEM_ADMIN / Platform Admin
 * 3. Tenant configuration gate: Active tenant must have settings.allow_legacy_adapter === true
 *
 * If any gate fails, returns { authorized: false, reason: string }.
 */
async function authorizeMigrationAdapter(req) {
  // 1. Deployment-level gate
  if (process.env.ENABLE_LEGACY_POSTING_ADAPTER !== 'true') {
    return {
      authorized: false,
      reason: 'Migration adapter is disabled in this deployment environment.'
    };
  }

  // 2. Authentication check
  if (!req.user || !req.user._id) {
    return {
      authorized: false,
      reason: 'Authentication required for migration adapter access.'
    };
  }

  // 3. Actor authorization: SYSTEM_ADMIN or platform admin
  let isSystemAdmin = Boolean(req.user.is_platform_admin);
  if (!isSystemAdmin && req.tenantId) {
    const userRoles = await UserRole.find({
      tenant_id: req.tenantId,
      user_id: req.user._id
    }).populate('role_id');

    isSystemAdmin = userRoles.some(
      ur => ur.role_id && ['PLATFORM_SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(ur.role_id.code)
    );
  }

  if (!isSystemAdmin) {
    return {
      authorized: false,
      reason: 'Forbidden: SYSTEM_ADMIN privileges required to use migration adapter.'
    };
  }

  // 4. Tenant configuration gate: Active tenant must have allow_legacy_adapter === true
  const tenantId = req.tenantId || (req.tenant ? req.tenant._id : null);
  if (!tenantId) {
    return {
      authorized: false,
      reason: 'Tenant workspace context required.'
    };
  }

  const tenant = req.tenant || (await Tenant.findById(tenantId));
  if (!tenant) {
    return {
      authorized: false,
      reason: 'Tenant workspace not found.'
    };
  }

  const allowAdapter = Boolean(
    (tenant.settings && tenant.settings.allow_legacy_adapter === true) ||
    (tenant.metadata && tenant.metadata.allow_legacy_adapter === true)
  );

  if (!allowAdapter) {
    return {
      authorized: false,
      reason: 'Forbidden: Active tenant has not opted into migration adapter postings.'
    };
  }

  return { authorized: true };
}

module.exports = {
  authorizeMigrationAdapter
};
