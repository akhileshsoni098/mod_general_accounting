const { Tenant, TenantMembership, UserRole, Role, RolePermission, Permission, TenantModuleEntitlement } = require('../models');

async function requireTenantWorkspace(req, res, next) {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.tenantId;
    if (!tenantId) {
      return res.error('Active tenant workspace is required (Header x-tenant-id)', 400);
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.error(`Tenant workspace not found for ID: ${tenantId}`, 404);
    }
    if (tenant.status !== 'ACTIVE') {
      return res.error(`Tenant workspace is ${tenant.status}`, 403);
    }

    // Verify user membership in this tenant unless platform admin
    if (!req.user.is_platform_admin) {
      const membership = await TenantMembership.findOne({
        tenant_id: tenant._id,
        user_id: req.user._id,
        status: 'ACTIVE'
      });

      if (!membership) {
        return res.error('Access denied: You are not an active member of this tenant workspace', 403);
      }
      req.membership = membership;
    }

    req.tenantId = tenant._id.toString();
    req.tenant = tenant;

    next();
  } catch (err) {
    return res.error('Tenant workspace validation failed', 500, err.message);
  }
}

function requirePermission(requiredPermissionCode) {
  return async (req, res, next) => {
    try {
      if (req.user && req.user.is_platform_admin) {
        return next();
      }

      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.error('Tenant context required for permission check', 400);
      }

      // Find all roles assigned to user in this tenant
      const userRoles = await UserRole.find({
        tenant_id: tenantId,
        user_id: req.user._id
      }).populate('role_id');

      if (!userRoles || userRoles.length === 0) {
        return res.error(`Forbidden: No roles assigned in this workspace`, 403);
      }

      // If user has TENANT_ADMIN or PLATFORM_SUPER_ADMIN role, grant access across tenant-level operations
      const isTenantAdmin = userRoles.some(ur => {
        const code = ur.role_id?.code;
        return code === 'TENANT_ADMIN' || code === 'PLATFORM_SUPER_ADMIN';
      });
      if (isTenantAdmin) {
        return next();
      }

      const roleIds = userRoles.map(ur => ur.role_id?._id || ur.role_id);
      const permCodes = Array.isArray(requiredPermissionCode) ? requiredPermissionCode : [requiredPermissionCode];
      const permDocs = await Permission.find({ code: { $in: permCodes } });
      if (!permDocs || permDocs.length === 0) {
        return res.error(`Unknown permission requirement: ${permCodes.join(' or ')}`, 500);
      }
      const permIds = permDocs.map(p => p._id);

      const hasPerm = await RolePermission.exists({
        role_id: { $in: roleIds },
        permission_id: { $in: permIds }
      });

      if (!hasPerm) {
        return res.error(`Forbidden: Missing required permission [${permCodes.join(' or ')}]`, 403);
      }

      next();
    } catch (err) {
      return res.error('Permission verification error', 500, err.message);
    }
  };
}

function requireModuleEntitlement(moduleCode) {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.error('Tenant context required for module check', 400);
      }

      const entitlement = await TenantModuleEntitlement.findOne({
        tenant_id: tenantId,
        module_code: moduleCode.toUpperCase()
      });

      if (!entitlement || !entitlement.is_enabled) {
        return res.error(`Module [${moduleCode}] is disabled or not licensed for this tenant`, 403);
      }

      req.moduleEntitlement = entitlement;
      next();
    } catch (err) {
      return res.error('Module entitlement check error', 500, err.message);
    }
  };
}

module.exports = {
  requireTenantWorkspace,
  requirePermission,
  requireModuleEntitlement
};
