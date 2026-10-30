const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission, requireCompanyModule } = require('../middleware/companyMiddleware');
const payrollController = require('../controllers/payrollController');

router.use(requireAuth, requireTenantWorkspace, requireCompanyContext, requireCompanyModule('PAYROLL'));

router.get('/employees', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), payrollController.listEmployees);
router.post('/employees', requireCompanyPermission(['GL:ADMIN', 'COMPANY:ADMIN', 'GL:POST']), payrollController.createEmployee);

router.get('/structures', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), payrollController.listSalaryStructures);
router.post('/structures', requireCompanyPermission(['GL:ADMIN', 'COMPANY:ADMIN', 'GL:POST']), payrollController.createSalaryStructure);

router.get('/preview', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), payrollController.previewPayroll);
router.post('/post', requireCompanyPermission(['GL:POST', 'GL:ADMIN', 'COMPANY:ADMIN']), payrollController.postPayroll);
router.post('/runs/:id/disburse', requireCompanyPermission(['GL:POST', 'GL:ADMIN', 'COMPANY:ADMIN']), payrollController.disbursePayroll);

module.exports = router;
