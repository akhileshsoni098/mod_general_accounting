# Tax and GST Configuration (India-First)

## 1. Supply Classification Engine (`gstTaxService.js`)

TallyVeridexERP implements India's Goods and Services Tax (GST) principles:

### State Code Normalization
- Indian states are identified by standardized 2-digit GST codes (`01` through `38` and `97`).
- `normalizeStateCode` extracts 2-digit state codes from 15-character GSTINs, state names, or explicit codes.

### Determination Rules
- **Intra-state Supply**: When Seller State Code equals Buyer / Place of Supply State Code.
  - Tax split: Equal parts Central GST (CGST) and State GST (SGST).
  - Example (18% GST): $9\%$ CGST + $9\%$ SGST.
- **Inter-state Supply**: When Seller State Code differs from Buyer / Place of Supply State Code.
  - Tax application: Integrated GST (IGST) at the full rate.
  - Example (18% GST): $18\%$ IGST.

---

## 2. Tax Calculation Mechanics

For each document line item:
$$\text{Gross Amount} = \text{Quantity} \times \text{Unit Rate}$$
$$\text{Discount Amount} = \text{Gross Amount} \times \frac{\text{Discount \%}}{100}$$
$$\text{Taxable Amount} = \text{Gross Amount} - \text{Discount Amount}$$

### Split Allocation
- **Intra-state**:
  $$\text{CGST Rate} = \frac{\text{Tax Rate}}{2}, \quad \text{CGST Amount} = \text{Taxable Amount} \times \frac{\text{CGST Rate}}{100}$$
  $$\text{SGST Rate} = \frac{\text{Tax Rate}}{2}, \quad \text{SGST Amount} = \text{Taxable Amount} \times \frac{\text{SGST Rate}}{100}$$
  $$\text{IGST Amount} = 0.00$$
- **Inter-state**:
  $$\text{IGST Rate} = \text{Tax Rate}, \quad \text{IGST Amount} = \text{Taxable Amount} \times \frac{\text{IGST Rate}}{100}$$
  $$\text{CGST Amount} = 0.00, \quad \text{SGST Amount} = 0.00$$

All arithmetic is executed using `bignumber.js` with standard 2-decimal-place rounding (`ROUND_HALF_UP`).

---

## 3. GST Rate Catalog (`TaxRateConfig`)

Standard tax codes seeded per company:
| Tax Code | Rate | Component Split (Intra-state) | Description |
| :--- | :--- | :--- | :--- |
| `GST_0` | 0% | 0% CGST + 0% SGST | Nil rated & exempt goods |
| `GST_5` | 5% | 2.5% CGST + 2.5% SGST | Essential commodities & transport |
| `GST_12` | 12% | 6% CGST + 6% SGST | Processed foods & hardware |
| `GST_18` | 18% | 9% CGST + 9% SGST | Standard industrial goods & IT services |
| `GST_28` | 28% | 14% CGST + 14% SGST | Luxury items & motor vehicles |
