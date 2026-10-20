const mongoose = require('mongoose');
const {
  CommercialDocument,
  BillAllocation,
  TaxRateConfig,
  Company,
  Party,
  StockItem,
  Godown,
  UnitOfMeasurement,
  LedgerAccount
} = require('../models');
const {
  createDraftDocument,
  updateDraftDocument,
  cancelDraftDocument
} = require('../services/commercialDocumentService');
const { postCommercialDocument } = require('../services/commercialPostingService');
const { reverseCommercialDocument } = require('../services/commercialReversalService');
const {
  getOrCreatePostingConfig,
  updatePostingConfig,
  validateAndResolvePostingAccounts
} = require('../services/commercialPostingConfigService');
const {
  previewOpeningStockGlCatchUp,
  postOpeningStockGlCatchUp
} = require('../services/openingStockGlService');
const {
  getDocumentRegister,
  getOutstandingReport,
  getTaxSummaryReport,
  getInventoryToGlReconciliation
} = require('../services/commercialReportService');
const { calculateLineTax, calculateDocumentTotals } = require('../services/gstTaxService');

// ==========================================
// 1. COMMERCIAL DOCUMENTS (CRUD & POST)
// ==========================================

async function createDocument(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const doc = await createDraftDocument({
      ...req.body,
      tenantId,
      companyId,
      userId: user?._id || req.body.userId
    });
    return res.success(doc, 201);
  } catch (err) {
    const status = err.code === 'MISSING_ACCOUNT_MAPPING' ? 400 : 400;
    return res.error(err.message, status, { code: err.code });
  }
}

async function getDocuments(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { document_type, status, party_id, start_date, end_date, limit = 50, page = 1 } = req.query;

    const result = await getDocumentRegister(tenantId, companyId, {
      documentType: document_type,
      status,
      partyId: party_id,
      startDate: start_date,
      endDate: end_date,
      limit: Number(limit),
      page: Number(page)
    });

    return res.success(result);
  } catch (err) {
    return res.error('Failed to fetch commercial documents', 500, err.message);
  }
}

async function getDocumentById(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { id } = req.params;

    const doc = await CommercialDocument.findOne({ _id: id, tenant_id: tenantId, company_id: companyId })
      .populate('party_id', 'party_code legal_name trade_name tax_id address phone email')
      .populate('journal_id')
      .populate('cogs_journal_id')
      .populate('lines.stock_item_id', 'item_code item_name sku hsn_sac_code')
      .populate('lines.uom_id', 'uom_code uom_name')
      .populate('lines.godown_id', 'godown_code godown_name')
      .populate('lines.stock_movement_id');

    if (!doc) {
      return res.error(`Commercial document not found: ${id}`, 404);
    }

    // Also fetch any allocations against this invoice or made by this payment
    const allocations = await BillAllocation.find({
      tenant_id: tenantId,
      company_id: companyId,
      $or: [
        { invoice_document_id: doc._id },
        { payment_document_id: doc._id }
      ]
    }).populate('payment_document_id', 'document_number document_date grand_total')
      .populate('invoice_document_id', 'document_number document_date grand_total balance_due');

    return res.success({
      document: doc,
      allocations
    });
  } catch (err) {
    return res.error('Failed to fetch commercial document details', 500, err.message);
  }
}

async function updateDocument(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;

    const doc = await updateDraftDocument(tenantId, companyId, id, {
      ...req.body,
      userId: user?._id
    });
    return res.success(doc);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function postDocument(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;
    const { allocations } = req.body;

    const result = await postCommercialDocument({
      tenantId,
      companyId,
      documentId: id,
      userId: user?._id || req.body.userId,
      allocations: allocations || []
    });

    return res.success(result, 200);
  } catch (err) {
    const status = err.code === 'INSUFFICIENT_STOCK' ? 422 : 400;
    return res.error(err.message, status, { code: err.code });
  }
}

async function reverseDocument(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;
    const { reason } = req.body;

    const result = await reverseCommercialDocument({
      tenantId,
      companyId,
      documentId: id,
      userId: user?._id,
      reason: reason || 'Reversed by user'
    });

    return res.success(result, 200);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function cancelDocument(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;
    const { reason } = req.body;

    const doc = await cancelDraftDocument(tenantId, companyId, id, reason, user?._id);
    return res.success(doc);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// ==========================================
// 2. POSTING CONFIG & ACCOUNT MAPPINGS
// ==========================================

async function getPostingConfig(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { config, accountMap } = await validateAndResolvePostingAccounts(tenantId, companyId);
    return res.success({ config, accountMap });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function updatePostingConfigHandler(req, res) {
  try {
    const { tenantId, companyId } = req;
    const updated = await updatePostingConfig(tenantId, companyId, req.body);
    return res.success(updated);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// ==========================================
// 3. TAX & GST CONFIGURATION
// ==========================================

async function getTaxRates(req, res) {
  try {
    const { tenantId, companyId } = req;
    await getOrCreatePostingConfig(tenantId, companyId);
    const rates = await TaxRateConfig.find({ tenant_id: tenantId, company_id: companyId }).sort({ rate_percent: 1 });
    return res.success(rates);
  } catch (err) {
    return res.error('Failed to fetch tax rates', 500, err.message);
  }
}

async function createOrUpdateTaxRate(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { tax_code, tax_name, rate_percent, cgst_rate, sgst_rate, igst_rate, applicable_to, is_active } = req.body;

    if (!tax_code || rate_percent === undefined) {
      return res.error('tax_code and rate_percent are required', 400);
    }

    const doc = await TaxRateConfig.findOneAndUpdate(
      { tenant_id: tenantId, company_id: companyId, tax_code: tax_code.trim().toUpperCase() },
      {
        tenant_id: tenantId,
        company_id: companyId,
        tax_code: tax_code.trim().toUpperCase(),
        tax_name: tax_name || `GST ${rate_percent}%`,
        rate_percent,
        cgst_rate: cgst_rate !== undefined ? cgst_rate : (Number(rate_percent) / 2).toFixed(2),
        sgst_rate: sgst_rate !== undefined ? sgst_rate : (Number(rate_percent) / 2).toFixed(2),
        igst_rate: igst_rate !== undefined ? igst_rate : rate_percent,
        applicable_to: applicable_to || 'BOTH',
        is_active: is_active !== undefined ? is_active : true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.success(doc, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// ==========================================
// 4. OPENING STOCK GL CATCH-UP INTEGRATION
// ==========================================

async function previewOpeningStockGl(req, res) {
  try {
    const { tenantId, companyId } = req;
    const preview = await previewOpeningStockGlCatchUp(tenantId, companyId);
    return res.success(preview);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function postOpeningStockGl(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { posting_date } = req.body;
    const result = await postOpeningStockGlCatchUp({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      postingDate: posting_date || new Date()
    });
    return res.success(result, 200);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// ==========================================
// 5. COMMERCIAL REPORTS & RECONCILIATIONS
// ==========================================

async function getRegisterReport(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { document_type, start_date, end_date, party_id, status, limit, page } = req.query;

    const report = await getDocumentRegister(tenantId, companyId, {
      documentType: document_type,
      startDate: start_date,
      endDate: end_date,
      partyId: party_id,
      status,
      limit: limit ? Number(limit) : 100,
      page: page ? Number(page) : 1
    });

    return res.success(report);
  } catch (err) {
    return res.error('Failed to generate register report', 500, err.message);
  }
}

async function getOutstandingReportHandler(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { party_type = 'CUSTOMER', as_of_date } = req.query;

    const report = await getOutstandingReport(tenantId, companyId, {
      partyType: party_type.toUpperCase(),
      asOfDate: as_of_date ? new Date(as_of_date) : new Date()
    });

    return res.success(report);
  } catch (err) {
    return res.error('Failed to generate outstanding report', 500, err.message);
  }
}

async function getTaxSummaryReportHandler(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { start_date, end_date } = req.query;

    const report = await getTaxSummaryReport(tenantId, companyId, {
      startDate: start_date,
      endDate: end_date
    });

    return res.success(report);
  } catch (err) {
    return res.error('Failed to generate tax summary report', 500, err.message);
  }
}

async function getInventoryToGlReport(req, res) {
  try {
    const { tenantId, companyId } = req;
    const report = await getInventoryToGlReconciliation(tenantId, companyId);
    return res.success(report);
  } catch (err) {
    return res.error('Failed to generate inventory to GL reconciliation', 500, err.message);
  }
}

module.exports = {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  postDocument,
  reverseDocument,
  cancelDocument,
  getPostingConfig,
  updatePostingConfigHandler,
  getTaxRates,
  createOrUpdateTaxRate,
  previewOpeningStockGl,
  postOpeningStockGl,
  getRegisterReport,
  getOutstandingReportHandler,
  getTaxSummaryReportHandler,
  getInventoryToGlReport
};
