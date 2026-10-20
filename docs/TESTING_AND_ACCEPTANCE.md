# TallyVeridexERP — Testing & Acceptance Verification Report

## 1. Overview & Verification Summary

This document certifies the testing verification and acceptance criteria for:
- **Phase 1: Security Hardening & Zero-Backdoor Cryptography**
- **Phase 2: Multi-Company Architecture, Company Isolation, RBAC/ABAC, and Business Profiles**
- **Phase 3: Core Inventory, Stock Masters, UOM and Stock Foundation**
- **Phase 4: Commercial Transactions, Dynamic Journal Posting, Inventory-to-GL Integration, GST Foundation**

All automated test suites execute natively via Node.js test runner and Vite production bundler with **100% passing results and 0 failures**.

| Test Suite | File Location | Executed Tests | Passing | Failing | Execution Time |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Commercial Transactions & GL** | `backend/tests/commercial_transactions_and_gl.test.js` | 19 | 19 | 0 | ~51.5s |
| **Inventory Foundation & Isolation** | `backend/tests/inventory_foundation_and_isolation.test.js` | 29 | 29 | 0 | ~34.4s |
| **Company Lifecycle & Isolation** | `backend/tests/company_lifecycle_and_isolation.test.js` | 18 | 18 | 0 | ~39.0s |
| **Security & Cryptography** | `backend/tests/security_regression.test.js` | 16 | 16 | 0 | ~0.6s |
| **Frontend Production Build** | `frontend/ (npm run build)` | 1,496 modules | OK | 0 | ~2.1s |
| **Total Automated Coverage** | | **82 Tests** | **82** | **0** | **100% Pass** |

---

## 2. Phase 3 Requirement Traceability Matrix

The table below maps Phase 3 specifications from Section 11 to automated test cases in `backend/tests/inventory_foundation_and_isolation.test.js`:

| Requirement | Test Name / Identifier | Result | Evidence & Behavior Validated |
| :--- | :--- | :---: | :--- |
| **1. Auto-Provisioning** | `Setup: Register Tenant A and verify automatic inventory foundation provisioning` | **PASS** | Auto-provisions default Godown (`MAIN`), 8 standard UOMs (`PCS`, `BOX`, `DOZEN`, `KG`, `GRAM`, `LTR`, `ML`, `MTR`), and default StockGroup (`PRIMARY`). |
| **2. Multi-Company Setup** | `Setup: Create secondary company SEC01 under Tenant A for cross-company isolation` | **PASS** | Provisions independent company with `GENERAL_RETAIL` profile and isolated inventory master catalog. |
| **3. UOM Identity** | `UOM Engine: Identity conversion (same UOM) returns factor 1 and exact quantity` | **PASS** | Converting between identical units returns factor 1 and exact input quantity. |
| **4. Mass Dimension Math** | `UOM Engine: Standard dimension mass conversion (2.5 KG = 2500 GRAM)` | **PASS** | Verified standard dimension conversion: 2.5 KG = 2500 GRAM. |
| **5. Volume Dimension Math**| `UOM Engine: Standard dimension volume conversion (1000 ML = 1 LTR)` | **PASS** | Verified standard dimension conversion: 1000 ML = 1 LTR. |
| **6. Incompatible Dimensions**| `UOM Engine: Incompatible dimension conversion (MASS to VOLUME) is rejected` | **PASS** | Attempting to convert between mass and volume without packaging ratio throws explicit 400 rejection. |
| **7. Stock Group Hierarchy** | `Stock Groups: Create parent group and child subgroup` | **PASS** | Created parent `HARDWARE` and child `FASTENERS`. Parent-child linkage verified. |
| **8. Intra-Company Uniqueness**| `Stock Groups: Reject duplicate group_code within the same company` | **PASS** | Duplicate `group_code` within same company returns `409 Conflict (DUPLICATE_GROUP_CODE)`. |
| **9. Cross-Company Reusability**| `Stock Groups: Allow identical group_code across different companies` | **PASS** | Secondary company created `HARDWARE` group without collision. Unique compound index `{ tenant_id, company_id, group_code }` validated. |
| **10. Cycle Prevention (Loop)**| `Stock Groups: Reject circular hierarchy dependency (Parent -> Child -> Parent)` | **PASS** | Setting `HARDWARE` parent to `FASTENERS` rejected with `400 (CIRCULAR_GROUP_DEPENDENCY)`. Ancestry traversal verified. |
| **11. Self-Parent Cycle** | `Stock Groups: Reject self-parent cycle (group setting parent to itself)` | **PASS** | Setting group's parent to its own ID rejected with `400 (SELF_PARENT_CYCLE)`. |
| **12. Deletion Guard** | `Stock Groups: Reject deletion of group with active child subgroups` | **PASS** | Deleting group with active children rejected with `400 (GROUP_HAS_ACTIVE_SUBGROUPS)`. |
| **13. Category Management** | `Stock Categories: Create and list categories` | **PASS** | Stock category `FASTENERS_CAT` created, listed, and verified per company. |
| **14. Godowns & Default Toggle**| `Godowns: Create secondary godown and promote to default` | **PASS** | Created `WH_EAST` as `is_default: true`; previous default `MAIN` godown automatically unset to `is_default: false`. |
| **15. Alternate UOM Ingestion**| `Stock Items: Create item with item-specific alternate UOM (1 BOX = 10 PCS)` | **PASS** | Created item `BOLT_M8` with base unit `PCS` and alternate packaging unit `1 BOX = 10 PCS`. |
| **16. Item-Specific Packaging**| `Stock Items: Create second item with different packaging ratio (1 BOX = 100 PCS)` | **PASS** | Created item `SCREW_M4` with alternate packaging unit `1 BOX = 100 PCS`. |
| **17. 5 BOX Conversion Test**| `UOM Engine: Item-specific conversions resolve packaging accurately per item (5 BOX test)` | **PASS** | 5 BOX of `BOLT_M8` converts to 50 PCS. 5 BOX of `SCREW_M4` converts to 500 PCS. Complete item-specific isolation verified. |
| **18. Item Code & SKU Uniqueness**| `Stock Items: Reject duplicate item_code and SKU within same company` | **PASS** | Duplicate item code returns `409 (DUPLICATE_ITEM_CODE)`. Duplicate SKU returns `409 (DUPLICATE_SKU)`. |
| **19. Multi-Company Item Reusability**| `Stock Items: Allow identical item_code in different company` | **PASS** | Secondary company creates `BOLT_M8` successfully without conflict. |
| **20. Alternate UOM Opening Stock**| `Opening Stock: Post opening stock in alternate UOM (5 BOX = 50 PCS @ ₹5.00/base unit)` | **PASS** | 5 BOX opening stock recorded. Movement created with `base_quantity: 50` and `total_cost: 250.00`. Projected `StockBalance` created with `quantity_on_hand: 50` and moving average rate `₹5.00`. |
| **21. Idempotent Duplicate Rejection**| `Opening Stock: Reject duplicate opening stock posting for the same item and godown` | **PASS** | Second attempt to post opening stock for same item in same godown returns `409 (OPENING_STOCK_ALREADY_POSTED)`. |
| **22. Base UOM Immutability**| `Stock Items: Reject changing base_uom_id after stock movements exist` | **PASS** | Attempting to update `base_uom_id` on item with logged movements rejected with `400 (BASE_UOM_IMMUTABLE_AFTER_MOVEMENTS)`. |
| **23. Movement Reversal** | `Movements: Post opening stock for SCREW_M4 and reverse it` | **PASS** | Reversal endpoint creates compensating movement with signed negative base quantity (-100). On-hand quantity and valuation returned to zero. Second reversal rejected. |
| **24. Ledger Reconciliation** | `Reconciliation: Rebuild balances from movement ledger reconstructs exact numbers` | **PASS** | Audit rebuild endpoint replays all append-only movements and accurately reconstructs all godown balances from scratch. |
| **25. Scope Isolation (Company)**| `Isolation: Requests for Company MAIN items do not expose Secondary Company items` | **PASS** | Company MAIN item queries return strictly Company MAIN items. Secondary company queries return strictly secondary company items. |
| **26. Scope Isolation (Tenant)** | `Isolation: User in Tenant B cannot access Company A inventory items` | **PASS** | Tenant B user queries item belonging to Tenant A; returns `404 Not Found`. |
| **27. Header Tampering Defense**| `Isolation: Tampered x-company-id header for company user has no membership in is rejected` | **PASS** | Requests with spoofed `x-company-id` rejected with `403 Forbidden`. |
| **28. Inactive Item Protection**| `Inactive Item: Posting opening stock for deactivated item is rejected` | **PASS** | Deactivated item (`status: 'INACTIVE'`) rejected during opening stock posting with `400 (STOCK_ITEM_INACTIVE)`. |
| **29. Phase 4 GL Boundary** | Verified across all opening stock tests | **PASS** | Response explicitly returns `gl_status: 'DEFERRED_TO_PHASE_4'`, preventing GL corruption prior to commercial voucher integration. |

---

## 3. Phase 4 Commercial Transactions & GL Requirement Traceability Matrix

The table below maps Phase 4 specifications to automated test cases in `backend/tests/commercial_transactions_and_gl.test.js`:

| Requirement | Test Name / Identifier | Result | Evidence & Behavior Validated |
| :--- | :--- | :---: | :--- |
| **1. Company Setup & Posting Rules** | `Setup: Register Tenant A, provision main company COMM01, seed COA and commercial rules` | **PASS** | Auto-provisions primary company MAIN, provisions posting ledger config (`1201`, `5004`, `4001`), seeds commercial rules, fetches standard UOM (`PCS`) and default godown. |
| **2. Multi-Company Isolation Setup** | `Setup: Register Tenant B and Secondary Company for isolation testing` | **PASS** | Provisions Tenant B and secondary company `SEC01` with independent ledgers and documents. |
| **3. GST Counterparties** | `Setup: Create customer party (Intra-state GST) and supplier party (Inter-state GST)` | **PASS** | Customer created with Maharashtra state code (`27`); supplier created with Gujarat state code (`24`). |
| **4. Stock & Service Masters** | `Setup: Create stock item (18% GST) and service item (no stock tracking)` | **PASS** | Item `WDG-001` created with tracking enabled; `SRV-INSTALL` created with `is_stock_tracked: false`. |
| **5. Interstate Purchase Invoice** | `Purchase Invoice: Create draft and verify interstate GST (18% IGST)` | **PASS** | Inter-state supply determined; 18% IGST calculated (₹900 IGST on ₹5,000 taxable); total ₹5,900. |
| **6. Purchase Posting & Valuation** | `Purchase Invoice: Posting increases stock, updates moving-average cost, and posts balanced GL journal` | **PASS** | Stock movement `PURCHASE_RECEIPT` created; stock balance updated to 100 PCS @ ₹50.00; balanced GL journal posted (Debit 1201 ₹5,000, Debit 1303 ₹900, Credit 2001 ₹5,900). |
| **7. Purchase Idempotency** | `Purchase Invoice: Duplicate post attempt returns existing posted document without duplicating stock or journals` | **PASS** | Second post request returns `is_duplicate: true` without creating duplicate stock movements or GL entries. |
| **8. Intrastate Sales & Perpetual COGS**| `Sales Invoice: Create and post credit sales invoice with intra-state GST (9% CGST + 9% SGST)` | **PASS** | Intra-state supply determined; 9% CGST (₹180) + 9% SGST (₹180); balanced primary journal posted; stock reduced to 80 PCS; perpetual COGS journal posted (Debit 5004 ₹1,000, Credit 1201 ₹1,000). |
| **9. Negative Stock Guard** | `Sales Invoice: Oversale is rejected when negative stock is disabled` | **PASS** | Request to issue 1,000 PCS when only 80 available rejected with `422 (INSUFFICIENT_STOCK)`; stock unchanged. |
| **10. Service Line Item Behavior** | `Sales Invoice: Service-only item does NOT create stock movements or COGS entries` | **PASS** | Non-inventory service sales invoice generates revenue/tax journal with 0 stock movements and no COGS entry. |
| **11. Customer Receipt & Allocation**| `Receipt: Partial settlement of sales invoice creates BillAllocation and updates balance_due` | **PASS** | Customer receipt of ₹1,000 posted; `BillAllocation` created; sales invoice `balance_due` reduced from ₹2,360 to ₹1,360. |
| **12. Supplier Payment Settlement**| `Payment: Settle supplier purchase invoice via payment transaction` | **PASS** | Supplier payment of ₹3,000 posted; purchase invoice `balance_due` reduced from ₹5,900 to ₹2,900. |
| **13. Restockable Sales Return** | `Sales Return: Restockable return restores stock and reverses revenue & COGS` | **PASS** | Customer return of 5 PCS restores stock from 80 to 85 PCS; reverses revenue, output GST, and COGS asset entry. |
| **14. Compensating Reversals** | `Document Reversal: Reverse a posted document and confirm compensating reversal effects` | **PASS** | Posted purchase invoice reversed; stock restored from 95 to 85 PCS; compensating reversal journal linked. |
| **15. Opening Stock GL Preview** | `Opening Stock GL: Dry-run preview returns pending opening value without mutating records` | **PASS** | Dry-run preview calculates ₹500 opening stock valuation across eligible items without mutating records. |
| **16. Idempotent GL Catch-up** | `Opening Stock GL: Explicit catch-up posts balanced double-entry journal idempotently` | **PASS** | Balanced catch-up journal posted (Debit 1201 ₹500, Credit 3990 ₹500); rerun returns `posted: false, count: 0`. |
| **17. Commercial Reports & Reconcile**| `Reports: Registers, Outstanding, Tax Summary, and Stock-to-GL Reconciliation` | **PASS** | Document register, customer/supplier outstanding aging, outward/inward tax summary, and stock-to-GL valuation verified. |
| **18. Cross-Tenant Isolation** | `Isolation: User in Tenant B cannot view Tenant A commercial documents` | **PASS** | Cross-tenant request rejected with `403 Forbidden`. |
| **19. Multi-Company Isolation** | `Isolation: Company A queries do not expose Secondary Company documents` | **PASS** | Documents created in secondary company omitted from primary company queries. |

---

## 4. How to Execute All Test Suites

```powershell
# 1. Run Commercial Transactions & GL Integration Suite (19 tests)
node backend/tests/commercial_transactions_and_gl.test.js

# 2. Run Core Inventory Suite (29 tests)
node backend/tests/inventory_foundation_and_isolation.test.js

# 3. Run Company Lifecycle & Isolation Suite (18 tests)
node backend/tests/company_lifecycle_and_isolation.test.js

# 4. Run Security & Cryptography Regression Suite (16 tests)
node backend/tests/security_regression.test.js

# 5. Verify Frontend Production Build
cd frontend
cmd /c "npm run build"
```
