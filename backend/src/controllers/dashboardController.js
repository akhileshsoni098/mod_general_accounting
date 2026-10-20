const BigNumber = require('bignumber.js');
const {
  Tenant,
  Invoice,
  Payment,
  LedgerAccount,
  Journal,
  FiscalPeriod,
  BankStatementLine,
  SettlementStatement,
  Party
} = require('../models');

/**
 * Fetch real, database-backed business KPI metrics for active tenant
 */
async function getDashboardMetrics(req, res) {
  try {
    const tenantId = req.tenantId;
    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) {
      return res.error('Tenant not found', 404);
    }

    // 1. Receivables & Invoices
    const invoices = await Invoice.find({ tenant_id: tenantId }).lean();
    let totalReceivablesBN = new BigNumber(0);
    let totalInvoicedBN = new BigNumber(0);
    let unpaidInvoicesCount = 0;
    let paidInvoicesCount = 0;

    for (const inv of invoices) {
      const invTotal = new BigNumber(inv.total_amount ? inv.total_amount.toString() : '0');
      const invBalance = new BigNumber(inv.balance_due ? inv.balance_due.toString() : '0');

      totalInvoicedBN = totalInvoicedBN.plus(invTotal);
      if (inv.status === 'UNPAID' || inv.status === 'PARTIALLY_PAID') {
        totalReceivablesBN = totalReceivablesBN.plus(invBalance);
        unpaidInvoicesCount++;
      } else if (inv.status === 'PAID') {
        paidInvoicesCount++;
      }
    }

    // 2. Payments Collected & Unapplied Cash
    const payments = await Payment.find({ tenant_id: tenantId }).lean();
    let totalPaymentsBN = new BigNumber(0);
    let unappliedCashBN = new BigNumber(0);

    for (const p of payments) {
      if (p.status !== 'VOIDED' && p.status !== 'RETURNED') {
        const pAmt = new BigNumber(p.amount ? p.amount.toString() : '0');
        const unalloc = new BigNumber(p.unallocated_amount ? p.unallocated_amount.toString() : '0');
        totalPaymentsBN = totalPaymentsBN.plus(pAmt);
        unappliedCashBN = unappliedCashBN.plus(unalloc);
      }
    }

    // 3. Cash & GL Balances
    const accounts = await LedgerAccount.find({ tenant_id: tenantId }).lean();
    let operatingCashBN = new BigNumber(0);
    let fiduciaryTrustCashBN = new BigNumber(0);
    let carrierPayableBN = new BigNumber(0);
    let commissionPayableBN = new BigNumber(0);
    let totalDebitsBN = new BigNumber(0);
    let totalCreditsBN = new BigNumber(0);

    for (const acc of accounts) {
      const bal = new BigNumber(acc.current_balance ? acc.current_balance.toString() : '0');
      if (acc.account_code === '1000') operatingCashBN = operatingCashBN.plus(bal);
      if (acc.account_code === '1010') fiduciaryTrustCashBN = fiduciaryTrustCashBN.plus(bal);
      if (acc.account_code === '2010') carrierPayableBN = carrierPayableBN.plus(bal);
      if (acc.account_code === '2020') commissionPayableBN = commissionPayableBN.plus(bal);

      if (acc.normal_balance === 'DEBIT') {
        if (bal.isGreaterThan(0)) totalDebitsBN = totalDebitsBN.plus(bal);
        else totalCreditsBN = totalCreditsBN.plus(bal.abs());
      } else {
        if (bal.isGreaterThan(0)) totalCreditsBN = totalCreditsBN.plus(bal);
        else totalDebitsBN = totalDebitsBN.plus(bal.abs());
      }
    }

    const trialBalanceBalanced = totalDebitsBN.isEqualTo(totalCreditsBN);

    // 4. Pending Carrier Settlement Statements
    const settlements = await SettlementStatement.find({ tenant_id: tenantId, status: { $ne: 'PAID' } }).lean();
    let pendingSettlementDueBN = new BigNumber(0);
    for (const s of settlements) {
      const due = new BigNumber(s.net_due_carrier ? s.net_due_carrier.toString() : '0');
      pendingSettlementDueBN = pendingSettlementDueBN.plus(due);
    }

    // 5. Recent Journals (last 5)
    const recentJournals = await Journal.find({ tenant_id: tenantId })
      .sort({ posting_date: -1, created_at: -1 })
      .limit(5)
      .lean();

    // 6. Active Accounting Period
    const now = new Date();
    const currentPeriod = await FiscalPeriod.findOne({
      tenant_id: tenantId,
      start_date: { $lte: now },
      end_date: { $gte: now }
    }).lean();

    // 7. Unmatched Bank Lines (Treasury)
    const unmatchedBankCount = await BankStatementLine.countDocuments({
      tenant_id: tenantId,
      reconciliation_status: 'UNMATCHED'
    });

    // 8. Total Counterparties Count
    const counterpartyCount = await Party.countDocuments({ tenant_id: tenantId });

    return res.success({
      tenant: {
        id: tenant._id,
        name: tenant.name,
        tenant_code: tenant.tenant_code,
        tenant_type: tenant.tenant_type || 'MGA',
        base_currency: tenant.base_currency || 'USD'
      },
      receivables: {
        total_outstanding: totalReceivablesBN.toFixed(2),
        total_invoiced_ytd: totalInvoicedBN.toFixed(2),
        unpaid_invoices_count: unpaidInvoicesCount,
        paid_invoices_count: paidInvoicesCount,
        total_invoices_count: invoices.length
      },
      cash: {
        operating_cash: operatingCashBN.toFixed(2),
        fiduciary_trust_cash: fiduciaryTrustCashBN.toFixed(2),
        total_cash: operatingCashBN.plus(fiduciaryTrustCashBN).toFixed(2),
        total_payments_collected: totalPaymentsBN.toFixed(2),
        unapplied_cash: unappliedCashBN.toFixed(2)
      },
      payables: {
        carrier_payable_gl: carrierPayableBN.toFixed(2),
        commission_payable_gl: commissionPayableBN.toFixed(2),
        pending_settlements_due: pendingSettlementDueBN.toFixed(2),
        pending_settlements_count: settlements.length
      },
      gl: {
        trial_balance_balanced: trialBalanceBalanced,
        total_debits: totalDebitsBN.toFixed(2),
        total_credits: totalCreditsBN.toFixed(2),
        active_accounts_count: accounts.length,
        current_period: currentPeriod ? {
          period_number: currentPeriod.period_number,
          period_name: currentPeriod.period_name,
          fiscal_year: currentPeriod.fiscal_year,
          status: currentPeriod.status
        } : null,
        recent_journals: recentJournals.map(j => ({
          id: j._id,
          journal_number: j.journal_number,
          posting_date: j.posting_date,
          source_module: j.source_module,
          total_amount: j.total_amount ? j.total_amount.toString() : '0.00',
          status: j.status,
          memo: j.memo
        }))
      },
      operations: {
        unmatched_bank_lines_count: unmatchedBankCount,
        counterparties_count: counterpartyCount
      }
    });
  } catch (err) {
    return res.error('Failed to load dashboard metrics', 500, err.message);
  }
}

module.exports = {
  getDashboardMetrics
};
