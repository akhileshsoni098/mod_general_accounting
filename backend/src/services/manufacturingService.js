const mongoose = require('mongoose');
const {
  ManufacturingBOM,
  WorkOrder,
  StockItem,
  Godown,
  FiscalPeriod,
  LedgerAccount
} = require('../models');
const { recordStockMovement } = require('./stockMovementService');
const { postJournalEntry } = require('./journalPostingService');

class ManufacturingService {
  /**
   * Create or update Manufacturing BOM
   */
  async saveBOM({
    tenantId,
    companyId,
    bomNumber,
    bomName,
    finishedItemId,
    outputQuantity = 1,
    outputUomId,
    rawMaterials,
    overheadCosts = []
  }) {
    return ManufacturingBOM.findOneAndUpdate(
      { company_id: companyId, bom_number: bomNumber.toUpperCase() },
      {
        $set: {
          tenant_id: tenantId,
          company_id: companyId,
          bom_number: bomNumber.toUpperCase(),
          bomName,
          finished_item_id: finishedItemId,
          output_quantity: Number(outputQuantity),
          output_uom_id: outputUomId,
          raw_materials: rawMaterials,
          overhead_costs: overheadCosts,
          is_active: true
        }
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Get all active BOMs
   */
  async getBOMs(companyId) {
    return ManufacturingBOM.find({ company_id: companyId, is_active: true })
      .populate('finished_item_id raw_materials.item_id');
  }

  /**
   * Create Work Order
   */
  async createWorkOrder({
    tenantId,
    companyId,
    userId,
    bomId,
    plannedQuantity,
    rawMaterialsGodownId,
    finishedGoodsGodownId
  }) {
    const bom = await ManufacturingBOM.findById(bomId);
    if (!bom) throw new Error('BOM not found');

    const count = await WorkOrder.countDocuments({ company_id: companyId });
    const orderNumber = `WO-${Date.now().toString().slice(-6)}-${String(count + 1).padStart(3, '0')}`;

    return WorkOrder.create({
      tenant_id: tenantId,
      company_id: companyId,
      order_number: orderNumber,
      bom_id: bomId,
      finished_item_id: bom.finished_item_id,
      planned_quantity: Number(plannedQuantity),
      raw_materials_godown_id: rawMaterialsGodownId,
      finished_goods_godown_id: finishedGoodsGodownId,
      status: 'PLANNED',
      created_by: userId
    });
  }

  /**
   * Get all Work Orders
   */
  async getWorkOrders(companyId) {
    return WorkOrder.find({ company_id: companyId })
      .populate('bom_id finished_item_id raw_materials_godown_id finished_goods_godown_id')
      .sort({ created_at: -1 });
  }

  /**
   * Issue raw materials for work order
   */
  async issueRawMaterials({ workOrderId, userId }) {
    const wo = await WorkOrder.findById(workOrderId).populate('bom_id');
    if (!wo) throw new Error('Work order not found');
    if (wo.raw_materials_issued) throw new Error('Raw materials already issued for this work order.');

    const bom = wo.bom_id;
    const scaleFactor = wo.planned_quantity / (bom.output_quantity || 1);

    const issuedMovements = [];
    for (const rm of bom.raw_materials) {
      const scrapFactor = 1 + (rm.scrap_percentage || 0) / 100;
      const issueQty = Number(rm.quantity) * scaleFactor * scrapFactor;

      const movement = await recordStockMovement({
        tenantId: wo.tenant_id,
        companyId: wo.company_id,
        stockItemId: rm.item_id,
        godownId: wo.raw_materials_godown_id,
        movementType: 'PRODUCTION_ISSUE',
        direction: 'OUT',
        quantity: issueQty,
        uomId: rm.uom_id,
        idempotencyKey: `WO-ISSUE-${wo.order_number}-${rm.item_id}`,
        sourceDocumentType: 'WORK_ORDER',
        sourceDocumentId: wo.order_number,
        notes: `Issued raw material for Work Order ${wo.order_number}`,
        userId
      });

      issuedMovements.push(movement);
    }

    wo.status = 'IN_PROGRESS';
    wo.raw_materials_issued = true;
    await wo.save();

    return { workOrder: wo, issuedMovements };
  }

  /**
   * Complete production:
   * Adds finished goods stock into FG godown and posts dual-entry GL inventory adjustment.
   */
  async completeProduction({ workOrderId, completedQuantity, scrapQuantity = 0, userId }) {
    const wo = await WorkOrder.findById(workOrderId).populate('bom_id');
    if (!wo) throw new Error('Work order not found');
    if (wo.status === 'COMPLETED') throw new Error('Work order is already completed.');
    if (!wo.raw_materials_issued) throw new Error('Must issue raw materials before completing production.');

    const bom = wo.bom_id;
    const finishedItem = await StockItem.findById(wo.finished_item_id);

    // Sum estimated costs
    let totalMaterialCost = 0;
    for (const rm of bom.raw_materials) {
      const rawItem = await StockItem.findById(rm.item_id);
      const standardCost = Number(rawItem ? rawItem.standard_cost || 0 : 0);
      const qty = Number(rm.quantity) * (Number(completedQuantity) / (bom.output_quantity || 1));
      totalMaterialCost += qty * standardCost;
    }

    let totalOverheadCost = 0;
    if (bom.overhead_costs && bom.overhead_costs.length > 0) {
      for (const oc of bom.overhead_costs) {
        totalOverheadCost += Number(oc.cost_amount || 0);
      }
    }

    const totalCost = totalMaterialCost + totalOverheadCost;
    const unitCost = Number(completedQuantity) > 0 ? totalCost / Number(completedQuantity) : 0;

    // 1. Record Finished Goods Stock Receipt
    const receiptMovement = await recordStockMovement({
      tenantId: wo.tenant_id,
      companyId: wo.company_id,
      stockItemId: wo.finished_item_id,
      godownId: wo.finished_goods_godown_id,
      movementType: 'PRODUCTION_RECEIPT',
      direction: 'IN',
      quantity: Number(completedQuantity),
      uomId: bom.output_uom_id || (finishedItem ? finishedItem.base_uom_id : null),
      unitRate: unitCost,
      totalCost: totalCost,
      idempotencyKey: `WO-RECEIPT-${wo.order_number}`,
      sourceDocumentType: 'WORK_ORDER',
      sourceDocumentId: wo.order_number,
      notes: `Finished goods manufactured from Work Order ${wo.order_number}`,
      userId
    });

    // 2. Post GL Journal Entry (DR Finished Goods Inventory Asset, CR Raw Materials / Production WIP)
    let glJournalId = null;
    if (totalCost > 0) {
      const now = new Date();
      const period = await FiscalPeriod.findOne({
        tenant_id: wo.tenant_id,
        status: 'OPEN',
        start_date: { $lte: now },
        end_date: { $gte: now }
      }) || await FiscalPeriod.findOne({ tenant_id: wo.tenant_id }).sort({ start_date: -1 });

      const fgInventoryAccount = await LedgerAccount.findOne({
        tenant_id: wo.tenant_id,
        company_id: wo.company_id,
        account_code: { $in: ['1201', '1200', 'INVENTORY_ASSET'] }
      }) || await LedgerAccount.findOne({ tenant_id: wo.tenant_id, company_id: wo.company_id, account_type: 'ASSET' })
         || await LedgerAccount.findOne({ tenant_id: wo.tenant_id, account_type: 'ASSET' });

      const wipOrRawAccount = await LedgerAccount.findOne({
        tenant_id: wo.tenant_id,
        company_id: wo.company_id,
        account_code: { $in: ['5001', '5004', '5000', 'COGS', 'WIP_INVENTORY'] }
      }) || await LedgerAccount.findOne({ tenant_id: wo.tenant_id, company_id: wo.company_id, account_type: 'EXPENSE' })
         || await LedgerAccount.findOne({ tenant_id: wo.tenant_id, account_type: 'EXPENSE' });

      if (period && fgInventoryAccount && wipOrRawAccount) {
        try {
          const journal = await postJournalEntry({
            tenantId: wo.tenant_id,
            companyId: wo.company_id,
            postingDate: now,
            sourceModule: 'MANUFACTURING',
            referenceId: wo.order_number,
            memo: `Production Completion Costing for ${wo.order_number}`,
            idempotencyKey: `WO-GL-${wo.order_number}`,
            lines: [
              {
                account_code: fgInventoryAccount.account_code,
                debit: totalCost,
                credit: 0,
                memo: `Finished Goods Stock Receipt - ${wo.order_number}`
              },
              {
                account_code: wipOrRawAccount.account_code,
                debit: 0,
                credit: totalCost,
                memo: `Raw Materials & Production Overhead Absorption - ${wo.order_number}`
              }
            ],
            userId
          });
          glJournalId = journal && journal.journal ? journal.journal._id : (journal ? journal._id : null);
        } catch (err) {
          console.warn('[Manufacturing] Journal posting note:', err.message);
        }
      }
    }

    wo.status = 'COMPLETED';
    wo.completed_quantity = Number(completedQuantity);
    wo.scrap_quantity = Number(scrapQuantity);
    wo.finished_goods_received = true;
    wo.total_cost = totalCost;
    wo.unit_cost = unitCost;
    wo.journal_id = glJournalId;
    await wo.save();

    return {
      workOrder: wo,
      receiptMovement,
      glJournalId
    };
  }
}

module.exports = new ManufacturingService();
