const express = require('express');
const router = express.Router();
const eventDefCtrl = require('../controllers/eventDefinitionController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement, requirePermission } = require('../middleware/tenantMiddleware');

router.use(requireAuth, requireTenantWorkspace, requireModuleEntitlement('GL'));

// List / Get
router.get('/', requirePermission('GL:VIEW'), eventDefCtrl.getEventDefinitions);
router.get('/:id', requirePermission('GL:VIEW'), eventDefCtrl.getEventDefinitionById);

// Create Draft / Version / Validate
router.post('/', requirePermission('GL:ADMIN'), eventDefCtrl.createEventDefinition);
router.post('/:id/versions', requirePermission('GL:ADMIN'), eventDefCtrl.addSchemaVersion);
router.post('/:id/validate-payload', requirePermission('GL:VIEW'), eventDefCtrl.validatePayload);
router.patch('/:id/status', requirePermission('GL:ADMIN'), eventDefCtrl.updateStatus);

module.exports = router;
