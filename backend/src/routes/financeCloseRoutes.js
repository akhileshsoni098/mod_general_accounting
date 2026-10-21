const express = require('express');
const router = express.Router();
const financeCloseController = require('../controllers/financeCloseController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement } = require('../middleware/tenantMiddleware');
const { requireCompanyModule } = require('../middleware/companyMiddleware');

// Protect all finance close routes
router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireModuleEntitlement('FINANCE_CLOSE'));
router.use(requireCompanyModule('FINANCE_CLOSE', { optionalCompany: true }));

// Overview
router.get('/overview', financeCloseController.getOverview);

// UPR & Earned Premium
router.get('/upr/preview', financeCloseController.previewUPR);
router.post('/upr/run', financeCloseController.runUPRAmortization);

// Subledger Reconciliations
router.get('/reconciliation/subledgers', financeCloseController.getSubledgerBalances);
router.get('/reconciliation/cases', financeCloseController.getReconciliationCases);
router.patch('/reconciliation/cases/:id/resolve', financeCloseController.resolveReconciliationCase);

// Close Checklist (7-Steps)
router.get('/checklist', financeCloseController.getCloseChecklist);
router.post('/checklist/step/:step/execute', financeCloseController.executeCloseTask);

// Trial Balance
router.get('/trial-balance', financeCloseController.getTrialBalance);
router.post('/trial-balance/certify', financeCloseController.certifyTrialBalance);

// Financial Statements
router.get('/reports/financial-statements', financeCloseController.getFinancialStatements);

// ERP Export Batches
router.get('/export-batches', financeCloseController.getExportBatches);
router.post('/export-batches', financeCloseController.createExportBatch);

// Commission Adjustments & Disputes
router.get('/adjustments', financeCloseController.getAdjustments);
router.get('/disputes', financeCloseController.getDisputes);

module.exports = router;
