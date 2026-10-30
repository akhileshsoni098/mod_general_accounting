process.env.PORT = '5064';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');

const { startServer } = require('../src/server');
const {
  Tenant,
  Company,
  Journal,
  JournalEntry,
  LedgerAccount,
  CommercialDocument,
  Party,
  StockItem,
  UnitOfMeasurement,
  PriceList,
  FixedAsset,
  JobWorkOrder,
  Employee,
  SalaryStructure,
  PayrollRun,
  BudgetDefinition,
  TdsSection,
  TdsDeduction,
  ChequeLayout,
  ChequeRegister
} = require('../src/models');
const { postJournalEntry } = require('../src/services/journalPostingService');

let serverInstance = null;
const PORT = 5064;

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

const runId = Date.now();
let authToken = '';
let tenantId = '';
let companyId = '';
let uomId = '';
let stockItemId = '';
let customerPartyId = '';
let vendorPartyId = '';

test.before(async () => {
  const result = await startServer(PORT);
  serverInstance = result.server;
});

test('1. Setup: Start Server, Register Tenant & Company with All Extended Modules', async (t) => {
  const regRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/auth/register-tenant',
    body: {
      tenant_code: `TNT_${runId}`,
      tenant_name: `Extended ERP Enterprise ${runId}`,
      admin_email: `admin_ext_${runId}@veridexerp.com`,
      admin_password: 'Password123!',
      admin_first_name: 'Rahul',
      admin_last_name: 'Soni'
    }
  });

  assert.strictEqual(regRes.status, 201, `Tenant registration failed: ${JSON.stringify(regRes.body)}`);
  authToken = regRes.body.data.token;
  tenantId = regRes.body.data.tenant.id;

  // Create Company with all modules enabled
  const allModules = [
    'GL',
    'BANKING_CASH',
    'PARTIES',
    'REPORTS',
    'INVENTORY',
    'COMMERCIAL_BILLING',
    'GST_TAX',
    'PAYROLL',
    'FIXED_ASSETS',
    'BUDGETS',
    'JOB_WORK',
    'PRICING_LANDED_COST',
    'INTEREST_CALCULATION',
    'CHEQUE_PRINTING',
    'STATUTORY_TDS'
  ];

  const compRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/companies',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId
    },
    body: {
      company_code: `CMP${String(runId).slice(-4)}`,
      company_name: 'Pizza Palace Enterprises',
      legal_name: 'Pizza Palace Private Limited',
      business_profile: 'GENERAL_RETAIL',
      base_currency: 'INR',
      fiscal_year_start_month: 4,
      enabled_modules: allModules
    }
  });

  assert.strictEqual(compRes.status, 201, `Company creation failed: ${JSON.stringify(compRes.body)}`);
  companyId = compRes.body.data.company.id;

  // Seed UOM and Stock Item
  const uom = await UnitOfMeasurement.create({
    tenant_id: tenantId,
    company_id: companyId,
    unit_code: `NOS_${String(runId).slice(-4)}`,
    unit_name: 'Numbers',
    unit_type: 'COUNT'
  });
  uomId = uom._id;

  const item = await StockItem.create({
    tenant_id: tenantId,
    company_id: companyId,
    item_code: `ITM_${String(runId).slice(-4)}`,
    sku: `SKU_${String(runId).slice(-4)}`,
    item_name: 'Gourmet Cheese Pizza 12 inch',
    base_uom_id: uomId,
    sales_price: mongoose.Types.Decimal128.fromString('400.00'),
    purchase_price: mongoose.Types.Decimal128.fromString('180.00'),
    standard_cost: 180,
    standard_selling_price: 400
  });
  stockItemId = item._id;

  // Create Customer & Vendor Parties
  const cust = await Party.create({
    tenant_id: tenantId,
    company_id: companyId,
    party_code: `CUST_${String(runId).slice(-4)}`,
    legal_name: 'TechPark Corporate Cafeteria',
    party_type: 'ORGANIZATION',
    price_level: 'WHOLESALE',
    tax_id: '07AAAAA0000A1Z5'
  });
  customerPartyId = cust._id;

  const vend = await Party.create({
    tenant_id: tenantId,
    company_id: companyId,
    party_code: `VEND_${String(runId).slice(-4)}`,
    legal_name: 'Dairy Fresh Ingredients Ltd',
    party_type: 'ORGANIZATION',
    tax_id: '07BBBBB1111B1Z2',
    msme_registered: true,
    msme_category: 'MICRO'
  });
  vendorPartyId = vend._id;

  assert.ok(stockItemId && customerPartyId && vendorPartyId, 'Prerequisites initialized');
});

test('2. Memorandum & Optional Vouchers: Non-Posting Balance Isolation and Atomic Conversion', async (t) => {
  const bankAcc = await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_code: '1110' });
  const capAcc = await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_code: '3001' });
  assert.ok(bankAcc && capAcc, 'Accounts 1110 and 3001 must exist');

  const initialBankBal = Number(bankAcc.current_balance ? bankAcc.current_balance.toString() : 0);

  // 1. Post a MEMORANDUM voucher (e.g. ₹50,000 memo)
  const memoRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/gl/journals',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      voucher_type: 'MEMORANDUM',
      memo: 'Memorandum reminder for future investor capital call',
      lines: [
        { account_code: '1110', debit: 50000, credit: 0 },
        { account_code: '3001', debit: 0, credit: 50000 }
      ]
    }
  });

  assert.strictEqual(memoRes.status, 201, 'Memorandum voucher creation failed');
  const memoJournal = memoRes.body.data.journal;
  assert.strictEqual(memoJournal.status, 'MEMORANDUM', 'Voucher status should be MEMORANDUM');
  assert.strictEqual(memoJournal.is_memorandum, true, 'is_memorandum flag should be true');

  // Verify that account current_balance was NOT modified
  const reloadedBankAcc = await LedgerAccount.findById(bankAcc._id);
  const reloadedBankBal = Number(reloadedBankAcc.current_balance ? reloadedBankAcc.current_balance.toString() : 0);
  assert.strictEqual(reloadedBankBal, initialBankBal, 'Bank account balance must NOT be modified by memorandum voucher');

  // Verify that Trial Balance period activity excludes memorandum voucher
  const tbRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/trial-balance',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });
  assert.strictEqual(tbRes.status, 200);
  const bankTbLine = tbRes.body.data.accounts.find(a => a.account_code === '1110');
  assert.strictEqual(Number(bankTbLine?.period_debit || 0), 0, 'Trial balance period activity must not include memorandum entries');

  // 2. Convert memorandum voucher to POSTED
  const convertRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/gl/journals/${memoJournal._id}/convert`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });

  assert.strictEqual(convertRes.status, 200, `Conversion failed: ${JSON.stringify(convertRes.body)}`);
  assert.strictEqual(convertRes.body.data.journal.status, 'POSTED', 'Voucher status must become POSTED');

  // Verify account balance IS NOW updated
  const updatedBankAcc = await LedgerAccount.findById(bankAcc._id);
  const updatedBankBal = Number(updatedBankAcc.current_balance ? updatedBankAcc.current_balance.toString() : 0);
  assert.strictEqual(updatedBankBal, initialBankBal + 50000, 'Bank balance must now reflect converted 50,000 debit');
});

test('3. Pricing Levels & Landed Cost Allocation: Multi-Tier Pricing and Freight Absorption', async (t) => {
  // 1. Create a Price List rule for WHOLESALE tier: Rate 350 (standard 400), with 10% discount for min_quantity 10
  const { upsertPriceListTier, resolveItemPrice } = require('../src/services/pricingAndLandedCostService');
  await upsertPriceListTier({
    tenantId,
    companyId,
    priceLevelName: 'WHOLESALE',
    stockItemId: stockItemId,
    rate: 350.00,
    discountPercent: 10,
    minQuantity: 10
  });

  // Test resolution: quantity 5 (does not reach 10 min_qty tier) -> falls back to 400
  const priceRes5 = await resolveItemPrice({
    tenantId,
    companyId,
    priceLevelName: 'WHOLESALE',
    stockItemId: stockItemId,
    quantity: 5
  });
  assert.strictEqual(priceRes5.source, 'FALLBACK_STANDARD', 'Should fallback when quantity < min_quantity');

  // Test resolution: quantity 20 -> resolves wholesale rate with 10% discount: 350 * 0.9 = 315.00
  const priceRes20 = await resolveItemPrice({
    tenantId,
    companyId,
    priceLevelName: 'WHOLESALE',
    stockItemId: stockItemId,
    quantity: 20
  });
  assert.strictEqual(priceRes20.source, 'PRICE_LEVEL', 'Should match price list tier');
  assert.strictEqual(priceRes20.final_rate, '315.00', 'Final rate must be 315.00');

  // 2. Test Landed Cost Allocation
  // Create a purchase bill with 2 item lines
  const purchaseDoc = await CommercialDocument.create({
    tenant_id: tenantId,
    company_id: companyId,
    document_type: 'PURCHASE_INVOICE',
    document_number: `PINV-${runId}`,
    party_id: vendorPartyId,
    idempotency_key: `ik_pinv_${runId}`,
    issue_date: new Date(),
    currency: 'INR',
    grand_total: mongoose.Types.Decimal128.fromString('10000.00'),
    balance_due: mongoose.Types.Decimal128.fromString('10000.00'),
    status: 'POSTED',
    lines: [
      {
        line_number: 1,
        stock_item_id: stockItemId,
        item_code: 'ITM-CHZ',
        description: 'Mozzarella Cheese 50kg',
        quantity: 50,
        unit_rate: mongoose.Types.Decimal128.fromString('120.00'), // 6,000 value
        taxable_amount: mongoose.Types.Decimal128.fromString('6000.00'),
        total_amount: mongoose.Types.Decimal128.fromString('6000.00')
      },
      {
        line_number: 2,
        stock_item_id: stockItemId,
        item_code: 'ITM-FLR',
        description: 'Italian Flour 100kg',
        quantity: 100,
        unit_rate: mongoose.Types.Decimal128.fromString('40.00'), // 4,000 value
        taxable_amount: mongoose.Types.Decimal128.fromString('4000.00'),
        total_amount: mongoose.Types.Decimal128.fromString('4000.00')
      }
    ]
  });

  const invAcc = await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_code: '1201' });
  const expAcc = await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_code: '5003' });

  // Allocate 1,000 INR freight cost based on VALUE (Cheese gets 60% = 600, Flour gets 40% = 400)
  const landedRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/landed-cost',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      purchase_document_id: purchaseDoc._id,
      expense_ledger_account_id: expAcc._id,
      inventory_ledger_account_id: invAcc._id,
      total_additional_cost: 1000.00,
      allocation_basis: 'VALUE',
      charge_type: 'FREIGHT',
      notes: 'Truck freight charge'
    }
  });

  assert.strictEqual(landedRes.status, 201, `Landed cost allocation failed: ${JSON.stringify(landedRes.body)}`);
  const alloc = landedRes.body.data.allocation;
  assert.strictEqual(alloc.lines.length, 2, 'Allocated across 2 purchase lines');
  assert.strictEqual(alloc.lines[0].allocated_cost, '600.00', '6,000 / 10,000 * 1000 = 600.00');
  assert.strictEqual(alloc.lines[1].allocated_cost, '400.00', '4,000 / 10,000 * 1000 = 400.00');
  assert.ok(landedRes.body.data.journal, 'Balanced inventory capitalization journal created');

  // Attempt duplicate allocation of the exact same freight charge without allow_duplicate flag
  const dupRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/landed-cost',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      purchase_document_id: purchaseDoc._id,
      expense_ledger_account_id: expAcc._id,
      inventory_ledger_account_id: invAcc._id,
      total_additional_cost: 1000.00,
      allocation_basis: 'VALUE',
      charge_type: 'FREIGHT',
      notes: 'Truck freight charge'
    }
  });

  assert.strictEqual(dupRes.status, 400, 'Duplicate landed cost allocation must be rejected with 400');
  const errMsg = typeof dupRes.body.error === 'object' ? dupRes.body.error?.message : dupRes.body.error;
  assert.match(errMsg, /Duplicate landed cost allocation prevented/i, 'Error message must confirm duplicate prevention');
});

test('4. Overdue Interest Calculation & Interest Debit Note Posting', async (t) => {
  // Create an overdue sales invoice: Balance 20,000, due 60 days ago
  const overdueDueDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const overdueInvoice = await CommercialDocument.create({
    tenant_id: tenantId,
    company_id: companyId,
    document_type: 'SALES_INVOICE',
    document_number: `INV-OD-${runId}`,
    party_id: customerPartyId,
    idempotency_key: `ik_inv_od_${runId}`,
    issue_date: overdueDueDate,
    due_date: overdueDueDate,
    currency: 'INR',
    grand_total: mongoose.Types.Decimal128.fromString('20000.00'),
    balance_due: mongoose.Types.Decimal128.fromString('20000.00'),
    status: 'POSTED'
  });

  // Calculate overdue interest via endpoint
  const calcRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/commercial/interest/calculate?party_id=${customerPartyId}&document_type=SALES_INVOICE`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });

  assert.strictEqual(calcRes.status, 200, 'Interest calculation query failed');
  const calcData = calcRes.body.data;
  assert.ok(calcData.items.length >= 1, 'Should find at least 1 overdue invoice');
  assert.ok(Number(calcData.total_interest_accrued) > 0, 'Interest must be accrued on overdue bill');

  // Post Interest Debit Note for ₹591.78
  const postIdnRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/commercial/interest/post-debit-note',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      invoice_id: overdueInvoice._id,
      interest_amount: 591.78,
      notes: '18% p.a. overdue interest for 60 days'
    }
  });

  assert.strictEqual(postIdnRes.status, 201, `Interest debit note failed: ${JSON.stringify(postIdnRes.body)}`);
  assert.ok(postIdnRes.body.data.journal, 'Double-entry journal generated for interest debit note');
});

test('5. Job Work Order & Receipt Reconciliation with Processing Charges', async (t) => {
  const jwRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/job-work/orders',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      order_type: 'OUTWARD',
      party_id: vendorPartyId,
      raw_materials_issued: [
        { stock_item_id: stockItemId, item_name: 'Raw Dough Balls', quantity: 200, uom: 'PCS' }
      ],
      finished_goods_expected: [
        { stock_item_id: stockItemId, item_name: 'Baked Pizza Crusts', quantity_expected: 190, scrap_expected: 10 }
      ],
      notes: 'Subcontractor baking batch'
    }
  });

  assert.strictEqual(jwRes.status, 201, 'Job work order creation failed');
  const order = jwRes.body.data;
  assert.strictEqual(order.status, 'ISSUED');

  // Record receipt with processing charges of ₹1,500
  const receiptRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/job-work/orders/${order._id}/receipt`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      quantity_received: 190,
      scrap_quantity_received: 10,
      processing_charges: 1500.00,
      deliveryChallanNumber: 'DC-BAKE-992'
    }
  });

  assert.strictEqual(receiptRes.status, 200, `Receipt recording failed: ${JSON.stringify(receiptRes.body)}`);
  assert.strictEqual(receiptRes.body.data.order.status, 'COMPLETED', 'Order status should be COMPLETED');
  assert.ok(receiptRes.body.data.journal, 'Job work charges journal must be posted');
});

test('6. Fixed Asset Register, Monthly Depreciation & Disposal Accounting', async (t) => {
  // 1. Capitalize Commercial Oven ₹1,00,000, 60 months life
  const capRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/fixed-assets/capitalize',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      asset_code: `AST-OVEN-${String(runId).slice(-4)}`,
      asset_name: 'Commercial Conveyor Pizza Oven',
      category: 'EQUIPMENT',
      acquisition_cost: 100000.00,
      salvage_value: 10000.00,
      useful_life_months: 60,
      depreciation_method: 'SLM',
      asset_account_code: '1410',
      accumulated_depreciation_account_code: '1490',
      depreciation_expense_account_code: '5000'
    }
  });

  assert.strictEqual(capRes.status, 201, `Asset capitalization failed: ${JSON.stringify(capRes.body)}`);
  const asset = capRes.body.data;
  assert.strictEqual(asset.current_book_value, '100000.00');

  // 2. Run monthly depreciation: (100,000 - 10,000) / 60 = 1,500.00 / month
  const deprRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/fixed-assets/${asset._id}/depreciate`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      period_name: '2026-10'
    }
  });

  assert.strictEqual(deprRes.status, 200, `Depreciation run failed: ${JSON.stringify(deprRes.body)}`);
  assert.strictEqual(deprRes.body.data.depreciation_amount, '1500.00', 'Monthly depreciation must be 1,500.00');
  assert.strictEqual(deprRes.body.data.book_value_after, '98500.00', 'Book value after depreciation must be 98,500.00');

  // 3. Dispose asset for ₹99,000 proceeds (Book Value 98,500 -> Gain of ₹500)
  const dispRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/fixed-assets/${asset._id}/dispose`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      sale_proceeds: 99000.00,
      proceeds_account_code: '1110',
      gain_loss_account_code: '5900',
      notes: 'Sold old oven to franchisee'
    }
  });

  assert.strictEqual(dispRes.status, 200, `Asset disposal failed: ${JSON.stringify(dispRes.body)}`);
  assert.strictEqual(dispRes.body.data.gain_or_loss, '500.00', 'Disposal gain must be 500.00');
  assert.strictEqual(dispRes.body.data.is_gain, true, 'is_gain must be true');
});

test('7. Cheque Printing: Words Conversion, Millimetric Layout & Duplicate Prevention', async (t) => {
  const bankAcc = await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_code: '1110' });
  const { numberToIndianWords } = require('../src/services/chequePrintingService');

  // Test Indian numbers to words conversion
  assert.strictEqual(
    numberToIndianWords(150420.50),
    'One Lakh Fifty Thousand Four Hundred Twenty Rupees and Fifty Paise Only'
  );

  // Issue cheque #000101 for ₹75,000
  const chqRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/cheques/issue-and-print',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      bank_account_id: bankAcc._id,
      cheque_number: '000101',
      payee_name: 'Dairy Fresh Ingredients Ltd',
      amount: 75000.00
    }
  });

  assert.strictEqual(chqRes.status, 201, `Cheque issuance failed: ${JSON.stringify(chqRes.body)}`);
  assert.ok(chqRes.body.data.printable_html.includes('Seventy Five Thousand Rupees Only'));
  assert.ok(chqRes.body.data.printable_html.includes('000101'));

  // Test Duplicate cheque rejection on same bank account
  const dupChqRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/cheques/issue-and-print',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      bank_account_id: bankAcc._id,
      cheque_number: '000101',
      payee_name: 'Another Vendor',
      amount: 10000.00
    }
  });

  assert.strictEqual(dupChqRes.status, 400, 'Duplicate cheque number must be rejected');
});

test('8. Statutory TDS, Form 26Q Export & Section 43B(h) MSME Aging', async (t) => {
  // 1. Record TDS deduction under Section 194C on ₹1,00,000 contractor bill (Company rate 2% = ₹2,000 TDS)
  const tdsRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/statutory/deductions',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      deductee_party_id: vendorPartyId,
      section_code: '194C',
      gross_amount: 100000.00,
      financial_year: '2026-2027',
      quarter: 'Q3'
    }
  });

  assert.strictEqual(tdsRes.status, 201, `TDS deduction recording failed: ${JSON.stringify(tdsRes.body)}`);
  assert.strictEqual(tdsRes.body.data.tds_amount, '2000.00', 'TDS at 2% on 100,000 must be 2,000.00');
  assert.strictEqual(tdsRes.body.data.net_payable_amount, '98000.00', 'Net payable must be 98,000.00');

  // 2. Query Form 26Q return export
  const f26qRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/statutory/form26q?financial_year=2026-2027&quarter=Q3',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });

  assert.strictEqual(f26qRes.status, 200);
  assert.strictEqual(f26qRes.body.data.form_type, '26Q');
  assert.ok(f26qRes.body.data.records.length >= 1, 'Form 26Q records must include deduction');

  // 3. Query MSME Section 43B(h) Aging Report
  const msmeRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/statutory/msme-aging',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });

  assert.strictEqual(msmeRes.status, 200);
  assert.ok(msmeRes.body.data.summary, 'MSME summary must be present');

  // 4. Test Statutory Mock E-Invoice IRN & QR Generation with Sandbox Disclaimer
  const mockInvoice = await CommercialDocument.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    document_type: 'SALES_INVOICE'
  });

  if (mockInvoice) {
    const eInvRes = await makeRequest({
      method: 'GET',
      path: `/api/v1/commercial/documents/${mockInvoice._id}/einvoice`,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-tenant-id': tenantId,
        'x-company-id': companyId
      }
    });

    assert.strictEqual(eInvRes.status, 200);
    assert.strictEqual(eInvRes.body.data.status, 'SANDBOX_SIMULATED');
    assert.strictEqual(eInvRes.body.data.is_mock, true);
    assert.strictEqual(eInvRes.body.data.sandbox, true);
    assert.ok(eInvRes.body.data.irn, 'IRN hash must be generated');
    assert.ok(eInvRes.body.data.disclaimer.includes('BLOCKED — EXTERNAL DEPENDENCY'), 'Must contain explicit blocked disclaimer');
  }
});

test('9. 3-Tier Cash Flow Statement & Financial Ratios Analysis', async (t) => {
  // Query 3-Tier Cash Flow Statement
  const cfRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/reports/cash-flow',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });

  assert.strictEqual(cfRes.status, 200, `Cash flow report failed: ${JSON.stringify(cfRes.body)}`);
  const cf = cfRes.body.data;
  assert.ok(cf.operating_activities, 'Operating activities tier must be defined');
  assert.ok(cf.investing_activities, 'Investing activities tier must be defined');
  assert.ok(cf.financing_activities, 'Financing activities tier must be defined');
  assert.ok(cf.summary.closing_cash_and_bank_equivalents !== undefined);

  // Query Financial Ratios
  const ratioRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/gl/reports/financial-ratios',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });

  assert.strictEqual(ratioRes.status, 200, `Financial ratios report failed: ${JSON.stringify(ratioRes.body)}`);
  const ratios = ratioRes.body.data;
  assert.ok(ratios.liquidity.current_ratio !== undefined, 'Current ratio must be present');
  assert.ok(ratios.profitability.gross_profit_margin !== undefined, 'Gross profit margin must be present');
  assert.ok(ratios.efficiency.debtor_days !== undefined, 'Debtor days must be present');
});

test('10. Budgeting & Actual Variance Analysis Report', async (t) => {
  const expAcc = await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_code: '5000' });

  // Save budget definition: ₹1,20,000 annual budget for General Expense
  const bgtRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/budgets',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      budget_name: `Annual Ops Budget ${runId}`,
      fiscal_year: '2026',
      lines: [
        {
          ledger_account_id: expAcc._id,
          annual_budget_amount: 120000.00,
          monthly_breakdown: [
            { month: 10, amount: 10000.00 }
          ]
        }
      ]
    }
  });

  assert.strictEqual(bgtRes.status, 201, `Budget saving failed: ${JSON.stringify(bgtRes.body)}`);
  const budget = bgtRes.body.data;

  // Query Budget vs Actual Variance
  const varRes = await makeRequest({
    method: 'GET',
    path: `/api/v1/budgets/${budget._id}/variance`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });

  assert.strictEqual(varRes.status, 200, `Variance calculation failed: ${JSON.stringify(varRes.body)}`);
  const varReport = varRes.body.data;
  assert.strictEqual(varReport.total_budgeted, '120000.00');
  assert.ok(varReport.lines.length >= 1);
  assert.ok(['FAVORABLE', 'UNFAVORABLE'].includes(varReport.lines[0].classification));
});

test('11. Payroll & Employee Accounting: Preview, Double-Entry Salary Journal, and Payout', async (t) => {
  // 1. Create Salary Structure (Basic 30000, HRA 10000, Conveyance 5000)
  const structRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/payroll/structures',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      structure_name: `Head Chef Package ${runId}`,
      basic_pay: 30000.00,
      hra: 10000.00,
      conveyance: 5000.00,
      special_allowance: 5000.00,
      epf_employee_percent: 12.0,
      professional_tax_monthly: 200
    }
  });

  assert.strictEqual(structRes.status, 201, 'Salary structure creation failed');
  const struct = structRes.body.data;

  // 2. Create Employee
  const empRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/payroll/employees',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      employee_code: `EMP-CHEF-${String(runId).slice(-4)}`,
      full_name: 'Vikas Khanna',
      designation: 'Executive Chef',
      department: 'KITCHEN',
      salary_structure_id: struct._id
    }
  });

  assert.strictEqual(empRes.status, 201, 'Employee creation failed');

  // 3. Preview payroll for 2026-10:
  // Gross: 30000 + 10000 + 5000 + 5000 = 50,000
  // EPF: 12% of 30000 = 3,600
  // PT: 200
  // Net: 50,000 - 3,800 = 46,200
  const prevRes = await makeRequest({
    method: 'GET',
    path: '/api/v1/payroll/preview?month_year=2026-10',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    }
  });

  assert.strictEqual(prevRes.status, 200, `Preview failed: ${JSON.stringify(prevRes.body)}`);
  assert.strictEqual(prevRes.body.data.total_gross_pay, '50000.00');
  assert.strictEqual(prevRes.body.data.total_epf, '3600.00');
  assert.strictEqual(prevRes.body.data.total_pt, '200.00');
  assert.strictEqual(prevRes.body.data.total_net_pay, '46200.00');

  // 4. Post Monthly Payroll Journal
  const postPayRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/payroll/post',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      month_year: '2026-10'
    }
  });

  assert.strictEqual(postPayRes.status, 201, `Payroll posting failed: ${JSON.stringify(postPayRes.body)}`);
  const payrollRun = postPayRes.body.data.payrollRun;
  assert.ok(postPayRes.body.data.journal, 'Double-entry salary journal must be created');

  // 5. Disburse Salaries from Bank Account (Clearing Net Salaries Payable)
  const disbRes = await makeRequest({
    method: 'POST',
    path: `/api/v1/payroll/runs/${payrollRun._id}/disburse`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'x-company-id': companyId
    },
    body: {
      bank_account_code: '1110'
    }
  });

  assert.strictEqual(disbRes.status, 200, `Salary disbursement failed: ${JSON.stringify(disbRes.body)}`);
  assert.strictEqual(disbRes.body.data.payrollRun.status, 'DISBURSED');
  assert.ok(disbRes.body.data.disbursement_journal, 'Disbursement bank journal must be created');
});

test('12. Document Delivery Gateway: Gateway Safety Guard & Sandbox Simulation', async (t) => {
  const invoice = await CommercialDocument.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    document_type: 'SALES_INVOICE'
  });

  if (invoice) {
    const sendRes = await makeRequest({
      method: 'POST',
      path: `/api/v1/commercial/documents/${invoice._id}/send`,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-tenant-id': tenantId,
        'x-company-id': companyId
      },
      body: {
        channel: 'EMAIL'
      }
    });

    assert.strictEqual(sendRes.status, 200);
    // When SMTP credentials not configured, it should cleanly return NOT_CONFIGURED without crash
    if (!process.env.SMTP_HOST) {
      assert.strictEqual(sendRes.body.data.status, 'NOT_CONFIGURED');
      assert.strictEqual(sendRes.body.data.provider_status, 'DISCONNECTED');
      assert.strictEqual(sendRes.body.data.is_mock, true);
    }
  }
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
