# Inventory to General Ledger Reconciliation & Catch-Up

## 1. The Opening Stock Deferred Posting Model

Phase 3 established stock masters, Godowns, UOM conversions, and inventory movements with physical opening stock. In Phase 4, opening stock movements transition from inventory-only tracking to full General Ledger alignment.

### Opening Stock GL Catch-Up Architecture
1. **Dry-Run Preview (`GET /api/v1/commercial/opening-stock-gl/preview`)**:
   - Scans unposted opening stock movements (`movement_type = 'OPENING_STOCK'`, `gl_status != 'POSTED'`, `is_reversed = false`).
   - Calculates total opening valuation across all eligible items.
   - Validates that Inventory Asset (`1201`) and Opening Stock Offset Equity Reserve (`3990`) exist and are active.
   - Returns a structured preview including proposed journal entries without mutating database state.
2. **Atomic Catch-Up Posting (`POST /api/v1/commercial/opening-stock-gl/post`)**:
   - Executes inside a MongoDB multi-document transaction session.
   - Creates a balanced double-entry journal entry:
     - `Debit`: Inventory Asset (`1201`) for aggregate opening valuation.
     - `Credit`: Opening Stock Offset Equity Reserve (`3990`) for aggregate opening valuation.
   - Updates each `StockMovement`:
     - `gl_status = 'POSTED'`
     - `gl_journal_id = journal._id`
     - `gl_posted_at = new Date()`
   - Guarantees strict idempotency: re-executing against already posted movements returns `count: 0, posted: false` without creating duplicate journals.

---

## 2. Stock-to-GL Subledger Reconciliation (`GET /api/v1/commercial/reports/stock-gl-reconciliation`)

Reconciles the Inventory Subledger (`StockBalance`) against the Financial General Ledger (`LedgerAccount` code `1201`):

$$\text{Subledger Valuation} = \sum_{\text{items}} \text{quantity\_on\_hand} \times \text{average\_unit\_cost}$$
$$\text{GL Valuation} = \text{Current Balance of Account 1201 (Debit)}$$
$$\text{Variance} = \text{Subledger Valuation} - \text{GL Valuation}$$

- If $\text{Variance} = 0$: Report status is `RECONCILED`.
- If $\text{Variance} \neq 0$: Report status is `VARIANCE_DETECTED` with an audit breakdown of item valuations and accounts.
