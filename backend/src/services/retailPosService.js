const mongoose = require('mongoose');
const { PosShift, CommercialDocument, StockItem, Godown } = require('../models');
const commercialDocumentService = require('./commercialDocumentService');
const { postCommercialDocument } = require('./commercialPostingService');

class RetailPosService {
  /**
   * Open a new cashier shift
   */
  async openShift({ tenantId, companyId, userId, openingFloat = 0, notes = '' }) {
    const existingOpen = await PosShift.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      user_id: userId,
      status: 'OPEN'
    });

    if (existingOpen) {
      return existingOpen;
    }

    const shiftCount = await PosShift.countDocuments({ company_id: companyId });
    const shiftNumber = `SHIFT-${Date.now().toString().slice(-6)}-${String(shiftCount + 1).padStart(3, '0')}`;

    const shift = await PosShift.create({
      tenant_id: tenantId,
      company_id: companyId,
      user_id: userId,
      shift_number: shiftNumber,
      opening_float: openingFloat,
      closing_cash_expected: openingFloat,
      status: 'OPEN',
      notes
    });

    return shift;
  }

  /**
   * Get currently active shift for user in company
   */
  async getCurrentShift({ tenantId, companyId, userId }) {
    return PosShift.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      user_id: userId,
      status: 'OPEN'
    });
  }

  /**
   * Close a cashier shift and compute variance
   */
  async closeShift({ shiftId, closingCashActual, notes = '' }) {
    const shift = await PosShift.findById(shiftId);
    if (!shift || shift.status !== 'OPEN') {
      throw new Error('Active open shift not found.');
    }

    const expected = (shift.opening_float || 0) + (shift.total_cash_sales || 0) - (shift.total_refunds || 0);
    const variance = Number(closingCashActual) - expected;

    shift.closing_cash_actual = Number(closingCashActual);
    shift.closing_cash_expected = expected;
    shift.cash_variance = variance;
    shift.status = 'CLOSED';
    shift.closed_at = new Date();
    if (notes) shift.notes = shift.notes ? `${shift.notes}\n${notes}` : notes;

    await shift.save();
    return shift;
  }

  /**
   * Process fast POS checkout: creates and immediately posts commercial sales invoice,
   * decrements stock, updates cashier shift totals, and returns receipt data.
   */
  async processCheckout({
    tenantId,
    companyId,
    userId,
    shiftId,
    customerName = 'Walk-in Customer',
    customerPhone = '',
    items,
    payments,
    tenderedAmount = 0
  }) {
    if (!items || items.length === 0) {
      throw new Error('Cannot checkout an empty cart.');
    }

    const shift = await PosShift.findById(shiftId);
    if (!shift || shift.status !== 'OPEN') {
      throw new Error('An active open shift is required to perform POS checkout.');
    }

    // Default godown if omitted
    const defaultGodown = await Godown.findOne({ company_id: companyId, is_active: true });

    // Format lines for CommercialDocument
    const lines = items.map((it, idx) => ({
      line_number: idx + 1,
      line_type: 'GOODS',
      item_id: it.item_id || it.stock_item_id,
      item_code: it.item_code || 'ITEM',
      item_name: it.item_name || 'Product',
      godown_id: it.godown_id || (defaultGodown ? defaultGodown._id : null),
      quantity: Number(it.quantity),
      uom_id: it.uom_id,
      unit_price: Number(it.unit_price !== undefined ? it.unit_price : (it.rate !== undefined ? it.rate : 0)),
      discount_percentage: Number(it.discount_percentage || 0),
      tax_rate_code: it.tax_rate_code || 'GST_18'
    }));

    // Create Draft Commercial Document
    const draft = await commercialDocumentService.createDraftDocument({
      tenant_id: tenantId,
      company_id: companyId,
      document_type: 'SALES_INVOICE',
      sub_type: 'TAX_INVOICE',
      billing_name: customerName,
      customer_phone: customerPhone,
      lines,
      metadata: {
        pos_shift_id: shift._id,
        pos_terminal: 'POS-01',
        payments
      },
      created_by: userId
    });

    // Immediately post document (triggers GL Journal and Stock Movement atomically)
    const postingResult = await postCommercialDocument({
      tenantId,
      companyId,
      documentId: draft._id,
      userId
    });
    const postedDoc = postingResult.document;

    const docGrandTotal = Number(postedDoc.grand_total ? postedDoc.grand_total.toString() : (postedDoc.total_amount || 0));
    const docTotalTax = Number(postedDoc.total_tax_amount ? postedDoc.total_tax_amount.toString() : 0);

    // Update Shift Totals
    let cashPaid = 0;
    let cardPaid = 0;
    let upiPaid = 0;

    if (payments && Array.isArray(payments) && payments.length > 0) {
      for (const p of payments) {
        const amt = Number(p.amount) || 0;
        if (p.method === 'CASH') cashPaid += amt;
        else if (p.method === 'CARD') cardPaid += amt;
        else if (p.method === 'UPI') upiPaid += amt;
      }
    } else {
      cashPaid = docGrandTotal;
    }

    shift.total_cash_sales = (shift.total_cash_sales || 0) + cashPaid;
    shift.total_card_sales = (shift.total_card_sales || 0) + cardPaid;
    shift.total_upi_sales = (shift.total_upi_sales || 0) + upiPaid;
    shift.transaction_count = (shift.transaction_count || 0) + 1;
    shift.closing_cash_expected = (shift.opening_float || 0) + shift.total_cash_sales;
    await shift.save();

    const changeAmount = Math.max(0, Number(tenderedAmount) - docGrandTotal);

    return {
      success: true,
      document_number: postedDoc.document_number,
      document_id: postedDoc._id,
      total_amount: docGrandTotal,
      tax_amount: docTotalTax,
      tendered_amount: tenderedAmount,
      change_amount: changeAmount,
      shift_number: shift.shift_number,
      lines: postedDoc.lines
    };
  }
}

module.exports = new RetailPosService();
