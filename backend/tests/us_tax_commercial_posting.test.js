const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');

// Models
const CommercialDocument = require('../src/models/CommercialDocument');
const CompanyPostingConfig = require('../src/models/CompanyPostingConfig');
const TaxCalculationSnapshot = require('../src/models/TaxCalculationSnapshot');
const CompanyTaxProfile = require('../src/models/CompanyTaxProfile');
const LedgerAccount = require('../src/models/LedgerAccount');
const FiscalPeriod = require('../src/models/FiscalPeriod');

// Services
const { postCommercialDocument } = require('../src/services/commercialPostingService');
const { reverseCommercialDocument } = require('../src/services/commercialReversalService');
const { calculateTransactionTax } = require('../src/services/usTaxCalculationService');
const MockTaxProvider = require('../src/services/taxProvider/MockTaxProvider');
const transactionHelper = require('../src/utils/transactionHelper');

test('US Tax Commercial Posting Integration Suite (Phase 4)', async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const companyId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  // Stub topology info and sessions to run in memory without requiring replica set
  const originalClient = mongoose.connection.client;
  const originalStartSession = mongoose.startSession;
  const originalFiscalPeriodFindOne = FiscalPeriod.findOne;
  const originalTaxProfileFindOne = CompanyTaxProfile.findOne;
  const originalSnapshotFindById = TaxCalculationSnapshot.findById;

  mongoose.connection.client = {
    topology: {
      description: { type: 'ReplicaSetWithPrimary' }
    }
  };

  mongoose.startSession = async () => ({
    withTransaction: async (cb) => cb(),
    endSession: async () => {}
  });

  FiscalPeriod.findOne = () => ({
    session: () => Promise.resolve({
      period_name: 'FY2026-M01',
      status: 'OPEN'
    })
  });

  CompanyTaxProfile.findOne = () => ({
    session: () => Promise.resolve({
      provider_name: 'MOCK',
      environment: 'SANDBOX'
    })
  });

  TaxCalculationSnapshot.findById = () => ({
    session: () => Promise.resolve({
      _id: new mongoose.Types.ObjectId(),
      status: 'CALCULATED',
      save: async function() { return this; }
    })
  });

  const Godown = require('../src/models/Godown');
  const BillAllocation = require('../src/models/BillAllocation');
  const commercialPostingConfigService = require('../src/services/commercialPostingConfigService');

  const originalGodownFindOne = Godown.findOne;
  const originalLedgerAccountFindById = LedgerAccount.findById;
  const originalBillAllocationFind = BillAllocation.find;
  const originalValidateAndResolve = commercialPostingConfigService.validateAndResolvePostingAccounts;

  Godown.findOne = () => ({
    session: () => Promise.resolve({
      _id: new mongoose.Types.ObjectId(),
      godown_code: 'MAIN',
      status: 'ACTIVE'
    })
  });

  LedgerAccount.findById = () => ({
    session: () => Promise.resolve({
      account_code: '1010'
    })
  });

  BillAllocation.find = () => ({
    session: () => Promise.resolve([])
  });

  const defaultMockConfig = {
    sales_revenue_account_code: '4000',
    receivable_account_code: '1100',
    payable_account_code: '2000',
    inventory_asset_account_code: '1300',
    sales_tax_payable_account_code: '2110',
    use_tax_payable_account_code: '2115',
    tax_expense_account_code: '5110',
    purchase_tax_treatment: 'CAPITALIZE_TO_ITEM',
    round_off_account_code: '4199'
  };

  let activePostingConfig = { ...defaultMockConfig };

  commercialPostingConfigService.validateAndResolvePostingAccounts = async () => ({
    config: activePostingConfig,
    accountMap: {}
  });

  t.after(() => {
    mongoose.connection.client = originalClient;
    mongoose.startSession = originalStartSession;
    FiscalPeriod.findOne = originalFiscalPeriodFindOne;
    CompanyTaxProfile.findOne = originalTaxProfileFindOne;
    TaxCalculationSnapshot.findById = originalSnapshotFindById;
    Godown.findOne = originalGodownFindOne;
    LedgerAccount.findById = originalLedgerAccountFindById;
    BillAllocation.find = originalBillAllocationFind;
    commercialPostingConfigService.validateAndResolvePostingAccounts = originalValidateAndResolve;
  });

  // -----------------------------------------------------------------
  // 1. Schema Validation for US Tax Fields
  // -----------------------------------------------------------------
  await t.test('1.1 CommercialDocument Schema: validates US tax fields on lines and document header', () => {
    const doc = new CommercialDocument({
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'SALES_INVOICE',
      document_number: 'SI-2026-00001',
      idempotency_key: 'IDEMP-US-0001',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'CALCULATED',
      is_mock_tax: true,
      tax_provider_name: 'MOCK',
      tax_provider_transaction_id: 'TX-MOCK-999',
      origin_address: {
        street: '100 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105',
        country: 'US'
      },
      destination_address: {
        street: '200 Broadway',
        city: 'New York',
        state: 'NY',
        zip: '10007',
        country: 'US'
      },
      subtotal_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_tax_amount: mongoose.Types.Decimal128.fromString('8.88'),
      grand_total: mongoose.Types.Decimal128.fromString('108.88'),
      lines: [
        {
          line_number: 1,
          line_type: 'ITEM',
          item_code: 'SAUCE-01',
          item_name: 'Herb Pizza Sauce',
          quantity: mongoose.Types.Decimal128.fromString('2.0000'),
          unit_rate: mongoose.Types.Decimal128.fromString('50.00'),
          gross_amount: mongoose.Types.Decimal128.fromString('100.00'),
          taxable_amount: mongoose.Types.Decimal128.fromString('100.00'),
          us_tax_amount: mongoose.Types.Decimal128.fromString('8.88'),
          us_tax_rate: mongoose.Types.Decimal128.fromString('0.0888'),
          category_code: 'PREPARED_FOOD',
          is_exempt: false,
          total_tax: mongoose.Types.Decimal128.fromString('8.88'),
          total_amount: mongoose.Types.Decimal128.fromString('108.88')
        }
      ]
    });

    const err = doc.validateSync();
    assert.strictEqual(err, undefined, 'Document with US tax fields should pass validation');
    assert.strictEqual(doc.tax_regime, 'US_SALES_TAX');
    assert.strictEqual(doc.is_mock_tax, true);
    assert.strictEqual(doc.lines[0].category_code, 'PREPARED_FOOD');
    assert.strictEqual(doc.lines[0].us_tax_amount.toString(), '8.88');
  });

  await t.test('1.2 CompanyPostingConfig Schema: supports US tax account codes and purchase tax treatment', () => {
    const config = new CompanyPostingConfig({
      tenant_id: tenantId,
      company_id: companyId,
      sales_revenue_account_code: '4000',
      receivable_account_code: '1100',
      payable_account_code: '2000',
      inventory_asset_account_code: '1300',
      cogs_account_code: '5000',
      bank_account_code: '1010',
      cash_account_code: '1000',
      sales_tax_payable_account_code: '2110',
      use_tax_payable_account_code: '2115',
      tax_expense_account_code: '5110',
      purchase_tax_treatment: 'CAPITALIZE_TO_ITEM'
    });

    const err = config.validateSync();
    assert.strictEqual(err, undefined, 'CompanyPostingConfig with US tax accounts should pass validation');
    assert.strictEqual(config.sales_tax_payable_account_code, '2110');
    assert.strictEqual(config.tax_expense_account_code, '5110');
    assert.strictEqual(config.purchase_tax_treatment, 'CAPITALIZE_TO_ITEM');
  });

  await t.test('1.3 CompanyPostingConfig Schema: rejects invalid purchase_tax_treatment enum', () => {
    const config = new CompanyPostingConfig({
      tenant_id: tenantId,
      company_id: companyId,
      sales_revenue_account_code: '4000',
      receivable_account_code: '1100',
      payable_account_code: '2000',
      inventory_asset_account_code: '1300',
      cogs_account_code: '5000',
      bank_account_code: '1010',
      cash_account_code: '1000',
      purchase_tax_treatment: 'INVALID_TREATMENT'
    });

    const err = config.validateSync();
    assert.ok(err, 'Validation should fail on invalid enum value');
    assert.ok(err.errors.purchase_tax_treatment);
  });

  // -----------------------------------------------------------------
  // 2. Sales Invoice Posting (GL double entry with US Sales Tax)
  // -----------------------------------------------------------------
  await t.test('2.1 Sales Invoice Posting: posts credit to 2110 (Sales Tax Payable), debit to AR, credit to Revenue', async () => {
    const snapshotId = new mongoose.Types.ObjectId();
    const docId = new mongoose.Types.ObjectId();

    // Mock document
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'SALES_INVOICE',
      document_number: 'SI-2026-US-001',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_snapshot_id: snapshotId,
      tax_calculation_status: 'CALCULATED',
      is_mock_tax: false,
      tax_provider_name: 'AVALARA',
      tax_provider_transaction_id: 'TX-AVALARA-001',
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_tax_amount: mongoose.Types.Decimal128.fromString('8.50'),
      round_off_amount: mongoose.Types.Decimal128.fromString('0.00'),
      grand_total: mongoose.Types.Decimal128.fromString('108.50'),
      lines: [
        {
          _id: new mongoose.Types.ObjectId(),
          line_number: 1,
          line_type: 'SERVICE',
          item_code: 'PIZZA-MAR-01',
          quantity: mongoose.Types.Decimal128.fromString('1'),
          taxable_amount: mongoose.Types.Decimal128.fromString('100.00'),
          us_tax_amount: mongoose.Types.Decimal128.fromString('8.50'),
          total_tax: mongoose.Types.Decimal128.fromString('8.50'),
          total_amount: mongoose.Types.Decimal128.fromString('108.50')
        }
      ],
      audit_trail: [],
      save: async function() { return this; }
    };

    // Mock posting config
    activePostingConfig = {
      ...defaultMockConfig,
      sales_revenue_account_code: '4000',
      receivable_account_code: '1100',
      sales_tax_payable_account_code: '2110',
      round_off_account_code: '4199'
    };

    // Stubs
    const originalFindDoc = CommercialDocument.findOne;
    const originalPostJournal = require('../src/services/journalPostingService').postJournalEntry;
    const originalCreateProvider = require('../src/services/taxProvider/TaxProviderFactory').createProvider;

    let capturedJournalPayload = null;

    CommercialDocument.findOne = () => ({
      session: () => Promise.resolve(mockDoc)
    });

    require('../src/services/journalPostingService').postJournalEntry = async (payload) => {
      capturedJournalPayload = payload;
      return {
        journal: {
          _id: new mongoose.Types.ObjectId(),
          journal_number: 'JRN-2026-US-001'
        }
      };
    };

    require('../src/services/taxProvider/TaxProviderFactory').createProvider = () => ({
      getProviderId: () => 'AVALARA',
      commitTransaction: async () => ({ status: 'COMMITTED', provider_transaction_id: 'TX-AVALARA-001' })
    });

    try {
      const res = await postCommercialDocument({
        tenantId,
        companyId,
        documentId: docId,
        userId
      });

      assert.strictEqual(res.document.status, 'POSTED');
      assert.strictEqual(res.document.tax_calculation_status, 'COMMITTED');

      // Verify double-entry GL lines
      assert.ok(capturedJournalPayload, 'Journal payload must be generated');
      const lines = capturedJournalPayload.lines;
      assert.strictEqual(lines.length, 3, 'Should have AR debit, Revenue credit, and Sales Tax Payable credit');

      // AR Debit: 108.50
      const arLine = lines.find(l => l.account_code === '1100');
      assert.ok(arLine, 'AR line must exist');
      assert.strictEqual(arLine.debit, '108.50');
      assert.strictEqual(arLine.credit, '0.00');

      // Revenue Credit: 100.00
      const revLine = lines.find(l => l.account_code === '4000');
      assert.ok(revLine, 'Sales Revenue line must exist');
      assert.strictEqual(revLine.debit, '0.00');
      assert.strictEqual(revLine.credit, '100.00');

      // Sales Tax Payable Credit: 8.50 (Account 2110)
      const taxLine = lines.find(l => l.account_code === '2110');
      assert.ok(taxLine, 'Sales Tax Payable (2110) line must exist');
      assert.strictEqual(taxLine.debit, '0.00');
      assert.strictEqual(taxLine.credit, '8.50');

      // Math check: total Debits === total Credits
      const totalDr = lines.reduce((sum, l) => sum.plus(l.debit), new BigNumber(0));
      const totalCr = lines.reduce((sum, l) => sum.plus(l.credit), new BigNumber(0));
      assert.ok(totalDr.isEqualTo(totalCr), 'GL journal debits and credits must balance perfectly');
    } finally {
      CommercialDocument.findOne = originalFindDoc;
      require('../src/services/journalPostingService').postJournalEntry = originalPostJournal;
      require('../src/services/taxProvider/TaxProviderFactory').createProvider = originalCreateProvider;
      activePostingConfig = { ...defaultMockConfig };
    }
  });

  // -----------------------------------------------------------------
  // 3. Purchase Invoice Posting: CAPITALIZE_TO_ITEM vs EXPENSE_SEPARATE vs BLOCKED
  // -----------------------------------------------------------------
  await t.test('3.1 Purchase Invoice: CAPITALIZE_TO_ITEM capitalizes tax into inventory asset (1300)', async () => {
    const docId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'PURCHASE_INVOICE',
      document_number: 'PI-2026-US-001',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'CALCULATED',
      is_mock_tax: false,
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('500.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('500.00'),
      total_tax_amount: mongoose.Types.Decimal128.fromString('40.00'),
      round_off_amount: mongoose.Types.Decimal128.fromString('0.00'),
      grand_total: mongoose.Types.Decimal128.fromString('540.00'),
      lines: [
        {
          _id: new mongoose.Types.ObjectId(),
          line_number: 1,
          line_type: 'SERVICE',
          item_code: 'CHEESE-01',
          quantity: mongoose.Types.Decimal128.fromString('10'),
          taxable_amount: mongoose.Types.Decimal128.fromString('500.00'),
          us_tax_amount: mongoose.Types.Decimal128.fromString('40.00')
        }
      ],
      audit_trail: [],
      save: async function() { return this; }
    };

    activePostingConfig = {
      ...defaultMockConfig,
      inventory_asset_account_code: '1300',
      payable_account_code: '2000',
      purchase_tax_treatment: 'CAPITALIZE_TO_ITEM'
    };

    const originalFindDoc = CommercialDocument.findOne;
    const originalPostJournal = require('../src/services/journalPostingService').postJournalEntry;

    let capturedLines = null;
    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });
    require('../src/services/journalPostingService').postJournalEntry = async (p) => {
      capturedLines = p.lines;
      return { journal: { _id: new mongoose.Types.ObjectId(), journal_number: 'JRN-P1' } };
    };

    try {
      await postCommercialDocument({ tenantId, companyId, documentId: docId, userId });
      assert.ok(capturedLines);
      // Under CAPITALIZE_TO_ITEM, Inventory Asset is debited for taxable + tax = 540.00
      const invLine = capturedLines.find(l => l.account_code === '1300');
      assert.ok(invLine);
      assert.strictEqual(invLine.debit, '540.00');

      const apLine = capturedLines.find(l => l.account_code === '2000');
      assert.ok(apLine);
      assert.strictEqual(apLine.credit, '540.00');

      // No separate tax expense line
      const taxLine = capturedLines.find(l => l.account_code === '5110');
      assert.strictEqual(taxLine, undefined);
    } finally {
      CommercialDocument.findOne = originalFindDoc;
      require('../src/services/journalPostingService').postJournalEntry = originalPostJournal;
      activePostingConfig = { ...defaultMockConfig };
    }
  });

  await t.test('3.2 Purchase Invoice: EXPENSE_SEPARATE posts tax to 5110 (Tax Expense)', async () => {
    const docId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'PURCHASE_INVOICE',
      document_number: 'PI-2026-US-002',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'CALCULATED',
      is_mock_tax: false,
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('500.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('500.00'),
      total_tax_amount: mongoose.Types.Decimal128.fromString('40.00'),
      round_off_amount: mongoose.Types.Decimal128.fromString('0.00'),
      grand_total: mongoose.Types.Decimal128.fromString('540.00'),
      lines: [
        {
          _id: new mongoose.Types.ObjectId(),
          line_number: 1,
          line_type: 'SERVICE',
          item_code: 'CHEESE-01',
          quantity: mongoose.Types.Decimal128.fromString('10'),
          taxable_amount: mongoose.Types.Decimal128.fromString('500.00'),
          us_tax_amount: mongoose.Types.Decimal128.fromString('40.00')
        }
      ],
      audit_trail: [],
      save: async function() { return this; }
    };

    activePostingConfig = {
      ...defaultMockConfig,
      inventory_asset_account_code: '1300',
      payable_account_code: '2000',
      tax_expense_account_code: '5110',
      purchase_tax_treatment: 'EXPENSE_SEPARATE'
    };

    const originalFindDoc = CommercialDocument.findOne;
    const originalPostJournal = require('../src/services/journalPostingService').postJournalEntry;

    let capturedLines = null;
    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });
    require('../src/services/journalPostingService').postJournalEntry = async (p) => {
      capturedLines = p.lines;
      return { journal: { _id: new mongoose.Types.ObjectId(), journal_number: 'JRN-P2' } };
    };

    try {
      await postCommercialDocument({ tenantId, companyId, documentId: docId, userId });
      assert.ok(capturedLines);

      // Inventory Asset debited for taxable: 500.00
      const invLine = capturedLines.find(l => l.account_code === '1300');
      assert.ok(invLine);
      assert.strictEqual(invLine.debit, '500.00');

      // Dedicated Tax Expense debited for tax: 40.00 (Account 5110)
      const taxLine = capturedLines.find(l => l.account_code === '5110');
      assert.ok(taxLine);
      assert.strictEqual(taxLine.debit, '40.00');

      // AP Credited for total: 540.00
      const apLine = capturedLines.find(l => l.account_code === '2000');
      assert.ok(apLine);
      assert.strictEqual(apLine.credit, '540.00');
    } finally {
      CommercialDocument.findOne = originalFindDoc;
      require('../src/services/journalPostingService').postJournalEntry = originalPostJournal;
      activePostingConfig = { ...defaultMockConfig };
    }
  });

  await t.test('3.3 Purchase Invoice: BLOCKED treatment halts posting with BLOCKED_TAX_CONFIGURATION', async () => {
    const docId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'PURCHASE_INVOICE',
      document_number: 'PI-2026-US-003',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'CALCULATED',
      is_mock_tax: false,
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('500.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('500.00'),
      total_tax_amount: mongoose.Types.Decimal128.fromString('40.00'),
      grand_total: mongoose.Types.Decimal128.fromString('540.00'),
      lines: [],
      audit_trail: [],
      save: async function() { return this; }
    };

    activePostingConfig = {
      ...defaultMockConfig,
      inventory_asset_account_code: '1300',
      payable_account_code: '2000',
      purchase_tax_treatment: 'BLOCKED'
    };

    const originalFindDoc = CommercialDocument.findOne;

    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });

    try {
      await assert.rejects(
        postCommercialDocument({ tenantId, companyId, documentId: docId, userId }),
        (err) => err.code === 'BLOCKED_TAX_CONFIGURATION' || err.message.includes('BLOCKED_TAX_CONFIGURATION')
      );
    } finally {
      CommercialDocument.findOne = originalFindDoc;
      activePostingConfig = { ...defaultMockConfig };
    }
  });

  // -----------------------------------------------------------------
  // 4. Sales Return & Purchase Return Posting
  // -----------------------------------------------------------------
  await t.test('4.1 Sales Return Posting: debits Sales Revenue and 2110 (Sales Tax Payable), credits AR', async () => {
    const docId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'SALES_RETURN',
      document_number: 'SR-2026-US-001',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'CALCULATED',
      is_mock_tax: false,
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('50.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('50.00'),
      total_tax_amount: mongoose.Types.Decimal128.fromString('4.25'),
      round_off_amount: mongoose.Types.Decimal128.fromString('0.00'),
      grand_total: mongoose.Types.Decimal128.fromString('54.25'),
      lines: [],
      audit_trail: [],
      save: async function() { return this; }
    };

    activePostingConfig = {
      ...defaultMockConfig,
      sales_revenue_account_code: '4000',
      receivable_account_code: '1100',
      sales_tax_payable_account_code: '2110',
      round_off_account_code: '4199'
    };

    const originalFindDoc = CommercialDocument.findOne;
    const originalPostJournal = require('../src/services/journalPostingService').postJournalEntry;

    let capturedLines = null;
    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });
    require('../src/services/journalPostingService').postJournalEntry = async (p) => {
      capturedLines = p.lines;
      return { journal: { _id: new mongoose.Types.ObjectId(), journal_number: 'JRN-SR' } };
    };

    try {
      await postCommercialDocument({ tenantId, companyId, documentId: docId, userId });
      assert.ok(capturedLines);

      // Debit Revenue: 50.00
      const revLine = capturedLines.find(l => l.account_code === '4000');
      assert.strictEqual(revLine.debit, '50.00');

      // Debit Sales Tax Payable: 4.25 (Account 2110 reversal)
      const taxLine = capturedLines.find(l => l.account_code === '2110');
      assert.strictEqual(taxLine.debit, '4.25');

      // Credit AR: 54.25
      const arLine = capturedLines.find(l => l.account_code === '1100');
      assert.strictEqual(arLine.credit, '54.25');
    } finally {
      CommercialDocument.findOne = originalFindDoc;
      require('../src/services/journalPostingService').postJournalEntry = originalPostJournal;
      activePostingConfig = { ...defaultMockConfig };
    }
  });

  await t.test('4.2 Purchase Return Posting: debits AP, credits Inventory and reverses Tax Expense (EXPENSE_SEPARATE)', async () => {
    const docId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'PURCHASE_RETURN',
      document_number: 'PR-2026-US-001',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'CALCULATED',
      is_mock_tax: false,
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_tax_amount: mongoose.Types.Decimal128.fromString('8.00'),
      round_off_amount: mongoose.Types.Decimal128.fromString('0.00'),
      grand_total: mongoose.Types.Decimal128.fromString('108.00'),
      lines: [],
      audit_trail: [],
      save: async function() { return this; }
    };

    activePostingConfig = {
      ...defaultMockConfig,
      inventory_asset_account_code: '1300',
      payable_account_code: '2000',
      tax_expense_account_code: '5110',
      purchase_tax_treatment: 'EXPENSE_SEPARATE',
      round_off_account_code: '4199'
    };

    const originalFindDoc = CommercialDocument.findOne;
    const originalPostJournal = require('../src/services/journalPostingService').postJournalEntry;

    let capturedLines = null;
    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });
    require('../src/services/journalPostingService').postJournalEntry = async (p) => {
      capturedLines = p.lines;
      return { journal: { _id: new mongoose.Types.ObjectId(), journal_number: 'JRN-PR' } };
    };

    try {
      await postCommercialDocument({ tenantId, companyId, documentId: docId, userId });
      assert.ok(capturedLines);

      // Debit AP: 108.00
      const apLine = capturedLines.find(l => l.account_code === '2000');
      assert.strictEqual(apLine.debit, '108.00');

      // Credit Inventory Asset: 100.00
      const invLine = capturedLines.find(l => l.account_code === '1300');
      assert.strictEqual(invLine.credit, '100.00');

      // Credit Tax Expense (5110 reversal): 8.00
      const taxLine = capturedLines.find(l => l.account_code === '5110');
      assert.strictEqual(taxLine.credit, '8.00');
    } finally {
      CommercialDocument.findOne = originalFindDoc;
      require('../src/services/journalPostingService').postJournalEntry = originalPostJournal;
      activePostingConfig = { ...defaultMockConfig };
    }
  });

  // -----------------------------------------------------------------
  // 5. Production Safety Guards
  // -----------------------------------------------------------------
  await t.test('5.1 Production Guard: throws PRODUCTION_MOCK_DISALLOWED when posting mock tax in production', async () => {
    const docId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'SALES_INVOICE',
      document_number: 'SI-2026-PROD-MOCK',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'CALCULATED',
      is_mock_tax: true, // Mock tax!
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('100.00'),
      grand_total: mongoose.Types.Decimal128.fromString('100.00'),
      lines: [],
      audit_trail: []
    };

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const originalFindDoc = CommercialDocument.findOne;
    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });

    try {
      await assert.rejects(
        postCommercialDocument({ tenantId, companyId, documentId: docId, userId }),
        (err) => err.code === 'PRODUCTION_MOCK_DISALLOWED' || err.message.includes('PRODUCTION_MOCK_DISALLOWED')
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      CommercialDocument.findOne = originalFindDoc;
    }
  });

  await t.test('5.2 Production Guard: throws TAX_CALCULATION_REQUIRED when posting uncalculated US document in production', async () => {
    const docId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'SALES_INVOICE',
      document_number: 'SI-2026-PROD-UNCALC',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'PENDING', // Uncalculated!
      is_mock_tax: false,
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('100.00'),
      grand_total: mongoose.Types.Decimal128.fromString('100.00'),
      lines: [],
      audit_trail: []
    };

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const originalFindDoc = CommercialDocument.findOne;
    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });

    try {
      await assert.rejects(
        postCommercialDocument({ tenantId, companyId, documentId: docId, userId }),
        (err) => err.code === 'TAX_CALCULATION_REQUIRED' || err.message.includes('TAX_CALCULATION_REQUIRED')
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      CommercialDocument.findOne = originalFindDoc;
    }
  });

  // -----------------------------------------------------------------
  // 6. Provider Failure Separation (Reconciliation Pending)
  // -----------------------------------------------------------------
  await t.test('6.1 Provider Separation: GL posts cleanly and status is RECONCILIATION_PENDING if provider finalization fails', async () => {
    const docId = new mongoose.Types.ObjectId();
    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'SALES_INVOICE',
      document_number: 'SI-2026-US-RECON-01',
      status: 'DRAFT',
      tax_regime: 'US_SALES_TAX',
      tax_calculation_status: 'CALCULATED',
      tax_reconciliation_status: 'PENDING',
      is_mock_tax: false,
      tax_provider_name: 'TAXJAR',
      currency: 'USD',
      subtotal_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_taxable_amount: mongoose.Types.Decimal128.fromString('100.00'),
      total_tax_amount: mongoose.Types.Decimal128.fromString('8.00'),
      round_off_amount: mongoose.Types.Decimal128.fromString('0.00'),
      grand_total: mongoose.Types.Decimal128.fromString('108.00'),
      lines: [],
      audit_trail: [],
      save: async function() { return this; }
    };

    activePostingConfig = {
      ...defaultMockConfig,
      sales_revenue_account_code: '4000',
      receivable_account_code: '1100',
      sales_tax_payable_account_code: '2110',
      round_off_account_code: '4199'
    };

    const originalFindDoc = CommercialDocument.findOne;
    const originalPostJournal = require('../src/services/journalPostingService').postJournalEntry;
    const originalCreateProvider = require('../src/services/taxProvider/TaxProviderFactory').createProvider;

    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });
    require('../src/services/journalPostingService').postJournalEntry = async () => ({
      journal: { _id: new mongoose.Types.ObjectId(), journal_number: 'JRN-RECON' }
    });

    // Simulate failing tax provider commit
    require('../src/services/taxProvider/TaxProviderFactory').createProvider = () => ({
      getProviderId: () => 'TAXJAR',
      commitTransaction: async () => {
        const timeoutErr = new Error('ETIMEDOUT: Connection to TaxJar API timed out after 5000ms');
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      }
    });

    try {
      const res = await postCommercialDocument({
        tenantId,
        companyId,
        documentId: docId,
        userId
      });

      // GL Journal posting succeeded!
      assert.strictEqual(res.document.status, 'POSTED', 'Document must remain POSTED');
      assert.ok(res.journal, 'Financial GL journal must exist and be balanced');

      // Tax reconciliation flags recorded without rolling back GL
      assert.strictEqual(res.document.tax_calculation_status, 'RECONCILIATION_PENDING');
      assert.strictEqual(res.document.tax_reconciliation_status, 'PENDING_RETRY');

      const auditEntry = res.document.audit_trail.find(a => a.action === 'TAX_RECONCILIATION_PENDING');
      assert.ok(auditEntry, 'Audit log must record external provider deferral note');
      assert.ok(auditEntry.note.includes('ETIMEDOUT'));
    } finally {
      CommercialDocument.findOne = originalFindDoc;
      require('../src/services/journalPostingService').postJournalEntry = originalPostJournal;
      require('../src/services/taxProvider/TaxProviderFactory').createProvider = originalCreateProvider;
      activePostingConfig = { ...defaultMockConfig };
    }
  });

  // -----------------------------------------------------------------
  // 7. Reversal & Snapshot Cancellation
  // -----------------------------------------------------------------
  await t.test('7.1 Commercial Reversal: cancels tax snapshot status and records reversal audit note', async () => {
    const docId = new mongoose.Types.ObjectId();
    const snapshotId = new mongoose.Types.ObjectId();

    const mockDoc = {
      _id: docId,
      tenant_id: tenantId,
      company_id: companyId,
      status: 'POSTED',
      document_number: 'SI-2026-US-REV-01',
      tax_regime: 'US_SALES_TAX',
      tax_snapshot_id: snapshotId,
      journal_id: new mongoose.Types.ObjectId(),
      lines: [],
      audit_trail: [],
      save: async function() { return this; }
    };

    let snapshotUpdatedStatus = null;
    let providerVoidCalled = false;

    // Stubs
    const originalFindDoc = CommercialDocument.findOne;
    const originalFindSnapshot = TaxCalculationSnapshot.findById;
    const originalRevJournal = require('../src/services/journalPostingService').reverseJournalEntry;
    const originalCreateProvider = require('../src/services/taxProvider/TaxProviderFactory').createProvider;

    CommercialDocument.findOne = () => ({ session: () => Promise.resolve(mockDoc) });
    TaxCalculationSnapshot.findById = () => ({
      session: () => Promise.resolve({
        _id: snapshotId,
        status: 'COMMITTED',
        save: async function() {
          snapshotUpdatedStatus = this.status;
          return this;
        }
      })
    });
    require('../src/services/journalPostingService').reverseJournalEntry = async () => ({
      reversal_journal: { _id: new mongoose.Types.ObjectId(), journal_number: 'REV-JRN-01' }
    });
    require('../src/services/taxProvider/TaxProviderFactory').createProvider = () => ({
      voidTransaction: async () => {
        providerVoidCalled = true;
        return { status: 'VOIDED' };
      }
    });

    try {
      const res = await reverseCommercialDocument({
        tenantId,
        companyId,
        documentId: docId,
        userId,
        reason: 'Customer cancelled order before delivery'
      });

      assert.strictEqual(res.document.status, 'REVERSED');
      assert.strictEqual(snapshotUpdatedStatus, 'CANCELLED', 'Tax snapshot status must become CANCELLED');
      assert.strictEqual(providerVoidCalled, true, 'Provider voidTransaction must be called');
    } finally {
      CommercialDocument.findOne = originalFindDoc;
      TaxCalculationSnapshot.findById = originalFindSnapshot;
      require('../src/services/journalPostingService').reverseJournalEntry = originalRevJournal;
      require('../src/services/taxProvider/TaxProviderFactory').createProvider = originalCreateProvider;
    }
  });

  // -----------------------------------------------------------------
  // 8. Snapshot Immutability Guard
  // -----------------------------------------------------------------
  await t.test('8.1 Snapshot Immutability: COMMITTED snapshot throws IMMUTABLE_SNAPSHOT on modification attempt', async () => {
    const snapshot = new TaxCalculationSnapshot({
      tenant_id: tenantId,
      company_id: companyId,
      transaction_id: 'TX-SNAP-COMMITTED-P4',
      destination_address: { state: 'CA' },
      subtotal_amount: '100.00',
      taxable_amount: '100.00',
      total_tax_amount: '9.50',
      grand_total_amount: '109.50',
      effective_combined_rate: '0.0950',
      provider_name: 'MOCK',
      status: 'COMMITTED'
    });

    snapshot.isNew = false;
    snapshot.total_tax_amount = '15.00';
    assert.ok(snapshot.modifiedPaths().includes('total_tax_amount'));

    let caughtErr = null;
    const immutabilityHook = TaxCalculationSnapshot.schema.s.hooks._pres
      .get('save')
      .find(h => h.fn.toString().includes('IMMUTABLE_SNAPSHOT'));

    assert.ok(immutabilityHook, 'Immutability pre-save hook must be registered');
    await immutabilityHook.fn.call(snapshot, (err) => { caughtErr = err; });

    assert.ok(caughtErr, 'Should error on attempting to modify committed snapshot');
    assert.match(caughtErr.message, /IMMUTABLE_SNAPSHOT/);
  });

  // -----------------------------------------------------------------
  // 9. MockTaxProvider commitTransaction and voidTransaction
  // -----------------------------------------------------------------
  await t.test('9.1 MockTaxProvider: commitTransaction returns COMMITTED in non-production sandbox', async () => {
    const provider = new MockTaxProvider({ environment: 'SANDBOX' });
    const res = await provider.commitTransaction({
      provider_transaction_id: 'TX-TEST-001',
      document_number: 'SI-100',
      grand_total: '105.00'
    });
    assert.strictEqual(res.status, 'COMMITTED');
    assert.strictEqual(res.provider_transaction_id, 'TX-TEST-001');
  });

  await t.test('9.2 MockTaxProvider: commitTransaction throws PRODUCTION_MOCK_DISALLOWED in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const provider = new MockTaxProvider({ environment: 'PRODUCTION' });

    try {
      await assert.rejects(
        provider.commitTransaction({ provider_transaction_id: 'TX-TEST-002' }),
        (err) => err.code === 'PRODUCTION_MOCK_DISALLOWED'
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
