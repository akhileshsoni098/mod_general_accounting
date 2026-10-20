# TallyVeridexERP — Authorization Matrix & Scoped Access Control (RBAC/ABAC)

## 1. Overview

TallyVeridexERP implements a multi-tier Role-Based and Attribute-Based Access Control (RBAC/ABAC) architecture supporting:
- **Tenant-Level Roles**: Confer authority across the entire tenant organization (`company_id: null` in `UserRole`).
- **Company-Scoped Roles**: Limit user permissions to a specific designated company entity (`company_id: ObjectId` in `UserRole`).
- **Company Memberships**: An explicit membership check (`CompanyMembership`) required to access any company-scoped financial resource.
- **Zero-Backdoor Financial Protection**: Platform administrators cannot bypass company-level financial scoping without explicit tenant/company assignment.

---

## 2. Standard Roles Hierarchy

| Role Code | Role Name | Scope | Description |
| :--- | :--- | :--- | :--- |
| `PLATFORM_ADMIN` | Platform Administrator | Global | SaaS platform oversight, global tenant provisioning. Subject to zero-backdoor restriction on tenant financial data. |
| `TENANT_ADMIN` | Tenant Administrator | Tenant-Wide | Full administrative authority across all tenant configurations, user management, module entitlements, and all company workspaces under the tenant. |
| `FINANCE_ADMIN` | Finance Administrator | Tenant or Company | Administrative control over Chart of Accounts, accounting periods, posting rules, and financial close processes. |
| `COMPANY_ADMIN` | Company Administrator | Company-Scoped | Full administrative control within a designated company, including member assignment and profile settings. |
| `ACCOUNTANT` | Certified Accountant | Company-Scoped | Day-to-day transaction posting, journal creation, reversing entries, and subledger reconciliations. |
| `STAFF_ACCOUNTANT`| Staff Accountant | Company-Scoped | Entry-level transaction posting and document management; cannot close periods or reverse posted entries. |
| `AUDITOR_READ_ONLY`| Auditor (Read-Only) | Tenant or Company | Read-only access to journals, ledger accounts, trial balances, and audit trails. Mutating actions strictly blocked. |

---

## 3. Comprehensive Permissions Matrix

The table below maps standard permissions across functional modules and the roles authorized to execute them:

| Permission Code | Permission Name | Module | `TENANT_ADMIN` | `FINANCE_ADMIN` | `ACCOUNTANT` | `STAFF` | `AUDITOR` |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Company Lifecycle** | | | | | | | |
| `COMPANY:VIEW` | View accessible companies | System | ✅ | ✅ | ✅ | ✅ | ✅ |
| `COMPANY:CREATE` | Create new company entity | System | ✅ | ❌ | ❌ | ❌ | ❌ |
| `COMPANY:UPDATE` | Edit company profile/details | System | ✅ | ✅ | ❌ | ❌ | ❌ |
| `COMPANY:MANAGE_MEMBERS` | Add/revoke company users | System | ✅ | ✅ | ❌ | ❌ | ❌ |
| `COMPANY:ADMIN` | Full company administrative control | System | ✅ | ✅ | ❌ | ❌ | ❌ |
| **General Ledger & COA** | | | | | | | |
| `GL:ACCOUNT_VIEW` | View Chart of Accounts & Balances | GL | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GL:ACCOUNT_CREATE` | Create new ledger accounts | GL | ✅ | ✅ | ❌ | ❌ | ❌ |
| `GL:ACCOUNT_UPDATE` | Edit ledger account parameters | GL | ✅ | ✅ | ❌ | ❌ | ❌ |
| `GL:JOURNAL_VIEW` | View journal entries & vouchers | GL | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GL:JOURNAL_POST` | Post balanced journal entries | GL | ✅ | ✅ | ✅ | ✅ | ❌ |
| `GL:JOURNAL_REVERSE` | Reverse posted journal entries | GL | ✅ | ✅ | ✅ | ❌ | ❌ |
| `GL:TRIAL_BALANCE` | Generate & view Trial Balance | GL | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Fiscal Periods & Locks** | | | | | | | |
| `PERIOD:VIEW` | View fiscal periods & lock status | GL | ✅ | ✅ | ✅ | ✅ | ✅ |
| `PERIOD:SOFT_CLOSE` | Set period status to SOFT_CLOSED | GL | ✅ | ✅ | ❌ | ❌ | ❌ |
| `PERIOD:HARD_CLOSE` | Set period status to HARD_CLOSED | GL | ✅ | ✅ | ❌ | ❌ | ❌ |
| `PERIOD:ADMIN` | Lock, unlock, or modify periods | GL | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Tenant Administration** | | | | | | | |
| `TENANT:USER_MANAGE` | Invite, edit, deactivate users | Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| `TENANT:MODULE_MANAGE` | Toggle module entitlements | Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| `TENANT:SETTINGS_UPDATE`| Update organization settings | Admin | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Enforcement Mechanics

### 4.1 Resolution of User Scoped Roles
When evaluating permissions for a company-scoped request:
```javascript
const userRoles = await UserRole.find({
  tenant_id: req.tenantId,
  user_id: req.userId,
  $or: [
    { company_id: null },            // Tenant-wide role (e.g. TENANT_ADMIN)
    { company_id: req.companyId }     // Company-specific role grant
  ]
}).populate('role_id');
```
A user assigned `ACCOUNTANT` for Company A has zero posting privileges in Company B, even within the same tenant.

### 4.2 Membership Revocation Protocol
When a user is removed or suspended from a company:
1. `CompanyMembership.status` is set to `'SUSPENDED'`.
2. Any subsequent HTTP requests bearing that `x-company-id` are immediately rejected with `HTTP 403 Forbidden: ACTIVE_COMPANY_MEMBERSHIP_REQUIRED`.
3. Cached tokens or local storage headers cannot bypass this check because membership status is validated live against MongoDB on every request.

### 4.3 Zero-Backdoor Platform Admin Isolation
Under `backend/src/middleware/companyMiddleware.js`:
```javascript
// Even if req.user.is_platform_admin is true:
const isTenantAdmin = userRoles.some(r => r.role_id?.code === 'TENANT_ADMIN');
const hasActiveMembership = await CompanyMembership.findOne({
  tenant_id: req.tenantId,
  company_id: targetCompany._id,
  user_id: req.userId,
  status: 'ACTIVE'
});

if (!isTenantAdmin && !hasActiveMembership) {
  return res.error(
    'Access denied: You do not have active membership in the selected company.',
    403,
    'COMPANY_MEMBERSHIP_REQUIRED'
  );
}
```
This guarantees that platform support engineers or global administrative users cannot inadvertently view, query, or leak company financial data without formal tenant administrator assignment.
