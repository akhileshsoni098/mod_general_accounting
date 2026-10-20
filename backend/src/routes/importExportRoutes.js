const express = require('express');
const router = express.Router();
const importExportController = require('../controllers/importExportController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext } = require('../middleware/companyMiddleware');

router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireCompanyContext);

router.post('/import/accounts', (req, res) => importExportController.importAccounts(req, res));
router.post('/import/stock-items', (req, res) => importExportController.importStockItems(req, res));
router.get('/export/accounts', (req, res) => importExportController.exportAccounts(req, res));
router.get('/export/stock-balances', (req, res) => importExportController.exportStockBalances(req, res));

module.exports = router;
