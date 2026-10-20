const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const { Journal, JournalEntry, LedgerAccount, FiscalPeriod } = require('../models');

/**
 * Validates and posts a balanced double-entry journal entry atomically.
 *
 * Rules:
 * 1. Must have at least two lines.
 * 2. Total Debits MUST equal Total Credits exactly (BigNumber 2 decimal places precision).
 * 3. Fiscal Period must exist for posting_date and its status MUST NOT be 'LOCKED' or 'HARD_CLOSED'.
 * 4. All ledger accounts must exist, be ACTIVE, have is_posting_allowed === true, and belong to the tenant.
 * 5. Rejects duplicate posting of the same source transaction (referenceId + sourceModule) if already posted.
 * 6. Updates current_balance on affected LedgerAccounts atomically.
 */
async function postJournalEntry({
  tenantId,
  userId,
  postingDate,
  sourceModule = 'GL_MANUAL',
  referenceId = null,
  memo,
  currency = 'USD',
  accountingBasis = 'GAAP',
  lines // [{ account_code, debit, credit, dimensions, memo }]
}) {
  if (!lines || lines.length < 2) {
    throw new Error('Double-entry journal must contain at least 2 lines');
  }

  // 1. Prevent duplicate posting of the same source transaction
  if (referenceId && sourceModule !== 'GL_MANUAL') {
    const existing = await Journal.findOne({
      tenant_id: tenantId,
      source_module: sourceModule,
      reference_id: referenceId,
      status: 'POSTED'
    });
    if (existing) {
      throw new Error(`Duplicate posting prevented: Transaction "${referenceId}" from module "${sourceModule}" has already been posted (${existing.journal_number})`);
    }
  }

  const pDate = new Date(postingDate || Date.now());

  // 2. Check Fiscal Period Lock
  let fiscalPeriod = await FiscalPeriod.findOne({
    tenant_id: tenantId,
    start_date: { $lte: pDate },
    end_date: { $gte: pDate }
  });

  if (!fiscalPeriod) {
    const totalPeriods = await FiscalPeriod.countDocuments({ tenant_id: tenantId });
    if (totalPeriods === 0) {
      const { seedFiscalPeriods } = require('../utils/seedFiscalPeriods');
      await seedFiscalPeriods(tenantId, pDate.getFullYear());
      fiscalPeriod = await FiscalPeriod.findOne({
        tenant_id: tenantId,
        start_date: { $lte: pDate },
        end_date: { $gte: pDate }
      });
    }
  }

  if (!fiscalPeriod) {
    throw new Error(`No open fiscal period found for posting date: ${pDate.toISOString().slice(0, 10)}`);
  }

  if (fiscalPeriod.status === 'LOCKED' || fiscalPeriod.status === 'HARD_CLOSED') {
    throw new Error(`Fiscal period "${fiscalPeriod.period_name}" is ${fiscalPeriod.status}. Postings to closed periods are strictly prohibited.`);
  }

  // 3. Validate Debit / Credit Balance Equilibrium with BigNumber
  let totalDebit = new BigNumber(0);
  let totalCredit = new BigNumber(0);

  for (const line of lines) {
    const dr = new BigNumber(line.debit || 0);
    const cr = new BigNumber(line.credit || 0);

    if (dr.isNegative() || cr.isNegative()) {
      throw new Error('Debit and credit amounts cannot be negative');
    }
    if (dr.isGreaterThan(0) && cr.isGreaterThan(0)) {
      throw new Error('A single journal line cannot have both debit and credit amounts');
    }
    if (dr.isZero() && cr.isZero()) {
      throw new Error('A journal line must have either a debit or a credit amount');
    }

    totalDebit = totalDebit.plus(dr);
    totalCredit = totalCredit.plus(cr);
  }

  if (!totalDebit.isEqualTo(totalCredit)) {
    throw new Error(
      `Double-entry imbalance: Total Debits ($${totalDebit.toFixed(2)}) must equal Total Credits ($${totalCredit.toFixed(2)})`
    );
  }

  // 4. Lookup Accounts and assert active + posting enabled
  const accountCodes = lines.map(l => l.account_code);
  let accounts = await LedgerAccount.find({
    tenant_id: tenantId,
    account_code: { $in: accountCodes }
  });

  if (accounts.length === 0) {
    const totalAccs = await LedgerAccount.countDocuments({ tenant_id: tenantId });
    if (totalAccs === 0) {
      const { seedTenantChartOfAccounts } = require('../utils/seedCoa');
      await seedTenantChartOfAccounts(tenantId);
      accounts = await LedgerAccount.find({
        tenant_id: tenantId,
        account_code: { $in: accountCodes }
      });
    }
  }

  const accountMap = {};
  for (const acc of accounts) {
    accountMap[acc.account_code] = acc;
  }

  for (const code of accountCodes) {
    const acc = accountMap[code];
    if (!acc) {
      throw new Error(`Account code "${code}" does not exist for this tenant`);
    }
    if (acc.status !== 'ACTIVE') {
      throw new Error(`Account "${code}" (${acc.account_name}) is inactive and cannot accept postings`);
    }
    if (acc.is_posting_allowed === false) {
      throw new Error(`Account "${code}" (${acc.account_name}) is a summary/parent header and does not allow direct postings`);
    }
  }

  // 5. Generate Journal Number
  const count = await Journal.countDocuments({ tenant_id: tenantId });
  const journalNumber = `JE-${pDate.getFullYear()}-${String(count + 1).padStart(5, '0')}`;

  // 6. Create Journal Header
  const journal = await Journal.create({
    tenant_id: tenantId,
    journal_number: journalNumber,
    posting_date: pDate,
    fiscal_period_id: fiscalPeriod._id,
    source_module: sourceModule,
    reference_id: referenceId,
    memo: memo || 'Journal Entry',
    currency,
    accounting_basis: accountingBasis,
    total_debit: mongoose.Types.Decimal128.fromString(totalDebit.toFixed(2)),
    total_credit: mongoose.Types.Decimal128.fromString(totalCredit.toFixed(2)),
    status: 'POSTED',
    posted_by_user_id: userId || null,
    posted_at: new Date()
  });

  // 7. Create Journal Lines & Update Account Balances atomically
  const createdLines = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const acc = accountMap[l.account_code];
    const dr = new BigNumber(l.debit || 0);
    const cr = new BigNumber(l.credit || 0);

    const entryLine = await JournalEntry.create({
      tenant_id: tenantId,
      journal_id: journal._id,
      line_number: i + 1,
      ledger_account_id: acc._id,
      account_code: acc.account_code,
      debit: mongoose.Types.Decimal128.fromString(dr.toFixed(2)),
      credit: mongoose.Types.Decimal128.fromString(cr.toFixed(2)),
      dimensions: l.dimensions || {},
      memo: l.memo || ''
    });
    createdLines.push(entryLine);

    // Calculate balance effect based on account normal balance
    // ASSET / EXPENSE (Normal DEBIT): + Debit, - Credit
    // LIABILITY / EQUITY / REVENUE (Normal CREDIT): + Credit, - Debit
    const currentBal = new BigNumber(acc.current_balance ? acc.current_balance.toString() : 0);
    let newBal;
    if (acc.normal_balance === 'DEBIT') {
      newBal = currentBal.plus(dr).minus(cr);
    } else {
      newBal = currentBal.plus(cr).minus(dr);
    }

    acc.current_balance = mongoose.Types.Decimal128.fromString(newBal.toFixed(2));
    acc.row_version = (acc.row_version || 1) + 1;
    await acc.save();
  }

  return {
    journal,
    lines: createdLines
  };
}

/**
 * Reverses an existing posted journal by creating a linked opposite entry.
 */
async function reverseJournalEntry({ tenantId, userId, journalId, reversalDate, reversalMemo }) {
  const original = await Journal.findOne({ _id: journalId, tenant_id: tenantId });
  if (!original) {
    throw new Error('Journal not found');
  }
  if (original.status !== 'POSTED') {
    throw new Error(`Cannot reverse journal with status "${original.status}". Only POSTED journals can be reversed.`);
  }

  const originalLines = await JournalEntry.find({ journal_id: original._id, tenant_id: tenantId }).sort({ line_number: 1 });

  // Swap debits and credits
  const reversedLines = originalLines.map(line => ({
    account_code: line.account_code,
    debit: line.credit.toString(),
    credit: line.debit.toString(),
    memo: `Reversal of line ${line.line_number}: ${line.memo || ''}`,
    dimensions: line.dimensions || {}
  }));

  const rDate = reversalDate || new Date();
  const memoText = reversalMemo || `Reversal of ${original.journal_number}: ${original.memo}`;

  const postResult = await postJournalEntry({
    tenantId,
    userId,
    postingDate: rDate,
    sourceModule: original.source_module,
    referenceId: `REV-${original.journal_number}`,
    memo: memoText,
    lines: reversedLines
  });

  // Link journals
  original.status = 'REVERSED';
  original.reversed_by_journal_id = postResult.journal._id;
  await original.save();

  postResult.journal.reversal_of_journal_id = original._id;
  await postResult.journal.save();

  return {
    original_journal: original,
    reversal_journal: postResult.journal,
    lines: postResult.lines
  };
}

/**
 * Previews journal totals without persisting.
 */
function previewJournal({ lines }) {
  let totalDebit = new BigNumber(0);
  let totalCredit = new BigNumber(0);

  for (const line of (lines || [])) {
    const dr = new BigNumber(line.debit || 0);
    const cr = new BigNumber(line.credit || 0);
    totalDebit = totalDebit.plus(dr);
    totalCredit = totalCredit.plus(cr);
  }

  return {
    total_debit: totalDebit.toFixed(2),
    total_credit: totalCredit.toFixed(2),
    difference: totalDebit.minus(totalCredit).toFixed(2),
    is_balanced: totalDebit.isEqualTo(totalCredit)
  };
}

/**
 * Computes Trial Balance as of a specified period or date.
 * Returns accounts, debits, credits, and balance verification.
 */
async function computeTrialBalance(tenantId, periodId = null) {
  const accounts = await LedgerAccount.find({ tenant_id: tenantId, status: 'ACTIVE' }).sort({ account_code: 1 });

  // Aggregate all journal entry postings for the tenant
  const allEntries = await JournalEntry.find({ tenant_id: tenantId });
  const activityMap = {};
  let totalPeriodDebits = new BigNumber(0);
  let totalPeriodCredits = new BigNumber(0);

  for (const e of allEntries) {
    const code = e.account_code;
    const dr = new BigNumber(e.debit ? e.debit.toString() : 0);
    const cr = new BigNumber(e.credit ? e.credit.toString() : 0);
    if (!activityMap[code]) {
      activityMap[code] = { debits: new BigNumber(0), credits: new BigNumber(0), count: 0 };
    }
    activityMap[code].debits = activityMap[code].debits.plus(dr);
    activityMap[code].credits = activityMap[code].credits.plus(cr);
    activityMap[code].count += 1;

    totalPeriodDebits = totalPeriodDebits.plus(dr);
    totalPeriodCredits = totalPeriodCredits.plus(cr);
  }

  let totalDebitBalance = new BigNumber(0);
  let totalCreditBalance = new BigNumber(0);

  const reportLines = accounts.map(acc => {
    const bal = new BigNumber(acc.current_balance ? acc.current_balance.toString() : 0);
    let debitAmount = new BigNumber(0);
    let creditAmount = new BigNumber(0);

    if (acc.normal_balance === 'DEBIT') {
      if (bal.isGreaterThanOrEqualTo(0)) {
        debitAmount = bal;
      } else {
        creditAmount = bal.abs();
      }
    } else {
      if (bal.isGreaterThanOrEqualTo(0)) {
        creditAmount = bal;
      } else {
        debitAmount = bal.abs();
      }
    }

    totalDebitBalance = totalDebitBalance.plus(debitAmount);
    totalCreditBalance = totalCreditBalance.plus(creditAmount);

    const act = activityMap[acc.account_code] || { debits: new BigNumber(0), credits: new BigNumber(0), count: 0 };

    return {
      _id: acc._id,
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      normal_balance: acc.normal_balance,
      is_fiduciary: acc.is_fiduciary,
      current_balance: bal.toFixed(2),
      // Period activity (Debits & Credits turnover)
      period_debit: act.debits.toFixed(2),
      period_credit: act.credits.toFixed(2),
      debit: act.debits.toFixed(2),
      credit: act.credits.toFixed(2),
      // Net ending balances
      ending_debit: debitAmount.toFixed(2),
      ending_credit: creditAmount.toFixed(2),
      entry_count: act.count
    };
  });

  const isBalanced = totalPeriodDebits.isEqualTo(totalPeriodCredits);

  return {
    as_of: new Date().toISOString(),
    is_balanced: isBalanced,
    total_debits: totalPeriodDebits.toFixed(2),
    total_credits: totalPeriodCredits.toFixed(2),
    total_ending_debits: totalDebitBalance.toFixed(2),
    total_ending_credits: totalCreditBalance.toFixed(2),
    difference: totalPeriodDebits.minus(totalPeriodCredits).toFixed(2),
    accounts: reportLines
  };
}

module.exports = {
  postJournalEntry,
  reverseJournalEntry,
  previewJournal,
  computeTrialBalance
};
