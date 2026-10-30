const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const { FixedAsset, LedgerAccount } = require('../models');
const { postJournalEntry } = require('./journalPostingService');

/**
 * Capitalizes a new fixed asset.
 */
async function capitalizeAsset({
  tenantId,
  companyId,
  userId,
  assetCode,
  assetName,
  category = 'EQUIPMENT',
  assetAccountCode = '1410',
  accumulatedDepreciationAccountCode = '1490',
  depreciationExpenseAccountCode = '5000',
  acquisitionDate = new Date(),
  acquisitionCost,
  salvageValue = 0,
  usefulLifeMonths = 60,
  depreciationMethod = 'SLM',
  annualRatePercent = 0,
  notes = '',
  session = null
}) {
  const costBN = new BigNumber(acquisitionCost);
  if (costBN.isLessThanOrEqualTo(0)) {
    throw new Error('Asset acquisition cost must be greater than zero');
  }

  const salvageBN = new BigNumber(salvageValue || 0);
  if (salvageBN.isGreaterThanOrEqualTo(costBN)) {
    throw new Error('Salvage value must be less than acquisition cost');
  }

  const asset = new FixedAsset({
    tenant_id: tenantId,
    company_id: companyId,
    asset_code: String(assetCode).trim().toUpperCase(),
    asset_name: assetName,
    category,
    asset_account_code: assetAccountCode,
    accumulated_depreciation_account_code: accumulatedDepreciationAccountCode,
    depreciation_expense_account_code: depreciationExpenseAccountCode,
    acquisition_date: new Date(acquisitionDate),
    acquisition_cost: mongoose.Types.Decimal128.fromString(costBN.toFixed(2)),
    salvage_value: mongoose.Types.Decimal128.fromString(salvageBN.toFixed(2)),
    useful_life_months: Number(usefulLifeMonths),
    depreciation_method: depreciationMethod,
    annual_rate_percent: Number(annualRatePercent),
    current_book_value: mongoose.Types.Decimal128.fromString(costBN.toFixed(2)),
    depreciation_history: [],
    status: 'ACTIVE',
    notes
  });

  await asset.save(session ? { session } : undefined);
  return asset;
}

/**
 * Runs monthly depreciation for a specific asset and posts balanced journal entry.
 */
async function generateMonthlyDepreciation({
  tenantId,
  companyId,
  userId,
  assetId,
  periodName,
  postingDate = new Date(),
  session = null
}) {
  const asset = await FixedAsset.findOne({
    _id: assetId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!asset) throw new Error('Fixed asset not found');
  if (asset.status !== 'ACTIVE') {
    throw new Error(`Asset cannot be depreciated. Current status: "${asset.status}"`);
  }

  // Prevent duplicate depreciation run for the same period
  const alreadyRan = asset.depreciation_history.some(h => h.period_name === periodName);
  if (alreadyRan) {
    throw new Error(`Depreciation for period "${periodName}" has already been posted for asset "${asset.asset_code}"`);
  }

  const currentBookValBN = new BigNumber(asset.current_book_value.toString());
  const salvageBN = new BigNumber(asset.salvage_value.toString());
  const costBN = new BigNumber(asset.acquisition_cost.toString());
  const maxDepreciable = currentBookValBN.minus(salvageBN);

  if (maxDepreciable.isLessThanOrEqualTo(0)) {
    asset.status = 'FULLY_DEPRECIATED';
    await asset.save(session ? { session } : undefined);
    throw new Error(`Asset "${asset.asset_code}" is already fully depreciated down to salvage value`);
  }

  let monthlyDeprBN = new BigNumber(0);
  if (asset.depreciation_method === 'SLM') {
    // SLM: (Cost - Salvage) / useful_life_months
    const totalDepreciable = costBN.minus(salvageBN);
    monthlyDeprBN = totalDepreciable.dividedBy(asset.useful_life_months).decimalPlaces(2, BigNumber.ROUND_HALF_UP);
  } else {
    // WDV: Current Book Value * (Rate% / 1200)
    const rate = new BigNumber(asset.annual_rate_percent || 15);
    monthlyDeprBN = currentBookValBN.multipliedBy(rate).dividedBy(1200).decimalPlaces(2, BigNumber.ROUND_HALF_UP);
  }

  // Clamp to remaining book value
  if (monthlyDeprBN.isGreaterThan(maxDepreciable)) {
    monthlyDeprBN = maxDepreciable;
  }

  const newBookValBN = currentBookValBN.minus(monthlyDeprBN);

  // Post balanced Journal Entry:
  // Debit: Depreciation Expense (e.g. 5000)
  // Credit: Accumulated Depreciation (e.g. 1490)
  const journalResult = await postJournalEntry({
    tenantId,
    companyId,
    userId,
    postingDate,
    sourceModule: 'FIXED_ASSETS',
    referenceId: `DEP-${asset.asset_code}-${periodName}`,
    memo: `Monthly depreciation for ${asset.asset_name} (${asset.asset_code}) for period ${periodName}`,
    currency: 'INR',
    lines: [
      {
        account_code: asset.depreciation_expense_account_code,
        debit: monthlyDeprBN.toFixed(2),
        credit: '0.00',
        memo: `Depreciation expense on ${asset.asset_name}`
      },
      {
        account_code: asset.accumulated_depreciation_account_code,
        debit: '0.00',
        credit: monthlyDeprBN.toFixed(2),
        memo: `Accumulated depreciation offset on ${asset.asset_code}`
      }
    ],
    session
  });

  asset.current_book_value = mongoose.Types.Decimal128.fromString(newBookValBN.toFixed(2));
  asset.depreciation_history.push({
    period_name: periodName,
    posting_date: new Date(postingDate),
    depreciation_amount: mongoose.Types.Decimal128.fromString(monthlyDeprBN.toFixed(2)),
    book_value_after: mongoose.Types.Decimal128.fromString(newBookValBN.toFixed(2)),
    journal_id: journalResult.journal._id
  });

  if (newBookValBN.isEqualTo(salvageBN)) {
    asset.status = 'FULLY_DEPRECIATED';
  }

  await asset.save(session ? { session } : undefined);

  return {
    asset,
    depreciation_amount: monthlyDeprBN.toFixed(2),
    book_value_after: newBookValBN.toFixed(2),
    journal: journalResult.journal
  };
}

/**
 * Disposes an asset, calculates gain or loss, and posts balanced compound disposal journal.
 */
async function disposeAsset({
  tenantId,
  companyId,
  userId,
  assetId,
  saleProceeds = 0,
  proceedsAccountCode = '1110', // Bank Account
  gainLossAccountCode = '5900', // Gain/Loss on Disposal
  disposalDate = new Date(),
  notes = '',
  session = null
}) {
  const asset = await FixedAsset.findOne({
    _id: assetId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!asset) throw new Error('Fixed asset not found');
  if (asset.status === 'DISPOSED' || asset.status === 'WRITTEN_OFF') {
    throw new Error(`Asset is already ${asset.status}`);
  }

  const costBN = new BigNumber(asset.acquisition_cost.toString());
  const bookValBN = new BigNumber(asset.current_book_value.toString());
  const totalAccumDeprBN = costBN.minus(bookValBN);
  const proceedsBN = new BigNumber(saleProceeds || 0);

  // Gain / Loss = Proceeds - Net Book Value
  const gainLossBN = proceedsBN.minus(bookValBN);

  // Build balanced compound journal lines:
  // 1. Debit Cash/Bank for Proceeds (if proceeds > 0)
  // 2. Debit Accumulated Depreciation for total accumulated
  // 3. Credit Asset Account for original cost
  // 4. If Gain (gainLoss > 0): Credit Gain on Asset Disposal
  //    If Loss (gainLoss < 0): Debit Loss on Asset Disposal
  const lines = [];

  if (proceedsBN.isGreaterThan(0)) {
    lines.push({
      account_code: proceedsAccountCode,
      debit: proceedsBN.toFixed(2),
      credit: '0.00',
      memo: `Sale proceeds from disposal of ${asset.asset_code}`
    });
  }

  if (totalAccumDeprBN.isGreaterThan(0)) {
    lines.push({
      account_code: asset.accumulated_depreciation_account_code,
      debit: totalAccumDeprBN.toFixed(2),
      credit: '0.00',
      memo: `Reverse accumulated depreciation on ${asset.asset_code}`
    });
  }

  lines.push({
    account_code: asset.asset_account_code,
    debit: '0.00',
    credit: costBN.toFixed(2),
    memo: `Derecognize original cost of ${asset.asset_code}`
  });

  if (gainLossBN.isGreaterThan(0)) {
    // Gain: Credit Income
    lines.push({
      account_code: '4200', // Other Income / Gain
      debit: '0.00',
      credit: gainLossBN.toFixed(2),
      memo: `Gain on disposal of ${asset.asset_code}`
    });
  } else if (gainLossBN.isLessThan(0)) {
    // Loss: Debit Expense
    lines.push({
      account_code: gainLossAccountCode,
      debit: gainLossBN.abs().toFixed(2),
      credit: '0.00',
      memo: `Loss on disposal of ${asset.asset_code}`
    });
  }

  const journalResult = await postJournalEntry({
    tenantId,
    companyId,
    userId,
    postingDate: disposalDate,
    sourceModule: 'FIXED_ASSETS',
    referenceId: `DISP-${asset.asset_code}`,
    memo: `Disposal of ${asset.asset_name} (${asset.asset_code}): Proceeds ${proceedsBN.toFixed(2)}, Book Value ${bookValBN.toFixed(2)}: ${notes}`,
    currency: 'INR',
    lines,
    session
  });

  asset.status = 'DISPOSED';
  asset.current_book_value = mongoose.Types.Decimal128.fromString('0.00');
  asset.disposal_details = {
    disposal_date: new Date(disposalDate),
    sale_proceeds: mongoose.Types.Decimal128.fromString(proceedsBN.toFixed(2)),
    accumulated_depreciation: mongoose.Types.Decimal128.fromString(totalAccumDeprBN.toFixed(2)),
    gain_or_loss: mongoose.Types.Decimal128.fromString(gainLossBN.toFixed(2)),
    journal_id: journalResult.journal._id
  };

  await asset.save(session ? { session } : undefined);

  return {
    asset,
    net_book_value_at_disposal: bookValBN.toFixed(2),
    gain_or_loss: gainLossBN.toFixed(2),
    is_gain: gainLossBN.isGreaterThan(0),
    journal: journalResult.journal
  };
}

module.exports = {
  capitalizeAsset,
  generateMonthlyDepreciation,
  disposeAsset
};
