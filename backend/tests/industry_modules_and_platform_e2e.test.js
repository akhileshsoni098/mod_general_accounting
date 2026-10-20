const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { app, startServer } = require('../src/server');
const {
  Tenant,
  Company,
  User,
  SubscriptionPlan,
  TenantSubscription,
  PosShift,
  RestaurantTable,
  RestaurantOrder,
  RecipeBOM,
  HotelRoomType,
  HotelRoom,
  HotelReservation,
  GuestFolio,
  ManufacturingBOM,
  WorkOrder,
  StockItem,
  Godown,
  UnitOfMeasurement,
  StockBalance,
  StockMovement,
  Journal
} = require('../src/models');

const subscriptionService = require('../src/services/subscriptionService');
const retailPosService = require('../src/services/retailPosService');
const restaurantService = require('../src/services/restaurantService');
const hotelPmsService = require('../src/services/hotelPmsService');
const manufacturingService = require('../src/services/manufacturingService');
const importExportService = require('../src/services/importExportService');
const { recordStockMovement } = require('../src/services/stockMovementService');

let serverInstance = null;
let serverPort = null;

let testTenant = null;
let testCompany = null;
let testUser = null;
let defaultGodown = null;
let baseUom = null;

test.before(async () => {
  const { server } = await startServer(5055);
  serverInstance = server;

  if (serverInstance && typeof serverInstance.address === 'function') {
    const addr = serverInstance.address();
    serverPort = typeof addr === 'object' && addr !== null ? addr.port : 5055;
  } else {
    serverPort = 5055;
  }

  // Create isolated test tenant and company
  const suffix = Date.now().toString().slice(-6);
  testTenant = await Tenant.create({
    tenant_code: `TEN_IND_${suffix}`,
    name: 'Universal Industry Test Tenant',
    tenant_type: 'OTHER',
    status: 'ACTIVE'
  });

  testUser = await User.create({
    tenant_id: testTenant._id,
    email: `manager_${suffix}@example.com`,
    password_hash: 'dummyhash',
    first_name: 'Alex',
    last_name: 'Director',
    status: 'ACTIVE'
  });

  const { initializeCompany } = require('../src/services/companyInitService');
  const compResult = await initializeCompany({
    tenantId: testTenant._id,
    creatorUserId: testUser._id,
    companyCode: `CMP_IND_${suffix}`,
    companyName: 'Universal Enterprise Co.',
    businessProfile: 'GENERAL_RETAIL'
  });
  testCompany = compResult.company;

  defaultGodown = await Godown.findOne({ company_id: testCompany._id });
  baseUom = await UnitOfMeasurement.findOne({ company_id: testCompany._id, status: 'ACTIVE' })
    || await UnitOfMeasurement.findOne({ company_id: testCompany._id });
});

test.after(async () => {
  // Teardown connections to prevent hanging
  if (serverInstance && typeof serverInstance.closeAllConnections === 'function') {
    serverInstance.closeAllConnections();
  }
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// -------------------------------------------------------------
// SUITE 1: PLATFORM ADMINISTRATION & SAAS SUBSCRIPTIONS
// -------------------------------------------------------------
test('Platform SaaS: Seed plans, check limits, and handle subscription upgrade', async () => {
  await subscriptionService.seedDefaultPlans();
  const plans = await subscriptionService.getPlans();
  assert.ok(plans.length >= 4, 'Should have at least 4 default plans (FREE, STARTER, GROWTH, ENTERPRISE)');

  // Auto provision subscription
  const sub = await subscriptionService.getTenantSubscription(testTenant._id);
  assert.equal(sub.tenant_id.toString(), testTenant._id.toString());
  assert.equal(sub.status, 'TRIAL');

  // Check company limits
  const limitCheck = await subscriptionService.checkTenantLimit(testTenant._id, 'COMPANIES');
  assert.equal(limitCheck.allowed, true, 'Starter plan should allow companies');

  // Change / Upgrade plan
  const upgraded = await subscriptionService.changePlan(testTenant._id, 'ENTERPRISE', 'ANNUAL', testUser);
  assert.equal(upgraded.billing_cycle, 'ANNUAL');
  assert.equal(upgraded.status, 'ACTIVE');

  // Suspend tenant and verify limits block action
  await subscriptionService.updateTenantStatus(testTenant._id, 'SUSPENDED', 'Payment overdue', testUser);
  const blockedCheck = await subscriptionService.checkTenantLimit(testTenant._id, 'COMPANIES');
  assert.equal(blockedCheck.allowed, false, 'Suspended tenant should be blocked');

  // Reactivate
  await subscriptionService.updateTenantStatus(testTenant._id, 'ACTIVE', 'Reactivated', testUser);
  const activeCheck = await subscriptionService.checkTenantLimit(testTenant._id, 'COMPANIES');
  assert.equal(activeCheck.allowed, true, 'Reactivated tenant should be allowed');
});

// -------------------------------------------------------------
// SUITE 2: RETAIL POS & CASHIER SHIFTS
// -------------------------------------------------------------
test('Retail POS: Open shift, fast checkout, auto-post GL & stock, and close shift', async () => {
  const pCode = `POS_ITEM_${Date.now().toString().slice(-4)}`;
  const product = await StockItem.create({
    tenant_id: testTenant._id,
    company_id: testCompany._id,
    item_code: pCode,
    sku: pCode,
    item_name: 'Wireless Barcode Scanner',
    base_uom_id: baseUom._id,
    standard_selling_price: 1200,
    standard_cost: 800,
    is_stock_tracked: true,
    is_active: true
  });

  // Seed initial stock of 50 units for the POS product
  await recordStockMovement({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    stockItemId: product._id,
    godownId: defaultGodown._id,
    movementType: 'OPENING_STOCK',
    direction: 'IN',
    quantity: 50,
    uomId: baseUom._id,
    unitRate: 800,
    totalCost: 40000,
    idempotencyKey: `INIT-STOCK-${product._id}`,
    sourceDocumentType: 'OPENING_BALANCE',
    sourceDocumentId: 'INIT-POS-01',
    userId: testUser._id
  });

  // 1. Open Shift with ₹1000 float
  const shift = await retailPosService.openShift({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    userId: testUser._id,
    openingFloat: 1000
  });
  assert.ok(shift._id, 'Should open shift');
  assert.equal(shift.status, 'OPEN');

  // 2. Process Checkout for 2 units
  const checkoutResult = await retailPosService.processCheckout({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    userId: testUser._id,
    shiftId: shift._id,
    customerName: 'Counter Customer',
    items: [
      {
        item_id: product._id,
        item_code: product.item_code,
        item_name: product.item_name,
        quantity: 2,
        unit_price: 1200,
        godown_id: defaultGodown._id,
        uom_id: baseUom._id,
        tax_rate_code: 'GST_18'
      }
    ],
    payments: [{ method: 'CASH', amount: 2832 }],
    tenderedAmount: 3000
  });

  assert.equal(checkoutResult.success, true);
  assert.ok(checkoutResult.document_number, 'Should generate document number');
  assert.equal(checkoutResult.change_amount, 168); // 3000 - 2832

  // 3. Verify stock movement was created for POS sale
  const movement = await StockMovement.findOne({
    source_document_id: checkoutResult.document_number,
    movement_type: 'SALES_ISSUE'
  });
  assert.ok(movement, 'Stock movement should be recorded for POS sales issue');

  // 4. Close Shift with counted cash ₹3832 (1000 float + 2832 cash sales)
  const closedShift = await retailPosService.closeShift({
    shiftId: shift._id,
    closingCashActual: 3832,
    notes: 'Drawer balanced perfectly'
  });
  assert.equal(closedShift.status, 'CLOSED');
  assert.equal(closedShift.cash_variance, 0, 'Variance should be 0');
});

// -------------------------------------------------------------
// SUITE 3: RESTAURANT, KOT & RECIPE BOM INGREDIENT DEDUCTION
// -------------------------------------------------------------
test('Restaurant: Table setup, Recipe BOM, KOT, and settlement auto-consuming ingredients', async () => {
  // Create Raw Ingredients (Flour, Cheese)
  const flourCode = `FLOUR_${Date.now().toString().slice(-4)}`;
  const flour = await StockItem.create({
    tenant_id: testTenant._id,
    company_id: testCompany._id,
    item_code: flourCode,
    sku: flourCode,
    item_name: 'Pizza Flour',
    base_uom_id: baseUom._id,
    standard_cost: 50,
    is_stock_tracked: true
  });

  const cheeseCode = `CHEESE_${Date.now().toString().slice(-4)}`;
  const cheese = await StockItem.create({
    tenant_id: testTenant._id,
    company_id: testCompany._id,
    item_code: cheeseCode,
    sku: cheeseCode,
    item_name: 'Mozzarella Cheese',
    base_uom_id: baseUom._id,
    standard_cost: 200,
    is_stock_tracked: true
  });

  // Create Menu Item (Margherita Pizza)
  const pizzaCode = `PIZZA_${Date.now().toString().slice(-4)}`;
  const pizzaDish = await StockItem.create({
    tenant_id: testTenant._id,
    company_id: testCompany._id,
    item_code: pizzaCode,
    sku: pizzaCode,
    item_name: '12-inch Margherita Pizza',
    base_uom_id: baseUom._id,
    standard_selling_price: 350,
    is_stock_tracked: false
  });

  // Seed initial stock of raw ingredients
  await recordStockMovement({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    stockItemId: flour._id,
    godownId: defaultGodown._id,
    movementType: 'OPENING_STOCK',
    direction: 'IN',
    quantity: 50,
    uomId: baseUom._id,
    unitRate: 50,
    totalCost: 2500,
    idempotencyKey: `INIT-STOCK-${flour._id}`,
    sourceDocumentType: 'OPENING_BALANCE',
    sourceDocumentId: 'INIT-FLOUR-01',
    userId: testUser._id
  });

  await recordStockMovement({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    stockItemId: cheese._id,
    godownId: defaultGodown._id,
    movementType: 'OPENING_STOCK',
    direction: 'IN',
    quantity: 20,
    uomId: baseUom._id,
    unitRate: 200,
    totalCost: 4000,
    idempotencyKey: `INIT-STOCK-${cheese._id}`,
    sourceDocumentType: 'OPENING_BALANCE',
    sourceDocumentId: 'INIT-CHEESE-01',
    userId: testUser._id
  });

  // 1. Create Dining Table
  const table = await restaurantService.createTable({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    tableNumber: 'TB-99',
    section: 'TERRACE',
    capacity: 4
  });
  assert.equal(table.status, 'VACANT');

  // 2. Configure Recipe BOM (1 Pizza requires 0.25kg Flour + 0.15kg Cheese with 5% waste)
  const recipe = await restaurantService.saveRecipeBOM({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    menuItemId: pizzaDish._id,
    variantName: 'STANDARD',
    yieldQuantity: 1,
    yieldUomId: baseUom._id,
    ingredients: [
      { ingredient_item_id: flour._id, quantity: 0.25, uom_id: baseUom._id, waste_percentage: 5 },
      { ingredient_item_id: cheese._id, quantity: 0.15, uom_id: baseUom._id, waste_percentage: 0 }
    ]
  });
  assert.ok(recipe._id);

  // 3. Create Restaurant Order for 2 Pizzas
  const order = await restaurantService.createOrder({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    userId: testUser._id,
    tableId: table._id,
    orderType: 'DINE_IN',
    items: [
      {
        item_id: pizzaDish._id,
        item_name: pizzaDish.item_name,
        quantity: 2,
        unit_price: 350
      }
    ]
  });
  assert.equal(order.status, 'CONFIRMED');

  // Verify table is now OCCUPIED
  const occupiedTable = await RestaurantTable.findById(table._id);
  assert.equal(occupiedTable.status, 'OCCUPIED');

  // 4. Send Order to Kitchen (KOT)
  const kotOrder = await restaurantService.sendOrderToKitchen(order._id);
  assert.equal(kotOrder.status, 'KITCHEN_IN_PROGRESS');

  // 5. Settle and Bill Order: Should auto-consume raw ingredients from stock!
  const settleResult = await restaurantService.settleAndBillOrder({
    orderId: order._id,
    userId: testUser._id,
    godownId: defaultGodown._id
  });

  assert.equal(settleResult.order.status, 'COMPLETED');
  assert.equal(settleResult.order.ingredients_consumed, true);

  // Verify table is VACANT again
  const vacantTable = await RestaurantTable.findById(table._id);
  assert.equal(vacantTable.status, 'VACANT');

  // Verify ingredient stock movements were recorded
  const ingredientMovements = await StockMovement.find({
    source_document_id: order.order_number,
    movement_type: 'RECIPE_CONSUMPTION'
  });
  assert.equal(ingredientMovements.length, 2, 'Both flour and cheese should have consumption movements');
});

// -------------------------------------------------------------
// SUITE 4: HOTEL PMS & IDEMPOTENT NIGHT AUDIT
// -------------------------------------------------------------
test('Hotel PMS: Reservation, Check-in, Guest Folio, Idempotent Night Audit, and Check-out', async () => {
  // 1. Setup Room Type & Room
  const roomType = await hotelPmsService.createRoomType({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    typeCode: `SUITE_${Date.now().toString().slice(-4)}`,
    typeName: 'Executive Suite',
    baseRate: 4000,
    maxOccupancy: 2
  });

  const room = await hotelPmsService.createRoom({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    roomNumber: `301_${Date.now().toString().slice(-4)}`,
    roomTypeId: roomType._id,
    floor: '3'
  });
  assert.equal(room.status, 'CLEAN');

  // 2. Create Reservation for 2 nights
  const checkIn = new Date();
  const checkOut = new Date();
  checkOut.setDate(checkOut.getDate() + 2);

  const reservation = await hotelPmsService.createReservation({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    userId: testUser._id,
    guestName: 'Robert Vance',
    guestEmail: 'robert@vance.com',
    roomTypeId: roomType._id,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    ratePerNight: 4000,
    depositAmount: 1000
  });
  assert.equal(reservation.status, 'CONFIRMED');

  // 3. Check-In Guest
  const checkInResult = await hotelPmsService.checkInGuest({
    reservationId: reservation._id,
    roomId: room._id,
    userId: testUser._id
  });
  assert.equal(checkInResult.reservation.status, 'CHECKED_IN');
  assert.equal(checkInResult.room.status, 'OCCUPIED');
  assert.ok(checkInResult.folio._id, 'Should create guest folio');

  // 4. Add Incidental Charge to Folio (e.g. Laundry)
  await hotelPmsService.addFolioCharge({
    folioId: checkInResult.folio._id,
    chargeType: 'LAUNDRY',
    description: 'Dry Cleaning Service',
    amount: 500
  });

  // 5. Idempotent Night Audit: Run audit for date '2026-10-21'
  const auditDate = '2026-10-21';
  const firstAudit = await hotelPmsService.runNightAudit({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    auditDate,
    userId: testUser._id
  });

  assert.equal(firstAudit.processed_reservations, 1, 'Should process 1 checked-in reservation');
  assert.equal(firstAudit.skipped_reservations, 0);
  assert.equal(firstAudit.total_room_revenue, 4000);

  // 6. Re-run Night Audit for the EXACT SAME DATE: Should skip duplicate posting!
  const secondAudit = await hotelPmsService.runNightAudit({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    auditDate,
    userId: testUser._id
  });

  assert.equal(secondAudit.processed_reservations, 0, 'Duplicate night audit should process 0');
  assert.equal(secondAudit.skipped_reservations, 1, 'Duplicate night audit should skip 1');
  assert.equal(secondAudit.total_room_revenue, 0, 'Duplicate night audit should post 0 revenue');

  // 7. Check-Out Guest & Settle Folio
  const checkoutResult = await hotelPmsService.checkOutGuest({
    reservationId: reservation._id,
    settlementMethod: 'CASH',
    userId: testUser._id
  });

  assert.equal(checkoutResult.reservation.status, 'CHECKED_OUT');
  assert.equal(checkoutResult.folio.status, 'SETTLED');
  assert.ok(checkoutResult.commercial_document._id, 'Should generate settlement commercial invoice');

  // Room should now be marked DIRTY for housekeeping
  const dirtyRoom = await HotelRoom.findById(room._id);
  assert.equal(dirtyRoom.status, 'DIRTY');

  // 8. Verify Hospitality KPIs
  const kpis = await hotelPmsService.getMetrics(testCompany._id);
  assert.ok(kpis.total_rooms > 0);
  assert.ok(kpis.total_month_revenue >= 4000);
});

// -------------------------------------------------------------
// SUITE 5: MANUFACTURING, WORK ORDERS & PRODUCTION COSTING
// -------------------------------------------------------------
test('Manufacturing: BOM, Work Order, Raw Material Issue, and Production GL Costing', async () => {
  // Finished Good: Office Desk
  const deskCode = `DESK_${Date.now().toString().slice(-4)}`;
  const finishedDesk = await StockItem.create({
    tenant_id: testTenant._id,
    company_id: testCompany._id,
    item_code: deskCode,
    sku: deskCode,
    item_name: 'Solid Wood Office Desk',
    base_uom_id: baseUom._id,
    standard_cost: 2500,
    is_stock_tracked: true
  });

  // Raw Materials: Wood Plank, Steel Legs
  const woodCode = `WOOD_${Date.now().toString().slice(-4)}`;
  const woodPlank = await StockItem.create({
    tenant_id: testTenant._id,
    company_id: testCompany._id,
    item_code: woodCode,
    sku: woodCode,
    item_name: 'Oak Wood Plank',
    base_uom_id: baseUom._id,
    standard_cost: 300,
    is_stock_tracked: true
  });

  const legsCode = `LEGS_${Date.now().toString().slice(-4)}`;
  const steelLegs = await StockItem.create({
    tenant_id: testTenant._id,
    company_id: testCompany._id,
    item_code: legsCode,
    sku: legsCode,
    item_name: 'Steel Table Legs (Set of 4)',
    base_uom_id: baseUom._id,
    standard_cost: 800,
    is_stock_tracked: true
  });

  // Seed raw materials in warehouse for production issue
  await recordStockMovement({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    stockItemId: woodPlank._id,
    godownId: defaultGodown._id,
    movementType: 'OPENING_STOCK',
    direction: 'IN',
    quantity: 50,
    uomId: baseUom._id,
    unitRate: 300,
    totalCost: 15000,
    idempotencyKey: `INIT-STOCK-${woodPlank._id}`,
    sourceDocumentType: 'OPENING_BALANCE',
    sourceDocumentId: 'INIT-WOOD-01',
    userId: testUser._id
  });

  await recordStockMovement({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    stockItemId: steelLegs._id,
    godownId: defaultGodown._id,
    movementType: 'OPENING_STOCK',
    direction: 'IN',
    quantity: 20,
    uomId: baseUom._id,
    unitRate: 800,
    totalCost: 16000,
    idempotencyKey: `INIT-STOCK-${steelLegs._id}`,
    sourceDocumentType: 'OPENING_BALANCE',
    sourceDocumentId: 'INIT-LEGS-01',
    userId: testUser._id
  });

  // 1. Create Manufacturing BOM (1 Desk requires 4 Wood Planks + 1 Set of Steel Legs + Direct Labor ₹400)
  const bom = await manufacturingService.saveBOM({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    bomNumber: `BOM-DESK-${Date.now().toString().slice(-4)}`,
    bomName: 'Standard Office Desk BOM',
    finishedItemId: finishedDesk._id,
    outputQuantity: 1,
    outputUomId: baseUom._id,
    rawMaterials: [
      { item_id: woodPlank._id, quantity: 4, uom_id: baseUom._id, scrap_percentage: 0 },
      { item_id: steelLegs._id, quantity: 1, uom_id: baseUom._id, scrap_percentage: 0 }
    ],
    overheadCosts: [{ cost_name: 'Assembly Direct Labor', cost_amount: 400 }]
  });
  assert.ok(bom._id);

  // 2. Create Work Order for 5 Desks
  const wo = await manufacturingService.createWorkOrder({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    userId: testUser._id,
    bomId: bom._id,
    plannedQuantity: 5,
    rawMaterialsGodownId: defaultGodown._id,
    finishedGoodsGodownId: defaultGodown._id
  });
  assert.equal(wo.status, 'PLANNED');

  // 3. Issue Raw Materials
  const issueResult = await manufacturingService.issueRawMaterials({
    workOrderId: wo._id,
    userId: testUser._id
  });
  assert.equal(issueResult.workOrder.status, 'IN_PROGRESS');
  assert.equal(issueResult.workOrder.raw_materials_issued, true);
  assert.equal(issueResult.issuedMovements.length, 2, 'Should issue wood planks and steel legs');

  // 4. Complete Production
  const completeResult = await manufacturingService.completeProduction({
    workOrderId: wo._id,
    completedQuantity: 5,
    scrapQuantity: 0,
    userId: testUser._id
  });

  assert.equal(completeResult.workOrder.status, 'COMPLETED');
  assert.equal(completeResult.workOrder.completed_quantity, 5);
  assert.ok(completeResult.workOrder.total_cost > 0, 'Total production cost should be calculated');
  assert.ok(completeResult.workOrder.journal_id, 'Should generate GL journal entry for inventory costing');

  // Verify Finished Goods stock receipt movement
  const fgMovement = await StockMovement.findOne({
    source_document_id: wo.order_number,
    movement_type: 'PRODUCTION_RECEIPT'
  });
  assert.ok(fgMovement, 'Should record finished goods receipt stock movement');
});

// -------------------------------------------------------------
// SUITE 6: MASTER DATA BULK IMPORT / EXPORT
// -------------------------------------------------------------
test('Master Data: Dry-run and safe bulk import of accounts and items', async () => {
  const suffix = Date.now().toString().slice(-4);

  // Dry run account import
  const dryRunAccounts = await importExportService.importAccounts({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    rows: [
      { account_code: `TEST_EXP_${suffix}`, account_name: 'Marketing Expense', account_type: 'EXPENSE' },
      { account_code: `TEST_REV_${suffix}`, account_name: 'Online Sales Revenue', account_type: 'REVENUE' }
    ],
    dryRun: true
  });
  assert.equal(dryRunAccounts.valid_rows, 2);
  assert.equal(dryRunAccounts.applied, false, 'Dry run should not apply writes');

  // Actual account import
  const actualAccounts = await importExportService.importAccounts({
    tenantId: testTenant._id,
    companyId: testCompany._id,
    rows: [
      { account_code: `TEST_EXP_${suffix}`, account_name: 'Marketing Expense', account_type: 'EXPENSE' }
    ],
    dryRun: false
  });
  assert.equal(actualAccounts.applied, true, 'Actual import should apply writes');

  // Export accounts
  const exported = await importExportService.exportAccounts(testTenant._id);
  assert.ok(exported.length > 0, 'Should export accounts');
});

// -------------------------------------------------------------
// SUITE 7: SYSTEM READINESS & HEALTH PROBES
// -------------------------------------------------------------
test('Operational Probes: GET /health and GET /ready endpoints', async () => {
  const healthRes = await makeRequest('/health');
  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.body.data.status, 'HEALTHY');

  const readyRes = await makeRequest('/ready');
  assert.equal(readyRes.statusCode, 200);
  assert.equal(readyRes.body.data.status, 'READY');
  assert.ok(readyRes.body.data.uptime >= 0);
});

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method: 'GET'
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ statusCode: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}
