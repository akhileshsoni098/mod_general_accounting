# TallyVeridexERP — Company Data Scoping & Multi-Entity Isolation Architecture

## 1. Executive Summary

This specification establishes the authoritative data-scoping model for **TallyVeridexERP** as of **Phase 2**. 

The system implements a hierarchical multi-entity tenancy model:
```
Platform (Global)
  └── Tenant Organization (Subscription & Identity Boundary)
        ├── Tenant-Wide Administration & User Directory
        └── Company Entities (Financial & Accounting Isolation Boundaries)
              ├── Chart of Accounts (COA) & Ledgers
              ├── Fiscal Periods & Lockouts
              ├── Journal Entries & Double-Entry Ledgers
              ├── Parties (Customers, Suppliers, Counterparties)
              ├── Posting Rules & Dimension Contexts
              └── Future Operational Masters (Items, Warehouses, POS, Folios)
```

Data scoping guarantees:
1. **Tenant Isolation**: A tenant cannot view, mutate, or reference documents of another tenant under any circumstances.
2. **Company Isolation**: Within a tenant, accounting and operational documents belong to a single `company_id`. Users assigned only to Company A cannot view or post transactions to Company B.
3. **Compound Uniqueness**: Identifiers such as `company_code`, `account_code`, `journal_number`, and `party_code` are unique within `{ tenant_id, company_id }`, allowing companies to have identical natural keys (e.g. account `1001` or company `MAIN`) without collision across tenants or sister companies.
4. **Zero-Backdoor Principle**: Platform Administrators (`is_platform_admin === true`) are not permitted to bypass company-level financial isolation. Explicit company membership or tenant-admin assignment is required.

---

## 2. Model Classification Catalog (63 Models)

Every data entity in the repository is classified into one of five scoping categories:

### Category 1: Platform-Global Models (Scope: None / Platform Admin)
These models are system-wide, shared across all tenants, and contain no `tenant_id`:
- `SystemAuditLog`: High-level platform health and deployment events.
- `SystemConfig`: Global platform configurations and feature availability.

### Category 2: Tenant-Scoped, Company-Agnostic Models (Scope: `tenant_id`)
Entities that govern the organization, authentication, user directory, billing subscription, or tenant-wide settings:
- `Tenant`: Core tenant subscription record.
- `User`: Global user account credentials, MFA status, name, and email.
- `TenantMembership`: Maps `User` to `Tenant` with status (`ACTIVE`, `INVITED`, `DEACTIVATED`).
- `TenantModuleEntitlement`: Feature flags enabling core modules for the tenant.
- `Role`: System and custom role definitions (e.g., `TENANT_ADMIN`, `ACCOUNTANT`).
- `Permission`: Catalog of fine-grained granular permissions.
- `RolePermission`: Mapping of permissions to roles.
- `UserRole`: User role assignments (now supports `company_id: null` for tenant-wide roles, or `company_id: ObjectId` for company-scoped roles).
- `UserSession`: Active dual-token session families and refresh token hashes.
- `PasswordResetToken`: Ephemeral password recovery tokens.
- `TenantSetting`: Tenant-wide configuration parameters and preferences.

### Category 3: Company-Scoped Models (Scope: `tenant_id` + `company_id`)
Core accounting, financial, and operational entities that require strict company-level isolation:
- `Company`: Master record for individual business entities under a tenant.
- `CompanyMembership`: Granular user access control to individual companies with status (`ACTIVE`, `INVITED`, `SUSPENDED`).
- `LedgerAccount`: Chart of Accounts ledgers and control accounts.
- `FiscalPeriod`: Financial accounting periods and locking status.
- `Journal`: Header records for double-entry financial journals.
- `Party`: Customers, suppliers, vendors, and counterparties.
- `PostingRule`: Accounting event-to-journal posting logic.
- `DimensionDefinition`: Custom analytical accounting dimensions.
- *Future Phase 3/4 Models*: `StockGroup`, `StockCategory`, `StockItem`, `Warehouse`, `UnitOfMeasure`, `Voucher`, `PosRegister`, `RestaurantTable`, `HotelRoom`.

### Category 4: Child-Derived / Compound-Scoped Models
Documents that are sub-components of parent company-scoped records. They carry both `tenant_id` and `company_id` directly for query efficiency, but their lifecycle is bounded by the parent document:
- `JournalEntry`: Individual debit/credit lines belonging to a parent `Journal`.
- `PartyRole`: Specific role designations (Customer, Vendor, Broker) for a `Party`.
- `PostingRuleCondition`: Evaluated criteria for a `PostingRule`.
- `PostingRuleLineTemplate`: Target ledger templates for a `PostingRule`.
- `RuleTestCase`: Test scenarios for accounting rule validation.

### Category 5: Historical / Insurance-Specific Models (Preserved for Retirement)
Pre-existing insurance domain models preserved intact to prevent disruption of historical data. They carry `tenant_id` and are maintained without regression until a domain retirement phase:
- `BillingAccount`, `InstallmentSchedule`, `Invoice`, `InvoiceLineItem`, `Payment`, `PaymentAllocation`, `Adjustment`, `BillingPlan`, `PolicyTerm`.
- `BankStatementLine`, `PaymentAttempt`, `PaymentReturn`, `Refund`, `PaymentMandate`, `ProcessorTransaction`, `ReconciliationMatch`, `DunningPlan`, `DelinquencyCase`, `DunningAction`, `CollectionAssignment`.
- `CommissionAgreement`, `CommissionSchedule`, `CommissionSplit`, `CommissionTransaction`, `FiduciaryAccount`, `FiduciaryTransaction`, `BordereauDefinition`, `BordereauRun`, `BordereauLine`, `SettlementRun`.
- `EventDefinition`, `EventVersion`, `EventOutbox`, `EventInbox`, `EventTrace`, `EventSubscription`, `FinanceCloseChecklist`, `ReconciliationCase`, `UPRCalculationRun`, `TrialBalanceSnapshot`.

---

## 3. Compound Indexes & Uniqueness Enforcement

To guarantee performance and multi-company integrity, the following compound indexes are enforced at the Mongoose and MongoDB collection level:

| Collection | Compound Index Specification | Constraints | Purpose |
| :--- | :--- | :--- | :--- |
| `companies` | `{ tenant_id: 1, company_code: 1 }` | `unique: true` | Prevents duplicate company codes within a tenant; allows duplicate codes across tenants. |
| `company_memberships` | `{ tenant_id: 1, company_id: 1, user_id: 1 }` | `unique: true` | Enforces single membership record per user per company. |
| `company_memberships` | `{ user_id: 1, status: 1 }` | Standard | High-speed resolution of user's active company memberships. |
| `user_roles` | `{ tenant_id: 1, company_id: 1, user_id: 1, role_id: 1 }` | `unique: true` | Prevents duplicate role grants for a specific company scope. |
| `ledger_accounts` | `{ tenant_id: 1, company_id: 1, account_code: 1 }` | `unique: true` | Scopes Chart of Accounts codes to individual companies. |
| `fiscal_periods` | `{ tenant_id: 1, company_id: 1, period_name: 1 }` | `unique: true` | Prevents period name collisions within a company. |
| `fiscal_periods` | `{ tenant_id: 1, company_id: 1, start_date: 1, end_date: 1 }` | Standard | Rapid lookup of open fiscal period for posting dates. |
| `journals` | `{ tenant_id: 1, company_id: 1, journal_number: 1 }` | `unique: true` | Scopes journal voucher numbers per company. |
| `journal_entries` | `{ tenant_id: 1, company_id: 1, ledger_account_id: 1 }` | Standard | Subledger and ledger activity aggregation. |
| `parties` | `{ tenant_id: 1, company_id: 1, party_code: 1 }` | `unique: true` | Scopes customer/vendor codes to individual company. |
| `posting_rules` | `{ tenant_id: 1, company_id: 1, rule_code: 1, version: 1 }` | `unique: true` | Scopes accounting event rules to company. |
| `dimension_definitions` | `{ tenant_id: 1, company_id: 1, dimension_code: 1 }` | `unique: true` | Scopes analytical dimension keys to company. |

---

## 4. Middleware & Isolation Enforcement Protocol

All incoming HTTP requests to company-scoped endpoints pass through the `requireCompanyContext` middleware (`backend/src/middleware/companyMiddleware.js`):

```
Client HTTP Request
  │
  ├── [requireAuth] ──► Validates JWT access token, extracts req.userId
  │
  ├── [requireTenantContext] ──► Resolves req.tenantId, checks tenant status
  │
  └── [requireCompanyContext] ──► Resolves Target Company:
        │
        ├── 1. Reads 'x-company-id' header or body/query company_id hint.
        │
        ├── 2. If no hint, looks up user's default active CompanyMembership.
        │
        ├── 3. If multiple companies exist and no hint or default is set, returns 400 Bad Request.
        │
        ├── 4. Cross-Tenant Check: Asserts company.tenant_id === req.tenantId.
        │      (Mismatch returns 403 Forbidden: CROSS_TENANT_COMPANY_ACCESS_DENIED).
        │
        ├── 5. Membership & Zero-Backdoor Check:
        │      - Queries CompanyMembership for { tenant_id, company_id, user_id, status: 'ACTIVE' }.
        │      - If user is TENANT_ADMIN, tenant-wide access is granted.
        │      - Platform Admin without membership is rejected (Zero-Backdoor).
        │      - Missing or SUSPENDED membership returns 403 Forbidden.
        │
        └── 6. Injects req.companyId, req.company, and req.companyMembership into Express Request context.
```

### Controller Data Access Rules
1. **Never query without company**: All accounting Mongoose queries (`find`, `findOne`, `countDocuments`, `aggregate`, `updateMany`) must include `{ tenant_id: req.tenantId, company_id: req.companyId }`.
2. **Never create without company**: New accounting records (`LedgerAccount`, `FiscalPeriod`, `Journal`, `Party`, etc.) must explicitly populate `company_id: req.companyId`.
3. **Double verification on direct record access**: When fetching by ID (`GET /gl/accounts/:id`, `GET /gl/journals/:id`), the query must match `_id: req.params.id`, `tenant_id: req.tenantId`, and `company_id: req.companyId`. Tampered IDs return `404 Not Found`.
