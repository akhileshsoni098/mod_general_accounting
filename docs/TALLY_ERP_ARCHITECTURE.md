# TallyVeridexERP — Enterprise System Architecture & Domain Design

## 1. System Mission & Architectural Vision

**TallyVeridexERP** is a commercial SaaS Enterprise Resource Planning (ERP) platform inspired by the speed, double-entry rigor, and functional flexibility of TallyPrime, combined with modern cloud-native multi-tenancy, REST APIs, granular RBAC/ABAC authorization, and high-performance React user interfaces.

The architecture decouples operational business workflows (such as Retail POS, Restaurant Order KOT, and Hotel Folios) from the underlying double-entry accounting engine, ensuring that all industry workflows feed into a shared, verified, and mathematically balanced general ledger core.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 OPERATIONAL WORKFLOW SURFACES                           │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │   Retail POS   │  │ Restaurant & QSR │  │ Hotel Folios &  │  │ Wholesale & Goods  │  │
│  │    Checkout    │  │  KOT / Tables    │  │ Front-Desk Desk │  │  Receipt Notes     │  │
│  └───────┬────────┘  └────────┬─────────┘  └────────┬────────┘  └─────────┬──────────┘  │
└──────────┼────────────────────┼─────────────────────┼─────────────────────┼─────────────┘
           │                    │                     │                     │
           ▼                    ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     UNIVERSAL TRANSACTION LIFECYCLE & DISPATCH INTERFACE                │
│             (Source Document Validation, Party Verification, Tax Computation)            │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         SHARED DOUBLE-ENTRY ACCOUNTING & GL ENGINE                      │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ • Chart of Accounts & Control Accounts (AR, AP, Cash, Bank, Statutory GST)         │  │
│  │ • Strict Debit == Credit Equilibrium (BigNumber Precision)                        │  │
│  │ • Fiscal Period Locking & Statutory Close Safeguards                              │  │
│  │ • Real-Time Trial Balance, Balance Sheet, and Subledger Aggregation                │  │
│  │ • Audit Trail, Voucher Invalidation & Reversible Linked Contra-Entries             │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Entity Tenancy Hierarchy

The application establishes a two-tiered organization model:

```
SaaS Platform
  └── Tenant Workspace (Subscription & Identity Boundary)
        ├── Tenant Memberships & Global User Accounts
        ├── Module Feature Entitlements (GL, Billing, Treasury, etc.)
        └── Companies (Financial & Operational Books Boundary)
              ├── Legal Name, Tax Identifiers (GSTIN/VAT/EIN) & Currency
              ├── Canonical Business Profile (Retail, Hardware, Hotel, etc.)
              ├── Independent Chart of Accounts & General Ledger
              ├── Independent Fiscal Periods & Period Lockouts
              ├── Independent Double-Entry Journal Records
              └── Company-Scoped User Access & Role Assignments
```

### Hierarchy Guarantees:
1. **Tenant Separation**: Strict boundary across distinct tenant organizations. No query, aggregation, or cross-tenant foreign key reference is permitted.
2. **Company Separation**: Within a tenant, companies maintain independent general ledgers and trial balances. Sister companies cannot see or contaminate each other's financial records.
3. **Compound Identifiers**: Natural keys (e.g. `company_code: 'MAIN'`, `account_code: '1001'`, `journal_number: 'JE-2026-0001'`) are unique within `{ tenant_id, company_id }`.

---

## 3. Universal Multi-Industry Business Profiles

When provisioning a new company, the system initializes suitable chart of accounts, tax structures, and operational features based on 10 canonical business profiles defined in [`backend/src/config/businessProfiles.js`](file:///c:/Users/AkhileshSoni/Desktop/veridexoneDoc/TallyVeridexERP/backend/src/config/businessProfiles.js):

| Profile Identifier | Display Name | Core Characteristics | Recommended Modules |
| :--- | :--- | :--- | :--- |
| `GENERAL_RETAIL` | General Trading & Retail | Barcode scanning, fast POS checkout, counter cash/card receipts, standard customer ledger. | `RETAIL_POS`, `INVENTORY`, `GL` |
| `HARDWARE` | Hardware & Building Materials | Multi-unit conversions (kg/meters/pieces), batch tracking, contractor pricing, credit sales. | `INVENTORY`, `CREDIT_SALES`, `GL` |
| `GROCERY` | Grocery & Kirana Stores | Rapid item lookup, expiry date tracking, fast cash desk, loose quantity weighing scale inputs. | `RETAIL_POS`, `INVENTORY`, `GL` |
| `WHOLESALE_DISTRIBUTION`| Wholesale & Distribution | Bulk order booking, goods delivery challans, customer credit limits, multi-tier pricing. | `PURCHASE_SALES`, `INVENTORY`, `AR_AP` |
| `RESTAURANT_CAFE` | Restaurant & Cafe | Dine-in tables, Kitchen Order Tickets (KOT), recipe ingredient consumption, service tips. | `RESTAURANT`, `INVENTORY_BOM`, `GL` |
| `PIZZA_QSR` | Pizza & Quick-Service | Order takeaway, delivery dispatch, modifier/topping variations, fast register checkout. | `QSR_POS`, `INVENTORY_BOM`, `GL` |
| `HOTEL_HOSPITALITY` | Hotel & Hospitality | Room reservations, guest check-in/out, folio billing, extra service charges, room status. | `HOTEL_FOLIO`, `BILLING`, `GL` |
| `MANUFACTURING` | Discrete Manufacturing | Multi-level Bill of Materials (BOM), raw material issue, finished goods costing, scrap waste. | `MANUFACTURING_BOM`, `INVENTORY`, `GL` |
| `PROFESSIONAL_SERVICES` | Professional Services | Hourly/milestone invoicing, time tracking, expense reimbursement, contract retainers. | `SERVICE_BILLING`, `AR_AP`, `GL` |
| `CUSTOM_OTHER` | Custom Business Profile | Flexible unconstrained master templates for specialized commercial enterprises. | `ALL_MODULES_CONFIGURABLE` |

### Profile Architectural Principles:
- **Profiles are NOT Authorization Boundaries**: Permissions and data isolation are enforced strictly by `tenant_id`, `company_id`, and `UserRole`/`CompanyMembership`.
- **Non-Destructive & Reversible**: Activating additional modules later never alters historical journals or ledger balances.
- **Unified GL Convergence**: Regardless of industry, all operational transactions post into the standardized double-entry general ledger.

---

## 4. Double-Entry Accounting Core Architecture

### 4.1 Balance Equilibrium
The journal posting service (`backend/src/services/journalPostingService.js`) validates all transactions with arbitrary-precision arithmetic (`bignumber.js`):
$$\sum \text{Debits} = \sum \text{Credits}$$
Transactions with even a single cent discrepancy are rejected with a `Double-entry imbalance` error, preventing corrupted trial balances.

### 4.2 Account Normal Balances & Sign Rules
- **Assets & Expenses**: Normal Balance = `DEBIT`.
  $$\text{New Balance} = \text{Current Balance} + \text{Debits} - \text{Credits}$$
- **Liabilities, Equity & Revenue**: Normal Balance = `CREDIT`.
  $$\text{New Balance} = \text{Current Balance} + \text{Credits} - \text{Debits}$$

### 4.3 Fiscal Period Lockouts
- Financial periods (`FiscalPeriod`) are scoped per company and enforce states: `FUTURE`, `OPEN`, `SOFT_CLOSED`, `HARD_CLOSED`, and `LOCKED`.
- When a period is `LOCKED` or `HARD_CLOSED`, the posting engine rejects new entries or modifications unconditionally.
- Audit reversals must be posted in an open subsequent financial period.

---

## 5. Security & Isolation Architecture (Phase 1 & Phase 2 Baseline)

1. **Authentication**: Dual-token lifecycle (`access_token` valid for 1 hour; `refresh_token` valid for 7 days) with cryptographically secure session family rotation and reuse detection.
2. **Password Security**: Modern PBKDF2-HMAC-SHA512 hashing with 210,000 iterations; automatic backward-compatible migration of legacy hashes.
3. **Protection against Brute Force**: Sliding-window rate limiting (15 attempts/15 min) with account lockout after 5 consecutive failures.
4. **Header Scoping**: `requireCompanyContext` verifies the caller's active membership in the target company on every HTTP request.
5. **Zero-Backdoor Principle**: Platform administrators cannot query or modify company financial data without formal tenant administrator assignment.

---

## 6. Implementation Roadmap

- **Phase 0 (Completed)**: Discovery audit, repository inventory, baseline verification.
- **Phase 1 (Completed)**: Security hardening, dual-token JWT, PBKDF2 v2, rate limiters, security regression test suite.
- **Phase 2 (Completed)**: Multi-company architecture, company isolation, RBAC/ABAC context, business profiles registry, Company Switcher UI, migration tooling, regression test suite.
- **Phase 3 (Next)**: Inventory Masters — Stock Groups, Stock Categories, Stock Items, Warehouses / Godowns, Units of Measurement, and Multi-UOM conversions.
- **Phase 4**: Commercial Voucher Engine — Sales Invoice, Purchase Receipt, Customer Receipt, Vendor Payment, Contra, and Credit/Debit Notes.
- **Phase 5**: Industry Operational Workflows — Retail POS, Restaurant KOT/Tables, Hotel Guest Folios.
