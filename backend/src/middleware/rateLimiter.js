/**
 * In-memory sliding-window rate limiter and account lockout protection.
 * Requires zero external dependencies.
 */

// Storage maps: key -> [timestamps]
const requestWindows = new Map();
const failedLoginAttempts = new Map(); // normalized email -> { count, lockedUntil }

// Periodic sweep of expired timestamps every 5 minutes to prevent memory leaks
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requestWindows.entries()) {
    const valid = timestamps.filter(ts => now - ts < 60 * 60 * 1000);
    if (valid.length === 0) {
      requestWindows.delete(key);
    } else {
      requestWindows.set(key, valid);
    }
  }

  for (const [email, record] of failedLoginAttempts.entries()) {
    if (record.lockedUntil && now > record.lockedUntil) {
      failedLoginAttempts.delete(email);
    }
  }
}, SWEEP_INTERVAL_MS);

if (sweepTimer.unref) {
  sweepTimer.unref(); // Do not prevent process exit in test runs
}

/**
 * Creates a sliding-window rate limiting middleware.
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  maxRequests = 10,
  message = 'Too many requests. Please try again later.',
  keyGenerator = (req) => req.ip || req.connection?.remoteAddress || 'unknown-client'
} = {}) {
  return function rateLimiterMiddleware(req, res, next) {
    // In test environment, allow bypassing if explicitly flagged
    if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = requestWindows.get(key) || [];
    // Filter out timestamps outside current sliding window
    timestamps = timestamps.filter(ts => ts > windowStart);

    if (timestamps.length >= maxRequests) {
      const oldestInWindow = timestamps[0];
      const resetTimeMs = oldestInWindow + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTimeMs / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retry_after_seconds: retryAfterSeconds
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    }

    // Record this request
    timestamps.push(now);
    requestWindows.set(key, timestamps);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - timestamps.length));
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

    next();
  };
}

/**
 * Account Lockout Management
 */
const MAX_CONSECUTIVE_FAILURES = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function isAccountLocked(email) {
  if (!email || typeof email !== 'string') return { locked: false };
  const normalized = email.toLowerCase().trim();
  const record = failedLoginAttempts.get(normalized);
  if (!record) return { locked: false };

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      locked: true,
      remainingSeconds,
      remainingMinutes: Math.ceil(remainingSeconds / 60)
    };
  }

  // Lock expired
  if (record.lockedUntil && now >= record.lockedUntil) {
    failedLoginAttempts.delete(normalized);
  }

  return { locked: false };
}

function recordFailedLogin(email) {
  if (!email || typeof email !== 'string') return;
  const normalized = email.toLowerCase().trim();
  const now = Date.now();

  const record = failedLoginAttempts.get(normalized) || { count: 0, lockedUntil: null };
  record.count += 1;

  if (record.count >= MAX_CONSECUTIVE_FAILURES) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  failedLoginAttempts.set(normalized, record);
}

function recordSuccessfulLogin(email) {
  if (!email || typeof email !== 'string') return;
  const normalized = email.toLowerCase().trim();
  failedLoginAttempts.delete(normalized);
}

// Pre-configured rate limiters
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 15,
  message: 'Too many authentication attempts from this IP. Please wait 15 minutes before trying again.'
});

const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many password recovery attempts from this IP. Please wait 15 minutes.'
});

function resetLimiterStateForTesting() {
  requestWindows.clear();
  failedLoginAttempts.clear();
}

module.exports = {
  createRateLimiter,
  authLimiter,
  passwordResetLimiter,
  isAccountLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  resetLimiterStateForTesting
};
