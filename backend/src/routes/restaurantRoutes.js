const express = require('express');
const router = express.Router();
const restaurantController = require('../controllers/restaurantController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyModule } = require('../middleware/companyMiddleware');

// ==========================================
// 1. PUBLIC SELF-SERVICE ENDPOINTS (NO AUTH)
// ==========================================
// Kiosk Catalog & Order Submission
router.get('/public/kiosk/:tenantSlug/:outletSlug', (req, res) => restaurantController.getKioskCatalog(req, res));
router.post('/public/kiosk/:tenantSlug/:outletSlug/order', (req, res) => restaurantController.submitKioskOrder(req, res));

// Table QR Catalog & Order Submission
router.get('/public/table/:qrToken', (req, res) => restaurantController.getTableCatalog(req, res));
router.post('/public/table/:qrToken/order', (req, res) => restaurantController.submitTableOrder(req, res));

// ==========================================
// 2. AUTHENTICATED MANAGEMENT ENDPOINTS
// ==========================================
router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireCompanyContext);
router.use(requireCompanyModule('RESTAURANT'));

// Store Locations / Outlets
router.get('/locations', (req, res) => restaurantController.getLocations(req, res));
router.post('/locations', (req, res) => restaurantController.saveLocation(req, res));
router.delete('/locations/:locationId', (req, res) => restaurantController.archiveLocation(req, res));

// Config & Policies
router.get('/config', (req, res) => restaurantController.getConfig(req, res));
router.post('/config', (req, res) => restaurantController.saveConfig(req, res));

// Modifier Groups
router.get('/modifier-groups', (req, res) => restaurantController.getModifierGroups(req, res));
router.post('/modifier-groups', (req, res) => restaurantController.saveModifierGroup(req, res));
router.delete('/modifier-groups/:groupId', (req, res) => restaurantController.archiveModifierGroup(req, res));

// Product Variants
router.get('/variants', (req, res) => restaurantController.getProductVariants(req, res));
router.post('/variants', (req, res) => restaurantController.saveProductVariant(req, res));
router.delete('/variants/:variantId', (req, res) => restaurantController.archiveProductVariant(req, res));

// Tables & Table QR
router.get('/tables', (req, res) => restaurantController.getTables(req, res));
router.post('/tables', (req, res) => restaurantController.createTable(req, res));
router.post('/tables/:tableId/qr', (req, res) => restaurantController.generateTableQr(req, res));

// Kitchen Display System (KDS)
router.get('/kds/orders', (req, res) => restaurantController.getKdsOrders(req, res));
router.patch('/kds/orders/:orderId/items/:itemId/status', (req, res) => restaurantController.updateKdsItemStatus(req, res));

// Recipe BOM
router.get('/recipes', (req, res) => restaurantController.getRecipes(req, res));
router.post('/recipes', (req, res) => restaurantController.saveRecipe(req, res));
router.get('/recipes/:menuItemId', (req, res) => restaurantController.getRecipe(req, res));
router.delete('/recipes/:recipeId', (req, res) => restaurantController.archiveRecipe(req, res));

// POS & General Orders
router.get('/orders', (req, res) => restaurantController.getOrders(req, res));
router.post('/orders', (req, res) => restaurantController.createOrder(req, res));
router.post('/orders/:orderId/kot', (req, res) => restaurantController.sendToKitchen(req, res));
router.post('/orders/:orderId/settle', (req, res) => restaurantController.settleOrder(req, res));
router.post('/orders/:orderId/cancel', (req, res) => restaurantController.cancelOrder(req, res));
router.delete('/orders/:orderId', (req, res) => restaurantController.deleteOrder(req, res));

module.exports = router;
