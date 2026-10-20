const { Company, CompanyMembership, UserRole, Role, RolePermission, Permission } = require('../models');

/**
 * Validates that an active company is selected, belongs to the current tenant,
 * and that the authenticated user is explicitly authorized to access it.
 */
async function requireCompanyContext(req, res, next) {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.error('Tenant context is required before resolving company context', 400);
    }

    // Resolve company selection hint from header, query, or body
    let companyIdHint = req.headers['x-company-id'] || req.query.company_id || req.body?.company_id;

    // If no explicit hint provided, check for a user's default company membership in this tenant
    if (!companyIdHint && req.user) {
      const defaultMembership = await CompanyMembership.findOne({
        tenant_id: tenantId,
        user_id: req.user._id,
        status: 'ACTIVE',
        is_default: true
      });
      if (defaultMembership) {
        companyIdHint = defaultMembership.company_id.toString();
      } else {
        // Or pick first active membership
        const firstMembership = await CompanyMembership.findOne({
          tenant_id: tenantId,
          user_id: req.user._id,
          status: 'ACTIVE'
        });
        if (firstMembership) {
          companyIdHint = firstMembership.company_id.toString();
        }
      }
    }

    if (!companyIdHint) {
      return res.error('Active company context is required (Header: x-company-id)', 400, {
        code: 'COMPANY_CONTEXT_REQUIRED'
      });
    }

    // 1. Verify Company exists and belongs to this tenant
    const company = await Company.findById(companyIdHint);
    if (!company) {
      return res.error(`Company not found for ID: ${companyIdHint}`, 404);
    }

    // 2. Cross-tenant isolation check: Company must belong to the active tenant
    if (company.tenant_id.toString() !== tenantId.toString()) {
      return res.error('Access denied: Selected company does not belong to your active tenant', 403, {
        code: 'CROSS_TENANT_COMPANY_ACCESS_DENIED'
      });
    }

    // 3. Company status check
    if (company.status !== 'ACTIVE') {
      return res.error(`Company "${company.company_name}" is currently ${company.status}`, 403, {
        code: 'COMPANY_INACTIVE'
      });
    }

    // 4. Validate user's authorization to access this specific company
    // Check direct CompanyMembership
    const membership = await CompanyMembership.findOne({
      tenant_id: tenantId,
      company_id: company._id,
      user_id: req.user._id,
      status: 'ACTIVE'
    });

    let isAuthorized = !!membership;

    // Check if user is a Tenant Administrator with tenant-level COMPANY:ADMIN or TENANT:ADMIN
    if (!isAuthorized) {
      const tenantAdminRoles = await UserRole.find({
        tenant_id: tenantId,
        company_id: null,
        user_id: req.user._id
      }).populate('role_id');

      const roleIds = tenantAdminRoles.map(ur => ur.role_id?._id).filter(Boolean);
      if (roleIds.length > 0) {
        const hasAdminPermission = await RolePermission.exists({
          role_id: { $in: roleIds },
          permission_id: await Permission.findOne({
            code: { $in: ['COMPANY:ADMIN', 'TENANT:UPDATE'] }
          }).select('_id')
        });
        if (hasAdminPermission) {
          isAuthorized = true;
        }
      }
    }

    // Note: Platform super admins are NOT given implicit backdoor access to underlying financial records
    // without an explicit validated tenant/company support membership.
    if (!isAuthorized) {
      return res.error('Access denied: You are not authorized to access this company books', 403, {
        code: 'COMPANY_MEMBERSHIP_REQUIRED'
      });
    }

    // Populate trusted request context
    req.companyId = company._id.toString();
    req.company = company;
    req.companyMembership = membership || null;

    next();
  } catch (err) {
    return res.error('Company context resolution failed', 500, err.message);
  }
}

/**
 * Middleware factory enforcing company-level permissions.
 * Evaluates company-scoped roles first, falling back to tenant-level roles.
 */
function requireCompanyPermission(requiredPermissionCode) {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId;
      const companyId = req.companyId;

      if (!tenantId || !companyId) {
        return res.error('Tenant and Company context required for permission check', 400);
      }

      // 1. Find user roles applicable to this company:
      // (a) Scoped directly to this company
      // (b) Scoped tenant-wide (company_id: null)
      const userRoles = await UserRole.find({
        tenant_id: tenantId,
        user_id: req.user._id,
        $or: [
          { company_id: companyId },
          { company_id: null }
        ]
      });

      if (!userRoles || userRoles.length === 0) {
        return res.error('Forbidden: No role assignments found for this company', 403);
      }

      const roleIds = userRoles.map(ur => ur.role_id);
      const permCodes = Array.isArray(requiredPermissionCode) ? requiredPermissionCode : [requiredPermissionCode];
      const permDocs = await Permission.find({ code: { $in: permCodes } });
      if (!permDocs || permDocs.length === 0) {
        return res.error(`Unknown permission requirement: ${JSON.stringify(requiredPermissionCode)}`, 500);
      }

      const permIds = permDocs.map(p => p._id);
      const hasPerm = await RolePermission.exists({
        role_id: { $in: roleIds },
        permission_id: { $in: permIds }
      });

      if (!hasPerm) {
        return res.error(`Forbidden: Missing required company permission [${permCodes.join(', ')}]`, 403);
      }

      next();
    } catch (err) {
      return res.error('Company permission verification error', 500, err.message);
    }
  };
}

module.exports = {
  requireCompanyContext,
  requireCompanyPermission
};
