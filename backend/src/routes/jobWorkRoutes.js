const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission, requireCompanyModule } = require('../middleware/companyMiddleware');
const jobWorkController = require('../controllers/jobWorkController');

router.use(requireAuth, requireTenantWorkspace, requireCompanyContext, requireCompanyModule('JOB_WORK'));

router.get('/orders', requireCompanyPermission(['INVENTORY:VIEW', 'GL:VIEW', 'COMPANY:VIEW']), jobWorkController.listOrders);
router.post('/orders', requireCompanyPermission(['INVENTORY:MANAGE_MASTERS', 'INVENTORY:ADMIN', 'GL:POST', 'COMPANY:ADMIN']), jobWorkController.createOrder);
router.post('/orders/:id/receipt', requireCompanyPermission(['INVENTORY:MANAGE_MASTERS', 'INVENTORY:ADMIN', 'GL:POST', 'COMPANY:ADMIN']), jobWorkController.recordReceipt);

module.exports = router;
