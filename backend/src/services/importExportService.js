const mongoose = require('mongoose');
const {
  LedgerAccount,
  StockItem,
  StockGroup,
  UnitOfMeasurement,
  Party,
  CommercialDocument,
  StockBalance
} = require('../models');

class ImportExportService {
  /**
   * Import Chart of Accounts
   */
  async importAccounts({ tenantId, companyId, rows, dryRun = true }) {
    const results = {
      total_rows: rows.length,
      valid_rows: 0,
      invalid_rows: 0,
      errors: [],
      preview: []
    };

    const toInsert = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNo = i + 1;

      if (!row.account_code || !row.account_name || !row.account_type) {
        results.invalid_rows++;
        results.errors.push({ line: lineNo, error: 'account_code, account_name, and account_type are required.' });
        continue;
      }

      const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
      const normalizedType = String(row.account_type).trim().toUpperCase();
      if (!validTypes.includes(normalizedType)) {
        results.invalid_rows++;
        results.errors.push({ line: lineNo, error: `Invalid account_type: ${row.account_type}` });
        continue;
      }

      const exists = await LedgerAccount.findOne({
        tenant_id: tenantId,
        account_code: String(row.account_code).trim().toUpperCase()
      });

      if (exists) {
        results.invalid_rows++;
        results.errors.push({ line: lineNo, error: `Account code ${row.account_code} already exists.` });
        continue;
      }

      const accountDoc = {
        tenant_id: tenantId,
        company_id: companyId,
        account_code: String(row.account_code).trim().toUpperCase(),
        account_name: String(row.account_name || row.name).trim(),
        account_type: normalizedType,
        normal_balance: row.normal_balance ? String(row.normal_balance).trim().toUpperCase() : (['ASSET', 'EXPENSE'].includes(normalizedType) ? 'DEBIT' : 'CREDIT'),
        status: 'ACTIVE'
      };

      toInsert.push(accountDoc);
      results.valid_rows++;
      if (results.preview.length < 10) {
        results.preview.push(accountDoc);
      }
    }

    if (!dryRun && toInsert.length > 0) {
      await LedgerAccount.insertMany(toInsert);
      results.applied = true;
    } else {
      results.applied = false;
    }

    return results;
  }

  /**
   * Import Stock Items
   */
  async importStockItems({ tenantId, companyId, rows, dryRun = true }) {
    const results = {
      total_rows: rows.length,
      valid_rows: 0,
      invalid_rows: 0,
      errors: [],
      preview: []
    };

    const toInsert = [];

    // Find default UOM and default Group
    const defaultUom = await UnitOfMeasurement.findOne({ company_id: companyId, status: 'ACTIVE' })
      || await UnitOfMeasurement.findOne({ tenant_id: tenantId });
    const defaultGroup = await StockGroup.findOne({ company_id: companyId, is_active: true })
      || await StockGroup.findOne({ tenant_id: tenantId });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNo = i + 1;

      if (!row.item_code || !row.item_name) {
        results.invalid_rows++;
        results.errors.push({ line: lineNo, error: 'item_code and item_name are required.' });
        continue;
      }

      const code = String(row.item_code).trim().toUpperCase();
      const exists = await StockItem.findOne({ company_id: companyId, item_code: code });
      if (exists) {
        results.invalid_rows++;
        results.errors.push({ line: lineNo, error: `Item code ${code} already exists in this company.` });
        continue;
      }

      let uomId = defaultUom ? defaultUom._id : null;
      if (row.uom_code) {
        const foundUom = await UnitOfMeasurement.findOne({
          tenant_id: tenantId,
          unit_code: String(row.uom_code).trim().toUpperCase()
        });
        if (foundUom) uomId = foundUom._id;
      }

      let groupId = defaultGroup ? defaultGroup._id : null;
      if (row.group_code) {
        const foundGroup = await StockGroup.findOne({
          tenant_id: tenantId,
          group_code: String(row.group_code).trim().toUpperCase()
        });
        if (foundGroup) groupId = foundGroup._id;
      }

      if (!uomId) {
        results.invalid_rows++;
        results.errors.push({ line: lineNo, error: 'No valid base UOM found.' });
        continue;
      }

      const itemDoc = {
        tenant_id: tenantId,
        company_id: companyId,
        item_code: code,
        sku: row.sku ? String(row.sku).trim().toUpperCase() : code,
        item_name: String(row.item_name).trim(),
        stock_group_id: groupId,
        base_uom_id: uomId,
        standard_cost: Number(row.standard_cost || 0),
        standard_selling_price: Number(row.standard_price || 0),
        hsn_sac_code: row.hsn_code ? String(row.hsn_code).trim() : '',
        is_stock_tracked: row.is_service === 'true' || row.is_service === true ? false : true,
        is_active: true
      };

      toInsert.push(itemDoc);
      results.valid_rows++;
      if (results.preview.length < 10) {
        results.preview.push(itemDoc);
      }
    }

    if (!dryRun && toInsert.length > 0) {
      await StockItem.insertMany(toInsert);
      results.applied = true;
    } else {
      results.applied = false;
    }

    return results;
  }

  /**
   * Export stock balances to CSV-friendly JSON array
   */
  async exportStockBalances(companyId) {
    const balances = await StockBalance.find({ company_id: companyId })
      .populate('stock_item_id godown_id base_uom_id');

    return balances.map(b => ({
      item_code: b.stock_item_id ? b.stock_item_id.item_code : 'N/A',
      item_name: b.stock_item_id ? b.stock_item_id.item_name : 'N/A',
      godown_code: b.godown_id ? b.godown_id.godown_code : 'DEFAULT',
      godown_name: b.godown_id ? b.godown_id.name : 'Default Warehouse',
      quantity_on_hand: Number(b.quantity_on_hand || 0),
      uom: b.base_uom_id ? b.base_uom_id.unit_code : '',
      average_unit_cost: Number(b.average_unit_cost || 0),
      total_value: Number(b.total_inventory_value || 0)
    }));
  }

  /**
   * Export Chart of Accounts
   */
  async exportAccounts(tenantId, companyId = null) {
    const q = { tenant_id: tenantId, status: 'ACTIVE' };
    if (companyId) q.company_id = companyId;
    const accounts = await LedgerAccount.find(q).sort({ account_code: 1 });
    return accounts.map(a => ({
      account_code: a.account_code,
      name: a.account_name,
      account_type: a.account_type,
      normal_balance: a.normal_balance
    }));
  }
}

module.exports = new ImportExportService();
