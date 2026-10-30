const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission, requireCompanyModule } = require('../middleware/companyMiddleware');
const chequeController = require('../controllers/chequeController');

router.use(requireAuth, requireTenantWorkspace, requireCompanyContext, requireCompanyModule('CHEQUE_PRINTING'));

router.get('/layouts', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), chequeController.listLayouts);
router.post('/layouts', requireCompanyPermission(['GL:ADMIN', 'COMPANY:ADMIN', 'GL:POST']), chequeController.createLayout);

router.get('/register', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), chequeController.listRegister);
router.post('/issue-and-print', requireCompanyPermission(['GL:POST', 'GL:ADMIN', 'COMPANY:ADMIN']), chequeController.issueAndPrintHandler);

module.exports = router;
