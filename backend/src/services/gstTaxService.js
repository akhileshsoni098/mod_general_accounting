const BigNumber = require('bignumber.js');
const { TaxRateConfig, Company, Party } = require('../models');

// Standard 2-digit Indian State Codes per GST specification
const GST_STATE_CODES = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory'
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Validates format of an Indian GSTIN.
 */
function validateGstin(gstin) {
  if (!gstin) return { valid: false, reason: 'GSTIN is empty' };
  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) {
    return { valid: false, reason: `GSTIN must be exactly 15 characters, got ${clean.length}` };
  }
  if (!GSTIN_REGEX.test(clean)) {
    return { valid: false, reason: `Invalid GSTIN pattern: "${clean}"` };
  }
  const stateCode = clean.substring(0, 2);
  if (!GST_STATE_CODES[stateCode]) {
    return { valid: false, reason: `Unknown GST state code: "${stateCode}"` };
  }
  return { valid: true, state_code: stateCode, state_name: GST_STATE_CODES[stateCode] };
}

/**
 * Extracts 2-digit GST state code from a state name or GSTIN or code.
 */
function normalizeStateCode(input) {
  if (!input) return '';
  const clean = String(input).trim().toUpperCase();
  if (GST_STATE_CODES[clean]) return clean;
  if (clean.length === 15 && GSTIN_REGEX.test(clean)) {
    return clean.substring(0, 2);
  }
  for (const [code, name] of Object.entries(GST_STATE_CODES)) {
    if (name.toUpperCase() === clean || name.toUpperCase().includes(clean)) {
      return code;
    }
  }
  return clean;
}

/**
 * Determines whether the supply is INTRA_STATE (CGST + SGST) or INTER_STATE (IGST).
 *
 * @param {Object} params
 * @param {string} params.companyStateCode
 * @param {string} params.partyStateCode
 * @param {string} [params.placeOfSupply]
 * @returns {'INTRA_STATE' | 'INTER_STATE'}
 */
function determineSupplyType({ companyStateCode, partyStateCode, placeOfSupply }) {
  const normCompany = normalizeStateCode(companyStateCode);
  const normParty = normalizeStateCode(placeOfSupply || partyStateCode);

  if (!normCompany || !normParty) {
    // If one is undefined or unknown, default to INTRA_STATE if they match, else INTRA_STATE
    return normCompany === normParty ? 'INTRA_STATE' : 'INTER_STATE';
  }
  return normCompany === normParty ? 'INTRA_STATE' : 'INTER_STATE';
}

/**
 * Calculates line amounts, discounts, taxable value, and GST splits.
 *
 * @param {Object} lineInput
 * @param {number|string} lineInput.quantity
 * @param {number|string} lineInput.unit_rate
 * @param {number|string} [lineInput.discount_percent=0]
 * @param {number|string} [lineInput.discount_amount=0]
 * @param {number|string} [lineInput.tax_rate=0]
 * @param {'INTRA_STATE' | 'INTER_STATE'} [lineInput.supply_type='INTRA_STATE']
 * @param {boolean} [lineInput.is_tax_inclusive=false]
 * @returns {Object} Calculated line fields with Decimal string values
 */
function calculateLineTax(lineInput) {
  const isTaxInclusive = Boolean(lineInput.is_tax_inclusive);
  const qty = new BigNumber(lineInput.quantity ? lineInput.quantity.toString() : '1');
  const rate = new BigNumber(lineInput.unit_rate ? lineInput.unit_rate.toString() : '0');
  const gross = qty.times(rate);

  let discAmt = new BigNumber(0);
  if (lineInput.discount_amount && new BigNumber(lineInput.discount_amount.toString()).isGreaterThan(0)) {
    discAmt = new BigNumber(lineInput.discount_amount.toString());
  } else if (lineInput.discount_percent && new BigNumber(lineInput.discount_percent.toString()).isGreaterThan(0)) {
    const discPct = new BigNumber(lineInput.discount_percent.toString());
    discAmt = gross.times(discPct).dividedBy(100);
  }

  if (discAmt.isGreaterThan(gross)) {
    discAmt = gross;
  }

  const totalTaxRate = new BigNumber(lineInput.tax_rate !== undefined && lineInput.tax_rate !== null ? lineInput.tax_rate.toString() : '0');
  const supplyType = lineInput.supply_type || 'INTRA_STATE';

  let taxable;
  let totalTax;

  if (isTaxInclusive && totalTaxRate.isGreaterThan(0)) {
    // Net inclusive amount after discount
    const netInclusive = gross.minus(discAmt);
    // Taxable = netInclusive / (1 + taxRate/100)
    const factor = new BigNumber(1).plus(totalTaxRate.dividedBy(100));
    taxable = netInclusive.dividedBy(factor).dp(2, BigNumber.ROUND_HALF_UP);
    totalTax = netInclusive.minus(taxable);
  } else {
    taxable = gross.minus(discAmt);
    totalTax = totalTaxRate.isGreaterThan(0) && taxable.isGreaterThan(0)
      ? taxable.times(totalTaxRate).dividedBy(100).dp(2, BigNumber.ROUND_HALF_UP)
      : new BigNumber(0);
  }

  let cgstRate = new BigNumber(0);
  let cgstAmt = new BigNumber(0);
  let sgstRate = new BigNumber(0);
  let sgstAmt = new BigNumber(0);
  let igstRate = new BigNumber(0);
  let igstAmt = new BigNumber(0);

  if (totalTaxRate.isGreaterThan(0) && taxable.isGreaterThan(0)) {
    if (supplyType === 'INTRA_STATE') {
      cgstRate = totalTaxRate.dividedBy(2);
      sgstRate = totalTaxRate.dividedBy(2);
      cgstAmt = taxable.times(cgstRate).dividedBy(100).dp(2, BigNumber.ROUND_HALF_UP);
      sgstAmt = isTaxInclusive ? totalTax.minus(cgstAmt) : taxable.times(sgstRate).dividedBy(100).dp(2, BigNumber.ROUND_HALF_UP);
    } else {
      igstRate = totalTaxRate;
      igstAmt = totalTax;
    }
  }

  const computedTotalTax = cgstAmt.plus(sgstAmt).plus(igstAmt);
  const totalAmt = taxable.plus(computedTotalTax);

  return {
    quantity: qty.toFixed(4),
    unit_rate: rate.toFixed(2),
    gross_amount: gross.toFixed(2),
    discount_percent: lineInput.discount_percent ? new BigNumber(lineInput.discount_percent.toString()).toFixed(2) : '0.00',
    discount_amount: discAmt.toFixed(2),
    taxable_amount: taxable.toFixed(2),
    tax_rate: totalTaxRate.toFixed(2),
    cgst_rate: cgstRate.toFixed(2),
    cgst_amount: cgstAmt.toFixed(2),
    sgst_rate: sgstRate.toFixed(2),
    sgst_amount: sgstAmt.toFixed(2),
    igst_rate: igstRate.toFixed(2),
    igst_amount: igstAmt.toFixed(2),
    total_tax: computedTotalTax.toFixed(2),
    total_amount: totalAmt.toFixed(2),
    is_tax_inclusive: isTaxInclusive
  };
}

/**
 * Computes document-level totals and rounding for an array of lines.
 *
 * @param {Array<Object>} lines
 * @param {boolean} [enableRoundOff=true] - Rounds grand total to nearest integer rupee
 * @returns {Object}
 */
function calculateDocumentTotals(lines, { enableRoundOff = true } = {}) {
  let subtotal = new BigNumber(0);
  let totalDiscount = new BigNumber(0);
  let totalTaxable = new BigNumber(0);
  let totalCgst = new BigNumber(0);
  let totalSgst = new BigNumber(0);
  let totalIgst = new BigNumber(0);

  for (const l of lines) {
    subtotal = subtotal.plus(new BigNumber(l.gross_amount || 0));
    totalDiscount = totalDiscount.plus(new BigNumber(l.discount_amount || 0));
    totalTaxable = totalTaxable.plus(new BigNumber(l.taxable_amount || 0));
    totalCgst = totalCgst.plus(new BigNumber(l.cgst_amount || 0));
    totalSgst = totalSgst.plus(new BigNumber(l.sgst_amount || 0));
    totalIgst = totalIgst.plus(new BigNumber(l.igst_amount || 0));
  }

  const totalTax = totalCgst.plus(totalSgst).plus(totalIgst);
  const unroundedTotal = totalTaxable.plus(totalTax);

  let grandTotal = unroundedTotal;
  let roundOff = new BigNumber(0);

  if (enableRoundOff) {
    // Nearest whole currency unit
    const rounded = unroundedTotal.dp(0, BigNumber.ROUND_HALF_UP);
    roundOff = rounded.minus(unroundedTotal);
    grandTotal = rounded;
  }

  return {
    subtotal_amount: subtotal.toFixed(2),
    total_discount_amount: totalDiscount.toFixed(2),
    total_taxable_amount: totalTaxable.toFixed(2),
    total_cgst_amount: totalCgst.toFixed(2),
    total_sgst_amount: totalSgst.toFixed(2),
    total_igst_amount: totalIgst.toFixed(2),
    total_tax_amount: totalTax.toFixed(2),
    round_off_amount: roundOff.toFixed(2),
    grand_total: grandTotal.toFixed(2)
  };
}

/**
 * Seeds standard Indian GST rates (0%, 5%, 12%, 18%, 28%) for a company if not present.
 */
async function seedDefaultTaxRates(tenantId, companyId, options = {}) {
  const standardRates = [
    { tax_code: 'GST_0', tax_name: 'GST 0% (Exempt / Nil Rated)', rate_percent: '0.00', cgst_rate: '0.00', sgst_rate: '0.00', igst_rate: '0.00' },
    { tax_code: 'GST_5', tax_name: 'GST 5% (Concessional Goods/Services)', rate_percent: '5.00', cgst_rate: '2.50', sgst_rate: '2.50', igst_rate: '5.00' },
    { tax_code: 'GST_12', tax_name: 'GST 12% (Standard Lower Rate)', rate_percent: '12.00', cgst_rate: '6.00', sgst_rate: '6.00', igst_rate: '12.00' },
    { tax_code: 'GST_18', tax_name: 'GST 18% (Standard Rate)', rate_percent: '18.00', cgst_rate: '9.00', sgst_rate: '9.00', igst_rate: '18.00' },
    { tax_code: 'GST_28', tax_name: 'GST 28% (Higher / Luxury Rate)', rate_percent: '28.00', cgst_rate: '14.00', sgst_rate: '14.00', igst_rate: '28.00' }
  ];

  for (const r of standardRates) {
    await TaxRateConfig.findOneAndUpdate(
      { tenant_id: tenantId, company_id: companyId, tax_code: r.tax_code },
      {
        tenant_id: tenantId,
        company_id: companyId,
        tax_code: r.tax_code,
        tax_name: r.tax_name,
        rate_percent: r.rate_percent,
        cgst_rate: r.cgst_rate,
        sgst_rate: r.sgst_rate,
        igst_rate: r.igst_rate,
        applicable_to: 'BOTH',
        is_active: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
    );
  }
}

/**
 * Settles Indian GST Output Liability against Input Tax Credit (ITC)
 * and posts the Double-Entry Settlement & Payment Journal to General Ledger.
 */
async function settleGstReturn({
  tenantId,
  companyId,
  userId,
  bankAccountCode = '1002',
  startDate,
  endDate,
  periodLabel,
  notes
}) {
  const { getTaxSummaryReport } = require('./commercialReportService');
  const { getOrCreatePostingConfig } = require('./commercialPostingConfigService');
  const { postJournalEntry } = require('./journalPostingService');
  const { Company } = require('../models');

  const company = await Company.findById(companyId);
  const config = await getOrCreatePostingConfig(tenantId, companyId);
  const report = await getTaxSummaryReport(tenantId, companyId, { startDate, endDate });

  const outCgst = new BigNumber(report.outward_supplies?.total_cgst || 0);
  const outSgst = new BigNumber(report.outward_supplies?.total_sgst || 0);
  const outIgst = new BigNumber(report.outward_supplies?.total_igst || 0);
  const totalOut = outCgst.plus(outSgst).plus(outIgst);

  const inCgst = new BigNumber(report.inward_supplies?.total_cgst || 0);
  const inSgst = new BigNumber(report.inward_supplies?.total_sgst || 0);
  const inIgst = new BigNumber(report.inward_supplies?.total_igst || 0);
  const totalIn = inCgst.plus(inSgst).plus(inIgst);

  // Set-off calculation (CGST with CGST, SGST with SGST, IGST with IGST)
  const utilCgst = BigNumber.min(outCgst, inCgst);
  const utilSgst = BigNumber.min(outSgst, inSgst);
  const utilIgst = BigNumber.min(outIgst, inIgst);

  const netCgstPayable = BigNumber.max(0, outCgst.minus(inCgst));
  const netSgstPayable = BigNumber.max(0, outSgst.minus(inSgst));
  const netIgstPayable = BigNumber.max(0, outIgst.minus(inIgst));
  const netCashPayable = netCgstPayable.plus(netSgstPayable).plus(netIgstPayable);

  const remainingItmCgst = BigNumber.max(0, inCgst.minus(outCgst));
  const remainingItmSgst = BigNumber.max(0, inSgst.minus(outSgst));
  const remainingItmIgst = BigNumber.max(0, inIgst.minus(outIgst));
  const totalRemainingItc = remainingItmCgst.plus(remainingItmSgst).plus(remainingItmIgst);

  // Build Double-Entry Journal Lines
  const lines = [];
  if (outCgst.isGreaterThan(0)) {
    lines.push({
      account_code: config.output_cgst_account_code || '2101',
      direction: 'DEBIT',
      debit: outCgst.toFixed(2),
      credit: '0.00',
      memo: `Clear Output CGST Liability for ${periodLabel || 'GST Period'}`
    });
  }
  if (outSgst.isGreaterThan(0)) {
    lines.push({
      account_code: config.output_sgst_account_code || '2102',
      direction: 'DEBIT',
      debit: outSgst.toFixed(2),
      credit: '0.00',
      memo: `Clear Output SGST Liability for ${periodLabel || 'GST Period'}`
    });
  }
  if (outIgst.isGreaterThan(0)) {
    lines.push({
      account_code: config.output_igst_account_code || '2103',
      direction: 'DEBIT',
      debit: outIgst.toFixed(2),
      credit: '0.00',
      memo: `Clear Output IGST Liability for ${periodLabel || 'GST Period'}`
    });
  }

  if (utilCgst.isGreaterThan(0)) {
    lines.push({
      account_code: config.input_cgst_account_code || '1301',
      direction: 'CREDIT',
      debit: '0.00',
      credit: utilCgst.toFixed(2),
      memo: `Utilize Input CGST Credit (ITC) for ${periodLabel || 'GST Period'}`
    });
  }
  if (utilSgst.isGreaterThan(0)) {
    lines.push({
      account_code: config.input_sgst_account_code || '1302',
      direction: 'CREDIT',
      debit: '0.00',
      credit: utilSgst.toFixed(2),
      memo: `Utilize Input SGST Credit (ITC) for ${periodLabel || 'GST Period'}`
    });
  }
  if (utilIgst.isGreaterThan(0)) {
    lines.push({
      account_code: config.input_igst_account_code || '1303',
      direction: 'CREDIT',
      debit: '0.00',
      credit: utilIgst.toFixed(2),
      memo: `Utilize Input IGST Credit (ITC) for ${periodLabel || 'GST Period'}`
    });
  }

  if (netCashPayable.isGreaterThan(0)) {
    lines.push({
      account_code: bankAccountCode || config.bank_account_code || '1002',
      direction: 'CREDIT',
      debit: '0.00',
      credit: netCashPayable.toFixed(2),
      memo: `GST Challan Tax Payment from Bank for ${periodLabel || 'GST Period'}`
    });
  }

  let journalResult = null;
  if (lines.length >= 2) {
    const todayStr = new Date().toISOString().split('T')[0];
    journalResult = await postJournalEntry({
      tenantId,
      companyId,
      userId,
      postingDate: todayStr,
      sourceModule: 'TAX_GST',
      referenceId: `GST-SETTLE-${companyId}-${Date.now()}`,
      memo: `GST Tax Settlement & ITC Set-off: ${periodLabel || todayStr} (${notes || 'Statutory Offset'})`,
      currency: company?.base_currency || 'INR',
      accountingBasis: 'GAAP',
      lines
    });
  }

  return {
    period: periodLabel || 'Current Period',
    output_tax: {
      cgst: outCgst.toFixed(2),
      sgst: outSgst.toFixed(2),
      igst: outIgst.toFixed(2),
      total: totalOut.toFixed(2)
    },
    input_tax_credit: {
      cgst: inCgst.toFixed(2),
      sgst: inSgst.toFixed(2),
      igst: inIgst.toFixed(2),
      total: totalIn.toFixed(2)
    },
    utilized_itc: {
      cgst: utilCgst.toFixed(2),
      sgst: utilSgst.toFixed(2),
      igst: utilIgst.toFixed(2),
      total: utilCgst.plus(utilSgst).plus(utilIgst).toFixed(2)
    },
    net_tax_payable: {
      cgst: netCgstPayable.toFixed(2),
      sgst: netSgstPayable.toFixed(2),
      igst: netIgstPayable.toFixed(2),
      total: netCashPayable.toFixed(2)
    },
    remaining_itc_balance: {
      cgst: remainingItmCgst.toFixed(2),
      sgst: remainingItmSgst.toFixed(2),
      igst: remainingItmIgst.toFixed(2),
      total: totalRemainingItc.toFixed(2)
    },
    journal: journalResult?.journal || null,
    message: netCashPayable.isGreaterThan(0)
      ? `GST Output Liability set off against ITC. Net payment of ₹${netCashPayable.toFixed(2)} posted to GL.`
      : `GST Output Liability fully covered by ITC. No cash payment needed. Unutilized ITC of ₹${totalRemainingItc.toFixed(2)} carried forward.`
  };
}

module.exports = {
  GST_STATE_CODES,
  validateGstin,
  normalizeStateCode,
  determineSupplyType,
  calculateLineTax,
  calculateDocumentTotals,
  seedDefaultTaxRates,
  settleGstReturn
};
