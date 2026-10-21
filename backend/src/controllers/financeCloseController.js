const {
  FiscalPeriod,
  SubledgerBalance,
  ReconciliationCase,
  TrialBalanceSnapshot,
  TrialBalanceLine,
  PeriodCloseTask,
  GLExportBatch,
  CommissionAdjustment,
  CommissionDispute
} = require('../models');
const financeCloseService = require('../services/financeCloseService');
const { authorizeMigrationAdapter } = require('../utils/migrationAdapterAuth');

/**
 * Controller for Finance Close, Reconciliation, UPR, and Financial Reporting
 */

// 1. Overview Dashboard
exports.getOverview = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const currentPeriod = await FiscalPeriod.findOne({ tenant_id: tenantId }).sort({ start_date: -1 });

    const openCases = await ReconciliationCase.find({ tenant_id: tenantId, status: { $in: ['OPEN', 'IN_REVIEW'] } });
    const tasks = currentPeriod ? await PeriodCloseTask.find({ tenant_id: tenantId, fiscal_period_id: currentPeriod._id }) : [];
    const latestSnapshot = currentPeriod ? await TrialBalanceSnapshot.findOne({ tenant_id: tenantId, fiscal_period_id: currentPeriod._id }).sort({ version: -1 }) : null;
    const exportBatches = await GLExportBatch.find({ tenant_id: tenantId });

    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;

    return res.json({
      status: 'success',
      data: {
        currentPeriod: currentPeriod ? currentPeriod.period_name : '2026-07',
        periodStatus: currentPeriod ? currentPeriod.status : 'OPEN',
        closeProgress: {
          total_steps: 7,
          completed_steps: completedTasks,
          percent: Math.round((completedTasks / 7) * 100)
        },
        openReconciliationCases: openCases.length,
        latestTrialBalance: latestSnapshot ? {
          snapshot_number: latestSnapshot.snapshot_number,
          total_debits: latestSnapshot.total_debits.toString(),
          total_credits: latestSnapshot.total_credits.toString(),
          is_balanced: latestSnapshot.is_balanced,
          status: latestSnapshot.status
        } : null,
        totalExportBatches: exportBatches.length
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// 2. UPR Preview & Execution
exports.previewUPR = async (req, res) => {
  try {
    const { written_premium, start_date, end_date, as_of_date } = req.query;
    const result = financeCloseService.calculateUPREarning({
      writtenPremium: written_premium || '37650.00',
      termStartDate: start_date || '2026-07-01',
      termEndDate: end_date || '2027-07-01',
      asOfDate: as_of_date || '2026-07-31'
    });
    return res.json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.runUPRAmortization = async (req, res) => {
  try {
    const { policy_reference, period_name, written_premium, start_date, end_date, as_of_date } = req.body;
    let useMigrationAdapter = false;
    if (req.body.use_migration_adapter === true || req.headers['x-use-migration-adapter'] === 'true') {
      const authCheck = await authorizeMigrationAdapter(req);
      if (!authCheck.authorized) {
        return res.status(403).json({ status: 'error', message: authCheck.reason });
      }
      useMigrationAdapter = true;
    }
    const result = await financeCloseService.executeUPRAmortizationRun({
      tenantId: req.tenantId,
      userId: req.user ? req.user._id : null,
      policyReference: policy_reference || 'POL-TX-8821',
      periodName: period_name || '2026-07',
      writtenPremium: written_premium || '37650.00',
      termStartDate: start_date ? new Date(start_date) : undefined,
      termEndDate: end_date ? new Date(end_date) : undefined,
      asOfDate: as_of_date ? new Date(as_of_date) : undefined,
      useMigrationAdapter
    });
    return res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 3. Subledger Reconciliations & Cases
exports.getSubledgerBalances = async (req, res) => {
  try {
    const { period_name } = req.query;
    const recs = await financeCloseService.reconcileSubledgers({
      tenantId: req.tenantId,
      periodName: period_name || '2026-07'
    });
    return res.json({ status: 'success', data: recs });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getReconciliationCases = async (req, res) => {
  try {
    const list = await ReconciliationCase.find({ tenant_id: req.tenantId }).sort({ created_at: -1 });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.resolveReconciliationCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_reason } = req.body;
    const resolved = await ReconciliationCase.findOneAndUpdate(
      { _id: id, tenant_id: req.tenantId },
      {
        status: 'RESOLVED',
        resolution_reason: resolution_reason || 'Variance reviewed and approved',
        resolved_at: new Date(),
        resolved_by_user_id: req.user ? req.user._id : null
      },
      { new: true }
    );
    if (!resolved) return res.status(404).json({ status: 'error', message: 'Reconciliation case not found' });
    return res.json({ status: 'success', data: resolved });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 4. Seven-Step Close Orchestration
exports.getCloseChecklist = async (req, res) => {
  try {
    let period = await FiscalPeriod.findOne({ tenant_id: req.tenantId }).sort({ start_date: -1 });
    if (!period) return res.json({ status: 'success', data: [] });

    const tasks = await financeCloseService.initializeCloseChecklist(req.tenantId, period._id);
    return res.json({ status: 'success', data: tasks });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.executeCloseTask = async (req, res) => {
  try {
    const { step } = req.params;
    let period = await FiscalPeriod.findOne({ tenant_id: req.tenantId }).sort({ start_date: -1 });
    if (!period) return res.status(404).json({ status: 'error', message: 'Fiscal period not found' });

    const executed = await financeCloseService.executeCloseStep({
      tenantId: req.tenantId,
      userId: req.user ? req.user._id : null,
      fiscalPeriodId: period._id,
      stepNumber: parseInt(step, 10)
    });
    return res.json({ status: 'success', data: executed });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 5. Trial Balance Snapshots
exports.getTrialBalance = async (req, res) => {
  try {
    const { period_name } = req.query;
    const result = await financeCloseService.generateTrialBalanceSnapshot({
      tenantId: req.tenantId,
      companyId: req.companyId,
      userId: req.user ? req.user._id : null,
      periodName: period_name || '2026-07',
      isCertified: false
    });
    return res.json({ status: 'success', data: result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.certifyTrialBalance = async (req, res) => {
  try {
    const { period_name } = req.body;
    const result = await financeCloseService.generateTrialBalanceSnapshot({
      tenantId: req.tenantId,
      userId: req.user ? req.user._id : null,
      periodName: period_name || '2026-07',
      isCertified: true
    });
    return res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 6. Financial Statements
exports.getFinancialStatements = async (req, res) => {
  try {
    const statements = await financeCloseService.generateFinancialReports({
      tenantId: req.tenantId,
      companyId: req.companyId || null
    });
    return res.json({ status: 'success', data: statements });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// 7. ERP Export Batches
exports.getExportBatches = async (req, res) => {
  try {
    const batches = await GLExportBatch.find({ tenant_id: req.tenantId }).sort({ created_at: -1 });
    return res.json({ status: 'success', data: batches });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createExportBatch = async (req, res) => {
  try {
    const { target_erp } = req.body;
    const period = await FiscalPeriod.findOne({ tenant_id: req.tenantId }).sort({ start_date: -1 });
    if (!period) return res.status(404).json({ status: 'error', message: 'Fiscal period not found' });

    const batch = await financeCloseService.generateGLExportBatch({
      tenantId: req.tenantId,
      fiscalPeriodId: period._id,
      targetErp: target_erp || 'GENERIC_JSON'
    });
    return res.status(201).json({ status: 'success', data: batch });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 8. Commission Adjustments & Disputes
exports.getAdjustments = async (req, res) => {
  try {
    const list = await CommissionAdjustment.find({ tenant_id: req.tenantId }).sort({ created_at: -1 });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getDisputes = async (req, res) => {
  try {
    const list = await CommissionDispute.find({ tenant_id: req.tenantId }).sort({ created_at: -1 });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
