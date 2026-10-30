const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission, requireCompanyModule } = require('../middleware/companyMiddleware');
const fixedAssetController = require('../controllers/fixedAssetController');

router.use(requireAuth, requireTenantWorkspace, requireCompanyContext, requireCompanyModule('FIXED_ASSETS'));

router.get('/', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), fixedAssetController.listAssets);
router.get('/:id', requireCompanyPermission(['GL:VIEW', 'COMPANY:VIEW', 'COMPANY:ADMIN']), fixedAssetController.getAssetById);
router.post('/capitalize', requireCompanyPermission(['GL:ADMIN', 'GL:POST', 'COMPANY:ADMIN']), fixedAssetController.capitalizeAssetHandler);
router.post('/:id/depreciate', requireCompanyPermission(['GL:POST', 'GL:ADMIN', 'COMPANY:ADMIN']), fixedAssetController.postDepreciationHandler);
router.post('/:id/dispose', requireCompanyPermission(['GL:POST', 'GL:ADMIN', 'COMPANY:ADMIN']), fixedAssetController.disposeAssetHandler);

module.exports = router;
