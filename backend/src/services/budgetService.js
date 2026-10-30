const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const { BudgetDefinition, LedgerAccount, Journal, JournalEntry } = require('../models');

/**
 * Creates or updates a budget definition.
 */
async function saveBudgetDefinition({
  tenantId,
  companyId,
  budgetName,
  fiscalYear,
  costCenterDimensionValue = null,
  lines = [],
  notes = '',
  status = 'ACTIVE'
}) {
  const formattedLines = [];
  for (const l of lines) {
    const acc = await LedgerAccount.findOne({
      _id: l.ledger_account_id,
      tenant_id: tenantId,
      ...(companyId ? { company_id: companyId } : {})
    });
    if (!acc) throw new Error(`Ledger account not found: ${l.ledger_account_id}`);

    const annualBN = new BigNumber(l.annual_budget_amount || 0);
    const monthlyFormatted = (l.monthly_breakdown || []).map(m => ({
      month: m.month,
      amount: mongoose.Types.Decimal128.fromString(new BigNumber(m.amount || 0).toFixed(2))
    }));

    formattedLines.push({
      ledger_account_id: acc._id,
      annual_budget_amount: mongoose.Types.Decimal128.fromString(annualBN.toFixed(2)),
      monthly_breakdown: monthlyFormatted
    });
  }

  const budget = await BudgetDefinition.findOneAndUpdate(
    {
      tenant_id: tenantId,
      company_id: companyId,
      budget_name: budgetName,
      fiscal_year: String(fiscalYear)
    },
    {
      cost_center_dimension_value: costCenterDimensionValue,
      lines: formattedLines,
      notes,
      status
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return budget;
}

/**
 * Computes Budget vs Actual variance report for a budget definition.
 */
async function computeBudgetVariance({
  tenantId,
  companyId,
  budgetId,
  asOfDate = new Date()
}) {
  const budget = await BudgetDefinition.findOne({
    _id: budgetId,
    tenant_id: tenantId,
    company_id: companyId
  }).populate('lines.ledger_account_id');

  if (!budget) throw new Error('Budget definition not found');

  // Query POSTED journals within the fiscal year
  const postedJournalIds = await Journal.find({
    tenant_id: tenantId,
    company_id: companyId,
    status: 'POSTED'
  }).distinct('_id');

  let totalBudgetBN = new BigNumber(0);
  let totalActualBN = new BigNumber(0);
  const varianceLines = [];

  for (const bl of budget.lines) {
    const acc = bl.ledger_account_id;
    if (!acc) continue;

    const annualBudgetBN = new BigNumber(bl.annual_budget_amount ? bl.annual_budget_amount.toString() : 0);
    totalBudgetBN = totalBudgetBN.plus(annualBudgetBN);

    // Aggregate actual debits & credits from JournalEntry
    const entries = await JournalEntry.find({
      tenant_id: tenantId,
      company_id: companyId,
      journal_id: { $in: postedJournalIds },
      ledger_account_id: acc._id
    });

    let actualActivityBN = new BigNumber(0);
    for (const e of entries) {
      const dr = new BigNumber(e.debit ? e.debit.toString() : 0);
      const cr = new BigNumber(e.credit ? e.credit.toString() : 0);
      if (acc.account_type === 'EXPENSE') {
        actualActivityBN = actualActivityBN.plus(dr).minus(cr);
      } else if (acc.account_type === 'REVENUE') {
        actualActivityBN = actualActivityBN.plus(cr).minus(dr);
      } else {
        actualActivityBN = actualActivityBN.plus(dr).minus(cr);
      }
    }

    totalActualBN = totalActualBN.plus(actualActivityBN);

    // Variance = Actual - Budget
    const varianceBN = actualActivityBN.minus(annualBudgetBN);
    const variancePercent = annualBudgetBN.isGreaterThan(0)
      ? varianceBN.dividedBy(annualBudgetBN).multipliedBy(100).toFixed(2) + '%'
      : '0.00%';

    // Determine favorable / unfavorable
    let isFavorable = false;
    if (acc.account_type === 'EXPENSE') {
      isFavorable = actualActivityBN.isLessThanOrEqualTo(annualBudgetBN);
    } else if (acc.account_type === 'REVENUE') {
      isFavorable = actualActivityBN.isGreaterThanOrEqualTo(annualBudgetBN);
    } else {
      isFavorable = varianceBN.isZero();
    }

    varianceLines.push({
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      budgeted_amount: annualBudgetBN.toFixed(2),
      actual_amount: actualActivityBN.toFixed(2),
      variance_amount: varianceBN.toFixed(2),
      variance_percentage: variancePercent,
      classification: isFavorable ? 'FAVORABLE' : 'UNFAVORABLE'
    });
  }

  const netVarianceBN = totalActualBN.minus(totalBudgetBN);

  return {
    budget_name: budget.budget_name,
    fiscal_year: budget.fiscal_year,
    as_of_date: new Date(asOfDate).toISOString().slice(0, 10),
    total_budgeted: totalBudgetBN.toFixed(2),
    total_actual: totalActualBN.toFixed(2),
    net_variance: netVarianceBN.toFixed(2),
    lines: varianceLines
  };
}

module.exports = {
  saveBudgetDefinition,
  computeBudgetVariance
};
