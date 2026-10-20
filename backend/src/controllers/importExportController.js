const importExportService = require('../services/importExportService');

class ImportExportController {
  async importAccounts(req, res) {
    try {
      const { rows, dry_run = true } = req.body;
      if (!rows || !Array.isArray(rows)) {
        return res.error('rows array is required.', 400);
      }
      const result = await importExportService.importAccounts({
        tenantId: req.tenantId,
        companyId: req.companyId,
        rows,
        dryRun: dry_run
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async importStockItems(req, res) {
    try {
      const { rows, dry_run = true } = req.body;
      if (!rows || !Array.isArray(rows)) {
        return res.error('rows array is required.', 400);
      }
      const result = await importExportService.importStockItems({
        tenantId: req.tenantId,
        companyId: req.companyId,
        rows,
        dryRun: dry_run
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async exportAccounts(req, res) {
    try {
      const data = await importExportService.exportAccounts(req.tenantId);
      return res.success(data);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async exportStockBalances(req, res) {
    try {
      const data = await importExportService.exportStockBalances(req.companyId);
      return res.success(data);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }
}

module.exports = new ImportExportController();
