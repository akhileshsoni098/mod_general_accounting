# TallyVeridexERP — Security & Testing Guide (Phase 1 Baseline)

## 1. Overview
This document records the security architecture and regression testing baseline established during **Phase 1: Security Hardening & Test Runner Stabilization** for `TallyVeridexERP`.

All implementations prioritize zero third-party attack surface by utilizing Node.js native cryptographic primitives (`node:crypto`), standard JWT standards, and native test runners (`node:test`).

---

## 2. Security Enhancements Implemented

### 2.1 Password Hashing & Backward-Compatible Auto-Rehashing
- **Modern Scheme**: PBKDF2-HMAC-SHA512 with 210,000 iterations (OWASP Recommended Benchmark), 16-byte random salt, 64-byte derived key.
- **Serialization Format**: `pbkdf2v2:<iterations>:<salt_hex>:<hash_hex>`.
- **Legacy Compatibility**: Transparently supports legacy 1,000-iteration hashes formatted as `<salt_hex>:<hash_hex>`.
- **Timing-Attack Protection**: Password comparisons utilize `crypto.timingSafeEqual` over fixed-length buffer digests to eliminate side-channel timing disclosures.
- **Transparent Upgrade**: When a legacy user logs in, credentials verify against the legacy format, and upon successful authentication, the password is automatically rehashed with PBKDF2 v2 and saved to MongoDB.
- **Complexity Enforcement**: Minimum 8 characters containing at least one letter and one number or symbol.

### 2.2 Dual-Token Authentication & Refresh Token Rotation
- **Access Tokens**: Short-lived (default 1 hour), signed with `JWT_SECRET`, stamped with `tokenType: 'access'`.
- **Refresh Tokens**: Long-lived (default 7 days), signed with dedicated `JWT_REFRESH_SECRET`, stamped with `tokenType: 'refresh'` and `familyId`.
- **Enforcement**: `requireAuth` middleware explicitly validates `tokenType === 'access'` and returns `401 Unauthorized` if a refresh token is presented for API access.
- **Session Family Tracking (`UserSession` Mongoose Model)**:
  - Tracks `sessionId`, `tenantId`, `userId`, `familyId`, `tokenHash`, `status`, and `expires_at`.
  - MongoDB TTL index ensures expired sessions auto-expire.
  - Implements **Token Reuse Detection**: If an already-rotated or revoked refresh token is presented, the entire session family is immediately revoked with reason `REUSE_DETECTED`.
- **Password Reset Lifecycle (`PasswordResetToken` Mongoose Model)**:
  - Generates 64-character (32-byte) cryptographically secure random hex tokens.
  - Raw token is never stored in the database; only its SHA-256 hash is persisted.
  - MongoDB TTL index ensures automatic 1-hour expiration.
  - Resetting password immediately invalidates all active sessions across all devices for that user.

### 2.3 Rate Limiting & Account Lockout
- **Rate Limiter (`src/middleware/rateLimiter.js`)**: Sliding-window rate limiting tracking IP and route prefixes.
  - `/api/v1/auth/login`, `/register-tenant`: 15 requests per 15-minute window.
  - `/api/v1/auth/forgot-password`, `/reset-password`: 5 requests per 15-minute window.
  - Emits standard RFC headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After`.
- **Account Lockout Protection**:
  - Monitors consecutive failed login attempts per user email.
  - 5 consecutive failed logins triggers an automatic 15-minute account lockout.
  - Successful login instantly clears the failure count.

### 2.4 Destructive Endpoint Guarding (`reset-dev-data`)
- Route: `POST /api/v1/tenant/reset-dev-data`
- Multi-tier defense-in-depth:
  1. RBAC authorization: Requires `TENANT:ADMIN` permission.
  2. Environment lockdown: Strictly rejected with HTTP 403 when `NODE_ENV === 'production'`.
  3. Feature flag requirement: Strictly rejected with HTTP 403 unless `ENABLE_DEV_RESET === 'true'`.
  4. Header confirmation: Rejects with HTTP 400 unless client explicitly supplies `x-confirm-destructive-reset: CONFIRM_RESET_ALL_DATA`.

### 2.5 CORS Policy Origin Whitelisting
- Located in `src/config/corsConfig.js` and mounted in `src/server.js`.
- **Development**: Permits localhost and standard development ports (`3000`, `5173`).
- **Production**: Strictly validates incoming `Origin` against `ALLOWED_ORIGINS` (comma-separated list).
- Permitted headers: `Content-Type`, `Authorization`, `x-tenant-id`, `x-company-id`, `x-refresh-token`, `x-confirm-destructive-reset`, `x-bypass-rate-limit`.

---

## 3. Test Runner & Regression Suite

### 3.1 Running Tests
The backend test suite runs natively without external test runners using Node's built-in test runner:

```bash
# From workspace root:
cd backend
npm test

# Direct node execution:
node --test tests/**/*.test.js
```

> [!NOTE]
> On Windows workstations with restricted PowerShell execution policies, execute via `cmd.exe /c "npm test"` or directly via `node`.

### 3.2 Regression Suite Matrix
The test suite at `backend/tests/security_regression.test.js` exercises 16 test cases:

| Category | Test Case | Status |
| :--- | :--- | :--- |
| **Password Hashing** | Generates modern PBKDF2 v2 format with 210,000 iterations | Passed |
| **Password Hashing** | Backward compatibility with legacy 1,000-iteration hashes | Passed |
| **Password Hashing** | Edge cases and timing-safe handling of malformed hashes | Passed |
| **Password Hashing** | Password complexity rules enforcement | Passed |
| **Token Lifecycle** | Access token generation and verification | Passed |
| **Token Lifecycle** | Refresh token generation and verification | Passed |
| **Token Lifecycle** | Refresh token rejected when passed to requireAuth middleware | Passed |
| **Rate Limiter** | Sliding window rate limit enforcement and header assertions | Passed |
| **Account Lockout** | 5 consecutive failed attempts locks account for 15 minutes | Passed |
| **Dev Reset Protection** | Blocked in production, blocked when flag disabled, header checked | Passed |
| **Password Recovery** | `generateSecureToken` produces 64-char crypto-random token | Passed |
| **Password Recovery** | `hashToken` produces deterministic SHA-256 hash | Passed |
| **CORS Policy** | Allows headless/curl requests with no Origin header | Passed |
| **CORS Policy** | Allows development origins in non-production environments | Passed |
| **CORS Policy** | Strictly enforces whitelist matching in production | Passed |
| **CORS Policy** | `createCorsOptions` validates origin and exports permitted headers | Passed |

---

## 4. Environment Variables Checklist
Ensure the following variables are configured in staging and production environments:

| Variable | Description | Recommended Setting |
| :--- | :--- | :--- |
| `NODE_ENV` | Application environment | `production` |
| `PORT` | Listening port | `5050` |
| `MONGODB_URI` | Mongo connection string | Replica set URI with authentication |
| `JWT_SECRET` | Secret key for access tokens | 64+ char random hex string |
| `JWT_REFRESH_SECRET` | Dedicated secret key for refresh tokens | 64+ char random hex string |
| `ALLOWED_ORIGINS` | Permitted web clients | `https://app.veridexone.com,https://pos.veridexone.com` |
| `ENABLE_DEV_RESET` | Dangerous data reset flag | `false` (Never enable in production) |
| `ENABLE_DEMO_SEEDING`| Demo persona seeding | `false` in production |
