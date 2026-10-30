const manufacturingService = require('../services/manufacturingService');
const { StockItem } = require('../models');

class ManufacturingController {
  async getBOMs(req, res) {
    try {
      const { include_archived, search } = req.query;
      const boms = await manufacturingService.getBOMs(req.companyId, {
        includeArchived: include_archived === 'true',
        search: search || ''
      });
      return res.success(boms);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getBOMById(req, res) {
    try {
      const bom = await manufacturingService.getBOMById(req.companyId, req.params.bomId);
      return res.success(bom);
    } catch (err) {
      return res.error(err.message, 404);
    }
  }

  async saveBOM(req, res) {
    try {
      const {
        bom_number,
        bom_code,
        bom_name,
        finished_item_id,
        output_quantity,
        finished_quantity,
        output_uom_id,
        raw_materials,
        components,
        overhead_costs
      } = req.body;

      const number = (bom_number || bom_code || `BOM-${Date.now()}`).toUpperCase().trim();
      const name = bom_name || number;

      let materials = raw_materials;
      if (!materials && Array.isArray(components)) {
        materials = [];
        for (const c of components) {
          const itemId = c.item_id || c.component_item_id;
          let uomId = c.uom_id;
          if (!uomId && itemId) {
            const itm = await StockItem.findById(itemId);
            if (itm) uomId = itm.base_uom_id;
          }
          materials.push({
            item_id: itemId,
            quantity: Number(c.quantity) || 1,
            uom_id: uomId,
            scrap_percentage: Number(c.scrap_percentage) || 0
          });
        }
      }

      const bom = await manufacturingService.saveBOM({
        tenantId: req.tenantId,
        companyId: req.companyId,
        bomNumber: number,
        bomName: name,
        finishedItemId: finished_item_id,
        outputQuantity: output_quantity || finished_quantity || 1,
        outputUomId: output_uom_id,
        rawMaterials: materials || [],
        overheadCosts: overhead_costs || []
      });
      return res.success(bom, 201);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async updateBOM(req, res) {
    try {
      const updated = await manufacturingService.updateBOM(req.companyId, req.params.bomId, req.body);
      return res.success(updated);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async archiveBOM(req, res) {
    try {
      const archived = await manufacturingService.archiveBOM(req.companyId, req.params.bomId);
      return res.success({ message: 'BOM archived successfully', bom: archived });
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
        target_godown_id,
        finished_goods_godown_id
      } = req.body;

      const order = await manufacturingService.createWorkOrder({
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user._id,
        bomId: bom_id,
        plannedQuantity: planned_quantity,
        rawMaterialsGodownId: raw_materials_godown_id || target_godown_id,
        finishedGoodsGodownId: finished_goods_godown_id || target_godown_id
      });
      return res.success(order, 201);
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
