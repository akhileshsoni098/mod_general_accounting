const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement, requirePermission } = require('../middleware/tenantMiddleware');
const eventPipelineController = require('../controllers/eventPipelineController');

// All pipeline routes require authentication, active tenant workspace, and GL module entitlement
router.use(requireAuth, requireTenantWorkspace, requireModuleEntitlement('GL'));

// Operational Stats
router.get('/stats', requirePermission('GL:VIEW'), eventPipelineController.getPipelineStats);

// Outbox endpoints
router.get('/outbox', requirePermission('GL:VIEW'), eventPipelineController.listOutbox);
router.post('/outbox/:eventId/retry', requirePermission('GL:ADMIN'), eventPipelineController.retryOutbox);
router.post('/outbox/:eventId/replay', requirePermission('GL:ADMIN'), eventPipelineController.replayOutbox);

// Inbox endpoints
router.get('/inbox', requirePermission('GL:VIEW'), eventPipelineController.listInbox);
router.post('/inbox/:id/retry', requirePermission('GL:ADMIN'), eventPipelineController.retryInbox);
router.post('/inbox/:id/replay', requirePermission('GL:ADMIN'), eventPipelineController.replayInbox);

// Dispatcher manual trigger
router.post('/dispatch', requirePermission('GL:ADMIN'), eventPipelineController.triggerDispatch);

// Event Trace
router.get('/trace/:identifier', requirePermission('GL:VIEW'), eventPipelineController.getEventTrace);

// Subscriptions
router.get('/subscriptions', requirePermission('GL:VIEW'), eventPipelineController.listSubscriptions);
router.post('/subscriptions', requirePermission('GL:ADMIN'), eventPipelineController.upsertSubscription);
router.patch('/subscriptions/:id/toggle', requirePermission('GL:ADMIN'), eventPipelineController.toggleSubscription);

module.exports = router;
