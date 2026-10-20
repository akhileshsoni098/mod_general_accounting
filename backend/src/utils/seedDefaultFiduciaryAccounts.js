const { FiduciaryAccount } = require('../models');

const DEFAULT_FIDUCIARY_ACCOUNTS = [
  {
    account_code: 'FID-TX-TRUST-01',
    account_name: 'Texas § 4053 Premium Trust Account',
    account_type: 'PREMIUM_TRUST',
    jurisdiction_statute: 'TEXAS_INS_CODE_4053',
    gl_account_code: '1010',
    bank_reference_token: 'tok_frost_tx_trust_9941',
    bank_name: 'Frost Bank, N.A. (Austin, TX)',
    currency: 'USD',
    fiduciary_hold_days: 30,
    status: 'ACTIVE',
    notes: 'Segregated statutory fiduciary premium trust account per Texas Insurance Code § 4053 (Holds gross premium until carrier net remittance and MGA earned sweep)'
  },
  {
    account_code: 'FID-TX-CLAIMS-01',
    account_name: 'Texas Claims Escrow Trust Account',
    account_type: 'CLAIMS_ESCROW',
    jurisdiction_statute: 'TEXAS_INS_CODE_4053',
    gl_account_code: '1020',
    bank_reference_token: 'tok_frost_claims_escrow_8820',
    bank_name: 'Frost Bank, N.A. (Austin, TX)',
    currency: 'USD',
    fiduciary_hold_days: 0,
    status: 'ACTIVE',
    notes: 'Segregated fiduciary claims escrow account for claims loss adjustments and insured settlement payouts'
  },
  {
    account_code: 'FID-TX-CLEARING-01',
    account_name: 'Texas Statutory Transit & Commission Clearing',
    account_type: 'COMMISSION_CLEARING',
    jurisdiction_statute: 'TEXAS_INS_CODE_4053',
    gl_account_code: '1108',
    bank_reference_token: 'tok_tx_cap_clearing_1044',
    bank_name: 'Texas Capital Bank, N.A. (Dallas, TX)',
    currency: 'USD',
    fiduciary_hold_days: 5,
    status: 'ACTIVE',
    notes: 'Automated transit clearing and sub-producer retail commission settlement'
  }
];

async function seedDefaultFiduciaryAccounts(tenantId) {
  if (!tenantId) return [];

  const createdAccounts = [];

  for (const item of DEFAULT_FIDUCIARY_ACCOUNTS) {
    let account = await FiduciaryAccount.findOne({
      tenant_id: tenantId,
      account_code: item.account_code
    });

    if (!account) {
      account = await FiduciaryAccount.create({
        ...item,
        tenant_id: tenantId
      });
    } else {
      account.account_name = item.account_name;
      account.account_type = item.account_type;
      account.jurisdiction_statute = item.jurisdiction_statute;
      account.gl_account_code = item.gl_account_code;
      account.bank_name = item.bank_name;
      account.bank_reference_token = item.bank_reference_token;
      account.fiduciary_hold_days = item.fiduciary_hold_days;
      account.status = item.status;
      account.notes = item.notes;
      await account.save();
    }

    createdAccounts.push(account);
  }

  return createdAccounts;
}

module.exports = {
  DEFAULT_FIDUCIARY_ACCOUNTS,
  seedDefaultFiduciaryAccounts
};
