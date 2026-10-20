const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  CommercialDocument,
  BillAllocation,
  StockBalance,
  StockMovement,
  StockItem,
  Godown,
  LedgerAccount,
  Party
} = require('../models');
const { getOrCreatePostingConfig } = require('./commercialPostingConfigService');

/**
 * Generates document register with filters (document_type, date range, party, status).
 */
async function getDocumentRegister(tenantId, companyId, { documentType, startDate, endDate, partyId, status, limit = 100, page = 1 }) {
  const query = { tenant_id: tenantId, company_id: companyId };
  if (documentType) query.document_type = documentType;
  if (status) query.status = status;
  if (partyId) query.party_id = partyId;

  if (startDate || endDate) {
    query.document_date = {};
    if (startDate) query.document_date.$gte = new Date(startDate);
    if (endDate) query.document_date.$lte = new Date(endDate);
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [documents, totalCount] = await Promise.all([
    CommercialDocument.find(query)
      .populate('party_id', 'party_code legal_name trade_name tax_id')
      .populate('journal_id', 'journal_number posting_date')
      .sort({ document_date: -1, created_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    CommercialDocument.countDocuments(query)
  ]);

  // Aggregate totals
  let totalTaxable = new BigNumber(0);
  let totalTax = new BigNumber(0);
  let grandTotal = new BigNumber(0);
  let totalBalanceDue = new BigNumber(0);

  for (const doc of documents) {
    totalTaxable = totalTaxable.plus(new BigNumber(doc.total_taxable_amount ? doc.total_taxable_amount.toString() : '0'));
    totalTax = totalTax.plus(new BigNumber(doc.total_tax_amount ? doc.total_tax_amount.toString() : '0'));
    grandTotal = grandTotal.plus(new BigNumber(doc.grand_total ? doc.grand_total.toString() : '0'));
    totalBalanceDue = totalBalanceDue.plus(new BigNumber(doc.balance_due ? doc.balance_due.toString() : '0'));
  }

  return {
    as_of: new Date().toISOString(),
    total_count: totalCount,
    page: Number(page),
    limit: Number(limit),
    summary: {
      total_taxable: totalTaxable.toFixed(2),
      total_tax: totalTax.toFixed(2),
      grand_total: grandTotal.toFixed(2),
      total_balance_due: totalBalanceDue.toFixed(2)
    },
    documents
  };
}

/**
 * Customer / Party Outstanding Report
 */
async function getOutstandingReport(tenantId, companyId, { partyType = 'CUSTOMER', asOfDate = new Date() }) {
  const targetDocType = partyType === 'CUSTOMER' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE';

  const postedInvoices = await CommercialDocument.find({
    tenant_id: tenantId,
    company_id: companyId,
    document_type: targetDocType,
    status: 'POSTED',
    balance_due: { $gt: mongoose.Types.Decimal128.fromString('0.00') },
    document_date: { $lte: new Date(asOfDate) }
  }).populate('party_id', 'party_code legal_name trade_name tax_id phone').sort({ document_date: 1 });

  const partyMap = {};
  let overallTotalDue = new BigNumber(0);

  for (const inv of postedInvoices) {
    const pKey = inv.party_id ? inv.party_id._id.toString() : 'UNASSIGNED';
    const pName = inv.party_name || inv.party_id?.trade_name || inv.party_id?.legal_name || 'Counter Customer';
    const balDue = new BigNumber(inv.balance_due.toString());
    const totalAmt = new BigNumber(inv.grand_total.toString());
    const paidAmt = new BigNumber(inv.amount_paid ? inv.amount_paid.toString() : '0');

    overallTotalDue = overallTotalDue.plus(balDue);

    if (!partyMap[pKey]) {
      partyMap[pKey] = {
        party_id: inv.party_id ? inv.party_id._id : null,
        party_name: pName,
        party_gstin: inv.party_gstin || inv.party_id?.tax_id || '',
        total_invoiced: new BigNumber(0),
        total_paid: new BigNumber(0),
        total_balance_due: new BigNumber(0),
        invoices: []
      };
    }

    partyMap[pKey].total_invoiced = partyMap[pKey].total_invoiced.plus(totalAmt);
    partyMap[pKey].total_paid = partyMap[pKey].total_paid.plus(paidAmt);
    partyMap[pKey].total_balance_due = partyMap[pKey].total_balance_due.plus(balDue);

    partyMap[pKey].invoices.push({
      _id: inv._id,
      document_number: inv.document_number,
      document_date: inv.document_date,
      due_date: inv.due_date,
      grand_total: totalAmt.toFixed(2),
      amount_paid: paidAmt.toFixed(2),
      balance_due: balDue.toFixed(2)
    });
  }

  const partyList = Object.values(partyMap).map(p => ({
    ...p,
    total_invoiced: p.total_invoiced.toFixed(2),
    total_paid: p.total_paid.toFixed(2),
    total_balance_due: p.total_balance_due.toFixed(2)
  }));

  return {
    as_of: new Date(asOfDate).toISOString(),
    party_type: partyType,
    total_parties: partyList.length,
    overall_balance_due: overallTotalDue.toFixed(2),
    parties: partyList
  };
}

/**
 * Tax Summary (GST summary for period)
 */
async function getTaxSummaryReport(tenantId, companyId, { startDate, endDate }) {
  const query = {
    tenant_id: tenantId,
    company_id: companyId,
    status: 'POSTED',
    document_type: { $in: ['SALES_INVOICE', 'PURCHASE_INVOICE', 'SALES_RETURN', 'PURCHASE_RETURN'] }
  };

  if (startDate || endDate) {
    query.document_date = {};
    if (startDate) query.document_date.$gte = new Date(startDate);
    if (endDate) query.document_date.$lte = new Date(endDate);
  }

  const docs = await CommercialDocument.find(query);

  const rateBreakdown = {
    OUTWARD: {}, // Sales
    INWARD: {}   // Purchases
  };

  let totalOutwardTaxable = new BigNumber(0);
  let totalOutwardCgst = new BigNumber(0);
  let totalOutwardSgst = new BigNumber(0);
  let totalOutwardIgst = new BigNumber(0);

  let totalInwardTaxable = new BigNumber(0);
  let totalInwardCgst = new BigNumber(0);
  let totalInwardSgst = new BigNumber(0);
  let totalInwardIgst = new BigNumber(0);

  for (const doc of docs) {
    const isOutward = ['SALES_INVOICE', 'SALES_RETURN'].includes(doc.document_type);
    const multiplier = doc.document_type.includes('RETURN') ? -1 : 1;
    const cat = isOutward ? 'OUTWARD' : 'INWARD';

    for (const line of doc.lines) {
      const rateStr = line.tax_rate ? line.tax_rate.toString() : '0.00';
      if (!rateBreakdown[cat][rateStr]) {
        rateBreakdown[cat][rateStr] = {
          rate: rateStr,
          taxable: new BigNumber(0),
          cgst: new BigNumber(0),
          sgst: new BigNumber(0),
          igst: new BigNumber(0),
          total_tax: new BigNumber(0)
        };
      }

      const lTaxable = new BigNumber(line.taxable_amount.toString()).times(multiplier);
      const lCgst = new BigNumber(line.cgst_amount ? line.cgst_amount.toString() : '0').times(multiplier);
      const lSgst = new BigNumber(line.sgst_amount ? line.sgst_amount.toString() : '0').times(multiplier);
      const lIgst = new BigNumber(line.igst_amount ? line.igst_amount.toString() : '0').times(multiplier);
      const lTotalTax = lCgst.plus(lSgst).plus(lIgst);

      rateBreakdown[cat][rateStr].taxable = rateBreakdown[cat][rateStr].taxable.plus(lTaxable);
      rateBreakdown[cat][rateStr].cgst = rateBreakdown[cat][rateStr].cgst.plus(lCgst);
      rateBreakdown[cat][rateStr].sgst = rateBreakdown[cat][rateStr].sgst.plus(lSgst);
      rateBreakdown[cat][rateStr].igst = rateBreakdown[cat][rateStr].igst.plus(lIgst);
      rateBreakdown[cat][rateStr].total_tax = rateBreakdown[cat][rateStr].total_tax.plus(lTotalTax);

      if (isOutward) {
        totalOutwardTaxable = totalOutwardTaxable.plus(lTaxable);
        totalOutwardCgst = totalOutwardCgst.plus(lCgst);
        totalOutwardSgst = totalOutwardSgst.plus(lSgst);
        totalOutwardIgst = totalOutwardIgst.plus(lIgst);
      } else {
        totalInwardTaxable = totalInwardTaxable.plus(lTaxable);
        totalInwardCgst = totalInwardCgst.plus(lCgst);
        totalInwardSgst = totalInwardSgst.plus(lSgst);
        totalInwardIgst = totalInwardIgst.plus(lIgst);
      }
    }
  }

  const formatCat = (catObj) => Object.values(catObj).map(r => ({
    rate_percent: r.rate,
    taxable_amount: r.taxable.toFixed(2),
    cgst_amount: r.cgst.toFixed(2),
    sgst_amount: r.sgst.toFixed(2),
    igst_amount: r.igst.toFixed(2),
    total_tax_amount: r.total_tax.toFixed(2)
  }));

  return {
    as_of: new Date().toISOString(),
    outward_supplies: {
      total_taxable: totalOutwardTaxable.toFixed(2),
      total_cgst: totalOutwardCgst.toFixed(2),
      total_sgst: totalOutwardSgst.toFixed(2),
      total_igst: totalOutwardIgst.toFixed(2),
      total_tax: totalOutwardCgst.plus(totalOutwardSgst).plus(totalOutwardIgst).toFixed(2),
      rates: formatCat(rateBreakdown.OUTWARD)
    },
    inward_supplies: {
      total_taxable: totalInwardTaxable.toFixed(2),
      total_cgst: totalInwardCgst.toFixed(2),
      total_sgst: totalInwardSgst.toFixed(2),
      total_igst: totalInwardIgst.toFixed(2),
      total_tax: totalInwardCgst.plus(totalInwardSgst).plus(totalInwardIgst).toFixed(2),
      rates: formatCat(rateBreakdown.INWARD)
    }
  };
}

/**
 * Inventory to General Ledger Reconciliation Report
 * Compares physical stock valuation from StockBalance against GL inventory asset ledger balance.
 */
async function getInventoryToGlReconciliation(tenantId, companyId) {
  const config = await getOrCreatePostingConfig(tenantId, companyId);

  // 1. Physical Stock Valuation from StockBalance
  const balances = await StockBalance.find({ tenant_id: tenantId, company_id: companyId })
    .populate('stock_item_id', 'item_code item_name')
    .populate('godown_id', 'godown_name');

  let totalStockValBn = new BigNumber(0);
  let totalQtyOnHandBn = new BigNumber(0);

  for (const b of balances) {
    const valBn = new BigNumber(b.total_inventory_value ? b.total_inventory_value.toString() : '0');
    const qtyBn = new BigNumber(b.quantity_on_hand ? b.quantity_on_hand.toString() : '0');
    totalStockValBn = totalStockValBn.plus(valBn);
    totalQtyOnHandBn = totalQtyOnHandBn.plus(qtyBn);
  }

  // 2. Inventory Asset GL Balance
  const invAssetAcc = await LedgerAccount.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    account_code: config.inventory_asset_account_code
  });

  const glBalanceBn = invAssetAcc && invAssetAcc.current_balance
    ? new BigNumber(invAssetAcc.current_balance.toString())
    : new BigNumber(0);

  // 3. Pending Opening Stock Movements without GL posting
  const pendingOpeningMovements = await StockMovement.find({
    tenant_id: tenantId,
    company_id: companyId,
    movement_type: 'OPENING_STOCK',
    is_reversed: false,
    gl_status: { $ne: 'POSTED' }
  });

  let pendingOpeningValBn = new BigNumber(0);
  for (const m of pendingOpeningMovements) {
    pendingOpeningValBn = pendingOpeningValBn.plus(new BigNumber(m.total_cost ? m.total_cost.toString() : '0'));
  }

  // 4. Variance calculation
  const varianceBn = totalStockValBn.minus(glBalanceBn);

  let status = 'RECONCILED';
  if (pendingOpeningMovements.length > 0 || (!varianceBn.isZero() && varianceBn.abs().isGreaterThan(0.05))) {
    status = 'VARIANCE_DETECTED';
  }

  return {
    as_of: new Date().toISOString(),
    status,
    inventory_asset_account: invAssetAcc
      ? `${invAssetAcc.account_code} - ${invAssetAcc.account_name}`
      : config.inventory_asset_account_code,
    total_items_tracked: balances.length,
    total_quantity_on_hand: totalQtyOnHandBn.toFixed(4),
    stock_subledger_valuation: totalStockValBn.toFixed(2),
    general_ledger_balance: glBalanceBn.toFixed(2),
    variance_amount: varianceBn.toFixed(2),
    pending_opening_stock_count: pendingOpeningMovements.length,
    pending_opening_stock_value: pendingOpeningValBn.toFixed(2),
    is_balanced: status === 'RECONCILED'
  };
}

module.exports = {
  getDocumentRegister,
  getOutstandingReport,
  getTaxSummaryReport,
  getInventoryToGlReconciliation
};
