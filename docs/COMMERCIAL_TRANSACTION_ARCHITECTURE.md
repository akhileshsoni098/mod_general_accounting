# Commercial Transaction Architecture (Phase 4)

## 1. Overview and Core Philosophy

In TallyVeridexERP Phase 4, commercial operational transactions (Sales Invoices, Purchase Invoices, Customer Receipts, Supplier Payments, Sales Returns, and Purchase Returns) are implemented as first-class, dedicated business documents rather than forced raw voucher entries.

Every transaction operates through a typed, lifecycle-driven state machine (`DRAFT -> POSTED / REVERSED / CANCELLED`) while maintaining full underlying double-entry integrity, stock subledger traceability, and India-first GST compliance.

```
       [ Client Request / UI / API ]
                     │
                     ▼
       ┌───────────────────────────┐
       │ Commercial Document (DRAFT)│
       └─────────────┬─────────────┘
                     │  (POST Action)
                     ▼
    ╔═════════════════════════════════════════╗
    ║      Unified MongoDB Transaction        ║
    ║                                         ║
    ║  1. Stock Movements (Append-only)       ║
    ║  2. Stock Balances (Moving Avg Update)  ║
    ║  3. Primary GL Journal (Double-Entry)   ║
    ║  4. Perpetual COGS Journal (On Issue)   ║
    ║  5. Bill Allocations (Invoice Matching) ║
    ║  6. Document Status -> POSTED           ║
    ╚═════════════════════════════════════════╝
```

---

## 2. Document Data Model & Schema Details

Commercial transactions are modeled in `CommercialDocument`:
- **Document Types**: `SALES_INVOICE`, `PURCHASE_INVOICE`, `SALES_RETURN`, `PURCHASE_RETURN`, `CREDIT_NOTE`, `DEBIT_NOTE`, `RECEIPT`, `PAYMENT`, `CONTRA_TRANSFER`, `JOURNAL_ADJUSTMENT`.
- **Status Enum**: `DRAFT`, `POSTED`, `CANCELLED`, `REVERSED`.
- **Multi-Tenant / Multi-Company Scoping**: `tenant_id` and `company_id` are required, indexed, and enforced via `requireCompanyPermission`.
- **Header GST Fields**: `party_gstin`, `party_state_code`, `place_of_supply`, `supply_type` (`INTRA_STATE` | `INTER_STATE`).
- **Precision Amounts**: `Decimal128` used for `subtotal_amount`, `total_discount_amount`, `total_taxable_amount`, `total_cgst_amount`, `total_sgst_amount`, `total_igst_amount`, `round_off_amount`, `grand_total`, `amount_paid`, and `balance_due`.
- **Linked Records**: `journal_id`, `cogs_journal_id`, `linked_source_document_id`.

### Line Items Schema
Each line supports:
- `line_type`: `ITEM` (stock tracked), `SERVICE` (no inventory movement or COGS), or `ACCOUNT`.
- `stock_item_id`, `godown_id`, `uom_id`, `quantity`, `conversion_factor`, `base_quantity`.
- `unit_rate`, `gross_amount`, `discount_percent`, `discount_amount`, `taxable_amount`.
- Tax splits: `cgst_rate`, `cgst_amount`, `sgst_rate`, `sgst_amount`, `igst_rate`, `igst_amount`.
- Valuation fields: `issue_unit_cost` (moving-average unit cost at posting), `total_cogs_amount`, `stock_movement_id`.

---

## 3. Atomic Multi-Document Transaction Boundary

All database side-effects of posting a commercial transaction occur strictly inside a single MongoDB session transaction (`session.withTransaction`):
1. **Document Validation**: Verifies document exists in `DRAFT` status and matches tenant/company scope.
2. **Fiscal Period Check**: Confirms the posting date falls inside an `OPEN` fiscal period (`LOCKED` or `HARD_CLOSED` periods strictly reject posting).
3. **Stock Control**: Checks godown stock. If `allow_negative_stock` is false, overselling is immediately aborted with `INSUFFICIENT_STOCK` (422).
4. **Moving-Average Costing**: Outward goods issues fetch current `average_unit_cost` from `StockBalance`, freeze `issue_unit_cost`, and compute COGS.
5. **Stock Movement Creation**: Records immutable `StockMovement` entries with direction (`IN` for purchases/returns, `OUT` for sales).
6. **Stock Balance Projection**: Updates `quantity_on_hand` and `total_inventory_value` atomically.
7. **Double-Entry Financial Journals**:
   - Commercial document journal (Receivable / Payable / Revenue / Inventory Asset / GST Output / GST Input / Rounding).
   - Perpetual COGS journal (Debit COGS 5004, Credit Inventory Asset 1201).
8. **Bill-Wise Allocation**: Updates target invoice `amount_paid` and `balance_due`.
9. **Document Transition**: Sets status to `POSTED` and captures audit history.

If any sub-operation fails (e.g., unbalanced journal or insufficient stock), MongoDB rolls back all writes cleanly.
