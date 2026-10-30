const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  PriceList,
  StockItem,
  StockBalance,
  CommercialDocument,
  LedgerAccount,
  Journal
} = require('../models');
const { postJournalEntry } = require('./journalPostingService');

/**
 * Resolves the applicable selling price for a stock item based on party price tier / level and quantity
 */
async function resolveItemPrice({
  tenantId,
  companyId,
  priceLevelName = null,
  stockItemId,
  quantity = 1,
  asOfDate = new Date()
}) {
  const item = await StockItem.findOne({
    _id: stockItemId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!item) {
    throw new Error('Stock item not found');
  }

  const defaultPrice = item.sales_price ? item.sales_price.toString() : (item.standard_selling_price || '0.00');

  if (!priceLevelName) {
    return {
      price_level_name: 'STANDARD',
      rate: defaultPrice,
      discount_percent: 0,
      final_rate: defaultPrice,
      source: 'STOCK_ITEM_STANDARD'
    };
  }

  const query = {
    tenant_id: tenantId,
    company_id: companyId,
    price_level_name: String(priceLevelName).trim().toUpperCase(),
    stock_item_id: stockItemId,
    min_quantity: { $lte: Number(quantity) },
    status: 'ACTIVE',
    effective_from: { $lte: new Date(asOfDate) },
    $or: [{ effective_to: null }, { effective_to: { $gte: new Date(asOfDate) } }]
  };

  const matched = await PriceList.find(query).sort({ min_quantity: -1 }).limit(1);

  if (matched.length > 0) {
    const tier = matched[0];
    const rateBN = new BigNumber(tier.rate ? tier.rate.toString() : '0');
    const discPercent = tier.discount_percent || 0;
    const finalBN = rateBN.multipliedBy(1 - discPercent / 100);

    return {
      price_level_name: tier.price_level_name,
      rate: rateBN.toFixed(2),
      discount_percent: discPercent,
      final_rate: finalBN.toFixed(2),
      min_quantity: tier.min_quantity,
      source: 'PRICE_LEVEL'
    };
  }

  return {
    price_level_name: String(priceLevelName).toUpperCase(),
    rate: defaultPrice,
    discount_percent: 0,
    final_rate: defaultPrice,
    source: 'FALLBACK_STANDARD'
  };
}

/**
 * Upserts a price list tier
 */
async function upsertPriceListTier({
  tenantId,
  companyId,
  priceLevelName,
  stockItemId,
  currency = 'INR',
  minQuantity = 1,
  rate,
  discountPercent = 0,
  effectiveFrom = new Date(),
  effectiveTo = null
}) {
  const normLevel = String(priceLevelName).trim().toUpperCase();
  const filter = {
    tenant_id: tenantId,
    company_id: companyId,
    price_level_name: normLevel,
    stock_item_id: stockItemId,
    min_quantity: Number(minQuantity)
  };

  const update = {
    currency,
    rate: mongoose.Types.Decimal128.fromString(new BigNumber(rate).toFixed(2)),
    discount_percent: Number(discountPercent),
    effective_from: new Date(effectiveFrom),
    effective_to: effectiveTo ? new Date(effectiveTo) : null,
    status: 'ACTIVE'
  };

  const doc = await PriceList.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  });

  return doc;
}

/**
 * Allocates landed costs (freight, customs, handling) across purchase items
 * and posts balancing inventory valuation journal entry.
 */
async function allocateLandedCost({
  tenantId,
  companyId,
  userId,
  purchaseDocumentId,
  expenseLedgerAccountId,
  inventoryLedgerAccountId,
  totalAdditionalCost,
  allocationBasis = 'VALUE',
  chargeType = 'FREIGHT',
  referenceId = null,
  allowDuplicate = false,
  notes = '',
  session = null
}) {
  const LandedCostAllocation = mongoose.model('LandedCostAllocation');

  // Guard against duplicate reference / bill if specified
  if (referenceId) {
    const existingRef = await LandedCostAllocation.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      reference_id: referenceId,
      status: { $ne: 'CANCELLED' }
    });
    if (existingRef) {
      throw new Error(`Landed cost allocation already exists for reference "${referenceId}" (Voucher: ${existingRef.voucher_number})`);
    }
  }

  const purchaseDoc = await CommercialDocument.findOne({
    _id: purchaseDocumentId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!purchaseDoc) {
    throw new Error('Purchase document not found in active company');
  }

  if (!purchaseDoc.lines || purchaseDoc.lines.length === 0) {
    throw new Error('Purchase document has no item lines to allocate landed costs to');
  }

  const expAcc = await LedgerAccount.findOne({
    _id: expenseLedgerAccountId,
    tenant_id: tenantId,
    company_id: companyId
  });
  if (!expAcc) throw new Error('Expense / clearing ledger account not found');

  const invAcc = await LedgerAccount.findOne({
    _id: inventoryLedgerAccountId,
    tenant_id: tenantId,
    company_id: companyId
  });
  if (!invAcc) throw new Error('Inventory ledger account not found');

  const totalCostBN = new BigNumber(totalAdditionalCost);
  if (totalCostBN.isLessThanOrEqualTo(0)) {
    throw new Error('Total additional landed cost must be greater than zero');
  }

  // Guard against identical charge duplicate allocation on the same purchase invoice
  const existingDup = await LandedCostAllocation.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    purchase_document_id: purchaseDocumentId,
    charge_type: chargeType,
    total_additional_cost: mongoose.Types.Decimal128.fromString(totalCostBN.toFixed(2)),
    status: 'POSTED'
  });
  if (existingDup && !allowDuplicate) {
    throw new Error(`Duplicate landed cost allocation prevented: ${chargeType} allocation of ₹${totalCostBN.toFixed(2)} is already posted for this purchase document (${existingDup.voucher_number})`);
  }

  // Calculate basis denominator
  let totalBasis = new BigNumber(0);
  const validLines = [];

  for (const line of purchaseDoc.lines) {
    const qty = new BigNumber(line.quantity ? line.quantity.toString() : 0);
    const rawRate = line.unit_rate || line.unit_price || line.rate || 0;
    const rate = new BigNumber(rawRate ? rawRate.toString() : 0);
    const lineVal = qty.multipliedBy(rate);

    if (qty.isGreaterThan(0)) {
      validLines.push({
        stock_item_id: line.stock_item_id,
        item_code: line.item_code || 'ITEM',
        item_name: line.description || line.item_code || 'Stock Item',
        quantity: qty.toNumber(),
        rate: rate,
        value: lineVal
      });

      if (allocationBasis === 'QUANTITY') {
        totalBasis = totalBasis.plus(qty);
      } else {
        totalBasis = totalBasis.plus(lineVal);
      }
    }
  }

  if (totalBasis.isZero()) {
    throw new Error('Total basis value/quantity across purchase lines is zero');
  }

  // Apportion landed cost to each line
  let runningAllocated = new BigNumber(0);
  const allocatedLines = [];

  for (let i = 0; i < validLines.length; i++) {
    const l = validLines[i];
    let lineAlloc;

    if (i === validLines.length - 1) {
      // Last line gets remainder to guarantee exact cents precision
      lineAlloc = totalCostBN.minus(runningAllocated);
    } else {
      const basisNumerator = allocationBasis === 'QUANTITY' ? new BigNumber(l.quantity) : l.value;
      const proportion = basisNumerator.dividedBy(totalBasis);
      lineAlloc = totalCostBN.multipliedBy(proportion).decimalPlaces(2, BigNumber.ROUND_HALF_UP);
      runningAllocated = runningAllocated.plus(lineAlloc);
    }

    const additionalUnit = lineAlloc.dividedBy(l.quantity).decimalPlaces(2, BigNumber.ROUND_HALF_UP);
    const newUnit = l.rate.plus(additionalUnit);

    allocatedLines.push({
      stock_item_id: l.stock_item_id,
      item_code: l.item_code,
      item_name: l.item_name,
      quantity: l.quantity,
      original_rate: mongoose.Types.Decimal128.fromString(l.rate.toFixed(2)),
      original_value: mongoose.Types.Decimal128.fromString(l.value.toFixed(2)),
      allocated_cost: mongoose.Types.Decimal128.fromString(lineAlloc.toFixed(2)),
      additional_unit_cost: mongoose.Types.Decimal128.fromString(additionalUnit.toFixed(2)),
      new_unit_cost: mongoose.Types.Decimal128.fromString(newUnit.toFixed(2))
    });

    // Update stock item valuation in stock balances if applicable
    if (l.stock_item_id) {
      const stockItem = await StockItem.findById(l.stock_item_id);
      if (stockItem) {
        stockItem.standard_cost = Number(newUnit.toFixed(2));
        await stockItem.save();
      }
    }
  }

  // Generate Voucher Number
  const count = await mongoose.model('LandedCostAllocation').countDocuments({
    tenant_id: tenantId,
    company_id: companyId
  });
  const voucherNumber = `LCA-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

  // Post balanced double-entry journal entry:
  // Debit: Inventory Asset (1201)
  // Credit: Expense / Clearing Account (5003 / 1290)
  const journalResult = await postJournalEntry({
    tenantId,
    companyId,
    userId,
    postingDate: new Date(),
    sourceModule: 'LANDED_COST',
    referenceId: voucherNumber,
    memo: `Landed cost allocation (${chargeType} via ${allocationBasis}) for Purchase ${purchaseDoc.document_number}: ${notes}`,
    currency: purchaseDoc.currency || 'INR',
    lines: [
      {
        account_code: invAcc.account_code,
        debit: totalCostBN.toFixed(2),
        credit: '0.00',
        memo: `Capitalized landed ${chargeType.toLowerCase()} to inventory`
      },
      {
        account_code: expAcc.account_code,
        debit: '0.00',
        credit: totalCostBN.toFixed(2),
        memo: `Landed cost clearing / absorption offset`
      }
    ],
    session
  });

  const allocation = new LandedCostAllocation({
    tenant_id: tenantId,
    company_id: companyId,
    voucher_number: voucherNumber,
    reference_id: referenceId,
    allocation_date: new Date(),
    purchase_document_id: purchaseDoc._id,
    charge_type: chargeType,
    allocation_basis: allocationBasis,
    total_additional_cost: mongoose.Types.Decimal128.fromString(totalCostBN.toFixed(2)),
    expense_ledger_account_id: expAcc._id,
    inventory_ledger_account_id: invAcc._id,
    lines: allocatedLines,
    journal_id: journalResult.journal._id,
    status: 'POSTED',
    notes
  });

  await allocation.save(session ? { session } : undefined);

  return {
    allocation,
    journal: journalResult.journal
  };
}

module.exports = {
  resolveItemPrice,
  upsertPriceListTier,
  allocateLandedCost
};
