const budgetService = require('../services/budgetService');
const { BudgetDefinition } = require('../models');

async function listBudgets(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { fiscal_year } = req.query;
    const filter = { tenant_id: tenantId, company_id: companyId };
    if (fiscal_year) filter.fiscal_year = String(fiscal_year);

    const budgets = await BudgetDefinition.find(filter)
      .populate('lines.ledger_account_id', 'account_code account_name account_type')
      .sort({ fiscal_year: -1, createdAt: -1 });
    return res.success(budgets);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function saveBudget(req, res) {
  try {
    const { tenantId, companyId } = req;
    const budget = await budgetService.saveBudgetDefinition({
      tenantId,
      companyId,
      budgetName: req.body.budget_name,
      fiscalYear: req.body.fiscal_year,
      costCenterDimensionValue: req.body.cost_center_dimension_value || null,
      lines: req.body.lines || [],
      notes: req.body.notes || '',
      status: req.body.status || 'ACTIVE'
    });
    return res.success(budget, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function getVarianceReport(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;
    const { as_of_date } = req.query;

    const report = await budgetService.computeBudgetVariance({
      tenantId,
      companyId,
      budgetId: id,
      asOfDate: as_of_date || new Date()
    });
    return res.success(report);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

module.exports = {
  listBudgets,
  saveBudget,
  getVarianceReport
};
