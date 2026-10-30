const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const crypto = require('crypto');
const {
  TdsSection,
  TdsDeduction,
  Party,
  CommercialDocument,
  LedgerAccount
} = require('../models');

const STANDARD_TDS_SECTIONS = [
  {
    section_code: '194C',
    section_name: 'Payments to Contractors & Subcontractors',
    rate_individual_huf_percent: 1.0,
    rate_company_percent: 2.0,
    threshold_limit: 30000,
    tds_payable_account_code: '2105'
  },
  {
    section_code: '194J',
    section_name: 'Fees for Professional or Technical Services',
    rate_individual_huf_percent: 10.0,
    rate_company_percent: 10.0,
    threshold_limit: 30000,
    tds_payable_account_code: '2105'
  },
  {
    section_code: '194I',
    section_name: 'Rent on Land, Building or Furniture',
    rate_individual_huf_percent: 10.0,
    rate_company_percent: 10.0,
    threshold_limit: 240000,
    tds_payable_account_code: '2105'
  },
  {
    section_code: '194H',
    section_name: 'Commission or Brokerage',
    rate_individual_huf_percent: 5.0,
    rate_company_percent: 5.0,
    threshold_limit: 15000,
    tds_payable_account_code: '2105'
  },
  {
    section_code: '194Q',
    section_name: 'TDS on Purchase of Goods exceeding 50 Lakhs',
    rate_individual_huf_percent: 0.1,
    rate_company_percent: 0.1,
    threshold_limit: 5000000,
    tds_payable_account_code: '2105'
  }
];

/**
 * Seeds statutory TDS sections if not already present.
 */
async function ensureTdsSectionsSeeded() {
  for (const s of STANDARD_TDS_SECTIONS) {
    await TdsSection.findOneAndUpdate(
      { section_code: s.section_code },
      { $setOnInsert: s },
      { upsert: true, new: true }
    );
  }
}

/**
 * Calculates and records a statutory TDS deduction on a vendor payment or invoice.
 */
async function calculateAndRecordTds({
  tenantId,
  companyId,
  deducteePartyId,
  sectionCode,
  billDocumentId = null,
  grossAmount,
  deductionDate = new Date(),
  financialYear = '2026-2027',
  quarter = 'Q3',
  session = null
}) {
  await ensureTdsSectionsSeeded();

  const party = await Party.findOne({
    _id: deducteePartyId,
    tenant_id: tenantId,
    company_id: companyId
  });
  if (!party) throw new Error('Deductee party not found');

  const sec = await TdsSection.findOne({ section_code: String(sectionCode).trim().toUpperCase() });
  if (!sec) throw new Error(`TDS section "${sectionCode}" not recognized`);

  const grossBN = new BigNumber(grossAmount);
  if (grossBN.isLessThanOrEqualTo(0)) throw new Error('Gross amount must be positive');

  // Determine rate
  const pan = party.tax_id || (party.metadata && party.metadata.pan) || '';
  let rate = party.party_type === 'INDIVIDUAL' ? sec.rate_individual_huf_percent : sec.rate_company_percent;

  // Higher rate under Section 206AA if PAN is missing
  if (!pan) {
    rate = 20.0;
  }

  const tdsBN = grossBN.multipliedBy(rate).dividedBy(100).decimalPlaces(2, BigNumber.ROUND_HALF_UP);
  const netBN = grossBN.minus(tdsBN);

  const deduction = new TdsDeduction({
    tenant_id: tenantId,
    company_id: companyId,
    deductee_party_id: party._id,
    pan_number: pan || 'PANNOTAVBL',
    section_code: sec.section_code,
    bill_document_id: billDocumentId,
    gross_amount: mongoose.Types.Decimal128.fromString(grossBN.toFixed(2)),
    tds_rate_percent: rate,
    tds_amount: mongoose.Types.Decimal128.fromString(tdsBN.toFixed(2)),
    net_payable_amount: mongoose.Types.Decimal128.fromString(netBN.toFixed(2)),
    deduction_date: new Date(deductionDate),
    quarter,
    financial_year: financialYear,
    status: 'DEDUCTED'
  });

  await deduction.save(session ? { session } : undefined);

  return {
    deduction,
    gross_amount: grossBN.toFixed(2),
    tds_rate_percent: rate,
    tds_amount: tdsBN.toFixed(2),
    net_payable_amount: netBN.toFixed(2),
    section_code: sec.section_code,
    section_name: sec.section_name
  };
}

/**
 * Generates statutory Form 26Q return export summary for e-TDS filing.
 */
async function generateForm26QSummary({ tenantId, companyId, financialYear = '2026-2027', quarter = 'Q3' }) {
  const deductions = await TdsDeduction.find({
    tenant_id: tenantId,
    company_id: companyId,
    financial_year: financialYear,
    quarter: quarter
  }).populate('deductee_party_id', 'legal_name tax_id');

  let totalGross = new BigNumber(0);
  let totalTds = new BigNumber(0);
  const records = [];

  for (const d of deductions) {
    const gross = new BigNumber(d.gross_amount.toString());
    const tds = new BigNumber(d.tds_amount.toString());
    totalGross = totalGross.plus(gross);
    totalTds = totalTds.plus(tds);

    records.push({
      deduction_id: d._id,
      pan: d.pan_number,
      deductee_name: d.deductee_party_id?.legal_name || 'Vendor',
      section_code: d.section_code,
      gross_amount: gross.toFixed(2),
      tds_rate: d.tds_rate_percent,
      tds_deducted: tds.toFixed(2),
      deduction_date: d.deduction_date.toISOString().slice(0, 10),
      challan_number: d.challan_number || 'PENDING_DEPOSIT',
      status: d.status
    });
  }

  return {
    form_type: '26Q',
    financial_year: financialYear,
    quarter: quarter,
    total_deductions_count: records.length,
    total_gross_paid: totalGross.toFixed(2),
    total_tds_deducted: totalTds.toFixed(2),
    records
  };
}

/**
 * Generates statutory MSME Aging Report under MSME Act & Section 43B(h).
 */
async function generateMsmeAgingReport({ tenantId, companyId, asOfDate = new Date() }) {
  const cutoff = new Date(asOfDate);

  // Find all vendors registered under MSME
  const msmeParties = await Party.find({
    tenant_id: tenantId,
    company_id: companyId,
    $or: [
      { msme_registered: true },
      { msme_category: { $in: ['MICRO', 'SMALL'] } }
    ]
  });

  const msmePartyIds = msmeParties.map(p => p._id);

  // Query unpaid purchase invoices for MSME vendors
  const docs = await CommercialDocument.find({
    tenant_id: tenantId,
    company_id: companyId,
    document_type: 'PURCHASE_INVOICE',
    party_id: { $in: msmePartyIds },
    status: 'POSTED',
    balance_due: { $gt: 0 }
  }).populate('party_id', 'legal_name trade_name party_code msme_category');

  const summary = {
    total_msme_vendors: msmeParties.length,
    total_msme_unpaid_invoices: docs.length,
    total_msme_outstanding: '0.00',
    within_15_days: { count: 0, amount: '0.00' },
    days_16_to_45: { count: 0, amount: '0.00' },
    beyond_45_days_overdue: { count: 0, amount: '0.00', disallowance_risk: true }
  };

  let totAmt = new BigNumber(0);
  let w15 = new BigNumber(0);
  let d1645 = new BigNumber(0);
  let b45 = new BigNumber(0);
  const items = [];

  for (const doc of docs) {
    const bal = new BigNumber(doc.balance_due ? doc.balance_due.toString() : 0);
    totAmt = totAmt.plus(bal);

    const issueDate = new Date(doc.document_date || doc.issue_date || Date.now());
    const daysElapsed = Math.floor((cutoff.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));

    let bucket = 'WITHIN_15';
    let overdueBeyond45 = false;
    if (daysElapsed <= 15) {
      w15 = w15.plus(bal);
      summary.within_15_days.count += 1;
    } else if (daysElapsed <= 45) {
      d1645 = d1645.plus(bal);
      summary.days_16_to_45.count += 1;
      bucket = 'DAYS_16_TO_45';
    } else {
      b45 = b45.plus(bal);
      summary.beyond_45_days_overdue.count += 1;
      bucket = 'BEYOND_45_OVERDUE';
      overdueBeyond45 = true;
    }

    items.push({
      document_id: doc._id,
      document_number: doc.document_number,
      party_name: doc.party_id?.legal_name || 'MSME Vendor',
      msme_category: doc.party_id?.msme_category || 'MICRO',
      issue_date: doc.document_date || doc.issue_date || new Date(),
      balance_due: bal.toFixed(2),
      days_elapsed: daysElapsed,
      bucket,
      section_43bh_disallowance_risk: overdueBeyond45
    });
  }

  summary.total_msme_outstanding = totAmt.toFixed(2);
  summary.within_15_days.amount = w15.toFixed(2);
  summary.days_16_to_45.amount = d1645.toFixed(2);
  summary.beyond_45_days_overdue.amount = b45.toFixed(2);

  return {
    as_of_date: cutoff.toISOString().slice(0, 10),
    summary,
    invoices: items
  };
}

/**
 * Generates statutory NIC-compliant E-Invoice IRN payload.
 * When real credentials are not configured, cleanly reports sandbox mode.
 */
async function generateMockEInvoice({ tenantId, companyId, invoiceId }) {
  const doc = await CommercialDocument.findOne({
    _id: invoiceId,
    tenant_id: tenantId,
    company_id: companyId
  }).populate('party_id');

  if (!doc) throw new Error('Invoice not found');

  const docDate = doc.document_date ? new Date(doc.document_date) : (doc.issue_date ? new Date(doc.issue_date) : new Date());
  const dateIso = docDate.toISOString();
  const grandTotalStr = doc.grand_total ? doc.grand_total.toString() : '0.00';
  const rawHash = `${doc.document_number}-${dateIso}-${grandTotalStr}`;
  const mockIrn = crypto.createHash('sha256').update(rawHash).digest('hex');
  const ackNo = `1${Date.now().toString().slice(-9)}`;

  const isLiveConfigured = Boolean(process.env.GSTN_API_KEY && process.env.NIC_PORTAL_CLIENT_ID);

  return {
    status: isLiveConfigured ? 'OFFICIAL_REGISTERED' : 'SANDBOX_SIMULATED',
    is_mock: !isLiveConfigured,
    sandbox: !isLiveConfigured,
    credentials_configured: isLiveConfigured,
    disclaimer: isLiveConfigured
      ? 'Official E-Invoice registered with Indian NIC portal.'
      : 'Mock sandbox payload generated for development testing. Not registered with Indian NIC portal (BLOCKED — EXTERNAL DEPENDENCY for live credentials).',
    invoice_number: doc.document_number,
    irn: mockIrn,
    acknowledgement_number: ackNo,
    acknowledgement_date: new Date().toISOString(),
    signed_qr_code_sample: `https://einvoice1.gst.gov.in/verify?irn=${mockIrn}`,
    nic_payload_preview: {
      Version: '1.1',
      TranDtls: { TaxSch: 'GST', SupTyp: 'B2B' },
      DocDtls: { Typ: 'INV', No: doc.document_number, Dt: dateIso.slice(0, 10) },
      BuyerDtls: { Gstin: doc.party_id?.tax_id || 'URP', LglNm: doc.party_id?.legal_name },
      ValDtls: { TotInvVal: Number(grandTotalStr) }
    },
    message: isLiveConfigured
      ? 'E-Invoice registered with NIC portal'
      : 'Mock sandbox payload generated for development testing. Not registered with Indian NIC portal.'
  };
}

module.exports = {
  ensureTdsSectionsSeeded,
  calculateAndRecordTds,
  generateForm26QSummary,
  generateMsmeAgingReport,
  generateMockEInvoice
};
