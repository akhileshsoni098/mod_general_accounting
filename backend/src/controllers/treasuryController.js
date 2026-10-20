const BigNumber = require('bignumber.js');
const mongoose = require('mongoose');
const {
  PaymentMandate,
  PaymentAttempt,
  ProcessorTransaction,
  BankStatementLine,
  CashReconciliationMatch,
  UnappliedCash,
  PaymentReturn,
  Refund,
  DunningPlan,
  DelinquencyCase,
  DunningAction,
  CollectionAssignment
} = require('../models');
const {
  executePaymentAttempt,
  importBankStatementLines,
  runAutoReconciliation,
  manualMatch,
  processPaymentReturn,
  processRefundDisbursement
} = require('../services/treasuryService');
const { authorizeMigrationAdapter } = require('../utils/migrationAdapterAuth');

// Treasury Overview
async function getTreasuryOverview(req, res) {
  try {
    const tenantId = req.tenantId;

    const bankLines = await BankStatementLine.find({ tenant_id: tenantId });
    const processorTxs = await ProcessorTransaction.find({ tenant_id: tenantId });
    const matches = await CashReconciliationMatch.find({ tenant_id: tenantId, status: 'ACTIVE' });
    const returns = await PaymentReturn.find({ tenant_id: tenantId });
    const refunds = await Refund.find({ tenant_id: tenantId });

    let totalBankDeposits = new BigNumber(0);
    let matchedBankAmount = new BigNumber(0);
    let unmatchedBankCount = 0;

    for (const bl of bankLines) {
      const amt = new BigNumber(bl.amount.toString());
      if (bl.direction === 'CR') totalBankDeposits = totalBankDeposits.plus(amt);
      if (bl.reconciliation_status === 'MATCHED') {
        matchedBankAmount = matchedBankAmount.plus(amt);
      } else {
        unmatchedBankCount++;
      }
    }

    let totalProcessorSettled = new BigNumber(0);
    let unmatchedProcessorCount = 0;
    for (const p of processorTxs) {
      totalProcessorSettled = totalProcessorSettled.plus(new BigNumber(p.amount.toString()));
      if (p.reconciliation_status === 'UNMATCHED') unmatchedProcessorCount++;
    }

    return res.success({
      totalBankDeposits: totalBankDeposits.toFixed(2),
      matchedBankAmount: matchedBankAmount.toFixed(2),
      unmatchedBankCount,
      totalProcessorSettled: totalProcessorSettled.toFixed(2),
      unmatchedProcessorCount,
      activeMatchesCount: matches.length,
      returnsCount: returns.length,
      refundsCount: refunds.length
    });
  } catch (err) {
    return res.error('Failed to load Treasury overview', 500, err.message);
  }
}

// Payment Mandates
async function getMandates(req, res) {
  try {
    const tenantId = req.tenantId;
    const mandates = await PaymentMandate.find({ tenant_id: tenantId })
      .populate('billing_account_id', 'account_number customer_name')
      .sort({ createdAt: -1 });
    return res.success(mandates);
  } catch (err) {
    return res.error('Failed to list payment mandates', 500, err.message);
  }
}

async function createMandate(req, res) {
  try {
    const tenantId = req.tenantId;
    const { billing_account_id, mandate_code, method_type, provider, external_mandate_token, masked_details } = req.body;

    if (!billing_account_id || !mandate_code || !method_type || !masked_details) {
      return res.error('billing_account_id, mandate_code, method_type, and masked_details are required', 400);
    }

    const exists = await PaymentMandate.findOne({ tenant_id: tenantId, mandate_code: mandate_code.trim().toUpperCase() });
    if (exists) return res.error(`Mandate code "${mandate_code}" already exists`, 409);

    const mandate = await PaymentMandate.create({
      tenant_id: tenantId,
      billing_account_id,
      mandate_code: mandate_code.trim().toUpperCase(),
      method_type,
      provider: provider || 'SIMULATED_PROVIDER',
      external_mandate_token: external_mandate_token || `tok_sim_${Date.now()}`,
      masked_details: masked_details.trim(),
      status: 'ACTIVE'
    });

    return res.success(mandate, { message: 'Payment mandate registered' }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function updateMandateStatus(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { status } = req.body;

    const mandate = await PaymentMandate.findOne({ _id: id, tenant_id: tenantId });
    if (!mandate) return res.error('Payment mandate not found', 404);

    mandate.status = status;
    if (status === 'REVOKED') mandate.revoked_at = new Date();
    await mandate.save();

    return res.success(mandate, { message: `Mandate status updated to ${status}` });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Payment Attempts
async function getAttempts(req, res) {
  try {
    const tenantId = req.tenantId;
    const attempts = await PaymentAttempt.find({ tenant_id: tenantId })
      .populate('billing_account_id', 'account_number customer_name')
      .populate('billing_payment_id', 'payment_number amount status')
      .sort({ createdAt: -1 });
    return res.success(attempts);
  } catch (err) {
    return res.error('Failed to list payment attempts', 500, err.message);
  }
}

async function postPaymentAttempt(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { billing_account_id, mandate_id, amount, simulated_outcome, payment_method } = req.body;
    let useMigrationAdapter = false;
    if (req.body.use_migration_adapter === true || req.headers['x-use-migration-adapter'] === 'true') {
      const authCheck = await authorizeMigrationAdapter(req);
      if (!authCheck.authorized) {
        return res.error(authCheck.reason, 403);
      }
      useMigrationAdapter = true;
    }

    if (!billing_account_id || !amount) {
      return res.error('billing_account_id and amount are required', 400);
    }

    const result = await executePaymentAttempt({
      tenantId,
      userId,
      billingAccountId: billing_account_id,
      mandateId: mandate_id || null,
      amount,
      simulatedOutcome: simulated_outcome || 'SUCCESS',
      paymentMethod: payment_method || 'ACH',
      useMigrationAdapter
    });

    return res.success(result, { message: `Payment attempt executed with outcome: ${result.attempt.outcome}` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Processor Transactions
async function getProcessorTransactions(req, res) {
  try {
    const tenantId = req.tenantId;
    const { reconciliation_status } = req.query;

    const filter = { tenant_id: tenantId };
    if (reconciliation_status) filter.reconciliation_status = reconciliation_status.toUpperCase();

    const txs = await ProcessorTransaction.find(filter)
      .populate('billing_payment_id', 'payment_number amount payment_method')
      .sort({ createdAt: -1 });
    return res.success(txs);
  } catch (err) {
    return res.error('Failed to list processor transactions', 500, err.message);
  }
}

// Bank Statement Import & Lines
async function getBankStatementLines(req, res) {
  try {
    const tenantId = req.tenantId;
    const { reconciliation_status } = req.query;

    const filter = { tenant_id: tenantId };
    if (reconciliation_status) filter.reconciliation_status = reconciliation_status.toUpperCase();

    const lines = await BankStatementLine.find(filter).sort({ booking_date: -1, line_number: 1 });
    return res.success(lines);
  } catch (err) {
    return res.error('Failed to list bank statement lines', 500, err.message);
  }
}

async function postImportBankStatement(req, res) {
  try {
    const tenantId = req.tenantId;
    const { batch_id, account_type, account_number, lines } = req.body;

    if (!batch_id || !lines || lines.length === 0) {
      return res.error('batch_id and lines are required', 400);
    }

    const createdLines = await importBankStatementLines({
      tenantId,
      batchId: batch_id,
      accountType: account_type || 'FIDUCIARY_TRUST',
      accountNumber: account_number || 'WF-TX-TRUST-1010',
      lines
    });

    return res.success(createdLines, { message: `Imported ${createdLines.length} bank statement lines` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Reconciliation Matches
async function getReconciliationMatches(req, res) {
  try {
    const tenantId = req.tenantId;
    const matches = await CashReconciliationMatch.find({ tenant_id: tenantId })
      .populate('bank_statement_line_id')
      .populate('processor_transaction_id')
      .sort({ createdAt: -1 });
    return res.success(matches);
  } catch (err) {
    return res.error('Failed to list reconciliation matches', 500, err.message);
  }
}

async function postAutoReconcile(req, res) {
  try {
    const tenantId = req.tenantId;
    const matches = await runAutoReconciliation(tenantId);
    return res.success(matches, { message: `Auto-reconciliation generated ${matches.length} matches` });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function postManualMatch(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { bank_statement_line_id, processor_transaction_id, reason } = req.body;

    if (!bank_statement_line_id || !processor_transaction_id) {
      return res.error('bank_statement_line_id and processor_transaction_id are required', 400);
    }

    const matchDoc = await manualMatch({
      tenantId,
      userId,
      bankStatementLineId: bank_statement_line_id,
      processorTransactionId: processor_transaction_id,
      reason
    });

    return res.success(matchDoc, { message: 'Manual reconciliation match recorded' }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Payment Returns (NSF)
async function getPaymentReturns(req, res) {
  try {
    const tenantId = req.tenantId;
    const returns = await PaymentReturn.find({ tenant_id: tenantId })
      .populate('billing_payment_id')
      .populate('journal_id', 'journal_number')
      .sort({ createdAt: -1 });
    return res.success(returns);
  } catch (err) {
    return res.error('Failed to list payment returns', 500, err.message);
  }
}

async function postPaymentReturn(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { payment_id, return_code, reason_description } = req.body;
    let useMigrationAdapter = false;
    if (req.body.use_migration_adapter === true || req.headers['x-use-migration-adapter'] === 'true') {
      const authCheck = await authorizeMigrationAdapter(req);
      if (!authCheck.authorized) {
        return res.error(authCheck.reason, 403);
      }
      useMigrationAdapter = true;
    }

    if (!payment_id) return res.error('payment_id is required', 400);

    const result = await processPaymentReturn({
      tenantId,
      userId,
      paymentId: payment_id,
      returnCode: return_code || 'R01',
      reasonDescription: reason_description || 'ACH Dishonor / NSF',
      useMigrationAdapter
    });

    const jNum = result.journal ? result.journal.journal_number : 'PENDING';
    return res.success(result, { message: `Payment return ${result.paymentReturn.return_number} processed with GL Journal ${jNum}` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Refunds
async function getRefunds(req, res) {
  try {
    const tenantId = req.tenantId;
    const refunds = await Refund.find({ tenant_id: tenantId })
      .populate('billing_account_id', 'account_number customer_name')
      .populate('journal_id', 'journal_number')
      .sort({ createdAt: -1 });
    return res.success(refunds);
  } catch (err) {
    return res.error('Failed to list refunds', 500, err.message);
  }
}

async function postRefund(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { billing_account_id, amount, reason, refund_method, refund_source_type } = req.body;
    let useMigrationAdapter = false;
    if (req.body.use_migration_adapter === true || req.headers['x-use-migration-adapter'] === 'true') {
      const authCheck = await authorizeMigrationAdapter(req);
      if (!authCheck.authorized) {
        return res.error(authCheck.reason, 403);
      }
      useMigrationAdapter = true;
    }

    if (!billing_account_id || !amount) {
      return res.error('billing_account_id and amount are required', 400);
    }

    const result = await processRefundDisbursement({
      tenantId,
      userId,
      billingAccountId: billing_account_id,
      amount,
      reason: reason || 'Return Premium Refund',
      refundMethod: refund_method || 'ACH',
      refundSourceType: refund_source_type,
      useMigrationAdapter
    });

    const jNum = result.journal ? result.journal.journal_number : 'PENDING';
    return res.success(result, { message: `Refund ${result.refund.refund_number} disbursed with GL Journal ${jNum}` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Dunning Plans & Cases
async function getDunningPlans(req, res) {
  try {
    const tenantId = req.tenantId;
    let plans = await DunningPlan.find({ tenant_id: tenantId });
    if (plans.length === 0) {
      plans = await DunningPlan.insertMany([
        {
          tenant_id: tenantId,
          plan_code: 'STD_COMMERCIAL_DUNNING',
          plan_name: 'Standard Commercial Auto Dunning',
          description: '5-day grace period, 10-day notice of intent, 30-day cancellation',
          grace_period_days: 5,
          cancellation_notice_days: 10,
          final_cancellation_days: 30
        }
      ]);
    }
    return res.success(plans);
  } catch (err) {
    return res.error('Failed to list dunning plans', 500, err.message);
  }
}

async function getDelinquencyCases(req, res) {
  try {
    const tenantId = req.tenantId;
    const cases = await DelinquencyCase.find({ tenant_id: tenantId })
      .populate('billing_account_id', 'account_number customer_name')
      .sort({ createdAt: -1 });
    return res.success(cases);
  } catch (err) {
    return res.error('Failed to list delinquency cases', 500, err.message);
  }
}

async function getDunningActions(req, res) {
  try {
    const tenantId = req.tenantId;
    const actions = await DunningAction.find({ tenant_id: tenantId })
      .populate('delinquency_case_id')
      .sort({ createdAt: -1 });
    return res.success(actions);
  } catch (err) {
    return res.error('Failed to list dunning actions', 500, err.message);
  }
}

async function getCollectionAssignments(req, res) {
  try {
    const tenantId = req.tenantId;
    const assignments = await CollectionAssignment.find({ tenant_id: tenantId })
      .populate('delinquency_case_id')
      .populate('assigned_user_id', 'full_name email')
      .sort({ createdAt: -1 });
    return res.success(assignments);
  } catch (err) {
    return res.error('Failed to list collection assignments', 500, err.message);
  }
}

module.exports = {
  getTreasuryOverview,
  getMandates,
  createMandate,
  updateMandateStatus,
  getAttempts,
  postPaymentAttempt,
  getProcessorTransactions,
  getBankStatementLines,
  postImportBankStatement,
  getReconciliationMatches,
  postAutoReconcile,
  postManualMatch,
  getPaymentReturns,
  postPaymentReturn,
  getRefunds,
  postRefund,
  getDunningPlans,
  getDelinquencyCases,
  getDunningActions,
  getCollectionAssignments
};
