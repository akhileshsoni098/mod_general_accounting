const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requirePermission } = require('../middleware/tenantMiddleware');

// Workspace switching requires valid token, but not yet scoped to active workspace
router.post('/switch-workspace', requireAuth, tenantController.switchWorkspace);

// Workspaces scoped endpoints
router.use(requireAuth, requireTenantWorkspace);

// User & Role Management within tenant
router.get('/users', requirePermission('USER:VIEW'), tenantController.getTenantUsers);
router.post('/users/invite', requirePermission('USER:INVITE'), tenantController.inviteTenantUser);
router.get('/roles', tenantController.getRoles);

// Module Entitlement Configuration
router.get('/modules', tenantController.getModuleEntitlements);
router.patch('/modules', requirePermission('MODULE:CONFIGURE'), tenantController.updateModuleEntitlement);

// Organization Settings
router.get('/settings', tenantController.getOrganizationSettings);
router.patch('/settings', requirePermission('MODULE:CONFIGURE'), tenantController.updateOrganizationSettings);

// Developer Testing Helper: Reset Workspace Data (Strictly gated by environment flag, TENANT:ADMIN permission, and confirmation header)
router.post(
  '/reset-dev-data',
  requirePermission('TENANT:ADMIN'),
  (req, res, next) => {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_RESET !== 'true') {
      return res.error('Destructive reset endpoint is disabled. Set ENABLE_DEV_RESET=true in non-production environments to enable.', 403);
    }
    next();
  },
  tenantController.resetDevData
);

module.exports = router;
