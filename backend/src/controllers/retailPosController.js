const retailPosService = require('../services/retailPosService');

class RetailPosController {
  async openShift(req, res) {
    try {
      const { opening_float, notes } = req.body;
      const shift = await retailPosService.openShift({
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user._id,
        openingFloat: opening_float,
        notes
      });
      return res.success(shift, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getCurrentShift(req, res) {
    try {
      const shift = await retailPosService.getCurrentShift({
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user._id
      });
      return res.success(shift);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async closeShift(req, res) {
    try {
      const { shift_id, closing_cash_actual, notes } = req.body;
      const shift = await retailPosService.closeShift({
        shiftId: shift_id,
        closingCashActual: closing_cash_actual,
        notes
      });
      return res.success(shift);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async checkout(req, res) {
    try {
      const {
        shift_id,
        customer_name,
        customer_phone,
        items,
        payments,
        tendered_amount
      } = req.body;

      const result = await retailPosService.processCheckout({
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user._id,
        shiftId: shift_id,
        customerName: customer_name,
        customerPhone: customer_phone,
        items,
        payments,
        tenderedAmount: tendered_amount
      });

      return res.success(result, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }
}

module.exports = new RetailPosController();
