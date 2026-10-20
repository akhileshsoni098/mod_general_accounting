const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission } = require('../middleware/companyMiddleware');

const commercialController = require('../controllers/commercialController');

// All commercial endpoints require authentication, tenant workspace, and valid company context
router.use(requireAuth, requireTenantWorkspace, requireCompanyContext);

// ==========================================
// 1. COMMERCIAL DOCUMENTS
// ==========================================
router.get('/documents', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW', 'PURCHASE:VIEW']), commercialController.getDocuments);
router.get('/documents/:id', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW', 'PURCHASE:VIEW']), commercialController.getDocumentById);
router.post('/documents', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:CREATE', 'PURCHASE:CREATE', 'RECEIPT:CREATE', 'PAYMENT:CREATE']), commercialController.createDocument);
router.put('/documents/:id', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:CREATE', 'PURCHASE:CREATE']), commercialController.updateDocument);
router.post('/documents/:id/post', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:POST', 'PURCHASE:POST', 'RECEIPT:CREATE', 'PAYMENT:CREATE']), commercialController.postDocument);
router.post('/documents/:id/reverse', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:REVERSE', 'TRANSACTION:REVERSE']), commercialController.reverseDocument);
router.delete('/documents/:id', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:CREATE', 'PURCHASE:CREATE']), commercialController.cancelDocument);

// ==========================================
// 2. POSTING CONFIG & ACCOUNT MAPPINGS
// ==========================================
router.get('/posting-config', requireCompanyPermission(['COMMERCIAL:VIEW', 'ACCOUNT_MAPPING:VIEW']), commercialController.getPostingConfig);
router.put('/posting-config', requireCompanyPermission(['COMMERCIAL:VIEW', 'ACCOUNT_MAPPING:MANAGE']), commercialController.updatePostingConfigHandler);

// ==========================================
// 3. TAX & GST CONFIGURATION
// ==========================================
router.get('/tax-rates', requireCompanyPermission(['COMMERCIAL:VIEW', 'TAX:VIEW']), commercialController.getTaxRates);
router.post('/tax-rates', requireCompanyPermission(['COMMERCIAL:VIEW', 'TAX:MANAGE']), commercialController.createOrUpdateTaxRate);

// ==========================================
// 4. OPENING STOCK GL CATCH-UP
// ==========================================
router.get('/opening-stock-gl/preview', requireCompanyPermission(['COMMERCIAL:VIEW', 'RECONCILIATION:VIEW']), commercialController.previewOpeningStockGl);
router.post('/opening-stock-gl/post', requireCompanyPermission(['COMMERCIAL:VIEW', 'RECONCILIATION:EXECUTE']), commercialController.postOpeningStockGl);

// ==========================================
// 5. COMMERCIAL REPORTS & RECONCILIATIONS
// ==========================================
router.get('/reports/register', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW', 'PURCHASE:VIEW']), commercialController.getRegisterReport);
router.get('/reports/outstanding', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW', 'PURCHASE:VIEW']), commercialController.getOutstandingReportHandler);
router.get('/reports/tax-summary', requireCompanyPermission(['COMMERCIAL:VIEW', 'TAX:VIEW']), commercialController.getTaxSummaryReportHandler);
router.get('/reports/stock-gl-reconciliation', requireCompanyPermission(['COMMERCIAL:VIEW', 'RECONCILIATION:VIEW']), commercialController.getInventoryToGlReport);

module.exports = router;
