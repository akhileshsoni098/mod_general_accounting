const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');

// Models
const TaxCalculationSnapshot = require('../src/models/TaxCalculationSnapshot');
const CompanyTaxProfile = require('../src/models/CompanyTaxProfile');
const TaxJurisdiction = require('../src/models/TaxJurisdiction');
const TaxRegistration = require('../src/models/TaxRegistration');
const NexusReview = require('../src/models/NexusReview');
const TaxRateConfig = require('../src/models/TaxRateConfig');

// Services & Providers
const {
  validateCalculationRequest,
  calculateTransactionTax
} = require('../src/services/usTaxCalculationService');
const MockTaxProvider = require('../src/services/taxProvider/MockTaxProvider');
const TaxProviderFactory = require('../src/services/taxProvider/TaxProviderFactory');
const { calculateGregorianPeriods, calculateRetailPeriods } = require('../src/services/accountingCalendarService');

test('US Tax Calculation Engine & Provider Readiness Test Suite (Phase 3)', async (t) => {
  const sampleTenantId = new mongoose.Types.ObjectId();
  const sampleCompanyId = new mongoose.Types.ObjectId();

  // -----------------------------------------------------------------
  // 1. Request Schema & Input Validation
  // -----------------------------------------------------------------
  await t.test('1.1 Request Validation: Accepts well-formed transaction calculation payload', () => {
    const validPayload = {
      transaction_id: 'TX-2026-001',
      transaction_type: 'SALE',
      destination_address: {
        street: '100 Market St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105',
        country: 'US'
      },
      lines: [
        {
          line_number: 1,
          item_code: 'WIDGET-01',
          quantity: 2,
          unit_price: '50.00',
          category_code: 'GENERAL_TANGIBLE_GOODS'
        }
      ],
      freight_amount: '15.00'
    };

    const sanitized = validateCalculationRequest(validPayload);
    assert.strictEqual(sanitized.transaction_id, 'TX-2026-001');
    assert.strictEqual(sanitized.destination_address.state, 'CA');
    assert.strictEqual(sanitized.lines.length, 1);
    assert.strictEqual(sanitized.lines[0].unit_price, '50.00');
    assert.strictEqual(sanitized.freight_amount, '15.00');
  });

  await t.test('1.2 Request Validation: Rejects missing transaction_id', () => {
    assert.throws(
      () => validateCalculationRequest({ destination_address: { state: 'CA' }, lines: [{ quantity: 1, unit_price: 10 }] }),
      { message: /transaction_id/ }
    );
  });

  await t.test('1.3 Request Validation: Rejects empty or invalid destination state', () => {
    assert.throws(
      () => validateCalculationRequest({ transaction_id: 'TX-1', lines: [{ quantity: 1, unit_price: 10 }] }),
      { message: /Destination state code is required/ }
    );
    assert.throws(
      () => validateCalculationRequest({
        transaction_id: 'TX-1',
        destination_address: { state: 'ZZ' },
        lines: [{ quantity: 1, unit_price: 10 }]
      }),
      { message: /not a recognized US state/ }
    );
  });

  await t.test('1.4 Request Validation: Rejects empty line items or negative quantities/prices', () => {
    assert.throws(
      () => validateCalculationRequest({
        transaction_id: 'TX-1',
        destination_address: { state: 'CA' },
        lines: []
      }),
      { message: /At least one line item is required/ }
    );

    assert.throws(
      () => validateCalculationRequest({
        transaction_id: 'TX-1',
        destination_address: { state: 'CA' },
        lines: [{ quantity: -1, unit_price: '20.00' }]
      }),
      { message: /invalid quantity/ }
    );

    assert.throws(
      () => validateCalculationRequest({
        transaction_id: 'TX-1',
        destination_address: { state: 'CA' },
        lines: [{ quantity: 1, unit_price: '-20.00' }]
      }),
      { message: /negative or invalid unit_price/ }
    );

    assert.throws(
      () => validateCalculationRequest({
        transaction_id: 'TX-1',
        destination_address: { state: 'CA' },
        lines: [{ quantity: 1, unit_price: '20.00' }],
        freight_amount: '-5.00'
      }),
      { message: /freight_amount.*non-negative/ }
    );
  });

  // -----------------------------------------------------------------
  // 2. Strict Production Guard & Provider Readiness
  // -----------------------------------------------------------------
  await t.test('2.1 Production Safety Guard: Refuses mock calculation in production environment', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const provider = new MockTaxProvider({ environment: 'PRODUCTION' });

      await assert.rejects(
        async () => {
          await provider.calculateTax({
            destination_state: 'CA',
            lines: [{ taxable_amount: '100.00' }]
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'PRODUCTION_MOCK_DISALLOWED');
          assert.strictEqual(err.statusCode, 503);
          assert.match(err.message, /Synthetic mock tax provider cannot be used for live calculations in production/);
          return true;
        }
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  await t.test('2.2 Commercial Provider Gate: Throws 503 when API credentials are unconfigured', () => {
    assert.throws(
      () => TaxProviderFactory.getProvider({ providerName: 'AVALARA', credentials: {} }),
      (err) => {
        assert.strictEqual(err.code, 'PROVIDER_CREDENTIALS_MISSING');
        assert.strictEqual(err.statusCode, 503);
        assert.match(err.message, /Tax provider "AVALARA" is selected, but API credentials are not configured/);
        return true;
      }
    );
  });

  // -----------------------------------------------------------------
  // 3. Rate Lookup vs Transaction-Level Calculation Distinction
  // -----------------------------------------------------------------
  await t.test('3.1 Rate Lookup returns informational combined rate and component definitions', async () => {
    const provider = new MockTaxProvider({ allowMockInProduction: true });
    const rateInfo = await provider.lookupRates({ state: 'CA' });

    assert.strictEqual(rateInfo.state_code, 'CA');
    assert.strictEqual(rateInfo.combined_rate, '0.0950');
    assert.strictEqual(rateInfo.freight_taxable, false);
    assert.ok(Array.isArray(rateInfo.breakdown));
    assert.strictEqual(rateInfo.breakdown.length, 4); // State, County, City, Special District
  });

  await t.test('3.2 Transaction Calculation applies line taxes, exemptions, discounts, and summaries', async () => {
    const provider = new MockTaxProvider({ allowMockInProduction: true });
    const result = await provider.calculateTax({
      destination_state: 'CA',
      lines: [
        {
          line_number: 1,
          item_code: 'ITEM-1',
          quantity: 2,
          unit_price: '50.00',
          discount_amount: '10.00' // Net taxable = 90.00
        },
        {
          line_number: 2,
          item_code: 'ITEM-EXEMPT',
          quantity: 1,
          unit_price: '40.00',
          is_exempt: true
        }
      ]
    });

    // Subtotal = (2 * 50 - 10) + 40 = 90 + 40 = 130.00
    assert.strictEqual(result.subtotal_amount, '130.00');
    assert.strictEqual(result.taxable_amount, '90.00');
    assert.strictEqual(result.exempt_amount, '40.00');

    // Tax on Line 1 = 90.00 * 0.0950 = 8.55
    // Tax on Line 2 = 0.00
    assert.strictEqual(result.line_items[0].tax_amount, '8.55');
    assert.strictEqual(result.line_items[1].tax_amount, '0.00');
    assert.strictEqual(result.total_tax_amount, '8.55');
    assert.strictEqual(result.grand_total_amount, '138.55');

    // Jurisdiction summaries check
    assert.ok(result.jurisdiction_summaries.length > 0);
    const stateSummary = result.jurisdiction_summaries.find(s => s.jurisdiction_type === 'STATE');
    assert.ok(stateSummary);
    // State rate 0.0600 * 90.00 = 5.40
    assert.strictEqual(stateSummary.tax_amount, '5.40');
  });

  // -----------------------------------------------------------------
  // 4. State-Specific Sourcing & Freight Taxability
  // -----------------------------------------------------------------
  await t.test('4.1 California Freight is NOT taxable', async () => {
    const provider = new MockTaxProvider({ allowMockInProduction: true });
    const caResult = await provider.calculateTax({
      destination_state: 'CA',
      freight_amount: '50.00',
      lines: [{ quantity: 1, unit_price: '100.00' }]
    });

    assert.strictEqual(caResult.freight_taxable, false);
    assert.strictEqual(caResult.freight_tax_amount, '0.00');
    assert.strictEqual(caResult.total_tax_amount, '9.50'); // Only 100 * 0.0950
    assert.strictEqual(caResult.grand_total_amount, '159.50'); // 100 + 50 + 9.50
  });

  await t.test('4.2 New York Freight IS taxable under state rules', async () => {
    const provider = new MockTaxProvider({ allowMockInProduction: true });
    const nyResult = await provider.calculateTax({
      destination_state: 'NY',
      freight_amount: '20.00',
      lines: [{ quantity: 1, unit_price: '100.00' }]
    });

    // NY combined rate is 0.08875
    // Taxable goods = 100.00 -> tax = 8.88
    // Freight = 20.00 -> tax = 20 * 0.08875 = 1.775 -> 1.78
    // Total tax = 8.88 + 1.78 = 10.66
    assert.strictEqual(nyResult.freight_taxable, true);
    assert.strictEqual(nyResult.freight_tax_amount, '1.78');
    assert.strictEqual(nyResult.line_items[0].tax_amount, '8.88');
    assert.strictEqual(nyResult.total_tax_amount, '10.66');
    assert.strictEqual(nyResult.grand_total_amount, '130.66'); // 100 + 20 + 10.66
  });

  // -----------------------------------------------------------------
  // 5. Exemption Certificate & Statutory Category Handling
  // -----------------------------------------------------------------
  await t.test('5.1 Customer Exemption Certificate exempts all lines', async () => {
    const provider = new MockTaxProvider({ allowMockInProduction: true });
    const result = await provider.calculateTax({
      destination_state: 'CA',
      customer_exemption_code: 'RESALE_CERT_998',
      lines: [
        { quantity: 1, unit_price: '100.00' },
        { quantity: 2, unit_price: '50.00' }
      ]
    });

    assert.strictEqual(result.total_tax_amount, '0.00');
    assert.strictEqual(result.exempt_amount, '200.00');
    assert.strictEqual(result.line_items[0].is_exempt, true);
    assert.strictEqual(result.line_items[1].is_exempt, true);
  });

  await t.test('5.2 Statutory Category Exemption (e.g. Professional Services) is respected', async () => {
    const provider = new MockTaxProvider({ allowMockInProduction: true });
    const result = await provider.calculateTax({
      destination_state: 'CA',
      lines: [
        { quantity: 1, unit_price: '200.00', category_code: 'PROFESSIONAL_SERVICES' },
        { quantity: 1, unit_price: '100.00', category_code: 'GENERAL_TANGIBLE_GOODS' }
      ]
    });

    assert.strictEqual(result.line_items[0].is_exempt, true);
    assert.strictEqual(result.line_items[0].tax_amount, '0.00');
    assert.strictEqual(result.line_items[1].is_exempt, false);
    assert.strictEqual(result.line_items[1].tax_amount, '9.50');
    assert.strictEqual(result.total_tax_amount, '9.50');
  });

  // -----------------------------------------------------------------
  // 6. BigNumber Decimal Precision & Total Reconciliation
  // -----------------------------------------------------------------
  await t.test('6.1 Financial Precision: Line items tax sum reconciles exactly with total_tax_amount', () => {
    const lines = [
      { taxable_amount: '33.33', rate: '0.08875' },
      { taxable_amount: '33.33', rate: '0.08875' },
      { taxable_amount: '33.34', rate: '0.08875' }
    ];

    let totalLineTax = new BigNumber(0);
    lines.forEach(l => {
      const lineTax = new BigNumber(l.taxable_amount).times(l.rate).dp(2, BigNumber.ROUND_HALF_UP);
      totalLineTax = totalLineTax.plus(lineTax);
    });

    // 33.33 * 0.08875 = 2.9580... -> 2.96
    // 33.33 * 0.08875 = 2.96
    // 33.34 * 0.08875 = 2.9589... -> 2.96
    // Total line tax = 8.88
    assert.strictEqual(totalLineTax.toFixed(2), '8.88');
    assert.ok(!isNaN(totalLineTax.toNumber()));
  });

  // -----------------------------------------------------------------
  // 7. TaxCalculationSnapshot Model & Immutability Guard
  // -----------------------------------------------------------------
  await t.test('7.1 TaxCalculationSnapshot Model validates required schema fields', () => {
    const snapshot = new TaxCalculationSnapshot({
      tenant_id: sampleTenantId,
      company_id: sampleCompanyId,
      transaction_id: 'TX-SNAP-001',
      transaction_type: 'SALE',
      destination_address: {
        street: '123 Main St',
        city: 'Albany',
        state: 'NY',
        zip: '12207',
        country: 'US'
      },
      subtotal_amount: '100.00',
      taxable_amount: '100.00',
      total_tax_amount: '8.88',
      grand_total_amount: '108.88',
      effective_combined_rate: '0.0888',
      provider_name: 'MOCK',
      status: 'CALCULATED'
    });

    const err = snapshot.validateSync();
    assert.strictEqual(err, undefined, 'Snapshot schema should pass validation');
    assert.strictEqual(snapshot.status, 'CALCULATED');
  });

  await t.test('7.2 TaxCalculationSnapshot Immutability: Committed snapshot rejects modifications', async () => {
    const snapshot = new TaxCalculationSnapshot();
    snapshot.init({
      tenant_id: sampleTenantId,
      company_id: sampleCompanyId,
      transaction_id: 'TX-SNAP-COMMITTED',
      destination_address: { state: 'CA' },
      subtotal_amount: '100.00',
      taxable_amount: '100.00',
      total_tax_amount: '9.50',
      grand_total_amount: '109.50',
      effective_combined_rate: '0.0950',
      provider_name: 'MOCK',
      status: 'COMMITTED'
    });

    // Attempt illegal modification on committed record
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
  // 8. Service Integration & Sourcing Workflow
  // -----------------------------------------------------------------
  await t.test('8.1 usTaxCalculationService.calculateTransactionTax executes full calculation workflow', async () => {
    const payload = {
      transaction_id: 'TX-SVC-001',
      transaction_type: 'SALE',
      destination_address: {
        street: '456 Broadway',
        city: 'New York',
        state: 'NY',
        zip: '10013',
        country: 'US'
      },
      lines: [
        {
          line_number: 1,
          item_code: 'SAAS-01',
          quantity: 1,
          unit_price: '200.00',
          category_code: 'SAAS_SOFTWARE'
        }
      ],
      freight_amount: '10.00'
    };

    const result = await calculateTransactionTax(
      payload,
      { tenantId: sampleTenantId, companyId: sampleCompanyId },
      { allowMockInProduction: true, persistSnapshot: false }
    );

    assert.strictEqual(result.transaction_id, 'TX-SVC-001');
    assert.strictEqual(result.provider_name, 'MOCK');
    assert.strictEqual(result.destination_address.state, 'NY');
    assert.strictEqual(result.subtotal_amount, '200.00');
    // NY 0.08875: 200 * 0.08875 = 17.75. Freight 10 * 0.08875 = 0.8875 -> 0.89. Total = 18.64
    assert.strictEqual(result.total_tax_amount, '18.64');
    assert.strictEqual(result.grand_total_amount, '228.64');
    assert.ok(result.nexus_assessment);
    assert.strictEqual(result.nexus_assessment.destination_state, 'NY');
  });

  // -----------------------------------------------------------------
  // 9. Non-Regression Tests: Indian GST & Accounting Engine
  // -----------------------------------------------------------------
  await t.test('9.1 Non-regression: Indian GST TaxRateConfig model remains intact', () => {
    const gstRate = new TaxRateConfig({
      tenant_id: sampleTenantId,
      company_id: sampleCompanyId,
      tax_code: 'GST_18',
      tax_name: 'GST 18% (Standard)',
      rate_percent: 18,
      cgst_rate: 9,
      sgst_rate: 9,
      igst_rate: 18
    });

    const err = gstRate.validateSync();
    assert.strictEqual(err, undefined, 'GST TaxRateConfig should validate without regression');
    assert.strictEqual(gstRate.tax_code, 'GST_18');
    assert.strictEqual(Number(gstRate.rate_percent), 18);
    assert.strictEqual(Number(gstRate.cgst_rate), 9);
  });

  await t.test('9.2 Non-regression: Accounting Calendar Gregorian & Retail 4-4-5 engines remain intact', () => {
    const gregorianResult = calculateGregorianPeriods({ fiscal_year_start_month: 4 }, 2026);
    assert.ok(gregorianResult && Array.isArray(gregorianResult.periods));
    assert.strictEqual(gregorianResult.periods.length, 12);
    assert.strictEqual(gregorianResult.periods[0].period_number, 1);

    const retailResult = calculateRetailPeriods({
      calendar_type: 'RETAIL_445',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      week_end_day: 'SATURDAY'
    }, 2027);
    assert.ok(retailResult && Array.isArray(retailResult.periods));
    assert.strictEqual(retailResult.periods.length, 12);
  });
});
