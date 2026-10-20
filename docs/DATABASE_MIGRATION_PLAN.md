# TallyVeridexERP — Database Migration & Multi-Company Backfill Plan

## 1. Scope & Objective

Phase 2 upgrades the data tier from single-entity-per-tenant to multi-company-per-tenant. This document details the schema changes, migration tooling (`companyMigrationTool.js`), dry-run analysis procedure, safety guards, and disaster recovery protocol.

---

## 2. Schema Evolutions Introduced in Phase 2

### 2.1 New Collections
1. **`companies` (`Company` model)**:
   - Primary attributes: `tenant_id`, `company_code`, `company_name`, `legal_name`, `business_profile`, `base_currency`, `country_code`, `timezone`, `locale`, `financial_year_start_month`, `status`, `is_legacy_default`.
   - Index: `{ tenant_id: 1, company_code: 1 }` (unique).
2. **`company_memberships` (`CompanyMembership` model)**:
   - Attributes: `tenant_id`, `company_id`, `user_id`, `status` (`ACTIVE`, `INVITED`, `SUSPENDED`), `is_default`, `joined_at`.
   - Index: `{ tenant_id: 1, company_id: 1, user_id: 1 }` (unique).

### 2.2 Altered Collections (Added `company_id` reference & compound index)
- **`user_roles`**: Added `company_id` (`ObjectId`, default: `null`). Unique index: `{ tenant_id: 1, company_id: 1, user_id: 1, role_id: 1 }`.
- **`ledger_accounts`**: Added `company_id`. Unique index: `{ tenant_id: 1, company_id: 1, account_code: 1 }`.
- **`fiscal_periods`**: Added `company_id`. Unique index: `{ tenant_id: 1, company_id: 1, period_name: 1 }`.
- **`journals`**: Added `company_id`. Unique index: `{ tenant_id: 1, company_id: 1, journal_number: 1 }`.
- **`journal_entries`**: Added `company_id`. Index: `{ tenant_id: 1, company_id: 1, ledger_account_id: 1 }`.
- **`parties`**: Added `company_id`. Unique index: `{ tenant_id: 1, company_id: 1, party_code: 1 }`.
- **`posting_rules`**: Added `company_id`. Unique index: `{ tenant_id: 1, company_id: 1, rule_code: 1, version: 1 }`.
- **`dimension_definitions`**: Added `company_id`. Unique index: `{ tenant_id: 1, company_id: 1, dimension_code: 1 }`.

---

## 3. Migration Tool Architecture (`companyMigrationTool.js`)

Located at: [`backend/src/utils/companyMigrationTool.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/utils/companyMigrationTool.js)

### 3.1 Safety Guarantees
1. **DRY-RUN by Default**: Executing without flags scans and analyzes the database, reporting unmigrated counts without modifying a single document.
2. **Production Lockout**: Applying migrations in `NODE_ENV === 'production'` or without `ENABLE_MIGRATION_APPLY === 'true'` throws a hard `MIGRATION_APPLY_BLOCKED` exception.
3. **Idempotency**: The script checks for pre-existing legacy companies before creating new ones; running the backfill repeatedly produces zero duplicate records and zero data mutations on subsequent passes.
4. **Zero Document Mutation**: Existing document IDs (`_id`), balances, journal lines, references, and timestamps are strictly preserved.

### 3.2 CLI Execution Commands

**Dry-Run Analysis (Read-Only Scan):**
```powershell
node src/utils/companyMigrationTool.js
```
*(Optionally scope to a single tenant: `node src/utils/companyMigrationTool.js --tenant=TENANT_CODE`)*

**Output Sample (Dry-Run):**
```json
{
  "mode": "DRY_RUN",
  "timestamp": "2026-10-20T17:45:00.000Z",
  "tenants_analyzed": 5,
  "total_unmigrated_records": 0,
  "total_records_updated": 0,
  "is_safe_to_apply": true,
  "tenants": [
    {
      "tenant_code": "TALLY_A",
      "tenant_name": "Tally Test Tenant A",
      "unmigrated_counts": {
        "ledger_accounts": 0,
        "fiscal_periods": 0,
        "journals": 0,
        "journal_entries": 0,
        "parties": 0,
        "posting_rules": 0,
        "dimensions": 0
      },
      "total_unmigrated": 0,
      "status": "ALREADY_MIGRATED"
    }
  ]
}
```

**Executing Migration (Controlled Apply Mode):**
*(Requires explicit safety environment variables)*
```powershell
$env:ENABLE_MIGRATION_APPLY="true"
node src/utils/companyMigrationTool.js --apply
```

---

## 4. Backfill Algorithm Execution Steps

When `--apply` is invoked with proper authorization:
1. **Tenant Iteration**: Scans all active tenants in the system.
2. **Count Unmigrated Records**: Measures documents where `{ tenant_id, company_id: null }`.
3. **Resolve or Create Legacy Company**:
   - Locates existing `Company` with `company_code: 'MAIN'` or `is_legacy_default: true`.
   - If absent, provisions a new primary company (`MAIN`) with `GENERAL_RETAIL` profile, copying the tenant's base currency and fiscal year settings.
4. **Member Provisioning**: Enrolls all existing active `TenantMembership` users into the legacy company with `is_default: true` and `status: 'ACTIVE'`.
5. **Atomic Field Association**: Updates `{ company_id: targetCompany._id }` on all unmigrated records across `ledger_accounts`, `fiscal_periods`, `journals`, `journal_entries`, `parties`, `posting_rules`, and `dimension_definitions`.
6. **Integrity Validation**: Verifies that no orphaned child documents remain and reports completion metrics.

---

## 5. Rollback & Disaster Recovery Strategy

1. **Versioned Backups**:
   - `TallyVeridexERP_backup_phase0`: Baseline prior to any architectural refactoring.
   - `TallyVeridexERP_backup_phase1`: Baseline containing Phase 1 security hardening.
2. **Reversibility**:
   - In the event of an unexpected backfill anomaly, all updated documents have an audit trail. Setting `company_id: null` on backfilled documents restores legacy single-tenant behavior if necessary.
   - No historical insurance collections or policy tables are modified by the migration tool.
