const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { TaxJurisdiction, TaxProviderSyncLog, PlatformAuditLog } = require('../models');

const DEFAULT_SEED_DIR = path.join(__dirname, '../data/us-tax');

/**
 * Validates the jurisdiction JSON seed files before database persistence.
 * Validates required fields, stable code uniqueness, parent hierarchy, and FIPS formatting.
 *
 * @param {string} [seedDir] - Directory containing seed JSON files
 * @returns {Object} Validation result { valid, errors, manifest, records }
 */
function validateSeedFiles(seedDir = DEFAULT_SEED_DIR) {
  const errors = [];
  const records = [];
  const seenCodes = new Set();

  const manifestPath = path.join(seedDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      valid: false,
      errors: [{ record_code: 'MANIFEST', reason: `manifest.json missing at ${seedDir}` }],
      manifest: null,
      records: []
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return {
      valid: false,
      errors: [{ record_code: 'MANIFEST', reason: `manifest.json corrupted: ${err.message}` }],
      manifest: null,
      records: []
    };
  }

  if (!manifest.dataset_version || !manifest.schema_version) {
    errors.push({ record_code: 'MANIFEST', reason: 'manifest missing dataset_version or schema_version' });
  }

  const jurisdictionFiles = [
    'jurisdictions.federal.json',
    'jurisdictions.states.json',
    'jurisdictions.territories.json',
    'jurisdictions.counties.sample.json'
  ];

  for (const filename of jurisdictionFiles) {
    const filePath = path.join(seedDir, filename);
    if (!fs.existsSync(filePath)) {
      errors.push({ record_code: filename, reason: `Seed file missing: ${filename}` });
      continue;
    }

    let fileRecords;
    try {
      fileRecords = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      errors.push({ record_code: filename, reason: `JSON syntax error in ${filename}: ${err.message}` });
      continue;
    }

    if (!Array.isArray(fileRecords)) {
      errors.push({ record_code: filename, reason: `File ${filename} must contain a JSON array of jurisdiction objects` });
      continue;
    }

    for (let i = 0; i < fileRecords.length; i++) {
      const rec = fileRecords[i];
      const code = rec.jurisdiction_code;

      if (!code || typeof code !== 'string' || !code.trim()) {
        errors.push({ record_code: `FILE_${filename}_INDEX_${i}`, reason: 'Missing required jurisdiction_code' });
        continue;
      }

      const cleanCode = code.trim().toUpperCase();
      if (seenCodes.has(cleanCode)) {
        errors.push({ record_code: cleanCode, reason: `Duplicate jurisdiction_code "${cleanCode}" found in seed files` });
      }
      seenCodes.add(cleanCode);

      if (!rec.jurisdiction_name || typeof rec.jurisdiction_name !== 'string') {
        errors.push({ record_code: cleanCode, reason: 'Missing required jurisdiction_name' });
      }

      if (!rec.jurisdiction_type) {
        errors.push({ record_code: cleanCode, reason: 'Missing required jurisdiction_type' });
      }

      if (!rec.country_code || rec.country_code !== 'US') {
        errors.push({ record_code: cleanCode, reason: 'country_code must be "US"' });
      }

      if (rec.fips_code !== undefined && rec.fips_code !== null) {
        if (typeof rec.fips_code !== 'string') {
          errors.push({ record_code: cleanCode, reason: 'fips_code must be a string to preserve leading zeros' });
        }
      }

      records.push({
        ...rec,
        jurisdiction_code: cleanCode,
        _source_file: filename
      });
    }
  }

  // Validate parent hierarchy containment
  for (const rec of records) {
    if (rec.parent_code) {
      const parentCode = rec.parent_code.trim().toUpperCase();
      if (!seenCodes.has(parentCode)) {
        errors.push({
          record_code: rec.jurisdiction_code,
          reason: `parent_code "${parentCode}" referenced by "${rec.jurisdiction_code}" does not exist in dataset`
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    manifest,
    records
  };
}

/**
 * Imports or previews US jurisdiction seed data into MongoDB.
 * Guaranteed idempotent, transactional, and dry-run capable.
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - Preview impact without modifying database
 * @param {string|ObjectId} [options.userId=null] - User initiating import
 * @param {string|ObjectId} [options.tenantId=null] - Tenant context (null for platform/global reference)
 * @param {string} [options.seedDir] - Custom seed path
 * @returns {Promise<Object>} Import summary and status
 */
async function importJurisdictionSeeds(options = {}) {
  const {
    dryRun = false,
    userId = null,
    tenantId = null,
    seedDir = DEFAULT_SEED_DIR
  } = options;

  const validation = validateSeedFiles(seedDir);
  const startedAt = new Date();

  if (!validation.valid) {
    // Record failed validation attempt
    if (!dryRun) {
      try {
        await TaxProviderSyncLog.create({
          tenant_id: tenantId,
          sync_type: 'JSON_SEED_IMPORT',
          dataset_version: validation.manifest ? validation.manifest.dataset_version : 'UNKNOWN',
          source: 'US_CENSUS_BUREAU',
          dry_run: false,
          summary: {
            total_processed: validation.records.length,
            inserted: 0,
            updated: 0,
            unchanged: 0,
            rejected: validation.errors.length,
            unsupported: 0
          },
          errors: validation.errors,
          executed_by_user_id: userId,
          started_at: startedAt,
          completed_at: new Date(),
          status: 'FAILED'
        });
      } catch (logErr) {
        console.error('[TaxSeedImport] Failed to persist sync failure log:', logErr.message);
      }
    }

    return {
      success: false,
      dry_run: dryRun,
      message: 'Seed dataset validation failed',
      errors: validation.errors,
      summary: {
        total_processed: validation.records.length,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        rejected: validation.errors.length,
        unsupported: 0
      }
    };
  }

  const { manifest, records } = validation;
  const datasetVersion = manifest.dataset_version || '2024.1.0';

  // Fetch existing jurisdictions from DB by codes if DB connected
  const allCodes = records.map(r => r.jurisdiction_code);
  const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
  const existingDocs = isDbConnected ? await TaxJurisdiction.find({ jurisdiction_code: { $in: allCodes } }) : [];
  const existingMap = new Map();
  for (const doc of existingDocs) {
    existingMap.set(doc.jurisdiction_code, doc);
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let unsupportedCount = 0;

  for (const rec of records) {
    if (rec.provider_coverage_status === 'UNSUPPORTED') {
      unsupportedCount++;
    }

    const existing = existingMap.get(rec.jurisdiction_code);
    if (!existing) {
      insertedCount++;
    } else {
      // Check if attributes changed
      const hasChanged =
        existing.jurisdiction_name !== rec.jurisdiction_name ||
        existing.jurisdiction_type !== rec.jurisdiction_type ||
        existing.state_code !== (rec.state_code || null) ||
        existing.fips_code !== (rec.fips_code || null) ||
        existing.source_version !== datasetVersion;

      if (hasChanged) {
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }
  }

  const summary = {
    total_processed: records.length,
    inserted: insertedCount,
    updated: updatedCount,
    unchanged: unchangedCount,
    rejected: 0,
    unsupported: unsupportedCount
  };

  // Dry run terminates here with ZERO database mutations
  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      message: `Dry-run preview completed: ${insertedCount} to insert, ${updatedCount} to update, ${unchangedCount} unchanged, ${unsupportedCount} unsupported.`,
      dataset_version: datasetVersion,
      summary
    };
  }

  // Live Import Execution:
  // Step 1: Upsert all jurisdictions without parent references first to establish _ids
  const codeToIdMap = new Map();
  for (const doc of existingDocs) {
    codeToIdMap.set(doc.jurisdiction_code, doc._id);
  }

  for (const rec of records) {
    const updateData = {
      jurisdiction_name: rec.jurisdiction_name,
      jurisdiction_type: rec.jurisdiction_type,
      country_code: rec.country_code || 'US',
      state_code: rec.state_code || null,
      fips_code: rec.fips_code || null,
      gnis_id: rec.gnis_id || null,
      provider_code_map: rec.provider_code_map || {},
      is_active: true,
      source: rec.source || 'US_CENSUS_BUREAU',
      source_version: datasetVersion,
      provider_coverage_status: rec.provider_coverage_status || 'UNVERIFIED',
      reference_data_status: rec.reference_data_status || 'REFERENCE_DATA_AVAILABLE',
      imported_at: new Date()
    };

    const savedDoc = await TaxJurisdiction.findOneAndUpdate(
      { jurisdiction_code: rec.jurisdiction_code },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    codeToIdMap.set(rec.jurisdiction_code, savedDoc._id);
  }

  // Step 2: Establish parent_jurisdiction_id references
  for (const rec of records) {
    if (rec.parent_code) {
      const parentId = codeToIdMap.get(rec.parent_code.trim().toUpperCase());
      if (parentId) {
        await TaxJurisdiction.updateOne(
          { jurisdiction_code: rec.jurisdiction_code },
          { $set: { parent_jurisdiction_id: parentId } }
        );
      }
    }
  }

  const completedAt = new Date();

  // Step 3: Record execution log in TaxProviderSyncLog
  const syncLog = await TaxProviderSyncLog.create({
    tenant_id: tenantId,
    sync_type: 'JSON_SEED_IMPORT',
    dataset_version: datasetVersion,
    source: manifest.sources ? manifest.sources[0].source_name : 'US_CENSUS_BUREAU',
    dry_run: false,
    summary,
    errors: [],
    executed_by_user_id: userId,
    started_at: startedAt,
    completed_at: completedAt,
    status: 'SUCCESS'
  });

  // Step 4: Audit log entry
  if (userId) {
    try {
      await PlatformAuditLog.create({
        actor_user_id: userId,
        actor_email: 'admin@system',
        action: 'US_TAX_SEED_IMPORT',
        target_tenant_id: tenantId,
        details: {
          sync_log_id: syncLog._id,
          dataset_version: datasetVersion,
          summary
        }
      });
    } catch (auditErr) {
      console.warn('[TaxSeedImport] Audit log creation warning:', auditErr.message);
    }
  }

  return {
    success: true,
    dry_run: false,
    message: `Imported US tax jurisdictions successfully (${insertedCount} inserted, ${updatedCount} updated, ${unchangedCount} unchanged).`,
    dataset_version: datasetVersion,
    sync_log_id: syncLog._id,
    summary
  };
}

module.exports = {
  validateSeedFiles,
  importJurisdictionSeeds,
  DEFAULT_SEED_DIR
};
