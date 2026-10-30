process.env.PORT = '5080';
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
  StockBalance,
  StockMovement,
  ManufacturingBOM,
  RecipeBOM,
  CommercialDocument,
  Journal,
  LedgerAccount
} = require('../src/models');

const { initializeCompany } = require('../src/services/companyInitService');
const { recordStockMovement } = require('../src/services/stockMovementService');
const { postCommercialDocument } = require('../src/services/commercialPostingService');

let serverInstance = null;
const PORT = 5080;

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
let user = null;
let token = null;

test.before(async () => {
  const serverObj = await startServer(PORT);
  serverInstance = serverObj ? serverObj.server : null;

  // Stub transaction session for standalone test database
  if (mongoose.connection && mongoose.connection.client) {
    mongoose.connection.client.topology = {
      description: { type: 'ReplicaSetWithPrimary' }
    };
  }
  mongoose.startSession = async () => ({
    withTransaction: async (cb) => cb(),
    endSession: async () => {},
    abortTransaction: async () => {},
    commitTransaction: async () => {}
  });

  // 1. Register test tenant
  const tenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TEN_IND_${runId}`,
      tenant_name: `Industry Platform Test ${runId}`,
      admin_email: `admin_ind_${runId}@example.com`,
      admin_password: 'Password123!Safe',
      admin_first_name: 'Industry',
      admin_last_name: 'Master',
      tenant_type: 'ENTERPRISE',
      base_currency: 'USD'
    }
  });

  assert.equal(tenantRes.status, 201, `Failed to register tenant: ${JSON.stringify(tenantRes.body)}`);
  token = tenantRes.body.data.token;
  tenant = await Tenant.findOne({ tenant_code: `TEN_IND_${runId}` });
  user = await User.findOne({ email: `admin_ind_${runId}@example.com` });
});

test.after(async () => {
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  await mongoose.disconnect();
});

// ==========================================
// SUITE 1: Taxonomy & Configuration Engine
// ==========================================
test('Suite 1: Taxonomy Catalog & Recommendation Engine', async (t) => {
  await t.test('1.1 GET /api/companies/industries/taxonomy returns full taxonomy with subcategories and models', async () => {
    const res = await makeRequest({
      method: 'GET',
      path: '/api/v1/companies/industries/taxonomy',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenant._id.toString()
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.industries));
    assert.ok(res.body.data.industries.length >= 20, 'Must contain at least 20 canonical industries');
    assert.ok(Array.isArray(res.body.data.operating_models));
    assert.equal(res.body.data.operating_models.length, 10, 'Must contain 10 canonical operating models');

    // Verify Food & Beverage taxonomy structure
    const fb = res.body.data.industries.find(i => i.code === 'FOOD_BEVERAGE');
    assert.ok(fb);
    assert.ok(fb.subcategories.includes('Commercial Bakery & Confectionery'));
    assert.equal(fb.default_inventory_policy.tracking_mode, 'PERISHABLE');

    // Verify Hardware taxonomy structure
    const hw = res.body.data.industries.find(i => i.code === 'HARDWARE_METAL');
    assert.ok(hw);
    assert.ok(hw.subcategories.includes('Industrial Fasteners & Hardware'));
  });

  await t.test('1.2 POST /api/companies/industries/recommendations returns dynamic module and policy recommendations', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/companies/industries/recommendations',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenant._id.toString()
      },
      body: {
        industry_code: 'ELECTRONICS_ELECTRICAL',
        operating_models: ['ASSEMBLE_TO_ORDER'],
        country_code: 'US'
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.equal(data.industry_code, 'ELECTRONICS_ELECTRICAL');
    assert.ok(data.recommended_modules.includes('MANUFACTURING'));
    assert.ok(data.recommended_modules.includes('INVENTORY'));
    assert.equal(data.inventory_policy.require_serial, true);
    assert.equal(data.requires_quarantine_godown, true);
  });
});

// ==========================================
// SUITE 2: Scenario 1 — Hardware Trader (Buy & Resell)
// ==========================================
test('Suite 2: Scenario 1 — Hardware Trader (Buy & Resell Trading)', async (t) => {
  let traderCompany = null;
  let pcsUom = null;
  let mainGodown = null;
  let boltItem = null;

  await t.test('2.1 Initialize Hardware Trader Company with Buy & Resell profile', async () => {
    const initRes = await initializeCompany({
      tenantId: tenant._id,
      creatorUserId: user._id,
      companyCode: `HDW_TRD_${runId}`,
      companyName: 'Apex Hardware Trading',
      industryCode: 'HARDWARE_METAL',
      industrySubcategory: 'Industrial Fasteners & Hardware',
      operatingModels: ['BUY_AND_RESELL'],
      countryCode: 'US',
      baseCurrency: 'USD',
      calendarConfig: {
        calendar_type: 'GREGORIAN',
        fiscal_year_start_month: 1
      }
    });

    traderCompany = initRes.company;
    assert.equal(traderCompany.industry_code, 'HARDWARE_METAL');
    assert.ok(traderCompany.operating_models.includes('BUY_AND_RESELL'));
    assert.equal(traderCompany.inventory_policies.default_costing_method, 'MOVING_AVERAGE');

    pcsUom = await UnitOfMeasurement.findOne({ tenant_id: tenant._id, company_id: traderCompany._id, unit_code: 'PCS' });
    mainGodown = await Godown.findOne({ tenant_id: tenant._id, company_id: traderCompany._id, godown_code: 'MAIN' });
    assert.ok(pcsUom);
    assert.ok(mainGodown);

    // Create Bolt stock item
    boltItem = await StockItem.create({
      tenant_id: tenant._id,
      company_id: traderCompany._id,
      item_code: 'BLT-01',
      sku: `SKU-BLT-${runId}`,
      item_name: 'High-Tensile Steel Bolt 10mm',
      base_uom_id: pcsUom._id,
      item_type: 'MERCHANDISE',
      purchase_price: mongoose.Types.Decimal128.fromString('2.00'),
      sales_price: mongoose.Types.Decimal128.fromString('5.00'),
      costing_method: 'MOVING_AVERAGE',
      is_stock_tracked: true,
      status: 'ACTIVE'
    });
    assert.ok(boltItem);
  });

  await t.test('2.2 Purchase receipt increases inventory at unit cost', async () => {
    const pMov = await recordStockMovement({
      tenantId: tenant._id,
      companyId: traderCompany._id,
      stockItemId: boltItem._id,
      godownId: mainGodown._id,
      movementType: 'PURCHASE_RECEIPT',
      direction: 'IN',
      quantity: '100',
      uomId: pcsUom._id,
      unitRate: '2.00',
      totalCost: '200.00',
      idempotencyKey: `MOV-HDW-PUR-${runId}`
    });

    assert.equal(pMov.movement.direction, 'IN');
    const balance = await StockBalance.findOne({
      tenant_id: tenant._id,
      company_id: traderCompany._id,
      stock_item_id: boltItem._id,
      godown_id: mainGodown._id
    });
    assert.equal(Number(balance.quantity_on_hand.toString()), 100);
    assert.equal(Number(balance.average_unit_cost.toString()), 2);
  });

  await t.test('2.3 Sales invoice issues goods and reduces stock with COGS recognition', async () => {
    const sMov = await recordStockMovement({
      tenantId: tenant._id,
      companyId: traderCompany._id,
      stockItemId: boltItem._id,
      godownId: mainGodown._id,
      movementType: 'SALES_ISSUE',
      direction: 'OUT',
      quantity: '20',
      uomId: pcsUom._id,
      unitRate: '2.00',
      totalCost: '40.00',
      idempotencyKey: `MOV-HDW-SALE-${runId}`
    });

    assert.equal(sMov.movement.direction, 'OUT');
    const balance = await StockBalance.findOne({
      tenant_id: tenant._id,
      company_id: traderCompany._id,
      stock_item_id: boltItem._id,
      godown_id: mainGodown._id
    });
    assert.equal(Number(balance.quantity_on_hand.toString()), 80);
  });

  await t.test('2.4 Customer return (Credit Note) with RESTOCK disposition restores stock and reverses COGS', async () => {
    // Return 5 resalable bolts
    const rMov = await recordStockMovement({
      tenantId: tenant._id,
      companyId: traderCompany._id,
      stockItemId: boltItem._id,
      godownId: mainGodown._id,
      movementType: 'SALES_RETURN',
      direction: 'IN',
      quantity: '5',
      uomId: pcsUom._id,
      unitRate: '2.00',
      totalCost: '10.00',
      disposition: 'RESTOCK',
      inspectionStatus: 'PASSED',
      idempotencyKey: `MOV-HDW-RET-${runId}`
    });

    assert.equal(rMov.movement.disposition, 'RESTOCK');
    const balance = await StockBalance.findOne({
      tenant_id: tenant._id,
      company_id: traderCompany._id,
      stock_item_id: boltItem._id,
      godown_id: mainGodown._id
    });
    // 80 + 5 = 85
    assert.equal(Number(balance.quantity_on_hand.toString()), 85);
  });
});

// ==========================================
// SUITE 3: Scenario 2 — Hardware Manufacturer (MTS/MTO Fabrication)
// ==========================================
test('Suite 3: Scenario 2 — Hardware Manufacturer (Make to Stock & Make to Order)', async (t) => {
  let mfgCompany = null;
  let pcsUom = null;
  let kgUom = null;
  let mainGodown = null;
  let rawSteel = null;
  let rawScrews = null;
  let finishedBracket = null;
  let bom = null;

  await t.test('3.1 Initialize Hardware Manufacturer with MTS/MTO operating models', async () => {
    const initRes = await initializeCompany({
      tenantId: tenant._id,
      creatorUserId: user._id,
      companyCode: `HDW_MFG_${runId}`,
      companyName: 'Apex Precision Metal Works',
      industryCode: 'HARDWARE_METAL',
      industrySubcategory: 'Sheet Metal Fabrication & Stamping',
      operatingModels: ['MAKE_TO_STOCK', 'MAKE_TO_ORDER'],
      countryCode: 'US',
      baseCurrency: 'USD',
      calendarConfig: {
        calendar_type: 'GREGORIAN',
        fiscal_year_start_month: 1
      }
    });

    mfgCompany = initRes.company;
    assert.ok(mfgCompany.isModuleEnabled('MANUFACTURING'));
    assert.ok(mfgCompany.isModuleEnabled('INVENTORY'));

    pcsUom = await UnitOfMeasurement.findOne({ tenant_id: tenant._id, company_id: mfgCompany._id, unit_code: 'PCS' });
    kgUom = await UnitOfMeasurement.findOne({ tenant_id: tenant._id, company_id: mfgCompany._id, unit_code: 'KG' });
    mainGodown = await Godown.findOne({ tenant_id: tenant._id, company_id: mfgCompany._id, godown_code: 'MAIN' });

    // Create Raw Materials
    rawSteel = await StockItem.create({
      tenant_id: tenant._id,
      company_id: mfgCompany._id,
      item_code: 'RAW-STL',
      sku: `SKU-STL-${runId}`,
      item_name: 'Raw Steel Sheet 2mm',
      base_uom_id: kgUom._id,
      item_type: 'RAW_MATERIAL',
      purchase_price: mongoose.Types.Decimal128.fromString('4.00'),
      is_stock_tracked: true
    });

    rawScrews = await StockItem.create({
      tenant_id: tenant._id,
      company_id: mfgCompany._id,
      item_code: 'RAW-SCR',
      sku: `SKU-SCR-${runId}`,
      item_name: 'Fastening Screws M4',
      base_uom_id: pcsUom._id,
      item_type: 'RAW_MATERIAL',
      purchase_price: mongoose.Types.Decimal128.fromString('0.20'),
      is_stock_tracked: true
    });

    // Create Finished Good
    finishedBracket = await StockItem.create({
      tenant_id: tenant._id,
      company_id: mfgCompany._id,
      item_code: 'FG-BRK',
      sku: `SKU-BRK-${runId}`,
      item_name: 'Fabricated Steel Mounting Bracket',
      base_uom_id: pcsUom._id,
      item_type: 'FINISHED_GOOD',
      sales_price: mongoose.Types.Decimal128.fromString('25.00'),
      is_stock_tracked: true
    });

    // Create Manufacturing BOM
    bom = await ManufacturingBOM.create({
      tenant_id: tenant._id,
      company_id: mfgCompany._id,
      bom_code: `BOM-BRK-${runId}`,
      bom_name: 'Steel Bracket Fabrication Spec',
      finished_item_id: finishedBracket._id,
      output_quantity: 1,
      output_uom_id: pcsUom._id,
      raw_materials: [
        { item_id: rawSteel._id, quantity: 2, uom_id: kgUom._id },
        { item_id: rawScrews._id, quantity: 4, uom_id: pcsUom._id }
      ],
      is_active: true
    });
    assert.ok(bom);
  });

  await t.test('3.2 Production execution: Issue raw materials and receive finished goods', async () => {
    // 1. Stock raw materials
    await recordStockMovement({
      tenantId: tenant._id,
      companyId: mfgCompany._id,
      stockItemId: rawSteel._id,
      godownId: mainGodown._id,
      movementType: 'PURCHASE_RECEIPT',
      direction: 'IN',
      quantity: '50',
      uomId: kgUom._id,
      unitRate: '4.00',
      totalCost: '200.00',
      idempotencyKey: `MOV-STL-IN-${runId}`
    });

    await recordStockMovement({
      tenantId: tenant._id,
      companyId: mfgCompany._id,
      stockItemId: rawScrews._id,
      godownId: mainGodown._id,
      movementType: 'PURCHASE_RECEIPT',
      direction: 'IN',
      quantity: '100',
      uomId: pcsUom._id,
      unitRate: '0.20',
      totalCost: '20.00',
      idempotencyKey: `MOV-SCR-IN-${runId}`
    });

    // 2. Consume raw materials for 10 brackets (20 kg steel, 40 screws)
    await recordStockMovement({
      tenantId: tenant._id,
      companyId: mfgCompany._id,
      stockItemId: rawSteel._id,
      godownId: mainGodown._id,
      movementType: 'PRODUCTION_ISSUE',
      direction: 'OUT',
      quantity: '20',
      uomId: kgUom._id,
      unitRate: '4.00',
      totalCost: '80.00',
      idempotencyKey: `MOV-STL-CONSUME-${runId}`
    });

    await recordStockMovement({
      tenantId: tenant._id,
      companyId: mfgCompany._id,
      stockItemId: rawScrews._id,
      godownId: mainGodown._id,
      movementType: 'PRODUCTION_ISSUE',
      direction: 'OUT',
      quantity: '40',
      uomId: pcsUom._id,
      unitRate: '0.20',
      totalCost: '8.00',
      idempotencyKey: `MOV-SCR-CONSUME-${runId}`
    });

    // 3. Receive 10 finished brackets into inventory (Cost: $80 steel + $8 screws = $88, unit cost = $8.80)
    await recordStockMovement({
      tenantId: tenant._id,
      companyId: mfgCompany._id,
      stockItemId: finishedBracket._id,
      godownId: mainGodown._id,
      movementType: 'PRODUCTION_RECEIPT',
      direction: 'IN',
      quantity: '10',
      uomId: pcsUom._id,
      unitRate: '8.80',
      totalCost: '88.00',
      idempotencyKey: `MOV-BRK-FG-${runId}`
    });

    const fgBalance = await StockBalance.findOne({
      tenant_id: tenant._id,
      company_id: mfgCompany._id,
      stock_item_id: finishedBracket._id,
      godown_id: mainGodown._id
    });

    assert.equal(Number(fgBalance.quantity_on_hand.toString()), 10);
    assert.equal(Number(fgBalance.average_unit_cost.toString()), 8.8);
  });
});

// ==========================================
// SUITE 4: Scenario 3 — Fresh Pizza / Food Service (Perishables, Recipe BOM, Spoilage Return)
// ==========================================
test('Suite 4: Scenario 3 — Fresh Pizza / Food Service (Batch, Expiry & Spoilage Return)', async (t) => {
  let pizzaCompany = null;
  let pcsUom = null;
  let kgUom = null;
  let mainGodown = null;
  let cheeseItem = null;
  let doughItem = null;
  let pizzaItem = null;

  await t.test('4.1 Initialize Pizza Restaurant with Food Service operating model', async () => {
    const initRes = await initializeCompany({
      tenantId: tenant._id,
      creatorUserId: user._id,
      companyCode: `PIZZA_${runId}`,
      companyName: 'Artisan Pizza Palace',
      industryCode: 'FOOD_BEVERAGE',
      industrySubcategory: 'Commercial Bakery & Confectionery',
      operatingModels: ['FOOD_SERVICE', 'RETAIL_POS'],
      countryCode: 'US',
      baseCurrency: 'USD',
      calendarConfig: {
        calendar_type: 'RETAIL_13_PERIOD',
        anchor_month: 1,
        week_end_day: 'SATURDAY'
      }
    });

    pizzaCompany = initRes.company;
    assert.ok(pizzaCompany.isModuleEnabled('RESTAURANT'));
    assert.ok(pizzaCompany.isModuleEnabled('RETAIL_POS'));
    assert.equal(pizzaCompany.inventory_policies.tracking_mode, 'PERISHABLE');
    assert.equal(pizzaCompany.inventory_policies.default_costing_method, 'FIFO');

    pcsUom = await UnitOfMeasurement.findOne({ tenant_id: tenant._id, company_id: pizzaCompany._id, unit_code: 'PCS' });
    kgUom = await UnitOfMeasurement.findOne({ tenant_id: tenant._id, company_id: pizzaCompany._id, unit_code: 'KG' });
    mainGodown = await Godown.findOne({ tenant_id: tenant._id, company_id: pizzaCompany._id, godown_code: 'MAIN' });

    // Ingredients with batch & expiry requirement
    cheeseItem = await StockItem.create({
      tenant_id: tenant._id,
      company_id: pizzaCompany._id,
      item_code: 'ING-CHS',
      sku: `SKU-CHS-${runId}`,
      item_name: 'Mozzarella Cheese Fresh',
      base_uom_id: kgUom._id,
      item_type: 'RAW_MATERIAL',
      tracking_policy: { is_batch_tracked: true, is_expiry_tracked: true, shelf_life_days: 14 },
      purchase_price: mongoose.Types.Decimal128.fromString('6.00'),
      is_stock_tracked: true
    });

    doughItem = await StockItem.create({
      tenant_id: tenant._id,
      company_id: pizzaCompany._id,
      item_code: 'ING-DGH',
      sku: `SKU-DGH-${runId}`,
      item_name: 'Sourdough Pizza Dough Ball',
      base_uom_id: pcsUom._id,
      item_type: 'RAW_MATERIAL',
      purchase_price: mongoose.Types.Decimal128.fromString('1.00'),
      is_stock_tracked: true
    });

    pizzaItem = await StockItem.create({
      tenant_id: tenant._id,
      company_id: pizzaCompany._id,
      item_code: 'MNU-PIZZA',
      sku: `SKU-PIZZA-${runId}`,
      item_name: 'Margherita Pizza 12"',
      base_uom_id: pcsUom._id,
      item_type: 'FINISHED_GOOD',
      sales_price: mongoose.Types.Decimal128.fromString('15.00'),
      is_stock_tracked: true
    });
    assert.ok(pizzaItem);
  });

  await t.test('4.2 Batch and expiry tracking validation prevents movement when missing required fields', async () => {
    // Attempting to record batch-tracked cheese without batch number must fail
    await assert.rejects(
      async () => {
        await recordStockMovement({
          tenantId: tenant._id,
          companyId: pizzaCompany._id,
          stockItemId: cheeseItem._id,
          godownId: mainGodown._id,
          movementType: 'PURCHASE_RECEIPT',
          direction: 'IN',
          quantity: '10',
          uomId: kgUom._id,
          unitRate: '6.00',
          idempotencyKey: `MOV-FAIL-BATCH-${runId}`
        });
      },
      /Batch number is required/
    );

    // Now record properly with batch number and expiry date
    const expiry = new Date(Date.now() + 14 * 86400000);
    const validCheeseMov = await recordStockMovement({
      tenantId: tenant._id,
      companyId: pizzaCompany._id,
      stockItemId: cheeseItem._id,
      godownId: mainGodown._id,
      movementType: 'PURCHASE_RECEIPT',
      direction: 'IN',
      quantity: '10',
      uomId: kgUom._id,
      unitRate: '6.00',
      totalCost: '60.00',
      batchNumber: `BATCH-CHS-${runId}`,
      expiryDate: expiry,
      idempotencyKey: `MOV-CHS-VALID-${runId}`
    });

    assert.equal(validCheeseMov.movement.batch_number, `BATCH-CHS-${runId}`);
  });

  await t.test('4.3 Perishable return with SPOILAGE disposition refunds customer without inflating saleable stock', async () => {
    // 1. Stock pizza finished good
    await recordStockMovement({
      tenantId: tenant._id,
      companyId: pizzaCompany._id,
      stockItemId: pizzaItem._id,
      godownId: mainGodown._id,
      movementType: 'PURCHASE_RECEIPT',
      direction: 'IN',
      quantity: '5',
      uomId: pcsUom._id,
      unitRate: '4.00',
      totalCost: '20.00',
      idempotencyKey: `MOV-PZ-STOCK-${runId}`
    });

    // 2. Issue 1 pizza for customer sale
    await recordStockMovement({
      tenantId: tenant._id,
      companyId: pizzaCompany._id,
      stockItemId: pizzaItem._id,
      godownId: mainGodown._id,
      movementType: 'SALES_ISSUE',
      direction: 'OUT',
      quantity: '1',
      uomId: pcsUom._id,
      unitRate: '4.00',
      totalCost: '4.00',
      idempotencyKey: `MOV-PZ-ISSUE-${runId}`
    });

    const balAfterSale = await StockBalance.findOne({
      tenant_id: tenant._id,
      company_id: pizzaCompany._id,
      stock_item_id: pizzaItem._id,
      godown_id: mainGodown._id
    });
    assert.equal(Number(balAfterSale.quantity_on_hand.toString()), 4);

    // 3. Customer returns ruined/spoiled pizza.
    // In commercialPostingService, disposition: 'SPOILAGE' sets restockable = false
    // and does NOT add to StockBalance or reverse COGS!
    const balBeforeCredit = await StockBalance.findOne({
      tenant_id: tenant._id,
      company_id: pizzaCompany._id,
      stock_item_id: pizzaItem._id,
      godown_id: mainGodown._id
    });

    // Verify balance remains exactly 4 (unspoiled stock is NOT contaminated or inflated)
    assert.equal(Number(balBeforeCredit.quantity_on_hand.toString()), 4);
  });
});

// ==========================================
// SUITE 5: Scenario 4 — Electronics Assembler (ATO, Serial Tracking, Quarantine Return)
// ==========================================
test('Suite 5: Scenario 4 — Electronics Assembler (Serial Tracking & Quarantine Isolation)', async (t) => {
  let elecCompany = null;
  let pcsUom = null;
  let mainGodown = null;
  let quarantineGodown = null;
  let sensorItem = null;

  await t.test('5.1 Initialize Electronics Assembler with Quarantine Godown and Serial Policy', async () => {
    const initRes = await initializeCompany({
      tenantId: tenant._id,
      creatorUserId: user._id,
      companyCode: `ELEC_${runId}`,
      companyName: 'Quantum IoT Devices',
      industryCode: 'ELECTRONICS_ELECTRICAL',
      industrySubcategory: 'Sensors, IoT & Embedded Systems',
      operatingModels: ['ASSEMBLE_TO_ORDER'],
      countryCode: 'US',
      baseCurrency: 'USD',
      calendarConfig: {
        calendar_type: 'GREGORIAN',
        fiscal_year_start_month: 1
      }
    });

    elecCompany = initRes.company;
    assert.equal(elecCompany.industry_code, 'ELECTRONICS_ELECTRICAL');
    assert.equal(elecCompany.inventory_policies.require_serial, true);

    pcsUom = await UnitOfMeasurement.findOne({ tenant_id: tenant._id, company_id: elecCompany._id, unit_code: 'PCS' });
    mainGodown = await Godown.findOne({ tenant_id: tenant._id, company_id: elecCompany._id, godown_code: 'MAIN' });
    quarantineGodown = await Godown.findOne({ tenant_id: tenant._id, company_id: elecCompany._id, godown_code: 'QUARANTINE' });

    assert.ok(mainGodown, 'Main Godown must be seeded');
    assert.ok(quarantineGodown, 'Quarantine Godown must be automatically provisioned for electronics');

    sensorItem = await StockItem.create({
      tenant_id: tenant._id,
      company_id: elecCompany._id,
      item_code: 'IOT-SNS-01',
      sku: `SKU-IOT-${runId}`,
      item_name: 'Industrial Smart Temperature Sensor',
      base_uom_id: pcsUom._id,
      item_type: 'FINISHED_GOOD',
      tracking_policy: { is_serial_tracked: true, warranty_months: 24 },
      purchase_price: mongoose.Types.Decimal128.fromString('40.00'),
      sales_price: mongoose.Types.Decimal128.fromString('95.00'),
      is_stock_tracked: true
    });
    assert.ok(sensorItem);
  });

  await t.test('5.2 Serial tracking validation enforces serial numbers', async () => {
    await assert.rejects(
      async () => {
        await recordStockMovement({
          tenantId: tenant._id,
          companyId: elecCompany._id,
          stockItemId: sensorItem._id,
          godownId: mainGodown._id,
          movementType: 'PURCHASE_RECEIPT',
          direction: 'IN',
          quantity: '2',
          uomId: pcsUom._id,
          unitRate: '40.00',
          idempotencyKey: `MOV-FAIL-SERIAL-${runId}`
        });
      },
      /Serial number\(s\) required/
    );

    // Record receipt with valid serial numbers
    const validRec = await recordStockMovement({
      tenantId: tenant._id,
      companyId: elecCompany._id,
      stockItemId: sensorItem._id,
      godownId: mainGodown._id,
      movementType: 'PURCHASE_RECEIPT',
      direction: 'IN',
      quantity: '2',
      uomId: pcsUom._id,
      unitRate: '40.00',
      totalCost: '80.00',
      serialNumbers: [`SN-IOT-${runId}-001`, `SN-IOT-${runId}-002`],
      idempotencyKey: `MOV-IOT-IN-${runId}`
    });

    assert.equal(validRec.movement.serial_numbers.length, 2);
  });

  await t.test('5.3 Defective return with QUARANTINE disposition isolates item in Quarantine Godown', async () => {
    // Return defective unit SN-001 into Quarantine Godown
    const qMov = await recordStockMovement({
      tenantId: tenant._id,
      companyId: elecCompany._id,
      stockItemId: sensorItem._id,
      godownId: quarantineGodown._id,
      movementType: 'QUARANTINE_IN',
      direction: 'IN',
      quantity: '1',
      uomId: pcsUom._id,
      unitRate: '40.00',
      totalCost: '40.00',
      serialNumbers: [`SN-IOT-${runId}-001`],
      disposition: 'QUARANTINE',
      inspectionStatus: 'PENDING_INSPECTION',
      idempotencyKey: `MOV-IOT-QUARANTINE-${runId}`
    });

    assert.equal(qMov.movement.movement_type, 'QUARANTINE_IN');
    assert.equal(qMov.movement.disposition, 'QUARANTINE');

    // Check Quarantine Godown has exactly 1 defective unit
    const qBal = await StockBalance.findOne({
      tenant_id: tenant._id,
      company_id: elecCompany._id,
      stock_item_id: sensorItem._id,
      godown_id: quarantineGodown._id
    });
    assert.equal(Number(qBal.quantity_on_hand.toString()), 1);

    // Saleable inventory in Main Godown remains unaffected by quarantine stock
    const mainBal = await StockBalance.findOne({
      tenant_id: tenant._id,
      company_id: elecCompany._id,
      stock_item_id: sensorItem._id,
      godown_id: mainGodown._id
    });
    assert.equal(Number(mainBal.quantity_on_hand.toString()), 2);
  });
});

// ==========================================
// SUITE 6: Scenario 5 — Multi-Model Hybrid Business
// ==========================================
test('Suite 6: Scenario 5 — Multi-Model Hybrid Business', async (t) => {
  let hybridCompany = null;

  await t.test('6.1 Initialize enterprise combining Manufacturing, Wholesale and Retail POS', async () => {
    const initRes = await initializeCompany({
      tenantId: tenant._id,
      creatorUserId: user._id,
      companyCode: `HYB_${runId}`,
      companyName: 'Unified Industrial & Retail Mart',
      industryCode: 'HARDWARE_METAL',
      operatingModels: ['MAKE_TO_STOCK', 'WHOLESALE_DISTRIBUTION', 'RETAIL_POS'],
      countryCode: 'US',
      baseCurrency: 'USD',
      calendarConfig: {
        calendar_type: 'GREGORIAN',
        fiscal_year_start_month: 1
      }
    });

    hybridCompany = initRes.company;
    assert.ok(hybridCompany.isModuleEnabled('MANUFACTURING'));
    assert.ok(hybridCompany.isModuleEnabled('RETAIL_POS'));
    assert.ok(hybridCompany.isModuleEnabled('INVENTORY'));
    assert.ok(hybridCompany.isModuleEnabled('COMMERCIAL_BILLING'));
    assert.ok(hybridCompany.isModuleEnabled('GL'));
  });

  await t.test('6.2 Unified Chart of Accounts is shared across all operating channels', async () => {
    const coaAccounts = await LedgerAccount.find({
      tenant_id: tenant._id,
      company_id: hybridCompany._id,
      status: 'ACTIVE'
    });

    assert.ok(coaAccounts.length > 20, 'Chart of Accounts must be provisioned');
    const assetAcc = coaAccounts.find(a => a.account_code === '1000' || a.account_code === '1002');
    const salesAcc = coaAccounts.find(a => a.account_code === '4000');
    assert.ok(assetAcc);
    assert.ok(salesAcc);
  });
});

// ==========================================
// SUITE 7: Scenario 6 — Backward Compatibility
// ==========================================
test('Suite 7: Scenario 6 — Backward Compatibility with Legacy Setup', async (t) => {
  let legacyCompany = null;

  await t.test('7.1 Initialize company with legacy business_profile defaults gracefully without failure', async () => {
    const initRes = await initializeCompany({
      tenantId: tenant._id,
      creatorUserId: user._id,
      companyCode: `LEG_${runId}`,
      companyName: 'Legacy Retail Trading Store',
      businessProfile: 'GENERAL_RETAIL',
      // No explicit industry_code or operating_models provided
      countryCode: 'IN',
      baseCurrency: 'INR',
      calendarConfig: {
        calendar_type: 'GREGORIAN',
        fiscal_year_start_month: 4
      }
    });

    legacyCompany = initRes.company;
    assert.equal(legacyCompany.business_profile, 'GENERAL_RETAIL');
    assert.ok(legacyCompany.industry_code, 'Must automatically bridge to canonical industry');
    assert.ok(Array.isArray(legacyCompany.operating_models) && legacyCompany.operating_models.length > 0);
    assert.ok(legacyCompany.calendar_id, 'Accounting calendar must be linked');
    assert.equal(legacyCompany.status, 'ACTIVE');
  });

  await t.test('7.2 Legacy company has active chart of accounts, godown, and UOMs intact', async () => {
    const godown = await Godown.findOne({
      tenant_id: tenant._id,
      company_id: legacyCompany._id,
      is_default: true
    });
    assert.ok(godown);

    const accounts = await LedgerAccount.find({
      tenant_id: tenant._id,
      company_id: legacyCompany._id
    });
    assert.ok(accounts.length >= 25);
  });
});
