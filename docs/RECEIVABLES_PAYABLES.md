# Receivables, Payables & Bill-Wise Outstanding Architecture

## 1. Bill-Wise Allocation Model (`BillAllocation`)

TallyVeridexERP supports bill-by-bill accounting for Trade Receivables and Trade Payables.

### The Allocation Flow
1. **Document Tracking**:
   - Every Sales and Purchase Invoice begins with:
     $$\text{amount\_paid} = 0.00, \quad \text{balance\_due} = \text{grand\_total}$$
2. **Payment Allocation**:
   - When a Customer Receipt or Supplier Payment is posted with an `allocations` payload:
     - `allocations: [{ invoice_id, amount }]`
   - A `BillAllocation` record is created linking `payment_document_id` and `invoice_document_id` with `allocated_amount`.
   - The invoice balance is adjusted within the MongoDB transaction:
     $$\text{amount\_paid} = \text{amount\_paid} + \text{allocated\_amount}$$
     $$\text{balance\_due} = \text{balance\_due} - \text{allocated\_amount}$$
3. **Overpayment & Allocation Integrity**:
   - Rejects allocation if `allocated_amount > balance_due` of the target invoice.
   - Rejects allocation if total allocated amount exceeds the payment document amount.
   - Rejects allocation if target invoice is in `DRAFT` status or belongs to a different party.
4. **Reversal Propagation**:
   - Reversing a payment document marks its `BillAllocation` records as `REVERSED` and atomically restores `balance_due` on all linked invoices.

---

## 2. Outstanding Reports (`GET /api/v1/commercial/reports/outstanding`)

- Supports `party_type = 'CUSTOMER'` (Receivables) and `party_type = 'SUPPLIER'` (Payables).
- Aggregates by counterparty:
  - `total_invoiced`: Sum of grand totals of open invoices.
  - `total_paid`: Sum of allocated receipts / payments.
  - `total_outstanding`: Current outstanding balance due.
  - `invoices`: Array of open bills with bill date, due date, aging, and remaining balance.
