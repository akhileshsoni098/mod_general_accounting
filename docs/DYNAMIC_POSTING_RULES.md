# Dynamic Posting Rules & Ledger Mapping Engine

## 1. Dynamic Accounting Core

TallyVeridexERP eliminates hardcoded debit/credit routines by utilizing dynamic rules (`PostingRule` and `PostingRuleLine`) paired with company-scoped posting configurations (`CompanyPostingConfig`).

### Supported Commercial Rule Profiles
1. **Sales Invoice (`RULE_COMMERCIAL_SALES_INVOICE`)**:
   - `DR` Trade Receivables (`1101`): `payload.grand_total`
   - `CR` Sales Revenue (`4001`): `payload.total_taxable_amount`
   - `CR` Output CGST (`2101`): `payload.total_cgst_amount`
   - `CR` Output SGST (`2102`): `payload.total_sgst_amount`
   - `CR` Output IGST (`2103`): `payload.total_igst_amount`
   - `CR` Round-Off Difference (`5900`): `payload.round_off_amount`

2. **Perpetual Inventory COGS (`RULE_COMMERCIAL_SALES_COGS`)**:
   - `DR` Cost of Goods Sold (`5004`): `payload.total_cogs_amount`
   - `CR` Inventory Asset (`1201`): `payload.total_cogs_amount`

3. **Purchase Invoice (`RULE_COMMERCIAL_PURCHASE_INVOICE`)**:
   - `DR` Inventory Asset (`1201`): `payload.total_taxable_amount`
   - `DR` Input CGST Credit (`1301`): `payload.total_cgst_amount`
   - `DR` Input SGST Credit (`1302`): `payload.total_sgst_amount`
   - `DR` Input IGST Credit (`1303`): `payload.total_igst_amount`
   - `DR` Round-Off Difference (`5900`): `payload.round_off_amount`
   - `CR` Trade Payables (`2001`): `payload.grand_total`

4. **Customer Receipt (`RULE_COMMERCIAL_RECEIPT`)**:
   - `DR` Bank / Cash Account (`1001` / `1002`): `payload.amount`
   - `CR` Trade Receivables (`1101`): `payload.amount`

5. **Supplier Payment (`RULE_COMMERCIAL_PAYMENT`)**:
   - `DR` Trade Payables (`2001`): `payload.amount`
   - `CR` Bank / Cash Account (`1001` / `1002`): `payload.amount`

6. **Sales Return (`RULE_COMMERCIAL_SALES_RETURN`)**:
   - `DR` Sales Returns Revenue Adjustment (`4001`): `payload.total_taxable_amount`
   - `DR` Reverse Output CGST (`2101`): `payload.total_cgst_amount`
   - `DR` Reverse Output SGST (`2102`): `payload.total_sgst_amount`
   - `DR` Reverse Output IGST (`2103`): `payload.total_igst_amount`
   - `CR` Trade Receivables (`1101`): `payload.grand_total`

7. **Opening Stock GL Catch-up (`RULE_COMMERCIAL_OPENING_STOCK`)**:
   - `DR` Inventory Asset (`1201`): `payload.total_amount`
   - `CR` Opening Stock Offset Equity Reserve (`3990`): `payload.total_amount`

---

## 2. Company Posting Configuration (`CompanyPostingConfig`)

Every company maintains its own ledger code mappings:
- `trade_receivables_account_code`: default `1101`
- `trade_payables_account_code`: default `2001`
- `sales_revenue_account_code`: default `4001`
- `inventory_asset_account_code`: default `1201`
- `cogs_account_code`: default `5004`
- `input_cgst_account_code` / `input_sgst_account_code` / `input_igst_account_code`: `1301` / `1302` / `1303`
- `output_cgst_account_code` / `output_sgst_account_code` / `output_igst_account_code`: `2101` / `2102` / `2103`
- `opening_stock_offset_account_code`: default `3990`
- `round_off_account_code`: default `5900`
- `default_bank_account_code` / `default_cash_account_code`: `1002` / `1001`
- `allow_negative_stock`: boolean (default `false`)
