const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  CommercialDocument,
  Company,
  Party,
  StockItem,
  UnitOfMeasurement,
  Godown,
  LedgerAccount,
  CompanyTaxProfile
} = require('../models');
const {
  determineSupplyType,
  calculateLineTax,
  calculateDocumentTotals
} = require('./gstTaxService');
const { convertToBaseQuantity } = require('./uomConversionService');
const { calculateTransactionTax, US_STATES } = require('./usTaxCalculationService');

const PREFIX_MAP = {
  SALES_INVOICE: 'SI',
  PURCHASE_INVOICE: 'PI',
  SALES_RETURN: 'SR',
  PURCHASE_RETURN: 'PR',
  CREDIT_NOTE: 'CN',
  DEBIT_NOTE: 'DN',
  RECEIPT: 'RCP',
  PAYMENT: 'PAY',
  CONTRA_TRANSFER: 'CTR',
  JOURNAL_ADJUSTMENT: 'ADJ'
};

/**
 * Generates next unique document number for a document type within tenant and company.
 */
async function generateNextDocumentNumber(tenantId, companyId, documentType, docDate = new Date(), options = {}) {
  const prefix = PREFIX_MAP[documentType] || 'DOC';
  const year = new Date(docDate).getFullYear();

  let countQ = CommercialDocument.countDocuments({
    tenant_id: tenantId,
    company_id: companyId,
    document_type: documentType
  });
  if (options.session) countQ = countQ.session(options.session);
  const count = await countQ;

  return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
}

/**
 * Prepares and validates document lines, applying unit conversions and GST calculations.
 */
async function processDocumentLines({ tenantId, companyId, party, company, linesInput, supplyType }) {
  const processedLines = [];

  for (let i = 0; i < linesInput.length; i++) {
    const raw = linesInput[i];
    let stockItem = null;
    let uom = null;
    let godown = null;
    let factor = '1.0';
    let baseQty = raw.quantity ? raw.quantity.toString() : '1.0000';

    const itemId = raw.stock_item_id || raw.item_id;
    if (itemId) {
      stockItem = await StockItem.findOne({
        _id: itemId,
        tenant_id: tenantId,
        company_id: companyId
      }).populate('base_uom_id');

      if (!stockItem) {
        throw new Error(`StockItem "${itemId}" does not exist in active company`);
      }
      if (stockItem.status && stockItem.status !== 'ACTIVE') {
        throw new Error(`StockItem "${stockItem.item_name}" is inactive`);
      }

      const targetUomId = raw.uom_id || (stockItem.base_uom_id ? stockItem.base_uom_id._id : null);
      if (targetUomId) {
        uom = await UnitOfMeasurement.findOne({
          _id: targetUomId,
          tenant_id: tenantId,
          company_id: companyId
        });
      }

      // Convert quantity to base unit
      if (stockItem.base_uom_id && uom) {
        try {
          const conv = await convertToBaseQuantity({
            stockItem,
            uom,
            baseUom: stockItem.base_uom_id,
            quantity: raw.quantity || '1'
          });
          factor = conv.factor;
          baseQty = conv.base_quantity;
        } catch (convErr) {
          // If the requested UOM cannot be converted to base UOM (e.g. incompatible dimensions without conversion),
          // fallback to the item's configured base UOM so commercial vouchers are not blocked
          if (convErr.message && (convErr.message.includes('Incompatible unit dimensions') || convErr.message.includes('No conversion path'))) {
            uom = stockItem.base_uom_id;
            const conv = await convertToBaseQuantity({
              stockItem,
              uom: stockItem.base_uom_id,
              baseUom: stockItem.base_uom_id,
              quantity: raw.quantity || '1'
            });
            factor = conv.factor;
            baseQty = conv.base_quantity;
          } else {
            throw convErr;
          }
        }
      }

      if (raw.godown_id) {
        godown = await Godown.findOne({
          _id: raw.godown_id,
          tenant_id: tenantId,
          company_id: companyId
        });
        if (!godown) {
          throw new Error(`Godown "${raw.godown_id}" not found`);
        }
      }
    }

    // Determine tax rate: line override > item tax rate (if available) > tax_rate_code > 0
    let taxRate = '0.00';
    if (raw.tax_rate !== undefined && raw.tax_rate !== null) {
      taxRate = raw.tax_rate.toString();
    } else if (stockItem && stockItem.tax_rate !== undefined && stockItem.tax_rate !== null && Number(stockItem.tax_rate) > 0) {
      taxRate = stockItem.tax_rate.toString();
    } else if (raw.tax_rate_code) {
      const match = String(raw.tax_rate_code).match(/\d+/);
      if (match) taxRate = match[0];
    }

    // Determine unit rate: line input (unit_rate / unit_price / rate) > item sales/purchase price
    let unitRate = '0.00';
    if (raw.unit_rate !== undefined && raw.unit_rate !== null) {
      unitRate = raw.unit_rate.toString();
    } else if (raw.unit_price !== undefined && raw.unit_price !== null) {
      unitRate = raw.unit_price.toString();
    } else if (raw.rate !== undefined && raw.rate !== null) {
      unitRate = raw.rate.toString();
    } else if (stockItem) {
      unitRate = raw.document_type === 'PURCHASE_INVOICE'
        ? (stockItem.purchase_price ? stockItem.purchase_price.toString() : (stockItem.standard_cost ? stockItem.standard_cost.toString() : '0.00'))
        : (stockItem.sales_price ? stockItem.sales_price.toString() : (stockItem.standard_selling_price ? stockItem.standard_selling_price.toString() : '0.00'));
    }

    const isLineTaxInclusive = Boolean(raw.is_tax_inclusive);

    const calculatedTax = calculateLineTax({
      quantity: raw.quantity || '1',
      unit_rate: unitRate,
      discount_percent: raw.discount_percent || '0',
      discount_amount: raw.discount_amount || '0',
      tax_rate: taxRate,
      supply_type: supplyType,
      is_tax_inclusive: isLineTaxInclusive
    });

    processedLines.push({
      line_number: i + 1,
      line_type: ['SERVICE', 'SERVICES'].includes(raw.line_type)
        ? 'SERVICE'
        : (['ITEM', 'GOODS'].includes(raw.line_type)
          ? 'ITEM'
          : (raw.line_type || (stockItem ? (stockItem.is_stock_tracked ? 'ITEM' : 'SERVICE') : 'ACCOUNT'))),
      stock_item_id: stockItem ? stockItem._id : null,
      item_code: stockItem ? stockItem.item_code : (raw.item_code || ''),
      item_name: stockItem ? stockItem.item_name : (raw.item_name || raw.description || ''),
      description: raw.description || (stockItem ? stockItem.description : ''),
      hsn_sac_code: raw.hsn_sac_code || (stockItem ? stockItem.hsn_sac_code : ''),
      godown_id: godown ? godown._id : null,
      uom_id: uom ? uom._id : null,
      uom: uom ? (uom.unit_code || uom.symbol) : (raw.uom || (stockItem?.base_uom_id?.unit_code || '')),
      quantity: mongoose.Types.Decimal128.fromString(calculatedTax.quantity),
      conversion_factor: mongoose.Types.Decimal128.fromString(factor),
      base_quantity: mongoose.Types.Decimal128.fromString(baseQty),
      unit_rate: mongoose.Types.Decimal128.fromString(calculatedTax.unit_rate),
      gross_amount: mongoose.Types.Decimal128.fromString(calculatedTax.gross_amount),
      discount_percent: mongoose.Types.Decimal128.fromString(calculatedTax.discount_percent),
      discount_amount: mongoose.Types.Decimal128.fromString(calculatedTax.discount_amount),
      taxable_amount: mongoose.Types.Decimal128.fromString(calculatedTax.taxable_amount),
      tax_rate: mongoose.Types.Decimal128.fromString(calculatedTax.tax_rate),
      cgst_rate: mongoose.Types.Decimal128.fromString(calculatedTax.cgst_rate),
      cgst_amount: mongoose.Types.Decimal128.fromString(calculatedTax.cgst_amount),
      sgst_rate: mongoose.Types.Decimal128.fromString(calculatedTax.sgst_rate),
      sgst_amount: mongoose.Types.Decimal128.fromString(calculatedTax.sgst_amount),
      igst_rate: mongoose.Types.Decimal128.fromString(calculatedTax.igst_rate),
      igst_amount: mongoose.Types.Decimal128.fromString(calculatedTax.igst_amount),
      total_tax: mongoose.Types.Decimal128.fromString(calculatedTax.total_tax),
      total_amount: mongoose.Types.Decimal128.fromString(calculatedTax.total_amount),
      restockable: raw.restockable !== undefined ? Boolean(raw.restockable) : true,
      is_tax_inclusive: isLineTaxInclusive,
      excluded_ingredients: Array.isArray(raw.excluded_ingredients) ? raw.excluded_ingredients : [],
      modifiers: Array.isArray(raw.modifiers) ? raw.modifiers : []
    });
  }

  return processedLines;
}

/**
 * Calculates and applies US sales & use tax on a CommercialDocument instance.
 */
async function calculateAndApplyUsTax(doc, { tenantId, companyId, userId, company, party, options = {} }) {
  // Sourcing & addresses
  let rawDestState = doc.destination_address?.state
    || party?.address?.state
    || (doc.party_state_code && doc.party_state_code.length === 2 ? doc.party_state_code.toUpperCase() : null)
    || (doc.place_of_supply && /^[A-Z]{2}$/i.test(doc.place_of_supply) ? doc.place_of_supply.toUpperCase() : null)
    || company?.address?.state
    || 'CA';

  // Fallback to valid US state if non-US or not in US_STATES
  const destState = (rawDestState && US_STATES && US_STATES.has(rawDestState.toUpperCase()))
    ? rawDestState.toUpperCase()
    : 'CA';

  const rawOriginState = doc.origin_address?.state || company?.address?.state || 'CA';
  const originState = (rawOriginState && US_STATES && US_STATES.has(rawOriginState.toUpperCase()))
    ? rawOriginState.toUpperCase()
    : 'CA';

  const destination_address = {
    street: doc.destination_address?.street || party?.address?.street || '',
    city: doc.destination_address?.city || party?.address?.city || '',
    state: destState,
    zip: doc.destination_address?.zip || party?.address?.postal_code || party?.address?.zip || '90210',
    country: doc.destination_address?.country || 'US'
  };

  const origin_address = {
    street: doc.origin_address?.street || company?.address?.street || '',
    city: doc.origin_address?.city || company?.address?.city || '',
    state: originState,
    zip: doc.origin_address?.zip || company?.address?.postal_code || company?.address?.zip || '90001',
    country: doc.origin_address?.country || 'US'
  };

  const txType = ['SALES_INVOICE', 'RECEIPT'].includes(doc.document_type)
    ? 'SALE'
    : (['PURCHASE_INVOICE', 'PAYMENT'].includes(doc.document_type)
      ? 'PURCHASE'
      : (['SALES_RETURN', 'PURCHASE_RETURN', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(doc.document_type)
        ? 'REFUND'
        : 'SALE'));

  const linesPayload = doc.lines.map((l, idx) => ({
    line_number: l.line_number || idx + 1,
    line_id: String(l._id || idx + 1),
    item_code: l.item_code || `ITEM-${idx + 1}`,
    item_description: l.item_name || l.description || '',
    quantity: Number(l.quantity ? l.quantity.toString() : 1),
    unit_price: Number(l.unit_rate ? l.unit_rate.toString() : 0),
    line_amount: Number(l.taxable_amount ? l.taxable_amount.toString() : 0),
    category_code: l.category_code || 'GENERAL_TANGIBLE_GOODS',
    is_exempt: Boolean(l.is_exempt),
    exemption_reason: l.exemption_reason || ''
  }));

  const calcPayload = {
    transaction_id: doc.document_number || `TX-${Date.now()}`,
    transaction_type: txType,
    document_number: doc.document_number,
    document_id: doc._id,
    origin_address,
    destination_address,
    currency: doc.currency || 'USD',
    customer_tax_id: doc.customer_tax_id || party?.tax_id || '',
    customer_exemption_code: doc.customer_exemption_code || '',
    freight_amount: Number(doc.freight_amount ? doc.freight_amount.toString() : 0),
    lines: linesPayload
  };

  const calcResult = await calculateTransactionTax(
    calcPayload,
    { tenantId, companyId, userId },
    { persistSnapshot: true, allowMockInProduction: options.allowMockInProduction }
  );

  doc.tax_regime = 'US_SALES_TAX';
  doc.tax_snapshot_id = calcResult.snapshot_id;
  doc.tax_calculation_status = 'CALCULATED';
  doc.is_mock_tax = calcResult.is_mock;
  doc.tax_provider_name = calcResult.provider_name;
  doc.tax_provider_transaction_id = calcResult.provider_transaction_id;
  doc.origin_address = calcResult.origin_address;
  doc.destination_address = calcResult.destination_address;

  doc.subtotal_amount = mongoose.Types.Decimal128.fromString(calcResult.subtotal_amount);
  doc.total_taxable_amount = mongoose.Types.Decimal128.fromString(calcResult.taxable_amount);
  doc.total_tax_amount = mongoose.Types.Decimal128.fromString(calcResult.total_tax_amount);
  doc.grand_total = mongoose.Types.Decimal128.fromString(calcResult.grand_total_amount);
  doc.balance_due = mongoose.Types.Decimal128.fromString(calcResult.grand_total_amount);

  // Zero out GST amounts
  doc.total_cgst_amount = mongoose.Types.Decimal128.fromString('0.00');
  doc.total_sgst_amount = mongoose.Types.Decimal128.fromString('0.00');
  doc.total_igst_amount = mongoose.Types.Decimal128.fromString('0.00');

  // Update line taxes
  if (Array.isArray(calcResult.line_items) && calcResult.line_items.length === doc.lines.length) {
    for (let i = 0; i < doc.lines.length; i++) {
      const calcLine = calcResult.line_items[i];
      doc.lines[i].us_tax_amount = mongoose.Types.Decimal128.fromString(calcLine.tax_amount || '0.00');
      doc.lines[i].us_tax_rate = mongoose.Types.Decimal128.fromString(calcLine.rate || '0.0000');
      doc.lines[i].total_tax = mongoose.Types.Decimal128.fromString(calcLine.tax_amount || '0.00');
      doc.lines[i].cgst_amount = mongoose.Types.Decimal128.fromString('0.00');
      doc.lines[i].sgst_amount = mongoose.Types.Decimal128.fromString('0.00');
      doc.lines[i].igst_amount = mongoose.Types.Decimal128.fromString('0.00');
      const lineTaxBn = new BigNumber(calcLine.tax_amount || '0');
      const lineNetBn = new BigNumber(calcLine.line_amount || '0');
      doc.lines[i].total_amount = mongoose.Types.Decimal128.fromString(lineNetBn.plus(lineTaxBn).toFixed(2));
    }
  }

  return { doc, calcResult };
}

/**
 * Creates a new CommercialDocument in DRAFT status.
 */
async function createDraftDocument(data, options = {}) {
  const tenantId = data.tenantId || data.tenant_id;
  const companyId = data.companyId || data.company_id;
  const userId = data.userId || data.user_id;
  const documentType = data.documentType || data.document_type;
  const documentDate = data.documentDate || data.document_date || new Date();
  const dueDate = data.dueDate || data.due_date || null;
  const referenceNumber = data.referenceNumber || data.reference_number || '';
  const partyId = data.partyId || data.party_id || null;
  const placeOfSupply = data.placeOfSupply || data.place_of_supply || '';
  const bankOrCashAccountId = data.bankOrCashAccountId || data.bank_or_cash_account_id || null;
  const toBankOrCashAccountId = data.toBankOrCashAccountId || data.to_bank_or_cash_account_id || null;
  const lines = data.lines || data.items || [];
  const notes = data.notes || '';
  const terms = data.terms || '';
  const linkedSourceDocumentId = data.linkedSourceDocumentId || data.linked_source_document_id || null;
  const idempotencyKey = data.idempotencyKey || data.idempotency_key || null;
  const isTaxInclusive = Boolean(data.isTaxInclusive || data.is_tax_inclusive);

  if (!tenantId || !companyId) {
    throw new Error('tenantId and companyId are required');
  }
  if (!documentType || !PREFIX_MAP[documentType]) {
    throw new Error(`Invalid documentType: "${documentType}"`);
  }

  // Load company
  const company = await Company.findOne({ _id: companyId, tenant_id: tenantId });
  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  // Load party if provided
  let party = null;
  if (partyId) {
    party = await Party.findOne({ _id: partyId, tenant_id: tenantId, company_id: companyId });
    if (!party) {
      // Allow tenant-wide party if company_id is null
      party = await Party.findOne({ _id: partyId, tenant_id: tenantId });
    }
    if (!party) {
      throw new Error(`Party not found: ${partyId}`);
    }
  }

  // Determine supply type
  const companyState = company.tax_details?.state_code
    || (company.tax_details?.gstin ? company.tax_details.gstin.substring(0, 2) : '')
    || '27';
  const partyState = placeOfSupply
    || (party?.tax_id ? party.tax_id.substring(0, 2) : '')
    || party?.address?.state
    || companyState;
  const supplyType = determineSupplyType({
    companyStateCode: companyState,
    partyStateCode: partyState,
    placeOfSupply
  });

  // Process lines and calculate taxes
  let processedLines = [];
  let totals = {
    subtotal_amount: '0.00',
    total_discount_amount: '0.00',
    total_taxable_amount: '0.00',
    total_cgst_amount: '0.00',
    total_sgst_amount: '0.00',
    total_igst_amount: '0.00',
    total_tax_amount: '0.00',
    round_off_amount: '0.00',
    grand_total: '0.00'
  };

  if (lines && lines.length > 0) {
    processedLines = await processDocumentLines({
      tenantId,
      companyId,
      party,
      company,
      linesInput: lines.map(l => ({
        ...l,
        document_type: documentType,
        is_tax_inclusive: l.is_tax_inclusive !== undefined ? Boolean(l.is_tax_inclusive) : isTaxInclusive
      })),
      supplyType
    });

    totals = calculateDocumentTotals(
      processedLines.map(l => ({
        gross_amount: l.gross_amount.toString(),
        discount_amount: l.discount_amount.toString(),
        taxable_amount: l.taxable_amount.toString(),
        cgst_amount: l.cgst_amount.toString(),
        sgst_amount: l.sgst_amount.toString(),
        igst_amount: l.igst_amount.toString()
      }))
    );
  } else if (data.amount !== undefined && data.amount !== null) {
    // Single amount documents or quick-entry documents
    const rawAmt = new BigNumber(data.amount.toString());
    totals.grand_total = rawAmt.toFixed(2);
    totals.total_taxable_amount = rawAmt.toFixed(2);
    totals.subtotal_amount = rawAmt.toFixed(2);
  }

  const docNumber = await generateNextDocumentNumber(tenantId, companyId, documentType, documentDate, options);
  const idempKey = idempotencyKey || `DRAFT-${docNumber}-${Date.now()}`;

  const doc = new CommercialDocument({
    tenant_id: tenantId,
    company_id: companyId,
    document_type: documentType,
    document_number: docNumber,
    reference_number: referenceNumber,
    document_date: new Date(documentDate),
    posting_date: new Date(documentDate),
    due_date: dueDate ? new Date(dueDate) : null,
    party_id: party ? party._id : null,
    party_name: party ? (party.trade_name || party.legal_name) : (data.party_name || data.billing_name || ''),
    billing_name: data.billing_name || (party ? (party.trade_name || party.legal_name) : (data.party_name || '')),
    party_gstin: party ? (party.tax_id || '') : (data.party_gstin || ''),
    party_state_code: partyState,
    place_of_supply: placeOfSupply || partyState,
    supply_type: supplyType,
    is_tax_inclusive: isTaxInclusive,
    bank_or_cash_account_id: bankOrCashAccountId || null,
    to_bank_or_cash_account_id: toBankOrCashAccountId || null,
    status: 'DRAFT',
    lines: processedLines,
    subtotal_amount: mongoose.Types.Decimal128.fromString(totals.subtotal_amount),
    total_discount_amount: mongoose.Types.Decimal128.fromString(totals.total_discount_amount),
    total_taxable_amount: mongoose.Types.Decimal128.fromString(totals.total_taxable_amount),
    total_cgst_amount: mongoose.Types.Decimal128.fromString(totals.total_cgst_amount),
    total_sgst_amount: mongoose.Types.Decimal128.fromString(totals.total_sgst_amount),
    total_igst_amount: mongoose.Types.Decimal128.fromString(totals.total_igst_amount),
    total_tax_amount: mongoose.Types.Decimal128.fromString(totals.total_tax_amount),
    round_off_amount: mongoose.Types.Decimal128.fromString(totals.round_off_amount),
    grand_total: mongoose.Types.Decimal128.fromString(totals.grand_total),
    amount_paid: mongoose.Types.Decimal128.fromString('0.00'),
    balance_due: mongoose.Types.Decimal128.fromString(totals.grand_total),
    currency: company.base_currency || 'INR',
    linked_source_document_id: linkedSourceDocumentId || null,
    idempotency_key: idempKey,
    notes: notes || '',
    terms: terms || '',
    created_by_user_id: userId || null,
    audit_trail: [
      {
        action: 'DRAFT_CREATED',
        user_id: userId || null,
        timestamp: new Date(),
        note: `Created draft ${documentType} ${docNumber}`
      }
    ]
  });

  // Check if US tax regime applies
  const isExplicitGst = data.tax_regime === 'GST' || data.tax_regime === 'INDIAN_GST';
  const isExplicitUs = data.tax_regime === 'US_SALES_TAX';
  const isIndianCompany = company.country_code === 'IN' || company.base_currency === 'INR' || Boolean(company.tax_details?.gstin);

  let isUsTax = false;
  if (isExplicitUs) {
    isUsTax = true;
  } else if (!isExplicitGst && !isIndianCompany) {
    const hasUsTaxProfile = Boolean(await CompanyTaxProfile.findOne({ tenant_id: tenantId, company_id: companyId, tax_country: 'US' }));
    isUsTax = company.country_code === 'US'
      || (company.tax_details?.tax_regime === 'US_SALES_TAX')
      || (hasUsTaxProfile && company.country_code !== 'IN');
  }

  if (isUsTax) {
    doc.tax_regime = 'US_SALES_TAX';
    doc.currency = company.base_currency === 'INR' ? 'USD' : (company.base_currency || 'USD');
    if (data.origin_address) doc.origin_address = data.origin_address;
    if (data.destination_address) doc.destination_address = data.destination_address;

    if (doc.lines && doc.lines.length > 0) {
      await calculateAndApplyUsTax(doc, { tenantId, companyId, userId, company, party, options });
    }
  } else {
    doc.tax_regime = 'IN_GST';
  }

  await doc.save({ session: options.session });
  return doc;
}

/**
 * Updates an existing DRAFT document.
 */
async function updateDraftDocument(tenantId, companyId, documentId, updates, options = {}) {
  let findQ = CommercialDocument.findOne({
    _id: documentId,
    tenant_id: tenantId,
    company_id: companyId
  });
  if (options.session) findQ = findQ.session(options.session);
  const doc = await findQ;

  if (!doc) {
    throw new Error(`Document not found: ${documentId}`);
  }
  if (doc.status !== 'DRAFT') {
    throw new Error(`Only DRAFT documents can be modified. Document "${doc.document_number}" is in status "${doc.status}".`);
  }

  if (updates.reference_number !== undefined) doc.reference_number = updates.reference_number;
  if (updates.document_date) doc.document_date = new Date(updates.document_date);
  if (updates.due_date !== undefined) doc.due_date = updates.due_date ? new Date(updates.due_date) : null;
  if (updates.notes !== undefined) doc.notes = updates.notes;
  if (updates.terms !== undefined) doc.terms = updates.terms;
  if (updates.bank_or_cash_account_id !== undefined) doc.bank_or_cash_account_id = updates.bank_or_cash_account_id;
  if (updates.to_bank_or_cash_account_id !== undefined) doc.to_bank_or_cash_account_id = updates.to_bank_or_cash_account_id;
  if (updates.tax_regime !== undefined) doc.tax_regime = updates.tax_regime;
  if (updates.origin_address !== undefined) doc.origin_address = updates.origin_address;
  if (updates.destination_address !== undefined) doc.destination_address = updates.destination_address;
  if (updates.is_tax_inclusive !== undefined) doc.is_tax_inclusive = Boolean(updates.is_tax_inclusive);
  const effectiveIsTaxInclusive = updates.is_tax_inclusive !== undefined ? Boolean(updates.is_tax_inclusive) : Boolean(doc.is_tax_inclusive);

  const company = await Company.findOne({ _id: companyId, tenant_id: tenantId });
  let party = null;
  if (doc.party_id) {
    party = await Party.findOne({ _id: doc.party_id });
  }

  if (updates.lines && updates.lines.length > 0) {
    const processedLines = await processDocumentLines({
      tenantId,
      companyId,
      party,
      company,
      linesInput: updates.lines.map(l => ({
        ...l,
        document_type: doc.document_type,
        is_tax_inclusive: l.is_tax_inclusive !== undefined ? Boolean(l.is_tax_inclusive) : effectiveIsTaxInclusive
      })),
      supplyType: doc.supply_type
    });

    const totals = calculateDocumentTotals(
      processedLines.map(l => ({
        gross_amount: l.gross_amount.toString(),
        discount_amount: l.discount_amount.toString(),
        taxable_amount: l.taxable_amount.toString(),
        cgst_amount: l.cgst_amount.toString(),
        sgst_amount: l.sgst_amount.toString(),
        igst_amount: l.igst_amount.toString()
      }))
    );

    doc.lines = processedLines;
    doc.subtotal_amount = mongoose.Types.Decimal128.fromString(totals.subtotal_amount);
    doc.total_discount_amount = mongoose.Types.Decimal128.fromString(totals.total_discount_amount);
    doc.total_taxable_amount = mongoose.Types.Decimal128.fromString(totals.total_taxable_amount);
    doc.total_cgst_amount = mongoose.Types.Decimal128.fromString(totals.total_cgst_amount);
    doc.total_sgst_amount = mongoose.Types.Decimal128.fromString(totals.total_sgst_amount);
    doc.total_igst_amount = mongoose.Types.Decimal128.fromString(totals.total_igst_amount);
    doc.total_tax_amount = mongoose.Types.Decimal128.fromString(totals.total_tax_amount);
    doc.round_off_amount = mongoose.Types.Decimal128.fromString(totals.round_off_amount);
    doc.grand_total = mongoose.Types.Decimal128.fromString(totals.grand_total);
    doc.balance_due = mongoose.Types.Decimal128.fromString(totals.grand_total);
  }

  // Recalculate US tax if doc is in US regime
  if (doc.tax_regime === 'US_SALES_TAX' && doc.lines && doc.lines.length > 0) {
    await calculateAndApplyUsTax(doc, { tenantId, companyId, userId: updates.userId, company, party, options });
  }

  doc.row_version = (doc.row_version || 1) + 1;
  doc.audit_trail.push({
    action: 'DRAFT_UPDATED',
    user_id: updates.userId || null,
    timestamp: new Date(),
    note: `Updated draft ${doc.document_number}`
  });

  await doc.save({ session: options.session });
  return doc;
}

/**
 * Explicitly triggers US tax calculation for a commercial document.
 */
async function calculateUsTaxForCommercialDocument(tenantId, companyId, documentId, options = {}) {
  const doc = await CommercialDocument.findOne({
    _id: documentId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!doc) {
    throw new Error(`Commercial document not found: ${documentId}`);
  }
  if (doc.status !== 'DRAFT') {
    throw new Error(`Tax calculation can only be performed on DRAFT documents. Document "${doc.document_number}" is in status "${doc.status}".`);
  }

  const company = await Company.findOne({ _id: companyId, tenant_id: tenantId });
  let party = null;
  if (doc.party_id) {
    party = await Party.findOne({ _id: doc.party_id });
  }

  if (options.destination_address) {
    doc.destination_address = options.destination_address;
  }
  if (options.origin_address) {
    doc.origin_address = options.origin_address;
  }

  const { calcResult } = await calculateAndApplyUsTax(doc, {
    tenantId,
    companyId,
    userId: options.userId,
    company,
    party,
    options
  });

  doc.row_version = (doc.row_version || 1) + 1;
  doc.audit_trail.push({
    action: 'TAX_CALCULATED',
    user_id: options.userId || null,
    timestamp: new Date(),
    note: `US Sales Tax calculated via ${calcResult.provider_name}: ${calcResult.total_tax_amount}`
  });

  await doc.save();
  return {
    document: doc,
    calculation: calcResult
  };
}

/**
 * Cancels or deletes a DRAFT document.
 */
async function cancelDraftDocument(tenantId, companyId, documentId, reason = '', userId = null, options = {}) {
  let findQ = CommercialDocument.findOne({
    _id: documentId,
    tenant_id: tenantId,
    company_id: companyId
  });
  if (options.session) findQ = findQ.session(options.session);
  const doc = await findQ;

  if (!doc) {
    throw new Error(`Document not found: ${documentId}`);
  }
  if (doc.status !== 'DRAFT') {
    throw new Error(`Cannot cancel a document in "${doc.status}" status. Only DRAFT documents can be cancelled.`);
  }

  doc.status = 'CANCELLED';
  doc.audit_trail.push({
    action: 'DRAFT_CANCELLED',
    user_id: userId,
    timestamp: new Date(),
    note: reason || 'Cancelled draft document'
  });

  await doc.save({ session: options.session });
  return doc;
}

module.exports = {
  PREFIX_MAP,
  generateNextDocumentNumber,
  processDocumentLines,
  createDraftDocument,
  updateDraftDocument,
  cancelDraftDocument,
  calculateAndApplyUsTax,
  calculateUsTaxForCommercialDocument
};
