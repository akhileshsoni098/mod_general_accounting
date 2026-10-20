const { LedgerAccount } = require('../models');
const mongoose = require('mongoose');

// Canonical Insurance Chart of Accounts (COA) per Veridex 4.6 specification
const CANONICAL_COA = [
  // ASSETS (1000 - 1999)
  { account_code: '1000', account_name: 'Operating Cash', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Operating checking account for operational expenses' },
  { account_code: '1010', account_name: 'Premium Trust Bank (Texas § 4053)', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: true, is_posting_allowed: true, subledger_type: 'FIDUCIARY', description: 'Segregated statutory fiduciary premium trust account' },
  { account_code: '1020', account_name: 'Cash - Claims Escrow Account', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: true, is_posting_allowed: true, subledger_type: 'FIDUCIARY', description: 'Escrow account for carrier claims settlements' },
  { account_code: '1100', account_name: 'Premium Receivable', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AR', description: 'Direct and Agency billed premium receivable' },
  { account_code: '1120', account_name: 'Allowance for Doubtful Accounts', account_type: 'ASSET', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Bad debt provision for uncollectible receivables' },
  { account_code: '1200', account_name: 'Prepaid Reinsurance Premium', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Prepaid treaty and facultative reinsurance' },

  // LIABILITIES (2000 - 2999)
  { account_code: '2010', account_name: 'Due to Carrier', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: true, is_posting_allowed: true, subledger_type: 'FIDUCIARY', description: 'Net premium payable to underwriting carrier' },
  { account_code: '2020', account_name: 'Broker Commission Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: true, is_posting_allowed: true, subledger_type: 'COMMISSIONS', description: 'Earned and unremitted producing broker commission' },
  { account_code: '2100', account_name: 'Return Premium Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: true, is_posting_allowed: true, subledger_type: 'AP', description: 'Refunds due to policyholders upon endorsement or cancellation' },
  { account_code: '2190', account_name: 'Unapplied Cash', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Unmatched customer payments held in suspense' },
  { account_code: '2200', account_name: 'Unearned Premium Reserve (UPR - ASC 944)', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'UPR', description: 'Pro-rata unearned premium liability reserve' },
  { account_code: '2500', account_name: 'Loss Reserves', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'NONE', description: 'Incurred but not reported (IBNR) and case loss reserves' },

  // EQUITY (3000 - 3999)
  { account_code: '3000', account_name: 'Equity', account_type: 'EQUITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Contributed surplus and retained earnings' },

  // REVENUE (4000 - 4999)
  { account_code: '4000', account_name: 'Earned Premium Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'UPR', description: 'Recognized earned premium under ASC 944' },
  { account_code: '4100', account_name: 'Policy Fee Income', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Earned MGA policy and administrative fees' },
  { account_code: '4200', account_name: 'MGA Commission Income', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'COMMISSIONS', description: 'Overriding commission retained by MGA' },

  // EXPENSES (5000 - 5999)
  { account_code: '5000', account_name: 'General & Administrative Expense', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Operational overhead and administrative expenses' },
  { account_code: '5010', account_name: 'Commission Expense - Retail Agent', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'COMMISSIONS', description: 'Direct producing broker commission cost' },
  { account_code: '5020', account_name: 'Bad Debt Expense', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Written-off uncollectible premium receivables' },
  { account_code: '5030', account_name: 'Merchant Processing & Banking Fees', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Credit card and banking interchange fees' }
];

async function seedTenantChartOfAccounts(tenantId) {
  try {
    for (const acc of CANONICAL_COA) {
      await LedgerAccount.findOneAndUpdate(
        { tenant_id: tenantId, account_code: acc.account_code },
        {
          account_name: acc.account_name,
          account_type: acc.account_type,
          normal_balance: acc.normal_balance,
          is_fiduciary: acc.is_fiduciary,
          is_control_account: acc.is_control_account || false,
          is_posting_allowed: acc.is_posting_allowed !== false,
          subledger_type: acc.subledger_type,
          description: acc.description || '',
          status: 'ACTIVE'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  } catch (err) {
    console.error(`[COA SEEDER ERROR for ${tenantId}]`, err);
    throw err;
  }
}

module.exports = {
  CANONICAL_COA,
  seedTenantChartOfAccounts
};
