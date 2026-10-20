# Sales and Purchase Accounting & Inventory Costing

## 1. Purchase Accounting & Stock Receipt

When a Purchase Invoice is posted:
1. **Goods Capitalization**:
   - Stock movement recorded with `movement_type = 'PURCHASE_RECEIPT'`, `direction = 'IN'`.
   - Quantity is converted to the item's `base_uom_id` via `convertToBaseQuantity`.
   - Line unit cost is calculated as `taxable_amount / base_quantity`.
2. **Moving-Average Cost Recalculation**:
   - Projected `StockBalance` is updated:
     $$\text{New Total Value} = \text{Current Total Value} + \text{Receipt Cost}$$
     $$\text{New Quantity} = \text{Current Quantity} + \text{Receipt Quantity}$$
     $$\text{New Average Unit Cost} = \frac{\text{New Total Value}}{\text{New Quantity}}$$
3. **Double-Entry Persistence**:
   - Debit: Inventory Asset (`1201`) for taxable inventory value.
   - Debit: Input GST accounts (`1301`/`1302`/`1303`) for recoverable tax.
   - Credit: Trade Payables (`2001`) for invoice grand total.

---

## 2. Sales Accounting, COGS & Perpetual Inventory

When a Sales Invoice is posted:
1. **Stock Valuation & Issue**:
   - The current `average_unit_cost` is fetched from `StockBalance`.
   - Line `issue_unit_cost` is locked in at posting time.
   - COGS is calculated as:
     $$\text{Line COGS} = \text{Base Quantity} \times \text{Issue Unit Cost}$$
   - Stock movement recorded with `movement_type = 'SALES_ISSUE'`, `direction = 'OUT'`.
2. **Stock Balance Relief**:
   - `quantity_on_hand` is decreased by `base_quantity`.
   - `total_inventory_value` is decreased by `total_cogs_amount`.
   - `average_unit_cost` remains unchanged during goods issue.
3. **Double-Entry Revenue & COGS Journals**:
   - **Primary Journal**:
     - Debit: Trade Receivables (`1101`) for invoice grand total.
     - Credit: Sales Revenue (`4001`) for taxable amount.
     - Credit: Output GST accounts (`2101`/`2102`/`2103`) for tax liability.
   - **Linked Perpetual COGS Journal**:
     - Debit: Cost of Goods Sold (`5004`) for total COGS.
     - Credit: Inventory Asset (`1201`) for total COGS.
4. **Service Lines**:
   - Lines with `line_type = 'SERVICE'` or stock items with `is_stock_tracked = false` generate revenue and tax entries but do not create stock movements or COGS entries.

---

## 3. Restockable Returns & Full Reversals

- **Sales Return (`SALES_RETURN`)**:
  - Restores inventory quantity and valuation if `restockable: true`.
  - Reverses sales revenue, output GST liabilities, and credits customer receivable.
  - Automatically reverses linked COGS from inventory asset.
- **Document Reversal (`/documents/:id/reverse`)**:
  - Creates linked compensating opposite entries for primary and COGS journals (`reverseJournalEntry`).
  - Records opposite stock movements (`reversalOfMovementId`).
  - Restores original target invoice balances if receipts or payments are reversed.
