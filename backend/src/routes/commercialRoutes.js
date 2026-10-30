const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission, requireCompanyModule } = require('../middleware/companyMiddleware');

const commercialController = require('../controllers/commercialController');

// All commercial endpoints require authentication, tenant workspace, valid company context, and COMMERCIAL_BILLING module
router.use(requireAuth, requireTenantWorkspace, requireCompanyContext, requireCompanyModule('COMMERCIAL_BILLING'));

// ==========================================
// 1. COMMERCIAL DOCUMENTS
// ==========================================
router.get('/documents', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW', 'PURCHASE:VIEW']), commercialController.getDocuments);
router.get('/documents/:id', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW', 'PURCHASE:VIEW']), commercialController.getDocumentById);
router.post('/documents', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:CREATE', 'PURCHASE:CREATE', 'RECEIPT:CREATE', 'PAYMENT:CREATE']), commercialController.createDocument);
router.put('/documents/:id', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:CREATE', 'PURCHASE:CREATE']), commercialController.updateDocument);
router.post('/documents/:id/post', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:POST', 'PURCHASE:POST', 'RECEIPT:CREATE', 'PAYMENT:CREATE']), commercialController.postDocument);
router.post('/documents/:id/calculate-tax', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:CREATE', 'PURCHASE:CREATE']), commercialController.calculateTaxHandler);
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
router.post('/opening-stock-gl/catch-up', requireCompanyPermission(['COMMERCIAL:VIEW', 'RECONCILIATION:EXECUTE']), commercialController.postOpeningStockGl);

// ==========================================
// 5. COMMERCIAL REPORTS & RECONCILIATIONS
// ==========================================
router.get('/reports/register', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW', 'PURCHASE:VIEW']), commercialController.getRegisterReport);
router.get('/reports/sales-register', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW']), (req, res, next) => {
  req.query.document_type = req.query.document_type || 'SALES_INVOICE';
  return commercialController.getRegisterReport(req, res, next);
});
router.get('/reports/purchase-register', requireCompanyPermission(['COMMERCIAL:VIEW', 'PURCHASE:VIEW']), (req, res, next) => {
  req.query.document_type = req.query.document_type || 'PURCHASE_INVOICE';
  return commercialController.getRegisterReport(req, res, next);
});
router.get('/reports/customer-aging', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW']), (req, res, next) => {
  req.query.party_type = req.query.party_type || 'CUSTOMER';
  return commercialController.getOutstandingReportHandler(req, res, next);
});
router.get('/reports/supplier-aging', requireCompanyPermission(['COMMERCIAL:VIEW', 'PURCHASE:VIEW']), (req, res, next) => {
  req.query.party_type = req.query.party_type || 'SUPPLIER';
  return commercialController.getOutstandingReportHandler(req, res, next);
});
router.get('/reports/gst-summary', requireCompanyPermission(['COMMERCIAL:VIEW', 'TAX:VIEW']), commercialController.getTaxSummaryReportHandler);
router.post('/reports/gst-settlement', requireCompanyPermission(['COMMERCIAL:VIEW', 'TAX:MANAGE']), commercialController.settleGstReturnHandler);
router.get('/reports/outstanding', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW', 'PURCHASE:VIEW']), commercialController.getOutstandingReportHandler);
router.get('/reports/tax-summary', requireCompanyPermission(['COMMERCIAL:VIEW', 'TAX:VIEW']), commercialController.getTaxSummaryReportHandler);
router.get('/reports/stock-gl-reconciliation', requireCompanyPermission(['COMMERCIAL:VIEW', 'RECONCILIATION:VIEW']), commercialController.getInventoryToGlReport);
router.get('/reports/msme-aging', requireCompanyPermission(['COMMERCIAL:VIEW', 'PURCHASE:VIEW']), commercialController.getMsmeReportHandler);
router.get('/reports/form26q', requireCompanyPermission(['COMMERCIAL:VIEW', 'TAX:VIEW']), commercialController.getForm26QHandler);

// ==========================================
// 6. PRICING, LANDED COST, INTEREST & DISPATCH
// ==========================================
router.get('/resolve-price', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW']), commercialController.resolvePriceHandler);
router.post('/landed-cost', requireCompanyPermission(['COMMERCIAL:VIEW', 'PURCHASE:POST']), commercialController.allocateLandedCostHandler);
router.get('/interest/calculate', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW']), commercialController.calculateInterestHandler);
router.post('/interest/post-debit-note', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:POST']), commercialController.postInterestDebitNoteHandler);
router.post('/documents/:id/send', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW']), commercialController.sendDocumentHandler);
router.get('/documents/:id/einvoice', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW']), commercialController.getMockEInvoiceHandler);
router.get('/documents/:id/mock-einvoice', requireCompanyPermission(['COMMERCIAL:VIEW', 'SALES:VIEW']), commercialController.getMockEInvoiceHandler);

module.exports = router;
