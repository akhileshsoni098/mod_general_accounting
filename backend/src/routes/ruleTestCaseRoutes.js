const express = require('express');
const router = express.Router();
const testCaseCtrl = require('../controllers/ruleTestCaseController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement, requirePermission } = require('../middleware/tenantMiddleware');

router.use(requireAuth, requireTenantWorkspace, requireModuleEntitlement('GL'));

router.get('/', requirePermission('GL:VIEW'), testCaseCtrl.getTestCases);
router.post('/', requirePermission('GL:ADMIN'), testCaseCtrl.createTestCase);
router.post('/:id/run', requirePermission('GL:VIEW'), testCaseCtrl.runTestCase);

module.exports = router;
