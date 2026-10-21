const express = require('express');
const router = express.Router();
const restaurantController = require('../controllers/restaurantController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyModule } = require('../middleware/companyMiddleware');

router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireCompanyContext);
router.use(requireCompanyModule('RESTAURANT'));

router.get('/tables', (req, res) => restaurantController.getTables(req, res));
router.post('/tables', (req, res) => restaurantController.createTable(req, res));
router.post('/recipes', (req, res) => restaurantController.saveRecipe(req, res));
router.get('/recipes/:menuItemId', (req, res) => restaurantController.getRecipe(req, res));
router.get('/orders', (req, res) => restaurantController.getOrders(req, res));
router.post('/orders', (req, res) => restaurantController.createOrder(req, res));
router.post('/orders/:orderId/kot', (req, res) => restaurantController.sendToKitchen(req, res));
router.post('/orders/:orderId/settle', (req, res) => restaurantController.settleOrder(req, res));

module.exports = router;
