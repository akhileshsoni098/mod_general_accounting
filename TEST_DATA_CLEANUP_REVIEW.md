# TEST DATA CLEANUP REVIEW & INVENTORY REPORT
## Veridex One ERP — Read-Only Database Audit & Safe Remediation Plan

**Date:** October 2026  
**Target Database:** `veridex_Tally_Accounting_Akhilesh` (MongoDB Atlas)  
**Cluster:** `cluster0.8kh4syh.mongodb.net`  
**Audit Mode:** **STRICT READ-ONLY** (No database records were deleted, updated, or altered)  
**Test Database Isolation Status:** **ACTIVE & ENFORCED** in [`backend/src/config/db.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/config/db.js)

---

## 1. Executive Summary

During the final regression gate audit, it was discovered that previous test suite executions connected directly to the primary application database (`veridex_Tally_Accounting_Akhilesh`) rather than a physically separate test database. While the test suites maintained strict application-level multi-tenant isolation via dynamic tenant codes and compound `{ tenant_id, company_id }` indexing, test records persisted in the shared Atlas cluster.

This document provides a comprehensive, read-only inventory of all database records, establishes clear boundaries between test data and legitimate business data, and proposes a safe, verified cleanup plan for user review.

---

## 2. Test Database Isolation (Implemented Safeguard)

To prevent any further test records from being written to the primary application database:
1. **Fail-Fast Guard:** [`backend/src/config/db.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/config/db.js) now implements `resolveDatabaseUri()`. When `NODE_ENV=test`, the system strictly requires `TEST_MONGODB_URI`.
2. **No Silent Fallback:** Test execution throws a `[DatabaseConfigError]` immediately if `TEST_MONGODB_URI` is missing, empty, or points to the application database name (`veridex_Tally_Accounting_Akhilesh`).
3. **Safe Environment Template:** Documented `TEST_MONGODB_URI` placeholder in [`backend/.env.example`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/.env.example).
4. **Verified Unit Suite:** 11/11 tests pass in [`backend/tests/database_isolation_config.test.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/tests/database_isolation_config.test.js) without opening database connections.
5. **Current Status:** All write-capable integration suites are halted until the user configures a dedicated `TEST_MONGODB_URI` in their local environment.

---

## 3. Database Inventory: Categorization & Audit Findings

### 3.1 Known Legitimate Business & Demo Tenants (MUST PRESERVE)

These tenants represent official seed demo data and active commercial environments. They **MUST NOT** be modified or deleted.

| Tenant ID | Tenant Code | Legal Name | Creation Date | Companies | Ledger Accounts | Opening Balances | Stock Items |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `6ad8a4f203483013d2334a01` | **`APEX_TRADING`** | Apex Commercial Trading Enterprises Ltd | 2026-10-21 11:41:38 | 1 | 67 | 2 | 0 |
| `6ad79148dd5a31ddd40a267b` | **`LONEPINE_TRUCK`** | Lone Pine Trucking Insurance Ecosystem | 2026-10-20 16:05:28 | 1 | 40 | 0 | 0 |
| `6ad794539c27f18566c7e467` | **`G-TRAC`** | G-Trac Logistics & Fleet Systems | 2026-10-20 16:18:27 | 1 | 40 | 0 | 1 |

*Note: All 3 legitimate tenants have zero test-generated journals, commercial documents, or employees.*

---

### 3.2 Global Shared Catalogs (DO NOT DELETE)

The following collections contain shared system-wide schemas and catalogs that are independent of any single tenant:
- **`sec_permissions`**: 68 system permission definitions (e.g. `GL:VIEW`, `GL:POST`, `COMPANY:ADMIN`, `INVENTORY:VIEW`).
- **`sec_roles`**: 8 platform system roles (`PLATFORM_ADMIN`, `COMPANY_ADMIN`, `ACCOUNTANT`, `AUDITOR`, `OPERATOR`, etc.).

---

### 3.3 High-Confidence Test Records (184 Candidate Test Tenants)

The following tenant groups match exact automated test suite fixtures and dynamic test runs:

| Test Prefix / Pattern | Originating Test Suite | Tenant Count | Associated Child Record Profile | Confidence Level |
| :--- | :--- | :---: | :--- | :---: |
| `TNT_17928*` | `erp_extended_modules.test.js` | 12 | Companies, Extended Modules (Assets, Cheques, TDS, Job Work, Landed Costs, Payroll) | **HIGH (100%)** |
| `TALLY_T_*` | `tally_coa_and_opening_balances.test.js` | 7 | Tally Groups, Opening Balance Setups, Reference Journals | **HIGH (100%)** |
| `TALLY_A_*` / `TALLY_B_*` | `company_lifecycle_and_isolation.test.js` | 46 | Isolated Tenant Pairs, RBAC Memberships, General Ledger accounts | **HIGH (100%)** |
| `COMM_T_A_*` / `COMM_T_B_*` | `commercial_transactions_and_gl.test.js` | 32 | Commercial Invoices, Bill Allocations, Stock Valuation Journals | **HIGH (100%)** |
| `INV_T_A_*` / `INV_T_B_*` | `inventory_foundation_and_isolation.test.js` | 32 | Godowns, Stock Items, Stock Movements, Packaging UOMs | **HIGH (100%)** |
| `TEN_CFG_*` | `configurable_erp_modules.test.js` | 21 | Dynamic Module Toggles, Commission Rules, Preset Companies | **HIGH (100%)** |
| `TEN_IND_*` | `industry_modules_and_platform_e2e.test.js` | 12 | POS Shifts, Restaurant KOTs, Guest Folios, Work Orders | **HIGH (100%)** |
| `T_AUDIT_*` / `T_ISOL_*` | `full_api_audit.test.js` & Acceptance Suites | 22 | Security and Audit Sandbox records | **HIGH (100%)** |
| **TOTAL TEST CANDIDATES** | | **184** | | |

#### Actual Child Records Associated with the 184 High-Confidence Test Tenants:
- **`companies`**: 325 test company instances (e.g., `MAIN`, `RET01`, `SEC01`).
- **`ledger_accounts`**: 16,413 test account records (seeded Tally COA trees for isolated test companies).
- **`journals` & `journal_entries`**: 355 test journals, 935 individual debit/credit entry lines.
- **`commercial_documents`**: 186 test purchase bills, sales invoices, and debit notes.
- **`stock_items` & `stock_movements`**: 188 stock items, 214 movement records.
- **`opening_balance_setups`**: 12 opening balance test setups.
- **`landed_cost_allocations`**: 5 landed cost allocation documents.
- **`cheque_register`**: 9 cheque register records.
- **`fixed_assets`**: 9 fixed asset records.
- **`job_work_orders`**: 8 subcontracting orders.
- **`employees` & `payroll_runs`**: 9 employee records, 9 payroll run batches.
- **`tds_deductions`**: 8 statutory TDS deduction records.

---

### 3.4 Forensic Reconciliation: Resolving the "15 vs 3" Discrepancy

An earlier preliminary audit reported *15 legitimate/seed tenants, including 12 legacy demo setups*, whereas the subsequent audit identified *3 legitimate tenants and 184 test tenants*. 

#### 1. Root Cause of the Discrepancy:
The preliminary audit script used a regex prefix match:
```javascript
const testPrefixRegex = /^(TALLY_|INV_|COMM_|TEN_|T_|TEST_|SEC_|RET)/i;
```
Because `T_` required an underscore immediately following `T`, it successfully matched `T_AUDIT_*` (22) and `TALLY_*` (53), but **failed to match** `TNT_17928*` (12 tenants). Consequently, those 12 `TNT_` tenants were excluded from the test-tenant bucket and placed in the "non-test" bucket alongside the 3 legitimate demo tenants, creating the reported count of `15` (3 legitimate + 12 unclassified).

#### 2. Forensic Investigation of the 12 Individual `TNT_` Tenants:
Inspection of [`backend/tests/erp_extended_modules.test.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/tests/erp_extended_modules.test.js#L98) shows:
```javascript
tenant_code: `TNT_${runId}`,
tenant_name: `Extended ERP Enterprise ${runId}`,
admin_email: `admin_ext_${runId}@veridexerp.com`,
```
where `runId = Date.now()`. Every single one of the 12 `TNT_` tenants in MongoDB matches this exact code and creation timestamp from the test executions on October 24, 2026:

| Tenant ObjectId | Tenant Code | Tenant Name | Creation Timestamp (UTC) | Child Record Profile |
| :--- | :--- | :--- | :--- | :--- |
| `6adc82665f1a934b3edb2609` | `TNT_1792836180910` | Extended ERP Enterprise 1792836180910 | 2026-10-24 10:03:18 | 1 company, 67 accounts (early aborted test step) |
| `6adc8414eb37ef61ae98cb93` | `TNT_1792836613074` | Extended ERP Enterprise 1792836613074 | 2026-10-24 10:10:28 | 1 company, 67 accounts (early aborted test step) |
| `6adc8543d9abc6677c5587c5` | `TNT_1792836917580` | Extended ERP Enterprise 1792836917580 | 2026-10-24 10:15:31 | 2 companies, 140 accounts, 4 journals, 1 cheque, 1 asset |
| `6adc862ed1f37c315a6f01bd` | `TNT_1792837152673` | Extended ERP Enterprise 1792837152673 | 2026-10-24 10:19:26 | 2 companies, 142 accounts, 7 journals, 2 comm docs, 1 TDS |
| `6adc86b81e6ac80764c4b733` | `TNT_1792837289612` | Extended ERP Enterprise 1792837289612 | 2026-10-24 10:21:44 | 2 companies, 142 accounts, 7 journals, 2 comm docs, 1 TDS |
| `6adc8731cbcededefca147cc` | `TNT_1792837407984` | Extended ERP Enterprise 1792837407984 | 2026-10-24 10:23:45 | 2 companies, 142 accounts, 8 journals, 2 comm docs, 1 landed cost |
| `6adc8b358119f4e5f8f7c946` | `TNT_1792838439384` | Extended ERP Enterprise 1792838439384 | 2026-10-24 10:40:53 | 2 companies, 142 accounts, 8 journals, 2 comm docs, 1 landed cost |
| `6adc908b18f09cb8c82a90a9` | `TNT_1792839803934` | Extended ERP Enterprise 1792839803934 | 2026-10-24 11:03:39 | 2 companies, 142 accounts, 7 journals, 1 comm doc, 1 TDS |
| `6adc96ffd731b19395168526` | `TNT_1792841456758` | Extended ERP Enterprise 1792841456758 | 2026-10-24 11:31:11 | 2 companies, 142 accounts, 8 journals, 2 comm docs, 1 landed cost |
| `6adca9cb4e42b6218eacd6c7` | `TNT_1792841679461` | Extended ERP Enterprise 1792841679461 | 2026-10-24 12:51:23 | 0 companies (registration only test step) |
| `6adcb0d2f33bacb999360ad0` | `TNT_1792848053512` | Extended ERP Enterprise 1792848053512 | 2026-10-24 13:21:22 | 2 companies, 142 accounts, 8 journals, 2 comm docs, 1 landed cost |
| `6adcb41f893982a59540990c` | `TNT_1792848906370` | Extended ERP Enterprise 1792848906370 | 2026-10-24 13:35:27 | 2 companies, 142 accounts, 8 journals, 2 comm docs, 1 landed cost |

**Conclusion of Investigation:**  
None of these 12 records are legacy demo setups. They are 100% automated test fixtures generated by consecutive runs of `erp_extended_modules.test.js`. Reclassifying them into the test tenant count reconciles the database inventory completely:
- **Legitimate Business / Demo Tenants:** **3** (`APEX_TRADING`, `LONEPINE_TRUCK`, `G-TRAC`)
- **Automated Test Tenant Candidates:** **184** (172 previously matched + 12 `TNT_` tenants)
- **Total Tenants in Database:** **187** (3 legitimate + 184 test)
- **Unresolved / Ambiguous Tenants:** **0**

---

## 4. Impact Analysis on Ordinary User Screens & Reports

1. **General Ledger & Financial Statements (ZERO IMPACT):**
   - In Veridex One, every single financial query, trial balance calculation, balance sheet report, and ledger transaction strictly requires an authenticated session context with `{ tenant_id, company_id }` compound index scoping.
   - Cross-tenant queries are blocked at both the router/middleware level and service level.
   - The accounts and financial statements of `APEX_TRADING` are **100% mathematically insulated** from all test records.
2. **Platform Superadmin Directory (LOW IMPACT):**
   - The platform superadmin global listing endpoint (`GET /api/v1/platform/tenants`) reflects the full tenant count. Cleaning test records will restore this directory to only legitimate organizations.
3. **Storage & Performance:**
   - The Atlas cluster is currently carrying ~16,000 test documents across secondary collections. Removing them will optimize database storage and index memory.

---

## 5. Safe Proposed Cleanup Plan (FOR USER REVIEW & APPROVAL)

> [!CAUTION]
> **STRICT SAFETY RULE:** This cleanup plan is presented for review only. It will NOT be executed without explicit user instruction. No deletion scripts have been executed.

### Phase 1: Pre-Cleanup Backup & Export
Before any mutation:
1. Run a MongoDB Atlas cloud snapshot backup or execute `mongodump` targeting `veridex_Tally_Accounting_Akhilesh`.
2. Export the candidate test tenant records to an offline JSON archive for recovery assurance.

### Phase 2: Explicit ID Whitelist & Targeted Deletion
1. Compile the explicit list of **184 ObjectIds** for test tenants (derived from the verified test pattern matches).
2. Explicitly whitelist and exclude `APEX_TRADING`, `LONEPINE_TRUCK`, and `G-TRAC`.
3. In a single atomic script with dry-run verification:
   - Delete records in dependent child collections matching `{ tenant_id: { $in: targetTestTenantIds } }`:
     - `companies`
     - `app_users` (test admin users only)
     - `company_memberships`
     - `ledger_accounts`
     - `journals` & `journal_entries`
     - `commercial_documents` & `bill_allocations`
     - `stock_items`, `stock_balances`, & `stock_movements`
     - `employees`, `salary_structures`, & `payroll_runs`
     - `fixed_assets`, `job_work_orders`, `cheque_register`, `tds_deductions`
     - `opening_balance_setups`, `landed_cost_allocations`, `price_lists`, `interest_rules`
   - Delete the 184 records from `tenant_masters` matching `{ _id: { $in: targetTestTenantIds } }`.
4. Verify `sec_permissions` and `sec_roles` remain untouched.
5. Re-run read-only verification to confirm only legitimate tenants remain.

---

## 6. Prerequisite to Rerunning Write-Capable Integration Suites

Do NOT rerun the 9 integration test suites until the following manual step is completed:

1. Create a dedicated, physically isolated MongoDB database (e.g. `veridex_finance_test` on Atlas or `mongodb://localhost:27017/veridex_finance_test`).
2. Add `TEST_MONGODB_URI` to your local `backend/.env`:
   ```bash
   TEST_MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/veridex_finance_test?retryWrites=true&w=majority
   ```
3. Once configured, running any test suite with `NODE_ENV=test` will write exclusively to `veridex_finance_test`, keeping the primary application database 100% pristine.
