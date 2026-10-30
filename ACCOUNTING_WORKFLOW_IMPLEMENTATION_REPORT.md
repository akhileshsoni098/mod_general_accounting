# TALLY-STYLE CHART OF ACCOUNTS, OPENING BALANCES & JOURNAL WORKFLOW
## Implementation & Verification Report — Veridex One ERP

**Date:** October 2026  
**Repository:** `c:\Users\AkhileshSoni\Desktop\veridexoneDoc\TallyVeridexERP`  
**Status:** **COMPLETE & VERIFIED**  
**Automated Tests:** 7/7 PASSED (100%)  
**Frontend Build:** SUCCESS (0 errors)

---

## 1. Executive Summary

In accordance with the gap analysis documented in [`ACCOUNTING_WORKFLOW_GAP_ANALYSIS.md`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/ACCOUNTING_WORKFLOW_GAP_ANALYSIS.md), we have implemented a complete, production-grade **TallyPrime-style Chart of Accounts (COA) group hierarchy, opening balance workflow, searchable master selectors, and invoice reference traceability** in Veridex One ERP.

### Key Capabilities Delivered:
1. **Configurable 3-Tier Accounting Hierarchy:**  
   15 Tally standard Primary Groups, 13 Subgroups, and 28 standard posting ledgers automatically seeded per tenant and company. Group nodes act strictly as non-posting summary accounts (`is_posting_allowed: false`).
2. **Cycle-Safe Account Hierarchy:**  
   Backend cycle detection in `updateAccount` prevents any account from selecting itself or any of its descendants as a parent.
3. **Double-Entry Opening Balances Workflow:**  
   - Dedicated draft setup model ([`OpeningBalanceSetup`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/models/OpeningBalanceSetup.js)) allowing iterative entry without mutating GL balances.
   - Strict equilibrium validation (`Total Debits === Total Credits`) via `BigNumber.js`.
   - Authorized suspense routing into account `9999` (Opening Balance Suspense Account under `GRP-SUSPENSE`) when migrations are unbalanced.
   - Atomic double-entry journal posting with `source_module: 'OPENING_BALANCE'`, guaranteeing zero double-counting across Trial Balance, General Ledger, and Balance Sheet.
4. **Universal `SearchableDropdown` Component:**  
   High-performance typeahead dropdown supporting keyboard navigation (Up/Down/Enter/Escape), grouping by account type, and badge indicators explaining why non-posting summary groups cannot be posted to.
5. **Traceable Invoice Reference Semantics:**  
   Manual journals support linking directly to posted commercial invoices with `REFERENCE_ONLY` semantics—storing `commercial_document_id` and `reference_document_number` for audit trails without altering the invoice's `balance_due`.

---

## 2. Architecture & Data Model Enhancements

### 2.1 Backend Models
- **[`LedgerAccount.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/models/LedgerAccount.js):**
  - `is_group` (Boolean, default: false)
  - `group_type` (Enum: `['PRIMARY_GROUP', 'SUBGROUP', 'LEDGER']`, default: `'LEDGER'`)
  - `opening_balance` (Decimal128, default: 0.00)
  - `opening_balance_type` (Enum: `['DEBIT', 'CREDIT']`)
  - `opening_balance_date` (Date)
- **[`Journal.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/models/Journal.js):**
  - Added `'OPENING_BALANCE'` to `source_module` enum.
  - `commercial_document_id` (ObjectId, ref: `CommercialDocument`)
  - `reference_type` (Enum: `['NONE', 'REFERENCE_ONLY', 'INVOICE_ADJUSTMENT', 'SETTLEMENT']`)
  - `reference_document_number` (String)
- **[`OpeningBalanceSetup.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/models/OpeningBalanceSetup.js) (NEW):**
  - Tracks draft lines per company and financial year (`financial_year`, `as_of_date`, `lines`, `total_debit`, `total_credit`, `difference`, `allow_suspense`, `suspense_account_id`, `status: ['DRAFT', 'READY_TO_POST', 'POSTED']`, `posted_journal_id`).

### 2.2 Standard Tally COA Seeder ([`seedCoa.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/utils/seedCoa.js))
- **15 Standard Primary Groups:**
  `GRP-CAPITAL`, `GRP-CURR-ASSET`, `GRP-CURR-LIAB`, `GRP-FIXED-ASSET`, `GRP-INVESTMENT`, `GRP-LOANS-LIAB`, `GRP-SUSPENSE`, `GRP-MISC-EXP`, `GRP-BRANCH-DIV`, `GRP-SALES`, `GRP-PURCHASE`, `GRP-DIR-INCOME`, `GRP-INDIR-INCOME`, `GRP-DIR-EXP`, `GRP-INDIR-EXP`.
- **13 Standard Subgroups:**
  `SUB-RESERVES`, `SUB-BANK-ACC`, `SUB-CASH-IN-HAND`, `SUB-STOCK-IN-HAND`, `SUB-SUNDRY-DEBTORS`, `SUB-DEPOSITS-ASSET`, `SUB-LOANS-ADV`, `SUB-DUTIES-TAXES`, `SUB-SUNDRY-CREDITORS`, `SUB-PROVISIONS`, `SUB-BANK-OD`, `SUB-SECURED-LOANS`, `SUB-UNSECURED-LOANS`.
- **Posting Ledgers:**
  28 standard commercial ERP posting accounts (e.g., `1001 Cash in Hand`, `1002 Primary Bank Account`, `1101 Sundry Debtors`, `2001 Sundry Creditors`, `9999 Opening Balance Suspense Account`) mapped cleanly to their parent subgroups.

---

## 3. Business Services & Controllers

### 3.1 Opening Balance Engine ([`openingBalanceService.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/services/openingBalanceService.js))
- `getOpeningBalanceSetup(tenantId, companyId, financialYear)`: Fetches existing draft setup or initializes one from active posting accounts.
- `saveOpeningBalanceDraft(tenantId, companyId, data)`: Validates inputs with `BigNumber.js`, checks that single accounts do not have simultaneous Dr/Cr entries, computes equilibrium difference, and updates draft without mutating general ledger balances.
- `postOpeningBalanceSetup(tenantId, companyId, options)`: Enforces equilibrium or validates authorized suspense account; calls `postJournalEntry` atomically with `source_module: 'OPENING_BALANCE'`; marks the setup as `'POSTED'` and locks it against duplicate posting.

### 3.2 Journal Posting Validation ([`journalPostingService.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/services/journalPostingService.js))
- Enforces `if (acc.is_posting_allowed === false)` -> throws `Account "${code}" (${acc.account_name}) is a summary/parent header and does not allow direct postings`.
- Persists `commercial_document_id`, `reference_type`, and `reference_document_number` on the posted `Journal`.

### 3.3 GL Controller Enhancements ([`glController.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/controllers/glController.js))
- `getAccounts`: Added query filters for `groups_only=true`, `is_posting_allowed=true/false`, and `is_group=true/false`; automatically populates `parent_account_id`.
- `createAccount`: Resolves parent group, sets `is_group`, `group_type`, and `is_posting_allowed`, and records initial opening balance.
- `updateAccount`: Implemented recursive ancestor tree traversal preventing cycles (`cannot be its own parent`, `Cyclic parent relationship detected`).
- `getOpeningBalances`, `saveOpeningBalancesDraft`, `postOpeningBalances`: Registered at `/api/v1/gl/opening-balances`.

---

## 4. Frontend Experience

### 4.1 Searchable Master Selector ([`SearchableDropdown.jsx`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/frontend/src/components/SearchableDropdown.jsx))
- Full typeahead searching with instant filtering across code, name, and category.
- Keyboard navigation: ArrowUp, ArrowDown, Enter, and Escape.
- Visually categorizes options by type (e.g., ASSET, LIABILITY, EQUITY).
- Disables non-posting summary groups with an informative badge (`Summary Group - No Direct Posting`) while keeping them visible for hierarchical reference.

### 4.2 GL Workspace Enhancements ([`GLWorkspacePage.jsx`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/frontend/src/pages/GLWorkspacePage.jsx))
- **Chart of Accounts Tab:**
  - View Switcher: **Tree View** vs **Flat Table**.
  - Tree View features collapsible groups with expand/collapse-all controls, indentation, folder icons, and group classification badges.
  - Columns show Normal Balance, Posting Status, and Master Opening Balance.
- **Opening Balances Tab (NEW):**
  - 4 KPI Status Cards: Total Debit, Total Credit, Difference, and Setup Status (`DRAFT` / `READY_TO_POST` / `POSTED`).
  - Financial Year selector and search filter.
  - Live recalculation of equilibrium as amounts are keyed into debit or credit inputs.
  - One-click Suspense Account allocation toggle.
  - "Save Draft" and "Post Opening Journal" buttons with locked read-only state once posted.
- **Journal Entry Modal:**
  - Integrated `SearchableDropdown` on every line.
  - Commercial invoice reference typeahead selector linking directly to posted sales/purchase documents with `REFERENCE_ONLY` tag.
- **Account Creation Modal:**
  - Toggle between **Posting Ledger** and **Account Group**.
  - Parent group selection via `SearchableDropdown`.
  - Opening balance and Dr/Cr selector for posting accounts.

---

## 5. Automated Verification & Quality Assurance

### 5.1 Test Suite: [`tests/tally_coa_and_opening_balances.test.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/tests/tally_coa_and_opening_balances.test.js)

```bash
✔ 1. Setup: Register Tenant and verify standard Tally Chart of Accounts hierarchy (23205.74ms)
✔ 2. Query Filters: groups_only and is_posting_allowed filters in getAccounts (844.2159ms)
✔ 3. Account Creation: Create subgroup, posting account, and assert cycle detection (1448.916ms)
✔ 4. Direct Posting Enforcement: Reject direct journal postings to non-posting summary groups (84.8023ms)
✔ 5. Opening Balance Workflow: Draft setup, equilibrium validation, and atomic posting (2625.1669ms)
✔ 6. Suspense Allocation: Handle unbalanced opening balance via authorized Suspense account (8404.2342ms)
✔ 7. Invoice Reference Traceability: Manual journal referencing commercial invoice with REFERENCE_ONLY mode (740.0752ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 38986.6258
```

### 5.2 Security Regression Suite
```bash
✔ 16/16 security regression tests passed (0 failures).
```

### 5.3 Frontend Production Build
```bash
vite v5.4.21 building for production...
✓ 1500 modules transformed.
dist/index.html                   0.82 kB │ gzip:   0.48 kB
dist/assets/index-CQH1A6Zk.css   53.85 kB │ gzip:   9.06 kB
dist/assets/index-w02e7eOC.js   736.84 kB │ gzip: 148.22 kB
✓ built in 2.33s
```

---

## 6. Files Changed & Added

| Component | Path | Action | Description |
| :--- | :--- | :--- | :--- |
| **Model** | [`backend/src/models/LedgerAccount.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/models/LedgerAccount.js) | Modified | Added `is_group`, `group_type`, `opening_balance`, `opening_balance_type`, `opening_balance_date` |
| **Model** | [`backend/src/models/Journal.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/models/Journal.js) | Modified | Added `OPENING_BALANCE` enum, `commercial_document_id`, `reference_type`, `reference_document_number` |
| **Model** | [`backend/src/models/OpeningBalanceSetup.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/models/OpeningBalanceSetup.js) | Created | Draft setup tracking, equilibrium differences, suspense allocation, posted journal link |
| **Seeder** | [`backend/src/utils/seedCoa.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/utils/seedCoa.js) | Modified | 15 Primary groups, 13 subgroups, 28 posting accounts, `9999` Opening Balance Suspense |
| **Service** | [`backend/src/services/openingBalanceService.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/services/openingBalanceService.js) | Created | Draft balance management, equilibrium validation, atomic posting engine |
| **Service** | [`backend/src/services/journalPostingService.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/services/journalPostingService.js) | Modified | Non-posting group rejection, invoice reference field persistence |
| **Controller** | [`backend/src/controllers/glController.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/controllers/glController.js) | Modified | Account cycle detection, `groups_only`/`is_posting_allowed` query filters, opening balance APIs |
| **Routes** | [`backend/src/routes/glRoutes.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/routes/glRoutes.js) | Modified | Mounted `/api/v1/gl/opening-balances` endpoints |
| **Component** | [`frontend/src/components/SearchableDropdown.jsx`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/frontend/src/components/SearchableDropdown.jsx) | Created | Reusable typeahead selector with keyboard navigation and non-posting group disabling |
| **Page** | [`frontend/src/pages/GLWorkspacePage.jsx`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/frontend/src/pages/GLWorkspacePage.jsx) | Modified | COA Tree View, Opening Balances Tab, Searchable dropdown in Journals & Accounts modals |
| **API Client** | [`frontend/src/services/api.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/frontend/src/services/api.js) | Modified | Added opening balance endpoints and query params to `getAccounts` |
| **Test** | [`backend/tests/tally_coa_and_opening_balances.test.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/tests/tally_coa_and_opening_balances.test.js) | Created | 7 automated end-to-end regression tests verifying all Phase 2 requirements |
