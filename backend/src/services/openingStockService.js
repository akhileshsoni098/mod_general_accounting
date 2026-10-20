const BigNumber = require('bignumber.js');
const {
  StockItem,
  Godown,
  UnitOfMeasurement,
  StockMovement
} = require('../models');
const { recordStockMovement } = require('./stockMovementService');

/**
 * Validates and records opening stock for a stock item in a specified godown.
 *
 * @param {Object} options
 * @param {string|ObjectId} options.tenantId
 * @param {string|ObjectId} options.companyId
 * @param {string|ObjectId} options.stockItemId
 * @param {string|ObjectId} options.godownId
 * @param {number|string} options.quantity
 * @param {string|ObjectId} options.uomId
 * @param {number|string} options.unitRate
 * @param {number|string} [options.totalValue]
 * @param {Date|string} [options.effectiveDate]
 * @param {string} [options.notes]
 * @param {string|ObjectId} [options.userId]
 * @returns {Promise<{ movement: Object, balance: Object }>}
 */
async function postOpeningStock(options) {
  const {
    tenantId,
    companyId,
    stockItemId,
    godownId,
    quantity,
    uomId,
    unitRate,
    totalValue,
    effectiveDate = new Date(),
    notes = '',
    userId = null
  } = options;

  if (!tenantId || !companyId) {
    throw new Error('tenantId and companyId are required');
  }
  if (!stockItemId || !godownId) {
    throw new Error('stockItemId and godownId are required');
  }

  const qtyBn = new BigNumber(quantity ? quantity.toString() : '0');
  if (qtyBn.isNaN() || qtyBn.isLessThanOrEqualTo(0)) {
    throw new Error(`Opening quantity must be a positive number greater than zero, got ${quantity}`);
  }

  const rateBn = new BigNumber(unitRate ? unitRate.toString() : '0');
  if (rateBn.isNaN() || rateBn.isNegative()) {
    throw new Error(`Opening unit rate cannot be negative, got ${unitRate}`);
  }

  // Calculate or validate total value
  const expectedTotalValBn = qtyBn.times(rateBn);
  let finalTotalValBn = expectedTotalValBn;

  if (totalValue !== undefined && totalValue !== null) {
    const passedValBn = new BigNumber(totalValue.toString());
    if (passedValBn.isNaN() || passedValBn.isNegative()) {
      throw new Error(`Opening total value cannot be negative, got ${totalValue}`);
    }
    // Tolerance check (within 0.05 currency units)
    const diff = passedValBn.minus(expectedTotalValBn).abs();
    if (diff.isGreaterThan(0.05)) {
      throw new Error(
        `Total value mismatch: Provided total value (${passedValBn.toFixed(2)}) deviates from quantity * unit rate (${expectedTotalValBn.toFixed(2)})`
      );
    }
    finalTotalValBn = passedValBn;
  }

  // 1. Verify item exists and is ACTIVE
  const stockItem = await StockItem.findOne({
    _id: stockItemId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!stockItem) {
    throw new Error(`Stock item not found or does not belong to active company: ${stockItemId}`);
  }
  if (stockItem.status !== 'ACTIVE') {
    const err = new Error(`Cannot initialize opening stock for ${stockItem.status} item "${stockItem.item_name}"`);
    err.code = 'STOCK_ITEM_INACTIVE';
    err.status = 400;
    throw err;
  }

  // 2. Verify godown exists and is ACTIVE
  const godown = await Godown.findOne({
    _id: godownId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!godown) {
    throw new Error(`Godown not found or does not belong to active company: ${godownId}`);
  }
  if (godown.status !== 'ACTIVE') {
    throw new Error(`Cannot initialize opening stock in inactive godown "${godown.godown_name}"`);
  }

  // 3. Verify UOM exists
  const targetUomId = uomId || stockItem.base_uom_id;
  const uom = await UnitOfMeasurement.findOne({
    _id: targetUomId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!uom) {
    throw new Error(`Unit of measurement not found for company: ${targetUomId}`);
  }

  // 4. Duplicate Check: Prevent multiple opening stocks for same item/godown unless reversed
  const existingOpening = await StockMovement.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    stock_item_id: stockItem._id,
    godown_id: godown._id,
    movement_type: 'OPENING_STOCK',
    is_reversed: false
  });

  if (existingOpening) {
    const err = new Error(
      `Opening stock has already been initialized for item "${stockItem.item_name}" in godown "${godown.godown_name}". Use stock adjustment or reverse the existing opening movement.`
    );
    err.code = 'OPENING_STOCK_ALREADY_POSTED';
    err.status = 409;
    throw err;
  }

  // 5. Generate deterministic idempotency key for this opening event
  const idempotencyKey = `OPN-${stockItem._id}-${godown._id}`;

  // 6. Record movement atomically
  const result = await recordStockMovement({
    tenantId,
    companyId,
    stockItemId: stockItem._id,
    godownId: godown._id,
    movementType: 'OPENING_STOCK',
    direction: 'IN',
    quantity: qtyBn.toString(),
    uomId: uom._id,
    idempotencyKey,
    effectiveDate: new Date(effectiveDate),
    unitRate: rateBn.toFixed(2),
    totalCost: finalTotalValBn.toFixed(2),
    sourceDocumentType: 'OPENING_STOCK',
    sourceDocumentId: `OPN-${stockItem.item_code}-${godown.godown_code}`,
    notes: notes.trim() || 'Initial inventory opening balance',
    userId
  });

  return {
    ...result,
    gl_status: 'DEFERRED_TO_PHASE_4',
    gl_note: 'Opening stock GL balancing entry deferred to Phase 4 commercial voucher engine.'
  };
}

module.exports = {
  postOpeningStock,
  recordOpeningStock: postOpeningStock
};
