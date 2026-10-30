const mongoose = require('mongoose');
const dns = require('dns');

// Preserve system DNS resolvers unless explicitly requested
if (process.env.FORCE_PUBLIC_DNS === 'true') {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {
    // Ignore in environments where setServers is restricted
  }
}

function sanitizeUri(uri) {
  if (!uri || typeof uri !== 'string') return 'UNDEFINED';
  return uri.replace(/\/\/(.*):(.*)@/, '//$1:***@');
}

/**
 * Extracts database name from MongoDB URI safely without printing credentials.
 * Handles both standard mongodb:// and SRV mongodb+srv:// formats.
 */
function extractDatabaseName(uri) {
  if (!uri || typeof uri !== 'string') return null;
  try {
    const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const slashIdx = withoutProtocol.indexOf('/');
    if (slashIdx === -1) return null;
    const pathAndQuery = withoutProtocol.slice(slashIdx + 1);
    const qIdx = pathAndQuery.indexOf('?');
    const dbName = qIdx !== -1 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
    return dbName.trim() || null;
  } catch (e) {
    return null;
  }
}

/**
 * Resolves the effective database URI based on NODE_ENV.
 * When NODE_ENV === 'test':
 * - Requires explicit TEST_MONGODB_URI.
 * - Forbids silent fallback to application MONGODB_URI.
 * - Rejects test database if identical to or sharing the same database name as application MONGODB_URI.
 */
function resolveDatabaseUri(env = process.env) {
  const isTest = (env.NODE_ENV === 'test');

  if (isTest) {
    const testUri = env.TEST_MONGODB_URI;
    if (!testUri || !testUri.trim()) {
      throw new Error(
        '[DatabaseConfigError] TEST_MONGODB_URI is required when NODE_ENV=test. ' +
        'Test execution refuses to silently fall back to or run against the application MONGODB_URI. ' +
        'Please configure TEST_MONGODB_URI in your environment pointing to an isolated test database.'
      );
    }

    const appUri = env.MONGODB_URI;
    if (appUri && appUri.trim()) {
      if (testUri.trim() === appUri.trim()) {
        throw new Error(
          '[DatabaseConfigError] TEST_MONGODB_URI cannot be identical to the application MONGODB_URI. ' +
          'An isolated dedicated test database is required.'
        );
      }

      const appDb = extractDatabaseName(appUri);
      const testDb = extractDatabaseName(testUri);
      if (appDb && testDb && appDb.toLowerCase() === testDb.toLowerCase()) {
        throw new Error(
          `[DatabaseConfigError] TEST_MONGODB_URI database name ("${testDb}") matches the application database name ("${appDb}"). ` +
          'Test mode requires a distinct, physically isolated test database to protect business records.'
        );
      }
    }

    return {
      uri: testUri.trim(),
      isTest: true,
      dbName: extractDatabaseName(testUri)
    };
  }

  const appUri = env.MONGODB_URI || 'mongodb://localhost:27017/veridex_finance';
  return {
    uri: appUri.trim(),
    isTest: false,
    dbName: extractDatabaseName(appUri)
  };
}

async function connectDB(retries = 3, delayMs = 2000) {
  const { uri, isTest } = resolveDatabaseUri(process.env);
  const sanitized = sanitizeUri(uri);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        autoIndex: true
      });
      const dbName = extractDatabaseName(uri) || 'default';
      console.log(`[Database] MongoDB connected successfully to database "${dbName}" [Environment: ${process.env.NODE_ENV || 'development'}${isTest ? ', Mode: ISOLATED_TEST' : ''}]`);
      return conn;
    } catch (err) {
      console.error(`[Database] MongoDB connection error (attempt ${attempt}/${retries}):`, err.message);
      if (attempt === retries) throw err;
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
}

async function disconnectDB() {
  try {
    await mongoose.connection.close();
    console.log('[Database] MongoDB connection closed.');
  } catch (err) {
    console.error('[Database] Disconnect error:', err.message);
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  sanitizeUri,
  extractDatabaseName,
  resolveDatabaseUri
};
