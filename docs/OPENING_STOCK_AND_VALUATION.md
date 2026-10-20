# TallyVeridexERP — Phase 3: Opening Stock and Inventory Valuation

## 1. Overview & Business Requirements

Opening stock establishes the baseline inventory quantities, godown locations, and valuation for a company when transitioning from a legacy software package or opening a new fiscal year.

In TallyVeridexERP, opening stock is treated as a first-class inventory transaction governed by strict accounting safeguards:
1. **Idempotent Single-Posting Guarantee**:
   Each `{ item_id, godown_id }` pair permits exactly one opening stock posting. Subsequent attempts to record opening stock for the same item in the same godown return `409 Conflict (OPENING_STOCK_ALREADY_POSTED)`. Corrections must be executed via audit adjustments or compensating reversals.
2. **Tolerance Validation**:
   `quantity * unit_rate = total_cost` is validated using arbitrary-precision arithmetic (`bignumber.js`) within a \(\pm 0.02\) rounding tolerance.
3. **Atomic Ledger-and-Balance Execution**:
   The immutable `StockMovement` ledger document and the projected `StockBalance` document are created/updated within an atomic transactional boundary.

---

## 2. Moving Average Costing Formula

When inventory flows in, TallyVeridexERP updates the weighted moving-average unit cost:

$$\text{New Average Cost} = \frac{\text{Current Total Inventory Value} + \text{Inflow Total Cost}}{\text{Current Quantity on Hand} + \text{Inflow Base Quantity}}$$

For opening stock:
- Initial \(\text{Current Quantity on Hand} = 0\).
- Initial \(\text{Current Total Inventory Value} = 0\).
- Therefore, \(\text{Initial Average Unit Cost} = \text{Opening Unit Rate}\).

---

## 3. Alternate UOM Ingestion Example

A user records opening stock in packaging units (e.g. `5 BOX`):

1. **Item Definition (`BOLT_M8`)**:
   - Base UOM: `PCS`
   - Alternate Conversion: `1 BOX = 10 PCS`
2. **Opening Stock Payload**:
   - Item: `BOLT_M8`
   - Godown: `WH_EAST`
   - Quantity: `5`
   - UOM: `BOX`
   - Unit Rate: `₹50.00 / BOX`
   - Total Cost: `₹250.00`
3. **Ledger Result (`StockMovement`)**:
   - `quantity`: `5` (BOX)
   - `base_quantity`: `50` (PCS)
   - `unit_rate`: `₹5.00` (per base unit)
   - `total_cost`: `₹250.00`
4. **Materialized Balance (`StockBalance`)**:
   - `quantity_on_hand`: `50.0000 PCS`
   - `average_unit_cost`: `₹5.00`
   - `total_inventory_value`: `₹250.00`

---

## 4. Phase 4 General Ledger Suspense Boundary

In traditional manual bookkeeping, opening inventory entries require a balancing credit to equity or suspense (e.g., `Opening Balance Equity` or `Inventory Suspense`).

### Integration Boundary Specification
In Phase 3:
- The opening stock API sets `gl_status: 'DEFERRED_TO_PHASE_4'`.
- No ledger journals are created to prevent corrupting the chart of accounts before the dynamic GL posting engine and account configuration are integrated.
- In Phase 4, when commercial vouchers and dynamic GL mapping are activated, opening stock records will post balancing journal entries:
  - **Debit**: `1300 - Merchandise Inventory` (\(\$250.00\))
  - **Credit**: `3999 - Opening Balance Equity / Suspense` (\(\$250.00\))
