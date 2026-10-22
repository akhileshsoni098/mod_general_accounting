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
router.post('/', requirePermission(['GL:ADMIN', 'GL:POST']), ruleCtrl.createPostingRule);
router.patch('/:id', requirePermission(['GL:ADMIN', 'GL:POST']), ruleCtrl.updatePostingRule);
router.post('/:id/fork', requirePermission(['GL:ADMIN', 'GL:POST']), ruleCtrl.forkDraftVersion);
router.post('/:id/validate', requirePermission('GL:VIEW'), ruleCtrl.validateRule);
router.post('/:id/publish', requirePermission(['GL:ADMIN', 'GL:POST']), ruleCtrl.publishRule);
router.post('/:id/retire', requirePermission(['GL:ADMIN', 'GL:POST']), ruleCtrl.retireRule);
router.post('/:id/reactivate', requirePermission(['GL:ADMIN', 'GL:POST']), ruleCtrl.reactivateRule);
router.delete('/:id', requirePermission(['GL:ADMIN', 'GL:POST']), ruleCtrl.deletePostingRule);

// Simulation & Posting
router.post('/simulate', requirePermission('GL:VIEW'), ruleCtrl.simulateEvent);
router.post('/simulate/post', requirePermission('GL:POST'), ruleCtrl.postSimulatedJournal);

module.exports = router;
