const express = require('express');
const router = express.Router();
const bundleCtrl = require('../controllers/configBundleController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement, requirePermission } = require('../middleware/tenantMiddleware');

router.use(requireAuth, requireTenantWorkspace, requireModuleEntitlement('GL'));

router.get('/export', requirePermission('GL:VIEW'), bundleCtrl.exportConfiguration);
router.post('/preview', requirePermission('GL:VIEW'), bundleCtrl.previewImport);
router.post('/import', requirePermission('GL:ADMIN'), bundleCtrl.confirmedImport);

module.exports = router;
