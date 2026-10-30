process.env.PORT = '5068';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');

const { startServer } = require('../src/server');
const {
  Tenant,
  User,
  Company,
  StockItem,
  UnitOfMeasurement,
  Godown,
  StockMovement,
  RecipeBOM,
  RestaurantTable,
  RestaurantOrder,
  StoreLocation,
  RestaurantConfig,
  ModifierGroup,
  ProductVariant
} = require('../src/models');
const { initializeCompany } = require('../src/services/companyInitService');
const { recordStockMovement } = require('../src/services/stockMovementService');

let serverInstance = null;
const PORT = 5068;

function makeRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const runId = Math.floor(Date.now() % 100000);
let tenant = null;
let company = null;
let user = null;
let token = null;

let uomKg = null;
let uomPc = null;
let godown = null;

let ingBase = null;
let ingSauce = null;
let ingCheese = null;
let ingCapsicum = null;
let ingMushroom = null;
let pizzaDish = null;

let outlet = null;
let modifierGroup = null;
let productVariant = null;
let kioskOrder = null;

function getHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': tenant._id.toString(),
    'x-company-id': company._id.toString()
  };
}

test.before(async () => {
  const serverObj = await startServer(PORT);
  serverInstance = serverObj ? serverObj.server : null;

  // STRICT RULE 8 & 10 ASSERTION: Verify we are on isolated test database
  assert.equal(
    mongoose.connection.name,
    'veridex_finance_test',
    'CRITICAL: Tests must strictly run on veridex_finance_test isolated test database!'
  );

  // 1. Register test tenant
  const tenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TEN_DOMINOS_${runId}`,
      tenant_name: `Domino's Style SaaS Chain ${runId}`,
      admin_email: `kiosk_admin_${runId}@example.com`,
      admin_password: 'Password123!Safe',
      admin_first_name: 'Kiosk',
      admin_last_name: 'Manager',
      tenant_type: 'HOSPITALITY',
      base_currency: 'INR'
    }
  });

  assert.equal(tenantRes.status, 201, `Failed to register tenant: ${JSON.stringify(tenantRes.body)}`);
  token = tenantRes.body.data.token;
  tenant = await Tenant.findOne({ tenant_code: `TEN_DOMINOS_${runId}` });
  user = await User.findOne({ email: `kiosk_admin_${runId}@example.com` });

  // 2. Initialize Company with RESTAURANT module
  const initRes = await initializeCompany({
    tenantId: tenant._id,
    creatorUserId: user._id,
    companyCode: `COMP_PIZZA_${runId}`,
    companyName: `Domino's Style Pizza Corp ${runId}`,
    businessProfile: 'PIZZA_QSR'
  });
  company = initRes.company;
  company.enabled_modules = ['GL', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RESTAURANT'];
  await company.save();

  // 3. Create UOMs
  uomKg = await UnitOfMeasurement.create({
    tenant_id: tenant._id,
    company_id: company._id,
    unit_code: `KG_${runId}`,
    unit_name: 'Kilogram',
    decimal_places: 3
  });
  uomPc = await UnitOfMeasurement.create({
    tenant_id: tenant._id,
    company_id: company._id,
    unit_code: `PC_${runId}`,
    unit_name: 'Piece',
    decimal_places: 0
  });

  // 4. Create Godown
  godown = await Godown.create({
    tenant_id: tenant._id,
    company_id: company._id,
    godown_code: `KITCHEN_${runId}`,
    godown_name: 'Main Kitchen Storage',
    is_active: true
  });

  // 5. Create Stock Items (Raw Ingredients & Finished Dish)
  ingBase = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `BASE_${runId}`,
    sku: `SKU_BASE_${runId}`,
    item_name: 'Pizza Crust Base (7 inch)',
    item_type: 'RAW_MATERIAL',
    base_uom_id: uomPc._id,
    purchase_price: 25,
    is_active: true
  });

  ingSauce = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `SAUCE_${runId}`,
    sku: `SKU_SAUCE_${runId}`,
    item_name: 'Classic Tomato Pizza Sauce',
    item_type: 'RAW_MATERIAL',
    base_uom_id: uomKg._id,
    purchase_price: 100,
    is_active: true
  });

  ingCheese = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `CHEESE_${runId}`,
    sku: `SKU_CHEESE_${runId}`,
    item_name: 'Mozzarella Diced Cheese',
    item_type: 'RAW_MATERIAL',
    base_uom_id: uomKg._id,
    purchase_price: 400,
    is_active: true
  });

  ingCapsicum = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `CAPSICUM_${runId}`,
    sku: `SKU_CAPSICUM_${runId}`,
    item_name: 'Diced Green Capsicum',
    item_type: 'RAW_MATERIAL',
    base_uom_id: uomKg._id,
    purchase_price: 80,
    is_active: true
  });

  ingMushroom = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `MUSHROOM_${runId}`,
    sku: `SKU_MUSHROOM_${runId}`,
    item_name: 'Fresh Sliced Mushrooms',
    item_type: 'RAW_MATERIAL',
    base_uom_id: uomKg._id,
    purchase_price: 200,
    is_active: true
  });

  pizzaDish = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `PIZZA_${runId}`,
    sku: `SKU_PIZZA_${runId}`,
    item_name: 'Cheese Mushroom Pizza',
    item_type: 'FINISHED_GOOD',
    base_uom_id: uomPc._id,
    standard_selling_price: 300,
    is_active: true
  });

  // Seed inventory initial balances
  for (const item of [ingBase, ingSauce, ingCheese, ingCapsicum, ingMushroom]) {
    await recordStockMovement({
      tenantId: tenant._id,
      companyId: company._id,
      stockItemId: item._id,
      godownId: godown._id,
      movementType: 'OPENING_STOCK',
      direction: 'IN',
      quantity: 50,
      uomId: item.base_uom_id,
      idempotencyKey: `SEED-${runId}-${item._id}`,
      notes: 'Initial seed stock for testing',
      userId: user._id
    });
  }

  // 6. Create Recipe BOM for Cheese Mushroom Pizza
  await RecipeBOM.create({
    tenant_id: tenant._id,
    company_id: company._id,
    menu_item_id: pizzaDish._id,
    variant_name: 'STANDARD',
    yield_quantity: 1,
    yield_uom_id: uomPc._id,
    ingredients: [
      { ingredient_item_id: ingBase._id, quantity: 1, uom_id: uomPc._id },
      { ingredient_item_id: ingSauce._id, quantity: 0.05, uom_id: uomKg._id },
      { ingredient_item_id: ingCheese._id, quantity: 0.1, uom_id: uomKg._id },
      { ingredient_item_id: ingCapsicum._id, quantity: 0.03, uom_id: uomKg._id },
      { ingredient_item_id: ingMushroom._id, quantity: 0.04, uom_id: uomKg._id }
    ],
    is_active: true
  });
});

test.after(async () => {
  if (serverInstance && typeof serverInstance.closeAllConnections === 'function') {
    serverInstance.closeAllConnections();
  }
  if (serverInstance) {
    await new Promise((res) => serverInstance.close(res));
  }
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

test('1. Create Physical Store Location (Outlet Hierarchy)', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/locations',
    headers: getHeaders(),
    body: {
      name: 'Connaught Place Flagship',
      location_code: `OUTLET_${runId}`,
      slug: `cp-flagship-${runId}`,
      enabled_channels: ['POS', 'KIOSK', 'TABLE_QR'],
      default_godown_id: godown._id
    }
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  outlet = res.body.data;
  assert.equal(outlet.slug, `cp-flagship-${runId}`);
  assert.equal(outlet.kitchen_stations.length, 3); // OVEN, HOT_KITCHEN, BEVERAGE
});

test('2. Save Restaurant Operating Configuration & Customer Intake Policy', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/config',
    headers: getHeaders(),
    body: {
      location_id: outlet._id,
      operating_mode: 'QSR_KIOSK',
      customer_info_policy: {
        name: 'REQUIRED',
        phone: 'REQUIRED',
        email: 'OPTIONAL',
        address: 'OPTIONAL',
        allow_anonymous_walkin: false
      },
      modifier_rules: {
        allow_ingredient_removal: true,
        removals_reduce_price: false,
        allow_chargeable_add_ons: true
      },
      payment_policy: {
        default_method: 'UPI_DYNAMIC_QR',
        pay_before_order: true
      }
    }
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.operating_mode, 'QSR_KIOSK');
  assert.equal(res.body.data.customer_info_policy.phone, 'REQUIRED');
});

test('3. Create Modifier Group (Extra Cheese linked to inventory consumption)', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/modifier-groups',
    headers: getHeaders(),
    body: {
      name: 'EXTRA_CHEESE_MOD',
      display_name: 'Extra Cheese & Toppings',
      selection_type: 'MULTIPLE',
      options: [
        {
          name: 'Extra Mozzarella Cheese',
          price_adjustment: 50,
          ingredient_item_id: ingCheese._id,
          quantity_to_consume: 0.05,
          uom_id: uomKg._id
        }
      ],
      applicable_item_ids: [pizzaDish._id]
    }
  });

  assert.equal(res.status, 201);
  modifierGroup = res.body.data;
  assert.equal(modifierGroup.options[0].price_adjustment, 50);
});

test('4. Create Product Variant (Cheese Burst Crust)', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/variants',
    headers: getHeaders(),
    body: {
      base_item_id: pizzaDish._id,
      variant_name: 'CHEESE_BURST',
      sku: `PIZZA-CB-${runId}`,
      price_adjustment: 60
    }
  });

  assert.equal(res.status, 201);
  productVariant = res.body.data;
  assert.equal(productVariant.variant_name, 'CHEESE_BURST');
  assert.equal(productVariant.price_adjustment, 60);
});

test('5. Public Kiosk Catalog Fetch (Zero auth session required)', async () => {
  const res = await makeRequest({
    method: 'GET',
    path: `/api/v1/restaurant/public/kiosk/${tenant.tenant_code}/${outlet.slug}`
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.outlet.slug, outlet.slug);
  assert.equal(res.body.data.config.operating_mode, 'QSR_KIOSK');
  assert.ok(res.body.data.menu_items.length >= 1);
  assert.ok(res.body.data.recipes.length >= 1);
  assert.ok(res.body.data.modifier_groups.length >= 1);
});

test('6. Customer Intake Policy Enforcement (Reject missing phone)', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: `/api/v1/restaurant/public/kiosk/${tenant.tenant_code}/${outlet.slug}/order`,
    body: {
      customer_name: 'Akhilesh Soni',
      customer_phone: '', // Policy says REQUIRED!
      order_type: 'TAKEAWAY',
      items: [{ item_id: pizzaDish._id, quantity: 1 }]
    }
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /Customer Phone Number is required/);
});

test('7. The Domino\'s Experience: Customization Order with Exclusions & Add-ons', async () => {
  // User request:
  // "Selected Cheese Mushroom Pizza... requested capsicum and mushrooms be removed and extra cheese be added"
  const res = await makeRequest({
    method: 'POST',
    path: `/api/v1/restaurant/public/kiosk/${tenant.tenant_code}/${outlet.slug}/order`,
    body: {
      customer_name: 'Akhilesh Soni',
      customer_phone: '9876543210',
      customer_email: 'akhilesh@example.com',
      customer_address: 'Connaught Place Store Dine Area',
      order_type: 'TAKEAWAY',
      items: [
        {
          item_id: pizzaDish._id,
          variant_name: 'CHEESE_BURST', // +60
          quantity: 1,
          excluded_ingredients: [ingCapsicum._id, ingMushroom._id], // No Capsicum, No Mushrooms!
          selected_modifiers: [
            {
              modifier_group_id: modifierGroup._id,
              option_id: modifierGroup.options[0]._id,
              name: 'Extra Mozzarella Cheese',
              price_adjustment: 50, // +50
              quantity: 1,
              ingredient_item_id: ingCheese._id,
              quantity_to_consume: 0.05
            }
          ]
        }
      ],
      payment_details: {
        method: 'UPI_DYNAMIC_QR',
        status: 'PENDING'
      }
    }
  });

  assert.equal(res.status, 201, `Submission failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.success, true);
  kioskOrder = res.body.data.order;

  // Pricing calculation proof:
  // Base dish: 300
  // Variant (CHEESE_BURST): +60
  // Modifier (Extra Cheese): +50
  // Line total: 410.00
  // GST (5%): 20.50
  // Grand total: 430.50
  assert.equal(kioskOrder.subtotal, 410);
  assert.equal(kioskOrder.tax_total, 20.5);
  assert.equal(kioskOrder.grand_total, 430.5);

  // Kiosk pickup token proof
  assert.ok(kioskOrder.pickup_token.startsWith('P-'));
  assert.equal(kioskOrder.order_channel, 'KIOSK');

  // Dynamic UPI QR payment string proof
  assert.ok(res.body.data.upi_payment_string.includes('430.50'));
  assert.ok(res.body.data.upi_payment_string.includes('upi://pay'));
});

test('8. KDS Station Routing & Item Status Transition', async () => {
  // 1. Check Oven Station KDS
  const ovenRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/restaurant/kds/orders?station=OVEN',
    headers: getHeaders()
  });

  assert.equal(ovenRes.status, 200);
  const targetOrder = ovenRes.body.data.find(o => o._id === kioskOrder._id);
  assert.ok(targetOrder, 'Order should be routed to OVEN station');
  assert.equal(targetOrder.items[0].kitchen_station, 'OVEN');

  // 2. Mark item READY on KDS
  const itemId = targetOrder.items[0]._id;
  const patchRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/restaurant/kds/orders/${kioskOrder._id}/items/${itemId}/status`,
    headers: getHeaders(),
    body: { status: 'READY' }
  });

  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.data.status, 'READY');
});

test('9. Settlement, GST Commercial Invoice & Recipe BOM Inventory Deduction', async () => {
  const settleRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/restaurant/orders/${kioskOrder._id}/settle`,
    headers: getHeaders(),
    body: {
      godown_id: godown._id,
      payment_details: {
        method: 'UPI_DYNAMIC_QR',
        status: 'COMPLETED',
        provider_reference: 'UPI-TXN-99887711'
      }
    }
  });

  assert.equal(settleRes.status, 200, `Settlement failed: ${JSON.stringify(settleRes.body)}`);
  assert.equal(settleRes.body.data.order.status, 'COMPLETED');
  assert.equal(settleRes.body.data.order.payment_details.status, 'COMPLETED');
  assert.ok(settleRes.body.data.commercial_document._id);

  // INVENTORY DEDUCTION PROOF:
  // 1. Excluded Capsicum & Mushroom MUST HAVE ZERO consumption movements!
  const capsicumMovements = await StockMovement.find({
    tenant_id: tenant._id,
    stockItemId: ingCapsicum._id,
    sourceDocumentId: kioskOrder.order_number
  });
  assert.equal(capsicumMovements.length, 0, 'Excluded capsicum must NOT be deducted from inventory!');

  const mushroomMovements = await StockMovement.find({
    tenant_id: tenant._id,
    stockItemId: ingMushroom._id,
    sourceDocumentId: kioskOrder.order_number
  });
  assert.equal(mushroomMovements.length, 0, 'Excluded mushrooms must NOT be deducted from inventory!');

  // 2. Pizza base & Sauce: Consumed from base recipe
  const baseMovements = await StockMovement.find({
    tenant_id: tenant._id,
    stockItemId: ingBase._id,
    sourceDocumentId: kioskOrder.order_number
  });
  assert.equal(baseMovements.length, 1);
  assert.equal(baseMovements[0].quantity, 1);

  // 3. Cheese: Consumed from base recipe (0.1kg) PLUS Add-on modifier Extra Cheese (0.05kg)
  const cheeseMovements = await StockMovement.find({
    tenant_id: tenant._id,
    stockItemId: ingCheese._id,
    sourceDocumentId: kioskOrder.order_number
  });
  assert.equal(cheeseMovements.length, 2, 'Cheese should have 1 base recipe consumption + 1 modifier add-on consumption');
  const totalCheeseConsumed = cheeseMovements.reduce((sum, m) => sum + m.quantity, 0);
  assert.equal(Math.round(totalCheeseConsumed * 1000) / 1000, 0.15); // 0.10 + 0.05 = 0.15 kg
});

test('10. Table QR Code Generation & Scoped Order Flow', async () => {
  // 1. Create Dining Table
  const tableRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/tables',
    headers: getHeaders(),
    body: {
      table_number: `T-05`,
      section: 'TERRACE',
      capacity: 4
    }
  });

  assert.equal(tableRes.status, 201);
  const table = tableRes.body.data;
  assert.ok(table.table_qr_token, 'Table QR token should be generated');

  // 2. Scoped public table QR query
  const qrRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/restaurant/public/table/${table.table_qr_token}`
  });

  assert.equal(qrRes.status, 200);
  assert.equal(qrRes.body.data.table.table_number, 'T-05');

  // 3. Submit Table Order via Table QR
  const orderRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/restaurant/public/table/${table.table_qr_token}/order`,
    body: {
      customer_name: 'Dine-In Guest',
      customer_phone: '9988776655',
      items: [{ item_id: pizzaDish._id, quantity: 2 }]
    }
  });

  assert.equal(orderRes.status, 201);
  assert.equal(orderRes.body.data.order.order_type, 'DINE_IN');

  // Verify table is now OCCUPIED
  const updatedTable = await RestaurantTable.findById(table._id);
  assert.equal(updatedTable.status, 'OCCUPIED');
});

test('11. Order Cancellation & Auto-Reversal Safety', async () => {
  // Cancel the settled kiosk order from test 7 & 9
  const cancelRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/restaurant/orders/${kioskOrder._id}/cancel`,
    headers: getHeaders(),
    body: {
      reason: 'Customer requested refund at counter',
      auto_reverse: true
    }
  });

  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.data.order.status, 'CANCELLED');
  assert.equal(cancelRes.body.data.order.payment_details.status, 'REFUNDED');

  // Verify inventory movements are reversed
  const movements = await StockMovement.find({
    tenant_id: tenant._id,
    sourceDocumentId: kioskOrder.order_number
  });
  for (const mov of movements) {
    assert.equal(mov.is_reversed, true, `Movement ${mov._id} must be marked as reversed`);
  }
});
