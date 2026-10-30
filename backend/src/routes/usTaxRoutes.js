const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requirePermission } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission } = require('../middleware/companyMiddleware');
const usTaxController = require('../controllers/usTaxController');

// All US Tax routes require authentication, tenant workspace, and valid company context
router.use(requireAuth, requireTenantWorkspace, requireCompanyContext);

// ==========================================
// 1. Company Tax Profile
// ==========================================
router.get('/profile', requireCompanyPermission(['TAX:VIEW', 'COMPANY:VIEW']), usTaxController.getCompanyTaxProfile);
router.patch('/profile', requireCompanyPermission(['TAX:MANAGE', 'COMPANY:UPDATE']), usTaxController.updateCompanyTaxProfile);

// ==========================================
// 2. Jurisdictions Catalog
// ==========================================
router.get('/jurisdictions', requireCompanyPermission(['TAX:VIEW', 'COMPANY:VIEW']), usTaxController.listJurisdictions);
router.get('/jurisdictions/:idOrCode', requireCompanyPermission(['TAX:VIEW', 'COMPANY:VIEW']), usTaxController.getJurisdictionDetail);

// ==========================================
// 3. Tax Registrations
// ==========================================
router.get('/registrations', requireCompanyPermission(['TAX:VIEW', 'COMPANY:VIEW']), usTaxController.listRegistrations);
router.post('/registrations', requireCompanyPermission(['TAX:MANAGE', 'COMPANY:UPDATE']), usTaxController.createRegistration);
router.patch('/registrations/:id', requireCompanyPermission(['TAX:MANAGE', 'COMPANY:UPDATE']), usTaxController.updateRegistration);

// ==========================================
// 4. Nexus Reviews
// ==========================================
router.get('/nexus-reviews', requireCompanyPermission(['TAX:VIEW', 'COMPANY:VIEW']), usTaxController.listNexusReviews);
router.post('/nexus-reviews', requireCompanyPermission(['TAX:MANAGE', 'COMPANY:UPDATE']), usTaxController.upsertNexusReview);

// ==========================================
// 5. Provider Status & Rate Lookup
// ==========================================
router.get('/provider/health', requireCompanyPermission(['TAX:VIEW', 'COMPANY:VIEW']), usTaxController.getProviderHealth);
router.get('/provider/rates', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.lookupRates);

// ==========================================
// 6. Master Reference Data & Seed Import (Platform Admin)
// ==========================================
router.post('/seeds/preview', requirePermission('MODULE:CONFIGURE'), usTaxController.previewSeedImport);
router.post('/seeds/import', requirePermission('MODULE:CONFIGURE'), usTaxController.executeSeedImport);
router.get('/seeds/logs', requirePermission('MODULE:CONFIGURE'), usTaxController.getSyncLogs);

// ==========================================
// 7. Transaction Tax Calculation & Snapshots (Phase 3)
// ==========================================
router.post('/calculate', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW', 'COMMERCIAL:CREATE']), usTaxController.calculateTax);
router.get('/snapshots', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.listSnapshots);
router.get('/snapshots/:transactionId', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.getSnapshot);
router.post('/snapshots/:transactionId/commit', requireCompanyPermission(['TAX:MANAGE', 'COMMERCIAL:CREATE']), usTaxController.commitSnapshot);

// ==========================================
// 8. Tax Return Periods (Phase 5)
// ==========================================
router.get('/periods', requireCompanyPermission(['TAX:VIEW', 'COMPANY:VIEW']), usTaxController.listReturnPeriods);
router.post('/periods', requireCompanyPermission(['TAX:MANAGE', 'COMPANY:UPDATE']), usTaxController.createReturnPeriod);
router.get('/periods/:id', requireCompanyPermission(['TAX:VIEW', 'COMPANY:VIEW']), usTaxController.getReturnPeriod);
router.patch('/periods/:id/status', requireCompanyPermission(['TAX:MANAGE', 'COMPANY:UPDATE']), usTaxController.updateReturnPeriodStatus);

// ==========================================
// 9. Tax Liability Subledger (Phase 5)
// ==========================================
router.get('/subledger', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.getLiabilityEntries);
router.get('/subledger/summary', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.getLiabilitySummary);

// ==========================================
// 10. Tax Returns & Preparation (Phase 5)
// ==========================================
router.post('/returns/prepare', requireCompanyPermission(['TAX:MANAGE', 'COMMERCIAL:CREATE']), usTaxController.prepareDraftReturn);
router.get('/returns', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.listReturns);
router.get('/returns/:id', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.getReturnDetail);
router.patch('/returns/:id/status', requireCompanyPermission(['TAX:MANAGE', 'COMMERCIAL:CREATE']), usTaxController.transitionReturnStatus);

// ==========================================
// 11. Tax Payments & Credits (Phase 5)
// ==========================================
router.post('/payments', requireCompanyPermission(['TAX:MANAGE', 'PAYMENT:CREATE']), usTaxController.recordTaxPayment);
router.get('/payments', requireCompanyPermission(['TAX:VIEW', 'PAYMENT:VIEW']), usTaxController.listTaxPayments);
router.patch('/payments/:id/confirm', requireCompanyPermission(['TAX:MANAGE', 'PAYMENT:CREATE']), usTaxController.confirmTaxPayment);

// ==========================================
// 12. Reconciliations & Provider Retry (Phase 5)
// ==========================================
router.get('/reconcile/documents-to-subledger', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.reconcileDocumentsToSubledger);
router.get('/reconcile/subledger-to-gl', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.reconcileSubledgerToGl);
router.get('/reconcile/returns/:returnId', requireCompanyPermission(['TAX:VIEW', 'COMMERCIAL:VIEW']), usTaxController.reconcileReturnToPayments);
router.post('/reconcile/retry-provider', requireCompanyPermission(['TAX:MANAGE', 'COMMERCIAL:UPDATE']), usTaxController.retryProviderReconciliations);

module.exports = router;
