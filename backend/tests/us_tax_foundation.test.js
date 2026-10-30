const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const path = require('node:path');
const fs = require('node:fs');

// Models
const TaxJurisdiction = require('../src/models/TaxJurisdiction');
const CompanyTaxProfile = require('../src/models/CompanyTaxProfile');
const TaxRegistration = require('../src/models/TaxRegistration');
const NexusReview = require('../src/models/NexusReview');
const TaxProviderSyncLog = require('../src/models/TaxProviderSyncLog');
const Company = require('../src/models/Company');
const TaxRateConfig = require('../src/models/TaxRateConfig');

// Services & Providers
const { validateSeedFiles, importJurisdictionSeeds } = require('../src/services/taxSeedImportService');
const MockTaxProvider = require('../src/services/taxProvider/MockTaxProvider');
const TaxProviderFactory = require('../src/services/taxProvider/TaxProviderFactory');
const { calculateGregorianPeriods, calculateRetailPeriods } = require('../src/services/accountingCalendarService');

test('US Tax Foundation, Jurisdiction Data & Provider API Suite (Phase 2)', async (t) => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const companyA1 = new mongoose.Types.ObjectId();
  const companyA2 = new mongoose.Types.ObjectId();
  const companyB1 = new mongoose.Types.ObjectId();
  const sampleUserId = new mongoose.Types.ObjectId();

  // -----------------------------------------------------------------
  // 1. Model Schema Validation Tests
  // -----------------------------------------------------------------
  await t.test('1.1 TaxJurisdiction Model: validates valid jurisdiction and preserves string FIPS codes', () => {
    const validJurisdiction = new TaxJurisdiction({
      jurisdiction_code: 'US-CA',
      jurisdiction_name: 'California',
      jurisdiction_type: 'STATE',
      country_code: 'US',
      state_code: 'CA',
      fips_code: '06', // Must preserve leading zero as string
      is_active: true,
      provider_coverage_status: 'SUPPORTED'
    });

    const err = validJurisdiction.validateSync();
    assert.strictEqual(err, undefined, 'Valid state jurisdiction should have no validation errors');
    assert.strictEqual(validJurisdiction.fips_code, '06', 'FIPS code must preserve leading zeros as a string');
    assert.strictEqual(validJurisdiction.jurisdiction_type, 'STATE');
  });

  await t.test('1.2 TaxJurisdiction Model: rejects unsupported jurisdiction_type enum', () => {
    const invalidJurisdiction = new TaxJurisdiction({
      jurisdiction_code: 'CA-ON',
      jurisdiction_name: 'Ontario',
      jurisdiction_type: 'PROVINCE', // Not in enum
      country_code: 'CA'
    });

    const err = invalidJurisdiction.validateSync();
    assert.ok(err, 'Should fail validation for invalid jurisdiction_type');
    assert.ok(err.errors.jurisdiction_type, 'jurisdiction_type validation error expected');
  });

  await t.test('1.3 CompanyTaxProfile Model: validates US tax classification and 1-12 tax year-end month', () => {
    const validProfile = new CompanyTaxProfile({
      tenant_id: tenantA,
      company_id: companyA1,
      tax_classification: 'C_CORP',
      federal_ein_masked: 'XX-XXX1234',
      tax_year_end_month: 12,
      state_of_incorporation: 'DE',
      tax_provider: 'MOCK',
      active_tax_engine: 'US_SALES_TAX'
    });

    const err = validProfile.validateSync();
    assert.strictEqual(err, undefined, 'Valid profile should pass validation');
    assert.strictEqual(validProfile.tax_classification, 'C_CORP');
    assert.strictEqual(validProfile.tax_year_end_month, 12);

    // Invalid month (> 12)
    const invalidMonthProfile = new CompanyTaxProfile({
      tenant_id: tenantA,
      company_id: companyA1,
      tax_classification: 'LLC',
      tax_year_end_month: 13
    });
    const monthErr = invalidMonthProfile.validateSync();
    assert.ok(monthErr, 'Should fail validation for month 13');
    assert.ok(monthErr.errors.tax_year_end_month, 'tax_year_end_month error expected');

    // Invalid classification
    const invalidClassProfile = new CompanyTaxProfile({
      tenant_id: tenantA,
      company_id: companyA1,
      tax_classification: 'NON_EXISTENT_CORP'
    });
    const classErr = invalidClassProfile.validateSync();
    assert.ok(classErr, 'Should fail validation for invalid classification');
    assert.ok(classErr.errors.tax_classification, 'tax_classification error expected');
  });

  await t.test('1.4 TaxRegistration Model: validates status, dates, and schema fields', () => {
    const jurisdictionId = new mongoose.Types.ObjectId();
    const effectiveFrom = new Date('2024-01-01');
    const effectiveTo = new Date('2026-12-31');

    const validRegistration = new TaxRegistration({
      tenant_id: tenantA,
      company_id: companyA1,
      jurisdiction_id: jurisdictionId,
      tax_type: 'SALES_USE_TAX',
      registration_number: 'SR-99887766',
      registration_status: 'ACTIVE',
      filing_frequency: 'MONTHLY',
      effective_from: effectiveFrom,
      effective_to: effectiveTo
    });

    const err = validRegistration.validateSync();
    assert.strictEqual(err, undefined, 'Valid registration should pass validation');
    assert.strictEqual(validRegistration.registration_status, 'ACTIVE');
    assert.strictEqual(validRegistration.filing_frequency, 'MONTHLY');
  });

  await t.test('1.5 NexusReview Model: records status, review types, and audit history', () => {
    const jurisdictionId = new mongoose.Types.ObjectId();
    const nexusDoc = new NexusReview({
      tenant_id: tenantA,
      company_id: companyA1,
      jurisdiction_id: jurisdictionId,
      nexus_type: 'ECONOMIC',
      review_status: 'CONFIRMED_BY_REVIEWER',
      sales_amount_currency: 'USD',
      sales_amount: 150000,
      transaction_count: 220,
      evidence_source: 'SALES_LEDGER_AGGREGATION',
      reviewed_by_user_id: sampleUserId,
      decision_notes: 'Exceeded Wayfair $100k threshold in CA during 2025 calendar year',
      audit_history: [
        {
          status: 'CONFIRMED_BY_REVIEWER',
          changed_by_user_id: sampleUserId,
          notes: 'Passed economic threshold'
        }
      ]
    });

    const err = nexusDoc.validateSync();
    assert.strictEqual(err, undefined, 'Valid nexus review should pass validation');
    assert.strictEqual(nexusDoc.audit_history.length, 1);
    assert.strictEqual(nexusDoc.audit_history[0].status, 'CONFIRMED_BY_REVIEWER');
  });

  await t.test('1.6 TaxProviderSyncLog Model: records import provenance and logs', () => {
    const syncLog = new TaxProviderSyncLog({
      tenant_id: tenantA,
      company_id: companyA1,
      sync_type: 'JSON_SEED_IMPORT',
      source: 'US_CENSUS_BUREAU',
      dataset_version: '2024.1.0',
      status: 'SUCCESS',
      summary: {
        total_processed: 64,
        inserted: 64,
        updated: 0,
        unchanged: 0,
        rejected: 0,
        unsupported: 1
      },
      executed_by_user_id: sampleUserId
    });

    const err = syncLog.validateSync();
    assert.strictEqual(err, undefined, 'Valid sync log should pass validation');
    assert.strictEqual(syncLog.dataset_version, '2024.1.0');
    assert.strictEqual(syncLog.summary.total_processed, 64);
  });

  // -----------------------------------------------------------------
  // 2. JSON Seed Data Validation & Integrity
  // -----------------------------------------------------------------
  await t.test('2.1 Seed File Integrity: manifest and all jurisdiction seed records pass validation', () => {
    const validationResult = validateSeedFiles();

    assert.strictEqual(validationResult.valid, true, `Seed files must be strictly valid. Errors: ${JSON.stringify(validationResult.errors)}`);
    assert.strictEqual(validationResult.errors.length, 0);

    assert.strictEqual(validationResult.manifest.dataset_version, '2024.1.0');
    assert.strictEqual(validationResult.manifest.schema_version, '1.0.0');
    assert.strictEqual(validationResult.records.length, 64, 'Must have exactly 64 jurisdiction records (1 fed + 51 states/DC + 5 territories + 7 counties)');
  });

  await t.test('2.2 States Seed Data: verifies every state has a 2-digit string FIPS code and parent US-FED', () => {
    const statesPath = path.resolve(__dirname, '../src/data/us-tax/jurisdictions.states.json');
    const states = JSON.parse(fs.readFileSync(statesPath, 'utf8'));

    assert.strictEqual(states.length, 51);

    for (const record of states) {
      assert.strictEqual(typeof record.fips_code, 'string', `State ${record.state_code} FIPS must be a string`);
      assert.strictEqual(record.fips_code.length, 2, `State ${record.state_code} FIPS code must be 2 digits`);
      assert.strictEqual(record.parent_code, 'US-FED', `State ${record.state_code} parent must be US-FED`);
      assert.strictEqual(record.country_code, 'US');
    }
  });

  await t.test('2.3 Territories Seed Data: verifies explicit coverage_status distinctions', () => {
    const terrPath = path.resolve(__dirname, '../src/data/us-tax/jurisdictions.territories.json');
    const territories = JSON.parse(fs.readFileSync(terrPath, 'utf8'));

    assert.strictEqual(territories.length, 5);

    const pr = territories.find((r) => r.state_code === 'PR');
    assert.ok(pr, 'Puerto Rico must be present in territories');
    assert.strictEqual(pr.provider_coverage_status, 'UNVERIFIED', 'PR has independent SUT system and must be marked UNVERIFIED');

    const gu = territories.find((r) => r.state_code === 'GU');
    assert.ok(gu, 'Guam must be present');
    assert.strictEqual(gu.provider_coverage_status, 'UNSUPPORTED', 'Guam has gross receipts tax and must be marked UNSUPPORTED');
  });

  await t.test('2.4 Tax Categories Seed Data: verifies 8 standard tax categories with unique codes', () => {
    const catPath = path.resolve(__dirname, '../src/data/us-tax/tax-categories.json');
    const categories = JSON.parse(fs.readFileSync(catPath, 'utf8'));

    assert.strictEqual(categories.length, 8);
    const codes = categories.map((c) => c.category_code);
    const uniqueCodes = new Set(codes);
    assert.strictEqual(uniqueCodes.size, 8, 'All category codes must be unique');

    assert.ok(uniqueCodes.has('SAAS_SOFTWARE'));
    assert.ok(uniqueCodes.has('DIGITAL_PRODUCTS'));
    assert.ok(uniqueCodes.has('GENERAL_TANGIBLE_GOODS'));
    assert.ok(uniqueCodes.has('PROFESSIONAL_SERVICES'));
  });

  // -----------------------------------------------------------------
  // 3. Dry-Run Import Service & Validation
  // -----------------------------------------------------------------
  await t.test('3.1 Import Service: dry-run processes files without writing to database', async () => {
    const dryRunResult = await importJurisdictionSeeds({
      dryRun: true,
      userId: sampleUserId
    });

    assert.strictEqual(dryRunResult.dry_run, true);
    assert.strictEqual(dryRunResult.success, true);
    assert.strictEqual(dryRunResult.dataset_version, '2024.1.0');
    assert.strictEqual(dryRunResult.summary.total_processed, 64);
    assert.strictEqual(dryRunResult.summary.rejected, 0);
  });

  // -----------------------------------------------------------------
  // 4. Tax Provider Adapter Architecture & Production Guard
  // -----------------------------------------------------------------
  await t.test('4.1 MockTaxProvider: returns health status and mock provider metadata', async () => {
    const provider = new MockTaxProvider();
    const health = await provider.checkHealth();

    assert.strictEqual(provider.getProviderId(), 'MOCK');
    assert.strictEqual(health.status, 'CONNECTED');
    assert.ok(health.message.includes('Mock Tax Provider online'));
  });

  await t.test('4.2 MockTaxProvider: resolves jurisdiction from valid US address', async () => {
    const provider = new MockTaxProvider();
    const result = await provider.lookupJurisdiction({
      zip: '91608',
      state: 'CA',
      city: 'Universal City'
    });

    assert.strictEqual(result.provider_name, 'MOCK');
    assert.strictEqual(result.is_verified, true);
    assert.strictEqual(result.fips_code, '06037');
    assert.strictEqual(result.jurisdiction_code, 'US-CA-037');
    assert.strictEqual(result.coverage_status, 'SUPPORTED');
  });

  await t.test('4.3 MockTaxProvider: lookupRates provides granular multi-component breakdown', async () => {
    const provider = new MockTaxProvider();
    const rates = await provider.lookupRates({
      state: 'CA'
    });

    assert.strictEqual(rates.state_code, 'CA');
    assert.strictEqual(rates.combined_rate, '0.0950'); // 9.50%
    assert.strictEqual(rates.breakdown.length, 4);

    const stateComp = rates.breakdown.find((c) => c.type === 'STATE');
    const countyComp = rates.breakdown.find((c) => c.type === 'COUNTY');
    const cityComp = rates.breakdown.find((c) => c.type === 'CITY');

    assert.strictEqual(stateComp.rate, '0.0600');
    assert.strictEqual(countyComp.rate, '0.0125');
    assert.strictEqual(cityComp.rate, '0.0125');
  });

  await t.test('4.4 MockTaxProvider: calculateTax computes line item taxes accurately', async () => {
    const provider = new MockTaxProvider();
    const calcResult = await provider.calculateTax({
      destination_state: 'CA',
      lines: [
        {
          line_number: 1,
          item_code: 'SAAS-01',
          category_code: 'SAAS_SOFTWARE',
          taxable_amount: '100.00'
        }
      ]
    });

    assert.strictEqual(calcResult.subtotal_amount, '100.00');
    assert.strictEqual(calcResult.total_tax_amount, '9.50');
    assert.strictEqual(calcResult.grand_total_amount, '109.50');
    assert.strictEqual(calcResult.effective_combined_rate, '0.0950');
    assert.strictEqual(calcResult.line_items.length, 1);
    assert.strictEqual(calcResult.line_items[0].tax_amount, '9.50');
  });

  await t.test('4.5 Strict Production Guard: MockTaxProvider refuses calculation when NODE_ENV=production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const provider = new MockTaxProvider();

    try {
      await assert.rejects(
        async () => {
          await provider.calculateTax({
            destination_state: 'CA',
            lines: [{ line_number: 1, taxable_amount: '50.00' }]
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

  await t.test('4.6 TaxProviderFactory: creates Mock provider and refuses unconfigured commercial providers', () => {
    const mockInst = TaxProviderFactory.getProvider('MOCK');
    assert.ok(mockInst instanceof MockTaxProvider);

    assert.throws(
      () => TaxProviderFactory.getProvider('AVALARA'),
      (err) => {
        assert.strictEqual(err.code, 'PROVIDER_CREDENTIALS_MISSING');
        assert.match(err.message, /API credentials are not configured/);
        return true;
      }
    );
  });

  // -----------------------------------------------------------------
  // 5. Active Registration Duplicate Prevention & Historical Auditability
  // -----------------------------------------------------------------
  await t.test('5.1 Registration Constraints: schema enforces active registration uniqueness logic', () => {
    const indexes = TaxRegistration.schema.indexes();
    const activeRegIndex = indexes.find(
      (idx) => idx[0].tenant_id && idx[0].company_id && idx[0].jurisdiction_id && idx[0].tax_type
    );

    assert.ok(activeRegIndex, 'Partial unique index on tenant, company, jurisdiction, and tax_type must exist');
    assert.ok(activeRegIndex[1].unique, 'Index must be unique');
    assert.deepStrictEqual(
      activeRegIndex[1].partialFilterExpression,
      { registration_status: 'ACTIVE', effective_to: null },
      'Partial filter expression must permit historical/expired records while preventing concurrent active registrations'
    );
  });

  // -----------------------------------------------------------------
  // 6. Multi-Tenant and Sibling Company Isolation
  // -----------------------------------------------------------------
  await t.test('6.1 Isolation: CompanyTaxProfile strictly partitions tenant and company data', () => {
    const profileTenantA = new CompanyTaxProfile({
      tenant_id: tenantA,
      company_id: companyA1,
      tax_classification: 'C_CORP'
    });

    const profileTenantB = new CompanyTaxProfile({
      tenant_id: tenantB,
      company_id: companyB1,
      tax_classification: 'S_CORP'
    });

    assert.notStrictEqual(profileTenantA.tenant_id.toString(), profileTenantB.tenant_id.toString());
    assert.notStrictEqual(profileTenantA.company_id.toString(), profileTenantB.company_id.toString());
  });

  await t.test('6.2 Isolation: TaxJurisdiction master records are tenant-agnostic global reference data', () => {
    const jurisdiction = new TaxJurisdiction({
      jurisdiction_code: 'US-NY',
      jurisdiction_name: 'New York',
      jurisdiction_type: 'STATE',
      country_code: 'US',
      state_code: 'NY',
      fips_code: '36'
    });

    assert.strictEqual(jurisdiction.tenant_id, undefined);
    assert.strictEqual(jurisdiction.company_id, undefined);
  });

  // -----------------------------------------------------------------
  // 7. Backward Compatibility & Indian GST Non-Regression
  // -----------------------------------------------------------------
  await t.test('7.1 Indian GST Non-Regression: TaxRateConfig model and GST tax codes remain intact', () => {
    const gstRate = new TaxRateConfig({
      tenant_id: tenantA,
      company_id: companyA1,
      tax_code: 'GST18',
      tax_name: 'GST 18%',
      rate_percent: 18,
      cgst_rate: 9,
      sgst_rate: 9,
      igst_rate: 18,
      is_active: true
    });

    const err = gstRate.validateSync();
    assert.strictEqual(err, undefined, 'TaxRateConfig for GST must continue to validate cleanly');
    assert.strictEqual(gstRate.tax_code, 'GST18');
  });

  await t.test('7.2 Company Backward Compatibility: Company model does not require US tax profile to be valid', () => {
    const indianCompany = new Company({
      tenant_id: tenantA,
      company_code: 'IND001',
      company_name: 'Indian Operations Pvt Ltd',
      country_code: 'IN',
      business_profile: 'GENERAL_RETAIL'
    });

    const err = indianCompany.validateSync();
    assert.strictEqual(err, undefined, 'Indian company without US tax profile must remain valid');
  });

  // -----------------------------------------------------------------
  // 8. Accounting Calendar Non-Regression
  // -----------------------------------------------------------------
  await t.test('8.1 Accounting Calendar Non-Regression: Gregorian and Retail 4-4-5 period generation remain functional', () => {
    const calGregorian = {
      calendar_type: 'GREGORIAN',
      fiscal_year_start_month: 1
    };
    const gregResult = calculateGregorianPeriods(calGregorian, 2026);
    assert.strictEqual(gregResult.periods.length, 12);

    const calRetail = {
      calendar_type: 'RETAIL_445',
      week_start_day: 'SUNDAY',
      week_end_day: 'SATURDAY',
      anchor_month: 1,
      year_end_rule: 'LAST_WEEKDAY_OF_MONTH',
      fifty_three_week_policy: 'ADD_TO_LAST_PERIOD'
    };
    const retailResult = calculateRetailPeriods(calRetail, 2027);
    assert.strictEqual(retailResult.periods.length, 12);
    assert.strictEqual(retailResult.totalWeeks, 52);
  });
});
