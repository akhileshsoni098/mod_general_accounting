/**
 * Idempotent Company Data Migration & Backfill Tool
 * Scans legacy tenant records, reports dry-run statistics, and safely associates
 * company-owned records with designated primary/legacy company entities.
 *
 * Safety guarantees:
 * - DRY-RUN by default. Does NOT modify database unless --apply is explicitly passed.
 * - Guarded against production databases (requires ENABLE_MIGRATION_APPLY === 'true').
 * - Preserves all existing IDs, balances, and references without rewriting documents.
 * - Idempotent: repeated runs produce consistent, conflict-free results.
 */

const mongoose = require('mongoose');
const {
  Tenant,
  User,
  TenantMembership,
  Company,
  CompanyMembership,
  LedgerAccount,
  FiscalPeriod,
  Journal,
  JournalEntry,
  Party,
  PostingRule,
  DimensionDefinition
} = require('../models');

/**
 * Runs migration analysis or application across tenants.
 * @param {Object} options
 * @param {boolean} options.apply - If true, persists backfill updates (requires safety flag).
 * @param {string} [options.tenantId] - Optional single tenant filter.
 * @returns {Promise<Object>} Migration execution report.
 */
async function runCompanyMigration({ apply = false, tenantId = null } = {}) {
  const isApply = Boolean(apply);
  const isProduction = process.env.NODE_ENV === 'production';
  const isApplyPermitted = process.env.ENABLE_MIGRATION_APPLY === 'true';

  if (isApply && (isProduction || !isApplyPermitted)) {
    throw new Error(
      'MIGRATION_APPLY_BLOCKED: Apply mode is strictly disabled in production and requires ENABLE_MIGRATION_APPLY=true.'
    );
  }

  const tenantFilter = { status: { $ne: 'ARCHIVED' } };
  if (tenantId) {
    if (mongoose.isValidObjectId(tenantId)) {
      tenantFilter._id = tenantId;
    } else {
      tenantFilter.tenant_code = tenantId.toUpperCase().trim();
    }
  }

  const tenants = await Tenant.find(tenantFilter).sort({ tenant_code: 1 });
  const tenantReports = [];
  let totalRecordsScanned = 0;
  let totalRecordsRequiringBackfill = 0;
  let totalRecordsBackfilled = 0;

  for (const tenant of tenants) {
    const tId = tenant._id;

    // 1. Scan un-migrated company-scoped records
    const counts = {
      ledger_accounts: await LedgerAccount.countDocuments({ tenant_id: tId, company_id: null }),
      fiscal_periods: await FiscalPeriod.countDocuments({ tenant_id: tId, company_id: null }),
      journals: await Journal.countDocuments({ tenant_id: tId, company_id: null }),
      journal_entries: await JournalEntry.countDocuments({ tenant_id: tId, company_id: null }),
      parties: await Party.countDocuments({ tenant_id: tId, company_id: null }),
      posting_rules: await PostingRule.countDocuments({ tenant_id: tId, company_id: null }),
      dimensions: await DimensionDefinition.countDocuments({ tenant_id: tId, company_id: null })
    };

    const tenantUnmigratedTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    totalRecordsScanned += tenantUnmigratedTotal;

    // 2. Identify or propose legacy company
    let targetCompany = await Company.findOne({
      tenant_id: tId,
      $or: [
        { is_legacy_default: true },
        { company_code: 'MAIN' },
        { company_code: `DEFAULT_${tenant.tenant_code}` }
      ]
    });

    const proposedCompanyCode = targetCompany ? targetCompany.company_code : `DEFAULT_${tenant.tenant_code}`;
    const proposedCompanyName = targetCompany ? targetCompany.company_name : `${tenant.name} Primary (Migrated)`;

    // 3. Detect integrity risks (orphaned documents with invalid tenant)
    const orphanedEntries = await JournalEntry.countDocuments({
      journal_id: { $exists: false }
    });

    const reportItem = {
      tenant_id: tId.toString(),
      tenant_code: tenant.tenant_code,
      tenant_name: tenant.name,
      unmigrated_counts: counts,
      total_unmigrated: tenantUnmigratedTotal,
      proposed_company: {
        existing_company_id: targetCompany ? targetCompany._id.toString() : null,
        company_code: proposedCompanyCode,
        company_name: proposedCompanyName,
        business_profile: 'GENERAL_RETAIL',
        is_legacy_default: true
      },
      integrity_warnings: orphanedEntries > 0 ? [`${orphanedEntries} orphaned journal entries detected`] : [],
      status: tenantUnmigratedTotal === 0 ? 'ALREADY_MIGRATED' : 'NEEDS_MIGRATION'
    };

    // 4. Apply backfill if in apply mode
    if (isApply && tenantUnmigratedTotal > 0) {
      if (!targetCompany) {
        // Create the legacy company
        targetCompany = await Company.create({
          tenant_id: tId,
          company_code: proposedCompanyCode,
          company_name: proposedCompanyName,
          legal_name: tenant.name,
          business_profile: 'GENERAL_RETAIL',
          base_currency: tenant.base_currency || 'INR',
          financial_year_start_month: tenant.fiscal_year_start_month || 4,
          is_legacy_default: true,
          status: 'ACTIVE'
        });
      }

      // Associate all active tenant members with this legacy company
      const tenantMemberships = await TenantMembership.find({ tenant_id: tId, status: 'ACTIVE' });
      for (const tm of tenantMemberships) {
        await CompanyMembership.findOneAndUpdate(
          { tenant_id: tId, company_id: targetCompany._id, user_id: tm.user_id },
          { status: 'ACTIVE', is_default: true, joined_at: tm.joined_at || new Date() },
          { upsert: true, setDefaultsOnInsert: true }
        );
      }

      // Backfill company_id on accounting collections
      const targetCmpId = targetCompany._id;
      const resAcc = await LedgerAccount.updateMany({ tenant_id: tId, company_id: null }, { $set: { company_id: targetCmpId } });
      const resPer = await FiscalPeriod.updateMany({ tenant_id: tId, company_id: null }, { $set: { company_id: targetCmpId } });
      const resJrn = await Journal.updateMany({ tenant_id: tId, company_id: null }, { $set: { company_id: targetCmpId } });
      const resEnt = await JournalEntry.updateMany({ tenant_id: tId, company_id: null }, { $set: { company_id: targetCmpId } });
      const resPty = await Party.updateMany({ tenant_id: tId, company_id: null }, { $set: { company_id: targetCmpId } });
      const resRul = await PostingRule.updateMany({ tenant_id: tId, company_id: null }, { $set: { company_id: targetCmpId } });
      const resDim = await DimensionDefinition.updateMany({ tenant_id: tId, company_id: null }, { $set: { company_id: targetCmpId } });

      const updatedCount =
        resAcc.modifiedCount +
        resPer.modifiedCount +
        resJrn.modifiedCount +
        resEnt.modifiedCount +
        resPty.modifiedCount +
        resRul.modifiedCount +
        resDim.modifiedCount;

      totalRecordsBackfilled += updatedCount;
      reportItem.records_updated = updatedCount;
      reportItem.status = 'MIGRATION_COMPLETED';
    }

    totalRecordsRequiringBackfill += tenantUnmigratedTotal;
    tenantReports.push(reportItem);
  }

  return {
    mode: isApply ? 'APPLY' : 'DRY_RUN',
    timestamp: new Date().toISOString(),
    tenants_analyzed: tenants.length,
    total_unmigrated_records: totalRecordsRequiringBackfill,
    total_records_updated: totalRecordsBackfilled,
    is_safe_to_apply: tenantReports.every(r => r.integrity_warnings.length === 0),
    tenants: tenantReports
  };
}

// Standalone CLI runner
if (require.main === module) {
  const { connectDB, disconnectDB } = require('../config/db');
  (async () => {
    try {
      await connectDB();
      const args = process.argv.slice(2);
      const apply = args.includes('--apply');
      const tenantArg = args.find(a => a.startsWith('--tenant='));
      const tenantId = tenantArg ? tenantArg.split('=')[1] : null;

      console.log(`[MIGRATION TOOL] Running in ${apply ? 'APPLY' : 'DRY-RUN'} mode...`);
      const report = await runCompanyMigration({ apply, tenantId });
      console.log(JSON.stringify(report, null, 2));
    } catch (err) {
      console.error('[MIGRATION TOOL ERROR]', err.message);
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}

module.exports = {
  runCompanyMigration
};
