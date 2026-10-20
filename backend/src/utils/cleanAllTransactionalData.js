const mongoose = require('mongoose');
require('dotenv').config();
const models = require('../models');

async function cleanAllTransactionalData(tenantId) {
  if (!tenantId) throw new Error('tenantId is required');

  console.log(`\n========================================================================`);
  console.log(` CLEANING ALL TRANSACTIONAL & OPERATIONAL DATA FOR TENANT`);
  console.log(` Tenant ID: ${tenantId}`);
  console.log(`========================================================================\n`);

  const collectionsToWipe = [
    // General Ledger
    { name: 'Journal Entries (Lines)', model: models.JournalEntry },
    { name: 'Journals (Headers)', model: models.Journal },

    // Billing & AR
    { name: 'Payment Allocations', model: models.PaymentAllocation },
    { name: 'Payments', model: models.Payment },
    { name: 'Invoice Lines', model: models.InvoiceLine },
    { name: 'Invoices', model: models.Invoice },
    { name: 'Installment Schedules', model: models.InstallmentSchedule },
    { name: 'Billing Account Policies', model: models.BillingAccountPolicy },
    { name: 'Billing Accounts', model: models.BillingAccount },
    { name: 'Billing Adjustments', model: models.BillingAdjustment },

    // Treasury & Cash
    { name: 'Cash Reconciliation Matches', model: models.CashReconciliationMatch },
    { name: 'Bank Statement Lines', model: models.BankStatementLine },
    { name: 'Processor Transactions', model: models.ProcessorTransaction },
    { name: 'Payment Attempts', model: models.PaymentAttempt },
    { name: 'Payment Mandates', model: models.PaymentMandate },
    { name: 'Payment Returns (NSF)', model: models.PaymentReturn },
    { name: 'Refunds', model: models.Refund },
    { name: 'Unapplied Cash', model: models.UnappliedCash },

    // Counterparties & Dunning
    { name: 'Parties', model: models.Party },
    { name: 'Party Roles', model: models.PartyRole },
    { name: 'Delinquency Cases', model: models.DelinquencyCase },
    { name: 'Dunning Actions', model: models.DunningAction },
    { name: 'Collection Assignments', model: models.CollectionAssignment },

    // Commissions & Settlements
    { name: 'Commission Transactions', model: models.CommissionTransaction },
    { name: 'Commission Splits', model: models.CommissionSplit },
    { name: 'Commission Agreements', model: models.CommissionAgreement },
    { name: 'Commission Schedules', model: models.CommissionSchedule },
    { name: 'Profit Commission Schedules', model: models.ProfitCommissionSchedule },
    { name: 'Fiduciary Accounts', model: models.FiduciaryAccount },
    { name: 'Settlement Lines', model: models.SettlementLine },
    { name: 'Settlement Statements', model: models.SettlementStatement },
    { name: 'Bordereau Lines', model: models.BordereauLine },
    { name: 'Bordereau Runs', model: models.BordereauRun },
    { name: 'Commission Adjustments', model: models.CommissionAdjustment },
    { name: 'Commission Disputes', model: models.CommissionDispute },

    // Financial Close & Subledgers
    { name: 'Subledger Balances', model: models.SubledgerBalance },
    { name: 'Reconciliation Cases', model: models.ReconciliationCase },
    { name: 'Trial Balance Lines', model: models.TrialBalanceLine },
    { name: 'Trial Balance Snapshots', model: models.TrialBalanceSnapshot },
    { name: 'Period Close Tasks', model: models.PeriodCloseTask },
    { name: 'GL Export Batches', model: models.GLExportBatch },

    // Event Bus Logs
    { name: 'Outbox Events', model: models.OutboxEvent },
    { name: 'Inbox Messages', model: models.InboxMessage }
  ];

  for (const item of collectionsToWipe) {
    if (item.model) {
      const res = await item.model.deleteMany({ tenant_id: tenantId });
      console.log(`  ✓ Cleared ${item.name}: ${res.deletedCount} records deleted`);
    }
  }

  // Reset Chart of Accounts balances to clean $0.00
  const zeroDecimal = mongoose.Types.Decimal128.fromString('0.00');
  const coaRes = await models.LedgerAccount.updateMany(
    { tenant_id: tenantId },
    {
      $set: {
        current_balance: zeroDecimal,
        total_debits: zeroDecimal,
        total_credits: zeroDecimal
      }
    }
  );
  console.log(`  ✓ Reset Chart of Accounts: ${coaRes.modifiedCount} accounts reset to $0.00`);

  // Verify accounts
  const accounts = await models.LedgerAccount.find({ tenant_id: tenantId }).sort({ account_code: 1 }).lean();
  console.log(`\nVerified Chart of Accounts status (${accounts.length} accounts):`);
  accounts.forEach(a => {
    const bal = Number(a.current_balance ? a.current_balance.toString() : 0);
    console.log(`    ${a.account_code.padEnd(6)} ${a.account_name.padEnd(45)} $${bal.toFixed(2)}`);
  });

  console.log(`\n========================================================================`);
  console.log(` DATABASE FULLY PURGED AND RESET TO FRESH STATE FOR TENANT ${tenantId}`);
  console.log(`========================================================================\n`);
  return { success: true };
}

if (require.main === module) {
  const tenantId = process.env.TEST_TENANT_ID || '6acd045ef52f66e7422cf445';
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => cleanAllTransactionalData(tenantId))
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error('Purge error:', err);
      process.exit(1);
    });
}

module.exports = { cleanAllTransactionalData };
