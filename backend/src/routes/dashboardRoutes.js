const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');

// Tenant scoped dashboard metrics
router.use(requireAuth, requireTenantWorkspace);

router.get('/metrics', dashboardController.getDashboardMetrics);

module.exports = router;
