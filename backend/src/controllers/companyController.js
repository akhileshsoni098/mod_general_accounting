const { Company, CompanyMembership, UserRole, Role, User, RolePermission, Permission } = require('../models');
const { initializeCompany } = require('../services/companyInitService');
const { getAllProfiles, isValidProfile, getProfile } = require('../config/businessProfiles');

/**
 * List companies accessible to the authenticated user within the active tenant.
 * Prevents unauthorized enumeration.
 */
async function listCompanies(req, res) {
  try {
    const tenantId = req.tenantId;

    // Check if user is a Tenant Admin with tenant-level COMPANY:ADMIN
    const tenantAdminRoles = await UserRole.find({
      tenant_id: tenantId,
      company_id: null,
      user_id: req.user._id
    }).populate('role_id');

    const roleIds = tenantAdminRoles.map(ur => ur.role_id?._id).filter(Boolean);
    let isTenantAdmin = false;
    if (roleIds.length > 0) {
      isTenantAdmin = await RolePermission.exists({
        role_id: { $in: roleIds },
        permission_id: await Permission.findOne({
          code: { $in: ['COMPANY:ADMIN', 'TENANT:UPDATE'] }
        }).select('_id')
      });
    }

    let companies;
    if (isTenantAdmin) {
      // Tenant admin can see all companies in this tenant
      companies = await Company.find({ tenant_id: tenantId, status: { $ne: 'ARCHIVED' } }).sort({ company_code: 1 });
    } else {
      // Regular user: only companies where they hold an active membership
      const memberships = await CompanyMembership.find({
        tenant_id: tenantId,
        user_id: req.user._id,
        status: 'ACTIVE'
      }).populate('company_id');

      companies = memberships
        .map(m => m.company_id)
        .filter(c => c && c.status === 'ACTIVE');
    }

    // Get user's default company preference
    const defaultMembership = await CompanyMembership.findOne({
      tenant_id: tenantId,
      user_id: req.user._id,
      is_default: true,
      status: 'ACTIVE'
    });

    const defaultCompanyId = defaultMembership ? defaultMembership.company_id.toString() : null;

    const result = companies.map(c => ({
      id: c._id.toString(),
      company_code: c.company_code,
      company_name: c.company_name,
      legal_name: c.legal_name,
      business_profile: c.business_profile,
      business_profile_label: getProfile(c.business_profile)?.label || c.business_profile,
      base_currency: c.base_currency,
      country_code: c.country_code,
      status: c.status,
      financial_year_start_month: c.financial_year_start_month,
      is_default: defaultCompanyId === c._id.toString()
    }));

    return res.success(result);
  } catch (err) {
    return res.error('Failed to list accessible companies', 500, err.message);
  }
}

/**
 * Create and initialize a new Company set of books.
 */
async function createCompany(req, res) {
  try {
    const tenantId = req.tenantId;
    const {
      company_code,
      company_name,
      legal_name,
      business_profile = 'GENERAL_RETAIL',
      description,
      country_code,
      base_currency,
      timezone,
      locale,
      financial_year_start_month,
      books_beginning_from,
      tax_jurisdiction,
      tax_details
    } = req.body;

    if (!company_code || !company_name) {
      return res.error('company_code and company_name are required', 400);
    }

    if (!isValidProfile(business_profile)) {
      return res.error(`Invalid business_profile: "${business_profile}"`, 400);
    }

    // Check duplicate company code in tenant
    const existing = await Company.findOne({
      tenant_id: tenantId,
      company_code: company_code.toUpperCase().trim()
    });

    if (existing) {
      return res.error(`Company code "${company_code.toUpperCase().trim()}" already exists in this tenant`, 409);
    }

    const initResult = await initializeCompany({
      tenantId,
      creatorUserId: req.user._id,
      companyCode: company_code,
      companyName: company_name,
      legalName: legal_name,
      businessProfile: business_profile,
      description,
      countryCode: country_code,
      baseCurrency: base_currency,
      timezone,
      locale,
      financialYearStartMonth: financial_year_start_month,
      booksBeginningFrom: books_beginning_from,
      taxJurisdiction: tax_jurisdiction,
      taxDetails: tax_details
    });

    return res.success({
      company: {
        id: initResult.company._id.toString(),
        company_code: initResult.company.company_code,
        company_name: initResult.company.company_name,
        legal_name: initResult.company.legal_name,
        business_profile: initResult.company.business_profile,
        base_currency: initResult.company.base_currency,
        country_code: initResult.company.country_code,
        status: initResult.company.status,
        financial_year_start_month: initResult.company.financial_year_start_month,
        books_beginning_from: initResult.company.books_beginning_from
      }
    }, { message: 'Company initialized successfully with chart of accounts and fiscal periods' }, 201);
  } catch (err) {
    return res.error('Failed to create company', 500, err.message);
  }
}

/**
 * Get details of a specific company.
 */
async function getCompanyDetails(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const company = await Company.findOne({
      _id: id,
      tenant_id: tenantId
    });

    if (!company) {
      return res.error('Company not found', 404);
    }

    // Check membership unless tenant admin
    const membership = await CompanyMembership.findOne({
      tenant_id: tenantId,
      company_id: company._id,
      user_id: req.user._id,
      status: 'ACTIVE'
    });

    if (!membership && !req.user.is_platform_admin) {
      const hasTenantAdminRole = await UserRole.findOne({
        tenant_id: tenantId,
        company_id: null,
        user_id: req.user._id
      });
      if (!hasTenantAdminRole) {
        return res.error('Access denied: You are not a member of this company', 403);
      }
    }

    return res.success({
      id: company._id.toString(),
      company_code: company.company_code,
      company_name: company.company_name,
      legal_name: company.legal_name,
      business_profile: company.business_profile,
      business_profile_details: getProfile(company.business_profile),
      description: company.description,
      country_code: company.country_code,
      base_currency: company.base_currency,
      timezone: company.timezone,
      locale: company.locale,
      financial_year_start_month: company.financial_year_start_month,
      financial_year_config: company.financial_year_config,
      books_beginning_from: company.books_beginning_from,
      tax_jurisdiction: company.tax_jurisdiction,
      tax_details: company.tax_details,
      status: company.status,
      created_at: company.created_at
    });
  } catch (err) {
    return res.error('Failed to get company details', 500, err.message);
  }
}

/**
 * Update permitted company settings.
 */
async function updateCompany(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const {
      company_name,
      legal_name,
      description,
      timezone,
      locale,
      tax_jurisdiction,
      tax_details
    } = req.body;

    const company = await Company.findOne({
      _id: id,
      tenant_id: tenantId
    });

    if (!company) {
      return res.error('Company not found', 404);
    }

    if (company_name) company.company_name = company_name.trim();
    if (legal_name !== undefined) company.legal_name = legal_name.trim();
    if (description !== undefined) company.description = description.trim();
    if (timezone) company.timezone = timezone.trim();
    if (locale) company.locale = locale.trim();
    if (tax_jurisdiction) company.tax_jurisdiction = tax_jurisdiction.trim();
    if (tax_details) company.tax_details = { ...company.tax_details, ...tax_details };

    company.row_version = (company.row_version || 1) + 1;
    await company.save();

    return res.success({
      id: company._id.toString(),
      company_code: company.company_code,
      company_name: company.company_name,
      legal_name: company.legal_name,
      business_profile: company.business_profile,
      status: company.status
    }, { message: 'Company settings updated successfully' });
  } catch (err) {
    return res.error('Failed to update company settings', 500, err.message);
  }
}

/**
 * Switch/select active company context.
 */
async function switchCompany(req, res) {
  try {
    const { company_id, make_default = false } = req.body;
    const tenantId = req.tenantId;

    if (!company_id) {
      return res.error('company_id is required', 400);
    }

    const company = await Company.findOne({
      _id: company_id,
      tenant_id: tenantId,
      status: 'ACTIVE'
    });

    if (!company) {
      return res.error('Company not found or inactive in this workspace', 404);
    }

    // Verify user authorization for target company
    const membership = await CompanyMembership.findOne({
      tenant_id: tenantId,
      company_id: company._id,
      user_id: req.user._id,
      status: 'ACTIVE'
    });

    if (!membership) {
      // Check if tenant admin
      const hasTenantAdminRole = await UserRole.findOne({
        tenant_id: tenantId,
        company_id: null,
        user_id: req.user._id
      });
      if (!hasTenantAdminRole) {
        return res.error('Access denied: You are not authorized for this company', 403);
      }
    }

    if (make_default) {
      // Reset prior defaults and set this company as default
      await CompanyMembership.updateMany(
        { tenant_id: tenantId, user_id: req.user._id },
        { is_default: false }
      );
      if (membership) {
        membership.is_default = true;
        await membership.save();
      }
    }

    // Get company-scoped permissions
    const companyRoles = await UserRole.find({
      tenant_id: tenantId,
      user_id: req.user._id,
      $or: [{ company_id: company._id }, { company_id: null }]
    }).populate('role_id');

    const roleCodes = companyRoles.map(ur => ur.role_id?.code).filter(Boolean);
    const roleIds = companyRoles.map(ur => ur.role_id?._id).filter(Boolean);
    const rolePermissions = await RolePermission.find({ role_id: { $in: roleIds } }).populate('permission_id');
    const permissions = [...new Set(rolePermissions.map(rp => rp.permission_id?.code).filter(Boolean))];

    return res.success({
      active_company: {
        id: company._id.toString(),
        company_code: company.company_code,
        company_name: company.company_name,
        legal_name: company.legal_name,
        business_profile: company.business_profile,
        base_currency: company.base_currency,
        country_code: company.country_code,
        status: company.status
      },
      roles: roleCodes,
      permissions
    }, { message: `Active company switched to ${company.company_name}` });
  } catch (err) {
    return res.error('Failed to switch company context', 500, err.message);
  }
}

/**
 * List memberships in a company.
 */
async function listMembers(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const memberships = await CompanyMembership.find({
      tenant_id: tenantId,
      company_id: id
    }).populate('user_id', 'email first_name last_name status');

    const result = memberships.map(m => ({
      membership_id: m._id.toString(),
      user: m.user_id ? {
        id: m.user_id._id.toString(),
        email: m.user_id.email,
        name: `${m.user_id.first_name} ${m.user_id.last_name}`,
        status: m.user_id.status
      } : null,
      status: m.status,
      is_default: m.is_default,
      joined_at: m.joined_at
    }));

    return res.success(result);
  } catch (err) {
    return res.error('Failed to list company members', 500, err.message);
  }
}

/**
 * Add a member to a company with an assigned role.
 */
async function addMember(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const { user_id, role_code = 'ACCOUNTANT' } = req.body;

    if (!user_id) {
      return res.error('user_id is required', 400);
    }

    const company = await Company.findOne({ _id: id, tenant_id: tenantId });
    if (!company) {
      return res.error('Company not found', 404);
    }

    const targetUser = await User.findById(user_id);
    if (!targetUser || targetUser.status !== 'ACTIVE') {
      return res.error('User not found or inactive', 404);
    }

    // Upsert membership
    const membership = await CompanyMembership.findOneAndUpdate(
      { tenant_id: tenantId, company_id: company._id, user_id: targetUser._id },
      { status: 'ACTIVE', joined_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Assign company-scoped role
    if (role_code) {
      const role = await Role.findOne({ code: role_code.toUpperCase().trim(), tenant_id: null });
      if (role) {
        await UserRole.findOneAndUpdate(
          { tenant_id: tenantId, company_id: company._id, user_id: targetUser._id, role_id: role._id },
          {},
          { upsert: true, setDefaultsOnInsert: true }
        );
      }
    }

    return res.success({
      membership_id: membership._id.toString(),
      company_id: company._id.toString(),
      user_id: targetUser._id.toString(),
      status: membership.status
    }, { message: 'Member added to company successfully' }, 201);
  } catch (err) {
    return res.error('Failed to add company member', 500, err.message);
  }
}

/**
 * Return all available business profiles.
 */
function getBusinessProfilesList(req, res) {
  return res.success(getAllProfiles());
}

module.exports = {
  listCompanies,
  createCompany,
  getCompanyDetails,
  updateCompany,
  switchCompany,
  listMembers,
  addMember,
  getBusinessProfilesList
};
