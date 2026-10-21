const { LedgerAccount } = require('../models');
const mongoose = require('mongoose');

/**
 * Standard Commercial ERP Chart of Accounts (COA)
 * Designed for general trading, retail, restaurant, hotel, manufacturing, and service businesses.
 * Fully aligned with Indian Accounting Standards and general double-entry principles.
 */
const COMMERCIAL_ERP_COA = [
  // ASSETS (1000 - 1999)
  { account_code: '1000', account_name: 'Operating Cash', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Operating cash and treasury' },
  { account_code: '1001', account_name: 'Cash in Hand', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Counter and petty cash on hand' },
  { account_code: '1002', account_name: 'Primary Current Bank Account', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Main business operational bank account' },
  { account_code: '1010', account_name: 'Clearing & Settlement Account', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Clearing and settlement account for electronic payments and agency collections' },
  { account_code: '1100', account_name: 'Trade Receivables (General)', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AR', description: 'Trade accounts receivable' },
  { account_code: '1101', account_name: 'Sundry Debtors / Trade Receivables', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AR', description: 'Customer balances from credit sales' },
  { account_code: '1120', account_name: 'Allowance for Doubtful Accounts', account_type: 'ASSET', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Bad debt provision for uncollectible receivables' },
  { account_code: '1150', account_name: 'Franchise Commission Receivable', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Commission receivable from hub or business partners' },
  { account_code: '1201', account_name: 'Stock-in-Hand / Inventory Asset', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'NONE', description: 'Trading inventory and finished goods valuation' },
  { account_code: '1301', account_name: 'Input CGST Tax Credit', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Central GST input tax credit on purchases' },
  { account_code: '1302', account_name: 'Input SGST Tax Credit', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'State GST input tax credit on purchases' },
  { account_code: '1303', account_name: 'Input IGST Tax Credit', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Integrated GST input tax credit on interstate purchases' },

  // LIABILITIES (2000 - 2999)
  { account_code: '2000', account_name: 'Trade Payables (General)', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AP', description: 'Trade accounts payable' },
  { account_code: '2001', account_name: 'Sundry Creditors / Trade Payables', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AP', description: 'Amounts payable to trade suppliers and vendors' },
  { account_code: '2020', account_name: 'Commission Payable / Due to Main Hub', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AP', description: 'Commission share and royalties payable to central hub/franchisor' },
  { account_code: '2101', account_name: 'Output CGST Tax Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Central GST liability collected on sales' },
  { account_code: '2102', account_name: 'Output SGST Tax Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'State GST liability collected on sales' },
  { account_code: '2103', account_name: 'Output IGST Tax Payable', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Integrated GST liability collected on interstate sales' },
  { account_code: '2190', account_name: 'Customer Advance Suspense', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Unallocated customer receipts held in suspense' },

  // EQUITY (3000 - 3999)
  { account_code: '3000', account_name: 'Retained Earnings / Equity', account_type: 'EQUITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Accumulated retained earnings' },
  { account_code: '3001', account_name: 'Proprietor / Partner Capital Account', account_type: 'EQUITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Owner invested capital and equity' },
  { account_code: '3990', account_name: 'Opening Stock Offset / Valuation Reserve', account_type: 'EQUITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Balancing reserve for inventory opening balances' },

  // REVENUE (4000 - 4999)
  { account_code: '4000', account_name: 'General Sales Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'General revenue from business operations' },
  { account_code: '4001', account_name: 'Sales Revenue - Products (GST 18%)', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Revenue from standard taxable trading sales' },
  { account_code: '4002', account_name: 'Sales Revenue - Products (GST 5% / 12%)', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Revenue from reduced-rate goods sales' },
  { account_code: '4003', account_name: 'Service / Labor Sales Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Revenue from labor and professional services' },
  { account_code: '4200', account_name: 'Franchise Commission Revenue', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Commission earned from franchise operations and distribution' },
  { account_code: '4900', account_name: 'Sales Discounts Allowed', account_type: 'REVENUE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Discounts and concessions granted to customers' },

  // EXPENSES (5000 - 5999)
  { account_code: '5000', account_name: 'General & Administrative Expense', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Operational overhead and administrative expenses' },
  { account_code: '5001', account_name: 'Purchase Cost of Goods (GST 18%)', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Purchases of trading merchandise and raw materials' },
  { account_code: '5002', account_name: 'Purchase Cost of Goods (GST 5% / 12%)', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Purchases of lower-slab trading goods' },
  { account_code: '5003', account_name: 'Freight, Inward Carriage & Cartage', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Inward transportation charges on purchases' },
  { account_code: '5004', account_name: 'Cost of Goods Sold - Trading Goods', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'NONE', description: 'Cost of stock items sold recognized upon delivery' },
  { account_code: '5020', account_name: 'Bad Debt Expense', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Written-off uncollectible customer receivables' },
  { account_code: '5030', account_name: 'Bank Charges & Merchant Processing Fees', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Bank charges and payment gateway processing fees' },
  { account_code: '5101', account_name: 'Rent & Business Premises Expense', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Rent paid for shops, godowns, and offices' },
  { account_code: '5201', account_name: 'Staff Salaries & Wages', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Employee wages, bonuses, and incentives' },
  { account_code: '5900', account_name: 'Rounding & Transaction Differences', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Fractions of rupees and invoice rounding differences' }
];

const CANONICAL_COA = COMMERCIAL_ERP_COA;

async function seedTenantChartOfAccounts(tenantId, options = {}) {
  try {
    for (const acc of COMMERCIAL_ERP_COA) {
      await LedgerAccount.findOneAndUpdate(
        { tenant_id: tenantId, account_code: acc.account_code },
        {
          account_name: acc.account_name,
          account_type: acc.account_type,
          normal_balance: acc.normal_balance,
          is_fiduciary: acc.is_fiduciary || false,
          is_control_account: acc.is_control_account || false,
          is_posting_allowed: acc.is_posting_allowed !== false,
          subledger_type: acc.subledger_type,
          description: acc.description || '',
          status: 'ACTIVE'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
      );
    }
  } catch (err) {
    console.error(`[COA SEEDER ERROR for ${tenantId}]`, err);
    throw err;
  }
}

async function seedCompanyChartOfAccounts(tenantId, companyId, options = {}) {
  try {
    const listToSeed = COMMERCIAL_ERP_COA;
    const currency = options.currency || 'INR';

    for (const acc of listToSeed) {
      await LedgerAccount.findOneAndUpdate(
        { tenant_id: tenantId, company_id: companyId, account_code: acc.account_code },
        {
          account_name: acc.account_name,
          account_type: acc.account_type,
          normal_balance: acc.normal_balance,
          is_fiduciary: acc.is_fiduciary || false,
          is_control_account: acc.is_control_account || false,
          is_posting_allowed: acc.is_posting_allowed !== false,
          subledger_type: acc.subledger_type,
          description: acc.description || '',
          currency: currency,
          status: 'ACTIVE'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
      );
    }
  } catch (err) {
    console.error(`[COMPANY COA SEEDER ERROR for company ${companyId}]`, err);
    throw err;
  }
}

module.exports = {
  CANONICAL_COA,
  COMMERCIAL_ERP_COA,
  seedTenantChartOfAccounts,
  seedCompanyChartOfAccounts
};
