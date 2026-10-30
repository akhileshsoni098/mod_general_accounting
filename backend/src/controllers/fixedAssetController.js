const fixedAssetService = require('../services/fixedAssetService');
const { FixedAsset } = require('../models');

async function listAssets(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { status, category } = req.query;
    const filter = { tenant_id: tenantId, company_id: companyId };
    if (status) filter.status = status.toUpperCase();
    if (category) filter.category = category.toUpperCase();

    const assets = await FixedAsset.find(filter).sort({ acquisition_date: -1 });
    return res.success(assets);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function getAssetById(req, res) {
  try {
    const { tenantId, companyId } = req;
    const asset = await FixedAsset.findOne({
      _id: req.params.id,
      tenant_id: tenantId,
      company_id: companyId
    });
    if (!asset) return res.error('Fixed asset not found', 404);
    return res.success(asset);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function capitalizeAssetHandler(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const asset = await fixedAssetService.capitalizeAsset({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      assetCode: req.body.asset_code,
      assetName: req.body.asset_name,
      category: req.body.category,
      assetAccountCode: req.body.asset_account_code || '1410',
      accumulatedDepreciationAccountCode: req.body.accumulated_depreciation_account_code || '1490',
      depreciationExpenseAccountCode: req.body.depreciation_expense_account_code || '5000',
      acquisitionDate: req.body.acquisition_date || new Date(),
      acquisitionCost: req.body.acquisition_cost,
      salvageValue: req.body.salvage_value || 0,
      usefulLifeMonths: req.body.useful_life_months || 60,
      depreciationMethod: req.body.depreciation_method || 'SLM',
      annualRatePercent: req.body.annual_rate_percent || 0,
      notes: req.body.notes || ''
    });
    return res.success(asset, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function postDepreciationHandler(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;
    const { period_name, posting_date } = req.body;
    if (!period_name) return res.error('period_name is required (e.g. 2026-10)', 400);

    const result = await fixedAssetService.generateMonthlyDepreciation({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      assetId: id,
      periodName: period_name,
      postingDate: posting_date || new Date()
    });
    return res.success(result);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function disposeAssetHandler(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;
    const { sale_proceeds, proceeds_account_code, gain_loss_account_code, disposal_date, notes } = req.body;

    const result = await fixedAssetService.disposeAsset({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      assetId: id,
      saleProceeds: sale_proceeds || 0,
      proceedsAccountCode: proceeds_account_code || '1110',
      gainLossAccountCode: gain_loss_account_code || '5900',
      disposalDate: disposal_date || new Date(),
      notes: notes || ''
    });
    return res.success(result);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

module.exports = {
  listAssets,
  getAssetById,
  capitalizeAssetHandler,
  postDepreciationHandler,
  disposeAssetHandler
};
