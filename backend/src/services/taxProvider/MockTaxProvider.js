const ITaxProvider = require('./ITaxProvider');
const fs = require('fs');
const path = require('path');
const BigNumber = require('bignumber.js');

const FIXTURES_DIR = path.join(__dirname, '../../data/us-tax/provider-fixtures');

class MockTaxProvider extends ITaxProvider {
  constructor(config = {}) {
    super(config);
    this.providerName = 'MOCK';
    this.environment = config.environment || 'SANDBOX';
    this.fixtures = this._loadFixtures();
  }

  _loadFixtures() {
    try {
      const addressPath = path.join(FIXTURES_DIR, 'address_lookup_fixture.json');
      const ratePath = path.join(FIXTURES_DIR, 'rate_lookup_fixture.json');
      const calcPath = path.join(FIXTURES_DIR, 'calculation_fixture.json');

      return {
        address: fs.existsSync(addressPath) ? JSON.parse(fs.readFileSync(addressPath, 'utf8')) : {},
        rates: fs.existsSync(ratePath) ? JSON.parse(fs.readFileSync(ratePath, 'utf8')) : {},
        calculation: fs.existsSync(calcPath) ? JSON.parse(fs.readFileSync(calcPath, 'utf8')) : {}
      };
    } catch (err) {
      console.warn('[MockTaxProvider] Warning loading test fixtures:', err.message);
      return { address: {}, rates: {}, calculation: {} };
    }
  }

  getProviderId() {
    return 'MOCK';
  }

  /**
   * Health check simulation.
   */
  async checkHealth() {
    // In production, mock provider warns that live provider is missing
    if (process.env.NODE_ENV === 'production') {
      return {
        status: 'NOT_CONFIGURED',
        latencyMs: 1,
        message: 'Mock tax provider active in development mode. No commercial tax provider configured for production.'
      };
    }

    return {
      status: 'CONNECTED',
      latencyMs: 12,
      message: 'Mock Tax Provider online with sanitized test fixtures.'
    };
  }

  /**
   * Address / Jurisdiction lookup.
   */
  async lookupJurisdiction(addressParams = {}) {
    // Mandatory production guard
    this._assertNotProduction('lookupJurisdiction');

    const state = (addressParams.state || '').toUpperCase().trim();
    const zip = (addressParams.zip || '').trim();

    if (!state) {
      throw new Error('State code is required for jurisdiction lookup');
    }

    // Check valid fixture match
    const validMatches = this.fixtures.address?.valid_addresses || [];
    const match = validMatches.find(v => v.input.state === state || v.input.zip === zip);

    if (match) {
      return {
        provider_name: 'MOCK',
        is_verified: true,
        confidence: match.confidence,
        normalized_address: match.normalized,
        jurisdiction_code: match.normalized.jurisdiction_code,
        fips_code: match.normalized.fips_code,
        coverage_status: 'SUPPORTED'
      };
    }

    // Default fallback mock resolution
    return {
      provider_name: 'MOCK',
      is_verified: false,
      confidence: 'STATE_CENTROID',
      normalized_address: {
        street: addressParams.street || '',
        city: addressParams.city || '',
        state: state,
        zip: zip,
        country: 'US',
        jurisdiction_code: `US-${state}`,
        fips_code: null
      },
      jurisdiction_code: `US-${state}`,
      coverage_status: 'UNVERIFIED'
    };
  }

  /**
   * Combined rate lookup by location.
   */
  async lookupRates(locationParams = {}) {
    this._assertNotProduction('lookupRates');

    const state = (locationParams.state || '').toUpperCase().trim();
    if (!state) {
      throw new Error('State code is required for rate lookup');
    }

    const stateRates = this.fixtures.rates?.rates_by_state || {};
    const record = stateRates[state];

    if (!record) {
      return {
        provider_name: 'MOCK',
        state_code: state,
        combined_rate: '0.0000',
        breakdown: [],
        coverage_status: 'UNSUPPORTED',
        is_fallback: true,
        message: `No rate fixture available for state "${state}". Provider tax support unverified.`
      };
    }

    return {
      provider_name: 'MOCK',
      state_code: state,
      combined_rate: record.combined_rate,
      breakdown: record.breakdown,
      freight_taxable: record.freight_taxable,
      effective_date: record.effective_date,
      coverage_status: 'SUPPORTED',
      is_fallback: false,
      retrieved_at: new Date().toISOString()
    };
  }

  /**
   * Mock transaction tax calculation.
   */
  async calculateTax(transactionPayload = {}) {
    this._assertNotProduction('calculateTax');

    const destStateRaw = transactionPayload.destination_state ||
      transactionPayload.destination_address?.state ||
      'CA';
    const destinationState = destStateRaw.toUpperCase().trim();
    const rateInfo = await this.lookupRates({ state: destinationState });
    const combinedRateBn = new BigNumber(rateInfo.combined_rate || '0');
    const isFreightTaxableInState = Boolean(rateInfo.freight_taxable);

    const isCustomerExempt = Boolean(
      transactionPayload.customer_exemption_code ||
      transactionPayload.is_customer_exempt ||
      transactionPayload.customer_tax_id?.startsWith('EXEMPT')
    );

    const lines = transactionPayload.lines || transactionPayload.line_items || [];
    let calculatedSubtotal = new BigNumber(0);
    let calculatedTaxableSubtotal = new BigNumber(0);
    let calculatedExemptSubtotal = new BigNumber(0);
    let calculatedLinesTax = new BigNumber(0);
    const calculatedLines = [];
    const jurisdictionTotals = new Map();

    // Initialize jurisdiction breakdown buckets
    (rateInfo.breakdown || []).forEach(b => {
      jurisdictionTotals.set(b.jurisdiction_name, {
        jurisdiction_name: b.jurisdiction_name,
        jurisdiction_type: b.type,
        jurisdiction_code: b.jurisdiction_code || '',
        tax_type: 'SALES_TAX',
        rate: b.rate,
        taxable_amount: new BigNumber(0),
        tax_amount: new BigNumber(0)
      });
    });

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const qty = new BigNumber(line.quantity || 1);
      const unitPrice = new BigNumber(line.unit_price || 0);
      const discount = new BigNumber(line.discount_amount || 0);

      let lineAmtBn;
      if (line.taxable_amount !== undefined && line.unit_price === undefined) {
        lineAmtBn = new BigNumber(line.taxable_amount || 0);
      } else {
        lineAmtBn = qty.times(unitPrice).minus(discount);
        if (lineAmtBn.isNegative()) lineAmtBn = new BigNumber(0);
      }

      calculatedSubtotal = calculatedSubtotal.plus(lineAmtBn);

      // Determine exemption: customer-level, line-level, or statutory category-level
      const catCode = (line.category_code || 'GENERAL_TANGIBLE_GOODS').toUpperCase().trim();
      const isStatutoryExemptCat = (catCode === 'PROFESSIONAL_SERVICES' || catCode === 'EXEMPT_HEALTHCARE');
      const isLineExempt = isCustomerExempt || Boolean(line.is_exempt) || isStatutoryExemptCat;

      let lineTaxableBn = new BigNumber(0);
      let lineExemptBn = new BigNumber(0);
      let lineTaxBn = new BigNumber(0);

      if (isLineExempt) {
        lineExemptBn = lineAmtBn;
        calculatedExemptSubtotal = calculatedExemptSubtotal.plus(lineExemptBn);
      } else {
        lineTaxableBn = lineAmtBn;
        calculatedTaxableSubtotal = calculatedTaxableSubtotal.plus(lineTaxableBn);

        if (combinedRateBn.isGreaterThan(0) && lineTaxableBn.isGreaterThan(0)) {
          lineTaxBn = lineTaxableBn.times(combinedRateBn).dp(2, BigNumber.ROUND_HALF_UP);
        }
      }

      calculatedLinesTax = calculatedLinesTax.plus(lineTaxBn);

      // Line-level jurisdiction breakdown
      const lineBreakdown = (rateInfo.breakdown || []).map(b => {
        const compRateBn = new BigNumber(b.rate || 0);
        let compTaxBn = new BigNumber(0);
        if (!isLineExempt && compRateBn.isGreaterThan(0) && lineTaxableBn.isGreaterThan(0)) {
          compTaxBn = lineTaxableBn.times(compRateBn).dp(2, BigNumber.ROUND_HALF_UP);
        }

        // Accumulate in summary map
        const sumItem = jurisdictionTotals.get(b.jurisdiction_name);
        if (sumItem) {
          sumItem.taxable_amount = sumItem.taxable_amount.plus(lineTaxableBn);
          sumItem.tax_amount = sumItem.tax_amount.plus(compTaxBn);
        }

        return {
          jurisdiction_code: b.jurisdiction_code || '',
          jurisdiction_name: b.jurisdiction_name,
          jurisdiction_type: b.type,
          tax_type: 'SALES_TAX',
          rate: b.rate,
          taxable_amount: lineTaxableBn.toFixed(2),
          tax_amount: compTaxBn.toFixed(2)
        };
      });

      calculatedLines.push({
        line_number: line.line_number || i + 1,
        line_id: line.line_id || String(i + 1),
        item_code: line.item_code || '',
        item_description: line.item_description || '',
        category_code: catCode,
        quantity: qty.toNumber(),
        unit_price: unitPrice.toFixed(2),
        discount_amount: discount.toFixed(2),
        line_amount: lineAmtBn.toFixed(2),
        taxable_amount: lineTaxableBn.toFixed(2),
        exempt_amount: lineExemptBn.toFixed(2),
        tax_amount: lineTaxBn.toFixed(2),
        rate: combinedRateBn.toFixed(4),
        is_exempt: isLineExempt,
        exemption_reason: isLineExempt
          ? (line.exemption_reason || (isCustomerExempt ? 'CUSTOMER_EXEMPTION' : isStatutoryExemptCat ? 'STATUTORY_CATEGORY_EXEMPTION' : 'EXEMPT'))
          : '',
        jurisdiction_breakdown: lineBreakdown
      });
    }

    // Freight calculation
    const freightAmtBn = new BigNumber(transactionPayload.freight_amount || 0);
    let freightTaxBn = new BigNumber(0);
    const freightTaxable = isFreightTaxableInState && !isCustomerExempt && freightAmtBn.isGreaterThan(0);

    if (freightTaxable && combinedRateBn.isGreaterThan(0)) {
      freightTaxBn = freightAmtBn.times(combinedRateBn).dp(2, BigNumber.ROUND_HALF_UP);

      // Accumulate freight into jurisdiction totals
      (rateInfo.breakdown || []).forEach(b => {
        const compRateBn = new BigNumber(b.rate || 0);
        const compTaxBn = freightAmtBn.times(compRateBn).dp(2, BigNumber.ROUND_HALF_UP);
        const sumItem = jurisdictionTotals.get(b.jurisdiction_name);
        if (sumItem) {
          sumItem.taxable_amount = sumItem.taxable_amount.plus(freightAmtBn);
          sumItem.tax_amount = sumItem.tax_amount.plus(compTaxBn);
        }
      });
    }

    const totalTaxBn = calculatedLinesTax.plus(freightTaxBn);
    const grandTotalBn = calculatedSubtotal.plus(freightAmtBn).plus(totalTaxBn);

    // Convert jurisdiction summary map to array
    const jurisdictionSummaries = Array.from(jurisdictionTotals.values()).map(js => ({
      jurisdiction_code: js.jurisdiction_code,
      jurisdiction_name: js.jurisdiction_name,
      jurisdiction_type: js.jurisdiction_type,
      tax_type: js.tax_type,
      rate: js.rate,
      taxable_amount: js.taxable_amount.toFixed(2),
      tax_amount: js.tax_amount.toFixed(2)
    }));

    return {
      provider_transaction_id: `MOCK-TX-${Date.now()}`,
      provider_name: 'MOCK',
      correlation_id: transactionPayload.correlation_id || `CORR-${Date.now()}`,
      calculated_at: new Date().toISOString(),
      tax_country: 'US',
      destination_state: destinationState,
      sourcing_rule: 'DESTINATION',
      subtotal_amount: calculatedSubtotal.toFixed(2),
      taxable_amount: (calculatedTaxableSubtotal.plus(freightTaxable ? freightAmtBn : 0)).toFixed(2),
      exempt_amount: calculatedExemptSubtotal.toFixed(2),
      freight_amount: freightAmtBn.toFixed(2),
      freight_taxable: freightTaxable,
      freight_tax_amount: freightTaxBn.toFixed(2),
      total_tax_amount: totalTaxBn.toFixed(2),
      grand_total_amount: grandTotalBn.toFixed(2),
      effective_combined_rate: combinedRateBn.toFixed(4),
      line_items: calculatedLines,
      jurisdiction_summaries: jurisdictionSummaries,
      is_mock_response: true
    };
  }

  /**
   * Retrieves categories catalog.
   */
  async getTaxCategories() {
    const catPath = path.join(__dirname, '../../data/us-tax/tax-categories.json');
    if (fs.existsSync(catPath)) {
      return JSON.parse(fs.readFileSync(catPath, 'utf8'));
    }
    return [];
  }

  /**
   * Commits/finalizes transaction in mock provider.
   */
  async commitTransaction(params = {}) {
    this._assertNotProduction('commitTransaction');
    return {
      status: 'COMMITTED',
      provider_transaction_id: params.provider_transaction_id || `MOCK-COMMITTED-${Date.now()}`,
      committed_at: new Date()
    };
  }

  /**
   * Voids/cancels transaction in mock provider.
   */
  async voidTransaction(params = {}) {
    this._assertNotProduction('voidTransaction');
    return {
      status: 'VOIDED',
      provider_transaction_id: params.provider_transaction_id,
      voided_at: new Date()
    };
  }

  /**
   * Production Safety Guard: Refuses mock calculation in production environments.
   * @private
   */
  _assertNotProduction(operationName) {
    if (process.env.NODE_ENV === 'production' && !this.config.allowMockInProduction) {
      const err = new Error(
        `PRODUCTION_MOCK_DISALLOWED: Tax provider operation "${operationName}" refused. Synthetic mock tax provider cannot be used for live calculations in production. Configure a verified commercial tax provider (e.g. Avalara, TaxJar, Vertex).`
      );
      err.code = 'PRODUCTION_MOCK_DISALLOWED';
      err.statusCode = 503;
      throw err;
    }
  }
}

module.exports = MockTaxProvider;
