const { LedgerAccount } = require('../models');
const mongoose = require('mongoose');

/**
 * Standard Tally-Style Account Groups
 * 15 Primary Groups (parent_code: null) and 13 Subgroups (parent_code references Primary Group).
 * All groups have is_posting_allowed: false so they act strictly as non-posting summary/hierarchy nodes.
 */
const TALLY_STANDARD_GROUPS = [
  // 1. Primary Groups (Root Nodes)
  { account_code: 'GRP-CAPITAL', account_name: 'Capital Account', account_type: 'EQUITY', normal_balance: 'CREDIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Capital invested by owners/partners and reserves' },
  { account_code: 'GRP-CURR-ASSET', account_name: 'Current Assets', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Short-term assets convertible to cash within one financial year' },
  { account_code: 'GRP-CURR-LIAB', account_name: 'Current Liabilities', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Short-term obligations due within one financial year' },
  { account_code: 'GRP-FIXED-ASSET', account_name: 'Fixed Assets', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Long-term tangible assets used in business operations' },
  { account_code: 'GRP-INVESTMENT', account_name: 'Investments', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Long-term financial and capital investments' },
  { account_code: 'GRP-LOANS-LIAB', account_name: 'Loans (Liability)', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Secured and unsecured loans borrowed by the business' },
  { account_code: 'GRP-SUSPENSE', account_name: 'Suspense Account', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Temporary clearing and discrepancy accounts' },
  { account_code: 'GRP-MISC-EXP', account_name: 'Misc. Expenses (ASSET)', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Preliminary and deferred revenue expenses not yet amortized' },
  { account_code: 'GRP-BRANCH-DIV', account_name: 'Branch / Divisions', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Inter-branch and division balancing accounts' },
  { account_code: 'GRP-SALES', account_name: 'Sales Accounts', account_type: 'REVENUE', normal_balance: 'CREDIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Trading sales and primary operating revenue' },
  { account_code: 'GRP-PURCHASE', account_name: 'Purchase Accounts', account_type: 'EXPENSE', normal_balance: 'DEBIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Direct purchases of goods, materials, and merchandise' },
  { account_code: 'GRP-DIR-INCOME', account_name: 'Direct Incomes', account_type: 'REVENUE', normal_balance: 'CREDIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Incomes directly linked to core business operations' },
  { account_code: 'GRP-INDIR-INCOME', account_name: 'Indirect Incomes', account_type: 'REVENUE', normal_balance: 'CREDIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Non-operating incomes such as interest, commissions, and discounts' },
  { account_code: 'GRP-DIR-EXP', account_name: 'Direct Expenses', account_type: 'EXPENSE', normal_balance: 'DEBIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Manufacturing, freight, COGS, and direct operational costs' },
  { account_code: 'GRP-INDIR-EXP', account_name: 'Indirect Expenses', account_type: 'EXPENSE', normal_balance: 'DEBIT', parent_code: null, group_type: 'PRIMARY_GROUP', is_group: true, is_posting_allowed: false, description: 'Administrative, selling, distribution, and general overheads' },

  // 2. Subgroups (Children of Primary Groups)
  { account_code: 'SUB-RESERVES', account_name: 'Reserves & Surplus', account_type: 'EQUITY', normal_balance: 'CREDIT', parent_code: 'GRP-CAPITAL', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Accumulated retained earnings, reserves, and surpluses' },
  { account_code: 'SUB-BANK-ACC', account_name: 'Bank Accounts', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: 'GRP-CURR-ASSET', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Checking, savings, and current accounts with commercial banks' },
  { account_code: 'SUB-CASH-IN-HAND', account_name: 'Cash-in-Hand', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: 'GRP-CURR-ASSET', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Physical cash held across registers, vaults, and petty cash' },
  { account_code: 'SUB-STOCK-IN-HAND', account_name: 'Stock-in-Hand', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: 'GRP-CURR-ASSET', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Raw materials, work-in-progress, and finished goods inventory' },
  { account_code: 'SUB-SUNDRY-DEBTORS', account_name: 'Sundry Debtors', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: 'GRP-CURR-ASSET', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Trade customer accounts receivable from sales of goods or services' },
  { account_code: 'SUB-DEPOSITS-ASSET', account_name: 'Deposits (Asset)', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: 'GRP-CURR-ASSET', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Security deposits, rent deposits, and utility advances' },
  { account_code: 'SUB-LOANS-ADV', account_name: 'Loans & Advances (Asset)', account_type: 'ASSET', normal_balance: 'DEBIT', parent_code: 'GRP-CURR-ASSET', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Advances to suppliers, staff loans, and short-term receivables' },
  { account_code: 'SUB-DUTIES-TAXES', account_name: 'Duties & Taxes', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: 'GRP-CURR-LIAB', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'GST (CGST/SGST/IGST), TDS, VAT, and excise tax obligations' },
  { account_code: 'SUB-SUNDRY-CREDITORS', account_name: 'Sundry Creditors', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: 'GRP-CURR-LIAB', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Trade supplier and vendor accounts payable' },
  { account_code: 'SUB-PROVISIONS', account_name: 'Provisions', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: 'GRP-CURR-LIAB', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Provisions for taxation, employee benefits, and doubtful debts' },
  { account_code: 'SUB-BANK-OD', account_name: 'Bank OD / OCC Accounts', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: 'GRP-LOANS-LIAB', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Bank overdraft and cash credit working capital facilities' },
  { account_code: 'SUB-SECURED-LOANS', account_name: 'Secured Loans', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: 'GRP-LOANS-LIAB', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Term loans secured by business assets or hypothecation' },
  { account_code: 'SUB-UNSECURED-LOANS', account_name: 'Unsecured Loans', account_type: 'LIABILITY', normal_balance: 'CREDIT', parent_code: 'GRP-LOANS-LIAB', group_type: 'SUBGROUP', is_group: true, is_posting_allowed: false, description: 'Unsecured loans from promoters, directors, or third parties' }
];

/**
 * Standard Commercial ERP Posting Accounts (COA)
 * Fully linked to Tally Primary Groups and Subgroups via parent_code.
 */
const COMMERCIAL_ERP_COA = [
  // ASSETS (1000 - 1999)
  { account_code: '1000', account_name: 'Operating Cash', parent_code: 'SUB-CASH-IN-HAND', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Operating cash and treasury' },
  { account_code: '1001', account_name: 'Cash in Hand', parent_code: 'SUB-CASH-IN-HAND', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Counter and petty cash on hand' },
  { account_code: '1002', account_name: 'Primary Current Bank Account / Main Bank', parent_code: 'SUB-BANK-ACC', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Main business operational bank account' },
  { account_code: '1010', account_name: 'HDFC Bank Account / Main Bank', parent_code: 'SUB-BANK-ACC', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'HDFC Bank Account / Main Bank for payments and collections' },
  { account_code: '1100', account_name: 'Accounts Receivable (Sundry Debtors)', parent_code: 'SUB-SUNDRY-DEBTORS', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AR', description: 'Trade accounts receivable / Sundry Debtors' },
  { account_code: '1101', account_name: 'Sundry Debtors / Trade Receivables', parent_code: 'SUB-SUNDRY-DEBTORS', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AR', description: 'Customer balances from credit sales' },
  { account_code: '1110', account_name: 'Business Checking Bank Account', parent_code: 'SUB-BANK-ACC', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Operational bank account' },
  { account_code: '1120', account_name: 'Allowance for Doubtful Accounts', parent_code: 'SUB-SUNDRY-DEBTORS', account_type: 'ASSET', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Bad debt provision for uncollectible receivables' },
  { account_code: '1150', account_name: 'Franchise Commission Receivable', parent_code: 'SUB-SUNDRY-DEBTORS', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Commission receivable from hub or business partners' },
  { account_code: '1201', account_name: 'Stock-in-Hand / Inventory Asset', parent_code: 'SUB-STOCK-IN-HAND', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'NONE', description: 'Trading inventory and finished goods valuation' },
  { account_code: '1210', account_name: 'CGST Input Tax Credit', parent_code: 'SUB-DUTIES-TAXES', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Central GST input tax credit on purchases' },
  { account_code: '1220', account_name: 'SGST Input Tax Credit', parent_code: 'SUB-DUTIES-TAXES', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'State GST input tax credit on purchases' },
  { account_code: '1300', account_name: 'Inventory Asset', parent_code: 'SUB-STOCK-IN-HAND', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'NONE', description: 'Inventory stock in godown / warehouse' },
  { account_code: '1301', account_name: 'Input CGST Tax Credit', parent_code: 'SUB-DUTIES-TAXES', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Central GST input tax credit on purchases' },
  { account_code: '1302', account_name: 'Input SGST Tax Credit', parent_code: 'SUB-DUTIES-TAXES', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'State GST input tax credit on purchases' },
  { account_code: '1303', account_name: 'Input IGST Tax Credit', parent_code: 'SUB-DUTIES-TAXES', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Integrated GST input tax credit on interstate purchases' },
  { account_code: '1410', account_name: 'Prepaid Rent (अग्रिम किराया)', parent_code: 'SUB-LOANS-ADV', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Advance rent payment recorded as prepaid expense (Scenario 11)' },
  { account_code: '1500', account_name: 'Kitchen Equipment / Furniture', parent_code: 'GRP-FIXED-ASSET', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Fixed assets: Kitchen equipment, furniture, and fixtures' },
  { account_code: '1590', account_name: 'Accumulated Depreciation', parent_code: 'GRP-FIXED-ASSET', account_type: 'ASSET', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Accumulated depreciation contra-asset account' },

  // LIABILITIES (2000 - 2999)
  { account_code: '2000', account_name: 'Accounts Payable (Sundry Creditors)', parent_code: 'SUB-SUNDRY-CREDITORS', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AP', description: 'Trade accounts payable / Sundry Creditors' },
  { account_code: '2001', account_name: 'Sundry Creditors / Trade Payables', parent_code: 'SUB-SUNDRY-CREDITORS', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AP', description: 'Amounts payable to trade suppliers and vendors' },
  { account_code: '2020', account_name: 'Commission Payable / Due to Main Hub', parent_code: 'SUB-SUNDRY-CREDITORS', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'AP', description: 'Commission share and royalties payable to central hub/franchisor' },
  { account_code: '2101', account_name: 'Output CGST Tax Payable', parent_code: 'SUB-DUTIES-TAXES', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Central GST liability collected on sales' },
  { account_code: '2102', account_name: 'Output SGST Tax Payable', parent_code: 'SUB-DUTIES-TAXES', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'State GST liability collected on sales' },
  { account_code: '2103', account_name: 'Output IGST Tax Payable', parent_code: 'SUB-DUTIES-TAXES', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Integrated GST liability collected on interstate sales' },
  { account_code: '2110', account_name: 'Sales Tax Payable (US)', parent_code: 'SUB-DUTIES-TAXES', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'US Sales tax liability collected from customers' },
  { account_code: '2115', account_name: 'Use Tax Payable (US)', parent_code: 'SUB-DUTIES-TAXES', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'US Consumer and vendor use tax payable' },
  { account_code: '2120', account_name: 'Accrued Electricity Expenses', parent_code: 'SUB-PROVISIONS', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Accrued unpaid electricity and utility bills (Scenario 11)' },
  { account_code: '2121', account_name: 'Salaries & Wages Payable', parent_code: 'SUB-PROVISIONS', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Net salaries and wages payable to staff' },
  { account_code: '2190', account_name: 'Customer Advance Suspense', parent_code: 'SUB-SUNDRY-CREDITORS', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Unallocated customer receipts held in suspense' },
  { account_code: '2210', account_name: 'CGST Output Liability', parent_code: 'SUB-DUTIES-TAXES', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Central GST liability collected on sales' },
  { account_code: '2220', account_name: 'SGST Output Liability', parent_code: 'SUB-DUTIES-TAXES', account_type: 'LIABILITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'State GST liability collected on sales' },

  // EQUITY (3000 - 3999)
  { account_code: '3000', account_name: 'Retained Earnings / Equity', parent_code: 'SUB-RESERVES', account_type: 'EQUITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Accumulated retained earnings' },
  { account_code: '3001', account_name: 'Proprietor / Partner Capital Account', parent_code: 'GRP-CAPITAL', account_type: 'EQUITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Owner invested capital and equity' },
  { account_code: '3990', account_name: 'Opening Stock Offset / Valuation Reserve', parent_code: 'SUB-RESERVES', account_type: 'EQUITY', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Balancing reserve for inventory opening balances' },

  // REVENUE (4000 - 4999)
  { account_code: '4000', account_name: 'Sales Revenue', parent_code: 'GRP-SALES', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Operating revenue from sales' },
  { account_code: '4001', account_name: 'Sales Revenue - Products (GST 18%)', parent_code: 'GRP-SALES', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Revenue from standard taxable trading sales' },
  { account_code: '4002', account_name: 'Sales Revenue - Products (GST 5% / 12%)', parent_code: 'GRP-SALES', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Revenue from reduced-rate goods sales' },
  { account_code: '4003', account_name: 'Service / Labor Sales Revenue', parent_code: 'GRP-DIR-INCOME', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Revenue from labor and professional services' },
  { account_code: '4200', account_name: 'Franchise Commission Revenue', parent_code: 'GRP-DIR-INCOME', account_type: 'REVENUE', normal_balance: 'CREDIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Commission earned from franchise operations and distribution' },
  { account_code: '4900', account_name: 'Sales Discounts Allowed', parent_code: 'GRP-SALES', account_type: 'REVENUE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Discounts and concessions granted to customers' },

  // EXPENSES (5000 - 5999)
  { account_code: '5000', account_name: 'General & Administrative Expense', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Operational overhead and administrative expenses' },
  { account_code: '5001', account_name: 'Purchase Cost of Goods (GST 18%)', parent_code: 'GRP-PURCHASE', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Purchases of trading merchandise and raw materials' },
  { account_code: '5002', account_name: 'Purchase Cost of Goods (GST 5% / 12%)', parent_code: 'GRP-PURCHASE', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Purchases of lower-slab trading goods' },
  { account_code: '5003', account_name: 'Freight, Inward Carriage & Cartage', parent_code: 'GRP-DIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Inward transportation charges on purchases' },
  { account_code: '5004', account_name: 'Cost of Goods Sold - Trading Goods', parent_code: 'GRP-DIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_control_account: true, is_posting_allowed: true, subledger_type: 'NONE', description: 'Cost of stock items sold recognized upon delivery' },
  { account_code: '5010', account_name: 'Rent Expense', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Monthly rent expense (Scenario 11)' },
  { account_code: '5020', account_name: 'Electricity & Utility Expense', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Electricity, power, and utility expenses (Scenario 11)' },
  { account_code: '5025', account_name: 'Bad Debt Expense', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'AR', description: 'Written-off uncollectible customer receivables' },
  { account_code: '5030', account_name: 'Bank Charges & Merchant Processing Fees', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Bank charges and payment gateway processing fees' },
  { account_code: '5101', account_name: 'Rent & Business Premises Expense', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Rent paid for shops, godowns, and offices' },
  { account_code: '5110', account_name: 'Sales & Use Tax Expense (Non-recoverable)', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Non-recoverable sales tax and consumer use tax expense' },
  { account_code: '5201', account_name: 'Staff Salaries & Wages', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Employee wages, bonuses, and incentives' },
  { account_code: '5210', account_name: 'Bank Charges & Fees', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Bank transaction charges and fees (Scenario 15)' },
  { account_code: '5300', account_name: 'Depreciation Expense', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Depreciation expense on fixed assets (Scenario 19)' },
  { account_code: '5900', account_name: 'Rounding & Transaction Differences', parent_code: 'GRP-INDIR-EXP', account_type: 'EXPENSE', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Fractions of rupees and invoice rounding differences' },

  // SUSPENSE ACCOUNT (9000 - 9999)
  { account_code: '9999', account_name: 'Opening Balance Suspense Account', parent_code: 'GRP-SUSPENSE', account_type: 'ASSET', normal_balance: 'DEBIT', is_fiduciary: false, is_posting_allowed: true, subledger_type: 'NONE', description: 'Suspense account holding unresolved opening trial balance differences during migration' }
];

const CANONICAL_COA = COMMERCIAL_ERP_COA;

/**
 * Idempotently seeds standard Tally groups and posting accounts for a tenant or company.
 */
async function seedHierarchyAccounts(scopeQuery, currency = 'INR', session = null) {
  const codeToIdMap = {};

  // 1. Seed Primary Groups
  const primaryGroups = TALLY_STANDARD_GROUPS.filter(g => g.group_type === 'PRIMARY_GROUP');
  for (const g of primaryGroups) {
    const doc = await LedgerAccount.findOneAndUpdate(
      { ...scopeQuery, account_code: g.account_code },
      {
        account_name: g.account_name,
        account_type: g.account_type,
        normal_balance: g.normal_balance,
        parent_account_id: null,
        is_group: true,
        group_type: 'PRIMARY_GROUP',
        is_posting_allowed: false,
        is_fiduciary: false,
        is_control_account: false,
        subledger_type: 'NONE',
        description: g.description,
        currency,
        status: 'ACTIVE'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
    codeToIdMap[g.account_code] = doc._id;
  }

  // 2. Seed Subgroups
  const subgroups = TALLY_STANDARD_GROUPS.filter(g => g.group_type === 'SUBGROUP');
  for (const sg of subgroups) {
    const parentId = sg.parent_code ? codeToIdMap[sg.parent_code] : null;
    const doc = await LedgerAccount.findOneAndUpdate(
      { ...scopeQuery, account_code: sg.account_code },
      {
        account_name: sg.account_name,
        account_type: sg.account_type,
        normal_balance: sg.normal_balance,
        parent_account_id: parentId,
        is_group: true,
        group_type: 'SUBGROUP',
        is_posting_allowed: false,
        is_fiduciary: false,
        is_control_account: false,
        subledger_type: 'NONE',
        description: sg.description,
        currency,
        status: 'ACTIVE'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
    codeToIdMap[sg.account_code] = doc._id;
  }

  // 3. Seed / Link Posting Accounts
  for (const acc of COMMERCIAL_ERP_COA) {
    const parentId = acc.parent_code ? codeToIdMap[acc.parent_code] : null;
    const existing = await LedgerAccount.findOne({ ...scopeQuery, account_code: acc.account_code }).session(session);

    if (!existing) {
      const doc = await LedgerAccount.create([{
        ...scopeQuery,
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        normal_balance: acc.normal_balance,
        parent_account_id: parentId,
        is_group: false,
        group_type: 'LEDGER',
        is_posting_allowed: acc.is_posting_allowed !== false,
        is_fiduciary: acc.is_fiduciary || false,
        is_control_account: acc.is_control_account || false,
        subledger_type: acc.subledger_type || 'NONE',
        description: acc.description || '',
        currency,
        status: 'ACTIVE'
      }], { session });
      codeToIdMap[acc.account_code] = doc[0]._id;
    } else {
      existing.account_name = acc.account_name;
      existing.account_type = acc.account_type;
      existing.normal_balance = acc.normal_balance;
      if (!existing.parent_account_id && parentId) {
        existing.parent_account_id = parentId;
      }
      existing.is_group = false;
      existing.group_type = 'LEDGER';
      existing.is_posting_allowed = acc.is_posting_allowed !== false;
      existing.subledger_type = acc.subledger_type || 'NONE';
      existing.status = 'ACTIVE';
      await existing.save({ session });
      codeToIdMap[acc.account_code] = existing._id;
    }
  }

  return codeToIdMap;
}

async function seedTenantChartOfAccounts(tenantId, options = {}) {
  try {
    const scopeQuery = { tenant_id: tenantId };
    return await seedHierarchyAccounts(scopeQuery, options.currency || 'INR', options.session || null);
  } catch (err) {
    console.error(`[COA SEEDER ERROR for tenant ${tenantId}]`, err);
    throw err;
  }
}

async function seedCompanyChartOfAccounts(tenantId, companyId, options = {}) {
  try {
    const scopeQuery = { tenant_id: tenantId, company_id: companyId };
    return await seedHierarchyAccounts(scopeQuery, options.currency || 'INR', options.session || null);
  } catch (err) {
    console.error(`[COMPANY COA SEEDER ERROR for company ${companyId}]`, err);
    throw err;
  }
}

module.exports = {
  CANONICAL_COA,
  TALLY_STANDARD_GROUPS,
  COMMERCIAL_ERP_COA,
  seedTenantChartOfAccounts,
  seedCompanyChartOfAccounts
};
