const BigNumber = require('bignumber.js');
const {
  Tenant,
  CommercialDocument,
  StockBalance,
  StockItem,
  LedgerAccount,
  Journal,
  FiscalPeriod,
  Party
} = require('../models');

/**
 * Fetch real, database-backed commercial business KPI metrics for active tenant
 */
async function getDashboardMetrics(req, res) {
  try {
    const tenantId = req.tenantId;
    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) {
      return res.error('Tenant not found', 404);
    }

    // 1. Sales & Receivables (from Commercial Documents)
    const salesDocs = await CommercialDocument.find({
      tenant_id: tenantId,
      document_type: { $in: ['SALES_INVOICE', 'POS_INVOICE'] }
    }).lean();

    let totalReceivablesBN = new BigNumber(0);
    let totalInvoicedBN = new BigNumber(0);
    let unpaidInvoicesCount = 0;
    let paidInvoicesCount = 0;

    for (const doc of salesDocs) {
      const docTotal = new BigNumber(doc.total_amount ? doc.total_amount.toString() : '0');
      const docBalance = new BigNumber(doc.balance_due ? doc.balance_due.toString() : '0');

      totalInvoicedBN = totalInvoicedBN.plus(docTotal);
      if (doc.status === 'POSTED') {
        if (docBalance.isGreaterThan(0)) {
          totalReceivablesBN = totalReceivablesBN.plus(docBalance);
          unpaidInvoicesCount++;
        } else {
          paidInvoicesCount++;
        }
      } else if (doc.status === 'PAID') {
        paidInvoicesCount++;
      }
    }

    // 2. Purchases & Payables (from Commercial Documents)
    const purchaseDocs = await CommercialDocument.find({
      tenant_id: tenantId,
      document_type: 'PURCHASE_INVOICE'
    }).lean();

    let totalPayablesBN = new BigNumber(0);
    let totalPurchasesBN = new BigNumber(0);
    let unpaidPurchasesCount = 0;

    for (const doc of purchaseDocs) {
      const docTotal = new BigNumber(doc.total_amount ? doc.total_amount.toString() : '0');
      const docBalance = new BigNumber(doc.balance_due ? doc.balance_due.toString() : '0');

      totalPurchasesBN = totalPurchasesBN.plus(docTotal);
      if (doc.status === 'POSTED' && docBalance.isGreaterThan(0)) {
        totalPayablesBN = totalPayablesBN.plus(docBalance);
        unpaidPurchasesCount++;
      }
    }

    // 3. Inventory Stock Valuation
    const stockBalances = await StockBalance.find({ tenant_id: tenantId }).lean();
    let inventoryValuationBN = new BigNumber(0);
    for (const sb of stockBalances) {
      const val = new BigNumber(sb.balance_value ? sb.balance_value.toString() : '0');
      inventoryValuationBN = inventoryValuationBN.plus(val);
    }
    const totalStockItemsCount = await StockItem.countDocuments({ tenant_id: tenantId });

    // 4. Cash, Bank & GL Balances
    const accounts = await LedgerAccount.find({ tenant_id: tenantId }).lean();
    let operatingCashBN = new BigNumber(0);
    let cashInHandBN = new BigNumber(0);
    let bankCashBN = new BigNumber(0);
    let sundryDebtorsGLBN = new BigNumber(0);
    let sundryCreditorsGLBN = new BigNumber(0);
    let totalDebitsBN = new BigNumber(0);
    let totalCreditsBN = new BigNumber(0);

    for (const acc of accounts) {
      const bal = new BigNumber(acc.current_balance ? acc.current_balance.toString() : '0');
      if (acc.account_code === '1000') operatingCashBN = operatingCashBN.plus(bal);
      if (acc.account_code === '1001') cashInHandBN = cashInHandBN.plus(bal);
      if (acc.account_code === '1002') bankCashBN = bankCashBN.plus(bal);
      if (acc.account_code === '1101' || acc.account_code === '1100') sundryDebtorsGLBN = sundryDebtorsGLBN.plus(bal);
      if (acc.account_code === '2001' || acc.account_code === '2000') sundryCreditorsGLBN = sundryCreditorsGLBN.plus(bal);

      if (acc.normal_balance === 'DEBIT') {
        if (bal.isGreaterThan(0)) totalDebitsBN = totalDebitsBN.plus(bal);
        else totalCreditsBN = totalCreditsBN.plus(bal.abs());
      } else {
        if (bal.isGreaterThan(0)) totalCreditsBN = totalCreditsBN.plus(bal);
        else totalDebitsBN = totalDebitsBN.plus(bal.abs());
      }
    }

    const totalLiquidCash = operatingCashBN.plus(cashInHandBN).plus(bankCashBN);
    const trialBalanceBalanced = totalDebitsBN.isEqualTo(totalCreditsBN);

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

    // 7. Counterparties Count
    const counterpartyCount = await Party.countDocuments({ tenant_id: tenantId });

    return res.success({
      tenant: {
        id: tenant._id,
        name: tenant.name,
        tenant_code: tenant.tenant_code,
        tenant_type: tenant.tenant_type || 'ENTERPRISE',
        base_currency: tenant.base_currency || 'INR'
      },
      receivables: {
        total_outstanding: totalReceivablesBN.isGreaterThan(0) ? totalReceivablesBN.toFixed(2) : sundryDebtorsGLBN.toFixed(2),
        total_invoiced_ytd: totalInvoicedBN.toFixed(2),
        unpaid_invoices_count: unpaidInvoicesCount,
        paid_invoices_count: paidInvoicesCount,
        total_invoices_count: salesDocs.length,
        sundry_debtors_gl: sundryDebtorsGLBN.toFixed(2)
      },
      payables: {
        total_outstanding: totalPayablesBN.isGreaterThan(0) ? totalPayablesBN.toFixed(2) : sundryCreditorsGLBN.toFixed(2),
        total_purchases_ytd: totalPurchasesBN.toFixed(2),
        unpaid_purchases_count: unpaidPurchasesCount,
        total_purchases_count: purchaseDocs.length,
        sundry_creditors_gl: sundryCreditorsGLBN.toFixed(2),
        // Deprecated fields kept for backward-compatibility with UI
        carrier_payable_gl: '0.00',
        commission_payable_gl: '0.00',
        pending_settlements_due: '0.00',
        pending_settlements_count: 0
      },
      inventory: {
        total_stock_value: inventoryValuationBN.toFixed(2),
        active_items_count: totalStockItemsCount
      },
      cash: {
        operating_cash: operatingCashBN.toFixed(2),
        cash_in_hand: cashInHandBN.toFixed(2),
        bank_cash: bankCashBN.toFixed(2),
        total_cash: totalLiquidCash.toFixed(2),
        total_payments_collected: totalInvoicedBN.minus(totalReceivablesBN).isGreaterThan(0)
          ? totalInvoicedBN.minus(totalReceivablesBN).toFixed(2)
          : '0.00',
        unapplied_cash: '0.00',
        fiduciary_trust_cash: '0.00'
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
        counterparties_count: counterpartyCount,
        unmatched_bank_lines_count: 0
      }
    });
  } catch (err) {
    return res.error('Failed to load dashboard metrics', 500, err.message);
  }
}

module.exports = {
  getDashboardMetrics
};
