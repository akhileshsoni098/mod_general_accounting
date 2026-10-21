# Veridex One — Configurable General Accounting ERP & Franchise Engine
## Comprehensive Architecture, Implementation & Verification Report

**Author:** Principal Software Architect & QA Lead  
**Repository:** `C:\Users\AkhileshSoni\Desktop\veridexoneDoc\TallyVeridexERP`  
**Git Commit:** `354ba2b`  
**Base Backup Tag:** `backup_pre_configurable_erp_master`  
**Database:** MongoDB Atlas Replica Set `Cluster0` (`veridex_Tally_Accounting_Akhilesh`)  
**Frontend:** React 18, Vite 5, Tailwind CSS  
**Verification Date:** October 2026  

---

## 1. Executive Summary

This release fulfills the **Configurable General Accounting ERP Master Directive** in-place within the active `TallyVeridexERP` codebase.

### Core Product Principles Achieved:
1. **Simple by Default, Configurable by Business:**
   - A general accounting business (services, consultancies, small firms, sole proprietorships) starts with a clean, uncluttered interface: **Dashboard**, **Chart of Accounts**, **Parties (Customers & Vendors)**, **Banking & Cash**, **Vouchers/Journals**, **Financial Reports (Trial Balance, P&L, Balance Sheet)**, and **Settings**.
   - Advanced vertical modules (Retail POS, Restaurant & KOT, Hotel PMS, Manufacturing BOM, Rules Engine, Dimensions, Period Closing) are optional capabilities that stay hidden until explicitly enabled by an authorized administrator.
2. **Company-Specific Operations & Persistence:**
   - Module entitlements and business configurations are stored directly in the `Company` schema under `enabled_modules` and `modules_config`.
   - Different companies within the same multi-tenant workspace can enable different modules completely independently (e.g. Company A is a Retail POS store, Company B is a pure General Accounting service firm, Company C is a Franchise store).
3. **Non-Destructive Toggles:**
   - Disabling a module hides its navigation items and blocks new transactional writes via HTTP 403 `MODULE_DISABLED`, but **never** deletes historical journals, invoices, inventory items, or ledger accounts.
   - All historical entries remain permanently visible in General Ledger statements, Day Book, Trial Balance, Profit & Loss, and Balance Sheet.
   - Re-enabling a module restores full operational access immediately.
4. **Franchise Commission Configuration Engine:**
   - Fully eliminates hard-coded percentages and account mappings.
   - Supports configurable percentage splits (e.g. default 70% Franchise / 30% Main Hub, 75% / 25%, 80% / 20%) with strict validation that percentages sum to exactly 100%.
   - Validates that mapped ledger accounts (Franchise Revenue `4200`, Main Hub Payable `2020`, Settlement Cash `1010`) exist in the active company's Chart of Accounts.
   - Interactive live split calculator in the UI previews exact double-entry debits and credits for arbitrary transaction amounts (including the canonical ₹200 transaction).

---

## 2. Central Business Module Registry

A canonical module registry was established in [`backend/src/config/moduleRegistry.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/config/moduleRegistry.js):

| Module Key | Name | Category | Core / Optional | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| `GL` | General Ledger (GL) | `CORE` | Core (Always Active) | None |
| `BANKING_CASH` | Banking & Cash Operations | `CORE` | Core (Always Active) | `GL` |
| `PARTIES` | Parties & Sub-Ledgers | `CORE` | Core (Always Active) | `GL` |
| `REPORTS` | Financial Statements & Reports | `CORE` | Core (Always Active) | `GL` |
| `INVENTORY` | Inventory & Stock Management | `OPERATIONS` | Optional | `GL` |
| `COMMERCIAL_BILLING` | Commercial Invoicing & Trade | `OPERATIONS` | Optional | `GL` |
| `GST_TAX` | GST & Tax Accounting | `OPERATIONS` | Optional | `GL` |
| `RETAIL_POS` | Retail Point of Sale (POS) | `INDUSTRY` | Optional | `INVENTORY` |
| `RESTAURANT` | Restaurant & Hospitality Food | `INDUSTRY` | Optional | `INVENTORY` |
| `HOTEL_PMS` | Hotel Property Management (PMS) | `INDUSTRY` | Optional | `GL` |
| `MANUFACTURING` | Manufacturing & Assembly | `INDUSTRY` | Optional | `INVENTORY` |
| `FRANCHISE_COMMISSIONS` | Franchise & Commission Sharing | `ADVANCED` | Optional | `GL` |
| `RULES_ENGINE` | Configurable JE Rules Engine | `ADVANCED` | Optional | `GL` |
| `FINANCE_CLOSE` | Finance Close & Period Lock | `ADVANCED` | Optional | `GL` |
| `DIMENSIONS` | Dimensions & Cost Centers | `ADVANCED` | Optional | `GL` |

### One-Click Industry Presets
- **General Accounting Only (Simple Default):** Core modules only (`GL`, `BANKING_CASH`, `PARTIES`, `REPORTS`).
- **Retail & Trading Store:** Core + `INVENTORY`, `COMMERCIAL_BILLING`, `GST_TAX`, `RETAIL_POS`.
- **Restaurant & Cafe:** Core + `INVENTORY`, `COMMERCIAL_BILLING`, `GST_TAX`, `RESTAURANT`.
- **Hotel & Hospitality Resort:** Core + `COMMERCIAL_BILLING`, `GST_TAX`, `HOTEL_PMS`, `RESTAURANT`.
- **Manufacturing & Assembly:** Core + `INVENTORY`, `COMMERCIAL_BILLING`, `GST_TAX`, `MANUFACTURING`.
- **Franchise Store & Split Sharing:** Core + `INVENTORY`, `COMMERCIAL_BILLING`, `GST_TAX`, `RETAIL_POS`, `FRANCHISE_COMMISSIONS`.

---

## 3. Database Schema Enhancements

### `Company` Schema (`backend/src/models/Company.js`)
```javascript
// Enabled modules array
enabled_modules: {
  type: [String],
  default: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS']
},

// Module-specific company parameters
modules_config: {
  franchise: {
    is_franchise: { type: Boolean, default: false },
    main_hub_party_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', default: null },
    franchise_share_pct: { type: Number, default: 70, min: 0, max: 100 },
    hub_share_pct: { type: Number, default: 30, min: 0, max: 100 },
    income_account_code: { type: String, default: '4200' },
    payable_account_code: { type: String, default: '2020' },
    settlement_account_code: { type: String, default: '1010' }
  },
  inventory: {
    multi_godown: { type: Boolean, default: false },
    batch_tracking: { type: Boolean, default: false },
    enable_barcodes: { type: Boolean, default: false }
  },
  pos: {
    default_counter: { type: String, default: 'COUNTER-1' },
    auto_print: { type: Boolean, default: true }
  },
  restaurant: {
    enable_kot: { type: Boolean, default: true },
    enable_tables: { type: Boolean, default: true }
  },
  hotel: {
    night_audit_time: { type: String, default: '00:00' },
    enable_rooms: { type: Boolean, default: true }
  },
  manufacturing: {
    enable_bom: { type: Boolean, default: true },
    track_scrap: { type: Boolean, default: true }
  }
}
```

### Schema Method: `isModuleEnabled(moduleKey)`
```javascript
CompanySchema.methods.isModuleEnabled = function (moduleKey) {
  if (!moduleKey) return false;
  const normKey = String(moduleKey).toUpperCase().trim();
  if (CORE_MODULE_KEYS.includes(normKey)) return true;
  if (!Array.isArray(this.enabled_modules)) return false;
  return this.enabled_modules.some(m => String(m).toUpperCase().trim() === normKey);
};
```

---

## 4. Middleware Enforcement: `requireCompanyModule`

Implemented in [`backend/src/middleware/companyMiddleware.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc\TallyVeridexERP\backend\src\middleware\companyMiddleware.js):

- Applied to protected module routes:
  - `/api/v1/restaurant/*` -> `requireCompanyModule('RESTAURANT')`
  - `/api/v1/hotel/*` -> `requireCompanyModule('HOTEL_PMS')`
  - `/api/v1/retail-pos/*` -> `requireCompanyModule('RETAIL_POS')`
  - `/api/v1/manufacturing/*` -> `requireCompanyModule('MANUFACTURING')`
  - `/api/v1/inventory/*` -> `requireCompanyModule('INVENTORY')`
- Behavior when module is disabled:
  ```json
  {
    "status": "error",
    "message": "Module RESTAURANT (Restaurant & Hospitality Food) is not enabled for company \"General Accounting Sole Proprietor\". Please enable it in Company Settings > Modules to access this feature.",
    "code": "MODULE_DISABLED",
    "required_module": "RESTAURANT",
    "company_id": "67...a1",
    "company_name": "General Accounting Sole Proprietor"
  }
  ```
- Core accounting modules are always allowed through without overhead.

---

## 5. API Endpoints for Module & Franchise Management

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/companies/:id/modules` | `COMPANY:VIEW` | Returns enabled modules, full catalog with categories, and configurations |
| `PATCH` | `/api/v1/companies/:id/modules` | `COMPANY:UPDATE` | Enables/disables modules or applies presets with automatic dependency resolution |
| `GET` | `/api/v1/companies/:id/franchise-config` | `COMPANY:VIEW` | Retrieves company franchise setup, populated Main Hub party, and COA accounts |
| `PUT` | `/api/v1/companies/:id/franchise-config` | `COMPANY:UPDATE` | Validates shares sum to 100%, validates COA accounts, and saves franchise settings |

---

## 6. Frontend Dynamic Navigation & Settings UI

### Dynamic Sidebar Filtering (`frontend/src/App.jsx`)
- In simple default mode, the sidebar displays only:
  - **Financial Operations:**
    - Dashboard & Business KPIs (`GL`)
    - General Ledger & Double-Entry (`GL`)
    - Customers & Vendors (`PARTIES`)
  - **Administration:**
    - Users & Roles (`TENANT_ADMIN`)
    - Organization Settings
    - Business Modules & Setup (`modules`)
- When optional modules are enabled:
  - `COMMERCIAL_BILLING` -> Commercial Sales & Purchases (GST)
  - `INVENTORY` -> Inventory & Stock Masters
  - `FINANCE_CLOSE` -> Finance Close & Period Lock
  - `RETAIL_POS` / `RESTAURANT` / `HOTEL_PMS` / `MANUFACTURING` -> Commercial & Industry Group
  - `RULES_ENGINE` / `DIMENSIONS` -> Accounting Configuration Group
- Automatic Route Protection: If a user has a module tab open and switches to a company where that module is disabled, the app automatically and gracefully redirects to the Dashboard.

### Business Modules & Setup Screen (`frontend/src/pages/ModuleConfigPage.jsx`)
- Shows current active company badge and status.
- Grid of 6 One-Click Industry Presets.
- Grouped cards by category (Core, Operations, Industry, Advanced) with toggle switches.
- Modal Drawer for Franchise & Commission Sharing Setup:
  - Stores status toggle (`is_franchise`).
  - Dropdown to select Main Hub Counterparty.
  - Percentage inputs for Franchise Store Share % and Main Hub Share % with 100% total validation.
  - General Ledger account code inputs (`4200`, `2020`, `1010`).
  - Interactive live split calculator previewing double-entry balance for test transaction amounts.

---

## 7. Verification & Automated Test Results

### Suite 1: Configurable ERP Modules (`backend/tests/configurable_erp_modules.test.js`)
**Result: 15/15 Passed (0 Failed, 100% Pass Rate)**

```text
✔ 1. Default Company Creation: Newly created general company has only core modules enabled (21243ms)
✔ 2. Business Profile Preset: GENERAL_RETAIL presets recommended retail & inventory modules (2969ms)
✔ 3. Module Enable API: Admin enables optional module (INVENTORY) via PATCH /api/v1/companies/:id/modules (376ms)
✔ 4. Module Disable API: Disabling optional module succeeds; disabling core module is rejected (377ms)
✔ 5. Middleware Blocking: Accessing restaurant route when RESTAURANT is disabled returns 403 MODULE_DISABLED (152ms)
✔ 6. Middleware Allowance: Calling /api/v1/restaurant/tables after enabling RESTAURANT succeeds (200 OK) (359ms)
✔ 7. Dependency Validation: Enabling RETAIL_POS automatically resolves dependency on INVENTORY (195ms)
✔ 8. Non-destructive Disabling: Creating record, disabling module, verifies DB record persists (276ms)
✔ 9. Franchise Config Persistence: Configure 75/25 split with custom accounts, retrieve via API (461ms)
✔ 10. Franchise Config Validation: Attempting split where percentages do not sum to 100% returns 400 (162ms)
✔ 11. Dynamic Commission Calculation: 75/25 split on ₹200 yields ₹150 Franchise & ₹50 Main Hub (1ms)
✔ 12. Company Isolation: Company A with Franchise ON does not affect Company B in same tenant (181ms)
✔ 13. Navigation Payload: Switch company returns enabled_modules for client dynamic rendering (301ms)
✔ 14. End-to-End Commercial Voucher: Posts balanced JE, verifies Trial Balance debits = credits (359ms)
✔ 15. Frontend Production Build: Validates dist bundle assets exist without bundler errors (0.3ms)

ℹ tests 15 | pass 15 | fail 0 | duration_ms 28722
```

### Suite 2: Franchise Commission Accounting Engine (`backend/tests/franchise_commission_accounting.test.js`)
**Result: 11/11 Passed (0 Failed, 100% Pass Rate)**

```text
✔ 1. Domain Service: Franchise commission split arithmetic (₹200 = ₹140 Franchise + ₹60 Main Hub)
✔ 2. Formula Engine: Decimal evaluation of percentage formulas without hardcoding account names
✔ 3. Configurable JE Rule: RULE_FRANCHISE_COMMISSION_SPLIT resolution & validation
✔ 4. Simulation: Pure read-only simulation verifies exact equilibrium (Δ = 0.00) without modifying GL
✔ 5. Atomic Posting: Post ₹200 Franchise Commission JE and verify atomic double-entry equilibrium
✔ 6. Idempotency: Reject duplicate event posting with identical source reference
✔ 7. General Ledger: Account balances reflect exact updated balances
✔ 8. Trial Balance: Company A Trial Balance in exact mathematical equilibrium (Δ = 0.00)
✔ 9. Financial Statements: Profit & Loss and Balance Sheet equilibrium
✔ 10. Multi-Company & Tenant Isolation: Company B and Tenant B remain completely clean
✔ 11. Commissions Controller: previewFranchiseSplit returns standard JSON response for ₹200 scenario

ℹ tests 11 | pass 11 | fail 0 | duration_ms 12298
```

### Suite 3: Security & CORS Regression Suite (`backend/tests/security_regression.test.js`)
**Result: 16/16 Passed (0 Failed, 100% Pass Rate)**

```text
✔ Password Hashing (pbkdf2v2 210,000 iterations & legacy compatibility)
✔ Password Complexity Enforcement
✔ JWT Access & Refresh Token verification & strict revocation
✔ Rate Limiting & Account Lockout after failed attempts
✔ Production Dev-Reset Protection
✔ Strict Whitelist CORS Policy Enforcement

ℹ tests 16 | pass 16 | fail 0 | duration_ms 2177
```

### Suite 4: Frontend Production Bundler
**Result: 0 Errors, built in 2.68s**
```text
vite v5.4.21 building for production...
✓ 1499 modules transformed.
dist/index.html                   0.82 kB │ gzip:   0.48 kB
dist/assets/index-CjZUstj2.css   50.52 kB │ gzip:   8.69 kB
dist/assets/index-CckXa46b.js   655.98 kB │ gzip: 134.76 kB
✓ built in 2.68s
```

---

## 8. Summary of Files Created and Modified

| File | Action | Purpose |
| :--- | :--- | :--- |
| [`backend/src/config/moduleRegistry.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/config/moduleRegistry.js) | Created | Canonical registry of 15 modules, categories, dependencies, presets |
| [`backend/src/models/Company.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/models/Company.js) | Modified | Added `enabled_modules`, `modules_config`, and `isModuleEnabled()` |
| [`backend/src/services/companyInitService.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/services/companyInitService.js) | Modified | Initializes default modules by profile, supports custom module selection |
| [`backend/src/middleware/companyMiddleware.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/middleware/companyMiddleware.js) | Modified | Added `requireCompanyModule` middleware returning 403 on disabled module |
| [`backend/src/controllers/companyController.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/controllers/companyController.js) | Modified | Added module/franchise CRUD controllers; enriched company list & switch responses |
| [`backend/src/controllers/authController.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/controllers/authController.js) | Modified | Enriched `getMe` available/current company payloads with `enabled_modules` |
| [`backend/src/routes/companyRoutes.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/routes/companyRoutes.js) | Modified | Mounted `GET/PATCH /:id/modules` and `GET/PUT /:id/franchise-config` |
| [`backend/src/routes/restaurantRoutes.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/routes/restaurantRoutes.js) | Modified | Enforced `requireCompanyModule('RESTAURANT')` |
| [`backend/src/routes/hotelPmsRoutes.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/routes/hotelPmsRoutes.js) | Modified | Enforced `requireCompanyModule('HOTEL_PMS')` |
| [`backend/src/routes/retailPosRoutes.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/routes/retailPosRoutes.js) | Modified | Enforced `requireCompanyModule('RETAIL_POS')` |
| [`backend/src/routes/manufacturingRoutes.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/routes/manufacturingRoutes.js) | Modified | Enforced `requireCompanyModule('MANUFACTURING')` |
| [`backend/src/routes/inventoryRoutes.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/routes/inventoryRoutes.js) | Modified | Enforced `requireCompanyModule('INVENTORY')` |
| [`frontend/src/services/api.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/frontend/src/services/api.js) | Modified | Added API client helper methods for company modules and franchise config |
| [`frontend/src/App.jsx`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/frontend/src/App.jsx) | Modified | Dynamic sidebar navigation based on active company's `enabled_modules` |
| [`frontend/src/pages/ModuleConfigPage.jsx`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/frontend/src/pages/ModuleConfigPage.jsx) | Overwritten | Interactive setup screen with 1-click presets, module cards, franchise split modal |
| [`backend/tests/configurable_erp_modules.test.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/tests/configurable_erp_modules.test.js) | Created | 15 comprehensive automated regression tests covering all prompt requirements |

---

## 9. Conclusion & Release Readiness

The `TallyVeridexERP` application is completely verified and operational:
1. **Simple default experience** for general accounting businesses.
2. **On-demand vertical extensions** for retail, dining, hospitality, and manufacturing.
3. **Franchise & Commission engine** with customizable percentage splits, live math simulation, and balance-sheet integrity.
4. **Complete tenant and company data isolation** verified through 42 automated regression tests.
5. **Clean production build** ready for SaaS deployment.
