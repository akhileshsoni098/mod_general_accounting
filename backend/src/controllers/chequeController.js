const chequePrintingService = require('../services/chequePrintingService');
const { ChequeLayout, ChequeRegister } = require('../models');

async function listLayouts(req, res) {
  try {
    const { tenantId, companyId } = req;
    const layouts = await ChequeLayout.find({ tenant_id: tenantId, company_id: companyId });
    return res.success(layouts);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function createLayout(req, res) {
  try {
    const { tenantId, companyId } = req;
    const layout = await ChequeLayout.create({
      tenant_id: tenantId,
      company_id: companyId,
      ...req.body
    });
    return res.success(layout, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function listRegister(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { bank_account_id, status } = req.query;
    const filter = { tenant_id: tenantId, company_id: companyId };
    if (bank_account_id) filter.bank_account_id = bank_account_id;
    if (status) filter.status = status.toUpperCase();

    const register = await ChequeRegister.find(filter)
      .populate('bank_account_id', 'account_code account_name')
      .sort({ cheque_date: -1 });
    return res.success(register);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function issueAndPrintHandler(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const result = await chequePrintingService.issueAndPrintCheque({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      bankAccountId: req.body.bank_account_id,
      chequeNumber: req.body.cheque_number,
      chequeDate: req.body.cheque_date || new Date(),
      payeeName: req.body.payee_name,
      amount: req.body.amount,
      voucherId: req.body.voucher_id || null,
      notes: req.body.notes || ''
    });
    return res.success(result, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

module.exports = {
  listLayouts,
  createLayout,
  listRegister,
  issueAndPrintHandler
};
