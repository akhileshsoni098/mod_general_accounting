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
router.put('/accounts/:id', requirePermission('GL:ADMIN'), glController.updateAccount);
router.patch('/accounts/:id', requirePermission('GL:ADMIN'), glController.updateAccount);
router.delete('/accounts/:id', requirePermission('GL:ADMIN'), glController.archiveAccount);

// Opening Balances Management
router.get('/opening-balances', requirePermission('GL:VIEW'), glController.getOpeningBalances);
router.put('/opening-balances', requirePermission('GL:ADMIN'), glController.saveOpeningBalancesDraft);
router.post('/opening-balances', requirePermission('GL:ADMIN'), glController.saveOpeningBalancesDraft);
router.post('/opening-balances/post', requirePermission('GL:POST'), glController.postOpeningBalances);

// Fiscal Periods
router.get('/periods', requirePermission('GL:VIEW'), glController.getFiscalPeriods);
router.post('/periods', requirePermission('GL:ADMIN'), glController.createFiscalPeriod);
router.patch('/periods/status', requirePermission('GL:ADMIN'), glController.updateFiscalPeriodStatus);

// US Accounting Calendars & Retail Period Engine
router.get('/calendars', requirePermission('GL:VIEW'), glController.getAccountingCalendars);
router.post('/calendars', requirePermission('GL:ADMIN'), glController.createAccountingCalendar);
router.patch('/calendars/:id', requirePermission('GL:ADMIN'), glController.updateAccountingCalendar);
router.post('/calendars/:id/generate', requirePermission('GL:ADMIN'), glController.generateCalendarPeriods);
router.get('/calendars/:id/periods', requirePermission('GL:VIEW'), glController.getCalendarPeriods);

// Journal Entries & Posting
router.get('/journals', requirePermission('GL:VIEW'), glController.getJournals);
router.get('/journals/:id', requirePermission('GL:VIEW'), glController.getJournalById);
router.post('/journals/preview', requirePermission('GL:VIEW'), glController.previewJournalTotals);
router.post('/journals', requirePermission('GL:POST'), glController.postJournal);
router.post('/journals/:id/convert', requirePermission('GL:POST'), glController.convertVoucher);
router.post('/journals/:id/reverse', requirePermission('GL:POST'), glController.reverseJournal);

// Trial Balance & Financial Statements
router.get('/trial-balance', requirePermission('GL:VIEW'), glController.getTrialBalance);
router.get('/financial-statements', requirePermission('GL:VIEW'), glController.getFinancialStatements);
router.get('/reports/cash-flow', requirePermission('GL:VIEW'), glController.getCashFlowStatement);
router.get('/reports/financial-ratios', requirePermission('GL:VIEW'), glController.getFinancialRatios);

// Posting Rules CRUD
router.get('/posting-rules', requirePermission('GL:VIEW'), glController.getPostingRules);
router.get('/posting-rules/:id', requirePermission('GL:VIEW'), glController.getPostingRuleById);
router.post('/posting-rules', requirePermission(['GL:ADMIN', 'GL:POST']), glController.createPostingRule);
router.patch('/posting-rules/:id', requirePermission(['GL:ADMIN', 'GL:POST']), glController.updatePostingRule);
router.put('/posting-rules/:id', requirePermission(['GL:ADMIN', 'GL:POST']), glController.updatePostingRule);
router.delete('/posting-rules/:id', requirePermission(['GL:ADMIN', 'GL:POST']), glController.deletePostingRule);

// Exchange Rates
router.get('/exchange-rates', requirePermission('GL:VIEW'), glController.getExchangeRates);
router.post('/exchange-rates', requirePermission('GL:ADMIN'), glController.createExchangeRate);

module.exports = router;
