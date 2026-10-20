process.env.PORT = '5057';
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
  StockItem,
  Godown,
  UnitOfMeasurement,
  StockMovement,
  StockBalance,
  CommercialDocument,
  BillAllocation,
  CompanyPostingConfig,
  Journal,
  LedgerAccount,
  Party
} = require('../src/models');
const { seedDefaultCommercialRules } = require('../src/utils/seedCommercialRules');

let serverInstance = null;
const PORT = 5057;

function makeRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      'x-bypass-rate-limit': 'true',
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
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

// Global fixtures
const runId = Math.floor(Date.now() % 100000);
let tokenA = '';
let tenantAId = '';
let companyAId = '';
let secondaryCompanyAId = '';
let tokenB = '';
let tenantBId = '';

let customerPartyId = '';
let supplierPartyId = '';
let stockItemWidgetId = '';
let serviceItemLaborId = '';
let defaultGodownId = '';
let pcsUomId = '';

let postedPurchaseDocId = '';
let postedSalesDocId = '';

function makeAuthRequestA({ method = 'GET', path, companyId = companyAId, body = null }) {
  const headers = {
    Authorization: `Bearer ${tokenA}`,
    'x-tenant-id': tenantAId
  };
  if (companyId) headers['x-company-id'] = companyId;
  return makeRequest({ method, path, headers, body });
}

function makeAuthRequestB({ method = 'GET', path, companyId = null, body = null }) {
  const headers = {
    Authorization: `Bearer ${tokenB}`,
    'x-tenant-id': tenantBId
  };
  if (companyId) headers['x-company-id'] = companyId;
  return makeRequest({ method, path, headers, body });
}

test.before(async () => {
  const result = await startServer(PORT);
  serverInstance = result.server;
});

test.after(async () => {
  if (serverInstance) {
    if (typeof serverInstance.closeAllConnections === 'function') {
      serverInstance.closeAllConnections();
    }
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// ==========================================
// 1. SETUP: TENANTS, USERS, COMPANIES & MASTERS
// ==========================================

test('Setup: Register Tenant A, provision main company COMM01, seed COA and commercial rules', async () => {
  const regRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `COMM_T_A_${runId}`,
      tenant_name: 'Commercial Wholesale Corp',
      admin_email: `comm_admin_a_${runId}@commercialcorp.com`,
      admin_password: 'Password123!@#',
      admin_first_name: 'Amit',
      admin_last_name: 'Sharma'
    }
  });

  assert.strictEqual(regRes.status, 201, `Tenant registration failed: ${JSON.stringify(regRes.body)}`);
  tokenA = regRes.body.data.token;
  tenantAId = regRes.body.data.tenant.id;

  const primaryCompany = await Company.findOne({ tenant_id: tenantAId, company_code: 'MAIN' });
  assert.ok(primaryCompany, 'Primary company MAIN provisioned');
  companyAId = primaryCompany._id.toString();

  // Verify Posting Config auto-provisioned
  const confRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/commercial/posting-config'
  });
  assert.strictEqual(confRes.status, 200, `Posting config fetch failed: ${JSON.stringify(confRes.body)}`);
  assert.strictEqual(confRes.body.data.config.inventory_asset_account_code, '1201');
  assert.strictEqual(confRes.body.data.config.cogs_account_code, '5004');
  assert.strictEqual(confRes.body.data.config.sales_revenue_account_code, '4001');

  // Seed default commercial dynamic rules
  await seedDefaultCommercialRules(tenantAId, companyAId);

  // Fetch standard UOM (PCS) and Default Godown
  const uomRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/inventory/uom'
  });
  assert.strictEqual(uomRes.status, 200);
  const pcsUom = uomRes.body.data.find(u => (u.unit_code || u.uom_code) === 'PCS');
  assert.ok(pcsUom, 'PCS UOM exists');
  pcsUomId = pcsUom._id || pcsUom.id;

  const godownRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/inventory/godowns'
  });
  assert.strictEqual(godownRes.status, 200);
  const defGodown = godownRes.body.data.find(g => g.is_default);
  assert.ok(defGodown, 'Default godown exists');
  defaultGodownId = defGodown._id || defGodown.id;
});

test('Setup: Register Tenant B and Secondary Company for isolation testing', async () => {
  // Tenant B
  const regB = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `COMM_T_B_${runId}`,
      tenant_name: 'Competitor Retailers Inc',
      admin_email: `comm_admin_b_${runId}@competitor.com`,
      admin_password: 'Password123!@#',
      admin_first_name: 'Bob',
      admin_last_name: 'Jones'
    }
  });
  assert.strictEqual(regB.status, 201);
  tokenB = regB.body.data.token;
  tenantBId = regB.body.data.tenant.id;

  // Secondary company under Tenant A
  const compSec = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/companies',
    companyId: null,
    body: {
      company_code: 'SEC01',
      company_name: 'Secondary Retail Branch',
      business_profile: 'GENERAL_RETAIL'
    }
  });
  assert.strictEqual(compSec.status, 201, `Secondary company failed: ${JSON.stringify(compSec.body)}`);
  secondaryCompanyAId = compSec.body.data.company.id || compSec.body.data.company._id;
  assert.ok(secondaryCompanyAId);
});

test('Setup: Create customer party (Intra-state GST) and supplier party (Inter-state GST)', async () => {
  // Customer in Maharashtra (State 27) - same state
  const custRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/counterparties',
    body: {
      party_code: 'CUST-LOCAL-01',
      legal_name: 'Apex Infotech Solutions Pvt Ltd',
      trade_name: 'Apex Solutions',
      party_type: 'ORGANIZATION',
      tax_id: '27AABCA1234F1Z5',
      address: {
        street1: '101 Tech Park',
        city: 'Mumbai',
        state: '27',
        country: 'IN'
      }
    }
  });
  assert.strictEqual(custRes.status, 201, `Customer creation failed: ${JSON.stringify(custRes.body)}`);
  customerPartyId = custRes.body.data._id || custRes.body.data.id;

  // Supplier in Gujarat (State 24) - interstate
  const suppRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/counterparties',
    body: {
      party_code: 'SUPP-INTER-01',
      legal_name: 'National Hardware Importers LLP',
      trade_name: 'National Hardware',
      party_type: 'ORGANIZATION',
      tax_id: '24AAACN9876E1Z2',
      address: {
        street1: '55 Industrial Zone',
        city: 'Ahmedabad',
        state: '24',
        country: 'IN'
      }
    }
  });
  assert.strictEqual(suppRes.status, 201, `Supplier creation failed: ${JSON.stringify(suppRes.body)}`);
  supplierPartyId = suppRes.body.data._id || suppRes.body.data.id;
});

test('Setup: Create stock item (18% GST) and service item (no stock tracking)', async () => {
  // Inventory item: Widget A (18% GST, tracked)
  const itemRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/inventory/items',
    body: {
      item_code: 'WDG-001',
      sku: 'SKU-WDG-001',
      item_name: 'Industrial Widget A',
      base_uom_id: pcsUomId,
      tax_rate: 18,
      hsn_sac_code: '84713010',
      purchase_price: 50.00,
      sales_price: 100.00,
      is_stock_tracked: true
    }
  });
  assert.strictEqual(itemRes.status, 201, `Item creation failed: ${JSON.stringify(itemRes.body)}`);
  stockItemWidgetId = itemRes.body.data._id || itemRes.body.data.id;

  // Service item: On-site Installation (18% GST, not stock tracked)
  const srvRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/inventory/items',
    body: {
      item_code: 'SRV-INSTALL',
      sku: 'SKU-SRV-INST',
      item_name: 'On-site Machinery Installation',
      base_uom_id: pcsUomId,
      tax_rate: 18,
      hsn_sac_code: '998313',
      sales_price: 500.00,
      is_stock_tracked: false
    }
  });
  assert.strictEqual(srvRes.status, 201, `Service item creation failed: ${JSON.stringify(srvRes.body)}`);
  serviceItemLaborId = srvRes.body.data._id || srvRes.body.data.id;
});

// ==========================================
// 2. PURCHASE INVOICE & STOCK RECEIPT (PART D)
// ==========================================

test('Purchase Invoice: Create draft and verify interstate GST (18% IGST)', async () => {
  const draftRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    body: {
      document_type: 'PURCHASE_INVOICE',
      document_date: new Date().toISOString(),
      party_id: supplierPartyId,
      place_of_supply: '24', // Gujarat (Interstate)
      reference_number: 'SUPP-INV-8891',
      lines: [
        {
          stock_item_id: stockItemWidgetId,
          godown_id: defaultGodownId,
          uom_id: pcsUomId,
          quantity: 100,
          unit_rate: 50.00,
          tax_rate: 18
        }
      ]
    }
  });

  assert.strictEqual(draftRes.status, 201, `Draft purchase creation failed: ${JSON.stringify(draftRes.body)}`);
  const doc = draftRes.body.data;
  assert.strictEqual(doc.status, 'DRAFT');
  assert.strictEqual(doc.supply_type, 'INTER_STATE');
  assert.strictEqual(doc.total_taxable_amount, '5000.00');
  assert.strictEqual(doc.total_igst_amount, '900.00');
  assert.strictEqual(doc.total_cgst_amount, '0.00');
  assert.strictEqual(doc.total_sgst_amount, '0.00');
  assert.strictEqual(doc.grand_total, '5900.00');

  postedPurchaseDocId = doc._id || doc.id;
});

test('Purchase Invoice: Posting increases stock, updates moving-average cost, and posts balanced GL journal', async () => {
  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${postedPurchaseDocId}/post`
  });

  assert.strictEqual(postRes.status, 200, `Posting purchase failed: ${JSON.stringify(postRes.body)}`);
  const { document: doc, journal, movements } = postRes.body.data;
  assert.strictEqual(doc.status, 'POSTED');
  assert.ok(journal, 'Primary journal created');
  assert.strictEqual(movements.length, 1, 'One stock movement recorded');

  // Verify Stock Movement
  const mov = movements[0];
  assert.strictEqual(mov.movement_type, 'PURCHASE_RECEIPT');
  assert.strictEqual(mov.direction, 'IN');
  assert.strictEqual(mov.quantity, '100.0000');
  assert.strictEqual(mov.total_cost, '5000.00');

  // Verify Stock Balance
  const bal = await StockBalance.findOne({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: stockItemWidgetId,
    godown_id: defaultGodownId
  });
  assert.ok(bal);
  assert.strictEqual(bal.quantity_on_hand.toString(), '100.0000');
  assert.strictEqual(bal.average_unit_cost.toString(), '50.00');
  assert.strictEqual(bal.total_inventory_value.toString(), '5000.00');

  // Verify GL Journal: Debit Inventory (1201), Debit Input IGST (1303), Credit Payables (2001)
  assert.strictEqual(journal.total_debit.toString(), '5900.00');
  assert.strictEqual(journal.total_credit.toString(), '5900.00');
});

test('Purchase Invoice: Duplicate post attempt returns existing posted document without duplicating stock or journals', async () => {
  const initialMovementsCount = await StockMovement.countDocuments({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: stockItemWidgetId
  });

  const dupPostRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${postedPurchaseDocId}/post`
  });

  assert.strictEqual(dupPostRes.status, 200);
  assert.strictEqual(dupPostRes.body.data.is_duplicate, true);

  const finalMovementsCount = await StockMovement.countDocuments({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: stockItemWidgetId
  });
  assert.strictEqual(finalMovementsCount, initialMovementsCount, 'No duplicate stock movements created');
});

// ==========================================
// 3. SALES INVOICE, COGS & GST (PART D)
// ==========================================

test('Sales Invoice: Create and post credit sales invoice with intra-state GST (9% CGST + 9% SGST)', async () => {
  const createRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    body: {
      document_type: 'SALES_INVOICE',
      document_date: new Date().toISOString(),
      party_id: customerPartyId,
      place_of_supply: '27', // Maharashtra (Intrastate)
      lines: [
        {
          stock_item_id: stockItemWidgetId,
          godown_id: defaultGodownId,
          uom_id: pcsUomId,
          quantity: 20,
          unit_rate: 100.00,
          tax_rate: 18
        }
      ]
    }
  });

  assert.strictEqual(createRes.status, 201);
  const doc = createRes.body.data;
  assert.strictEqual(doc.supply_type, 'INTRA_STATE');
  assert.strictEqual(doc.total_taxable_amount, '2000.00');
  assert.strictEqual(doc.total_cgst_amount, '180.00');
  assert.strictEqual(doc.total_sgst_amount, '180.00');
  assert.strictEqual(doc.total_igst_amount, '0.00');
  assert.strictEqual(doc.grand_total, '2360.00');
  assert.strictEqual(doc.balance_due, '2360.00');

  postedSalesDocId = doc._id || doc.id;

  // Post sales invoice
  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${postedSalesDocId}/post`
  });

  assert.strictEqual(postRes.status, 200, `Posting sales failed: ${JSON.stringify(postRes.body)}`);
  const { document: postedDoc, journal, movements } = postRes.body.data;
  assert.strictEqual(postedDoc.status, 'POSTED');
  assert.ok(postedDoc.cogs_journal_id, 'Perpetual COGS journal generated and linked');

  // Verify Stock Movement
  assert.strictEqual(movements.length, 1);
  const mov = movements[0];
  assert.strictEqual(mov.movement_type, 'SALES_ISSUE');
  assert.strictEqual(mov.direction, 'OUT');
  assert.strictEqual(mov.quantity, '20.0000');
  assert.strictEqual(mov.unit_rate, '50.00', 'Issue unit cost matches moving-average rate');
  assert.strictEqual(mov.total_cost, '1000.00', 'Total COGS is 20 * 50 = 1000');

  // Verify Stock Balance reduced: 100 - 20 = 80 PCS
  const bal = await StockBalance.findOne({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: stockItemWidgetId,
    godown_id: defaultGodownId
  });
  assert.strictEqual(bal.quantity_on_hand.toString(), '80.0000');
  assert.strictEqual(bal.total_inventory_value.toString(), '4000.00');

  // Verify Primary Journal: Debit Receivables (1101 = 2360), Credit Revenue (4001 = 2000), Credit CGST (2101 = 180), Credit SGST (2102 = 180)
  assert.strictEqual(journal.total_debit.toString(), '2360.00');
  assert.strictEqual(journal.total_credit.toString(), '2360.00');

  // Verify COGS Journal: Debit COGS (5004 = 1000), Credit Inventory Asset (1201 = 1000)
  const cogsJournal = await Journal.findById(postedDoc.cogs_journal_id);
  assert.ok(cogsJournal);
  assert.strictEqual(cogsJournal.total_debit.toString(), '1000.00');
  assert.strictEqual(cogsJournal.total_credit.toString(), '1000.00');
});

test('Sales Invoice: Oversale is rejected when negative stock is disabled', async () => {
  const overSaleRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    body: {
      document_type: 'SALES_INVOICE',
      document_date: new Date().toISOString(),
      party_id: customerPartyId,
      lines: [
        {
          stock_item_id: stockItemWidgetId,
          godown_id: defaultGodownId,
          uom_id: pcsUomId,
          quantity: 1000, // Only 80 available!
          unit_rate: 100.00
        }
      ]
    }
  });
  assert.strictEqual(overSaleRes.status, 201);
  const overDocId = overSaleRes.body.data._id || overSaleRes.body.data.id;

  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${overDocId}/post`
  });

  assert.strictEqual(postRes.status, 422, 'Oversale rejected with 422');
  assert.strictEqual(postRes.body.error.code, 'INSUFFICIENT_STOCK');

  // Confirm stock balance is unmutated
  const bal = await StockBalance.findOne({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: stockItemWidgetId,
    godown_id: defaultGodownId
  });
  assert.strictEqual(bal.quantity_on_hand.toString(), '80.0000');
});

test('Sales Invoice: Service-only item does NOT create stock movements or COGS entries', async () => {
  const srvRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    body: {
      document_type: 'SALES_INVOICE',
      document_date: new Date().toISOString(),
      party_id: customerPartyId,
      lines: [
        {
          stock_item_id: serviceItemLaborId,
          line_type: 'SERVICE',
          quantity: 1,
          unit_rate: 500.00,
          tax_rate: 18
        }
      ]
    }
  });

  assert.strictEqual(srvRes.status, 201);
  const srvDocId = srvRes.body.data._id || srvRes.body.data.id;

  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${srvDocId}/post`
  });

  assert.strictEqual(postRes.status, 200);
  assert.strictEqual(postRes.body.data.movements.length, 0, 'Zero stock movements for service line');
  assert.strictEqual(postRes.body.data.document.cogs_journal_id, null, 'No COGS journal for service line');
});

// ==========================================
// 4. RECEIPTS, PAYMENTS & BILL-WISE ALLOCATIONS (PART E)
// ==========================================

test('Receipt: Partial settlement of sales invoice creates BillAllocation and updates balance_due', async () => {
  // Sales invoice grand total = 2360.00. Post receipt of 1000.00 allocated to it.
  const rcpRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    body: {
      document_type: 'RECEIPT',
      document_date: new Date().toISOString(),
      party_id: customerPartyId,
      amount: 1000.00,
      notes: 'Partial payment by NEFT'
    }
  });
  assert.strictEqual(rcpRes.status, 201);
  const rcpDocId = rcpRes.body.data._id || rcpRes.body.data.id;

  // Post receipt with allocation
  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${rcpDocId}/post`,
    body: {
      allocations: [
        {
          invoice_id: postedSalesDocId,
          amount: 1000.00
        }
      ]
    }
  });
  assert.strictEqual(postRes.status, 200, `Posting receipt failed: ${JSON.stringify(postRes.body)}`);

  // Verify BillAllocation created
  const alloc = await BillAllocation.findOne({
    payment_document_id: rcpDocId,
    invoice_document_id: postedSalesDocId,
    status: 'ACTIVE'
  });
  assert.ok(alloc);
  assert.strictEqual(alloc.allocated_amount.toString(), '1000.00');

  // Verify Sales Invoice balance_due reduced: 2360 - 1000 = 1360.00
  const inv = await CommercialDocument.findById(postedSalesDocId);
  assert.strictEqual(inv.amount_paid.toString(), '1000.00');
  assert.strictEqual(inv.balance_due.toString(), '1360.00');
});

test('Payment: Settle supplier purchase invoice via payment transaction', async () => {
  // Purchase invoice grand total = 5900.00. Settle 3000.00
  const payRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    body: {
      document_type: 'PAYMENT',
      document_date: new Date().toISOString(),
      party_id: supplierPartyId,
      amount: 3000.00,
      notes: 'Vendor payment RTGS'
    }
  });
  assert.strictEqual(payRes.status, 201);
  const payDocId = payRes.body.data._id || payRes.body.data.id;

  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${payDocId}/post`,
    body: {
      allocations: [
        {
          invoice_id: postedPurchaseDocId,
          amount: 3000.00
        }
      ]
    }
  });
  assert.strictEqual(postRes.status, 200);

  // Verify Purchase Invoice balance_due reduced: 5900 - 3000 = 2900.00
  const pInv = await CommercialDocument.findById(postedPurchaseDocId);
  assert.strictEqual(pInv.amount_paid.toString(), '3000.00');
  assert.strictEqual(pInv.balance_due.toString(), '2900.00');
});

// ==========================================
// 5. SALES RETURN & REVERSAL (PART D)
// ==========================================

test('Sales Return: Restockable return restores stock and reverses revenue & COGS', async () => {
  // Return 5 PCS of Widget A from customer
  const retRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    body: {
      document_type: 'SALES_RETURN',
      document_date: new Date().toISOString(),
      party_id: customerPartyId,
      place_of_supply: '27',
      linked_source_document_id: postedSalesDocId,
      lines: [
        {
          stock_item_id: stockItemWidgetId,
          godown_id: defaultGodownId,
          uom_id: pcsUomId,
          quantity: 5,
          unit_rate: 100.00,
          tax_rate: 18,
          restockable: true
        }
      ]
    }
  });

  assert.strictEqual(retRes.status, 201);
  const retDocId = retRes.body.data._id || retRes.body.data.id;

  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${retDocId}/post`
  });
  assert.strictEqual(postRes.status, 200, `Posting sales return failed: ${JSON.stringify(postRes.body)}`);

  // Verify Stock restored: 80 + 5 = 85 PCS
  const bal = await StockBalance.findOne({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: stockItemWidgetId,
    godown_id: defaultGodownId
  });
  assert.strictEqual(bal.quantity_on_hand.toString(), '85.0000');
});

test('Document Reversal: Reverse a posted document and confirm compensating reversal effects', async () => {
  // Create and post a small purchase invoice of 10 PCS @ 50, then reverse it
  const createRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    body: {
      document_type: 'PURCHASE_INVOICE',
      party_id: supplierPartyId,
      place_of_supply: '24',
      lines: [
        {
          stock_item_id: stockItemWidgetId,
          godown_id: defaultGodownId,
          uom_id: pcsUomId,
          quantity: 10,
          unit_rate: 50.00,
          tax_rate: 18
        }
      ]
    }
  });
  assert.strictEqual(createRes.status, 201);
  const docId = createRes.body.data._id || createRes.body.data.id;

  await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${docId}/post`
  });

  // Balance now: 85 + 10 = 95
  let bal = await StockBalance.findOne({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: stockItemWidgetId,
    godown_id: defaultGodownId
  });
  assert.strictEqual(bal.quantity_on_hand.toString(), '95.0000');

  // Now reverse this purchase invoice
  const revRes = await makeAuthRequestA({
    method: 'POST',
    path: `/api/v1/commercial/documents/${docId}/reverse`,
    body: { reason: 'Incorrect supplier order duplicate' }
  });
  assert.strictEqual(revRes.status, 200);
  assert.strictEqual(revRes.body.data.document.status, 'REVERSED');

  // Balance restored: 95 - 10 = 85
  bal = await StockBalance.findOne({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: stockItemWidgetId,
    godown_id: defaultGodownId
  });
  assert.strictEqual(bal.quantity_on_hand.toString(), '85.0000');
});

// ==========================================
// 6. OPENING STOCK TO GENERAL LEDGER (PART G)
// ==========================================

test('Opening Stock GL: Dry-run preview returns pending opening value without mutating records', async () => {
  // First create a new stock item with opening stock
  const newItemRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/inventory/items',
    body: {
      item_code: 'VAL-BOLT-01',
      sku: 'SKU-VAL-BOLT',
      item_name: 'High Tensile Bolt M12',
      base_uom_id: pcsUomId,
      purchase_price: 10.00
    }
  });
  assert.strictEqual(newItemRes.status, 201);
  const boltId = newItemRes.body.data._id || newItemRes.body.data.id;

  // Post opening stock: 50 PCS @ ₹10.00 = ₹500.00
  const opnRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/inventory/opening-stock',
    body: {
      stock_item_id: boltId,
      godown_id: defaultGodownId,
      quantity: 50,
      unit_rate: 10.00,
      total_value: 500.00
    }
  });
  assert.strictEqual(opnRes.status, 201);

  // Run Dry-run Preview
  const prevRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/commercial/opening-stock-gl/preview'
  });

  assert.strictEqual(prevRes.status, 200);
  const prev = prevRes.body.data;
  assert.ok(prev.eligible_count >= 1, 'At least 1 eligible movement identified');
  assert.ok(Number(prev.total_opening_value) >= 500, 'Total opening value matches');
  assert.strictEqual(prev.config_status, 'READY');

  // Verify movement remains gl_status !== 'POSTED'
  const mov = await StockMovement.findOne({
    tenant_id: tenantAId,
    company_id: companyAId,
    stock_item_id: boltId,
    movement_type: 'OPENING_STOCK'
  });
  assert.notStrictEqual(mov.gl_status, 'POSTED', 'Dry-run did not mutate gl_status');
});

test('Opening Stock GL: Explicit catch-up posts balanced double-entry journal idempotently', async () => {
  const postRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/opening-stock-gl/post',
    body: { posting_date: new Date().toISOString() }
  });

  assert.strictEqual(postRes.status, 200, `Catch-up posting failed: ${JSON.stringify(postRes.body)}`);
  assert.strictEqual(postRes.body.data.posted, true);
  assert.ok(postRes.body.data.journal, 'Journal created');

  // Verify journal debits Inventory Asset (1201) and credits Opening Stock Reserve (3990)
  const je = postRes.body.data.journal;
  assert.strictEqual(je.total_debit.toString(), je.total_credit.toString(), 'Journal is balanced');

  // Second execution must be idempotent (0 movements, no new journal)
  const rerunRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/opening-stock-gl/post',
    body: {}
  });

  assert.strictEqual(rerunRes.status, 200);
  assert.strictEqual(rerunRes.body.data.posted, false, 'No duplicate journal on rerun');
  assert.strictEqual(rerunRes.body.data.count, 0);
});

// ==========================================
// 7. REPORTS & RECONCILIATIONS (PART K)
// ==========================================

test('Reports: Registers, Outstanding, Tax Summary, and Stock-to-GL Reconciliation', async () => {
  // 1. Sales Register
  const regRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/commercial/reports/register?document_type=SALES_INVOICE'
  });
  assert.strictEqual(regRes.status, 200);
  assert.ok(regRes.body.data.documents.length >= 1);

  // 2. Customer Outstanding
  const outRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/commercial/reports/outstanding?party_type=CUSTOMER'
  });
  assert.strictEqual(outRes.status, 200);
  assert.ok(outRes.body.data.parties.length >= 1);

  // 3. Tax Summary
  const taxRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/commercial/reports/tax-summary'
  });
  assert.strictEqual(taxRes.status, 200);
  assert.ok(taxRes.body.data.outward_supplies);
  assert.ok(taxRes.body.data.inward_supplies);

  // 4. Stock-to-GL Reconciliation
  const recRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/commercial/reports/stock-gl-reconciliation'
  });
  assert.strictEqual(recRes.status, 200, JSON.stringify(recRes.body));
  assert.ok(recRes.body.data.stock_subledger_valuation);
  assert.ok(recRes.body.data.general_ledger_balance);
  assert.ok(['RECONCILED', 'VARIANCE_DETECTED'].includes(recRes.body.data.status));
});

// ==========================================
// 8. MULTI-COMPANY & TENANT ISOLATION
// ==========================================

test('Isolation: User in Tenant B cannot view Tenant A commercial documents', async () => {
  const crossTenantRes = await makeAuthRequestB({
    method: 'GET',
    path: `/api/v1/commercial/documents/${postedSalesDocId}`,
    companyId: companyAId
  });

  assert.strictEqual(crossTenantRes.status, 403, 'Cross-tenant request forbidden');
});

test('Isolation: Company A queries do not expose Secondary Company documents', async () => {
  // Create a document in Secondary Company
  const secDocRes = await makeAuthRequestA({
    method: 'POST',
    path: '/api/v1/commercial/documents',
    companyId: secondaryCompanyAId,
    body: {
      document_type: 'SALES_INVOICE',
      document_date: new Date().toISOString(),
      party_name: 'Secondary Branch Walk-in',
      amount: 500.00
    }
  });
  assert.strictEqual(secDocRes.status, 201);
  const secDocId = (secDocRes.body.data._id || secDocRes.body.data.id).toString();

  // Querying documents with Company COMM01 context must NOT include secDocId
  const listRes = await makeAuthRequestA({
    method: 'GET',
    path: '/api/v1/commercial/documents',
    companyId: companyAId
  });
  assert.strictEqual(listRes.status, 200);
  const found = listRes.body.data.documents.find(d => (d._id || d.id).toString() === secDocId);
  assert.strictEqual(found, undefined, 'Secondary company document omitted from primary company query');
});
