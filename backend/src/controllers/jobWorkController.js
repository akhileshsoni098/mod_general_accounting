const jobWorkService = require('../services/jobWorkService');
const { JobWorkOrder } = require('../models');

async function listOrders(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { status, order_type } = req.query;
    const filter = { tenant_id: tenantId, company_id: companyId };
    if (status) filter.status = status.toUpperCase();
    if (order_type) filter.order_type = order_type.toUpperCase();

    const orders = await JobWorkOrder.find(filter)
      .populate('party_id', 'legal_name trade_name party_code')
      .sort({ createdAt: -1 });
    return res.success(orders);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function createOrder(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const order = await jobWorkService.createJobWorkOrder({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      orderType: req.body.order_type || 'OUTWARD',
      partyId: req.body.party_id,
      issueDate: req.body.issue_date || new Date(),
      expectedCompletionDate: req.body.expected_completion_date || null,
      rawMaterialsIssued: req.body.raw_materials_issued || [],
      finishedGoodsExpected: req.body.finished_goods_expected || [],
      notes: req.body.notes || ''
    });
    return res.success(order, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function recordReceipt(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;
    const result = await jobWorkService.recordJobWorkReceipt({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      orderId: id,
      quantityReceived: req.body.quantity_received,
      scrapQuantityReceived: req.body.scrap_quantity_received || 0,
      processingCharges: req.body.processing_charges || 0,
      deliveryChallanNumber: req.body.delivery_challan_number || '',
      chargesExpenseAccountCode: req.body.charges_expense_account_code || '5003',
      subcontractorPayableAccountCode: req.body.subcontractor_payable_account_code || '2000',
      receiptDate: req.body.receipt_date || new Date()
    });
    return res.success(result);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

module.exports = {
  listOrders,
  createOrder,
  recordReceipt
};
