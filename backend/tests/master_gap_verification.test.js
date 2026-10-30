process.env.PORT = '5078';
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
  CommercialDocument,
  Journal,
  JournalEntry,
  LedgerAccount,
  Party,
  ManufacturingBOM,
  RecipeBOM
} = require('../src/models');
const { initializeCompany } = require('../src/services/companyInitService');

let serverInstance = null;
const PORT = 5078;

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
let defaultUom = null;
let defaultGodown = null;

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

  // 1. Register a test tenant via auth endpoint
  const tenantRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TEN_AUD_${runId}`,
      tenant_name: `Gap Audit Tenant ${runId}`,
      admin_email: `admin_aud_${runId}@example.com`,
      admin_password: 'Password123!Safe',
      admin_first_name: 'Audit',
      admin_last_name: 'Tester',
      tenant_type: 'MANUFACTURING',
      base_currency: 'INR'
    }
  });

  assert.equal(tenantRes.status, 201, `Failed to register tenant: ${JSON.stringify(tenantRes.body)}`);
  token = tenantRes.body.data.token;
  tenant = await Tenant.findOne({ tenant_code: `TEN_AUD_${runId}` });
  user = await User.findOne({ email: `admin_aud_${runId}@example.com` });

  // 2. Initialize Company with full module suite
  const initRes = await initializeCompany({
    tenantId: tenant._id,
    creatorUserId: user._id,
    companyCode: `COMP_AUD_${runId}`,
    companyName: `Gap Audit Co ${runId} Pvt Ltd`,
    businessProfile: 'MANUFACTURING'
  });

  company = initRes.company;
  company.enabled_modules = ['GL', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING', 'RESTAURANT'];
  company.tax_details = {
    gstin: '27AABCT1234Z1Z5',
    pan: 'AABCT1234Z',
    state_code: '27'
  };
  await company.save();

  // Find or create default UOM
  defaultUom = await UnitOfMeasurement.findOne({ tenant_id: tenant._id, company_id: company._id })
    || await UnitOfMeasurement.create({
      tenant_id: tenant._id,
      company_id: company._id,
      unit_code: `PCS_${runId}`,
      unit_name: 'Pieces',
      is_discrete: true
    });

  // Find default Godown
  defaultGodown = await Godown.findOne({ tenant_id: tenant._id, company_id: company._id, status: 'ACTIVE' });
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

// =========================================================================
// REQUIREMENT 1: Entity Full CRUD & Safe Archive/Delete
// =========================================================================
test('1. Requirement 1: Counterparty full CRUD and safe archive', async () => {
  // 1. Create
  const createRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/counterparties',
    headers: getHeaders(),
    body: {
      party_code: `CUST-AUD-${runId}`,
      legal_name: 'Apex Super Retailers Ltd',
      trade_name: 'Apex Super',
      initial_role_type: 'CUSTOMER',
      tax_id: '27AABCA5678Z1Z2',
      address: { state: 'Maharashtra', city: 'Mumbai' }
    }
  });
  assert.strictEqual(createRes.status, 201);
  const partyId = createRes.body.data._id;

  // 2. List
  const listRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/counterparties',
    headers: getHeaders()
  });
  assert.strictEqual(listRes.status, 200);
  assert.ok(listRes.body.data.some(p => p._id === partyId));

  // 3. Detail
  const detailRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/counterparties/${partyId}`,
    headers: getHeaders()
  });
  assert.strictEqual(detailRes.status, 200);
  assert.strictEqual(detailRes.body.data.party_code, `CUST-AUD-${runId}`);

  // 4. Update
  const updateRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/counterparties/${partyId}`,
    headers: getHeaders(),
    body: { trade_name: 'Apex Super Retail Updated' }
  });
  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.body.data.trade_name, 'Apex Super Retail Updated');

  // 5. Safe Archive (DELETE route)
  const archiveRes = await makeRequest({
    method: 'DELETE',
    path: `/api/v1/counterparties/${partyId}`,
    headers: getHeaders()
  });
  assert.strictEqual(archiveRes.status, 200);
  assert.strictEqual(archiveRes.body.data.status, 'ARCHIVED');
});

test('2. Requirement 1: Inventory Masters (UOM, Godown, StockItem) CRUD and safe delete/archive', async () => {
  // A. UOM CRUD
  const uomRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/uom',
    headers: getHeaders(),
    body: { unit_code: `BX_${runId}`, unit_name: 'Carton Box', decimal_places: 0 }
  });
  assert.strictEqual(uomRes.status, 201);
  const uomId = uomRes.body.data._id;

  const uomGet = await makeRequest({ method: 'GET', path: `/api/v1/inventory/uom/${uomId}`, headers: getHeaders() });
  assert.strictEqual(uomGet.status, 200);

  const uomUpd = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/inventory/uom/${uomId}`,
    headers: getHeaders(),
    body: { unit_name: 'Carton Box (Updated)' }
  });
  assert.strictEqual(uomUpd.status, 200);

  const uomDel = await makeRequest({ method: 'DELETE', path: `/api/v1/inventory/uom/${uomId}`, headers: getHeaders() });
  assert.strictEqual(uomDel.status, 200);

  // B. Godown CRUD
  const godownRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/godowns',
    headers: getHeaders(),
    body: { godown_code: `GDW_${runId}`, godown_name: 'Secondary Godown' }
  });
  assert.strictEqual(godownRes.status, 201);
  const godownId = godownRes.body.data._id;

  const godownGet = await makeRequest({ method: 'GET', path: `/api/v1/inventory/godowns/${godownId}`, headers: getHeaders() });
  assert.strictEqual(godownGet.status, 200);

  const godownUpd = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/inventory/godowns/${godownId}`,
    headers: getHeaders(),
    body: { godown_name: 'Secondary Godown Updated' }
  });
  assert.strictEqual(godownUpd.status, 200);

  const godownDel = await makeRequest({ method: 'DELETE', path: `/api/v1/inventory/godowns/${godownId}`, headers: getHeaders() });
  assert.strictEqual(godownDel.status, 200);

  // C. StockItem CRUD and safe archive
  const itemRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: getHeaders(),
    body: {
      item_code: `ITEM-TEMP-${runId}`,
      sku: `SKU-TEMP-${runId}`,
      item_name: 'Temporary Audit Product',
      base_uom_id: defaultUom._id,
      sales_price: 500,
      tax_rate: 18
    }
  });
  assert.strictEqual(itemRes.status, 201);
  const itemId = itemRes.body.data._id;

  const itemGet = await makeRequest({ method: 'GET', path: `/api/v1/inventory/items/${itemId}`, headers: getHeaders() });
  assert.strictEqual(itemGet.status, 200);

  const itemUpd = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/inventory/items/${itemId}`,
    headers: getHeaders(),
    body: { sales_price: 550 }
  });
  assert.strictEqual(itemUpd.status, 200);

  const itemArch = await makeRequest({ method: 'DELETE', path: `/api/v1/inventory/items/${itemId}`, headers: getHeaders() });
  assert.strictEqual(itemArch.status, 200);
  assert.strictEqual(itemArch.body.data.status, 'ARCHIVED');
});

test('3. Requirement 1: Ledger Account (COA) CRUD and safe inactivate/delete', async () => {
  const accRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/accounts',
    headers: getHeaders(),
    body: {
      account_code: `EXP_${runId}`,
      account_name: 'Special Project Expense',
      account_type: 'EXPENSE',
      normal_balance: 'DEBIT'
    }
  });
  assert.strictEqual(accRes.status, 201);
  const accId = accRes.body.data._id;

  const accGet = await makeRequest({ method: 'GET', path: `/api/v1/gl/accounts/${accId}`, headers: getHeaders() });
  assert.strictEqual(accGet.status, 200);

  const accUpd = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/gl/accounts/${accId}`,
    headers: getHeaders(),
    body: { description: 'Updated account description' }
  });
  assert.strictEqual(accUpd.status, 200);

  const accDel = await makeRequest({ method: 'DELETE', path: `/api/v1/gl/accounts/${accId}`, headers: getHeaders() });
  assert.strictEqual(accDel.status, 200);
});

// =========================================================================
// REQUIREMENT 2 & 3: Product Master Tax Defaults, Overrides, Inclusive, Mixed & Historical
// =========================================================================
let itemCheese = null;
let itemBoxes = null;
let vendorParty = null;
let customerParty = null;
let finishedPizzaItem = null;


test('4. Requirement 2: Product master tax defaults auto-populate in transaction lines', async () => {
  // Create Cheese Item (5% Tax Default)
  const i5Res = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: getHeaders(),
    body: {
      item_code: `RAW-CH-${runId}`,
      sku: `SKU-CH-${runId}`,
      item_name: 'Organic Cheddar Cheese',
      base_uom_id: defaultUom._id,
      purchase_price: 200,
      sales_price: 300,
      tax_rate: 5,
      hsn_sac_code: '0406'
    }
  });
  assert.strictEqual(i5Res.status, 201);
  itemCheese = i5Res.body.data;

  // Create Box Item (18% Tax Default)
  const i18Res = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: getHeaders(),
    body: {
      item_code: `RAW-BX-${runId}`,
      sku: `SKU-BX-${runId}`,
      item_name: 'Printed Pizza Box 10-inch',
      base_uom_id: defaultUom._id,
      purchase_price: 10,
      sales_price: 20,
      tax_rate: 18,
      hsn_sac_code: '4819'
    }
  });
  assert.strictEqual(i18Res.status, 201);
  itemBoxes = i18Res.body.data;

  // Create Supplier
  const supRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/counterparties',
    headers: getHeaders(),
    body: {
      party_code: `VEN-${runId}`,
      legal_name: 'National Dairy Supplies',
      initial_role_type: 'SUPPLIER',
      tax_id: '27AABCV1234Z1Z9',
      address: { state: 'Maharashtra', city: 'Pune' }
    }
  });
  assert.strictEqual(supRes.status, 201);
  vendorParty = supRes.body.data;

  // Create Customer
  const custRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/counterparties',
    headers: getHeaders(),
    body: {
      party_code: `CUST-${runId}`,
      legal_name: 'Metro Corporate Cafe',
      initial_role_type: 'CUSTOMER',
      tax_id: '27AABCC9876Z1Z1',
      address: { state: 'Maharashtra', city: 'Mumbai' }
    }
  });
  assert.strictEqual(custRes.status, 201);
  customerParty = custRes.body.data;

  // Create draft invoice referencing 18% item without passing tax_rate
  const draftRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: getHeaders(),
    body: {
      document_type: 'PURCHASE_INVOICE',
      party_id: vendorParty._id,
      lines: [
        {
          stock_item_id: itemBoxes._id,
          quantity: 10,
          unit_price: 10
        }
      ]
    }
  });

  assert.strictEqual(draftRes.status, 201);
  const line = draftRes.body.data.lines[0];
  assert.strictEqual(String(line.tax_rate), '18.00', 'Should inherit 18% default from stock item master');
  assert.strictEqual(String(line.taxable_amount), '100.00');
  assert.strictEqual(String(line.cgst_amount), '9.00');
  assert.strictEqual(String(line.sgst_amount), '9.00');
  assert.strictEqual(String(draftRes.body.data.grand_total), '118.00');
});

test('5. Requirement 3: Tax override, mixed tax rates, and tax-inclusive extraction', async () => {
  // A. Mixed rates on same invoice + override
  const mixedRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: getHeaders(),
    body: {
      document_type: 'SALES_INVOICE',
      party_id: customerParty._id,
      lines: [
        // Line 1: Item 5% default (Qty 10 * 300 = 3000 taxable -> 5% = 150)
        {
          stock_item_id: itemCheese._id,
          quantity: 10,
          unit_price: 300
        },
        // Line 2: Item 18% overridden to 12% (Qty 100 * 20 = 2000 taxable -> 12% = 240)
        {
          stock_item_id: itemBoxes._id,
          quantity: 100,
          unit_price: 20,
          tax_rate: 12
        }
      ]
    }
  });

  assert.strictEqual(mixedRes.status, 201);
  const doc = mixedRes.body.data;
  assert.strictEqual(doc.lines.length, 2);
  assert.strictEqual(String(doc.lines[0].tax_rate), '5.00');
  assert.strictEqual(String(doc.lines[0].total_tax), '150.00');
  assert.strictEqual(String(doc.lines[1].tax_rate), '12.00');
  assert.strictEqual(String(doc.lines[1].total_tax), '240.00');
  assert.strictEqual(String(doc.total_taxable_amount), '5000.00');
  assert.strictEqual(String(doc.total_tax_amount), '390.00');
  assert.strictEqual(String(doc.grand_total), '5390.00');

  // B. Tax-Inclusive pricing extraction (₹105 inclusive @ 5% GST = ₹100 taxable + ₹5 GST)
  const incRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: getHeaders(),
    body: {
      document_type: 'SALES_INVOICE',
      party_id: customerParty._id,
      is_tax_inclusive: true,
      lines: [
        {
          stock_item_id: itemCheese._id,
          quantity: 2,
          unit_price: 105,
          tax_rate: 5
        }
      ]
    }
  });

  assert.strictEqual(incRes.status, 201);
  const incDoc = incRes.body.data;
  const incLine = incDoc.lines[0];
  assert.strictEqual(incLine.is_tax_inclusive, true);
  assert.strictEqual(String(incLine.taxable_amount), '200.00');
  assert.strictEqual(String(incLine.cgst_amount), '5.00');
  assert.strictEqual(String(incLine.sgst_amount), '5.00');
  assert.strictEqual(String(incLine.total_tax), '10.00');
  assert.strictEqual(String(incLine.total_amount), '210.00');
  assert.strictEqual(String(incDoc.grand_total), '210.00');
});

test('6. Requirement 3: Historical invoice tax snapshot preservation after product default changes', async () => {
  // 1. Create and post an invoice with itemCheese (5% tax)
  const draftRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: getHeaders(),
    body: {
      document_type: 'SALES_INVOICE',
      party_id: customerParty._id,
      lines: [
        {
          stock_item_id: itemCheese._id,
          quantity: 5,
          unit_price: 300 // Taxable: 1500, Tax: 75, Total: 1575
        }
      ]
    }
  });
  assert.strictEqual(draftRes.status, 201);
  const invoiceId = draftRes.body.data._id;

  // 2. Modify product master tax_rate from 5% to 28%
  const updateProductRes = await makeRequest({
    method: 'PATCH',
    path: `/api/v1/inventory/items/${itemCheese._id}`,
    headers: getHeaders(),
    body: { tax_rate: 28 }
  });
  assert.strictEqual(updateProductRes.status, 200);
  assert.strictEqual(Number(updateProductRes.body.data.tax_rate), 28);

  // 3. Fetch historical invoice and verify lines and totals remained preserved at 5%
  const fetchInvRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/commercial/documents/${invoiceId}`,
    headers: getHeaders()
  });
  assert.strictEqual(fetchInvRes.status, 200);
  const docObj = fetchInvRes.body.data.document || fetchInvRes.body.data;
  const histLine = docObj.lines[0];
  assert.strictEqual(String(histLine.tax_rate), '5.00', 'Historical line tax_rate must remain 5.00%');
  assert.strictEqual(String(histLine.taxable_amount), '1500.00');
  assert.strictEqual(String(histLine.total_tax), '75.00');
  assert.strictEqual(String(docObj.grand_total), '1575.00');
});

// =========================================================================
// REQUIREMENT 4: Complete Sales & Purchase Flows (GL, Stock, AR/AP, Returns)
// =========================================================================
test('7. Requirement 4: Purchase flow (Draft -> Post -> Stock Inward + GL -> Purchase Return)', async () => {
  // 1. Purchase Invoice
  const piDraft = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: getHeaders(),
    body: {
      document_type: 'PURCHASE_INVOICE',
      party_id: vendorParty._id,
      lines: [
        {
          stock_item_id: itemBoxes._id,
          quantity: 50,
          unit_price: 10,
          tax_rate: 18
        }
      ]
    }
  });
  assert.strictEqual(piDraft.status, 201);
  const piId = piDraft.body.data._id;

  // Post to GL
  const piPost = await makeRequest({
    method: 'POST',
    path: `/api/v1/commercial/documents/${piId}/post`,
    headers: getHeaders()
  });
  assert.strictEqual(piPost.status, 200);
  assert.strictEqual(piPost.body.data.document.status, 'POSTED');

  // Verify stock balance increased to 50
  const balRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/inventory/balances?stock_item_id=${itemBoxes._id}`,
    headers: getHeaders()
  });
  assert.strictEqual(balRes.status, 200);
  const bal = balRes.body.data.find(b => b.stock_item_id === itemBoxes._id || b.stock_item_id?._id === itemBoxes._id);
  assert.ok(bal, 'Stock balance should exist');
  assert.strictEqual(Number(bal.quantity_on_hand), 50);

  // Verify GL journals exist
  const journalsRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/journals',
    headers: getHeaders()
  });
  assert.strictEqual(journalsRes.status, 200);
  const postedJournals = journalsRes.body.data.journals || journalsRes.body.data;
  assert.ok(postedJournals.length > 0, 'GL journals must be created');

  // 2. Purchase Return (Debit Note) - Return 10 units
  const prDraft = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: getHeaders(),
    body: {
      document_type: 'PURCHASE_RETURN',
      party_id: vendorParty._id,
      lines: [
        {
          stock_item_id: itemBoxes._id,
          quantity: 10,
          unit_price: 10,
          tax_rate: 18
        }
      ]
    }
  });
  assert.strictEqual(prDraft.status, 201);
  const prId = prDraft.body.data._id;

  const prPost = await makeRequest({
    method: 'POST',
    path: `/api/v1/commercial/documents/${prId}/post`,
    headers: getHeaders()
  });
  assert.strictEqual(prPost.status, 200);

  // Stock should now be 40 (50 - 10)
  const balAfterReturn = await makeRequest({
    method: 'GET',
    path: `/api/v1/inventory/balances?stock_item_id=${itemBoxes._id}`,
    headers: getHeaders()
  });
  const bal2 = balAfterReturn.body.data.find(b => b.stock_item_id === itemBoxes._id || b.stock_item_id?._id === itemBoxes._id);
  assert.strictEqual(Number(bal2.quantity_on_hand), 40);
});

test('8. Requirement 4: Sales flow (Draft -> Post -> Stock Outward + GL -> Sales Return)', async () => {
  // 1. Sales Invoice for 15 units of itemBoxes (has 40 on hand)
  const siDraft = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: getHeaders(),
    body: {
      document_type: 'SALES_INVOICE',
      party_id: customerParty._id,
      lines: [
        {
          stock_item_id: itemBoxes._id,
          quantity: 15,
          unit_price: 25,
          tax_rate: 18
        }
      ]
    }
  });
  assert.strictEqual(siDraft.status, 201);
  const siId = siDraft.body.data._id;

  const siPost = await makeRequest({
    method: 'POST',
    path: `/api/v1/commercial/documents/${siId}/post`,
    headers: getHeaders()
  });
  assert.strictEqual(siPost.status, 200);

  // Stock should now be 25 (40 - 15)
  const balRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/inventory/balances?stock_item_id=${itemBoxes._id}`,
    headers: getHeaders()
  });
  const bal = balRes.body.data.find(b => b.stock_item_id === itemBoxes._id || b.stock_item_id?._id === itemBoxes._id);
  assert.strictEqual(Number(bal.quantity_on_hand), 25);

  // 2. Sales Return (5 units restocked)
  const srDraft = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    headers: getHeaders(),
    body: {
      document_type: 'SALES_RETURN',
      party_id: customerParty._id,
      lines: [
        {
          stock_item_id: itemBoxes._id,
          quantity: 5,
          unit_price: 25,
          tax_rate: 18,
          restockable: true
        }
      ]
    }
  });
  assert.strictEqual(srDraft.status, 201);
  const srId = srDraft.body.data._id;

  const srPost = await makeRequest({
    method: 'POST',
    path: `/api/v1/commercial/documents/${srId}/post`,
    headers: getHeaders()
  });
  assert.strictEqual(srPost.status, 200);

  // Stock should be restocked to 30 (25 + 5)
  const balRestocked = await makeRequest({
    method: 'GET',
    path: `/api/v1/inventory/balances?stock_item_id=${itemBoxes._id}`,
    headers: getHeaders()
  });
  const bal3 = balRestocked.body.data.find(b => b.stock_item_id === itemBoxes._id || b.stock_item_id?._id === itemBoxes._id);
  assert.strictEqual(Number(bal3.quantity_on_hand), 30);
});

// =========================================================================
// REQUIREMENT 5: Manufacturing BOM & Restaurant Recipe BOM Full Lifecycle
// =========================================================================
test('9. Requirement 5: Manufacturing BOM lifecycle and tenant isolation', async () => {
  // Create Finished Pizza Item
  const fgItem = await makeRequest({
    method: 'POST',
    path: '/api/v1/inventory/items',
    headers: getHeaders(),
    body: {
      item_code: `FG-PZ-${runId}`,
      sku: `SKU-FG-${runId}`,
      item_name: 'Margherita Master Pizza',
      base_uom_id: defaultUom._id,
      sales_price: 350,
      tax_rate: 5
    }
  });
  assert.strictEqual(fgItem.status, 201);
  finishedPizzaItem = fgItem.body.data;
  const fgId = finishedPizzaItem._id;

  // 1. Create BOM
  const bomCreate = await makeRequest({
    method: 'POST',
    path: '/api/v1/manufacturing/boms',
    headers: getHeaders(),
    body: {
      bom_number: `BOM_MARG_${runId}`,
      bom_name: 'Standard Margherita Formula',
      finished_item_id: fgId.toString(),
      output_quantity: 1,
      output_uom_id: defaultUom._id.toString(),
      raw_materials: [
        {
          item_id: itemCheese._id.toString(),
          quantity: 0.2,
          uom_id: defaultUom._id.toString(),
          scrap_percentage: 2
        }
      ],
      overhead_costs: [
        { cost_name: 'Baking Fuel & Power', cost_amount: 15 }
      ]
    }
  });
  assert.strictEqual(bomCreate.status, 201);
  const bomId = bomCreate.body.data._id;

  // 2. List BOMs
  const bomList = await makeRequest({
    method: 'GET',
    path: '/api/v1/manufacturing/boms',
    headers: getHeaders()
  });
  assert.strictEqual(bomList.status, 200);
  const foundBom = (bomList.body.data.boms || bomList.body.data).find(b => b._id === bomId);
  assert.ok(foundBom, 'Created BOM must appear in manufacturing BOM list');

  // 3. Detail
  const bomDetail = await makeRequest({
    method: 'GET',
    path: `/api/v1/manufacturing/boms/${bomId}`,
    headers: getHeaders()
  });
  assert.strictEqual(bomDetail.status, 200);
  assert.strictEqual(bomDetail.body.data.bom_name, 'Standard Margherita Formula');

  // 4. Update BOM
  const bomUpdate = await makeRequest({
    method: 'PUT',
    path: `/api/v1/manufacturing/boms/${bomId}`,
    headers: getHeaders(),
    body: {
      bom_name: 'Standard Margherita Formula v2',
      output_quantity: 1,
      output_uom_id: defaultUom._id.toString(),
      raw_materials: [
        {
          item_id: itemCheese._id.toString(),
          quantity: 0.25,
          uom_id: defaultUom._id.toString(),
          scrap_percentage: 0
        }
      ]
    }
  });
  assert.strictEqual(bomUpdate.status, 200);
  assert.strictEqual(bomUpdate.body.data.bom_name, 'Standard Margherita Formula v2');
  assert.strictEqual(bomUpdate.body.data.version, 2);

  // 5. Safe Archive BOM
  const bomArchive = await makeRequest({
    method: 'DELETE',
    path: `/api/v1/manufacturing/boms/${bomId}`,
    headers: getHeaders()
  });
  assert.strictEqual(bomArchive.status, 200);
  assert.strictEqual(bomArchive.body.data.bom.is_active, false);

  // 6. Tenant Isolation Check: Register other tenant
  const otherReg = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TEN_OTHER_${runId}`,
      tenant_name: `Other Tenant ${runId}`,
      admin_email: `other_${runId}@example.com`,
      admin_password: 'Password123!Safe',
      admin_first_name: 'Other',
      admin_last_name: 'Admin',
      tenant_type: 'MANUFACTURING',
      base_currency: 'INR'
    }
  });
  const otherToken = otherReg.body.data.token;
  const otherTenant = await Tenant.findOne({ tenant_code: `TEN_OTHER_${runId}` });

  const unauthorizedGet = await makeRequest({
    method: 'GET',
    path: `/api/v1/manufacturing/boms/${bomId}`,
    headers: {
      Authorization: `Bearer ${otherToken}`,
      'x-tenant-id': otherTenant._id.toString()
    }
  });
  assert.notStrictEqual(unauthorizedGet.status, 200, 'Other tenant must NOT be able to view BOM');
});

test('10. Requirement 5: Restaurant Recipe BOM Lifecycle (Create, List, Detail, Archive)', async () => {
  // 1. Create Recipe
  const recCreate = await makeRequest({
    method: 'POST',
    path: '/api/v1/restaurant/recipes',
    headers: getHeaders(),
    body: {
      menu_item_id: finishedPizzaItem._id.toString(),
      variant_name: 'STANDARD',
      yield_quantity: 1,
      ingredients: [
        {
          ingredient_item_id: itemCheese._id.toString(),
          quantity: 0.15,
          uom_id: defaultUom._id.toString(),
          waste_percentage: 3
        }
      ]
    }
  });
  assert.strictEqual(recCreate.status, 200);
  assert.strictEqual(recCreate.body.success, true);
  const recipeId = recCreate.body.data._id;

  // 2. List Recipes
  const recList = await makeRequest({
    method: 'GET',
    path: '/api/v1/restaurant/recipes',
    headers: getHeaders()
  });
  assert.strictEqual(recList.status, 200);
  const foundRec = recList.body.data.find(r => r._id === recipeId);
  assert.ok(foundRec, 'Restaurant recipe must appear in recipe list');

  // 3. Detail
  const recDetail = await makeRequest({
    method: 'GET',
    path: `/api/v1/restaurant/recipes/${finishedPizzaItem._id}`,
    headers: getHeaders()
  });
  assert.strictEqual(recDetail.status, 200);
  assert.strictEqual(recDetail.body.data.menu_item_id.item_name, 'Margherita Master Pizza');

  // 4. Archive Recipe
  const recArchive = await makeRequest({
    method: 'DELETE',
    path: `/api/v1/restaurant/recipes/${recipeId}`,
    headers: getHeaders()
  });
  assert.strictEqual(recArchive.status, 200);
  assert.strictEqual(recArchive.body.success, true);
  assert.strictEqual(recArchive.body.data.recipe.is_active, false);
});
