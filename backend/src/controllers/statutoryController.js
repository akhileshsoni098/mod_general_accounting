const tdsAndStatutoryService = require('../services/tdsAndStatutoryService');
const { TdsSection, TdsDeduction } = require('../models');

async function listSections(req, res) {
  try {
    await tdsAndStatutoryService.ensureTdsSectionsSeeded();
    const sections = await TdsSection.find({ status: 'ACTIVE' });
    return res.success(sections);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function listDeductions(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { financial_year, quarter } = req.query;
    const filter = { tenant_id: tenantId, company_id: companyId };
    if (financial_year) filter.financial_year = financial_year;
    if (quarter) filter.quarter = quarter;

    const deductions = await TdsDeduction.find(filter)
      .populate('deductee_party_id', 'legal_name tax_id party_code')
      .sort({ deduction_date: -1 });
    return res.success(deductions);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function recordDeduction(req, res) {
  try {
    const { tenantId, companyId } = req;
    const result = await tdsAndStatutoryService.calculateAndRecordTds({
      tenantId,
      companyId,
      deducteePartyId: req.body.deductee_party_id,
      sectionCode: req.body.section_code,
      billDocumentId: req.body.bill_document_id || null,
      grossAmount: req.body.gross_amount,
      deductionDate: req.body.deduction_date || new Date(),
      financialYear: req.body.financial_year || '2026-2027',
      quarter: req.body.quarter || 'Q3'
    });
    return res.success(result, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function getForm26Q(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { financial_year, quarter } = req.query;
    const summary = await tdsAndStatutoryService.generateForm26QSummary({
      tenantId,
      companyId,
      financialYear: financial_year || '2026-2027',
      quarter: quarter || 'Q3'
    });
    return res.success(summary);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function getMsmeAging(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { as_of_date } = req.query;
    const report = await tdsAndStatutoryService.generateMsmeAgingReport({
      tenantId,
      companyId,
      asOfDate: as_of_date || new Date()
    });
    return res.success(report);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

module.exports = {
  listSections,
  listDeductions,
  recordDeduction,
  getForm26Q,
  getMsmeAging
};
