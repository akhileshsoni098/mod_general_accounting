const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  CommercialDocument,
  Company,
  Party,
  StockItem,
  UnitOfMeasurement,
  Godown,
  LedgerAccount
} = require('../models');
const {
  determineSupplyType,
  calculateLineTax,
  calculateDocumentTotals
} = require('./gstTaxService');
const { convertToBaseQuantity } = require('./uomConversionService');

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
        const conv = await convertToBaseQuantity({
          stockItem,
          uom,
          baseUom: stockItem.base_uom_id,
          quantity: raw.quantity || '1'
        });
        factor = conv.factor;
        baseQty = conv.base_quantity;
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

    // Determine tax rate: line override > tax_rate_code > item tax rate > 0
    let taxRate = '0.00';
    if (raw.tax_rate !== undefined && raw.tax_rate !== null) {
      taxRate = raw.tax_rate.toString();
    } else if (raw.tax_rate_code) {
      const match = String(raw.tax_rate_code).match(/\d+/);
      if (match) taxRate = match[0];
    } else if (stockItem && stockItem.tax_rate !== undefined && stockItem.tax_rate !== null) {
      taxRate = stockItem.tax_rate.toString();
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

    const calculatedTax = calculateLineTax({
      quantity: raw.quantity || '1',
      unit_rate: unitRate,
      discount_percent: raw.discount_percent || '0',
      discount_amount: raw.discount_amount || '0',
      tax_rate: taxRate,
      supply_type: supplyType
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
      restockable: raw.restockable !== undefined ? Boolean(raw.restockable) : true
    });
  }

  return processedLines;
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
      linesInput: lines.map(l => ({ ...l, document_type: documentType })),
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
    party_name: party ? (party.trade_name || party.legal_name) : (data.party_name || ''),
    party_gstin: party ? (party.tax_id || '') : (data.party_gstin || ''),
    party_state_code: partyState,
    place_of_supply: placeOfSupply || partyState,
    supply_type: supplyType,
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

  if (updates.lines && updates.lines.length > 0) {
    const company = await Company.findOne({ _id: companyId, tenant_id: tenantId });
    let party = null;
    if (doc.party_id) {
      party = await Party.findOne({ _id: doc.party_id });
    }

    const processedLines = await processDocumentLines({
      tenantId,
      companyId,
      party,
      company,
      linesInput: updates.lines.map(l => ({ ...l, document_type: doc.document_type })),
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
  cancelDraftDocument
};
