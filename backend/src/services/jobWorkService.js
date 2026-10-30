const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  JobWorkOrder,
  Party,
  StockItem,
  LedgerAccount
} = require('../models');
const { postJournalEntry } = require('./journalPostingService');

/**
 * Creates a Job Work Order (Inward or Outward).
 */
async function createJobWorkOrder({
  tenantId,
  companyId,
  userId,
  orderType = 'OUTWARD',
  partyId,
  issueDate = new Date(),
  expectedCompletionDate = null,
  rawMaterialsIssued = [],
  finishedGoodsExpected = [],
  notes = '',
  session = null
}) {
  const party = await Party.findOne({
    _id: partyId,
    tenant_id: tenantId,
    company_id: companyId
  });
  if (!party) throw new Error('Subcontractor / party not found');

  if (!rawMaterialsIssued || rawMaterialsIssued.length === 0) {
    throw new Error('Job work order must specify at least one raw material issued');
  }

  const count = await JobWorkOrder.countDocuments({
    tenant_id: tenantId,
    company_id: companyId
  });
  const prefix = orderType === 'INWARD' ? 'JWI' : 'JWO';
  const orderNumber = `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

  const order = new JobWorkOrder({
    tenant_id: tenantId,
    company_id: companyId,
    order_number: orderNumber,
    order_type: orderType,
    party_id: party._id,
    issue_date: new Date(issueDate),
    expected_completion_date: expectedCompletionDate ? new Date(expectedCompletionDate) : null,
    raw_materials_issued: rawMaterialsIssued,
    finished_goods_expected: finishedGoodsExpected,
    status: 'ISSUED',
    notes
  });

  await order.save(session ? { session } : undefined);

  return order;
}

/**
 * Records a receipt against a Job Work Order and posts processing charges journal entry.
 */
async function recordJobWorkReceipt({
  tenantId,
  companyId,
  userId,
  orderId,
  quantityReceived,
  scrapQuantityReceived = 0,
  processingCharges = 0,
  deliveryChallanNumber = '',
  chargesExpenseAccountCode = '5003', // Freight / Job Work Expense
  subcontractorPayableAccountCode = '2000', // Sundry Creditors
  receiptDate = new Date(),
  session = null
}) {
  const order = await JobWorkOrder.findOne({
    _id: orderId,
    tenant_id: tenantId,
    company_id: companyId
  }).populate('party_id');

  if (!order) throw new Error('Job work order not found');

  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    throw new Error(`Cannot record receipts on an order with status "${order.status}"`);
  }

  const chargesBN = new BigNumber(processingCharges || 0);
  let journal = null;

  // If there are processing charges, post double-entry journal:
  // Debit: Job Work Processing Charges (Expense)
  // Credit: Subcontractor Payable (Liability)
  if (chargesBN.isGreaterThan(0)) {
    const expAcc = await LedgerAccount.findOne({
      tenant_id: tenantId,
      account_code: chargesExpenseAccountCode,
      ...(companyId ? { company_id: companyId } : {})
    });
    if (!expAcc) throw new Error(`Job work expense account "${chargesExpenseAccountCode}" not found`);

    const apAcc = await LedgerAccount.findOne({
      tenant_id: tenantId,
      account_code: subcontractorPayableAccountCode,
      ...(companyId ? { company_id: companyId } : {})
    });
    if (!apAcc) throw new Error(`Subcontractor payable account "${subcontractorPayableAccountCode}" not found`);

    const journalResult = await postJournalEntry({
      tenantId,
      companyId,
      userId,
      postingDate: receiptDate,
      sourceModule: 'JOB_WORK',
      referenceId: `${order.order_number}-REC-${Date.now().toString().slice(-4)}`,
      memo: `Job work processing charges for ${order.order_number} by ${order.party_id?.legal_name}: Challan ${deliveryChallanNumber}`,
      currency: 'INR',
      lines: [
        {
          account_code: expAcc.account_code,
          debit: chargesBN.toFixed(2),
          credit: '0.00',
          memo: `Processing charges on ${order.order_number}`
        },
        {
          account_code: apAcc.account_code,
          debit: '0.00',
          credit: chargesBN.toFixed(2),
          memo: `Payable to subcontractor for job processing`
        }
      ],
      session
    });

    journal = journalResult.journal;
  }

  const receiptLine = {
    receipt_date: new Date(receiptDate),
    delivery_challan_number: deliveryChallanNumber,
    quantity_received: Number(quantityReceived),
    scrap_quantity_received: Number(scrapQuantityReceived),
    processing_charges: mongoose.Types.Decimal128.fromString(chargesBN.toFixed(2)),
    journal_id: journal ? journal._id : null
  };

  order.receipts.push(receiptLine);
  order.total_quantity_received = (order.total_quantity_received || 0) + Number(quantityReceived);

  // Check if expected finished goods are fully satisfied
  const totalExpected = order.finished_goods_expected.reduce((sum, f) => sum + (f.quantity_expected || 0), 0);
  if (totalExpected > 0 && order.total_quantity_received >= totalExpected) {
    order.status = 'COMPLETED';
  } else {
    order.status = 'PARTIALLY_RECEIVED';
  }

  await order.save(session ? { session } : undefined);

  return {
    order,
    journal
  };
}

module.exports = {
  createJobWorkOrder,
  recordJobWorkReceipt
};
