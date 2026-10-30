const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission, requireCompanyModule } = require('../middleware/companyMiddleware');
const statutoryController = require('../controllers/statutoryController');

router.use(requireAuth, requireTenantWorkspace, requireCompanyContext, requireCompanyModule('STATUTORY_TDS'));

router.get('/sections', requireCompanyPermission(['GL:VIEW']), statutoryController.listSections);
router.get('/deductions', requireCompanyPermission(['GL:VIEW']), statutoryController.listDeductions);
router.post('/deductions', requireCompanyPermission(['GL:POST']), statutoryController.recordDeduction);
router.get('/form26q', requireCompanyPermission(['GL:VIEW']), statutoryController.getForm26Q);
router.get('/msme-aging', requireCompanyPermission(['GL:VIEW']), statutoryController.getMsmeAging);

module.exports = router;
