const express = require('express');
const router = express.Router();
const platformAdminController = require('../controllers/platformAdminController');
const { requireAuth } = require('../middleware/authMiddleware');

// Platform administration endpoints (Accessible to authenticated users / platform administrators)
router.use(requireAuth);

router.get('/plans', (req, res) => platformAdminController.getPlans(req, res));
router.get('/tenants', (req, res) => platformAdminController.getTenants(req, res));
router.get('/tenants/:tenantId/subscription', (req, res) => platformAdminController.getTenantSubscription(req, res));
router.put('/tenants/:tenantId/subscription', (req, res) => platformAdminController.updateTenantPlan(req, res));
router.put('/tenants/:tenantId/status', (req, res) => platformAdminController.updateTenantStatus(req, res));
router.get('/audit-logs', (req, res) => platformAdminController.getAuditLogs(req, res));

module.exports = router;
