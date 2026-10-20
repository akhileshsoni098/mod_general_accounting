const jwt = require('jsonwebtoken');
const { User, TenantMembership, Tenant } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'veridex_saas_finance_super_secret_jwt_2026';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || `${JWT_SECRET}_refresh_vault_2026`;

const ACCESS_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '1h';
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

/**
 * Generates a short-lived access JWT.
 */
function generateToken(payload, expiresIn = ACCESS_EXPIRES_IN) {
  return jwt.sign({ ...payload, tokenType: 'access' }, JWT_SECRET, { expiresIn });
}

/**
 * Generates a signed refresh token JWT.
 */
function generateRefreshToken(payload, expiresIn = REFRESH_EXPIRES_IN) {
  return jwt.sign({ ...payload, tokenType: 'refresh' }, REFRESH_SECRET, { expiresIn });
}

/**
 * Verifies and decodes a refresh token.
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET);
    if (decoded.tokenType !== 'refresh') {
      throw new Error('Token is not a valid refresh token');
    }
    return decoded;
  } catch (err) {
    throw new Error(err.message || 'Invalid or expired refresh token');
  }
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.error('Authorization token required', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Reject refresh tokens used as access tokens
    if (decoded.tokenType && decoded.tokenType !== 'access') {
      return res.error('Invalid token type: access token required', 401);
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'ACTIVE') {
      return res.error('User not found or account is deactivated', 401);
    }

    req.userId = user._id;
    req.user = user;
    
    // Explicit tenant override header if switching workspaces, or token active tenant
    const headerTenantId = req.headers['x-tenant-id'];
    const activeTenantId = headerTenantId || decoded.tenantId || (user.default_tenant_id ? user.default_tenant_id.toString() : null);

    if (activeTenantId) {
      req.tenantId = activeTenantId;
    }

    next();
  } catch (err) {
    return res.error('Invalid or expired authentication token', 401, err.message);
  }
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  requireAuth
};

