const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  StockMovement,
  StockItem,
  Godown,
  LedgerAccount,
  FiscalPeriod
} = require('../models');
const { withOptionalTransaction } = require('../utils/transactionHelper');
const { postJournalEntry } = require('./journalPostingService');
const { validateAndResolvePostingAccounts } = require('./commercialPostingConfigService');

/**
 * Generates a read-only dry-run preview of eligible unposted opening stock movements
 * without mutating database records.
 *
 * @param {string|ObjectId} tenantId
 * @param {string|ObjectId} companyId
 * @returns {Promise<Object>}
 */
async function previewOpeningStockGlCatchUp(tenantId, companyId) {
  if (!tenantId || !companyId) {
    throw new Error('tenantId and companyId are required');
  }

  // Find opening stock movements that haven't been posted to GL yet
  const movements = await StockMovement.find({
    tenant_id: tenantId,
    company_id: companyId,
    movement_type: 'OPENING_STOCK',
    is_reversed: false,
    gl_status: { $ne: 'POSTED' }
  }).populate('stock_item_id').populate('godown_id');

  let totalValueBn = new BigNumber(0);
  const itemsSummary = [];

  for (const mov of movements) {
    const costBn = new BigNumber(mov.total_cost ? mov.total_cost.toString() : '0');
    totalValueBn = totalValueBn.plus(costBn);

    itemsSummary.push({
      movement_id: mov._id,
      item_code: mov.stock_item_id?.item_code || 'UNKNOWN',
      item_name: mov.stock_item_id?.item_name || 'Item',
      godown_name: mov.godown_id?.godown_name || 'Main Godown',
      quantity: mov.quantity.toString(),
      unit_rate: mov.unit_rate.toString(),
      total_cost: costBn.toFixed(2),
      effective_date: mov.effective_date,
      current_gl_status: mov.gl_status || 'PENDING'
    });
  }

  // Validate accounts configuration
  let configStatus = 'READY';
  let configErrors = [];
  let assetAccount = null;
  let offsetAccount = null;

  try {
    const { config, accountMap } = await validateAndResolvePostingAccounts(tenantId, companyId);
    assetAccount = accountMap[config.inventory_asset_account_code];
    offsetAccount = accountMap[config.opening_stock_offset_account_code];

    if (!assetAccount || !offsetAccount) {
      configStatus = 'MISSING_ACCOUNTS';
      configErrors.push('Inventory Asset or Opening Stock Offset account not mapped.');
    }
  } catch (err) {
    configStatus = 'CONFIG_ERROR';
    configErrors.push(err.message);
  }

  return {
    as_of: new Date().toISOString(),
    eligible_count: movements.length,
    total_opening_value: totalValueBn.toFixed(2),
    config_status: configStatus,
    config_errors: configErrors,
    proposed_journal: {
      debit_account: assetAccount ? `${assetAccount.account_code} - ${assetAccount.account_name}` : '1201 - Inventory Asset',
      credit_account: offsetAccount ? `${offsetAccount.account_code} - ${offsetAccount.account_name}` : '3990 - Opening Stock Offset Reserve',
      amount: totalValueBn.toFixed(2),
      is_balanced: true
    },
    items: itemsSummary
  };
}

/**
 * Idempotently creates the double-entry journal for opening stock movements
 * and updates movement gl_status atomically.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.tenantId
 * @param {string|ObjectId} params.companyId
 * @param {string|ObjectId} params.userId
 * @param {Date|string} [params.postingDate]
 * @returns {Promise<Object>}
 */
async function postOpeningStockGlCatchUp({ tenantId, companyId, userId, postingDate = new Date() }) {
  if (!tenantId || !companyId) {
    throw new Error('tenantId and companyId are required');
  }

  const operation = async (session) => {
    // 1. Find all unposted opening stock movements within session
    const movements = await StockMovement.find({
      tenant_id: tenantId,
      company_id: companyId,
      movement_type: 'OPENING_STOCK',
      is_reversed: false,
      gl_status: { $ne: 'POSTED' }
    }).session(session);

    if (!movements || movements.length === 0) {
      return {
        posted: false,
        message: 'No pending opening stock movements found. Opening stock is already fully posted to General Ledger.',
        count: 0,
        total_amount: '0.00'
      };
    }

    // 2. Validate configuration and accounts
    const { config } = await validateAndResolvePostingAccounts(tenantId, companyId, { session });

    // 3. Validate Fiscal Period
    const pDate = new Date(postingDate);
    const period = await FiscalPeriod.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      start_date: { $lte: pDate },
      end_date: { $gte: pDate }
    }).session(session);

    if (period && (period.status === 'LOCKED' || period.status === 'HARD_CLOSED')) {
      throw new Error(`Fiscal period "${period.period_name}" is ${period.status}. Opening stock GL catch-up cannot be posted.`);
    }

    // 4. Calculate total opening value
    let totalValueBn = new BigNumber(0);
    for (const mov of movements) {
      const costBn = new BigNumber(mov.total_cost ? mov.total_cost.toString() : '0');
      totalValueBn = totalValueBn.plus(costBn);
    }

    if (totalValueBn.isLessThanOrEqualTo(0)) {
      return {
        posted: false,
        message: 'Opening stock total valuation is zero. No financial journal required.',
        count: movements.length,
        total_amount: '0.00'
      };
    }

    // 5. Build and post balanced journal entry
    const journalLines = [
      {
        account_code: config.inventory_asset_account_code,
        debit: totalValueBn.toFixed(2),
        credit: '0.00',
        memo: `Opening stock inventory asset valuation (${movements.length} items)`
      },
      {
        account_code: config.opening_stock_offset_account_code,
        debit: '0.00',
        credit: totalValueBn.toFixed(2),
        memo: `Opening stock offset equity reserve (${movements.length} items)`
      }
    ];

    const refId = `OPN-GL-${companyId}`;
    const glRes = await postJournalEntry({
      tenantId,
      companyId,
      userId,
      postingDate: pDate,
      sourceModule: 'OPENING_STOCK',
      referenceId: refId,
      memo: `Opening stock GL catch-up for ${movements.length} item(s)`,
      lines: journalLines,
      currency: 'INR',
      session
    });

    // 6. Atomically update movement gl_status and link journal
    for (const mov of movements) {
      mov.gl_status = 'POSTED';
      mov.gl_journal_id = glRes.journal._id;
      mov.gl_posted_at = new Date();
      await mov.save({ session });
    }

    return {
      posted: true,
      journal: glRes.journal,
      count: movements.length,
      total_amount: totalValueBn.toFixed(2),
      message: `Successfully posted opening stock GL catch-up journal ${glRes.journal.journal_number}`
    };
  };

  return withOptionalTransaction(operation);
}

module.exports = {
  previewOpeningStockGlCatchUp,
  postOpeningStockGlCatchUp
};
