const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  OpeningBalanceSetup,
  LedgerAccount,
  Journal,
  FiscalPeriod
} = require('../models');
const { postJournalEntry } = require('./journalPostingService');

/**
 * Service to manage Tally-style Opening Balance Setup, Draft Reconciliation,
 * Suspense Allocation, and Double-Entry Opening Journal Posting.
 */

/**
 * Retrieves current opening balance setup for a financial year, or initializes draft
 * from all active posting ledger accounts in the company.
 */
async function getOpeningBalanceSetup(tenantId, companyId, financialYear = null) {
  const currentYear = financialYear ? Number(financialYear) : new Date().getFullYear();

  let setup = await OpeningBalanceSetup.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    financial_year: currentYear
  }).populate('posted_journal_id', 'journal_number posting_date status memo total_debit total_credit');

  if (setup) {
    return setup;
  }

  // If no setup exists yet, initialize draft from active posting accounts
  const accounts = await LedgerAccount.find({
    tenant_id: tenantId,
    company_id: companyId,
    status: 'ACTIVE',
    is_posting_allowed: true
  }).sort({ account_code: 1 });

  let totalDr = new BigNumber(0);
  let totalCr = new BigNumber(0);

  const lines = accounts.map(acc => {
    const obAmount = new BigNumber(acc.opening_balance ? acc.opening_balance.toString() : '0.00');
    let dr = '0.00';
    let cr = '0.00';

    if (obAmount.isGreaterThan(0)) {
      if (acc.opening_balance_type === 'CREDIT' || (acc.normal_balance === 'CREDIT' && !acc.opening_balance_type)) {
        cr = obAmount.toFixed(2);
        totalCr = totalCr.plus(obAmount);
      } else {
        dr = obAmount.toFixed(2);
        totalDr = totalDr.plus(obAmount);
      }
    }

    return {
      ledger_account_id: acc._id,
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      normal_balance: acc.normal_balance,
      debit: mongoose.Types.Decimal128.fromString(dr),
      credit: mongoose.Types.Decimal128.fromString(cr)
    };
  });

  const diff = totalDr.minus(totalCr);

  setup = new OpeningBalanceSetup({
    tenant_id: tenantId,
    company_id: companyId,
    financial_year: currentYear,
    as_of_date: new Date(`${currentYear}-04-01`),
    lines,
    total_debit: mongoose.Types.Decimal128.fromString(totalDr.toFixed(2)),
    total_credit: mongoose.Types.Decimal128.fromString(totalCr.toFixed(2)),
    difference: mongoose.Types.Decimal128.fromString(diff.toFixed(2)),
    ledger_count: lines.length,
    status: (diff.isZero() && totalDr.isGreaterThan(0)) ? 'READY_TO_POST' : 'DRAFT'
  });

  await setup.save();
  return setup;
}

/**
 * Saves or updates draft opening balances without mutating General Ledger balances.
 */
async function saveOpeningBalanceDraft(tenantId, companyId, {
  financialYear,
  asOfDate,
  lines,
  allowSuspense = false,
  suspenseAccountId = null,
  notes = '',
  userId = null
}) {
  const currentYear = financialYear ? Number(financialYear) : new Date().getFullYear();

  let setup = await OpeningBalanceSetup.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    financial_year: currentYear
  });

  if (setup && setup.status === 'POSTED') {
    throw new Error(`Opening balances for FY ${currentYear} are already POSTED (${setup.posted_journal_id}). Modifications require an authorized reversal or period audit adjustment.`);
  }

  // Lookup accounts to validate
  const accMap = {};
  const accounts = await LedgerAccount.find({
    tenant_id: tenantId,
    company_id: companyId
  });
  accounts.forEach(a => { accMap[a.account_code] = a; accMap[a._id.toString()] = a; });

  let totalDr = new BigNumber(0);
  let totalCr = new BigNumber(0);
  const processedLines = [];

  for (const l of (lines || [])) {
    const acc = accMap[l.account_code] || accMap[l.ledger_account_id?.toString()];
    if (!acc) continue;

    const drBn = new BigNumber(l.debit || 0);
    const crBn = new BigNumber(l.credit || 0);

    if (drBn.isNegative() || crBn.isNegative()) {
      throw new Error(`Debit and credit opening amounts cannot be negative for account ${acc.account_code}`);
    }
    if (drBn.isGreaterThan(0) && crBn.isGreaterThan(0)) {
      throw new Error(`Account ${acc.account_code} cannot have both a debit and credit opening balance`);
    }

    totalDr = totalDr.plus(drBn);
    totalCr = totalCr.plus(crBn);

    processedLines.push({
      ledger_account_id: acc._id,
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      normal_balance: acc.normal_balance,
      debit: mongoose.Types.Decimal128.fromString(drBn.toFixed(2)),
      credit: mongoose.Types.Decimal128.fromString(crBn.toFixed(2))
    });
  }

  const diff = totalDr.minus(totalCr);
  let status = 'DRAFT';

  if (diff.isZero()) {
    status = 'READY_TO_POST';
  } else if (allowSuspense && suspenseAccountId) {
    status = 'READY_TO_POST';
  }

  if (!setup) {
    setup = new OpeningBalanceSetup({
      tenant_id: tenantId,
      company_id: companyId,
      financial_year: currentYear
    });
  }

  setup.as_of_date = asOfDate ? new Date(asOfDate) : (setup.as_of_date || new Date(`${currentYear}-04-01`));
  setup.lines = processedLines;
  setup.total_debit = mongoose.Types.Decimal128.fromString(totalDr.toFixed(2));
  setup.total_credit = mongoose.Types.Decimal128.fromString(totalCr.toFixed(2));
  setup.difference = mongoose.Types.Decimal128.fromString(diff.toFixed(2));
  setup.ledger_count = processedLines.length;
  setup.allow_suspense = !!allowSuspense;
  setup.suspense_account_id = suspenseAccountId || null;
  setup.suspense_amount = mongoose.Types.Decimal128.fromString(diff.abs().toFixed(2));
  setup.status = status;
  setup.notes = notes || setup.notes;

  await setup.save();
  return setup;
}

/**
 * Finalizes and posts the balanced opening journal to the General Ledger.
 * Idempotent: repeated requests return the existing posted journal.
 */
async function postOpeningBalanceSetup(tenantId, companyId, {
  financialYear,
  userId,
  allowSuspense = false,
  suspenseAccountId = null,
  session = null
}) {
  const currentYear = financialYear ? Number(financialYear) : new Date().getFullYear();

  let setup = await OpeningBalanceSetup.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    financial_year: currentYear
  }).session(session);

  if (!setup) {
    throw new Error(`No opening balance setup found for FY ${currentYear}. Please save a draft first.`);
  }

  // Idempotency: return existing posted journal if already finalized
  if (setup.status === 'POSTED' && setup.posted_journal_id) {
    const existingJournal = await Journal.findOne({
      _id: setup.posted_journal_id,
      tenant_id: tenantId,
      company_id: companyId
    }).session(session);

    if (existingJournal) {
      return {
        setup,
        journal: existingJournal,
        already_posted: true,
        message: `Opening balances for FY ${currentYear} were already posted on ${setup.posted_at?.toISOString().slice(0, 10)} (${existingJournal.journal_number})`
      };
    }
  }

  // Recalculate totals
  let totalDr = new BigNumber(0);
  let totalCr = new BigNumber(0);
  const journalLines = [];

  for (const line of setup.lines) {
    const dr = new BigNumber(line.debit ? line.debit.toString() : 0);
    const cr = new BigNumber(line.credit ? line.credit.toString() : 0);

    if (dr.isGreaterThan(0)) {
      totalDr = totalDr.plus(dr);
      journalLines.push({
        account_code: line.account_code,
        debit: dr.toFixed(2),
        credit: '0.00',
        memo: `Opening Balance FY ${currentYear}`
      });
    } else if (cr.isGreaterThan(0)) {
      totalCr = totalCr.plus(cr);
      journalLines.push({
        account_code: line.account_code,
        debit: '0.00',
        credit: cr.toFixed(2),
        memo: `Opening Balance FY ${currentYear}`
      });
    }
  }

  const diff = totalDr.minus(totalCr);

  // Check Equilibrium
  if (!diff.isZero()) {
    const useSuspense = allowSuspense || setup.allow_suspense;
    const suspId = suspenseAccountId || setup.suspense_account_id;

    if (!useSuspense || !suspId) {
      throw new Error(
        `Opening trial balance is out of equilibrium: Total Debits (₹${totalDr.toFixed(2)}) != Total Credits (₹${totalCr.toFixed(2)}). ` +
        `Discrepancy of ₹${diff.abs().toFixed(2)} must be reconciled or explicitly allocated to an authorized Suspense account before posting.`
      );
    }

    // Resolve Suspense Account
    const suspAcc = await LedgerAccount.findOne({
      _id: suspId,
      tenant_id: tenantId,
      company_id: companyId
    }).session(session);

    if (!suspAcc) {
      throw new Error('Authorized Opening Balance Suspense account was not found in this company Chart of Accounts.');
    }
    if (suspAcc.is_posting_allowed === false) {
      throw new Error(`Suspense account "${suspAcc.account_code}" (${suspAcc.account_name}) is a summary group and does not allow postings.`);
    }

    if (diff.isGreaterThan(0)) {
      // Debits exceed Credits: Credit the Suspense account
      journalLines.push({
        account_code: suspAcc.account_code,
        debit: '0.00',
        credit: diff.toFixed(2),
        memo: `Opening Trial Balance Difference allocated to Suspense`
      });
      totalCr = totalCr.plus(diff);
    } else {
      // Credits exceed Debits: Debit the Suspense account
      const diffAbs = diff.abs();
      journalLines.push({
        account_code: suspAcc.account_code,
        debit: diffAbs.toFixed(2),
        credit: '0.00',
        memo: `Opening Trial Balance Difference allocated to Suspense`
      });
      totalDr = totalDr.plus(diffAbs);
    }
  }

  if (journalLines.length < 2) {
    throw new Error('Double-entry opening journal must contain at least 2 non-zero account lines.');
  }

  // Post consolidated opening journal via standard journalPostingService
  const postResult = await postJournalEntry({
    tenantId,
    companyId,
    userId,
    postingDate: setup.as_of_date || new Date(`${currentYear}-04-01`),
    sourceModule: 'OPENING_BALANCE',
    referenceId: `OB-${currentYear}-${companyId || 'MAIN'}`,
    memo: `Consolidated Opening Balances for Financial Year ${currentYear}`,
    lines: journalLines,
    session
  });

  // Update master LedgerAccount baseline opening balance values
  for (const line of setup.lines) {
    const dr = new BigNumber(line.debit ? line.debit.toString() : 0);
    const cr = new BigNumber(line.credit ? line.credit.toString() : 0);
    if (dr.isGreaterThan(0) || cr.isGreaterThan(0)) {
      await LedgerAccount.updateOne(
        { _id: line.ledger_account_id, tenant_id: tenantId, company_id: companyId },
        {
          $set: {
            opening_balance: dr.isGreaterThan(0) ? line.debit : line.credit,
            opening_balance_type: dr.isGreaterThan(0) ? 'DEBIT' : 'CREDIT',
            opening_balance_date: setup.as_of_date
          }
        },
        { session }
      );
    }
  }

  // Mark setup as POSTED
  setup.status = 'POSTED';
  setup.posted_journal_id = postResult.journal._id;
  setup.posted_at = new Date();
  setup.posted_by_user_id = userId || null;
  setup.total_debit = mongoose.Types.Decimal128.fromString(totalDr.toFixed(2));
  setup.total_credit = mongoose.Types.Decimal128.fromString(totalCr.toFixed(2));
  setup.difference = mongoose.Types.Decimal128.fromString('0.00');

  await setup.save(session ? { session } : undefined);

  return {
    setup,
    journal: postResult.journal,
    lines: postResult.lines,
    message: `Opening balances for FY ${currentYear} posted successfully (${postResult.journal.journal_number})`
  };
}

module.exports = {
  getOpeningBalanceSetup,
  saveOpeningBalanceDraft,
  postOpeningBalanceSetup
};
