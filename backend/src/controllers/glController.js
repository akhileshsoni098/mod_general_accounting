const { LedgerAccount, FiscalPeriod, Journal, JournalEntry, PostingRule, PostingRuleLine, ExchangeRate } = require('../models');
const { postJournalEntry, reverseJournalEntry, previewJournal, computeTrialBalance } = require('../services/journalPostingService');
const { seedTenantChartOfAccounts, seedCompanyChartOfAccounts } = require('../utils/seedCoa');
const { seedFiscalPeriods, seedCompanyFiscalPeriods } = require('../utils/seedFiscalPeriods');
const mongoose = require('mongoose');

// List Chart of Accounts (Scoped to Tenant and Company)
async function getAccounts(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;

    const query = { tenant_id: tenantId };
    if (companyId) query.company_id = companyId;

    let accounts = await LedgerAccount.find(query).sort({ account_code: 1 });

    // Auto-seed if newly onboarded company/tenant has 0 accounts
    if (accounts.length === 0) {
      if (companyId) {
        await seedCompanyChartOfAccounts(tenantId, companyId, {
          currency: req.company?.base_currency || 'INR'
        });
      } else {
        await seedTenantChartOfAccounts(tenantId);
      }
      accounts = await LedgerAccount.find(query).sort({ account_code: 1 });
    }

    const allEntries = await JournalEntry.find(query);
    const activityMap = {};
    for (const e of allEntries) {
      const code = e.account_code;
      if (!activityMap[code]) {
        activityMap[code] = { debits: 0, credits: 0, count: 0 };
      }
      activityMap[code].debits += parseFloat(e.debit ? e.debit.toString() : 0);
      activityMap[code].credits += parseFloat(e.credit ? e.credit.toString() : 0);
      activityMap[code].count += 1;
    }

    const result = accounts.map(a => {
      const act = activityMap[a.account_code] || { debits: 0, credits: 0, count: 0 };
      return {
        ...a.toObject(),
        total_debits: act.debits.toFixed(2),
        total_credits: act.credits.toFixed(2),
        entry_count: act.count
      };
    });

    return res.success(result);
  } catch (err) {
    return res.error('Failed to list Chart of Accounts', 500, err.message);
  }
}

// Get single account detail with activity lines (Company-scoped)
async function getAccountDetail(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;

    const query = {
      tenant_id: tenantId,
      $or: [
        { _id: mongoose.isValidObjectId(id) ? id : null },
        { account_code: id }
      ]
    };
    if (companyId) query.company_id = companyId;

    const account = await LedgerAccount.findOne(query);
    if (!account) {
      return res.error('Ledger account not found', 404);
    }

    const activityQuery = {
      tenant_id: tenantId,
      $or: [
        { ledger_account_id: account._id },
        { account_code: account.account_code }
      ]
    };
    if (companyId) activityQuery.company_id = companyId;

    const activity = await JournalEntry.find(activityQuery)
      .populate('journal_id', 'journal_number posting_date status memo source_module reference_id')
      .sort({ createdAt: -1 })
      .limit(100);

    let totalDebits = 0;
    let totalCredits = 0;
    activity.forEach(e => {
      totalDebits += parseFloat(e.debit ? e.debit.toString() : 0);
      totalCredits += parseFloat(e.credit ? e.credit.toString() : 0);
    });

    return res.success({
      account: {
        ...account.toObject(),
        total_debits: totalDebits.toFixed(2),
        total_credits: totalCredits.toFixed(2)
      },
      activity
    });
  } catch (err) {
    return res.error('Failed to get account details', 500, err.message);
  }
}

// Create custom Ledger Account (Company-scoped)
async function createAccount(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const {
      account_code,
      account_name,
      description,
      account_type,
      normal_balance,
      parent_account_id,
      is_posting_allowed,
      is_fiduciary,
      subledger_type
    } = req.body;

    if (!account_code || !account_name || !account_type || !normal_balance) {
      return res.error('account_code, account_name, account_type, and normal_balance are required', 400);
    }

    const dupQuery = { tenant_id: tenantId, account_code: account_code.trim().toUpperCase() };
    if (companyId) dupQuery.company_id = companyId;

    const exists = await LedgerAccount.findOne(dupQuery);
    if (exists) {
      return res.error(`Account code "${account_code}" already exists in this chart of accounts`, 409);
    }

    // Verify parent if provided
    if (parent_account_id) {
      const parentQuery = { _id: parent_account_id, tenant_id: tenantId };
      if (companyId) parentQuery.company_id = companyId;
      const parent = await LedgerAccount.findOne(parentQuery);
      if (!parent) {
        return res.error('Parent account not found in this chart of accounts', 404);
      }
    }

    const account = await LedgerAccount.create({
      tenant_id: tenantId,
      company_id: companyId || null,
      account_code: account_code.trim().toUpperCase(),
      account_name: account_name.trim(),
      description: description || '',
      account_type: account_type.toUpperCase(),
      normal_balance: normal_balance.toUpperCase(),
      parent_account_id: parent_account_id || null,
      is_posting_allowed: typeof is_posting_allowed === 'boolean' ? is_posting_allowed : true,
      is_fiduciary: !!is_fiduciary,
      subledger_type: subledger_type || 'NONE',
      currency: req.company?.base_currency || 'INR'
    });

    return res.success(account, { message: 'Ledger account created' }, 201);
  } catch (err) {
    return res.error('Failed to create ledger account', 500, err.message);
  }
}

// Update / Deactivate Ledger Account
async function updateAccount(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;
    const { account_name, description, status, is_posting_allowed } = req.body;

    const query = { _id: id, tenant_id: tenantId };
    if (companyId) query.company_id = companyId;

    const account = await LedgerAccount.findOne(query);
    if (!account) {
      return res.error('Ledger account not found', 404);
    }

    if (account_name) account.account_name = account_name.trim();
    if (typeof description === 'string') account.description = description.trim();
    if (status) account.status = status.toUpperCase();
    if (typeof is_posting_allowed === 'boolean') account.is_posting_allowed = is_posting_allowed;

    account.row_version = (account.row_version || 1) + 1;
    await account.save();

    return res.success(account, { message: `Account ${account.account_code} updated successfully` });
  } catch (err) {
    return res.error('Failed to update ledger account', 500, err.message);
  }
}

// List Fiscal Periods (Company-scoped)
async function getFiscalPeriods(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;

    const query = { tenant_id: tenantId };
    if (companyId) query.company_id = companyId;

    let periods = await FiscalPeriod.find(query).sort({ fiscal_year: 1, period_number: 1 });

    const currentYear = new Date().getFullYear();
    const hasCurrent = periods.some(p => p.fiscal_year === currentYear);
    if (!hasCurrent) {
      if (companyId) {
        await seedCompanyFiscalPeriods(tenantId, companyId, currentYear, req.company?.financial_year_start_month || 4);
      } else {
        await seedFiscalPeriods(tenantId, currentYear);
      }
      periods = await FiscalPeriod.find(query).sort({ fiscal_year: 1, period_number: 1 });
    }

    return res.success(periods);
  } catch (err) {
    return res.error('Failed to list fiscal periods', 500, err.message);
  }
}

// Create custom Fiscal Period (Company-scoped)
async function createFiscalPeriod(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { period_name, fiscal_year, period_number, start_date, end_date, status = 'OPEN' } = req.body;

    if (!period_name || !fiscal_year || !period_number || !start_date || !end_date) {
      return res.error('period_name, fiscal_year, period_number, start_date, and end_date are required', 400);
    }

    const dupQuery = { tenant_id: tenantId, period_name: period_name.trim() };
    if (companyId) dupQuery.company_id = companyId;

    const exists = await FiscalPeriod.findOne(dupQuery);
    if (exists) {
      return res.error(`Fiscal period "${period_name}" already exists`, 409);
    }

    const periodStatus = status ? status.toUpperCase() : 'OPEN';
    const period = await FiscalPeriod.create({
      tenant_id: tenantId,
      company_id: companyId || null,
      period_name: period_name.trim(),
      fiscal_year: Number(fiscal_year),
      period_number: Number(period_number),
      start_date: new Date(start_date),
      end_date: new Date(end_date),
      status: periodStatus,
      locked_at: ['HARD_CLOSED', 'LOCKED'].includes(periodStatus) ? new Date() : null,
      locked_by_user_id: ['HARD_CLOSED', 'LOCKED'].includes(periodStatus) && req.user ? req.user._id : null
    });

    return res.success(period, { message: 'Fiscal period created' }, 201);
  } catch (err) {
    return res.error('Failed to create fiscal period', 500, err.message);
  }
}

// Lock / Unlock / Close Fiscal Period (Company-scoped)
async function updateFiscalPeriodStatus(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { period_id, status, close_notes } = req.body;

    if (!period_id || !status) {
      return res.error('period_id and status (OPEN / SOFT_CLOSED / HARD_CLOSED / LOCKED) are required', 400);
    }

    const query = { _id: period_id, tenant_id: tenantId };
    if (companyId) query.company_id = companyId;

    const period = await FiscalPeriod.findOne(query);
    if (!period) {
      return res.error('Fiscal period not found', 404);
    }

    const validStatuses = ['OPEN', 'SOFT_CLOSED', 'HARD_CLOSED', 'LOCKED'];
    if (!validStatuses.includes(status.toUpperCase())) {
      return res.error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    period.status = status.toUpperCase();
    if (['HARD_CLOSED', 'LOCKED'].includes(period.status)) {
      period.locked_by_user_id = req.user._id;
      period.locked_at = new Date();
    } else {
      period.locked_by_user_id = null;
      period.locked_at = null;
    }
    if (close_notes) period.close_notes = close_notes;

    await period.save();
    return res.success(period, { message: `Fiscal period "${period.period_name}" is now ${period.status}` });
  } catch (err) {
    return res.error('Failed to update fiscal period status', 500, err.message);
  }
}

// List Journals (Company-scoped)
async function getJournals(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { limit = 50, reference_id, status, source_module } = req.query;

    const filter = { tenant_id: tenantId };
    if (companyId) filter.company_id = companyId;
    if (reference_id) filter.reference_id = reference_id;
    if (status) filter.status = status.toUpperCase();
    if (source_module) filter.source_module = source_module.toUpperCase();

    const journals = await Journal.find(filter)
      .populate('fiscal_period_id', 'period_name status')
      .sort({ posting_date: -1, createdAt: -1 })
      .limit(Number(limit));

    return res.success(journals);
  } catch (err) {
    return res.error('Failed to list journal entries', 500, err.message);
  }
}

// Get Journal Details with Lines (Company-scoped)
async function getJournalById(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;

    const query = { _id: id, tenant_id: tenantId };
    if (companyId) query.company_id = companyId;

    const journal = await Journal.findOne(query).populate('fiscal_period_id');
    if (!journal) {
      return res.error('Journal entry not found', 404);
    }

    const linesQuery = { journal_id: journal._id, tenant_id: tenantId };
    if (companyId) linesQuery.company_id = companyId;
    const lines = await JournalEntry.find(linesQuery).sort({ line_number: 1 });

    return res.success({
      journal,
      lines
    });
  } catch (err) {
    return res.error('Failed to get journal details', 500, err.message);
  }
}

// Preview Journal before Posting
async function previewJournalTotals(req, res) {
  try {
    const { lines } = req.body;
    const preview = previewJournal({ lines });
    return res.success(preview);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Post a Balanced Journal Entry (Company-scoped)
async function postJournal(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { posting_date, source_module, reference_id, memo, description, lines, entries, currency, accounting_basis } = req.body;

    const rawLines = lines || entries || [];
    const processedLines = [];
    for (const l of rawLines) {
      let code = l.account_code;
      if (!code && l.account_id) {
        const acc = await LedgerAccount.findById(l.account_id);
        if (acc) code = acc.account_code;
      }
      processedLines.push({
        account_code: code,
        debit: l.debit || 0,
        credit: l.credit || 0,
        memo: l.memo || l.description || '',
        dimensions: l.dimensions || {}
      });
    }

    const result = await postJournalEntry({
      tenantId,
      companyId: companyId || null,
      userId: req.user._id,
      postingDate: posting_date,
      sourceModule: source_module || 'GL_MANUAL',
      referenceId: reference_id,
      memo: memo || description || '',
      currency: currency || req.company?.base_currency || 'INR',
      accountingBasis: accounting_basis || 'GAAP',
      lines: processedLines
    });

    return res.success(result, { message: `Journal ${result.journal.journal_number} posted successfully` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Reverse a Posted Journal (Company-scoped)
async function reverseJournal(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;
    const { reversal_date, reversal_memo } = req.body;

    const result = await reverseJournalEntry({
      tenantId,
      companyId: companyId || null,
      userId: req.user._id,
      journalId: id,
      reversalDate: reversal_date,
      reversalMemo: reversal_memo
    });

    return res.success(result, { message: `Journal reversed successfully. Reversal number: ${result.reversal_journal.journal_number}` });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Trial Balance Report (Company-scoped)
async function getTrialBalance(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const tb = await computeTrialBalance(tenantId, null, companyId || null);
    return res.success(tb);
  } catch (err) {
    return res.error('Failed to compute trial balance', 500, err.message);
  }
}

// Posting Rules CRUD (Company-scoped with tenant fallback)
async function getPostingRules(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;

    const orClauses = [{ tenant_id: tenantId }, { tenant_id: null }];
    if (companyId) {
      orClauses.unshift({ tenant_id: tenantId, company_id: companyId });
    }

    const rules = await PostingRule.find({ $or: orClauses }).sort({ rule_code: 1 });

    const ruleIds = rules.map(r => r._id);
    const lines = await PostingRuleLine.find({ posting_rule_id: { $in: ruleIds } }).sort({ line_number: 1 });

    const result = rules.map(r => ({
      ...r.toObject(),
      lines: lines.filter(l => l.posting_rule_id.toString() === r._id.toString())
    }));

    return res.success(result);
  } catch (err) {
    return res.error('Failed to list posting rules', 500, err.message);
  }
}

async function createPostingRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { rule_code, event_type, rule_name, description, applicable_module, lines } = req.body;

    if (!rule_code || !event_type || !rule_name || !lines || lines.length < 2) {
      return res.error('rule_code, event_type, rule_name, and at least 2 rule lines are required', 400);
    }

    const dupQuery = { tenant_id: tenantId, rule_code: rule_code.toUpperCase().trim() };
    if (companyId) dupQuery.company_id = companyId;

    const exists = await PostingRule.findOne(dupQuery);
    if (exists) {
      return res.error(`Posting rule code "${rule_code}" already exists`, 409);
    }

    const rule = await PostingRule.create({
      tenant_id: tenantId,
      company_id: companyId || null,
      rule_code: rule_code.toUpperCase().trim(),
      event_type: event_type.toUpperCase().trim(),
      rule_name: rule_name.trim(),
      description: description || '',
      applicable_module: applicable_module || 'GL',
      status: 'ACTIVE'
    });

    const createdLines = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const lineDoc = await PostingRuleLine.create({
        posting_rule_id: rule._id,
        line_number: i + 1,
        account_code: l.account_code,
        direction: l.direction.toUpperCase(),
        amount_field: l.amount_field,
        description_template: l.description_template || ''
      });
      createdLines.push(lineDoc);
    }

    return res.success({ rule, lines: createdLines }, { message: 'Posting rule created' }, 201);
  } catch (err) {
    return res.error('Failed to create posting rule', 500, err.message);
  }
}

// Exchange Rates CRUD & Lookup
async function getExchangeRates(req, res) {
  try {
    const tenantId = req.tenantId;
    const rates = await ExchangeRate.find({
      $or: [{ tenant_id: tenantId }, { tenant_id: null }]
    }).sort({ effective_date: -1 });

    return res.success(rates);
  } catch (err) {
    return res.error('Failed to list exchange rates', 500, err.message);
  }
}

async function createExchangeRate(req, res) {
  try {
    const tenantId = req.tenantId;
    const { from_currency, to_currency, effective_date, rate, source } = req.body;

    if (!from_currency || !to_currency || !effective_date || !rate) {
      return res.error('from_currency, to_currency, effective_date, and rate are required', 400);
    }

    const rateDoc = await ExchangeRate.create({
      tenant_id: tenantId,
      from_currency: from_currency.toUpperCase().trim(),
      to_currency: to_currency.toUpperCase().trim(),
      effective_date: new Date(effective_date),
      rate: mongoose.Types.Decimal128.fromString(Number(rate).toFixed(6)),
      source: source || 'MANUAL'
    });

    return res.success(rateDoc, { message: 'Exchange rate recorded' }, 201);
  } catch (err) {
    return res.error('Failed to create exchange rate', 500, err.message);
  }
}

module.exports = {
  getAccounts,
  getAccountDetail,
  createAccount,
  updateAccount,
  getFiscalPeriods,
  createFiscalPeriod,
  updateFiscalPeriodStatus,
  getJournals,
  getJournalById,
  previewJournalTotals,
  postJournal,
  reverseJournal,
  getTrialBalance,
  getPostingRules,
  createPostingRule,
  getExchangeRates,
  createExchangeRate
};
