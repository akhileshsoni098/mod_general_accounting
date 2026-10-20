process.env.PORT = '5056';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');

const { startServer } = require('../src/server');
const {
  Tenant,
  User,
  Company,
  StockGroup,
  StockCategory,
  UnitOfMeasurement,
  Godown,
  StockItem,
  StockMovement,
  StockBalance
} = require('../src/models');
const { convertQuantity } = require('../src/services/uomConversionService');

let serverInstance = null;
const PORT = 5056;

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
        hostname: 'localhost',
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

// Global fixtures
const runId = Math.floor(Date.now() % 100000);
let tenantA = null;
let tokenA = null;
let companyAMain = null;
let companyASecondary = null;

let tenantB = null;
let tokenB = null;
let companyBMain = null;

// Setup and Teardown
test.before(async () => {
  const result = await startServer();
  serverInstance = result.server;
});

test.after(async () => {
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// =========================================================================
// 1. Provisioning & Default Seeding
// =========================================================================
test('Setup: Register Tenant A and verify automatic inventory foundation provisioning', async () => {
  const regRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `INV_T_A_${runId}`,
      tenant_name: 'Inventory Test Tenant A',
      admin_email: `inv_admin_a_${runId}@veridextest.com`,
      admin_password: 'Password123!@#',
      admin_first_name: 'InvAdmin',
      admin_last_name: 'Alpha'
    }
  });

  assert.strictEqual(regRes.status, 201);
  tenantA = regRes.body.data.tenant;
  tenantA._id = tenantA.id;
  tokenA = regRes.body.data.token;
  companyAMain = await Company.findOne({ tenant_id: tenantA.id, company_code: 'MAIN' });

  assert.ok(companyAMain, 'Primary company MAIN must be provisioned');
  assert.strictEqual(companyAMain.company_code, 'MAIN');

  // Verify default godown provisioned
  const defaultGodown = await Godown.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    is_default: true
  });
  assert.ok(defaultGodown, 'Default godown MAIN must be auto-provisioned');
  assert.strictEqual(defaultGodown.godown_code, 'MAIN');

  // Verify standard UOMs provisioned
  const uoms = await UnitOfMeasurement.find({
    tenant_id: tenantA._id,
    company_id: companyAMain._id
  });
  assert.ok(uoms.length >= 8, `Expected at least 8 standard UOMs, found ${uoms.length}`);
  const uomCodes = uoms.map(u => u.unit_code);
  assert.ok(uomCodes.includes('PCS'), 'PCS must be seeded');
  assert.ok(uomCodes.includes('BOX'), 'BOX must be seeded');
  assert.ok(uomCodes.includes('KG'), 'KG must be seeded');
  assert.ok(uomCodes.includes('GRAM'), 'GRAM must be seeded');

  // Verify default Primary StockGroup provisioned
  const primaryGroup = await StockGroup.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    group_code: 'PRIMARY'
  });
  assert.ok(primaryGroup, 'PRIMARY stock group must be auto-provisioned');
});

test('Setup: Register Tenant B for cross-tenant isolation testing', async () => {
  const regRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `INV_T_B_${runId}`,
      tenant_name: 'Inventory Test Tenant B',
      admin_email: `inv_admin_b_${runId}@veridextest.com`,
      admin_password: 'Password123!@#',
      admin_first_name: 'InvAdmin',
      admin_last_name: 'Beta'
    }
  });

  assert.strictEqual(regRes.status, 201);
  tenantB = regRes.body.data.tenant;
  tenantB._id = tenantB.id;
  tokenB = regRes.body.data.token;
  companyBMain = await Company.findOne({ tenant_id: tenantB.id, company_code: 'MAIN' });
  assert.ok(companyBMain, 'Primary company for Tenant B must be provisioned');
});

test('Setup: Create secondary company SEC01 under Tenant A for cross-company isolation', async () => {
  const compRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id
    },
    body: {
      company_code: 'SEC01',
      company_name: 'Secondary Retail Branch',
      legal_name: 'Tenant A Secondary LLC',
      business_profile: 'GENERAL_RETAIL',
      base_currency: 'INR'
    }
  });

  assert.strictEqual(compRes.status, 201);
  companyASecondary = await Company.findById(compRes.body.data.company.id);
  assert.strictEqual(companyASecondary.company_code, 'SEC01');
});

// =========================================================================
// 2. Unit Conversion Engine Unit Tests
// =========================================================================
test('UOM Engine: Identity conversion (same UOM) returns factor 1 and exact quantity', async () => {
  const pcsUom = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'PCS'
  });

  const result = await convertQuantity({
    tenantId: tenantA._id,
    companyId: companyAMain._id,
    fromUomId: pcsUom._id,
    toUomId: pcsUom._id,
    quantity: 42
  });

  assert.strictEqual(result.target_quantity, '42');
  assert.strictEqual(result.conversion_factor, '1');
});

test('UOM Engine: Standard dimension mass conversion (2.5 KG = 2500 GRAM)', async () => {
  const kgUom = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'KG'
  });
  const gramUom = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'GRAM'
  });

  const result = await convertQuantity({
    tenantId: tenantA._id,
    companyId: companyAMain._id,
    fromUomId: kgUom._id,
    toUomId: gramUom._id,
    quantity: 2.5
  });

  assert.strictEqual(result.target_quantity, '2500');
  assert.strictEqual(result.conversion_type, 'STANDARD_DIMENSION');
});

test('UOM Engine: Standard dimension volume conversion (1000 ML = 1 LTR)', async () => {
  const mlUom = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'ML'
  });
  const ltrUom = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'LTR'
  });

  const result = await convertQuantity({
    tenantId: tenantA._id,
    companyId: companyAMain._id,
    fromUomId: mlUom._id,
    toUomId: ltrUom._id,
    quantity: 1000
  });

  assert.strictEqual(result.target_quantity, '1');
});

test('UOM Engine: Incompatible dimension conversion (MASS to VOLUME) is rejected', async () => {
  const kgUom = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'KG'
  });
  const ltrUom = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'LTR'
  });

  await assert.rejects(
    async () => {
      await convertQuantity({
        tenantId: tenantA._id,
        companyId: companyAMain._id,
        fromUomId: kgUom._id,
        toUomId: ltrUom._id,
        quantity: 5
      });
    },
    /Cannot convert between incompatible unit dimensions/
  );
});

// =========================================================================
// 3. Stock Groups & Hierarchy (with Cycle Prevention)
// =========================================================================
let groupHardware = null;
let groupFasteners = null;

test('Stock Groups: Create parent group and child subgroup', async () => {
  // Create parent group
  const parentRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/groups',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      group_code: 'HARDWARE',
      group_name: 'Hardware & Tools'
    }
  });

  assert.strictEqual(parentRes.status, 201);
  groupHardware = parentRes.body.data;
  assert.strictEqual(groupHardware.group_code, 'HARDWARE');

  // Create child subgroup
  const childRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/groups',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      group_code: 'FASTENERS',
      group_name: 'Bolts, Nuts & Screws',
      parent_group_id: groupHardware._id
    }
  });

  assert.strictEqual(childRes.status, 201);
  groupFasteners = childRes.body.data;
  assert.strictEqual(groupFasteners.parent_group_id, groupHardware._id);
});

test('Stock Groups: Reject duplicate group_code within the same company', async () => {
  const dupRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/groups',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      group_code: 'HARDWARE',
      group_name: 'Duplicate Hardware'
    }
  });

  assert.strictEqual(dupRes.status, 409);
  assert.strictEqual(dupRes.body.error?.code, 'DUPLICATE_GROUP_CODE');
});

test('Stock Groups: Allow identical group_code across different companies', async () => {
  const crossCompRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/groups',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyASecondary._id
    },
    body: {
      group_code: 'HARDWARE',
      group_name: 'Hardware in Secondary Company'
    }
  });

  assert.strictEqual(crossCompRes.status, 201);
});

test('Stock Groups: Reject circular hierarchy dependency (Parent -> Child -> Parent)', async () => {
  // Attempt to set groupHardware's parent to groupFasteners (which has groupHardware as parent)
  const cycleRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/inventory/groups/${groupHardware._id}`,
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      parent_group_id: groupFasteners._id
    }
  });

  assert.strictEqual(cycleRes.status, 400);
  assert.strictEqual(cycleRes.body.error?.code, 'CIRCULAR_GROUP_DEPENDENCY');
});

test('Stock Groups: Reject self-parent cycle (group setting parent to itself)', async () => {
  const selfRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/inventory/groups/${groupHardware._id}`,
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      parent_group_id: groupHardware._id
    }
  });

  assert.strictEqual(selfRes.status, 400);
  assert.strictEqual(selfRes.body.error?.code, 'SELF_PARENT_CYCLE');
});

test('Stock Groups: Reject deletion of group with active child subgroups', async () => {
  const delRes = await makeRequest({
    method: 'DELETE',
    path: `/api/v1/inventory/groups/${groupHardware._id}`,
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    }
  });

  assert.strictEqual(delRes.status, 400);
  assert.strictEqual(delRes.body.error?.code, 'GROUP_HAS_ACTIVE_SUBGROUPS');
});

// =========================================================================
// 4. Stock Categories CRUD
// =========================================================================
let categoryStandard = null;

test('Stock Categories: Create and list categories', async () => {
  const catRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/categories',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      category_code: 'FASTENERS_CAT',
      category_name: 'Standard Industrial Fasteners'
    }
  });

  assert.strictEqual(catRes.status, 201);
  categoryStandard = catRes.body.data;
  assert.strictEqual(categoryStandard.category_code, 'FASTENERS_CAT');
});

// =========================================================================
// 5. Godowns CRUD & Default Flag
// =========================================================================
let godownEast = null;

test('Godowns: Create secondary godown and promote to default', async () => {
  const gRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/godowns',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      godown_code: 'WH_EAST',
      godown_name: 'Eastern Regional Warehouse',
      is_default: true,
      address: { city: 'Kolkata', state: 'WB', country: 'IN' }
    }
  });

  assert.strictEqual(gRes.status, 201);
  godownEast = gRes.body.data;
  assert.strictEqual(godownEast.is_default, true);

  // Verify previous default godown MAIN has is_default = false
  const oldDefault = await Godown.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    godown_code: 'MAIN'
  });
  assert.strictEqual(oldDefault.is_default, false, 'Previous default godown must be unset');
});

// =========================================================================
// 6. Stock Items & Item-Specific UOM Conversions
// =========================================================================
let itemBolt = null;
let itemScrew = null;
let uomPcs = null;
let uomBox = null;

test('Stock Items: Create item with item-specific alternate UOM (1 BOX = 10 PCS)', async () => {
  uomPcs = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'PCS'
  });
  uomBox = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'BOX'
  });

  const itemRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      item_code: 'BOLT_M8',
      sku: 'SKU-BOLT-M8-50MM',
      item_name: 'M8 Stainless Steel Hex Bolt 50mm',
      stock_group_id: groupFasteners._id,
      stock_category_id: categoryStandard._id,
      base_uom_id: uomPcs._id,
      purchase_uom_id: uomBox._id,
      sales_uom_id: uomPcs._id,
      uom_conversions: [
        { alternate_uom_id: uomBox._id, conversion_factor: '10' }
      ],
      costing_method: 'AVERAGE_COST',
      purchase_price: '5.00',
      sales_price: '8.50'
    }
  });

  assert.strictEqual(itemRes.status, 201);
  itemBolt = itemRes.body.data;
  assert.strictEqual(itemBolt.item_code, 'BOLT_M8');
  assert.strictEqual(itemBolt.uom_conversions.length, 1);
  assert.strictEqual(itemBolt.uom_conversions[0].conversion_factor, '10.000000');
});

test('Stock Items: Create second item with different packaging ratio (1 BOX = 100 PCS)', async () => {
  const itemRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      item_code: 'SCREW_M4',
      sku: 'SKU-SCREW-M4-20MM',
      item_name: 'M4 Drywall Screw 20mm',
      stock_group_id: groupFasteners._id,
      base_uom_id: uomPcs._id,
      purchase_uom_id: uomBox._id,
      uom_conversions: [
        { alternate_uom_id: uomBox._id, conversion_factor: '100' }
      ],
      purchase_price: '0.50',
      sales_price: '1.00'
    }
  });

  assert.strictEqual(itemRes.status, 201);
  itemScrew = itemRes.body.data;
});

test('UOM Engine: Item-specific conversions resolve packaging accurately per item (5 BOX test)', async () => {
  // For BOLT_M8: 1 BOX = 10 PCS -> 5 BOX = 50 PCS
  const boltResult = await convertQuantity({
    tenantId: tenantA._id,
    companyId: companyAMain._id,
    stockItemId: itemBolt._id,
    fromUomId: uomBox._id,
    toUomId: uomPcs._id,
    quantity: 5
  });
  assert.strictEqual(boltResult.target_quantity, '50');
  assert.strictEqual(boltResult.conversion_type, 'ITEM_SPECIFIC');

  // For SCREW_M4: 1 BOX = 100 PCS -> 5 BOX = 500 PCS
  const screwResult = await convertQuantity({
    tenantId: tenantA._id,
    companyId: companyAMain._id,
    stockItemId: itemScrew._id,
    fromUomId: uomBox._id,
    toUomId: uomPcs._id,
    quantity: 5
  });
  assert.strictEqual(screwResult.target_quantity, '500');
  assert.strictEqual(screwResult.conversion_type, 'ITEM_SPECIFIC');
});

test('Stock Items: Reject duplicate item_code and SKU within same company', async () => {
  const dupCodeRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      item_code: 'BOLT_M8',
      sku: 'SKU-UNIQUE-NEW',
      item_name: 'Duplicate Code Item',
      base_uom_id: uomPcs._id
    }
  });
  assert.strictEqual(dupCodeRes.status, 409);
  assert.strictEqual(dupCodeRes.body.error?.code, 'DUPLICATE_ITEM_CODE');

  const dupSkuRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      item_code: 'NEW_CODE',
      sku: 'SKU-BOLT-M8-50MM',
      item_name: 'Duplicate SKU Item',
      base_uom_id: uomPcs._id
    }
  });
  assert.strictEqual(dupSkuRes.status, 409);
  assert.strictEqual(dupSkuRes.body.error?.code, 'DUPLICATE_SKU');
});

test('Stock Items: Allow identical item_code in different company', async () => {
  const baseUomSec = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyASecondary._id,
    unit_code: 'PCS'
  });

  const crossCompRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyASecondary._id
    },
    body: {
      item_code: 'BOLT_M8',
      sku: 'SKU-SEC-BOLT',
      item_name: 'M8 Bolt in Secondary Company',
      base_uom_id: baseUomSec._id
    }
  });

  assert.strictEqual(crossCompRes.status, 201);
});

// =========================================================================
// 7. Opening Stock Posting & Valuation
// =========================================================================
let openingMovementBolt = null;

test('Opening Stock: Post opening stock in alternate UOM (5 BOX = 50 PCS @ ₹5.00/base unit)', async () => {
  // Post 5 BOX of BOLT_M8 at rate 50.00/BOX (which means 5.00/PCS)
  const openRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/opening-stock',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      stock_item_id: itemBolt._id,
      godown_id: godownEast._id,
      quantity: 5,
      uom_id: uomBox._id,
      unit_rate: 50.00,
      total_cost: 250.00,
      batch_number: 'BATCH-2026-A1',
      notes: 'Initial inventory audit count'
    }
  });

  assert.strictEqual(openRes.status, 201);
  assert.strictEqual(openRes.body.data.gl_status, 'DEFERRED_TO_PHASE_4');
  openingMovementBolt = openRes.body.data.movement;

  // Verify movement record details
  assert.strictEqual(openingMovementBolt.movement_type, 'OPENING_STOCK');
  assert.strictEqual(parseFloat(openingMovementBolt.quantity), 5);
  assert.strictEqual(parseFloat(openingMovementBolt.base_quantity), 50); // Converted from 5 BOX to 50 PCS!
  assert.strictEqual(parseFloat(openingMovementBolt.total_cost), 250);

  // Verify projected StockBalance
  const balance = await StockBalance.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    stock_item_id: itemBolt._id,
    godown_id: godownEast._id
  });

  assert.ok(balance, 'Stock balance record must exist');
  assert.strictEqual(parseFloat(balance.quantity_on_hand.toString()), 50);
  assert.strictEqual(parseFloat(balance.total_inventory_value.toString()), 250);
  assert.strictEqual(parseFloat(balance.average_unit_cost.toString()), 5); // 250 / 50 = 5 per PCS
});

test('Opening Stock: Reject duplicate opening stock posting for the same item and godown', async () => {
  const dupRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/opening-stock',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      stock_item_id: itemBolt._id,
      godown_id: godownEast._id,
      quantity: 2,
      unit_rate: 5.00
    }
  });

  assert.strictEqual(dupRes.status, 409);
  assert.strictEqual(dupRes.body.error?.code, 'OPENING_STOCK_ALREADY_POSTED');
});

test('Stock Items: Reject changing base_uom_id after stock movements exist', async () => {
  const kgUom = await UnitOfMeasurement.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    unit_code: 'KG'
  });

  const patchRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/inventory/items/${itemBolt._id}`,
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      base_uom_id: kgUom._id
    }
  });

  assert.strictEqual(patchRes.status, 400);
  assert.strictEqual(patchRes.body.error?.code, 'BASE_UOM_IMMUTABLE_AFTER_MOVEMENTS');
});

// =========================================================================
// 8. Reversal & Reconcile / Balance Rebuild
// =========================================================================
let screwMovement = null;

test('Movements: Post opening stock for SCREW_M4 and reverse it', async () => {
  // Post 100 PCS of SCREW_M4 @ 0.50 = 50.00 in godownEast
  const openRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/opening-stock',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      stock_item_id: itemScrew._id,
      godown_id: godownEast._id,
      quantity: 100,
      uom_id: uomPcs._id,
      unit_rate: 0.50,
      total_cost: 50.00
    }
  });

  assert.strictEqual(openRes.status, 201);
  screwMovement = openRes.body.data.movement;

  // Verify balance before reversal: 100 on hand
  let bal = await StockBalance.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    stock_item_id: itemScrew._id,
    godown_id: godownEast._id
  });
  assert.strictEqual(parseFloat(bal.quantity_on_hand.toString()), 100);

  // Reverse the movement
  const revRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/inventory/movements/${screwMovement._id}/reverse`,
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      reason: 'Physical count was erroneous'
    }
  });

  assert.strictEqual(revRes.status, 200);
  const revMovement = revRes.body.data.reversal_movement;
  assert.strictEqual(revMovement.movement_type, 'REVERSAL');
  assert.strictEqual(parseFloat(revMovement.base_quantity), -100); // Compensating negative base quantity!

  // Verify balance returned to 0
  bal = await StockBalance.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    stock_item_id: itemScrew._id,
    godown_id: godownEast._id
  });
  assert.strictEqual(parseFloat(bal.quantity_on_hand.toString()), 0);
  assert.strictEqual(parseFloat(bal.total_inventory_value.toString()), 0);

  // Second reversal attempt on the same movement must be rejected
  const dupRevRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/inventory/movements/${screwMovement._id}/reverse`,
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: { reason: 'Duplicate reversal attempt' }
  });
  assert.strictEqual(dupRevRes.status, 400);
});

test('Reconciliation: Rebuild balances from movement ledger reconstructs exact numbers', async () => {
  const reconRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/reconcile',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {}
  });

  assert.strictEqual(reconRes.status, 200);

  // Check BOLT_M8 balance remains 50
  const boltBal = await StockBalance.findOne({
    tenant_id: tenantA._id,
    company_id: companyAMain._id,
    stock_item_id: itemBolt._id,
    godown_id: godownEast._id
  });
  assert.ok(boltBal, 'Bolt balance must exist after reconciliation');
  assert.strictEqual(parseFloat(boltBal.quantity_on_hand.toString()), 50);
  assert.strictEqual(parseFloat(boltBal.total_inventory_value.toString()), 250);
});

// =========================================================================
// 9. Company & Tenant Data Isolation
// =========================================================================
test('Isolation: Requests for Company MAIN items do not expose Secondary Company items', async () => {
  const mainItemsRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/inventory/items',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    }
  });

  assert.strictEqual(mainItemsRes.status, 200);
  const itemsInMain = mainItemsRes.body.data.items;
  const itemCodes = itemsInMain.map(i => i.item_code);
  assert.ok(itemCodes.includes('BOLT_M8'));
  assert.ok(itemCodes.includes('SCREW_M4'));

  // Ensure secondary company items are not included
  const secItemsRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/inventory/items',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyASecondary._id
    }
  });

  assert.strictEqual(secItemsRes.status, 200);
  const itemsInSec = secItemsRes.body.data.items;
  assert.strictEqual(itemsInSec.length, 1);
  assert.strictEqual(itemsInSec[0].sku, 'SKU-SEC-BOLT');
});

test('Isolation: User in Tenant B cannot access Company A inventory items', async () => {
  const crossTenantRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/inventory/items/${itemBolt._id}`,
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'x-tenant-id': tenantB._id,
      'x-company-id': companyBMain._id
    }
  });

  assert.strictEqual(crossTenantRes.status, 404);
});

test('Isolation: Tampered x-company-id header for company user has no membership in is rejected', async () => {
  const tamperedRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/inventory/items',
    headers: {
      Authorization: `Bearer ${tokenB}`,
      'x-tenant-id': tenantB._id,
      'x-company-id': companyAMain._id // Tampering with Tenant A's company ID
    }
  });

  assert.strictEqual(tamperedRes.status, 403);
});

// =========================================================================
// 10. Inactive Stock Item Rejection
// =========================================================================
test('Inactive Item: Posting opening stock for deactivated item is rejected', async () => {
  // Deactivate SCREW_M4
  await StockItem.findByIdAndUpdate(itemScrew._id, { status: 'INACTIVE' });

  // Post opening stock for inactive item
  const inactRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/opening-stock',
    headers: {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': tenantA._id,
      'x-company-id': companyAMain._id
    },
    body: {
      stock_item_id: itemScrew._id,
      godown_id: godownEast._id,
      quantity: 50,
      unit_rate: 1.00
    }
  });

  assert.strictEqual(inactRes.status, 400);
  assert.strictEqual(inactRes.body.error?.code, 'STOCK_ITEM_INACTIVE');
});
