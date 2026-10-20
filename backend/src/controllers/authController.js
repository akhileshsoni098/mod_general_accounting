const {
  Tenant,
  User,
  TenantMembership,
  Role,
  UserRole,
  TenantModuleEntitlement,
  RolePermission,
  Permission,
  UserSession,
  PasswordResetToken,
  Company,
  CompanyMembership
} = require('../models');
const { initializeCompany } = require('../services/companyInitService');
const {
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordStrength,
  generateSecureToken,
  hashToken
} = require('../utils/crypto');
const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
} = require('../middleware/authMiddleware');
const {
  isAccountLocked,
  recordFailedLogin,
  recordSuccessfulLogin
} = require('../middleware/rateLimiter');
const { v4: uuidv4 } = require('uuid');

const FINANCE_MODULES = [
  'GL',
  'BILLING_AR',
  'COMMISSIONS_FIDUCIARY',
  'TREASURY_BANK_REC',
  'FINANCE_CLOSE'
];

/**
 * Register a new Tenant with Tenant Admin user, memberships, default roles, and enabled modules
 */
async function registerTenant(req, res) {
  try {
    const {
      tenant_code,
      tenant_name,
      tenant_type = 'MGA',
      base_currency = 'USD',
      admin_first_name,
      admin_last_name,
      admin_email,
      admin_password
    } = req.body;

    if (!tenant_code || !tenant_name || !admin_email || !admin_password || !admin_first_name || !admin_last_name) {
      return res.error('All fields (tenant_code, tenant_name, admin_first_name, admin_last_name, admin_email, admin_password) are required', 400);
    }

    const pwdCheck = validatePasswordStrength(admin_password);
    if (!pwdCheck.valid) {
      return res.error(pwdCheck.message, 400);
    }

    const validTenantTypes = ['CARRIER', 'MGA', 'BROKER', 'OTHER'];
    const normalizedType = (tenant_type || 'MGA').toUpperCase().trim();
    if (!validTenantTypes.includes(normalizedType)) {
      return res.error(`Invalid tenant_type. Must be one of: ${validTenantTypes.join(', ')}`, 400);
    }

    // Check duplicate tenant
    const existingTenant = await Tenant.findOne({ tenant_code: tenant_code.toUpperCase().trim() });
    if (existingTenant) {
      return res.error(`Tenant code "${tenant_code.toUpperCase().trim()}" is already registered`, 409);
    }

    // 1. Create Tenant
    const tenant = await Tenant.create({
      tenant_code: tenant_code.toUpperCase().trim(),
      name: tenant_name.trim(),
      tenant_type: normalizedType,
      base_currency: base_currency.toUpperCase().trim(),
      status: 'ACTIVE'
    });

    // 2. Create or Find User
    let user = await User.findOne({ email: admin_email.toLowerCase().trim() });
    if (!user) {
      user = await User.create({
        email: admin_email.toLowerCase().trim(),
        password_hash: hashPassword(admin_password),
        first_name: admin_first_name.trim(),
        last_name: admin_last_name.trim(),
        default_tenant_id: tenant._id,
        status: 'ACTIVE'
      });
    } else {
      if (!user.default_tenant_id) {
        user.default_tenant_id = tenant._id;
        await user.save();
      }
    }

    // 3. Create TenantMembership
    await TenantMembership.findOneAndUpdate(
      { tenant_id: tenant._id, user_id: user._id },
      { status: 'ACTIVE', joined_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 4. Assign TENANT_ADMIN role
    // Find system TENANT_ADMIN role or create tenant-specific if needed
    let tenantAdminRole = await Role.findOne({ code: 'TENANT_ADMIN', tenant_id: null });
    if (!tenantAdminRole) {
      tenantAdminRole = await Role.create({
        code: 'TENANT_ADMIN',
        name: 'Tenant Administrator',
        description: 'Full administrative access across all tenant settings and finance modules',
        is_system_role: true
      });
    }

    await UserRole.findOneAndUpdate(
      { tenant_id: tenant._id, user_id: user._id, role_id: tenantAdminRole._id },
      {},
      { upsert: true, setDefaultsOnInsert: true }
    );

    // 5. Initialize Module Entitlements (all 5 enabled by default)
    for (const mod of FINANCE_MODULES) {
      await TenantModuleEntitlement.findOneAndUpdate(
        { tenant_id: tenant._id, module_code: mod },
        { is_enabled: true, config: {} },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // 6. Initialize Primary Company for this Tenant
    let primaryCompany = null;
    try {
      const companyInit = await initializeCompany({
        tenantId: tenant._id,
        creatorUserId: user._id,
        companyCode: 'MAIN',
        companyName: `${tenant.name} Primary Company`,
        legalName: tenant.name,
        businessProfile: 'GENERAL_RETAIL',
        baseCurrency: tenant.base_currency,
        financialYearStartMonth: tenant.fiscal_year_start_month || 4
      });
      primaryCompany = companyInit.company;
    } catch (cmpErr) {
      console.warn('[Company Init Warning during Register]', cmpErr.message);
    }

    // 7. Generate Access & Refresh Tokens
    const familyId = uuidv4();
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      tenantId: tenant._id.toString()
    });
    const refreshToken = generateRefreshToken({
      userId: user._id.toString(),
      familyId
    });

    try {
      await UserSession.create({
        user_id: user._id,
        tenant_id: tenant._id,
        refresh_token_hash: hashToken(refreshToken),
        family_id: familyId,
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'] || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    } catch (sessErr) {
      console.error('[Session Error]', sessErr.message);
    }

    return res.success({
      token,
      refresh_token: refreshToken,
      tenant: {
        id: tenant._id.toString(),
        tenant_code: tenant.tenant_code,
        name: tenant.name,
        tenant_type: tenant.tenant_type,
        base_currency: tenant.base_currency,
        status: tenant.status
      },
      company: primaryCompany ? {
        id: primaryCompany._id.toString(),
        company_code: primaryCompany.company_code,
        company_name: primaryCompany.company_name,
        business_profile: primaryCompany.business_profile,
        base_currency: primaryCompany.base_currency,
        status: primaryCompany.status
      } : null,
      user: {
        id: user._id.toString(),
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_platform_admin: user.is_platform_admin
      }
    }, { message: 'Tenant onboarded successfully' }, 201);
  } catch (err) {
    return res.error('Failed to register tenant workspace', 500, err.message);
  }
}

/**
 * User Login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.error('Email and password are required', 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Account Lockout Check
    const lockStatus = isAccountLocked(normalizedEmail);
    if (lockStatus.locked) {
      return res.error(
        `Account is temporarily locked due to excessive failed attempts. Please try again in ${lockStatus.remainingMinutes} minute(s).`,
        423
      );
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      recordFailedLogin(normalizedEmail);
      return res.error('Invalid email or password credentials', 401);
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      recordFailedLogin(normalizedEmail);
      return res.error('Invalid email or password credentials', 401);
    }

    if (user.status !== 'ACTIVE') {
      return res.error(`User account is ${user.status}`, 403);
    }

    // Login succeeded: Clear failed attempts
    recordSuccessfulLogin(normalizedEmail);

    // 2. Transparent Password Hash Modernization (PBKDF2 210,000 iterations)
    if (needsRehash(user.password_hash)) {
      try {
        user.password_hash = hashPassword(password);
        await user.save();
        console.log(`[Security] Upgraded password hash to modern PBKDF2 v2 for user: ${user.email}`);
      } catch (upgradeErr) {
        console.error('[Security] Failed to upgrade password hash:', upgradeErr.message);
      }
    }

    // Find available workspaces
    const memberships = await TenantMembership.find({ user_id: user._id, status: 'ACTIVE' }).populate('tenant_id');
    const workspaces = memberships
      .filter(m => m.tenant_id && m.tenant_id.status === 'ACTIVE')
      .map(m => ({
        id: m.tenant_id._id,
        tenant_code: m.tenant_id.tenant_code,
        name: m.tenant_id.name,
        tenant_type: m.tenant_id.tenant_type || 'MGA',
        base_currency: m.tenant_id.base_currency,
        status: m.tenant_id.status
      }));

    // Choose active tenant: user default or first workspace
    let activeTenant = null;
    if (user.default_tenant_id && workspaces.some(w => w.id.toString() === user.default_tenant_id.toString())) {
      activeTenant = workspaces.find(w => w.id.toString() === user.default_tenant_id.toString());
    } else if (workspaces.length > 0) {
      activeTenant = workspaces[0];
    }

    // Resolve companies accessible in active workspace
    let availableCompanies = [];
    let activeCompany = null;
    if (activeTenant) {
      const cmpMemberships = await CompanyMembership.find({
        tenant_id: activeTenant.id,
        user_id: user._id,
        status: 'ACTIVE'
      }).populate('company_id');

      availableCompanies = cmpMemberships
        .map(m => m.company_id)
        .filter(c => c && c.status === 'ACTIVE')
        .map(c => ({
          id: c._id.toString(),
          company_code: c.company_code,
          company_name: c.company_name,
          legal_name: c.legal_name,
          business_profile: c.business_profile,
          base_currency: c.base_currency,
          status: c.status
        }));

      const defaultCmp = cmpMemberships.find(m => m.is_default && m.company_id && m.company_id.status === 'ACTIVE');
      if (defaultCmp) {
        activeCompany = availableCompanies.find(c => c.id === defaultCmp.company_id._id.toString());
      } else if (availableCompanies.length > 0) {
        activeCompany = availableCompanies[0];
      }
    }

    // 3. Generate Access Token & Refresh Token with Session Family
    const familyId = uuidv4();
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      tenantId: activeTenant ? activeTenant.id.toString() : null
    });
    const refreshToken = generateRefreshToken({
      userId: user._id.toString(),
      familyId
    });

    try {
      await UserSession.create({
        user_id: user._id,
        tenant_id: activeTenant ? activeTenant.id : null,
        refresh_token_hash: hashToken(refreshToken),
        family_id: familyId,
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'] || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    } catch (sessErr) {
      console.error('[Session Create Error]', sessErr.message);
    }

    return res.success({
      token,
      refresh_token: refreshToken,
      user: {
        id: user._id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_platform_admin: user.is_platform_admin
      },
      active_workspace: activeTenant,
      available_workspaces: workspaces,
      active_company: activeCompany,
      available_companies: availableCompanies
    }, { message: 'Authentication successful' });
  } catch (err) {
    return res.error('Login failed', 500, err.message);
  }
}

/**
 * Get current user & workspace session details
 */
async function getMe(req, res) {
  try {
    const user = req.user;
    
    // Find active memberships
    const memberships = await TenantMembership.find({ user_id: user._id, status: 'ACTIVE' }).populate('tenant_id');
    const workspaces = memberships
      .filter(m => m.tenant_id && m.tenant_id.status === 'ACTIVE')
      .map(m => ({
        id: m.tenant_id._id,
        tenant_code: m.tenant_id.tenant_code,
        name: m.tenant_id.name,
        tenant_type: m.tenant_id.tenant_type || 'MGA',
        base_currency: m.tenant_id.base_currency,
        status: m.tenant_id.status
      }));

    let currentTenant = null;
    let roles = [];
    let permissions = [];
    let entitlements = [];

    if (req.tenantId) {
      currentTenant = await Tenant.findById(req.tenantId);
      if (currentTenant) {
        // Get user roles in this tenant
        const userRoles = await UserRole.find({ tenant_id: currentTenant._id, user_id: user._id }).populate('role_id');
        roles = userRoles.map(ur => ur.role_id ? ur.role_id.code : null).filter(Boolean);

        // Get permissions
        const roleIds = userRoles.map(ur => ur.role_id ? ur.role_id._id : null).filter(Boolean);
        const rolePermissions = await RolePermission.find({ role_id: { $in: roleIds } }).populate('permission_id');
        permissions = [...new Set(rolePermissions.map(rp => rp.permission_id ? rp.permission_id.code : null).filter(Boolean))];

        // Get module entitlements
        const ents = await TenantModuleEntitlement.find({ tenant_id: currentTenant._id });
        entitlements = ents.map(e => ({
          module_code: e.module_code,
          is_enabled: e.is_enabled,
          config: e.config
        }));

        // Get companies accessible in this workspace
        const cmpMemberships = await CompanyMembership.find({
          tenant_id: currentTenant._id,
          user_id: user._id,
          status: 'ACTIVE'
        }).populate('company_id');

        availableCompanies = cmpMemberships
          .map(m => m.company_id)
          .filter(c => c && c.status === 'ACTIVE')
          .map(c => ({
            id: c._id.toString(),
            company_code: c.company_code,
            company_name: c.company_name,
            legal_name: c.legal_name,
            business_profile: c.business_profile,
            base_currency: c.base_currency,
            status: c.status,
            financial_year_start_month: c.financial_year_start_month
          }));

        const headerCompanyId = req.headers['x-company-id'];
        if (headerCompanyId && availableCompanies.some(c => c.id === headerCompanyId)) {
          currentCompany = availableCompanies.find(c => c.id === headerCompanyId);
        } else {
          const defaultCmp = cmpMemberships.find(m => m.is_default && m.company_id && m.company_id.status === 'ACTIVE');
          if (defaultCmp) {
            currentCompany = availableCompanies.find(c => c.id === defaultCmp.company_id._id.toString());
          } else if (availableCompanies.length > 0) {
            currentCompany = availableCompanies[0];
          }
        }
      }
    }

    return res.success({
      user: {
        id: user._id.toString(),
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_platform_admin: user.is_platform_admin
      },
      current_workspace: currentTenant ? {
        id: currentTenant._id.toString(),
        tenant_code: currentTenant.tenant_code,
        name: currentTenant.name,
        tenant_type: currentTenant.tenant_type || 'MGA',
        base_currency: currentTenant.base_currency,
        status: currentTenant.status,
        timezone: currentTenant.timezone,
        fiscal_year_start_month: currentTenant.fiscal_year_start_month
      } : null,
      current_company: currentCompany,
      available_companies: availableCompanies,
      roles,
      permissions,
      entitlements,
      available_workspaces: workspaces.map(w => ({
        ...w,
        id: w.id ? w.id.toString() : w._id ? w._id.toString() : null
      }))
    });
  } catch (err) {
    return res.error('Failed to retrieve user profile', 500, err.message);
  }
}

/**
 * Refresh Access Token using Refresh Token Rotation (with reuse detection)
 */
async function refreshToken(req, res) {
  try {
    const rawRefreshToken = req.body?.refresh_token || req.headers['x-refresh-token'];
    if (!rawRefreshToken) {
      return res.error('refresh_token is required', 400);
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(rawRefreshToken);
    } catch (jwtErr) {
      return res.error('Invalid or expired refresh token', 401, jwtErr.message);
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await UserSession.findOne({ refresh_token_hash: tokenHash });

    if (!session) {
      return res.error('Refresh token session not found or already purged', 401);
    }

    // Reuse detection: If session was already marked revoked, invalidate the entire family!
    if (session.is_revoked) {
      await UserSession.updateMany(
        { family_id: session.family_id },
        { is_revoked: true, revoked_at: new Date(), revoked_reason: 'TOKEN_REUSE_DETECTED' }
      );
      return res.error('Security alert: Refresh token reuse detected. All active sessions have been invalidated.', 401);
    }

    const user = await User.findById(session.user_id);
    if (!user || user.status !== 'ACTIVE') {
      return res.error('User account is deactivated or not found', 401);
    }

    // Mark current refresh token as used/revoked via rotation
    session.is_revoked = true;
    session.revoked_at = new Date();
    session.revoked_reason = 'REPLACED_BY_ROTATION';
    await session.save();

    // Issue fresh access token and fresh rotated refresh token in the same family
    const newAccessToken = generateToken({
      userId: user._id.toString(),
      email: user.email,
      tenantId: session.tenant_id ? session.tenant_id.toString() : null
    });
    const newRefreshToken = generateRefreshToken({
      userId: user._id.toString(),
      familyId: session.family_id
    });

    try {
      await UserSession.create({
        user_id: user._id,
        tenant_id: session.tenant_id,
        refresh_token_hash: hashToken(newRefreshToken),
        family_id: session.family_id,
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'] || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    } catch (sessErr) {
      console.error('[Session Rotation Error]', sessErr.message);
    }

    return res.success({
      token: newAccessToken,
      refresh_token: newRefreshToken
    }, { message: 'Token refreshed successfully' });
  } catch (err) {
    return res.error('Failed to refresh token', 500, err.message);
  }
}

/**
 * Password Recovery: Request Reset Token
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.error('email is required', 400);
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always return generic success to prevent email enumeration attacks
    const genericResponse = {
      message: 'If the provided email is registered, a password recovery token has been issued.'
    };

    if (!user || user.status !== 'ACTIVE') {
      return res.success(genericResponse);
    }

    const rawResetToken = generateSecureToken(32);
    const tokenHash = hashToken(rawResetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing unused reset tokens for this user
    await PasswordResetToken.updateMany(
      { user_id: user._id, is_used: false },
      { is_used: true, used_at: new Date() }
    );

    await PasswordResetToken.create({
      user_id: user._id,
      token_hash: tokenHash,
      expires_at: expiresAt
    });

    // In development or test, return token in payload for verification and automated tests
    if (process.env.NODE_ENV !== 'production') {
      return res.success({
        ...genericResponse,
        dev_reset_token: rawResetToken,
        expires_at: expiresAt.toISOString()
      });
    }

    return res.success(genericResponse);
  } catch (err) {
    return res.error('Failed to initiate password recovery', 500, err.message);
  }
}

/**
 * Password Recovery: Complete Password Reset
 */
async function resetPassword(req, res) {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.error('token and new_password are required', 400);
    }

    const pwdCheck = validatePasswordStrength(new_password);
    if (!pwdCheck.valid) {
      return res.error(pwdCheck.message, 400);
    }

    const tokenHash = hashToken(token);
    const resetRecord = await PasswordResetToken.findOne({
      token_hash: tokenHash,
      is_used: false,
      expires_at: { $gt: new Date() }
    });

    if (!resetRecord) {
      return res.error('Password reset token is invalid or has expired', 400);
    }

    const user = await User.findById(resetRecord.user_id);
    if (!user || user.status !== 'ACTIVE') {
      return res.error('Associated user account is deactivated or not found', 400);
    }

    // Update password using modern PBKDF2 v2
    user.password_hash = hashPassword(new_password);
    await user.save();

    // Mark reset token used
    resetRecord.is_used = true;
    resetRecord.used_at = new Date();
    await resetRecord.save();

    // Invalidate all active user sessions upon password reset
    await UserSession.updateMany(
      { user_id: user._id, is_revoked: false },
      { is_revoked: true, revoked_at: new Date(), revoked_reason: 'PASSWORD_RESET' }
    );

    // Reset failed login attempts
    recordSuccessfulLogin(user.email);

    return res.success({
      password_reset: true
    }, { message: 'Password has been reset successfully. Please log in with your new credentials.' });
  } catch (err) {
    return res.error('Failed to reset password', 500, err.message);
  }
}

/**
 * Logout & Session Revocation
 */
async function logout(req, res) {
  try {
    const rawRefreshToken = req.body?.refresh_token || req.headers['x-refresh-token'];
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await UserSession.updateOne(
        { refresh_token_hash: tokenHash },
        { is_revoked: true, revoked_at: new Date(), revoked_reason: 'USER_LOGOUT' }
      );
    }
    if (req.user) {
      await UserSession.updateMany(
        { user_id: req.user._id, is_revoked: false },
        { is_revoked: true, revoked_at: new Date(), revoked_reason: 'USER_LOGOUT' }
      );
    }
    return res.success({ logged_out: true }, { message: 'Logged out successfully' });
  } catch (err) {
    return res.success({ logged_out: true }, { message: 'Logged out successfully' });
  }
}

module.exports = {
  registerTenant,
  login,
  getMe,
  refreshToken,
  forgotPassword,
  resetPassword,
  logout
};
