const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// Target modules under test
const {
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordStrength,
  generateSecureToken,
  hashToken,
  DEFAULT_ITERATIONS
} = require('../src/utils/crypto');

const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  requireAuth
} = require('../src/middleware/authMiddleware');

const {
  createRateLimiter,
  isAccountLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  resetLimiterStateForTesting
} = require('../src/middleware/rateLimiter');

const {
  isOriginAllowed,
  createCorsOptions
} = require('../src/config/corsConfig');

// =========================================================================
// 1. Password Hashing & Backward-Compatibility Unit Tests
// =========================================================================
test('Password Hashing: generates modern pbkdf2v2 format with 210,000 iterations', () => {
  const password = 'SuperSecret2026!#';
  const hashed = hashPassword(password);

  assert.ok(hashed.startsWith('pbkdf2v2:'), 'Hash must start with pbkdf2v2 prefix');
  const parts = hashed.split(':');
  assert.strictEqual(parts.length, 4, 'Modern hash must have exactly 4 colon-separated parts');
  assert.strictEqual(parseInt(parts[1], 10), DEFAULT_ITERATIONS, `Iteration count must equal ${DEFAULT_ITERATIONS}`);
  assert.strictEqual(parts[2].length, 32, 'Salt hex length must be 32 characters (16 bytes)');
  assert.strictEqual(parts[3].length, 128, 'Hash hex length must be 128 characters (64 bytes in sha512)');

  // Verify correctness
  assert.strictEqual(verifyPassword(password, hashed), true, 'Correct password must verify as true');
  assert.strictEqual(verifyPassword('WrongPassword123!', hashed), false, 'Incorrect password must verify as false');
});

test('Password Hashing: backward compatibility with legacy 1,000-iteration hashes', () => {
  const legacyPassword = 'LegacyPassword2026';
  const legacySalt = crypto.randomBytes(16).toString('hex');
  const legacyRawHash = crypto.pbkdf2Sync(legacyPassword, legacySalt, 1000, 64, 'sha512').toString('hex');
  const legacyStoredHash = `${legacySalt}:${legacyRawHash}`;

  // Must verify legacy hash without errors
  assert.strictEqual(verifyPassword(legacyPassword, legacyStoredHash), true, 'Legacy hash must verify as true for correct password');
  assert.strictEqual(verifyPassword('BadLegacyAttempt', legacyStoredHash), false, 'Legacy hash must verify as false for wrong password');

  // Must detect that legacy hash needs rehash
  assert.strictEqual(needsRehash(legacyStoredHash), true, 'Legacy hash must be identified as needing rehash');

  // Modern hash must NOT need rehash
  const modernHash = hashPassword(legacyPassword);
  assert.strictEqual(needsRehash(modernHash), false, 'Modern hash must not need rehash');
});

test('Password Hashing: edge cases and timing-safe handling of malformed hashes', () => {
  assert.strictEqual(verifyPassword('', 'randomHash'), false);
  assert.strictEqual(verifyPassword('pwd', null), false);
  assert.strictEqual(verifyPassword('pwd', undefined), false);
  assert.strictEqual(verifyPassword('pwd', 'malformed_string_without_colons'), false);
  assert.strictEqual(verifyPassword('pwd', 'pbkdf2v2:invalid:iterations:hash'), false);
  assert.strictEqual(needsRehash(null), true);
  assert.strictEqual(needsRehash(''), true);
});

test('Password Validation: complexity rules enforcement', () => {
  // Too short
  assert.strictEqual(validatePasswordStrength('short').valid, false);
  // Letters only (no digits or symbols)
  assert.strictEqual(validatePasswordStrength('OnlyLettersHere').valid, false);
  // Digits only
  assert.strictEqual(validatePasswordStrength('1234567890').valid, false);
  // Valid strong passwords
  assert.strictEqual(validatePasswordStrength('ValidSecret2026!').valid, true);
  assert.strictEqual(validatePasswordStrength('MyP@ssw0rd').valid, true);
  assert.strictEqual(validatePasswordStrength('Enterprise123').valid, true);
});

// =========================================================================
// 2. Access and Refresh Token Lifecycle Tests
// =========================================================================
test('Tokens: Access token generation and verification', () => {
  const payload = { userId: 'usr-12345', email: 'auditor@veridex.com', tenantId: 'tnt-999' };
  const accessToken = generateToken(payload, '1h');
  assert.ok(typeof accessToken === 'string', 'Access token must be a string');

  // Verify access token type
  const jwt = require('jsonwebtoken');
  const decoded = jwt.decode(accessToken);
  assert.strictEqual(decoded.userId, payload.userId);
  assert.strictEqual(decoded.tokenType, 'access', 'Token must have access tokenType');
});

test('Tokens: Refresh token generation and verification', () => {
  const payload = { userId: 'usr-12345', familyId: 'fam-abc-001' };
  const refreshToken = generateRefreshToken(payload, '7d');
  assert.ok(typeof refreshToken === 'string', 'Refresh token must be a string');

  const decoded = verifyRefreshToken(refreshToken);
  assert.strictEqual(decoded.userId, payload.userId);
  assert.strictEqual(decoded.familyId, payload.familyId);
  assert.strictEqual(decoded.tokenType, 'refresh', 'Token must have refresh tokenType');
});

test('Tokens: Refresh token rejected when passed to requireAuth middleware', async () => {
  const payload = { userId: 'usr-12345', familyId: 'fam-abc-001' };
  const refreshToken = generateRefreshToken(payload);

  const req = {
    headers: {
      authorization: `Bearer ${refreshToken}`
    }
  };
  let errorSent = false;
  let statusCode = null;
  let errorMessage = '';

  const res = {
    error: (msg, code) => {
      errorSent = true;
      statusCode = code;
      errorMessage = msg;
    }
  };

  await requireAuth(req, res, () => {
    assert.fail('Middleware should not call next() with a refresh token');
  });

  assert.strictEqual(errorSent, true, 'Error should have been returned');
  assert.strictEqual(statusCode, 401, 'Status code must be 401');
});

// =========================================================================
// 3. Rate Limiter and Account Lockout Tests
// =========================================================================
test('Rate Limiter: enforces request limit and sets headers', () => {
  resetLimiterStateForTesting();

  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 3,
    keyGenerator: () => 'test-ip-client-1'
  });

  const req = { ip: '127.0.0.1', headers: {} };
  const headersSet = {};
  let resStatus = 200;
  let resBody = null;

  const createMockRes = () => ({
    setHeader: (k, v) => { headersSet[k] = v; },
    status: (code) => {
      resStatus = code;
      return {
        json: (data) => { resBody = data; }
      };
    }
  });

  let nextCalls = 0;
  const next = () => { nextCalls++; };

  // Call 1: Allowed
  limiter(req, createMockRes(), next);
  assert.strictEqual(nextCalls, 1);
  assert.strictEqual(headersSet['X-RateLimit-Remaining'], 2);

  // Call 2: Allowed
  limiter(req, createMockRes(), next);
  assert.strictEqual(nextCalls, 2);
  assert.strictEqual(headersSet['X-RateLimit-Remaining'], 1);

  // Call 3: Allowed
  limiter(req, createMockRes(), next);
  assert.strictEqual(nextCalls, 3);
  assert.strictEqual(headersSet['X-RateLimit-Remaining'], 0);

  // Call 4: Blocked (429)
  limiter(req, createMockRes(), next);
  assert.strictEqual(nextCalls, 3, 'next() must NOT be called when rate limit exceeded');
  assert.strictEqual(resStatus, 429, 'HTTP status must be 429');
  assert.strictEqual(resBody.error.code, 'RATE_LIMIT_EXCEEDED');
  assert.ok(headersSet['Retry-After'] >= 1, 'Retry-After header must be set');
});

test('Account Lockout: locks account after 5 consecutive failed attempts', () => {
  resetLimiterStateForTesting();
  const testEmail = 'staff.accountant@enterprise.com';

  assert.strictEqual(isAccountLocked(testEmail).locked, false, 'Initial state: not locked');

  // 4 failed attempts: still not locked
  for (let i = 0; i < 4; i++) {
    recordFailedLogin(testEmail);
    assert.strictEqual(isAccountLocked(testEmail).locked, false, `Attempt ${i + 1} should not lock`);
  }

  // 5th failed attempt: triggers lockout
  recordFailedLogin(testEmail);
  const status = isAccountLocked(testEmail);
  assert.strictEqual(status.locked, true, 'Account must be locked on 5th failure');
  assert.ok(status.remainingSeconds > 0, 'Must have positive remaining lockout duration');

  // Successful login clears the lockout
  recordSuccessfulLogin(testEmail);
  assert.strictEqual(isAccountLocked(testEmail).locked, false, 'Lockout must be cleared on successful login');
});

// =========================================================================
// 4. Reset Dev Data Protection Tests
// =========================================================================
test('Dev Reset Protection: blocked in production and when flag is disabled', async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ENABLE_DEV_RESET;

  try {
    const { resetDevData } = require('../src/controllers/tenantController');

    // Case 1: In production
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEV_RESET = 'true';

    let errorResult = null;
    let statusCode = null;

    const mockResProd = {
      error: (msg, code) => {
        errorResult = msg;
        statusCode = code;
      }
    };

    await resetDevData({ tenantId: 'tnt-test-1', headers: { 'x-confirm-destructive-reset': 'CONFIRM_RESET_ALL_DATA' } }, mockResProd);
    assert.strictEqual(statusCode, 403, 'Must return 403 in production');
    assert.ok(errorResult.includes('disabled'), 'Message must indicate disabled endpoint');

    // Case 2: In development but without ENABLE_DEV_RESET=true
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_RESET = 'false';

    await resetDevData({ tenantId: 'tnt-test-1', headers: { 'x-confirm-destructive-reset': 'CONFIRM_RESET_ALL_DATA' } }, mockResProd);
    assert.strictEqual(statusCode, 403, 'Must return 403 when ENABLE_DEV_RESET is false');

    // Case 3: Flag enabled but missing confirmation header
    process.env.ENABLE_DEV_RESET = 'true';
    await resetDevData({ tenantId: 'tnt-test-1', headers: {} }, mockResProd);
    assert.strictEqual(statusCode, 400, 'Must return 400 when confirmation header is missing');
    assert.ok(errorResult.includes('x-confirm-destructive-reset'), 'Must mandate confirmation header');
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.ENABLE_DEV_RESET = originalFlag;
  }
});

// =========================================================================
// 5. Password Reset Token Generation & Hashing Tests
// =========================================================================
test('Password Reset Tokens: generateSecureToken generates crypto-random hex token', () => {
  const token1 = generateSecureToken();
  const token2 = generateSecureToken();

  assert.strictEqual(typeof token1, 'string');
  assert.strictEqual(typeof token2, 'string');
  assert.strictEqual(token1.length, 64, 'Token must be 64 hex characters (32 bytes entropy)');
  assert.strictEqual(token2.length, 64, 'Token must be 64 hex characters (32 bytes entropy)');
  assert.notStrictEqual(token1, token2, 'Two generated tokens must be statistically unique');
});

test('Password Reset Tokens: hashToken creates deterministic SHA-256 hash', () => {
  const rawToken = '7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a';
  const hashedToken1 = hashToken(rawToken);
  const hashedToken2 = hashToken(rawToken);

  assert.strictEqual(typeof hashedToken1, 'string');
  assert.strictEqual(hashedToken1.length, 64, 'SHA-256 hash length must be 64 hex characters');
  assert.strictEqual(hashedToken1, hashedToken2, 'hashToken must be deterministic for identical input');

  // Verify against native crypto SHA-256
  const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  assert.strictEqual(hashedToken1, expectedHash, 'Hash must match native crypto SHA-256');

  // Different token produces different hash
  const diffToken = generateSecureToken();
  assert.notStrictEqual(hashToken(diffToken), hashedToken1, 'Different raw token must produce different hash');
});

// =========================================================================
// 6. CORS Policy Origin Enforcement Tests
// =========================================================================
test('CORS Policy: allows requests with no Origin header (headless, curl, server-to-server)', () => {
  assert.strictEqual(isOriginAllowed(undefined, true, ['https://app.veridexone.com']), true);
  assert.strictEqual(isOriginAllowed('', true, ['https://app.veridexone.com']), true);
  assert.strictEqual(isOriginAllowed(null, true, ['https://app.veridexone.com']), true);
});

test('CORS Policy: allows all origins in non-production environments', () => {
  const testOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://192.168.1.50:3000'
  ];

  for (const origin of testOrigins) {
    assert.strictEqual(isOriginAllowed(origin, false), true, `Development environment must allow ${origin}`);
  }
});

test('CORS Policy: strictly enforces allowed whitelist in production environment', () => {
  const productionWhitelist = [
    'https://app.veridexone.com',
    'https://erp.veridexone.com'
  ];

  // Whitelisted origins (case insensitive and trimmed)
  assert.strictEqual(isOriginAllowed('https://app.veridexone.com', true, productionWhitelist), true);
  assert.strictEqual(isOriginAllowed('HTTPS://APP.VERIDEXONE.COM', true, productionWhitelist), true);
  assert.strictEqual(isOriginAllowed('  https://erp.veridexone.com  ', true, productionWhitelist), true);

  // Unauthorized origins must be rejected
  assert.strictEqual(isOriginAllowed('https://malicious-site.com', true, productionWhitelist), false);
  assert.strictEqual(isOriginAllowed('http://localhost:3000', true, productionWhitelist), false);
  assert.strictEqual(isOriginAllowed('https://app.veridexone.com.attacker.com', true, productionWhitelist), false);
});

test('CORS Policy: createCorsOptions returns middleware origin callback that accepts or rejects', () => {
  const corsOptions = createCorsOptions();
  assert.strictEqual(typeof corsOptions.origin, 'function');
  assert.ok(Array.isArray(corsOptions.methods));
  assert.ok(corsOptions.allowedHeaders.includes('x-tenant-id'));
  assert.ok(corsOptions.allowedHeaders.includes('x-refresh-token'));
  assert.ok(corsOptions.allowedHeaders.includes('x-confirm-destructive-reset'));
  assert.strictEqual(corsOptions.credentials, true);

  // Test callback with null origin (passes)
  corsOptions.origin(null, (err, allow) => {
    assert.strictEqual(err, null);
    assert.strictEqual(allow, true);
  });
});

