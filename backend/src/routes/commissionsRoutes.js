const express = require('express');
const router = express.Router();
const commissionsController = require('../controllers/commissionsController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement } = require('../middleware/tenantMiddleware');

// Protect all commission routes with auth, tenant context, and entitlement
router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireModuleEntitlement('COMMISSIONS_FIDUCIARY'));

// Overview & KPIs
router.get('/overview', commissionsController.getOverview);

// Seed Canonical Setup
router.post('/seed', commissionsController.seedCommissions);

// Agreements
router.get('/agreements', commissionsController.getAgreements);
router.post('/agreements', commissionsController.createAgreement);
router.patch('/agreements/:id/status', commissionsController.updateAgreementStatus);

// Schedules
router.get('/schedules', commissionsController.getSchedules);
router.post('/schedules', commissionsController.createSchedule);
router.get('/schedules/resolve-preview', commissionsController.previewScheduleResolution);
router.get('/preview-chain', commissionsController.previewCanonicalChain);

// Profit Commission Schedules
router.get('/profit-schedules', commissionsController.getProfitCommissionSchedules);
router.post('/profit-schedules', commissionsController.createProfitCommissionSchedule);

// Splits
router.get('/splits', commissionsController.getSplits);
router.post('/splits', commissionsController.createSplit);

// Transactions
router.get('/transactions', commissionsController.getTransactions);
router.post('/transactions', commissionsController.processTransaction);
router.post('/transactions/:id/disburse', commissionsController.disburseBrokerCommission);

// Step 1.3: Commission & Carrier Share Allocation (accounting_architecture_guide.html)
router.post('/allocate-shares', commissionsController.allocateCommissionShares);

// Fiduciary Accounts & Sweeps
router.get('/fiduciary-accounts', commissionsController.getFiduciaryAccounts);
router.post('/fiduciary-accounts', commissionsController.createFiduciaryAccount);
router.post('/fiduciary-accounts/seed', commissionsController.seedFiduciaryAccounts);
router.post('/sweeps/execute', commissionsController.executeSweep);

// Bordereaux Definitions & Runs
router.get('/bordereau/definitions', commissionsController.getBordereauDefinitions);
router.get('/bordereau/runs', commissionsController.getBordereauRuns);
router.post('/bordereau/runs', commissionsController.generateBordereauRun);
router.post('/bordereau/runs/:runId/transmit', commissionsController.transmitBordereauRun);
router.get('/bordereau/runs/:runId/lines', commissionsController.getBordereauRunLines);

// Settlements
router.get('/settlements', commissionsController.getSettlements);
router.post('/settlements', commissionsController.generateSettlement);
router.post('/settlements/:id/disburse', commissionsController.disburseSettlement);

module.exports = router;
