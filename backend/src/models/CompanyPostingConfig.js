const mongoose = require('mongoose');

const CompanyPostingConfigSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    // Trade Receivables / Debtors
    receivable_account_code: {
      type: String,
      default: '1101',
      trim: true
    },
    // Trade Payables / Creditors
    payable_account_code: {
      type: String,
      default: '2001',
      trim: true
    },
    // Sales Revenue
    sales_revenue_account_code: {
      type: String,
      default: '4001',
      trim: true
    },
    // Service / Labor Revenue
    service_revenue_account_code: {
      type: String,
      default: '4003',
      trim: true
    },
    // Purchase Cost / Expense
    purchase_cost_account_code: {
      type: String,
      default: '5001',
      trim: true
    },
    // Inventory Asset (Stock in Hand)
    inventory_asset_account_code: {
      type: String,
      default: '1201',
      trim: true
    },
    // Cost of Goods Sold (COGS)
    cogs_account_code: {
      type: String,
      default: '5004',
      trim: true
    },
    // Input Tax Credits
    input_cgst_account_code: {
      type: String,
      default: '1301',
      trim: true
    },
    input_sgst_account_code: {
      type: String,
      default: '1302',
      trim: true
    },
    input_igst_account_code: {
      type: String,
      default: '1303',
      trim: true
    },
    // Output Tax Liabilities
    output_cgst_account_code: {
      type: String,
      default: '2101',
      trim: true
    },
    output_sgst_account_code: {
      type: String,
      default: '2102',
      trim: true
    },
    output_igst_account_code: {
      type: String,
      default: '2103',
      trim: true
    },
    // US Sales & Use Tax Liabilities
    sales_tax_payable_account_code: {
      type: String,
      default: '2110',
      trim: true
    },
    use_tax_payable_account_code: {
      type: String,
      default: '2115',
      trim: true
    },
    tax_expense_account_code: {
      type: String,
      default: '5110',
      trim: true
    },
    purchase_tax_treatment: {
      type: String,
      enum: ['CAPITALIZE_TO_ITEM', 'EXPENSE_SEPARATE', 'BLOCKED'],
      default: 'CAPITALIZE_TO_ITEM'
    },
    // Cash & Bank defaults
    cash_account_code: {
      type: String,
      default: '1001',
      trim: true
    },
    bank_account_code: {
      type: String,
      default: '1002',
      trim: true
    },
    // Opening Stock Balancing Offset (Equity Reserve)
    opening_stock_offset_account_code: {
      type: String,
      default: '3990',
      trim: true
    },
    // Sales Discount & Rounding
    sales_discount_account_code: {
      type: String,
      default: '4900',
      trim: true
    },
    round_off_account_code: {
      type: String,
      default: '5900',
      trim: true
    },
    // Business Policies
    allow_negative_stock: {
      type: Boolean,
      default: false
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'company_posting_configs'
  }
);

CompanyPostingConfigSchema.index({ tenant_id: 1, company_id: 1 }, { unique: true });

module.exports = mongoose.model('CompanyPostingConfig', CompanyPostingConfigSchema);
