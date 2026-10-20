const express = require('express');
const router = express.Router();
const manufacturingController = require('../controllers/manufacturingController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext } = require('../middleware/companyMiddleware');

router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireCompanyContext);

router.get('/boms', (req, res) => manufacturingController.getBOMs(req, res));
router.post('/boms', (req, res) => manufacturingController.saveBOM(req, res));
router.get('/work-orders', (req, res) => manufacturingController.getWorkOrders(req, res));
router.post('/work-orders', (req, res) => manufacturingController.createWorkOrder(req, res));
router.post('/work-orders/:workOrderId/issue', (req, res) => manufacturingController.issueMaterials(req, res));
router.post('/work-orders/:workOrderId/complete', (req, res) => manufacturingController.completeProduction(req, res));

module.exports = router;
