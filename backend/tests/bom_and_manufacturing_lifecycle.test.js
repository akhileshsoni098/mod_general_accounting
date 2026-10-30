process.env.PORT = '5066';
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
  Godown
} = require('../src/models');

const { initializeCompany } = require('../src/services/companyInitService');

let serverInstance = null;
const PORT = 5066;

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
let uom = null;
let rawCheese = null;
let rawFlour = null;
let finishedPizza = null;
let plantGodown = null;
let createdBomId = null;

test.before(async () => {
  const serverObj = await startServer(PORT);
  serverInstance = serverObj ? serverObj.server : null;

  // 1. Register a test tenant via auth endpoint
  const tenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TEN_BOM_${runId}`,
      tenant_name: `BOM Test Tenant ${runId}`,
      admin_email: `admin_bom_${runId}@example.com`,
      admin_password: 'Password123!Safe',
      admin_first_name: 'BOM',
      admin_last_name: 'Admin',
      tenant_type: 'MANUFACTURING',
      base_currency: 'INR'
    }
  });

  assert.equal(tenantRes.status, 201, `Failed to register tenant: ${JSON.stringify(tenantRes.body)}`);
  token = tenantRes.body.data.token;
  tenant = await Tenant.findOne({ tenant_code: `TEN_BOM_${runId}` });
  user = await User.findOne({ email: `admin_bom_${runId}@example.com` });

  // 2. Initialize Company with MANUFACTURING and RESTAURANT modules
  const initRes = await initializeCompany({
    tenantId: tenant._id,
    creatorUserId: user._id,
    companyCode: `COMP_MFG_${runId}`,
    companyName: `Manufacturing Pizza Factory ${runId}`,
    businessProfile: 'MANUFACTURING'
  });

  company = initRes.company;
  company.enabled_modules = ['GL', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING', 'RESTAURANT'];
  await company.save();

  // 3. Create UOM, Godown, and Items in this test company
  uom = await UnitOfMeasurement.create({
    tenant_id: tenant._id,
    company_id: company._id,
    unit_code: `KG_${runId}`,
    unit_name: 'Kilogram',
    is_discrete: false
  });

  plantGodown = await Godown.create({
    tenant_id: tenant._id,
    company_id: company._id,
    godown_code: `PLANT_${runId}`,
    godown_name: 'Production Factory Godown'
  });

  rawCheese = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `RM_CHEESE_${runId}`,
    sku: `SKU_CHEESE_${runId}`,
    item_name: 'Mozzarella Cheese',
    base_uom_id: uom._id,
    purchase_price: 350,
    standard_cost: 350
  });

  rawFlour = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `RM_FLOUR_${runId}`,
    sku: `SKU_FLOUR_${runId}`,
    item_name: 'Pizza Dough Flour',
    base_uom_id: uom._id,
    purchase_price: 50,
    standard_cost: 50
  });

  finishedPizza = await StockItem.create({
    tenant_id: tenant._id,
    company_id: company._id,
    item_code: `FG_PIZZA_${runId}`,
    sku: `SKU_PIZZA_${runId}`,
    item_name: 'Margherita Pizza 10-Inch',
    base_uom_id: uom._id,
    sales_price: 300,
    standard_cost: 80
  });
});

test.after(async () => {
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

function getHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': tenant._id.toString(),
    'x-company-id': company._id.toString()
  };
}

test('1. Validates BOM requires finished item and components', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/v1/manufacturing/boms',
    headers: getHeaders(),
    body: {
      bom_number: `BOM_INV_${runId}`,
      bom_name: 'No Components'
    }
  });

  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.success, false);
});

test('2. Validates BOM rejects duplicate component items', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/v1/manufacturing/boms',
    headers: getHeaders(),
    body: {
      bom_number: `BOM_DUP_${runId}`,
      bom_name: 'Duplicate Component Test',
      finished_item_id: finishedPizza._id.toString(),
      raw_materials: [
        { item_id: rawCheese._id.toString(), quantity: 1, uom_id: uom._id.toString() },
        { item_id: rawCheese._id.toString(), quantity: 2, uom_id: uom._id.toString() }
      ]
    }
  });

  assert.strictEqual(res.status, 400);
  assert.match(res.body.error.message, /duplicate/i);
});

test('3. Successfully creates Manufacturing BOM with overhead costs and scrap %', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/v1/manufacturing/boms',
    headers: getHeaders(),
    body: {
      bom_number: `BOM_MARG_${runId}`,
      bom_name: 'Margherita Standard Formula',
      finished_item_id: finishedPizza._id.toString(),
      output_quantity: 1,
      output_uom_id: uom._id.toString(),
      raw_materials: [
        { item_id: rawCheese._id.toString(), quantity: 0.1, uom_id: uom._id.toString(), scrap_percentage: 2 },
        { item_id: rawFlour._id.toString(), quantity: 0.3, uom_id: uom._id.toString(), scrap_percentage: 5 }
      ],
      overhead_costs: [
        { cost_name: 'Woodfire Baking Power', cost_amount: 15 },
        { cost_name: 'Packaging Box', cost_amount: 10 }
      ]
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.bom_name, 'Margherita Standard Formula');
  assert.strictEqual(res.body.data.version, 1);
  assert.strictEqual(res.body.data.raw_materials.length, 2);
  createdBomId = res.body.data._id;
});

test('4. Lists active BOMs with populated item names and search support', async () => {
  const res = await makeRequest({
    method: 'GET',
    path: '/api/v1/manufacturing/boms?search=Margherita',
    headers: getHeaders()
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.length, 1);
  assert.strictEqual(res.body.data[0].bom_name, 'Margherita Standard Formula');
  assert.strictEqual(res.body.data[0].finished_item_id.item_name, 'Margherita Pizza 10-Inch');
});

test('5. Fetches single BOM by ID with complete populated components', async () => {
  const res = await makeRequest({
    method: 'GET',
    path: `/api/v1/manufacturing/boms/${createdBomId}`,
    headers: getHeaders()
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data._id, createdBomId);
  assert.strictEqual(res.body.data.overhead_costs.length, 2);
  assert.strictEqual(res.body.data.overhead_costs[0].cost_name, 'Woodfire Baking Power');
});

test('6. Updates BOM formula and automatically increments version', async () => {
  const res = await makeRequest({
    method: 'PUT',
    path: `/api/v1/manufacturing/boms/${createdBomId}`,
    headers: getHeaders(),
    body: {
      bom_name: 'Margherita Gourmet Formula v2',
      output_quantity: 2
    }
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.bom_name, 'Margherita Gourmet Formula v2');
  assert.strictEqual(res.body.data.version, 2);
  assert.strictEqual(res.body.data.output_quantity, 2);
});

test('7. Plans a Work Order linked to the BOM', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/v1/manufacturing/work-orders',
    headers: getHeaders(),
    body: {
      bom_id: createdBomId,
      planned_quantity: 50,
      raw_materials_godown_id: plantGodown._id.toString(),
      finished_goods_godown_id: plantGodown._id.toString()
    }
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.status, 'PLANNED');
  assert.strictEqual(res.body.data.planned_quantity, 50);
});

test('8. Archives BOM (soft-delete) and verifies exclusion from active list', async () => {
  const res = await makeRequest({
    method: 'DELETE',
    path: `/api/v1/manufacturing/boms/${createdBomId}`,
    headers: getHeaders()
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);

  // Active list should be empty
  const listRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/manufacturing/boms',
    headers: getHeaders()
  });
  assert.strictEqual(listRes.body.data.length, 0);

  // With include_archived=true, it should return
  const allRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/manufacturing/boms?include_archived=true',
    headers: getHeaders()
  });
  assert.strictEqual(allRes.body.data.length, 1);
  assert.strictEqual(allRes.body.data[0].is_active, false);
});

test('9. Restaurant Recipe BOM: create, list, and archive', async () => {
  // 9.1 Create Recipe BOM
  const createRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/recipes',
    headers: getHeaders(),
    body: {
      menu_item_id: finishedPizza._id.toString(),
      variant_name: 'REGULAR',
      yield_quantity: 1,
      ingredients: [
        { ingredient_item_id: rawCheese._id.toString(), quantity: 0.15, uom_id: uom._id.toString(), waste_percentage: 3 },
        { ingredient_item_id: rawFlour._id.toString(), quantity: 0.25, uom_id: uom._id.toString(), waste_percentage: 2 }
      ]
    }
  });
  assert.strictEqual(createRes.status, 200);
  assert.strictEqual(createRes.body.success, true);
  const recipeId = createRes.body.data._id;

  // 9.2 List Recipe BOMs
  const listRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/restaurant/recipes',
    headers: getHeaders()
  });
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.body.success, true);
  assert.strictEqual(listRes.body.data.length, 1);
  assert.strictEqual(listRes.body.data[0].variant_name, 'REGULAR');
  assert.strictEqual(listRes.body.data[0].menu_item_id.item_name, 'Margherita Pizza 10-Inch');

  // 9.3 Archive Recipe BOM
  const archRes = await makeRequest({
    method: 'DELETE',
    path: `/api/v1/restaurant/recipes/${recipeId}`,
    headers: getHeaders()
  });
  assert.strictEqual(archRes.status, 200);
  assert.strictEqual(archRes.body.success, true);

  // List after archive should be 0
  const listAfterRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/restaurant/recipes',
    headers: getHeaders()
  });
  assert.strictEqual(listAfterRes.body.data.length, 0);
});
