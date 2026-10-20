const BigNumber = require('bignumber.js');
const { UnitOfMeasurement, StockItem } = require('../models');

// Configure BigNumber formatting
BigNumber.config({
  DECIMAL_PLACES: 8,
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
  EXPONENTIAL_AT: [-10, 20]
});

// Standard dimension conversion table (relative to base dimension standard unit)
// MASS: base is GRAM
// VOLUME: base is ML
// LENGTH: base is MM
// COUNT: base is PCS
const STANDARD_UNITS = {
  // COUNT
  PCS: { type: 'COUNT', factorToBase: '1', decimal_places: 0 },
  DOZEN: { type: 'COUNT', factorToBase: '12', decimal_places: 0 },
  GROSS: { type: 'COUNT', factorToBase: '144', decimal_places: 0 },

  // MASS (base: GRAM)
  MG: { type: 'MASS', factorToBase: '0.001', decimal_places: 4 },
  GRAM: { type: 'MASS', factorToBase: '1', decimal_places: 2 },
  KG: { type: 'MASS', factorToBase: '1000', decimal_places: 3 },
  QUINTAL: { type: 'MASS', factorToBase: '100000', decimal_places: 3 },
  TON: { type: 'MASS', factorToBase: '1000000', decimal_places: 3 },

  // VOLUME (base: ML)
  ML: { type: 'VOLUME', factorToBase: '1', decimal_places: 2 },
  LTR: { type: 'VOLUME', factorToBase: '1000', decimal_places: 3 },
  KL: { type: 'VOLUME', factorToBase: '1000000', decimal_places: 3 },

  // LENGTH (base: MM)
  MM: { type: 'LENGTH', factorToBase: '1', decimal_places: 2 },
  CM: { type: 'LENGTH', factorToBase: '10', decimal_places: 2 },
  MTR: { type: 'LENGTH', factorToBase: '1000', decimal_places: 3 },
  KM: { type: 'LENGTH', factorToBase: '1000000', decimal_places: 3 },

  // PACKAGING / GENERIC
  BOX: { type: 'PACKAGING', factorToBase: '1', decimal_places: 0 },
  PACK: { type: 'PACKAGING', factorToBase: '1', decimal_places: 0 },
  BAG: { type: 'PACKAGING', factorToBase: '1', decimal_places: 0 },
  ROLL: { type: 'PACKAGING', factorToBase: '1', decimal_places: 0 },
  CAN: { type: 'PACKAGING', factorToBase: '1', decimal_places: 0 },
  BOTTLE: { type: 'PACKAGING', factorToBase: '1', decimal_places: 0 }
};

/**
 * Validates that a conversion factor is a positive, non-zero number.
 */
function validateConversionFactor(factor) {
  if (factor === undefined || factor === null) {
    throw new Error('Conversion factor is required');
  }
  const bn = new BigNumber(factor.toString());
  if (bn.isNaN() || !bn.isFinite()) {
    throw new Error(`Invalid conversion factor: "${factor}". Must be a valid finite number.`);
  }
  if (bn.isLessThanOrEqualTo(0)) {
    throw new Error(`Conversion factor must be strictly greater than 0, got ${factor}`);
  }
  return bn;
}

/**
 * Rounds a quantity to the allowed decimal places.
 */
function roundToPrecision(value, decimalPlaces = 0) {
  const bn = new BigNumber(value.toString());
  if (bn.isNaN()) return '0';
  const precision = Math.max(0, Math.min(4, parseInt(decimalPlaces, 10) || 0));
  return bn.toFixed(precision);
}

/**
 * Resolves conversion factor between two standard units in the same dimension.
 * E.g. KG -> GRAM: 1 KG = 1000 GRAM.
 */
function resolveStandardConversionFactor(fromCode, toCode) {
  const normFrom = fromCode.toUpperCase().trim();
  const normTo = toCode.toUpperCase().trim();

  if (normFrom === normTo) {
    return new BigNumber(1);
  }

  const uFrom = STANDARD_UNITS[normFrom];
  const uTo = STANDARD_UNITS[normTo];

  if (!uFrom || !uTo) {
    return null; // Not in standard dimension table
  }

  if (uFrom.type !== uTo.type) {
    throw new Error(
      `Incompatible unit dimensions: Cannot convert from ${normFrom} (${uFrom.type}) to ${normTo} (${uTo.type}) without an item-specific conversion.`
    );
  }

  // fromUnit base value / toUnit base value
  // E.g. 1 KG (1000g) -> GRAM (1g) = 1000 / 1 = 1000
  // 1 GRAM (1g) -> KG (1000g) = 1 / 1000 = 0.001
  const fromBase = new BigNumber(uFrom.factorToBase);
  const toBase = new BigNumber(uTo.factorToBase);
  return fromBase.dividedBy(toBase);
}

/**
 * Resolves the conversion factor from a transaction unit to an item's base unit.
 * Priority:
 * 1. Exact match (fromUomId === baseUomId) -> 1
 * 2. Item-specific conversion defined on stockItem.uom_conversions
 * 3. Standard dimension table (if both units share the same dimension)
 *
 * @param {Object} options
 * @param {Object} options.stockItem - Loaded StockItem document
 * @param {Object|string} options.fromUom - UnitOfMeasurement document or ID
 * @param {Object|string} options.baseUom - UnitOfMeasurement document or ID
 * @returns {BigNumber} Factor such that: baseQuantity = quantity * factor
 */
async function resolveConversionFactorToBase({ stockItem, fromUom, baseUom }) {
  const fromIdStr = (fromUom._id || fromUom.id || fromUom).toString();
  const baseIdStr = (baseUom._id || baseUom.id || baseUom).toString();

  // 1. Identity
  if (fromIdStr === baseIdStr) {
    return new BigNumber(1);
  }

  // 2. Item-Specific Conversion Check
  if (stockItem && Array.isArray(stockItem.uom_conversions)) {
    const itemConv = stockItem.uom_conversions.find(
      (c) => (c.alternate_uom_id._id || c.alternate_uom_id).toString() === fromIdStr
    );
    if (itemConv) {
      return validateConversionFactor(itemConv.conversion_factor);
    }
  }

  // 3. Fallback to Standard Dimension Table
  // Load UOM details if not fully populated
  let fromUomDoc = fromUom;
  let baseUomDoc = baseUom;

  if (!fromUomDoc.unit_code) {
    fromUomDoc = await UnitOfMeasurement.findById(fromIdStr);
  }
  if (!baseUomDoc.unit_code) {
    baseUomDoc = await UnitOfMeasurement.findById(baseIdStr);
  }

  if (!fromUomDoc || !baseUomDoc) {
    throw new Error('Unit of measurement not found for conversion');
  }

  const stdFactor = resolveStandardConversionFactor(fromUomDoc.unit_code, baseUomDoc.unit_code);
  if (stdFactor !== null) {
    return stdFactor;
  }

  throw new Error(
    `No conversion path found for item "${stockItem?.sku || stockItem?.item_name || 'Item'}" from unit ${fromUomDoc.unit_code} to base unit ${baseUomDoc.unit_code}. An item-specific conversion factor must be configured.`
  );
}

/**
 * Converts quantity from any unit to base unit with decimal safety.
 */
async function convertToBaseQuantity({ stockItem, uom, baseUom, quantity }) {
  const qtyBn = new BigNumber(quantity ? quantity.toString() : '0');
  if (qtyBn.isNaN()) {
    throw new Error(`Invalid quantity value: "${quantity}"`);
  }

  const factor = await resolveConversionFactorToBase({ stockItem, fromUom: uom, baseUom });
  const baseQty = qtyBn.times(factor);

  // Determine decimal precision of base unit
  let precision = 0;
  if (baseUom && baseUom.decimal_places !== undefined) {
    precision = baseUom.decimal_places;
  } else if (stockItem && stockItem.base_uom_id && stockItem.base_uom_id.decimal_places !== undefined) {
    precision = stockItem.base_uom_id.decimal_places;
  }

  const roundedBaseQty = roundToPrecision(baseQty, precision);
  return {
    quantity: qtyBn.toString(),
    factor: factor.toString(),
    base_quantity: roundedBaseQty,
    base_quantity_raw: baseQty.toString()
  };
}

/**
 * High-level multi-unit conversion method used by API and simulation services.
 */
async function convertQuantity({ tenantId, companyId, stockItemId, fromUomId, toUomId, quantity }) {
  const qtyBn = new BigNumber(quantity ? quantity.toString() : '0');
  if (qtyBn.isNaN()) {
    throw new Error(`Invalid quantity value: "${quantity}"`);
  }

  const fromIdStr = (fromUomId._id || fromUomId.id || fromUomId).toString();
  const toIdStr = (toUomId._id || toUomId.id || toUomId).toString();

  // Load UOM docs
  let fromUomDoc = fromUomId.unit_code ? fromUomId : await UnitOfMeasurement.findById(fromIdStr);
  let toUomDoc = toUomId.unit_code ? toUomId : await UnitOfMeasurement.findById(toIdStr);

  if (!fromUomDoc || !toUomDoc) {
    throw new Error('From or To unit of measurement not found');
  }

  // 1. Identity
  if (fromIdStr === toIdStr) {
    return {
      source_quantity: qtyBn.toString(),
      target_quantity: qtyBn.toString(),
      conversion_factor: '1',
      conversion_type: 'IDENTITY',
      from_unit: fromUomDoc.unit_code,
      to_unit: toUomDoc.unit_code
    };
  }

  // 2. Item-Specific Conversion Check
  if (stockItemId) {
    const stockItem = stockItemId.uom_conversions
      ? stockItemId
      : await StockItem.findById(stockItemId._id || stockItemId.id || stockItemId);

    if (stockItem && Array.isArray(stockItem.uom_conversions)) {
      const baseIdStr = (stockItem.base_uom_id._id || stockItem.base_uom_id).toString();

      // Case A: From Alternate UOM -> Base UOM
      if (toIdStr === baseIdStr) {
        const itemConv = stockItem.uom_conversions.find(
          (c) => (c.alternate_uom_id._id || c.alternate_uom_id).toString() === fromIdStr
        );
        if (itemConv) {
          const factor = validateConversionFactor(itemConv.conversion_factor);
          const targetQty = qtyBn.times(factor);
          return {
            source_quantity: qtyBn.toString(),
            target_quantity: targetQty.toString(),
            conversion_factor: factor.toString(),
            conversion_type: 'ITEM_SPECIFIC',
            from_unit: fromUomDoc.unit_code,
            to_unit: toUomDoc.unit_code
          };
        }
      }

      // Case B: From Base UOM -> Alternate UOM
      if (fromIdStr === baseIdStr) {
        const itemConv = stockItem.uom_conversions.find(
          (c) => (c.alternate_uom_id._id || c.alternate_uom_id).toString() === toIdStr
        );
        if (itemConv) {
          const factor = validateConversionFactor(itemConv.conversion_factor);
          const targetQty = qtyBn.dividedBy(factor);
          return {
            source_quantity: qtyBn.toString(),
            target_quantity: targetQty.toString(),
            conversion_factor: new BigNumber(1).dividedBy(factor).toString(),
            conversion_type: 'ITEM_SPECIFIC',
            from_unit: fromUomDoc.unit_code,
            to_unit: toUomDoc.unit_code
          };
        }
      }
    }
  }

  // 3. Dimension-based conversion
  if (fromUomDoc.unit_type !== toUomDoc.unit_type) {
    throw new Error(
      `Cannot convert between incompatible unit dimensions (${fromUomDoc.unit_type} and ${toUomDoc.unit_type}) without an item-specific packaging conversion.`
    );
  }

  const factor = resolveStandardConversionFactor(fromUomDoc.unit_code, toUomDoc.unit_code);
  if (!factor) {
    throw new Error(
      `Standard conversion not available between ${fromUomDoc.unit_code} and ${toUomDoc.unit_code}`
    );
  }

  const targetQty = qtyBn.times(factor);
  return {
    source_quantity: qtyBn.toString(),
    target_quantity: targetQty.toString(),
    conversion_factor: factor.toString(),
    conversion_type: 'STANDARD_DIMENSION',
    from_unit: fromUomDoc.unit_code,
    to_unit: toUomDoc.unit_code
  };
}

module.exports = {
  STANDARD_UNITS,
  getStandardUnits: () => STANDARD_UNITS,
  validateConversionFactor,
  roundToPrecision,
  resolveStandardConversionFactor,
  resolveConversionFactorToBase,
  convertToBaseQuantity,
  convertQuantity
};

