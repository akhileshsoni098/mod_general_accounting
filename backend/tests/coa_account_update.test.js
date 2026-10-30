const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const LedgerAccount = require('../src/models/LedgerAccount');
const JournalEntry = require('../src/models/JournalEntry');
const glController = require('../src/controllers/glController');

test('COA Ledger Account Update API Suite', async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const companyId = new mongoose.Types.ObjectId();
  const parentGroupId = new mongoose.Types.ObjectId();
  const childAccountId = new mongoose.Types.ObjectId();

  // Helper to construct mock Express request and response
  function createMockReqRes(body = {}, params = {}, customContext = {}) {
    const req = {
      tenantId: tenantId.toString(),
      companyId: companyId.toString(),
      params,
      body,
      ...customContext
    };

    let responseData = null;
    let statusCode = 200;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      success(data, extra = {}, code = 200) {
        statusCode = code;
        responseData = { success: true, data, ...extra };
        return responseData;
      },
      error(message, code = 400, details = null) {
        statusCode = code;
        responseData = { success: false, error: message, statusCode: code, details };
        return responseData;
      }
    };

    return { req, res, getResult: () => ({ status: statusCode, body: responseData }) };
  }

  // -----------------------------------------------------------------
  // 1. Account Schema Validation on Updatable Fields
  // -----------------------------------------------------------------
  await t.test('1.1 Schema: permits valid account_code, account_name, account_type, and status modifications', () => {
    const account = new LedgerAccount({
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '1001',
      account_name: 'Cash in Hand',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      is_posting_allowed: true,
      status: 'ACTIVE'
    });

    const err = account.validateSync();
    assert.strictEqual(err, undefined);

    // Update code, name, type, and status
    account.account_code = '1001-A';
    account.account_name = 'Main Office Cash Drawer';
    account.description = 'Petty cash for front counter';
    account.status = 'INACTIVE';
    account.is_fiduciary = true;
    account.subledger_type = 'FIDUCIARY';

    const updatedErr = account.validateSync();
    assert.strictEqual(updatedErr, undefined, 'Updated fields should pass schema validation');
    assert.strictEqual(account.account_code, '1001-A');
    assert.strictEqual(account.account_name, 'Main Office Cash Drawer');
    assert.strictEqual(account.status, 'INACTIVE');
    assert.strictEqual(account.is_fiduciary, true);
    assert.strictEqual(account.subledger_type, 'FIDUCIARY');
  });

  await t.test('1.2 Schema: rejects invalid account_type and normal_balance values', () => {
    const invalidAccount = new LedgerAccount({
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '9999',
      account_name: 'Invalid Test Account',
      account_type: 'UNSUPPORTED_TYPE',
      normal_balance: 'NEUTRAL'
    });

    const err = invalidAccount.validateSync();
    assert.ok(err);
    assert.ok(err.errors.account_type);
    assert.ok(err.errors.normal_balance);
  });

  // -----------------------------------------------------------------
  // 2. Controller Validation: Account Code (GL Number) & Uniqueness
  // -----------------------------------------------------------------
  await t.test('2.1 Controller updateAccount: rejects empty account_code with 400 Bad Request', async () => {
    const existingAccount = new LedgerAccount({
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '1005',
      account_name: 'Temporary Cash',
      account_type: 'ASSET',
      normal_balance: 'DEBIT'
    });

    // Mock LedgerAccount.findOne
    const origFindOne = LedgerAccount.findOne;
    LedgerAccount.findOne = async () => existingAccount;

    try {
      const { req, res, getResult } = createMockReqRes(
        { account_code: '   ' },
        { id: existingAccount._id.toString() }
      );

      await glController.updateAccount(req, res);
      const result = getResult();

      assert.strictEqual(result.status, 400);
      assert.strictEqual(result.body.success, false);
      assert.match(result.body.error, /account_code cannot be empty/);
    } finally {
      LedgerAccount.findOne = origFindOne;
    }
  });

  await t.test('2.2 Controller updateAccount: rejects duplicate account_code with 409 Conflict', async () => {
    const currentAccount = new LedgerAccount({
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '1005',
      account_name: 'Current Account',
      account_type: 'ASSET',
      normal_balance: 'DEBIT'
    });

    const conflictingAccount = new LedgerAccount({
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '1010',
      account_name: 'Existing Bank Account',
      account_type: 'ASSET',
      normal_balance: 'DEBIT'
    });

    const origFindOne = LedgerAccount.findOne;
    LedgerAccount.findOne = async (query) => {
      const idMatch = query._id || query.$or?.[0]?._id;
      if (idMatch && idMatch.toString() === currentAccount._id.toString()) {
        return currentAccount;
      }
      if (query.account_code === '1010') {
        return conflictingAccount;
      }
      return null;
    };

    try {
      const { req, res, getResult } = createMockReqRes(
        { account_code: '1010' },
        { id: currentAccount._id.toString() }
      );

      await glController.updateAccount(req, res);
      const result = getResult();

      assert.strictEqual(result.status, 409);
      assert.strictEqual(result.body.success, false);
      assert.match(result.body.error, /already in use by another account/);
    } finally {
      LedgerAccount.findOne = origFindOne;
    }
  });

  // -----------------------------------------------------------------
  // 3. Controller Validation: Account Name, Type, and Hierarchy
  // -----------------------------------------------------------------
  await t.test('3.1 Controller updateAccount: rejects empty account_name', async () => {
    const account = new LedgerAccount({
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '1001',
      account_name: 'Valid Name',
      account_type: 'ASSET',
      normal_balance: 'DEBIT'
    });

    const origFindOne = LedgerAccount.findOne;
    LedgerAccount.findOne = async () => account;

    try {
      const { req, res, getResult } = createMockReqRes(
        { account_name: '   ' },
        { id: account._id.toString() }
      );

      await glController.updateAccount(req, res);
      const result = getResult();

      assert.strictEqual(result.status, 400);
      assert.match(result.body.error, /account_name cannot be empty/);
    } finally {
      LedgerAccount.findOne = origFindOne;
    }
  });

  await t.test('3.2 Controller updateAccount: rejects invalid account_type with 400', async () => {
    const account = new LedgerAccount({
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '1001',
      account_name: 'Cash',
      account_type: 'ASSET',
      normal_balance: 'DEBIT'
    });

    const origFindOne = LedgerAccount.findOne;
    LedgerAccount.findOne = async () => account;

    try {
      const { req, res, getResult } = createMockReqRes(
        { account_type: 'REVENUE_INVALID' },
        { id: account._id.toString() }
      );

      await glController.updateAccount(req, res);
      const result = getResult();

      assert.strictEqual(result.status, 400);
      assert.match(result.body.error, /Invalid account_type/);
    } finally {
      LedgerAccount.findOne = origFindOne;
    }
  });

  await t.test('3.3 Controller updateAccount: prevents cyclic parent hierarchy (cannot be own parent)', async () => {
    const selfId = new mongoose.Types.ObjectId();
    const account = new LedgerAccount({
      _id: selfId,
      tenant_id: tenantId,
      company_id: companyId,
      account_code: 'GRP-01',
      account_name: 'Group 01',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      is_group: true
    });

    const origFindOne = LedgerAccount.findOne;
    LedgerAccount.findOne = async () => account;

    try {
      const { req, res, getResult } = createMockReqRes(
        { parent_account_id: selfId.toString() },
        { id: selfId.toString() }
      );

      await glController.updateAccount(req, res);
      const result = getResult();

      assert.strictEqual(result.status, 400);
      assert.match(result.body.error, /An account cannot be its own parent/);
    } finally {
      LedgerAccount.findOne = origFindOne;
    }
  });

  await t.test('3.4 Controller updateAccount: prevents converting account with existing journal postings into group', async () => {
    const account = new LedgerAccount({
      _id: new mongoose.Types.ObjectId(),
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '1001',
      account_name: 'Cash Account',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      is_group: false
    });

    const origFindOne = LedgerAccount.findOne;
    const origCountDocs = JournalEntry.countDocuments;

    LedgerAccount.findOne = async () => account;
    // Mock that 5 journal entries have already been posted to this account
    JournalEntry.countDocuments = async () => 5;

    try {
      const { req, res, getResult } = createMockReqRes(
        { is_group: true },
        { id: account._id.toString() }
      );

      await glController.updateAccount(req, res);
      const result = getResult();

      assert.strictEqual(result.status, 400);
      assert.match(result.body.error, /Cannot convert account "1001" to a summary group because 5 journal transactions have already been posted/);
    } finally {
      LedgerAccount.findOne = origFindOne;
      JournalEntry.countDocuments = origCountDocs;
    }
  });

  // -----------------------------------------------------------------
  // 4. Successful Full Update Execution & Cascading Reference
  // -----------------------------------------------------------------
  await t.test('4.1 Controller updateAccount: successfully updates GL code, name, description, and cascades JournalEntry references', async () => {
    const accountId = new mongoose.Types.ObjectId();
    const account = new LedgerAccount({
      _id: accountId,
      tenant_id: tenantId,
      company_id: companyId,
      account_code: '1001',
      account_name: 'Cash in Hand',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      description: 'Old Description',
      status: 'ACTIVE'
    });

    let saved = false;
    account.save = async () => {
      saved = true;
      return account;
    };

    let cascadedJournalUpdates = null;
    const origFindOne = LedgerAccount.findOne;
    const origUpdateMany = JournalEntry.updateMany;

    LedgerAccount.findOne = async (query) => {
      const idMatch = query._id || query.$or?.[0]?._id;
      if (idMatch && idMatch.toString() === accountId.toString()) {
        return account;
      }
      return null;
    };

    JournalEntry.updateMany = async (filter, update) => {
      cascadedJournalUpdates = { filter, update };
      return { modifiedCount: 12 };
    };

    try {
      const { req, res, getResult } = createMockReqRes(
        {
          account_code: '1001-HQ',
          account_name: 'HQ Main Cash Register',
          description: 'Updated Head Office Cash Register',
          account_type: 'ASSET',
          normal_balance: 'DEBIT',
          currency: 'USD',
          status: 'ACTIVE'
        },
        { id: accountId.toString() }
      );

      await glController.updateAccount(req, res);
      const result = getResult();

      assert.strictEqual(result.status, 200);
      assert.strictEqual(result.body.success, true);
      assert.strictEqual(account.account_code, '1001-HQ');
      assert.strictEqual(account.account_name, 'HQ Main Cash Register');
      assert.strictEqual(account.description, 'Updated Head Office Cash Register');
      assert.strictEqual(saved, true);

      // Verify cascading updates to JournalEntry lines
      assert.ok(cascadedJournalUpdates, 'JournalEntry.updateMany must be invoked when account_code changes');
      assert.deepStrictEqual(cascadedJournalUpdates.update, { $set: { account_code: '1001-HQ' } });
    } finally {
      LedgerAccount.findOne = origFindOne;
      JournalEntry.updateMany = origUpdateMany;
    }
  });
});
