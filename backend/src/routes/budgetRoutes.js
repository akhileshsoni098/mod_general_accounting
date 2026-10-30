const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission, requireCompanyModule } = require('../middleware/companyMiddleware');
const budgetController = require('../controllers/budgetController');

router.use(requireAuth, requireTenantWorkspace, requireCompanyContext, requireCompanyModule('BUDGETS'));

router.get('/', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), budgetController.listBudgets);
router.post('/', requireCompanyPermission(['GL:ADMIN', 'COMPANY:ADMIN', 'GL:POST']), budgetController.saveBudget);
router.get('/:id/variance', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), budgetController.getVarianceReport);

module.exports = router;
