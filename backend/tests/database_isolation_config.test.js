const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractDatabaseName,
  resolveDatabaseUri,
  sanitizeUri
} = require('../src/config/db');

test('Database Isolation Config Suite (Safe Unit Tests - No DB Connections)', async (t) => {
  await t.test('1. extractDatabaseName: extracts database name from standard mongodb:// URI', () => {
    assert.strictEqual(
      extractDatabaseName('mongodb://localhost:27017/veridex_finance'),
      'veridex_finance'
    );
    assert.strictEqual(
      extractDatabaseName('mongodb://localhost:27017/veridex_finance?authSource=admin'),
      'veridex_finance'
    );
    assert.strictEqual(
      extractDatabaseName('mongodb://user:pass@127.0.0.1:27017/custom_test_db?ssl=false'),
      'custom_test_db'
    );
  });

  await t.test('2. extractDatabaseName: extracts database name from mongodb+srv:// Atlas URI', () => {
    assert.strictEqual(
      extractDatabaseName('mongodb+srv://user:secret123@cluster0.abcde.mongodb.net/veridex_Tally_Accounting_Akhilesh?retryWrites=true&w=majority'),
      'veridex_Tally_Accounting_Akhilesh'
    );
    assert.strictEqual(
      extractDatabaseName('mongodb+srv://testuser:secret456@cluster0.abcde.mongodb.net/veridex_finance_isolated_test?retryWrites=true&w=majority'),
      'veridex_finance_isolated_test'
    );
  });

  await t.test('3. extractDatabaseName: handles missing or invalid URIs safely', () => {
    assert.strictEqual(extractDatabaseName(null), null);
    assert.strictEqual(extractDatabaseName(''), null);
    assert.strictEqual(extractDatabaseName('mongodb://localhost:27017'), null);
    assert.strictEqual(extractDatabaseName('mongodb+srv://cluster0.abcde.mongodb.net/?retryWrites=true'), null);
  });

  await t.test('4. resolveDatabaseUri: throws when NODE_ENV=test and TEST_MONGODB_URI is missing', () => {
    const mockEnv = {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/veridex_finance'
    };

    assert.throws(
      () => resolveDatabaseUri(mockEnv),
      (err) => {
        assert.match(err.message, /\[DatabaseConfigError\] TEST_MONGODB_URI is required when NODE_ENV=test/);
        assert.match(err.message, /refuses to silently fall back/);
        return true;
      }
    );
  });

  await t.test('5. resolveDatabaseUri: throws when TEST_MONGODB_URI is empty whitespace string in test mode', () => {
    const mockEnv = {
      NODE_ENV: 'test',
      TEST_MONGODB_URI: '   ',
      MONGODB_URI: 'mongodb://localhost:27017/veridex_finance'
    };

    assert.throws(
      () => resolveDatabaseUri(mockEnv),
      /\[DatabaseConfigError\] TEST_MONGODB_URI is required when NODE_ENV=test/
    );
  });

  await t.test('6. resolveDatabaseUri: throws when TEST_MONGODB_URI is identical to MONGODB_URI', () => {
    const mockEnv = {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/veridex_finance',
      TEST_MONGODB_URI: 'mongodb://localhost:27017/veridex_finance'
    };

    assert.throws(
      () => resolveDatabaseUri(mockEnv),
      /\[DatabaseConfigError\] TEST_MONGODB_URI cannot be identical to the application MONGODB_URI/
    );
  });

  await t.test('7. resolveDatabaseUri: throws when TEST_MONGODB_URI targets the same database name as MONGODB_URI', () => {
    const mockEnv = {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb+srv://user:pass1@cluster0.abc.mongodb.net/veridex_finance?retryWrites=true',
      TEST_MONGODB_URI: 'mongodb+srv://user:pass2@cluster0.xyz.mongodb.net/VERIDEX_FINANCE?retryWrites=true'
    };

    assert.throws(
      () => resolveDatabaseUri(mockEnv),
      (err) => {
        assert.match(err.message, /matches the application database name/);
        assert.match(err.message, /Test mode requires a distinct, physically isolated test database/);
        return true;
      }
    );
  });

  await t.test('8. resolveDatabaseUri: succeeds when TEST_MONGODB_URI has a distinct test database name', () => {
    const mockEnv = {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/veridex_finance',
      TEST_MONGODB_URI: 'mongodb://localhost:27017/veridex_finance_test'
    };

    const resolved = resolveDatabaseUri(mockEnv);
    assert.strictEqual(resolved.isTest, true);
    assert.strictEqual(resolved.uri, 'mongodb://localhost:27017/veridex_finance_test');
    assert.strictEqual(resolved.dbName, 'veridex_finance_test');
  });

  await t.test('9. resolveDatabaseUri: preserves normal application selection in development/production', () => {
    const devEnv = {
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://localhost:27017/veridex_dev'
    };
    const devResolved = resolveDatabaseUri(devEnv);
    assert.strictEqual(devResolved.isTest, false);
    assert.strictEqual(devResolved.uri, 'mongodb://localhost:27017/veridex_dev');
    assert.strictEqual(devResolved.dbName, 'veridex_dev');

    const prodEnv = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://prod_user:strongpassword@cluster.mongodb.net/veridex_prod?retryWrites=true'
    };
    const prodResolved = resolveDatabaseUri(prodEnv);
    assert.strictEqual(prodResolved.isTest, false);
    assert.strictEqual(prodResolved.dbName, 'veridex_prod');
  });

  await t.test('10. sanitizeUri: masks sensitive credentials from output and logs', () => {
    const uriWithPass = 'mongodb+srv://rohit_admin:SuperSecretP@ss99@cluster0.abc.mongodb.net/veridex_finance';
    const sanitized = sanitizeUri(uriWithPass);

    assert.strictEqual(sanitized.includes('SuperSecretP@ss99'), false, 'Password must not appear in sanitized URI');
    assert.strictEqual(sanitized, 'mongodb+srv://rohit_admin:***@cluster0.abc.mongodb.net/veridex_finance');

    const plainUri = 'mongodb://localhost:27017/veridex_finance';
    assert.strictEqual(sanitizeUri(plainUri), plainUri);
  });
});
