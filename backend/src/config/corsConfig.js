/**
 * CORS Configuration and Origin Validator
 * Enforces strict origin whitelist in production while allowing local development
 */

function getAllowedOrigins() {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ];
}

/**
 * Validates whether an incoming HTTP origin is permitted
 * @param {string|undefined} origin - Origin header value
 * @param {boolean} [isProduction] - Whether environment is production
 * @param {string[]} [allowedList] - Optional whitelist override
 * @returns {boolean}
 */
function isOriginAllowed(
  origin,
  isProduction = (process.env.NODE_ENV === 'production'),
  allowedList = getAllowedOrigins()
) {
  // Allow requests with no Origin header (e.g. server-to-server, curl, Postman, native clients)
  if (!origin) return true;

  // In non-production environments, allow local development origins freely
  if (!isProduction) return true;

  const normalized = origin.toLowerCase().trim();
  return allowedList.includes(normalized);
}

/**
 * Returns options object for express cors middleware
 */
function createCorsOptions() {
  return {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy violation: Origin "${origin}" is not authorized`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-id',
      'x-company-id',
      'x-refresh-token',
      'x-confirm-destructive-reset',
      'x-bypass-rate-limit'
    ],
    credentials: true
  };
}

module.exports = {
  getAllowedOrigins,
  isOriginAllowed,
  createCorsOptions
};
