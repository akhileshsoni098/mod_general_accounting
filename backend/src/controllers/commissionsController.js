const {
  CommissionAgreement,
  CommissionSchedule,
  ProfitCommissionSchedule,
  CommissionSplit,
  CommissionTransaction,
  FiduciaryAccount,
  BordereauDefinition,
  BordereauRun,
  BordereauLine,
  SettlementStatement,
  SettlementLine,
  LedgerAccount,
  Invoice,
  Party,
  PartyRole,
  DimensionDefinition
} = require('../models');
const BigNumber = require('bignumber.js');
const commissionsService = require('../services/commissionsService');
const { postJournalFromResolvedRule } = require('../services/eventSimulatorService');
const { authorizeMigrationAdapter } = require('../utils/migrationAdapterAuth');
const { seedDefaultFiduciaryAccounts } = require('../utils/seedDefaultFiduciaryAccounts');

/**
 * Controller for Commissions, Fiduciary Trust & Settlements
 */

// 1. Overview Dashboard KPI metrics
exports.getOverview = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // Check balances
    const operatingCashAcc = await LedgerAccount.findOne({ tenant_id: tenantId, account_code: '1000' });
    const trustCashAcc = await LedgerAccount.findOne({ tenant_id: tenantId, account_code: '1010' });
    const dueToCarrierAcc = await LedgerAccount.findOne({ tenant_id: tenantId, account_code: '2010' });
    const brokerPayableAcc = await LedgerAccount.findOne({ tenant_id: tenantId, account_code: '2020' });

    // Transactions counts & totals
    const transactions = await CommissionTransaction.find({ tenant_id: tenantId });
    const bordereauRuns = await BordereauRun.find({ tenant_id: tenantId });
    const settlements = await SettlementStatement.find({ tenant_id: tenantId });
    const agreements = await CommissionAgreement.find({ tenant_id: tenantId });

    let totalEarned = 0;
    let totalPayable = 0;
    for (const t of transactions) {
      const val = parseFloat(t.calculated_amount ? t.calculated_amount.toString() : 0);
      if (t.transaction_kind === 'EARNED') totalEarned += val;
      if (t.lifecycle_status === 'PAYABLE' || t.lifecycle_status === 'APPROVED') totalPayable += val;
    }

    return res.json({
      status: 'success',
      data: {
        balances: {
          operating_cash: operatingCashAcc ? operatingCashAcc.current_balance.toString() : '0.00',
          fiduciary_trust_cash: trustCashAcc ? trustCashAcc.current_balance.toString() : '0.00',
          due_to_carrier: dueToCarrierAcc ? dueToCarrierAcc.current_balance.toString() : '0.00',
          broker_commission_payable: brokerPayableAcc ? brokerPayableAcc.current_balance.toString() : '0.00'
        },
        metrics: {
          total_earned_commissions: totalEarned.toFixed(2),
          total_payable_commissions: totalPayable.toFixed(2),
          active_agreements_count: agreements.length,
          transactions_count: transactions.length,
          bordereau_runs_count: bordereauRuns.length,
          settlements_count: settlements.length
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// 2. Agreements CRUD
exports.getAgreements = async (req, res) => {
  try {
    const list = await CommissionAgreement.find({ tenant_id: req.tenantId }).sort({ created_at: -1 });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createAgreement = async (req, res) => {
  try {
    const {
      agreement_code,
      name,
      contract_reference,
      payer_party_id,
      payer_party_name,
      payee_party_id,
      payee_party_name,
      agreement_type,
      effective_from,
      effective_to,
      description
    } = req.body;

    const existing = await CommissionAgreement.findOne({ tenant_id: req.tenantId, agreement_code: agreement_code.toUpperCase() });
    if (existing) {
      return res.status(409).json({ status: 'error', message: `Agreement code "${agreement_code}" already exists for this tenant` });
    }

    const created = await CommissionAgreement.create({
      tenant_id: req.tenantId,
      agreement_code: agreement_code.toUpperCase(),
      name,
      contract_reference,
      payer_party_id,
      payer_party_name,
      payee_party_id,
      payee_party_name,
      agreement_type,
      effective_from: new Date(effective_from),
      effective_to: effective_to ? new Date(effective_to) : null,
      description
    });
    return res.status(201).json({ status: 'success', data: created });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await CommissionAgreement.findOneAndUpdate(
      { _id: id, tenant_id: req.tenantId },
      { status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ status: 'error', message: 'Agreement not found' });
    return res.json({ status: 'success', data: updated });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 3. Schedules CRUD & Resolution Preview
exports.getSchedules = async (req, res) => {
  try {
    const query = { tenant_id: req.tenantId };
    if (req.query.agreement_id) query.agreement_id = req.query.agreement_id;
    const list = await CommissionSchedule.find(query).populate('agreement_id', 'agreement_code name').sort({ created_at: -1 });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createSchedule = async (req, res) => {
  try {
    const {
      agreement_id,
      schedule_code,
      schedule_name,
      business_type,
      line_of_business,
      state_jurisdiction,
      calculation_basis,
      rate_percentage,
      flat_amount,
      effective_from,
      effective_to
    } = req.body;

    const agreement = await CommissionAgreement.findOne({ _id: agreement_id, tenant_id: req.tenantId });
    if (!agreement) {
      return res.status(404).json({ status: 'error', message: 'Agreement not found' });
    }

    const effFrom = new Date(effective_from);
    if (effFrom < agreement.effective_from || (agreement.effective_to && effFrom > agreement.effective_to)) {
      return res.status(400).json({
        status: 'error',
        message: `Schedule effective date (${effFrom.toISOString().slice(0, 10)}) is outside agreement validity (${agreement.effective_from.toISOString().slice(0, 10)} to ${agreement.effective_to ? agreement.effective_to.toISOString().slice(0, 10) : 'indefinite'})`
      });
    }

    if (parseFloat(rate_percentage) < 0 || parseFloat(rate_percentage) > 100) {
      return res.status(400).json({ status: 'error', message: 'Rate percentage must be between 0.00 and 100.00' });
    }

    const created = await CommissionSchedule.create({
      tenant_id: req.tenantId,
      agreement_id,
      schedule_code: schedule_code.toUpperCase(),
      schedule_name,
      business_type,
      line_of_business,
      state_jurisdiction,
      calculation_basis,
      rate_percentage: mongoose.Types.Decimal128.fromString(rate_percentage.toString()),
      flat_amount: flat_amount ? mongoose.Types.Decimal128.fromString(flat_amount.toString()) : undefined,
      effective_from: effFrom,
      effective_to: effective_to ? new Date(effective_to) : null
    });

    return res.status(201).json({ status: 'success', data: created });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.previewScheduleResolution = async (req, res) => {
  try {
    const { agreement_id, business_type, effective_date } = req.query;
    const result = await commissionsService.resolveCommissionSchedule({
      tenantId: req.tenantId,
      agreementId: agreement_id,
      businessType: business_type || 'NEW',
      effectiveDate: effective_date || new Date()
    });
    return res.json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 4. Canonical Commission Chain Preview
exports.previewCanonicalChain = async (req, res) => {
  try {
    const grossPremium = req.query.gross_premium || 37650.00;
    const chain = commissionsService.calculateCanonicalChain(grossPremium);
    return res.json({ status: 'success', data: chain });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 5. Profit Commission Schedule
exports.getProfitCommissionSchedules = async (req, res) => {
  try {
    const list = await ProfitCommissionSchedule.find({ tenant_id: req.tenantId }).populate('agreement_id', 'agreement_code name');
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createProfitCommissionSchedule = async (req, res) => {
  try {
    const {
      agreement_id,
      schedule_code,
      schedule_name,
      loss_ratio_threshold_pct,
      contingent_rate_pct,
      effective_from
    } = req.body;

    const status = loss_ratio_threshold_pct ? 'ACTIVE' : 'NOT_CONFIGURED';

    const created = await ProfitCommissionSchedule.create({
      tenant_id: req.tenantId,
      agreement_id,
      schedule_code: schedule_code.toUpperCase(),
      schedule_name,
      loss_ratio_threshold_pct: loss_ratio_threshold_pct ? mongoose.Types.Decimal128.fromString(loss_ratio_threshold_pct.toString()) : null,
      contingent_rate_pct: contingent_rate_pct ? mongoose.Types.Decimal128.fromString(contingent_rate_pct.toString()) : null,
      effective_from: new Date(effective_from || Date.now()),
      status
    });

    return res.status(201).json({ status: 'success', data: created });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 6. Commission Splits CRUD
exports.getSplits = async (req, res) => {
  try {
    const query = { tenant_id: req.tenantId };
    if (req.query.schedule_id) query.schedule_id = req.query.schedule_id;
    const list = await CommissionSplit.find(query).populate('schedule_id', 'schedule_code schedule_name');
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createSplit = async (req, res) => {
  try {
    const {
      schedule_id,
      split_code,
      recipient_party_id,
      recipient_party_name,
      parent_recipient_id,
      tier_level,
      split_percentage,
      effective_from,
      effective_to
    } = req.body;

    // Reject cycle or invalid percentage
    const pct = parseFloat(split_percentage);
    if (pct <= 0 || pct > 100) {
      return res.status(400).json({ status: 'error', message: 'Split percentage must be between 0.01 and 100.00' });
    }

    if (parent_recipient_id && parent_recipient_id === recipient_party_id) {
      return res.status(400).json({ status: 'error', message: 'Hierarchical split cycle detected: recipient cannot be its own parent' });
    }

    const created = await CommissionSplit.create({
      tenant_id: req.tenantId,
      schedule_id,
      split_code: split_code.toUpperCase(),
      recipient_party_id,
      recipient_party_name,
      parent_recipient_id: parent_recipient_id || null,
      tier_level: tier_level || 1,
      split_percentage: mongoose.Types.Decimal128.fromString(pct.toFixed(2)),
      effective_from: new Date(effective_from || Date.now()),
      effective_to: effective_to ? new Date(effective_to) : null
    });

    return res.status(201).json({ status: 'success', data: created });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 7. Commission Transactions
exports.getTransactions = async (req, res) => {
  try {
    const list = await CommissionTransaction.find({ tenant_id: req.tenantId })
      .populate('agreement_id', 'agreement_code name')
      .populate('schedule_id', 'schedule_code rate_percentage')
      .sort({ created_at: -1 });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.processTransaction = async (req, res) => {
  try {
    const {
      agreement_id,
      source_event_id,
      source_entity_type,
      policy_reference,
      basis_amount,
      effective_date,
      idempotency_key
    } = req.body;

    const result = await commissionsService.processCommissionTransaction({
      tenantId: req.tenantId,
      agreementId: agreement_id,
      sourceEventId: source_event_id,
      sourceEntityType: source_entity_type || 'POLICY',
      policyReference: policy_reference || 'POL-TX-8821',
      basisAmount: basis_amount,
      effectiveDate: effective_date || new Date(),
      idempotencyKey: idempotency_key
    });

    return res.status(result.duplicate ? 200 : 201).json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 8. Fiduciary Accounts & Sweeps
exports.getFiduciaryAccounts = async (req, res) => {
  try {
    let list = await FiduciaryAccount.find({ tenant_id: req.tenantId }).lean();
    if (!list || list.length === 0) {
      await seedDefaultFiduciaryAccounts(req.tenantId);
      list = await FiduciaryAccount.find({ tenant_id: req.tenantId }).lean();
    }

    // Enrich with live GL balances from LedgerAccount
    const glCodes = list.map(a => a.gl_account_code).filter(Boolean);
    const ledgerAccs = await LedgerAccount.find({
      tenant_id: req.tenantId,
      account_code: { $in: glCodes }
    }).lean();

    const ledgerByCode = {};
    for (const la of ledgerAccs) {
      ledgerByCode[la.account_code] = la;
    }

    const enriched = list.map(a => {
      const la = ledgerByCode[a.gl_account_code];
      return {
        ...a,
        current_balance: la && la.current_balance !== undefined ? la.current_balance.toString() : '0.00',
        gl_account_name: la ? la.account_name : '',
        normal_balance: la ? la.normal_balance : 'DEBIT'
      };
    });

    return res.json({ status: 'success', data: enriched });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.seedFiduciaryAccounts = async (req, res) => {
  try {
    const seeded = await seedDefaultFiduciaryAccounts(req.tenantId);
    return res.json({ status: 'success', message: `Seeded ${seeded.length} default fiduciary accounts successfully`, data: seeded });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.createFiduciaryAccount = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const {
      account_code,
      account_name,
      account_type = 'PREMIUM_TRUST',
      gl_account_code = '1010',
      bank_name = 'Frost Bank, N.A. (Austin, TX)',
      bank_reference_token,
      jurisdiction_statute = 'TEXAS_INS_CODE_4053',
      fiduciary_hold_days = 30,
      notes = ''
    } = req.body;

    if (!account_code || !account_name) {
      return res.status(400).json({ status: 'error', message: 'account_code and account_name are required' });
    }

    const cleanCode = account_code.toUpperCase().trim();
    const existing = await FiduciaryAccount.findOne({ tenant_id: tenantId, account_code: cleanCode });
    if (existing) {
      return res.status(409).json({ status: 'error', message: `Fiduciary account with code ${cleanCode} already exists` });
    }

    const created = await FiduciaryAccount.create({
      tenant_id: tenantId,
      account_code: cleanCode,
      account_name: account_name.trim(),
      account_type,
      gl_account_code,
      bank_name,
      bank_reference_token: bank_reference_token || `tok_vault_${Date.now()}`,
      jurisdiction_statute,
      fiduciary_hold_days: Number(fiduciary_hold_days),
      notes,
      status: 'ACTIVE'
    });

    return res.status(201).json({ status: 'success', message: 'Fiduciary account created successfully', data: created });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.executeSweep = async (req, res) => {
  try {
    const { fiduciary_account_id, amount, notes } = req.body;
    let useMigrationAdapter = false;
    if (req.body.use_migration_adapter === true || req.headers['x-use-migration-adapter'] === 'true') {
      const authCheck = await authorizeMigrationAdapter(req);
      if (!authCheck.authorized) {
        return res.status(403).json({ status: 'error', message: authCheck.reason });
      }
      useMigrationAdapter = true;
    }
    const result = await commissionsService.executeFiduciarySweep({
      tenantId: req.tenantId,
      userId: req.user ? req.user._id : null,
      fiduciaryAccountId: fiduciary_account_id,
      amount,
      notes,
      useMigrationAdapter
    });
    return res.json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

// 9. Bordereaux Definitions & Runs
exports.getBordereauDefinitions = async (req, res) => {
  try {
    const list = await BordereauDefinition.find({ tenant_id: req.tenantId });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.getBordereauRuns = async (req, res) => {
  try {
    const list = await BordereauRun.find({ tenant_id: req.tenantId })
      .populate('definition_id', 'definition_code name carrier_party_id')
      .sort({ created_at: -1 });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.generateBordereauRun = async (req, res) => {
  try {
    const {
      definition_id,
      carrier_party_id,
      carrier_name,
      reporting_period,
      risk_state,
      line_of_business,
      reporting_frequency,
      transmission_protocol
    } = req.body;

    const result = await commissionsService.generateBordereauRun({
      tenantId: req.tenantId,
      definitionId: definition_id,
      carrierPartyId: carrier_party_id,
      carrierName: carrier_name,
      reportingPeriod: reporting_period || '2026-07',
      riskState: risk_state || 'TX',
      lineOfBusiness: line_of_business || 'COMMERCIAL_AUTO',
      reportingFrequency: reporting_frequency || 'MONTHLY',
      transmissionProtocol: transmission_protocol || 'ACORD_XML_EDI'
    });
    return res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.transmitBordereauRun = async (req, res) => {
  try {
    const { runId } = req.params;
    const { transmission_protocol } = req.body || {};
    const result = await commissionsService.transmitBordereauRun({
      tenantId: req.tenantId,
      runId,
      transmissionProtocol: transmission_protocol || 'ACORD_XML_EDI'
    });
    return res.json({
      status: 'success',
      message: `Bordereau electronic package successfully transmitted to Carrier! Acknowledgment ID: ${result.transmission_receipt.ack_id}`,
      data: result
    });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.getBordereauRunLines = async (req, res) => {
  try {
    const { runId } = req.params;
    const lines = await BordereauLine.find({ tenant_id: req.tenantId, run_id: runId }).sort({ line_number: 1 });
    return res.json({ status: 'success', data: lines });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// 10. Settlements
exports.getSettlements = async (req, res) => {
  try {
    const list = await SettlementStatement.find({ tenant_id: req.tenantId })
      .populate('fiduciary_account_id', 'account_code account_name')
      .populate('linked_journal_id', 'journal_number')
      .sort({ created_at: -1 });
    return res.json({ status: 'success', data: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

exports.generateSettlement = async (req, res) => {
  try {
    const { fiduciary_account_id, period_start, period_end, carrier_party_id } = req.body;
    const result = await commissionsService.generateSettlementStatement({
      tenantId: req.tenantId,
      fiduciaryAccountId: fiduciary_account_id,
      carrierPartyId: carrier_party_id || 'CARRIER-SUMMIT',
      periodStart: period_start ? new Date(period_start) : undefined,
      periodEnd: period_end ? new Date(period_end) : undefined
    });
    return res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.disburseSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_reference } = req.body;
    let useMigrationAdapter = false;
    if (req.body.use_migration_adapter === true || req.headers['x-use-migration-adapter'] === 'true') {
      const authCheck = await authorizeMigrationAdapter(req);
      if (!authCheck.authorized) {
        return res.status(403).json({ status: 'error', message: authCheck.reason });
      }
      useMigrationAdapter = true;
    }
    const result = await commissionsService.disburseSettlementPayment({
      tenantId: req.tenantId,
      userId: req.user ? req.user._id : null,
      statementId: id,
      paymentReference: payment_reference || 'ACH-SUMMIT-DISBURSE-001',
      useMigrationAdapter
    });
    return res.json({ status: 'success', data: result });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};

exports.disburseBrokerCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_reference } = req.body || {};
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;

    const tx = await CommissionTransaction.findOne({ _id: id, tenant_id: tenantId });
    if (!tx) {
      return res.status(404).json({ status: 'error', message: 'Commission transaction not found' });
    }
    if (tx.lifecycle_status === 'PAID') {
      return res.status(400).json({ status: 'error', message: 'Commission transaction is already PAID' });
    }

    const amountBN = new BigNumber(tx.calculated_amount ? tx.calculated_amount.toString() : '0');
    if (amountBN.lte(0)) {
      return res.status(400).json({ status: 'error', message: 'Transaction amount must be greater than zero' });
    }

    const { legacyDirectPost } = require('../services/legacyPostingAdapter');
    const Journal = require('../models/Journal');
    const payRef = payment_reference || `ACH-BROKER-${Date.now()}`;

    // Check if GL journal has already been posted for this transaction
    let glJournal = await Journal.findOne({
      tenant_id: tenantId,
      source_module: 'COMMISSIONS_FIDUCIARY',
      reference_id: tx.transaction_number,
      status: 'POSTED'
    });

    if (!glJournal) {
      const glResult = await legacyDirectPost({
        tenantId,
        userId,
        postingDate: new Date(),
        sourceModule: 'COMMISSIONS_FIDUCIARY',
        referenceId: tx.transaction_number,
        memo: `Retail Broker Commission Payout: ${tx.payee_party_id} on ${tx.policy_reference} (${payRef})`,
        lines: [
          {
            account_code: '2020',
            debit: amountBN.toFixed(2),
            credit: '0.00',
            memo: `Discharge Broker Commission Payable for ${tx.transaction_number}`
          },
          {
            account_code: '1010',
            debit: '0.00',
            credit: amountBN.toFixed(2),
            memo: 'Broker Commission Payout from Texas § 4053 Premium Trust'
          }
        ]
      });
      glJournal = glResult.journal;
    }

    await CommissionTransaction.updateOne(
      { _id: tx._id },
      {
        $set: {
          lifecycle_status: 'PAID',
          payment_reference: payRef,
          paid_at: new Date(),
          linked_journal_id: glJournal ? glJournal._id : null
        }
      }
    );

    const updatedTx = await CommissionTransaction.findById(tx._id);

    return res.json({
      status: 'success',
      message: `Broker commission of $${amountBN.toFixed(2)} disbursed successfully via ACH! Journal #${glJournal ? glJournal.journal_number : 'JE-POSTED'} recorded.`,
      data: {
        transaction: updatedTx,
        journal: glJournal
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// 11. Seed Canonical Commission Setup
exports.seedCommissions = async (req, res) => {
  try {
    const seeded = await commissionsService.seedTenantCommissions(req.tenantId);
    return res.json({ status: 'success', message: 'Canonical commissions seeded successfully', data: seeded });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// 12. Step 1.3: Commission & Carrier Share Allocation (Dynamic Multi-Carrier & Multi-Broker Subledger)
exports.allocateCommissionShares = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    let {
      policy_reference = 'POL-TX-8821',
      invoice_reference = 'INV-2026-00001',
      installment_premium,
      carrier_id,
      carrier_name,
      broker_id,
      broker_name,
      mga_id = 'MGA-HARBOR',
      carrier_rate = 80.0,
      broker_rate = 10.0,
      mga_rate = 10.0,
      cost_center = 'CC-OPS',
      company_code = 'COMP-001',
      dimensions = {}
    } = req.body;

    // 1. Try to lookup existing invoice for context
    let invoice = null;
    if (invoice_reference) {
      invoice = await Invoice.findOne({
        tenant_id: tenantId,
        $or: [
          { invoice_number: invoice_reference.trim().toUpperCase() },
          ...(require('mongoose').isValidObjectId(invoice_reference) ? [{ _id: invoice_reference }] : [])
        ]
      });

      if (invoice) {
        policy_reference = invoice.policy_id || policy_reference;
        if (!installment_premium && invoice.total_amount) {
          installment_premium = parseFloat(invoice.total_amount.toString());
        }
        if (!carrier_name && invoice.carrier_name) carrier_name = invoice.carrier_name;
        if (!broker_name && invoice.broker_name) broker_name = invoice.broker_name;
        if (invoice.dimensions && typeof invoice.dimensions === 'object') {
          dimensions = { ...invoice.dimensions, ...dimensions };
        }
      }
    }

    if (!installment_premium) {
      installment_premium = 9412.50;
    }

    // 2. Resolve Counterparties dynamically if not explicitly provided
    if (!carrier_id || !carrier_name) {
      const carrierRole = await PartyRole.findOne({ tenant_id: tenantId, role_type: 'CARRIER', status: 'ACTIVE' }).populate('party_id');
      if (carrierRole && carrierRole.party_id) {
        carrier_id = carrier_id || carrierRole.party_id.party_code || 'CARRIER-SUMMIT';
        carrier_name = carrier_name || carrierRole.party_id.legal_name || 'Summit Mutual Insurance';
      } else {
        carrier_id = carrier_id || 'CARRIER-SUMMIT';
        carrier_name = carrier_name || 'Summit Mutual Insurance';
      }
    }

    if (!broker_id || !broker_name) {
      const brokerRole = await PartyRole.findOne({ tenant_id: tenantId, role_type: 'BROKER', status: 'ACTIVE' }).populate('party_id');
      if (brokerRole && brokerRole.party_id) {
        broker_id = broker_id || brokerRole.party_id.party_code || 'BROKER-BRIGHTLINE';
        broker_name = broker_name || brokerRole.party_id.legal_name || 'Brightline Agency';
      } else {
        broker_id = broker_id || 'BROKER-BRIGHTLINE';
        broker_name = broker_name || 'Brightline Agency';
      }
    }

    const premiumBN = new BigNumber(installment_premium);
    const cRateBN = new BigNumber(carrier_rate).dividedBy(100);
    const bRateBN = new BigNumber(broker_rate).dividedBy(100);

    const carrierAmount = premiumBN.multipliedBy(cRateBN).toFixed(2);
    const brokerAmount = premiumBN.multipliedBy(bRateBN).toFixed(2);
    // Residual exact balance to avoid any rounding disparity
    const mgaAmount = premiumBN.minus(carrierAmount).minus(brokerAmount).toFixed(2);

    const mergedDimensions = {
      carrier_id: String(carrier_id),
      carrier_name: String(carrier_name),
      broker_id: String(broker_id),
      broker_name: String(broker_name),
      producer_id: String(broker_id),
      mga_id: String(mga_id),
      cost_center: String(cost_center || 'CC-OPS'),
      company_code: String(company_code || 'COMP-001'),
      policy_id: String(policy_reference),
      ...dimensions
    };

    const payload = {
      policy_id: policy_reference,
      invoice_id: invoice_reference,
      installment_premium: premiumBN.toNumber(),
      carrier_amount: parseFloat(carrierAmount),
      broker_amount: parseFloat(brokerAmount),
      mga_amount: parseFloat(mgaAmount),
      carrier_id: String(carrier_id),
      carrier_name: String(carrier_name),
      broker_id: String(broker_id),
      broker_name: String(broker_name),
      mga_id: String(mga_id),
      cost_center: String(cost_center || 'CC-OPS'),
      company_code: String(company_code || 'COMP-001'),
      dimensions: mergedDimensions
    };

    const postResult = await postJournalFromResolvedRule({
      tenantId,
      userId,
      eventCode: 'finance.commission.allocated',
      schemaVersion: '1.0.0',
      occurrenceDate: new Date(),
      payload,
      sourceReference: `COMM-ALLOC-${Date.now()}`,
      memo: `Step 1.3: Commission & Carrier Allocation on ${policy_reference} (${invoice_reference}) [Carrier: ${carrier_name}, Broker: ${broker_name}]`
    });

    // Update / seed commission transaction records with actual counterparties
    await CommissionTransaction.findOneAndUpdate(
      { tenant_id: tenantId, transaction_number: 'COMM-2026-00001' },
      {
        tenant_id: tenantId,
        transaction_number: 'COMM-2026-00001',
        policy_reference,
        payer_party_id: carrier_id,
        payee_party_id: mga_id,
        basis_amount: premiumBN.toNumber(),
        rate_applied: parseFloat(carrier_rate),
        calculated_amount: parseFloat(carrierAmount),
        net_retained_amount: parseFloat(mgaAmount),
        lifecycle_status: 'APPROVED',
        effective_date: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await CommissionTransaction.findOneAndUpdate(
      { tenant_id: tenantId, transaction_number: 'COMM-2026-00002' },
      {
        tenant_id: tenantId,
        transaction_number: 'COMM-2026-00002',
        policy_reference,
        payer_party_id: mga_id,
        payee_party_id: broker_id,
        basis_amount: premiumBN.toNumber(),
        rate_applied: parseFloat(broker_rate),
        calculated_amount: parseFloat(brokerAmount),
        net_retained_amount: 0,
        lifecycle_status: 'PAYABLE',
        effective_date: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 4. Mark Invoice as ALLOCATED so it is clearly tracked in the system
    if (invoice_reference) {
      await Invoice.findOneAndUpdate(
        { tenant_id: tenantId, invoice_number: invoice_reference },
        {
          allocation_status: 'ALLOCATED',
          is_allocated: true,
          allocated_at: new Date(),
          allocation_journal_id: postResult.journal._id,
          allocation_journal_number: postResult.journal.journal_number,
          allocated_carrier_id: String(carrier_id),
          allocated_carrier_name: String(carrier_name),
          allocated_broker_id: String(broker_id),
          allocated_broker_name: String(broker_name)
        }
      );
    }

    return res.status(201).json({
      status: 'success',
      message: `Commission & Carrier Share allocated successfully! Journal #${postResult.journal.journal_number} created (Dr 2200 UPR $${premiumBN.toFixed(2)} / Cr 2010 Due to ${carrier_name} $${carrierAmount} / Cr 2020 ${broker_name} Payable $${brokerAmount} / Cr 4200 MGA Revenue $${mgaAmount})`,
      data: {
        journal: postResult.journal,
        allocation: {
          policy_reference,
          invoice_reference,
          carrier_id,
          carrier_name,
          broker_id,
          broker_name,
          installment_premium: premiumBN.toFixed(2),
          due_to_carrier_2010: carrierAmount,
          broker_payable_2020: brokerAmount,
          mga_commission_4200: mgaAmount,
          upr_relieved_2200: premiumBN.toFixed(2),
          dimensions: mergedDimensions
        }
      }
    });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};
