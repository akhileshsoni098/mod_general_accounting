const { LedgerAccount, FiscalPeriod, AccountingCalendar, Journal, JournalEntry, PostingRule, PostingRuleLine, ExchangeRate, CommercialDocument } = require('../models');
const { postJournalEntry, reverseJournalEntry, convertVoucherToPosted, previewJournal, computeTrialBalance } = require('../services/journalPostingService');
const openingBalanceService = require('../services/openingBalanceService');
const accountingCalendarService = require('../services/accountingCalendarService');
const { seedTenantChartOfAccounts, seedCompanyChartOfAccounts } = require('../utils/seedCoa');
const { seedFiscalPeriods, seedCompanyFiscalPeriods } = require('../utils/seedFiscalPeriods');
const mongoose = require('mongoose');

// List Chart of Accounts (Scoped to Tenant and Company)
async function getAccounts(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { is_posting_allowed, is_group, groups_only } = req.query;

    const query = { tenant_id: tenantId };
    if (companyId) query.company_id = companyId;

    if (groups_only === 'true') {
      query.$or = [{ is_group: true }, { is_posting_allowed: false }];
    } else {
      if (is_posting_allowed !== undefined) {
        query.is_posting_allowed = is_posting_allowed === 'true';
      }
      if (is_group !== undefined) {
        query.is_group = is_group === 'true';
      }
    }

    // Auto-seed standard Tally groups if newly onboarded or missing groups
    const groupCount = await LedgerAccount.countDocuments({
      tenant_id: tenantId,
      ...(companyId ? { company_id: companyId } : {}),
      is_group: true
    });

    if (groupCount === 0) {
      if (companyId) {
        await seedCompanyChartOfAccounts(tenantId, companyId, {
          currency: req.company?.base_currency || 'INR'
        });
      } else {
        await seedTenantChartOfAccounts(tenantId);
      }
    }

    let accounts = await LedgerAccount.find(query)
      .populate('parent_account_id', 'account_code account_name group_type is_group')
      .sort({ account_code: 1 });

    const allEntries = await JournalEntry.find({ tenant_id: tenantId, ...(companyId ? { company_id: companyId } : {}) });
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
      parent_code,
      is_posting_allowed,
      is_group,
      group_type,
      is_fiduciary,
      subledger_type,
      opening_balance,
      opening_balance_type
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

    let resolvedParentId = parent_account_id || null;
    if (!resolvedParentId && parent_code) {
      const pQuery = { tenant_id: tenantId, account_code: parent_code.trim().toUpperCase() };
      if (companyId) pQuery.company_id = companyId;
      const foundParent = await LedgerAccount.findOne(pQuery);
      if (foundParent) resolvedParentId = foundParent._id;
    }

    // Verify parent if provided
    let parentDoc = null;
    if (resolvedParentId) {
      const parentQuery = { _id: resolvedParentId, tenant_id: tenantId };
      if (companyId) parentQuery.company_id = companyId;
      parentDoc = await LedgerAccount.findOne(parentQuery);
      if (!parentDoc) {
        return res.error('Parent account not found in this chart of accounts', 404);
      }
    }

    const computedIsGroup = typeof is_group === 'boolean'
      ? is_group
      : (is_posting_allowed === false);

    const computedPostingAllowed = typeof is_posting_allowed === 'boolean'
      ? is_posting_allowed
      : !computedIsGroup;

    let computedGroupType = group_type;
    if (!computedGroupType) {
      if (computedIsGroup) {
        computedGroupType = resolvedParentId ? 'SUBGROUP' : 'PRIMARY_GROUP';
      } else {
        computedGroupType = 'LEDGER';
      }
    }

    const ob = opening_balance ? Number(opening_balance) : 0;
    const obType = opening_balance_type
      ? opening_balance_type.toUpperCase()
      : (ob > 0 ? normal_balance.toUpperCase() : null);

    const account = await LedgerAccount.create({
      tenant_id: tenantId,
      company_id: companyId || null,
      account_code: account_code.trim().toUpperCase(),
      account_name: account_name.trim(),
      description: description || '',
      account_type: account_type.toUpperCase(),
      normal_balance: normal_balance.toUpperCase(),
      parent_account_id: resolvedParentId,
      is_posting_allowed: computedPostingAllowed,
      is_group: computedIsGroup,
      group_type: computedGroupType,
      opening_balance: mongoose.Types.Decimal128.fromString(ob.toFixed(2)),
      opening_balance_type: obType,
      opening_balance_date: ob > 0 ? new Date() : null,
      is_fiduciary: !!is_fiduciary,
      subledger_type: subledger_type || 'NONE',
      currency: req.company?.base_currency || 'INR'
    });

    return res.success(account, { message: 'Ledger account created' }, 201);
  } catch (err) {
    return res.error('Failed to create ledger account', 500, err.message);
  }
}

// Update / Edit Ledger Account (GL Code, Name, Type, Normal Balance, Parent, Status, etc.)
async function updateAccount(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;
    const {
      account_code,
      account_name,
      description,
      account_type,
      normal_balance,
      parent_account_id,
      is_posting_allowed,
      is_group,
      group_type,
      is_fiduciary,
      is_control_account,
      subledger_type,
      currency,
      status,
      opening_balance,
      opening_balance_type
    } = req.body;

    const query = {
      tenant_id: tenantId,
      $or: [
        { _id: mongoose.isValidObjectId(id) ? id : null },
        { account_code: String(id).trim().toUpperCase() }
      ]
    };
    if (companyId) query.company_id = companyId;

    const account = await LedgerAccount.findOne(query);
    if (!account) {
      return res.error('Ledger account not found', 404);
    }

    const oldAccountCode = account.account_code;

    // 1. GL Account Code update
    if (account_code !== undefined && account_code !== null) {
      const newCode = String(account_code).trim().toUpperCase();
      if (!newCode) {
        return res.error('account_code cannot be empty', 400);
      }

      if (newCode !== oldAccountCode) {
        // Uniqueness check within the same tenant & company
        const dupQuery = {
          _id: { $ne: account._id },
          tenant_id: tenantId,
          account_code: newCode
        };
        if (companyId) dupQuery.company_id = companyId;

        const duplicate = await LedgerAccount.findOne(dupQuery);
        if (duplicate) {
          return res.error(`Account code "${newCode}" is already in use by another account ("${duplicate.account_name}")`, 409);
        }

        // Cascade update to JournalEntry lines referencing this account
        await JournalEntry.updateMany(
          {
            tenant_id: tenantId,
            ...(companyId ? { company_id: companyId } : {}),
            $or: [
              { ledger_account_id: account._id },
              { account_code: oldAccountCode }
            ]
          },
          { $set: { account_code: newCode } }
        );

        account.account_code = newCode;
      }
    }

    // 2. Account / Ledger Name update
    if (account_name !== undefined && account_name !== null) {
      const newName = String(account_name).trim();
      if (!newName) {
        return res.error('account_name cannot be empty', 400);
      }
      account.account_name = newName;
    }

    // 3. Description update
    if (description !== undefined) {
      account.description = typeof description === 'string' ? description.trim() : '';
    }

    // 4. Account Type update
    if (account_type !== undefined && account_type !== null) {
      const cleanType = String(account_type).trim().toUpperCase();
      const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
      if (!validTypes.includes(cleanType)) {
        return res.error(`Invalid account_type "${cleanType}". Must be one of: ${validTypes.join(', ')}`, 400);
      }
      account.account_type = cleanType;
    }

    // 5. Normal Balance update
    if (normal_balance !== undefined && normal_balance !== null) {
      const cleanBal = String(normal_balance).trim().toUpperCase();
      if (!['DEBIT', 'CREDIT'].includes(cleanBal)) {
        return res.error(`Invalid normal_balance "${cleanBal}". Must be DEBIT or CREDIT`, 400);
      }
      account.normal_balance = cleanBal;
    }

    // 6. Parent Account & Cycle Detection
    if (parent_account_id !== undefined) {
      if (parent_account_id === null || parent_account_id === '' || parent_account_id === 'NONE') {
        account.parent_account_id = null;
      } else {
        if (!mongoose.isValidObjectId(parent_account_id)) {
          return res.error('Invalid parent_account_id format', 400);
        }
        if (parent_account_id.toString() === account._id.toString()) {
          return res.error('An account cannot be its own parent', 400);
        }

        // Verify parent exists in this workspace
        const parentQuery = { _id: parent_account_id, tenant_id: tenantId };
        if (companyId) parentQuery.company_id = companyId;
        const parentDoc = await LedgerAccount.findOne(parentQuery);
        if (!parentDoc) {
          return res.error('Parent account not found in this company chart of accounts', 404);
        }

        // Cycle detection: traverse parent hierarchy of candidate parent
        let currId = parent_account_id;
        while (currId) {
          if (currId.toString() === account._id.toString()) {
            return res.error('Cyclic parent relationship detected: an account cannot have its descendant as a parent', 400);
          }
          const p = await LedgerAccount.findOne({ _id: currId, tenant_id: tenantId });
          currId = p?.parent_account_id;
        }
        account.parent_account_id = parent_account_id;
      }
    }

    // 7. Group & Posting Allowed Logic
    if (is_group !== undefined) {
      const newIsGroup = Boolean(is_group);
      if (newIsGroup && !account.is_group) {
        // If converting a posting ledger to a group, ensure no journal entries have been posted
        const journalCount = await JournalEntry.countDocuments({
          tenant_id: tenantId,
          ledger_account_id: account._id
        });
        if (journalCount > 0) {
          return res.error(
            `Cannot convert account "${account.account_code}" to a summary group because ${journalCount} journal transactions have already been posted to it. Only accounts with zero journal postings can be changed to groups.`,
            400
          );
        }
      }
      account.is_group = newIsGroup;
      if (newIsGroup) {
        account.is_posting_allowed = false;
      }
    }

    if (is_posting_allowed !== undefined && !account.is_group) {
      account.is_posting_allowed = Boolean(is_posting_allowed);
    }

    if (group_type !== undefined) {
      const validGroupTypes = ['PRIMARY_GROUP', 'SUBGROUP', 'LEDGER'];
      if (validGroupTypes.includes(group_type)) {
        account.group_type = group_type;
      }
    }

    // 8. Fiduciary & Control Account flags
    if (is_fiduciary !== undefined) {
      account.is_fiduciary = Boolean(is_fiduciary);
    }
    if (is_control_account !== undefined) {
      account.is_control_account = Boolean(is_control_account);
    }

    // 9. Subledger Type
    if (subledger_type !== undefined) {
      const validSubledgers = ['NONE', 'AR', 'AP', 'FIDUCIARY', 'COMMISSIONS', 'UPR'];
      if (validSubledgers.includes(subledger_type)) {
        account.subledger_type = subledger_type;
      }
    }

    // 10. Currency
    if (currency !== undefined && currency !== null) {
      const cleanCur = String(currency).trim().toUpperCase();
      if (cleanCur) {
        account.currency = cleanCur;
      }
    }

    // 11. Status
    if (status !== undefined && status !== null) {
      const cleanStatus = String(status).trim().toUpperCase();
      if (['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(cleanStatus)) {
        if (cleanStatus !== 'ACTIVE') {
          const activeChildrenCount = await LedgerAccount.countDocuments({
            tenant_id: tenantId,
            parent_account_id: account._id,
            status: 'ACTIVE'
          });
          if (activeChildrenCount > 0) {
            return res.error(
              `Cannot set account to ${cleanStatus} because it has ${activeChildrenCount} active child accounts. Please reassign or deactivate child accounts first.`,
              400
            );
          }
        }
        account.status = cleanStatus;
      }
    }

    // 12. Opening Balance
    if (opening_balance !== undefined) {
      const ob = Number(opening_balance) || 0;
      account.opening_balance = mongoose.Types.Decimal128.fromString(ob.toFixed(2));
      account.opening_balance_type = opening_balance_type
        ? opening_balance_type.toUpperCase()
        : (ob > 0 ? account.normal_balance : null);
      account.opening_balance_date = ob > 0 ? (account.opening_balance_date || new Date()) : null;
    }

    account.row_version = (account.row_version || 1) + 1;
    await account.save();

    return res.success(account, { message: `Account "${account.account_code} - ${account.account_name}" updated successfully` });
  } catch (err) {
    return res.error('Failed to update ledger account', 500, err.message);
  }
}

// Safe delete or inactivate Ledger Account
async function archiveAccount(req, res) {
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

    // Check if account has child accounts
    const hasChildren = await LedgerAccount.exists({
      tenant_id: tenantId,
      parent_account_id: account._id
    });
    if (hasChildren) {
      return res.error(`Cannot delete account "${account.account_code}" as it has child sub-accounts`, 400);
    }

    // Check if account has posted journal entries
    const hasActivity = await JournalEntry.exists({
      tenant_id: tenantId,
      $or: [
        { ledger_account_id: account._id },
        { account_code: account.account_code }
      ]
    });

    if (hasActivity) {
      account.status = 'INACTIVE';
      account.row_version = (account.row_version || 1) + 1;
      await account.save();
      return res.success(account, { message: `Account "${account.account_code}" has historical journal activity; safely deactivated.` });
    }

    await LedgerAccount.deleteOne({ _id: account._id });
    return res.success({ message: `Account "${account.account_code}" deleted successfully` });
  } catch (err) {
    return res.error('Failed to delete ledger account', 500, err.message);
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

// ----------------------------------------------------
// US Accounting Calendars & Retail Period Engine
// ----------------------------------------------------

// List Accounting Calendars (Tenant & Company Scoped)
async function getAccountingCalendars(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;

    const query = { tenant_id: tenantId };
    if (companyId) {
      query.$or = [{ company_id: companyId }, { company_id: null }];
    }

    const calendars = await AccountingCalendar.find(query).sort({ is_default: -1, calendar_name: 1 });
    return res.success(calendars);
  } catch (err) {
    return res.error('Failed to list accounting calendars', 500, err.message);
  }
}

// Create Accounting Calendar
async function createAccountingCalendar(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const {
      calendar_code,
      calendar_name,
      calendar_type,
      fiscal_year_start_month,
      week_start_day,
      week_end_day,
      year_end_rule,
      anchor_month,
      fifty_three_week_policy,
      is_default,
      description
    } = req.body;

    if (!calendar_code || !calendar_name || !calendar_type) {
      return res.error('calendar_code, calendar_name, and calendar_type are required', 400);
    }

    const cleanCode = calendar_code.trim().toUpperCase();
    const dupQuery = { tenant_id: tenantId, calendar_code: cleanCode };
    if (companyId) dupQuery.company_id = companyId;

    const existing = await AccountingCalendar.findOne(dupQuery);
    if (existing) {
      return res.error(`Accounting calendar with code "${cleanCode}" already exists`, 409);
    }

    // If setting as default, unset other defaults
    if (is_default) {
      const unsetQuery = { tenant_id: tenantId };
      if (companyId) unsetQuery.company_id = companyId;
      await AccountingCalendar.updateMany(unsetQuery, { $set: { is_default: false } });
    }

    const calendar = await AccountingCalendar.create({
      tenant_id: tenantId,
      company_id: companyId || null,
      calendar_code: cleanCode,
      calendar_name: calendar_name.trim(),
      calendar_type,
      fiscal_year_start_month: fiscal_year_start_month || 1,
      week_start_day: week_start_day || 'SUNDAY',
      week_end_day: week_end_day || 'SATURDAY',
      year_end_rule: year_end_rule || (calendar_type === 'GREGORIAN' ? 'CALENDAR_MONTH_END' : 'LAST_WEEKDAY_OF_MONTH'),
      anchor_month: anchor_month || 1,
      fifty_three_week_policy: fifty_three_week_policy || 'ADD_TO_LAST_PERIOD',
      is_default: !!is_default,
      description: description || ''
    });

    return res.success(calendar, { message: 'Accounting calendar created successfully' }, 201);
  } catch (err) {
    return res.error('Failed to create accounting calendar', 500, err.message);
  }
}

// Update Accounting Calendar
async function updateAccountingCalendar(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;

    const query = { _id: id, tenant_id: tenantId };
    if (companyId) query.company_id = companyId;

    const calendar = await AccountingCalendar.findOne(query);
    if (!calendar) {
      return res.error('Accounting calendar not found', 404);
    }

    const {
      calendar_name,
      fifty_three_week_policy,
      is_default,
      is_active,
      status,
      description
    } = req.body;

    if (calendar_name) calendar.calendar_name = calendar_name.trim();
    if (fifty_three_week_policy) calendar.fifty_three_week_policy = fifty_three_week_policy;
    if (is_active !== undefined) calendar.is_active = is_active;
    if (status) calendar.status = status;
    if (description !== undefined) calendar.description = description;

    if (is_default) {
      const unsetQuery = { tenant_id: tenantId };
      if (companyId) unsetQuery.company_id = companyId;
      await AccountingCalendar.updateMany(unsetQuery, { $set: { is_default: false } });
      calendar.is_default = true;
    }

    await calendar.save();
    return res.success(calendar, { message: 'Accounting calendar updated successfully' });
  } catch (err) {
    return res.error('Failed to update accounting calendar', 500, err.message);
  }
}

// Generate & Persist Periods for an Accounting Calendar
async function generateCalendarPeriods(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;
    const { fiscal_year, dry_run = false } = req.body;

    if (!fiscal_year) {
      return res.error('fiscal_year is required', 400);
    }

    const result = await accountingCalendarService.generateAndSavePeriods(id, Number(fiscal_year), {
      tenantId,
      companyId,
      dryRun: dry_run === true || dry_run === 'true'
    });

    return res.success(result, {
      message: dry_run ? 'Periods calculated (dry run)' : `Successfully generated periods for FY ${fiscal_year}`
    });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Get Periods for an Accounting Calendar
async function getCalendarPeriods(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;
    const { fiscal_year } = req.query;

    const query = {
      tenant_id: tenantId,
      calendar_id: id
    };
    if (companyId) query.company_id = companyId;
    if (fiscal_year) query.fiscal_year = Number(fiscal_year);

    const periods = await FiscalPeriod.find(query).sort({ fiscal_year: 1, period_number: 1 });
    return res.success(periods);
  } catch (err) {
    return res.error('Failed to fetch calendar periods', 500, err.message);
  }
}

// List Journals (Company-scoped)
async function getJournals(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { limit = 50, reference_id, status, source_module, voucher_type, is_memorandum, is_optional } = req.query;

    const filter = { tenant_id: tenantId };
    if (companyId) filter.company_id = companyId;
    if (reference_id) filter.reference_id = reference_id;
    if (status) filter.status = status.toUpperCase();
    if (source_module) filter.source_module = source_module.toUpperCase();
    if (voucher_type) filter.voucher_type = voucher_type.toUpperCase();
    if (is_memorandum !== undefined) filter.is_memorandum = is_memorandum === 'true';
    if (is_optional !== undefined) filter.is_optional = is_optional === 'true';

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
    const {
      posting_date,
      source_module,
      reference_id,
      commercial_document_id,
      reference_type,
      reference_document_number,
      memo,
      description,
      lines,
      entries,
      currency,
      accounting_basis,
      voucher_type,
      is_memorandum,
      is_optional
    } = req.body;

    let validatedDocId = commercial_document_id || null;
    let validatedDocNumber = reference_document_number || null;
    let validatedRefType = reference_type || 'NONE';

    if (validatedDocId) {
      const docQuery = { _id: validatedDocId, tenant_id: tenantId };
      if (companyId) docQuery.company_id = companyId;
      const doc = await CommercialDocument.findOne(docQuery);
      if (!doc) {
        return res.error('Referenced commercial document / invoice not found in this company', 404);
      }
      if (!validatedDocNumber) {
        validatedDocNumber = doc.document_number;
      }
      if (validatedRefType === 'NONE') {
        validatedRefType = 'REFERENCE_ONLY';
      }
    }

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
      commercialDocumentId: validatedDocId,
      referenceType: validatedRefType,
      referenceDocumentNumber: validatedDocNumber,
      memo: memo || description || '',
      currency: currency || req.company?.base_currency || 'INR',
      accountingBasis: accounting_basis || 'GAAP',
      voucherType: voucher_type || 'STANDARD',
      isMemorandum: is_memorandum === true,
      isOptional: is_optional === true,
      lines: processedLines
    });

    const isNonPosting = result.journal.status === 'MEMORANDUM' || result.journal.status === 'OPTIONAL';
    const message = isNonPosting
      ? `${result.journal.voucher_type} voucher ${result.journal.journal_number} recorded successfully (non-posting)`
      : `Journal ${result.journal.journal_number} posted successfully`;

    return res.success(result, { message }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Convert a Memorandum or Optional Voucher to POSTED
async function convertVoucher(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;

    const result = await convertVoucherToPosted({
      tenantId,
      companyId: companyId || null,
      userId: req.user._id,
      journalId: id
    });

    return res.success(result, {
      message: `Voucher ${result.journal.journal_number} converted to POSTED journal successfully`
    });
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

async function getPostingRuleById(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const rule = await PostingRule.findOne({
      _id: id,
      $or: [{ tenant_id: tenantId }, { tenant_id: null }]
    });
    if (!rule) return res.error('Posting rule not found', 404);
    const lines = await PostingRuleLine.find({ posting_rule_id: rule._id }).sort({ line_number: 1 });
    const ruleObj = rule.toObject();
    return res.success({ ...ruleObj, rule: ruleObj, lines });
  } catch (err) {
    return res.error('Failed to get posting rule', 500, err.message);
  }
}

async function createPostingRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { rule_code, event_type, event_code, rule_name, description, applicable_module, lines } = req.body;

    if (!rule_code || (!event_type && !event_code) || !rule_name || !lines || lines.length < 2) {
      return res.error('rule_code, event_type/event_code, rule_name, and at least 2 rule lines are required', 400);
    }

    const cleanCode = rule_code.toUpperCase().trim();
    const cleanEventType = (event_type || event_code).toUpperCase().trim();
    const cleanEventCode = (event_code || event_type).toLowerCase().trim();

    const dupQuery = { tenant_id: tenantId, rule_code: cleanCode };
    if (companyId) dupQuery.company_id = companyId;

    const exists = await PostingRule.findOne(dupQuery);
    if (exists) {
      return res.error(`Posting rule code "${rule_code}" already exists`, 409);
    }

    const rule = await PostingRule.create({
      tenant_id: tenantId,
      company_id: companyId || null,
      rule_code: cleanCode,
      event_code: cleanEventCode,
      event_type: cleanEventType,
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
        tenant_id: tenantId,
        line_number: i + 1,
        line_key: l.line_key || `LINE_${i + 1}`,
        account_code: l.account_code ? l.account_code.trim() : '',
        direction: (l.direction || 'DEBIT').toUpperCase(),
        amount_field: l.amount_field || null,
        amount_expression: l.amount_expression || (l.amount_field ? `payload.${l.amount_field}` : 'payload.amount'),
        description_template: l.description_template || ''
      });
      createdLines.push(lineDoc);
    }

    return res.success({ rule, lines: createdLines }, { message: 'Posting rule created successfully' }, 201);
  } catch (err) {
    return res.error('Failed to create posting rule', 500, err.message);
  }
}

async function updatePostingRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { rule_name, description, event_type, event_code, applicable_module, status, lines } = req.body;

    const rule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!rule) return res.error('Posting rule not found', 404);

    if (rule_name) rule.rule_name = rule_name.trim();
    if (typeof description === 'string') rule.description = description.trim();
    if (event_type || event_code) {
      rule.event_type = (event_type || event_code).toUpperCase().trim();
      rule.event_code = (event_code || event_type).toLowerCase().trim();
    }
    if (applicable_module) rule.applicable_module = applicable_module;
    if (status) rule.status = status.toUpperCase();

    await rule.save();

    if (lines && Array.isArray(lines) && lines.length >= 2) {
      await PostingRuleLine.deleteMany({ posting_rule_id: rule._id });
      const createdLines = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const lineDoc = await PostingRuleLine.create({
          posting_rule_id: rule._id,
          tenant_id: tenantId,
          line_number: i + 1,
          line_key: l.line_key || `LINE_${i + 1}`,
          account_code: l.account_code ? l.account_code.trim() : '',
          direction: (l.direction || 'DEBIT').toUpperCase(),
          amount_field: l.amount_field || null,
          amount_expression: l.amount_expression || (l.amount_field ? `payload.${l.amount_field}` : 'payload.amount'),
          description_template: l.description_template || ''
        });
        createdLines.push(lineDoc);
      }
      return res.success({ rule, lines: createdLines }, { message: 'Posting rule updated successfully' });
    }

    const existingLines = await PostingRuleLine.find({ posting_rule_id: rule._id }).sort({ line_number: 1 });
    return res.success({ rule, lines: existingLines }, { message: 'Posting rule updated successfully' });
  } catch (err) {
    return res.error('Failed to update posting rule', 500, err.message);
  }
}

async function deletePostingRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const rule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!rule) return res.error('Posting rule not found', 404);

    await PostingRuleLine.deleteMany({ posting_rule_id: rule._id });
    await PostingRule.deleteOne({ _id: rule._id });

    return res.success(
      { id: rule._id, rule_code: rule.rule_code },
      { message: `Posting rule ${rule.rule_code} deleted successfully` }
    );
  } catch (err) {
    return res.error('Failed to delete posting rule', 500, err.message);
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

// Financial Statements (Profit & Loss and Balance Sheet - Company-scoped)
async function getFinancialStatements(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const financeCloseService = require('../services/financeCloseService');
    const statements = await financeCloseService.generateFinancialReports({
      tenantId,
      companyId: companyId || null
    });
    return res.success(statements);
  } catch (err) {
    return res.error('Failed to generate financial statements', 500, err.message);
  }
}

// 3-Tier Cash Flow Statement (Company-scoped)
async function getCashFlowStatement(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const financeCloseService = require('../services/financeCloseService');
    const statement = await financeCloseService.generateCashFlowStatement({
      tenantId,
      companyId: companyId || null
    });
    return res.success(statement);
  } catch (err) {
    return res.error('Failed to generate cash flow statement', 500, err.message);
  }
}

// Financial Ratios Analysis (Company-scoped)
async function getFinancialRatios(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const financeCloseService = require('../services/financeCloseService');
    const ratios = await financeCloseService.computeFinancialRatios({
      tenantId,
      companyId: companyId || null
    });
    return res.success(ratios);
  } catch (err) {
    return res.error('Failed to compute financial ratios', 500, err.message);
  }
}

// Opening Balances Management (Company-scoped)
async function getOpeningBalances(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { financial_year } = req.query;

    const groupCount = await LedgerAccount.countDocuments({
      tenant_id: tenantId,
      ...(companyId ? { company_id: companyId } : {}),
      is_group: true
    });
    if (groupCount === 0 && companyId) {
      await seedCompanyChartOfAccounts(tenantId, companyId, {
        currency: req.company?.base_currency || 'INR'
      });
    }

    const setup = await openingBalanceService.getOpeningBalanceSetup(tenantId, companyId, financial_year);
    return res.success(setup);
  } catch (err) {
    return res.error('Failed to get opening balance setup', 500, err.message);
  }
}

async function saveOpeningBalancesDraft(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const {
      financial_year,
      as_of_date,
      lines,
      allow_suspense,
      suspense_account_id,
      notes
    } = req.body;

    const setup = await openingBalanceService.saveOpeningBalanceDraft(tenantId, companyId, {
      financialYear: financial_year,
      asOfDate: as_of_date,
      lines,
      allowSuspense: allow_suspense,
      suspenseAccountId: suspense_account_id,
      notes,
      userId: req.user?._id
    });

    return res.success(setup, { message: 'Opening balances draft saved successfully' });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function postOpeningBalances(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const {
      financial_year,
      allow_suspense,
      suspense_account_id
    } = req.body;

    const result = await openingBalanceService.postOpeningBalanceSetup(tenantId, companyId, {
      financialYear: financial_year,
      userId: req.user?._id,
      allowSuspense: allow_suspense,
      suspenseAccountId: suspense_account_id
    });

    return res.success(result, { message: result.message }, result.already_posted ? 200 : 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

module.exports = {
  getAccounts,
  getAccountDetail,
  createAccount,
  updateAccount,
  archiveAccount,
  getFiscalPeriods,
  createFiscalPeriod,
  updateFiscalPeriodStatus,
  getAccountingCalendars,
  createAccountingCalendar,
  updateAccountingCalendar,
  generateCalendarPeriods,
  getCalendarPeriods,
  getJournals,
  getJournalById,
  previewJournalTotals,
  postJournal,
  convertVoucher,
  reverseJournal,
  getTrialBalance,
  getFinancialStatements,
  getCashFlowStatement,
  getFinancialRatios,
  getPostingRules,
  getPostingRuleById,
  createPostingRule,
  updatePostingRule,
  deletePostingRule,
  getExchangeRates,
  createExchangeRate,
  getOpeningBalances,
  saveOpeningBalancesDraft,
  postOpeningBalances
};
