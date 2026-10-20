const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyPermission } = require('../middleware/companyMiddleware');

const inventoryController = require('../controllers/inventoryController');

// All Inventory endpoints require authentication, tenant workspace, and valid company context
router.use(requireAuth, requireTenantWorkspace, requireCompanyContext);

// ==========================================
// 1. Stock Groups
// ==========================================
router.get('/groups', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getStockGroups);
router.get('/groups/:id', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getStockGroupById);
router.post('/groups', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.createStockGroup);
router.patch('/groups/:id', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.updateStockGroup);
router.delete('/groups/:id', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.deleteStockGroup);

// ==========================================
// 2. Stock Categories
// ==========================================
router.get('/categories', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getStockCategories);
router.get('/categories/:id', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getStockCategoryById);
router.post('/categories', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.createStockCategory);
router.patch('/categories/:id', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.updateStockCategory);
router.delete('/categories/:id', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.deleteStockCategory);

// ==========================================
// 3. Units of Measurement (UOM)
// ==========================================
router.get('/uom', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getUnitsOfMeasurement);
router.get('/uom/:id', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getUnitOfMeasurementById);
router.post('/uom', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.createUnitOfMeasurement);
router.patch('/uom/:id', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.updateUnitOfMeasurement);
router.post('/uom/convert', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.simulateUomConversion);

// ==========================================
// 4. Godowns / Warehouses
// ==========================================
router.get('/godowns', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getGodowns);
router.get('/godowns/:id', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getGodownById);
router.post('/godowns', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.createGodown);
router.patch('/godowns/:id', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.updateGodown);

// ==========================================
// 5. Stock Items
// ==========================================
router.get('/items', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getStockItems);
router.get('/items/:id', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getStockItemById);
router.post('/items', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.createStockItem);
router.patch('/items/:id', requireCompanyPermission('INVENTORY:MANAGE_MASTERS'), inventoryController.updateStockItem);

// ==========================================
// 6. Opening Stock
// ==========================================
router.post('/opening-stock', requireCompanyPermission('INVENTORY:OPENING_STOCK'), inventoryController.postOpeningStock);

// ==========================================
// 7. Balances & Inventory Summary
// ==========================================
router.get('/balances', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getStockBalances);
router.get('/summary', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getInventorySummary);

// ==========================================
// 8. Movement Register & Reversals
// ==========================================
router.get('/movements', requireCompanyPermission('INVENTORY:VIEW'), inventoryController.getStockMovements);
router.post('/movements/:id/reverse', requireCompanyPermission('INVENTORY:ADJUST'), inventoryController.reverseMovement);

// ==========================================
// 9. Audit Reconciliation / Balance Rebuild
// ==========================================
router.post('/reconcile', requireCompanyPermission('INVENTORY:ADJUST'), inventoryController.reconcileBalances);

module.exports = router;
