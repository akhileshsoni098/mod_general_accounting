const express = require('express');
const router = express.Router();
const ruleCtrl = require('../controllers/postingRuleController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement, requirePermission } = require('../middleware/tenantMiddleware');
const { requireCompanyModule } = require('../middleware/companyMiddleware');

router.use(requireAuth, requireTenantWorkspace, requireModuleEntitlement('GL'), requireCompanyModule('RULES_ENGINE', { optionalCompany: true }));

// Rule Queries
router.get('/', requirePermission('GL:VIEW'), ruleCtrl.getPostingRules);
router.get('/:id', requirePermission('GL:VIEW'), ruleCtrl.getPostingRuleById);

// Rule Authoring & Lifecycle
router.post('/', requirePermission('GL:ADMIN'), ruleCtrl.createPostingRule);
router.patch('/:id', requirePermission('GL:ADMIN'), ruleCtrl.updatePostingRule);
router.post('/:id/fork', requirePermission('GL:ADMIN'), ruleCtrl.forkDraftVersion);
router.post('/:id/validate', requirePermission('GL:VIEW'), ruleCtrl.validateRule);
router.post('/:id/publish', requirePermission('GL:ADMIN'), ruleCtrl.publishRule);
router.post('/:id/retire', requirePermission('GL:ADMIN'), ruleCtrl.retireRule);
router.post('/:id/reactivate', requirePermission('GL:ADMIN'), ruleCtrl.reactivateRule);
router.delete('/:id', requirePermission('GL:ADMIN'), ruleCtrl.deletePostingRule);

// Simulation & Posting
router.post('/simulate', requirePermission('GL:VIEW'), ruleCtrl.simulateEvent);
router.post('/simulate/post', requirePermission('GL:POST'), ruleCtrl.postSimulatedJournal);

module.exports = router;
