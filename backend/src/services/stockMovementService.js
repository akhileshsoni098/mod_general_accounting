const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  StockItem,
  Godown,
  UnitOfMeasurement,
  StockMovement,
  StockBalance
} = require('../models');
const { convertToBaseQuantity, roundToPrecision } = require('./uomConversionService');
const { withOptionalTransaction } = require('../utils/transactionHelper');

/**
 * Appends an immutable stock movement and atomically updates projected stock balance.
 *
 * @param {Object} options
 * @param {string|ObjectId} options.tenantId
 * @param {string|ObjectId} options.companyId
 * @param {string|ObjectId} options.stockItemId
 * @param {string|ObjectId} options.godownId
 * @param {string} options.movementType - 'OPENING_STOCK', 'PURCHASE_RECEIPT', 'SALES_ISSUE', etc.
 * @param {string} options.direction - 'IN' or 'OUT'
 * @param {number|string} options.quantity - Quantity in entered UOM (positive)
 * @param {string|ObjectId} options.uomId - Unit of measurement of entered quantity
 * @param {string} options.idempotencyKey - Unique key preventing duplicate postings
 * @param {Date|string} [options.effectiveDate]
 * @param {number|string} [options.unitRate=0]
 * @param {number|string} [options.totalCost=0]
 * @param {string} [options.sourceDocumentType]
 * @param {string} [options.sourceDocumentId]
 * @param {string} [options.sourceLineId]
 * @param {string} [options.notes]
 * @param {string|ObjectId} [options.userId]
 * @param {string|ObjectId} [options.reversalOfMovementId]
 * @returns {Promise<{ movement: Object, balance: Object }>}
 */
async function recordStockMovement(options) {
  const {
    tenantId,
    companyId,
    stockItemId,
    godownId,
    movementType,
    direction,
    quantity,
    uomId,
    idempotencyKey,
    effectiveDate = new Date(),
    unitRate = '0.00',
    totalCost = '0.00',
    sourceDocumentType = 'MANUAL',
    sourceDocumentId = null,
    sourceLineId = null,
    notes = '',
    userId = null,
    reversalOfMovementId = null,
    batchNumber = '',
    serialNumbers = [],
    expiryDate = null,
    disposition = 'RESTOCK',
    inspectionStatus = 'NOT_APPLICABLE',
    session = null
  } = options;

  if (!tenantId || !companyId) {
    throw new Error('tenantId and companyId are required');
  }
  if (!stockItemId || !godownId) {
    throw new Error('stockItemId and godownId are required');
  }
  if (!['IN', 'OUT'].includes(direction)) {
    throw new Error(`Invalid direction: "${direction}". Must be "IN" or "OUT".`);
  }
  if (!idempotencyKey) {
    throw new Error('idempotencyKey is required for stock movement tracking');
  }

  // Check idempotency: if movement with this key exists, return it
  const existingMovement = await StockMovement.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    idempotency_key: idempotencyKey
  });

  if (existingMovement) {
    const existingBalance = await StockBalance.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      stock_item_id: stockItemId,
      godown_id: godownId
    });
    return {
      movement: existingMovement,
      balance: existingBalance,
      is_duplicate: true
    };
  }

  // Load and validate StockItem
  const stockItem = await StockItem.findOne({
    _id: stockItemId,
    tenant_id: tenantId,
    company_id: companyId
  }).populate('base_uom_id');

  if (!stockItem) {
    throw new Error(`StockItem not found or does not belong to active company: ${stockItemId}`);
  }
  if (stockItem.status !== 'ACTIVE') {
    throw new Error(`Cannot record movement for inactive or archived item: "${stockItem.item_name}" (${stockItem.status})`);
  }

  // Tracking policy validations
  if (stockItem.tracking_policy?.is_batch_tracked && !batchNumber) {
    throw new Error(`Batch number is required for tracked item "${stockItem.item_name}"`);
  }
  if (stockItem.tracking_policy?.is_serial_tracked && (!serialNumbers || (Array.isArray(serialNumbers) && serialNumbers.length === 0))) {
    throw new Error(`Serial number(s) required for tracked item "${stockItem.item_name}"`);
  }
  if (stockItem.tracking_policy?.is_expiry_tracked && !expiryDate) {
    throw new Error(`Expiry date is required for perishable tracked item "${stockItem.item_name}"`);
  }

  // Load and validate Godown
  const godown = await Godown.findOne({
    _id: godownId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!godown) {
    throw new Error(`Godown not found or does not belong to active company: ${godownId}`);
  }
  if (godown.status !== 'ACTIVE') {
    throw new Error(`Cannot record movement for inactive godown: "${godown.godown_name}"`);
  }

  // Resolve UOM and calculate base quantity
  const uom = await UnitOfMeasurement.findOne({
    _id: uomId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!uom) {
    throw new Error(`Unit of measurement not found for company: ${uomId}`);
  }

  const convResult = await convertToBaseQuantity({
    stockItem,
    uom,
    baseUom: stockItem.base_uom_id,
    quantity
  });

  const baseQtyBn = new BigNumber(convResult.base_quantity);
  const signedBaseQtyBn = direction === 'IN' ? baseQtyBn : baseQtyBn.negated();

  const rateBn = new BigNumber(unitRate ? unitRate.toString() : '0');
  const costBn = new BigNumber(totalCost ? totalCost.toString() : '0');

  // Execute within transaction
  const operation = async (session) => {
    // 1. Atomically check or initialize StockBalance projection
    let balance = await StockBalance.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      stock_item_id: stockItem._id,
      godown_id: godown._id
    }).session(session);

    if (!balance) {
      balance = new StockBalance({
        tenant_id: tenantId,
        company_id: companyId,
        stock_item_id: stockItem._id,
        godown_id: godown._id,
        base_uom_id: stockItem.base_uom_id._id,
        quantity_on_hand: mongoose.Types.Decimal128.fromString('0.0000'),
        average_unit_cost: mongoose.Types.Decimal128.fromString('0.00'),
        total_inventory_value: mongoose.Types.Decimal128.fromString('0.00')
      });
    }

    const currentQty = new BigNumber(balance.quantity_on_hand.toString());
    const currentVal = new BigNumber(balance.total_inventory_value.toString());

    const newQty = currentQty.plus(signedBaseQtyBn);

    // Negative Stock Validation: Stock will never be negative
    if (direction === 'OUT' && newQty.isNegative()) {
      const availStr = currentQty.isLessThanOrEqualTo(0) ? '0.00' : currentQty.toFixed(2);
      const reqStr = baseQtyBn.toFixed(2);
      const uomCode = stockItem.base_uom_id?.unit_code || 'units';
      const err = new Error(
        `Insufficient stock for item "${stockItem.item_name}" to fulfill this order. Required: ${reqStr} ${uomCode}, Available: ${availStr} ${uomCode}. Stock cannot be negative.`
      );
      err.code = 'INSUFFICIENT_STOCK';
      throw err;
    }

    // 2. Create append-only movement record
    const movement = new StockMovement({
      tenant_id: tenantId,
      company_id: companyId,
      stock_item_id: stockItem._id,
      stockItemId: stockItem._id,
      godown_id: godown._id,
      movement_type: movementType,
      direction,
      quantity: mongoose.Types.Decimal128.fromString(quantity.toString()),
      base_quantity: mongoose.Types.Decimal128.fromString(signedBaseQtyBn.toString()),
      uom_id: uom._id,
      base_uom_id: stockItem.base_uom_id._id,
      conversion_factor: mongoose.Types.Decimal128.fromString(convResult.factor),
      unit_rate: mongoose.Types.Decimal128.fromString(rateBn.toFixed(2)),
      total_cost: mongoose.Types.Decimal128.fromString(costBn.toFixed(2)),
      source_document_type: sourceDocumentType,
      source_document_id: sourceDocumentId,
      sourceDocumentId: sourceDocumentId,
      source_line_id: sourceLineId,
      idempotency_key: idempotencyKey,
      effective_date: new Date(effectiveDate),
      batch_number: batchNumber || '',
      serial_numbers: Array.isArray(serialNumbers) ? serialNumbers : (serialNumbers ? [serialNumbers] : []),
      expiry_date: expiryDate ? new Date(expiryDate) : null,
      disposition: disposition || 'RESTOCK',
      inspection_status: inspectionStatus || 'NOT_APPLICABLE',
      notes: notes.trim(),
      created_by_user_id: userId,
      reversal_of_movement_id: reversalOfMovementId,
      is_reversed: false
    });

    await movement.save({ session });

    let newTotalVal = currentVal;
    let newAvgCost = new BigNumber(balance.average_unit_cost.toString());

    if (direction === 'IN') {
      newTotalVal = currentVal.plus(costBn);
      if (newQty.isGreaterThan(0)) {
        newAvgCost = newTotalVal.dividedBy(newQty);
      }
    } else {
      // OUT movement reduces value by average unit cost
      const costOfOut = baseQtyBn.times(newAvgCost);
      newTotalVal = currentVal.minus(costOfOut);
      if (newTotalVal.isNegative()) {
        newTotalVal = new BigNumber(0);
      }
    }

    balance.quantity_on_hand = mongoose.Types.Decimal128.fromString(newQty.toFixed(4));
    balance.total_inventory_value = mongoose.Types.Decimal128.fromString(newTotalVal.toFixed(2));
    balance.average_unit_cost = mongoose.Types.Decimal128.fromString(newAvgCost.toFixed(2));
    balance.last_movement_id = movement._id;
    balance.last_movement_date = movement.effective_date;
    balance.row_version = (balance.row_version || 1) + 1;

    await balance.save({ session });

    return { movement, balance, is_duplicate: false };
  };

  if (session) {
    return operation(session);
  }
  return withOptionalTransaction(operation);
}

/**
 * Reverses a posted stock movement by recording an opposite reversal entry.
 */
async function reverseStockMovement({ tenantId, companyId, movementId, reason = '', notes = '', userId = null, session = null }) {
  let findQ = StockMovement.findOne({
    _id: movementId,
    tenant_id: tenantId,
    company_id: companyId
  });
  if (session) findQ = findQ.session(session);
  const original = await findQ;

  if (!original) {
    throw new Error(`Stock movement not found: ${movementId}`);
  }
  if (original.is_reversed) {
    throw new Error(`Stock movement is already reversed: ${movementId}`);
  }

  const oppositeDirection = original.direction === 'IN' ? 'OUT' : 'IN';
  const reversalKey = `REV-${original._id}-${Date.now()}`;

  const operation = async (sess) => {
    original.is_reversed = true;
    await original.save({ session: sess });
    await StockMovement.updateOne({ _id: original._id }, { $set: { is_reversed: true } }, { session: sess });

    const revResult = await recordStockMovement({
      tenantId,
      companyId,
      stockItemId: original.stock_item_id,
      godownId: original.godown_id,
      movementType: 'REVERSAL',
      direction: oppositeDirection,
      quantity: original.quantity.toString(),
      uomId: original.uom_id,
      idempotencyKey: reversalKey,
      effectiveDate: new Date(),
      unitRate: original.unit_rate.toString(),
      totalCost: original.total_cost.toString(),
      sourceDocumentType: 'REVERSAL',
      sourceDocumentId: original._id.toString(),
      notes: reason || notes || `Reversal of movement ${original._id}`,
      userId,
      reversalOfMovementId: original._id,
      session: sess
    });

    return revResult;
  };

  if (session) {
    return operation(session);
  }
  return withOptionalTransaction(operation);
}

/**
 * Reconciles and rebuilds StockBalance projections from raw StockMovement records.
 */
async function rebuildStockBalances(arg1, arg2, arg3) {
  let tenantId, companyId, stockItemId;
  if (typeof arg1 === 'object' && arg1 !== null && arg1.tenantId) {
    tenantId = arg1.tenantId;
    companyId = arg1.companyId;
    stockItemId = arg1.stockItemId || null;
  } else {
    tenantId = arg1;
    companyId = arg2;
    stockItemId = arg3 || null;
  }

  const filter = {
    tenant_id: tenantId,
    company_id: companyId,
    is_reversed: false
  };
  if (stockItemId) {
    filter.stock_item_id = stockItemId;
  }

  const movements = await StockMovement.find(filter).sort({ effective_date: 1, created_at: 1 });

  // Map balances by composite key: `${stock_item_id}_${godown_id}`
  const balanceAggregator = {};

  for (const mov of movements) {
    const key = `${mov.stock_item_id.toString()}_${mov.godown_id.toString()}`;
    if (!balanceAggregator[key]) {
      balanceAggregator[key] = {
        stock_item_id: mov.stock_item_id,
        godown_id: mov.godown_id,
        base_uom_id: mov.base_uom_id,
        qty: new BigNumber(0),
        val: new BigNumber(0),
        last_mov_id: mov._id,
        last_mov_date: mov.effective_date
      };
    }

    const rec = balanceAggregator[key];
    const baseQtyBn = new BigNumber(mov.base_quantity.toString());
    const costBn = new BigNumber(mov.total_cost.toString());

    rec.qty = rec.qty.plus(baseQtyBn);
    if (mov.direction === 'IN') {
      rec.val = rec.val.plus(costBn);
    } else {
      const avgCost = rec.qty.isGreaterThan(0) ? rec.val.dividedBy(rec.qty.plus(baseQtyBn.abs())) : new BigNumber(0);
      rec.val = rec.val.minus(baseQtyBn.abs().times(avgCost));
      if (rec.val.isNegative()) rec.val = new BigNumber(0);
    }
    rec.last_mov_id = mov._id;
    rec.last_mov_date = mov.effective_date;
  }

  const results = [];
  for (const key of Object.keys(balanceAggregator)) {
    const data = balanceAggregator[key];
    const avgRate = data.qty.isGreaterThan(0) ? data.val.dividedBy(data.qty) : new BigNumber(0);

    const updated = await StockBalance.findOneAndUpdate(
      {
        tenant_id: tenantId,
        company_id: companyId,
        stock_item_id: data.stock_item_id,
        godown_id: data.godown_id
      },
      {
        base_uom_id: data.base_uom_id,
        quantity_on_hand: mongoose.Types.Decimal128.fromString(data.qty.toFixed(4)),
        total_inventory_value: mongoose.Types.Decimal128.fromString(data.val.toFixed(2)),
        average_unit_cost: mongoose.Types.Decimal128.fromString(avgRate.toFixed(2)),
        last_movement_id: data.last_mov_id,
        last_movement_date: data.last_mov_date
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(updated);
  }

  return {
    reconciled_count: results.length,
    balances: results
  };
}

module.exports = {
  recordStockMovement,
  reverseStockMovement,
  rebuildStockBalances
};
