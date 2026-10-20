const crypto = require('crypto');

const DEFAULT_ITERATIONS = parseInt(process.env.PASSWORD_HASH_ITERATIONS, 10) || 210000;
const KEY_LEN = 64; // 64 bytes = 512 bits
const DIGEST = 'sha512';

/**
 * Modern password hashing using PBKDF2-HMAC-SHA512 with 210,000 iterations (OWASP recommended minimum).
 * Returns serialized format: pbkdf2v2:<iterations>:<salt_hex>:<hash_hex>
 */
function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, DIGEST).toString('hex');
  return `pbkdf2v2:${iterations}:${salt}:${hash}`;
}

/**
 * Timing-safe string buffer comparison to prevent timing attacks.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Backward-compatible password verification.
 * Supports:
 *   1. Modern pbkdf2v2 format: pbkdf2v2:<iterations>:<salt>:<hash>
 *   2. Legacy format: <salt>:<hash> (1,000 iterations)
 */
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  // Modern format: pbkdf2v2:<iterations>:<salt>:<hash>
  if (storedHash.startsWith('pbkdf2v2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];

    if (!iterations || isNaN(iterations) || iterations < 1) return false;
    const hash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, DIGEST).toString('hex');
    return safeEqual(hash, originalHash);
  }

  // Legacy format: <salt>:<hash> (1,000 iterations)
  if (storedHash.includes(':')) {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, originalHash] = parts;
    if (!salt || !originalHash) return false;

    const hash = crypto.pbkdf2Sync(password, salt, 1000, KEY_LEN, DIGEST).toString('hex');
    return safeEqual(hash, originalHash);
  }

  return false;
}

/**
 * Checks whether a stored hash should be upgraded to the modern format.
 * Returns true if the hash is in legacy format or has fewer iterations than DEFAULT_ITERATIONS.
 */
function needsRehash(storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return true;
  if (!storedHash.startsWith('pbkdf2v2:')) return true;

  const parts = storedHash.split(':');
  if (parts.length !== 4) return true;
  const iterations = parseInt(parts[1], 10);
  return isNaN(iterations) || iterations < DEFAULT_ITERATIONS;
}

/**
 * Validates password complexity:
 * - Minimum 8 characters
 * - At least one letter (a-z or A-Z)
 * - At least one numeric digit or special symbol
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be a string' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password cannot exceed 128 characters' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter' };
  }
  if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one digit or special symbol' };
  }
  return { valid: true };
}

/**
 * Generates a cryptographically secure random token (e.g. for refresh tokens or password reset).
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Computes a SHA-256 hash of a token for secure database storage.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordStrength,
  generateSecureToken,
  hashToken,
  DEFAULT_ITERATIONS
};
