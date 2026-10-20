const manufacturingService = require('../services/manufacturingService');

class ManufacturingController {
  async getBOMs(req, res) {
    try {
      const boms = await manufacturingService.getBOMs(req.companyId);
      return res.success(boms);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async saveBOM(req, res) {
    try {
      const {
        bom_number,
        bom_name,
        finished_item_id,
        output_quantity,
        output_uom_id,
        raw_materials,
        overhead_costs
      } = req.body;

      const bom = await manufacturingService.saveBOM({
        tenantId: req.tenantId,
        companyId: req.companyId,
        bomNumber: bom_number,
        bomName: bom_name,
        finishedItemId: finished_item_id,
        outputQuantity: output_quantity,
        outputUomId: output_uom_id,
        rawMaterials: raw_materials,
        overheadCosts: overhead_costs
      });
      return res.success(bom);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getWorkOrders(req, res) {
    try {
      const orders = await manufacturingService.getWorkOrders(req.companyId);
      return res.success(orders);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async createWorkOrder(req, res) {
    try {
      const {
        bom_id,
        planned_quantity,
        raw_materials_godown_id,
        finished_goods_godown_id
      } = req.body;

      const order = await manufacturingService.createWorkOrder({
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user._id,
        bomId: bom_id,
        plannedQuantity: planned_quantity,
        rawMaterialsGodownId: raw_materials_godown_id,
        finishedGoodsGodownId: finished_goods_godown_id
      });
      return res.success(order);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async issueMaterials(req, res) {
    try {
      const { workOrderId } = req.params;
      const result = await manufacturingService.issueRawMaterials({
        workOrderId,
        userId: req.user._id
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async completeProduction(req, res) {
    try {
      const { workOrderId } = req.params;
      const { completed_quantity, scrap_quantity } = req.body;
      const result = await manufacturingService.completeProduction({
        workOrderId,
        completedQuantity: completed_quantity,
        scrapQuantity: scrap_quantity,
        userId: req.user._id
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }
}

module.exports = new ManufacturingController();
