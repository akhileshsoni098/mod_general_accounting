const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement, requirePermission } = require('../middleware/tenantMiddleware');
const { requireCompanyContext } = require('../middleware/companyMiddleware');

const glController = require('../controllers/glController');

// GL Module Router with Entitlement Gating and Company Context
router.use(requireAuth, requireTenantWorkspace, requireCompanyContext, requireModuleEntitlement('GL'));

// Staged endpoint for GL Chart of Accounts / Subledger inspection
router.get('/ping', requirePermission('GL:VIEW'), (req, res) => {
  return res.success({
    module: 'GL',
    status: 'ACTIVE',
    tenant_id: req.tenantId,
    message: 'General Ledger module entitlement confirmed active and accessible.'
  });
});

// Chart of Accounts (COA)
router.get('/accounts', requirePermission('GL:VIEW'), glController.getAccounts);
router.get('/accounts/:id', requirePermission('GL:VIEW'), glController.getAccountDetail);
router.post('/accounts', requirePermission('GL:ADMIN'), glController.createAccount);
router.patch('/accounts/:id', requirePermission('GL:ADMIN'), glController.updateAccount);

// Fiscal Periods
router.get('/periods', requirePermission('GL:VIEW'), glController.getFiscalPeriods);
router.post('/periods', requirePermission('GL:ADMIN'), glController.createFiscalPeriod);
router.patch('/periods/status', requirePermission('GL:ADMIN'), glController.updateFiscalPeriodStatus);

// Journal Entries & Posting
router.get('/journals', requirePermission('GL:VIEW'), glController.getJournals);
router.get('/journals/:id', requirePermission('GL:VIEW'), glController.getJournalById);
router.post('/journals/preview', requirePermission('GL:VIEW'), glController.previewJournalTotals);
router.post('/journals', requirePermission('GL:POST'), glController.postJournal);
router.post('/journals/:id/reverse', requirePermission('GL:POST'), glController.reverseJournal);

// Trial Balance & Financial Statements
router.get('/trial-balance', requirePermission('GL:VIEW'), glController.getTrialBalance);
router.get('/financial-statements', requirePermission('GL:VIEW'), glController.getFinancialStatements);

// Posting Rules
router.get('/posting-rules', requirePermission('GL:VIEW'), glController.getPostingRules);
router.post('/posting-rules', requirePermission('GL:ADMIN'), glController.createPostingRule);

// Exchange Rates
router.get('/exchange-rates', requirePermission('GL:VIEW'), glController.getExchangeRates);
router.post('/exchange-rates', requirePermission('GL:ADMIN'), glController.createExchangeRate);

module.exports = router;
