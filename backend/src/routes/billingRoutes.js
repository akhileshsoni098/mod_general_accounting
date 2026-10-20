const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requireModuleEntitlement } = require('../middleware/tenantMiddleware');
const billingController = require('../controllers/billingController');

// All Billing routes require authentication, tenant workspace context, and BILLING module entitlement
router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireModuleEntitlement('BILLING_AR'));

// Overview & Metrics
router.get('/overview', billingController.getBillingOverview);

// Billing Accounts
router.get('/accounts', billingController.getBillingAccounts);
router.post('/accounts', billingController.createBillingAccount);
router.get('/accounts/:id', billingController.getBillingAccountDetail);

// Billing Plans
router.get('/plans', billingController.getBillingPlans);
router.post('/plans', billingController.createBillingPlan);

// Policy Linking & Installment Schedule Generation
router.post('/policies/schedule', billingController.linkPolicyAndGenerateSchedule);
router.get('/schedules', billingController.getInstallmentSchedules);

// Invoices & Invoice Lines
router.get('/invoices', billingController.getInvoices);
router.post('/invoices', billingController.postIssueInvoice);
router.get('/invoices/:id', billingController.getInvoiceDetail);

// Payments & Waterfall Allocations
router.get('/payments', billingController.getPayments);
router.post('/payments', billingController.postPaymentReceipt);

// Billing Adjustments (Credit Memos, Fee Waivers)
router.get('/adjustments', billingController.getAdjustments);
router.post('/adjustments', billingController.postAdjustment);

module.exports = router;
