const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement } = require('../middleware/tenantMiddleware');
const treasuryController = require('../controllers/treasuryController');

router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireModuleEntitlement('TREASURY_BANK_REC'));

// Overview
router.get('/overview', treasuryController.getTreasuryOverview);

// Mandates
router.get('/mandates', treasuryController.getMandates);
router.post('/mandates', treasuryController.createMandate);
router.patch('/mandates/:id/status', treasuryController.updateMandateStatus);

// Attempts
router.get('/attempts', treasuryController.getAttempts);
router.post('/attempts', treasuryController.postPaymentAttempt);

// Processor Transactions
router.get('/processor-transactions', treasuryController.getProcessorTransactions);

// Bank Statements & Lines
router.get('/bank-lines', treasuryController.getBankStatementLines);
router.post('/bank-lines/import', treasuryController.postImportBankStatement);

// 4-Way Bank Reconciliation & Matching
router.get('/matches', treasuryController.getReconciliationMatches);
router.post('/auto-reconcile', treasuryController.postAutoReconcile);
router.post('/manual-match', treasuryController.postManualMatch);

// Payment Returns (NSF)
router.get('/returns', treasuryController.getPaymentReturns);
router.post('/returns', treasuryController.postPaymentReturn);

// Refunds
router.get('/refunds', treasuryController.getRefunds);
router.post('/refunds', treasuryController.postRefund);

// Dunning & Collections
router.get('/dunning/plans', treasuryController.getDunningPlans);
router.get('/dunning/cases', treasuryController.getDelinquencyCases);
router.get('/dunning/actions', treasuryController.getDunningActions);
router.get('/dunning/assignments', treasuryController.getCollectionAssignments);

module.exports = router;
