const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  TaxCalculationSnapshot,
  CompanyTaxProfile,
  TaxRegistration,
  NexusReview,
  TaxJurisdiction
} = require('../models');
const TaxProviderFactory = require('./taxProvider/TaxProviderFactory');

// Standard US 2-letter state codes
const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'GU', 'VI', 'MP', 'AS'
]);

/**
 * Validates the transaction tax calculation request payload against schema requirements.
 *
 * @param {Object} payload
 * @returns {Object} Sanitized payload
 * @throws {Error} with statusCode 400 on validation failure
 */
function validateCalculationRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const err = new Error('VALIDATION_ERROR: Request body must be a valid JSON object.');
    err.statusCode = 400;
    throw err;
  }

  // Transaction ID
  const transactionId = (payload.transaction_id || '').trim();
  if (!transactionId) {
    const err = new Error('VALIDATION_ERROR: "transaction_id" is required and cannot be empty.');
    err.statusCode = 400;
    throw err;
  }

  // Transaction Type
  const validTypes = ['SALE', 'PURCHASE', 'REFUND', 'ESTIMATE'];
  const transactionType = (payload.transaction_type || 'SALE').toUpperCase().trim();
  if (!validTypes.includes(transactionType)) {
    const err = new Error(`VALIDATION_ERROR: Invalid "transaction_type". Supported: ${validTypes.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  // Destination Address
  const destAddress = payload.destination_address || {};
  const destState = (destAddress.state || payload.destination_state || '').toUpperCase().trim();
  if (!destState) {
    const err = new Error('VALIDATION_ERROR: Destination state code is required ("destination_address.state").');
    err.statusCode = 400;
    throw err;
  }
  if (!US_STATES.has(destState)) {
    const err = new Error(`VALIDATION_ERROR: "${destState}" is not a recognized US state or territory postal code.`);
    err.statusCode = 400;
    throw err;
  }

  // Line items
  const rawLines = payload.lines || payload.line_items;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    const err = new Error('VALIDATION_ERROR: At least one line item is required in "line_items" or "lines".');
    err.statusCode = 400;
    throw err;
  }

  const sanitizedLines = rawLines.map((line, idx) => {
    const lineNum = line.line_number || idx + 1;
    const itemCode = (line.item_code || `ITEM-${lineNum}`).trim();
    const itemDesc = (line.item_description || line.description || '').trim();
    const categoryCode = (line.category_code || 'GENERAL_TANGIBLE_GOODS').toUpperCase().trim();

    let qty = 1;
    if (line.quantity !== undefined) {
      qty = Number(line.quantity);
      if (isNaN(qty) || qty <= 0) {
        const err = new Error(`VALIDATION_ERROR: Line ${lineNum} has invalid quantity (${line.quantity}). Must be greater than 0.`);
        err.statusCode = 400;
        throw err;
      }
    }

    let unitPrice = 0;
    if (line.unit_price !== undefined) {
      unitPrice = Number(line.unit_price);
      if (isNaN(unitPrice) || unitPrice < 0) {
        const err = new Error(`VALIDATION_ERROR: Line ${lineNum} has negative or invalid unit_price (${line.unit_price}).`);
        err.statusCode = 400;
        throw err;
      }
    }

    let discount = 0;
    if (line.discount_amount !== undefined) {
      discount = Number(line.discount_amount);
      if (isNaN(discount) || discount < 0) {
        const err = new Error(`VALIDATION_ERROR: Line ${lineNum} has negative or invalid discount_amount (${line.discount_amount}).`);
        err.statusCode = 400;
        throw err;
      }
    }

    let taxableAmt = undefined;
    if (line.taxable_amount !== undefined) {
      taxableAmt = Number(line.taxable_amount);
      if (isNaN(taxableAmt) || taxableAmt < 0) {
        const err = new Error(`VALIDATION_ERROR: Line ${lineNum} has negative or invalid taxable_amount (${line.taxable_amount}).`);
        err.statusCode = 400;
        throw err;
      }
    }

    return {
      line_number: lineNum,
      line_id: line.line_id || String(lineNum),
      item_code: itemCode,
      item_description: itemDesc,
      category_code: categoryCode,
      quantity: qty,
      unit_price: unitPrice.toFixed(2),
      discount_amount: discount.toFixed(2),
      taxable_amount: taxableAmt !== undefined ? taxableAmt.toFixed(2) : undefined,
      is_exempt: Boolean(line.is_exempt),
      exemption_reason: (line.exemption_reason || '').trim()
    };
  });

  // Freight
  let freightAmt = 0;
  if (payload.freight_amount !== undefined) {
    freightAmt = Number(payload.freight_amount);
    if (isNaN(freightAmt) || freightAmt < 0) {
      const err = new Error(`VALIDATION_ERROR: "freight_amount" must be non-negative (${payload.freight_amount}).`);
      err.statusCode = 400;
      throw err;
    }
  }

  return {
    transaction_id: transactionId,
    transaction_type: transactionType,
    document_number: (payload.document_number || '').trim(),
    document_id: payload.document_id || null,
    transaction_date: payload.transaction_date ? new Date(payload.transaction_date) : new Date(),
    currency: (payload.currency || 'USD').toUpperCase().trim(),
    origin_address: {
      street: payload.origin_address?.street || '',
      city: payload.origin_address?.city || '',
      state: (payload.origin_address?.state || '').toUpperCase().trim(),
      zip: payload.origin_address?.zip || '',
      country: (payload.origin_address?.country || 'US').toUpperCase().trim()
    },
    destination_address: {
      street: destAddress.street || '',
      city: destAddress.city || '',
      state: destState,
      zip: destAddress.zip || '',
      country: (destAddress.country || 'US').toUpperCase().trim()
    },
    customer_tax_id: (payload.customer_tax_id || '').trim(),
    customer_exemption_code: (payload.customer_exemption_code || '').trim(),
    freight_amount: freightAmt.toFixed(2),
    lines: sanitizedLines,
    correlation_id: payload.correlation_id || `CORR-${transactionId}`
  };
}

/**
 * Calculates US sales & use taxes for a transaction payload.
 *
 * @param {Object} rawPayload - Raw calculation payload
 * @param {Object} context - { tenantId, companyId, userId }
 * @param {Object} [options] - Optional execution flags
 * @returns {Promise<Object>} Normalized tax calculation response
 */
async function calculateTransactionTax(rawPayload, context = {}, options = {}) {
  const sanitized = validateCalculationRequest(rawPayload);

  const tenantId = context.tenantId || rawPayload.tenant_id;
  const companyId = context.companyId || rawPayload.company_id;

  if (!tenantId || !companyId) {
    const err = new Error('VALIDATION_ERROR: tenant_id and company_id context are required.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Resolve Company Tax Profile
  let profile = null;
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    profile = await CompanyTaxProfile.findOne({
      tenant_id: tenantId,
      company_id: companyId
    });
  }

  // Profile status check
  if (profile && profile.profile_status === 'ARCHIVED') {
    const err = new Error('TAX_PROFILE_ARCHIVED: Company tax profile is archived. Calculations disabled.');
    err.statusCode = 403;
    throw err;
  }

  // Provider resolution
  const configuredProvider = options.providerName ||
    profile?.tax_provider?.provider_name ||
    'MOCK';

  const configuredEnv = options.environment ||
    profile?.tax_provider?.environment ||
    (process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX');

  // Strict Production Mock Guard
  if (process.env.NODE_ENV === 'production' && configuredProvider === 'MOCK' && !options.allowMockInProduction) {
    const err = new Error(
      'PRODUCTION_MOCK_DISALLOWED: Tax provider operation "calculateTax" refused. Synthetic mock tax provider cannot be used for live calculations in production. Configure a verified commercial tax provider (e.g. Avalara, TaxJar, Vertex).'
    );
    err.code = 'PRODUCTION_MOCK_DISALLOWED';
    err.statusCode = 503;
    throw err;
  }

  // 2. Resolve Registered Nexus in Destination State
  let hasActiveRegistration = false;
  let nexusStatus = 'UNREVIEWED';

  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const reg = await TaxRegistration.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        state_code: sanitized.destination_address.state,
        registration_status: 'ACTIVE'
      });
      hasActiveRegistration = Boolean(reg);

      const review = await NexusReview.findOne({
        tenant_id: tenantId,
        company_id: companyId
      }).populate({
        path: 'jurisdiction_id',
        match: { state_code: sanitized.destination_address.state, jurisdiction_type: 'STATE' }
      });

      if (review && review.jurisdiction_id) {
        nexusStatus = review.review_status;
      } else if (hasActiveRegistration) {
        nexusStatus = 'CONFIRMED_BY_REGISTRATION';
      }
    } catch (ignoreErr) {
      // In offline/unit test mode without populated tables, proceed gracefully
    }
  }

  // 3. Resolve Provider Adapter & Execute Calculation
  const provider = TaxProviderFactory.getProvider({
    providerName: configuredProvider,
    environment: configuredEnv,
    allowMockInProduction: Boolean(options.allowMockInProduction)
  });

  const providerResult = await provider.calculateTax({
    ...sanitized,
    destination_state: sanitized.destination_address.state
  });

  // 4. Mathematical Precision & Cross-Verification (BigNumber.js)
  const subtotalBn = new BigNumber(providerResult.subtotal_amount || 0);
  const taxableBn = new BigNumber(providerResult.taxable_amount || 0);
  const exemptBn = new BigNumber(providerResult.exempt_amount || 0);
  const freightBn = new BigNumber(providerResult.freight_amount || 0);
  const freightTaxBn = new BigNumber(providerResult.freight_tax_amount || 0);
  const totalTaxBn = new BigNumber(providerResult.total_tax_amount || 0);
  const grandTotalBn = new BigNumber(providerResult.grand_total_amount || 0);

  // Line item tax verification
  const lineTaxesSum = (providerResult.line_items || []).reduce(
    (acc, l) => acc.plus(new BigNumber(l.tax_amount || 0)),
    new BigNumber(0)
  );

  const calculatedTotalTaxBn = lineTaxesSum.plus(freightTaxBn);

  // Reconcile total difference if any due to half-up aggregation
  const diffBn = totalTaxBn.minus(calculatedTotalTaxBn).abs();
  if (diffBn.isGreaterThan('0.02')) {
    console.warn(`[usTaxCalculationService] Line tax sum ($${calculatedTotalTaxBn.toFixed(2)}) differs from provider total tax ($${totalTaxBn.toFixed(2)}) by $${diffBn.toFixed(2)}.`);
  }

  // Effective combined rate calculation
  let effectiveRate = '0.0000';
  if (taxableBn.isGreaterThan(0)) {
    effectiveRate = totalTaxBn.dividedBy(taxableBn).dp(4, BigNumber.ROUND_HALF_UP).toFixed(4);
  } else if (providerResult.effective_combined_rate) {
    effectiveRate = providerResult.effective_combined_rate;
  }

  const normalizedResult = {
    transaction_id: sanitized.transaction_id,
    transaction_type: sanitized.transaction_type,
    document_number: sanitized.document_number,
    document_id: sanitized.document_id,
    transaction_date: sanitized.transaction_date,
    calculation_date: new Date(),
    provider_name: provider.getProviderId(),
    provider_transaction_id: providerResult.provider_transaction_id || `TX-${Date.now()}`,
    environment: configuredEnv,
    currency: sanitized.currency,
    origin_address: sanitized.origin_address,
    destination_address: sanitized.destination_address,
    customer_tax_id: sanitized.customer_tax_id,
    customer_exemption_code: sanitized.customer_exemption_code,
    sourcing_rule: providerResult.sourcing_rule || 'DESTINATION',
    subtotal_amount: subtotalBn.toFixed(2),
    taxable_amount: taxableBn.toFixed(2),
    exempt_amount: exemptBn.toFixed(2),
    freight_amount: freightBn.toFixed(2),
    freight_taxable: Boolean(providerResult.freight_taxable),
    freight_tax_amount: freightTaxBn.toFixed(2),
    total_tax_amount: totalTaxBn.toFixed(2),
    grand_total_amount: grandTotalBn.toFixed(2),
    effective_combined_rate: effectiveRate,
    nexus_assessment: {
      destination_state: sanitized.destination_address.state,
      has_active_registration: hasActiveRegistration,
      nexus_review_status: nexusStatus,
      tax_collection_required: hasActiveRegistration || nexusStatus === 'CONFIRMED_BY_REVIEWER'
    },
    line_items: providerResult.line_items || [],
    jurisdiction_summaries: providerResult.jurisdiction_summaries || [],
    is_mock: Boolean(providerResult.is_mock_response)
  };

  // 5. Persistence of Snapshot for Audit Trail & Future Invoicing Linkage
  if (options.persistSnapshot !== false && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      let snapshot = await TaxCalculationSnapshot.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        transaction_id: sanitized.transaction_id
      });

      if (snapshot) {
        if (snapshot.status === 'COMMITTED') {
          const err = new Error(`IMMUTABLE_SNAPSHOT: Transaction "${sanitized.transaction_id}" calculation snapshot is already COMMITTED and immutable.`);
          err.statusCode = 409;
          throw err;
        }

        Object.assign(snapshot, {
          transaction_type: normalizedResult.transaction_type,
          document_number: normalizedResult.document_number,
          document_id: normalizedResult.document_id,
          calculation_date: normalizedResult.calculation_date,
          provider_name: normalizedResult.provider_name,
          provider_transaction_id: normalizedResult.provider_transaction_id,
          environment: normalizedResult.environment,
          currency: normalizedResult.currency,
          origin_address: normalizedResult.origin_address,
          destination_address: normalizedResult.destination_address,
          customer_tax_id: normalizedResult.customer_tax_id,
          customer_exemption_code: normalizedResult.customer_exemption_code,
          sourcing_rule: normalizedResult.sourcing_rule,
          subtotal_amount: normalizedResult.subtotal_amount,
          taxable_amount: normalizedResult.taxable_amount,
          exempt_amount: normalizedResult.exempt_amount,
          freight_amount: normalizedResult.freight_amount,
          freight_taxable: normalizedResult.freight_taxable,
          freight_tax_amount: normalizedResult.freight_tax_amount,
          total_tax_amount: normalizedResult.total_tax_amount,
          grand_total_amount: normalizedResult.grand_total_amount,
          effective_combined_rate: normalizedResult.effective_combined_rate,
          line_items: normalizedResult.line_items,
          jurisdiction_summaries: normalizedResult.jurisdiction_summaries,
          is_mock: normalizedResult.is_mock,
          row_version: (snapshot.row_version || 1) + 1
        });
        await snapshot.save();
      } else {
        snapshot = await TaxCalculationSnapshot.create({
          tenant_id: tenantId,
          company_id: companyId,
          ...normalizedResult,
          status: 'CALCULATED'
        });
      }
      normalizedResult.snapshot_id = snapshot._id;
    } catch (saveErr) {
      if (saveErr.statusCode === 409) throw saveErr;
      console.warn('[usTaxCalculationService] Warning persisting tax snapshot:', saveErr.message);
    }
  }

  return normalizedResult;
}

/**
 * Retrieves a calculation snapshot by transaction ID.
 */
async function getCalculationSnapshot(transactionId, context = {}) {
  const query = {
    tenant_id: context.tenantId,
    company_id: context.companyId,
    transaction_id: transactionId
  };

  const snapshot = await TaxCalculationSnapshot.findOne(query);
  if (!snapshot) {
    const err = new Error(`Tax calculation snapshot not found for transaction "${transactionId}"`);
    err.statusCode = 404;
    throw err;
  }
  return snapshot;
}

/**
 * Lists calculation snapshots for the company.
 */
async function listCalculationSnapshots(filter = {}, context = {}, pagination = {}) {
  const query = {
    tenant_id: context.tenantId,
    company_id: context.companyId
  };

  if (filter.transaction_type) query.transaction_type = filter.transaction_type;
  if (filter.status) query.status = filter.status;
  if (filter.destination_state) query['destination_address.state'] = filter.destination_state.toUpperCase();

  const limit = Math.min(Number(pagination.limit || 50), 100);
  const skip = Number(pagination.skip || 0);

  const [items, total] = await Promise.all([
    TaxCalculationSnapshot.find(query).sort({ created_at: -1 }).skip(skip).limit(limit),
    TaxCalculationSnapshot.countDocuments(query)
  ]);

  return { items, total, limit, skip };
}

/**
 * Commits a calculation snapshot to make it immutable.
 */
async function commitCalculationSnapshot(transactionId, context = {}) {
  const snapshot = await getCalculationSnapshot(transactionId, context);
  if (snapshot.status === 'COMMITTED') {
    return snapshot;
  }
  snapshot.status = 'COMMITTED';
  await snapshot.save();
  return snapshot;
}

module.exports = {
  US_STATES,
  validateCalculationRequest,
  calculateTransactionTax,
  getCalculationSnapshot,
  listCalculationSnapshots,
  commitCalculationSnapshot
};
