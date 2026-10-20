const { CompanyPostingConfig, LedgerAccount } = require('../models');
const { seedCompanyChartOfAccounts } = require('../utils/seedCoa');
const { seedDefaultTaxRates } = require('./gstTaxService');

/**
 * Gets or creates default company posting configuration.
 * Validates that all mapped accounts exist, belong to the company, and are ACTIVE.
 */
async function getOrCreatePostingConfig(tenantId, companyId, options = {}) {
  let config = await CompanyPostingConfig.findOne({
    tenant_id: tenantId,
    company_id: companyId
  }).session(options.session || null);

  if (!config) {
    config = await CompanyPostingConfig.create(
      [
        {
          tenant_id: tenantId,
          company_id: companyId,
          receivable_account_code: '1101',
          payable_account_code: '2001',
          sales_revenue_account_code: '4001',
          service_revenue_account_code: '4003',
          purchase_cost_account_code: '5001',
          inventory_asset_account_code: '1201',
          cogs_account_code: '5004',
          input_cgst_account_code: '1301',
          input_sgst_account_code: '1302',
          input_igst_account_code: '1303',
          output_cgst_account_code: '2101',
          output_sgst_account_code: '2102',
          output_igst_account_code: '2103',
          cash_account_code: '1001',
          bank_account_code: '1002',
          opening_stock_offset_account_code: '3990',
          sales_discount_account_code: '4900',
          round_off_account_code: '5900',
          allow_negative_stock: false
        }
      ],
      { session: options.session }
    );
    config = config[0];
  }

  // Also ensure default tax rates are seeded
  await seedDefaultTaxRates(tenantId, companyId, options);

  return config;
}

/**
 * Validates that all required posting accounts exist, belong to the company, and allow posting.
 * If the Chart of Accounts is empty, seeds standard commercial accounts.
 */
async function validateAndResolvePostingAccounts(tenantId, companyId, options = {}) {
  const config = await getOrCreatePostingConfig(tenantId, companyId, options);

  const codesToVerify = [
    config.receivable_account_code,
    config.payable_account_code,
    config.sales_revenue_account_code,
    config.purchase_cost_account_code,
    config.inventory_asset_account_code,
    config.cogs_account_code,
    config.input_cgst_account_code,
    config.input_sgst_account_code,
    config.input_igst_account_code,
    config.output_cgst_account_code,
    config.output_sgst_account_code,
    config.output_igst_account_code,
    config.cash_account_code,
    config.bank_account_code,
    config.opening_stock_offset_account_code
  ].filter(Boolean);

  let aQ = LedgerAccount.find({
    tenant_id: tenantId,
    company_id: companyId,
    account_code: { $in: codesToVerify }
  });
  if (options.session) aQ = aQ.session(options.session);
  let accounts = await aQ;

  // If some or all accounts are missing, seed COA
  if (accounts.length < codesToVerify.length) {
    await seedCompanyChartOfAccounts(tenantId, companyId, options);
    let reQ = LedgerAccount.find({
      tenant_id: tenantId,
      company_id: companyId,
      account_code: { $in: codesToVerify }
    });
    if (options.session) reQ = reQ.session(options.session);
    accounts = await reQ;
  }

  const accountMap = {};
  for (const acc of accounts) {
    accountMap[acc.account_code] = acc;
  }

  const missing = [];
  const inactive = [];
  for (const code of codesToVerify) {
    const acc = accountMap[code];
    if (!acc) {
      missing.push(code);
    } else if (acc.status !== 'ACTIVE' || acc.is_posting_allowed === false) {
      inactive.push(code);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `MISSING_ACCOUNT_MAPPING: The following configured posting accounts do not exist in company Chart of Accounts: ${missing.join(', ')}`
    );
  }
  if (inactive.length > 0) {
    throw new Error(
      `INACTIVE_ACCOUNT_MAPPING: The following configured posting accounts are inactive or prohibit posting: ${inactive.join(', ')}`
    );
  }

  return {
    config,
    accountMap
  };
}

/**
 * Updates company posting configuration with validation.
 */
async function updatePostingConfig(tenantId, companyId, updates, options = {}) {
  const current = await getOrCreatePostingConfig(tenantId, companyId, options);

  const allowedFields = [
    'receivable_account_code',
    'payable_account_code',
    'sales_revenue_account_code',
    'service_revenue_account_code',
    'purchase_cost_account_code',
    'inventory_asset_account_code',
    'cogs_account_code',
    'input_cgst_account_code',
    'input_sgst_account_code',
    'input_igst_account_code',
    'output_cgst_account_code',
    'output_sgst_account_code',
    'output_igst_account_code',
    'cash_account_code',
    'bank_account_code',
    'opening_stock_offset_account_code',
    'sales_discount_account_code',
    'round_off_account_code',
    'allow_negative_stock'
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      current[field] = updates[field];
    }
  }

  current.row_version = (current.row_version || 1) + 1;
  await current.save({ session: options.session });

  return current;
}

module.exports = {
  getOrCreatePostingConfig,
  validateAndResolvePostingAccounts,
  updatePostingConfig
};
