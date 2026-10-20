const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
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
  CollectionAssignment,
  Payment,
  PaymentAllocation,
  InstallmentSchedule,
  Invoice,
  BillingAccount
} = require('../models');
const { publishAndProcessDomainEvent, dispatchOutboxEventRecord } = require('./domainEventPublisher');
const { legacyDirectPost } = require('./legacyPostingAdapter');
const { processPaymentReceipt } = require('./billingService');
const { withOptionalTransaction } = require('../utils/transactionHelper');
const { shouldUseLegacyAdapter } = require('../utils/resolvePostingMode');

/**
 * Execute Simulated Payment Attempt.
 * On SUCCESS:
 * 1. Creates PaymentAttempt record
 * 2. Calls Billing Service to capture real Payment and post double-entry GL receipt journal
 * 3. Creates ProcessorTransaction linked to the Payment
 * On DECLINED / FAILED:
 * 1. Creates PaymentAttempt with failure details
 * 2. Does NOT create Payment or mutate AR
 */
async function executePaymentAttempt({
  tenantId,
  userId,
  billingAccountId,
  mandateId = null,
  amount,
  simulatedOutcome = 'SUCCESS',
  paymentMethod = 'ACH',
  useMigrationAdapter = false
}) {
  const billingAccount = await BillingAccount.findOne({ _id: billingAccountId, tenant_id: tenantId });
  if (!billingAccount) throw new Error('Billing account not found');

  const amtBN = new BigNumber(amount.toString());
  if (amtBN.isLessThanOrEqualTo(0)) throw new Error('Attempt amount must be positive');

  const count = await PaymentAttempt.countDocuments({ tenant_id: tenantId });
  const attemptNumber = `ATT-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

  if (simulatedOutcome !== 'SUCCESS') {
    // Record failed attempt without AR impact
    const attempt = await PaymentAttempt.create({
      tenant_id: tenantId,
      billing_account_id: billingAccountId,
      mandate_id: mandateId,
      attempt_number: attemptNumber,
      amount: mongoose.Types.Decimal128.fromString(amtBN.toFixed(2)),
      outcome: simulatedOutcome,
      is_simulated: true,
      provider_response_code: 'DECLINED_NSF_402',
      diagnostic_detail: 'Simulated decline: Insufficient available funds in customer account'
    });
    return { attempt, billingPayment: null, processorTransaction: null };
  }

  // 1. Success path: Call Billing Payment engine
  const billingResult = await processPaymentReceipt({
    tenantId,
    userId,
    billingAccountId,
    amount: amtBN.toFixed(2),
    paymentMethod,
    referenceNumber: attemptNumber,
    isFiduciary: true,
    useMigrationAdapter
  });

  // 2. Persist PaymentAttempt
  const attempt = await PaymentAttempt.create({
    tenant_id: tenantId,
    billing_account_id: billingAccountId,
    mandate_id: mandateId,
    attempt_number: attemptNumber,
    amount: mongoose.Types.Decimal128.fromString(amtBN.toFixed(2)),
    outcome: 'SUCCESS',
    is_simulated: true,
    provider_response_code: 'SIM_AUTH_200',
    diagnostic_detail: 'Simulated capture approved via mock gateway',
    billing_payment_id: billingResult.payment._id
  });

  // 3. Persist ProcessorTransaction
  const pTxCount = await ProcessorTransaction.countDocuments({ tenant_id: tenantId });
  const processorRef = `PTX-${new Date().getFullYear()}-${String(pTxCount + 1).padStart(5, '0')}`;
  const processorTx = await ProcessorTransaction.create({
    tenant_id: tenantId,
    billing_payment_id: billingResult.payment._id,
    processor_name: 'WELLS_FARGO_GATEWAY',
    processor_reference: processorRef,
    transaction_type: 'CAPTURE',
    amount: mongoose.Types.Decimal128.fromString(amtBN.toFixed(2)),
    processor_fee: mongoose.Types.Decimal128.fromString('0.00'),
    net_amount: mongoose.Types.Decimal128.fromString(amtBN.toFixed(2)),
    status: 'SETTLED',
    reconciliation_status: 'UNMATCHED'
  });

  return {
    attempt,
    billingPayment: billingResult.payment,
    processorTransaction: processorTx,
    journal: billingResult.journal
  };
}

/**
 * Import Bank Statement Lines (CSV / Rows).
 * Enforces idempotent import via import_batch_id & deduplication check.
 */
async function importBankStatementLines({
  tenantId,
  batchId,
  accountType = 'FIDUCIARY_TRUST',
  accountNumber = 'WF-TX-TRUST-1010',
  lines = []
}) {
  if (!lines || lines.length === 0) throw new Error('No statement lines provided');

  const existingLines = await BankStatementLine.find({ tenant_id: tenantId, import_batch_id: batchId });
  if (existingLines.length > 0) {
    throw new Error(`Import batch "${batchId}" has already been imported (${existingLines.length} lines present)`);
  }

  const createdLines = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx];
    const amtBN = new BigNumber(l.amount.toString());
    if (amtBN.isLessThanOrEqualTo(0)) throw new Error(`Row ${idx + 1}: Amount must be positive`);

    const statementLine = await BankStatementLine.create({
      tenant_id: tenantId,
      import_batch_id: batchId,
      line_number: idx + 1,
      booking_date: new Date(l.booking_date || Date.now()),
      bank_account_type: accountType,
      bank_account_number: accountNumber,
      amount: mongoose.Types.Decimal128.fromString(amtBN.toFixed(2)),
      direction: (l.direction || 'CR').toUpperCase(),
      bank_description: l.bank_description || 'Electronic Deposit',
      bank_reference: l.bank_reference || '',
      normalized_reference: (l.bank_reference || '').trim().toUpperCase(),
      reconciliation_status: 'UNMATCHED',
      matched_amount: mongoose.Types.Decimal128.fromString('0.00')
    });
    createdLines.push(statementLine);
  }

  return createdLines;
}

/**
 * Automated 4-Way Reconciliation Matcher.
 * Matches bank statement lines with unsettled processor transactions on exact amount + normalized reference.
 */
async function runAutoReconciliation(tenantId) {
  const unmatchedBankLines = await BankStatementLine.find({
    tenant_id: tenantId,
    reconciliation_status: 'UNMATCHED',
    direction: 'CR'
  });

  const unmatchedSystemTxs = await ProcessorTransaction.find({
    tenant_id: tenantId,
    reconciliation_status: 'UNMATCHED',
    status: 'SETTLED'
  });

  const matches = [];

  for (const bLine of unmatchedBankLines) {
    const bAmt = new BigNumber(bLine.amount.toString());
    const bRef = bLine.normalized_reference;

    // Find candidate by exact amount and matching reference if present
    const candidate = unmatchedSystemTxs.find(tx => {
      if (tx.reconciliation_status !== 'UNMATCHED') return false;
      const txAmt = new BigNumber(tx.amount.toString());
      if (!txAmt.isEqualTo(bAmt)) return false;

      // If reference provided, assert match
      if (bRef && tx.processor_reference) {
        return tx.processor_reference.includes(bRef) || bRef.includes(tx.processor_reference);
      }
      return true;
    });

    if (candidate) {
      // Execute Match
      const matchDoc = await CashReconciliationMatch.create({
        tenant_id: tenantId,
        bank_statement_line_id: bLine._id,
        processor_transaction_id: candidate._id,
        match_type: 'AUTO',
        matched_amount: mongoose.Types.Decimal128.fromString(bAmt.toFixed(2)),
        confidence_score: 1.0,
        status: 'ACTIVE'
      });

      bLine.reconciliation_status = 'MATCHED';
      bLine.matched_amount = bLine.amount;
      await bLine.save();

      candidate.reconciliation_status = 'MATCHED';
      await candidate.save();

      matches.push(matchDoc);
    }
  }

  return matches;
}

/**
 * Manual Match with Audit Reason
 */
async function manualMatch({
  tenantId,
  userId,
  bankStatementLineId,
  processorTransactionId,
  reason
}) {
  const bLine = await BankStatementLine.findOne({ _id: bankStatementLineId, tenant_id: tenantId });
  const pTx = await ProcessorTransaction.findOne({ _id: processorTransactionId, tenant_id: tenantId });

  if (!bLine || !pTx) throw new Error('Bank statement line or processor transaction not found');
  if (bLine.reconciliation_status === 'MATCHED') throw new Error('Bank statement line is already matched');
  if (pTx.reconciliation_status === 'MATCHED') throw new Error('Processor transaction is already matched');

  const bAmt = new BigNumber(bLine.amount.toString());
  const pAmt = new BigNumber(pTx.amount.toString());
  if (!bAmt.isEqualTo(pAmt)) {
    throw new Error(`Amount mismatch: Bank line ($${bAmt.toFixed(2)}) must equal Processor Tx ($${pAmt.toFixed(2)})`);
  }

  const matchDoc = await CashReconciliationMatch.create({
    tenant_id: tenantId,
    bank_statement_line_id: bLine._id,
    processor_transaction_id: pTx._id,
    match_type: 'MANUAL',
    matched_amount: mongoose.Types.Decimal128.fromString(bAmt.toFixed(2)),
    matched_by_user_id: userId,
    confidence_score: 1.0,
    unmatch_reason: reason || 'Manual audit match',
    status: 'ACTIVE'
  });

  bLine.reconciliation_status = 'MATCHED';
  bLine.matched_amount = bLine.amount;
  await bLine.save();

  pTx.reconciliation_status = 'MANUALLY_MATCHED';
  await pTx.save();

  return matchDoc;
}

/**
 * Process Payment Return / NSF Dishonor.
 * Reverses cash receipt:
 * Debit 1100 Premium Receivable
 * Credit 1010 Premium Trust Cash
 * Debit 1100 AR for $35 NSF Fee
 * Credit 4100 Fee Income for $35 NSF Fee
 */
async function processPaymentReturn({
  tenantId,
  userId,
  paymentId,
  returnCode = 'R01',
  reasonDescription = 'ACH Insufficient Funds (NSF)',
  useMigrationAdapter = false
}) {
  const isLegacy = await shouldUseLegacyAdapter({
    tenantId,
    eventCode: 'treasury.payment.returned',
    useMigrationAdapter
  });

  const { paymentReturn, outboxEvent, legacyGlResult } = await withOptionalTransaction(async (session) => {
    const payment = await Payment.findOne({ _id: paymentId, tenant_id: tenantId }).session(session);
    if (!payment) throw new Error('Payment not found');
    if (payment.status === 'RETURNED') throw new Error('Payment has already been returned');

    const pAmtBN = new BigNumber(payment.amount.toString());
    const feeBN = new BigNumber('35.00'); // Standard NSF Fee

    const count = await PaymentReturn.countDocuments({ tenant_id: tenantId }).session(session);
    const returnNumber = `RET-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    let lGlResult = null;
    if (isLegacy) {
      const journalLines = [
        {
          account_code: '1100', // Re-instate AR
          debit: pAmtBN.toFixed(2),
          credit: '0.00',
          memo: `Dr Re-instate AR for returned payment ${payment.payment_number}`
        },
        {
          account_code: '1010', // Remove cash from trust
          debit: '0.00',
          credit: pAmtBN.toFixed(2),
          memo: `Cr Fiduciary cash dishonored (${returnCode})`
        },
        {
          account_code: '1100', // Assess NSF penalty fee to customer
          debit: feeBN.toFixed(2),
          credit: '0.00',
          memo: `Dr NSF Return Penalty Fee assessment`
        },
        {
          account_code: '4100', // Recognize penalty fee income
          debit: '0.00',
          credit: feeBN.toFixed(2),
          memo: `Cr NSF Penalty Fee Revenue`
        }
      ];

      lGlResult = await legacyDirectPost({
        tenantId,
        userId,
        postingDate: new Date(),
        sourceModule: 'TREASURY_RETURN',
        referenceId: returnNumber,
        memo: `Payment Return ${returnNumber} (${returnCode}) - ${payment.payment_number}`,
        lines: journalLines
      });
    }

    // 1. Update Payment Status
    payment.status = 'RETURNED';
    await payment.save({ session });

    // 2. F-04: Reconcile subledger - Reverse PaymentAllocations & Restore Invoices
    const allocations = await PaymentAllocation.find({
      tenant_id: tenantId,
      payment_id: payment._id,
      status: { $ne: 'REVERSED' }
    }).session(session);

    let totalAllocatedReversed = new BigNumber(0);
    for (const alloc of allocations) {
      const allocAmt = new BigNumber(alloc.allocated_amount.toString());
      totalAllocatedReversed = totalAllocatedReversed.plus(allocAmt);

      const inv = await Invoice.findOne({ _id: alloc.invoice_id, tenant_id: tenantId }).session(session);
      if (inv) {
        const curBal = new BigNumber(inv.balance_due.toString());
        const curPaid = new BigNumber(inv.amount_paid.toString());
        const newBal = curBal.plus(allocAmt);
        const newPaid = BigNumber.max(0, curPaid.minus(allocAmt));

        inv.balance_due = mongoose.Types.Decimal128.fromString(newBal.toFixed(2));
        inv.amount_paid = mongoose.Types.Decimal128.fromString(newPaid.toFixed(2));
        inv.status = newPaid.isZero() ? 'ISSUED' : 'PARTIALLY_PAID';
        await inv.save({ session });

        if (inv.installment_number) {
          await InstallmentSchedule.updateOne(
            { tenant_id: tenantId, invoice_id: inv._id },
            {
              paid_amount: mongoose.Types.Decimal128.fromString(newPaid.toFixed(2)),
              balance_amount: mongoose.Types.Decimal128.fromString(newBal.toFixed(2)),
              status: newPaid.isZero() ? 'BILLED' : 'PARTIALLY_PAID'
            },
            { session }
          );
        }
      }

      alloc.status = 'REVERSED';
      await alloc.save({ session });
    }

    // 3. F-04: Restore BillingAccount current_balance and reverse unapplied cash if applicable
    const billingAccount = await BillingAccount.findOne({ _id: payment.billing_account_id, tenant_id: tenantId }).session(session);
    if (billingAccount) {
      const curAccBal = new BigNumber(billingAccount.current_balance ? billingAccount.current_balance.toString() : '0');
      billingAccount.current_balance = mongoose.Types.Decimal128.fromString(curAccBal.plus(totalAllocatedReversed).toFixed(2));

      const pUnappliedBN = new BigNumber(payment.unapplied_amount ? payment.unapplied_amount.toString() : '0');
      if (pUnappliedBN.isGreaterThan(0)) {
        const curUnapplied = new BigNumber(billingAccount.unapplied_cash ? billingAccount.unapplied_cash.toString() : '0');
        billingAccount.unapplied_cash = mongoose.Types.Decimal128.fromString(BigNumber.max(0, curUnapplied.minus(pUnappliedBN)).toFixed(2));
      }
      await billingAccount.save({ session });
    }

    // 4. Create PaymentReturn Record
    const pReturnDoc = new PaymentReturn({
      tenant_id: tenantId,
      billing_payment_id: payment._id,
      return_number: returnNumber,
      return_amount: mongoose.Types.Decimal128.fromString(pAmtBN.toFixed(2)),
      fee_amount: mongoose.Types.Decimal128.fromString(feeBN.toFixed(2)),
      return_code: returnCode,
      reason_description: reasonDescription,
      journal_id: lGlResult ? lGlResult.journal._id : null,
      status: 'SETTLED'
    });
    await pReturnDoc.save({ session });

    let oEvent = null;
    if (!isLegacy) {
      const eventResult = await publishAndProcessDomainEvent({
        tenantId,
        eventType: 'treasury.payment.returned',
        eventVersion: '1.0.0',
        sourceModule: 'TREASURY',
        sourceEntityType: 'PaymentReturn',
        sourceEntityId: returnNumber,
        sourceTransactionId: returnNumber,
        correlationId: `CORR-RET-${returnNumber}`,
        occurredAt: new Date(),
        payload: {
          return_reference: returnNumber,
          return_number: returnNumber,
          payment_number: payment.payment_number,
          payment_id: String(payment._id),
          billing_account_id: String(payment.billing_account_id),
          amount: pAmtBN.toNumber(),
          return_amount: pAmtBN.toNumber(),
          fee_amount: feeBN.toNumber(),
          return_code: returnCode,
          reason_description: reasonDescription,
          currency: 'USD'
        },
        userId,
        session,
        dispatchImmediately: false
      });
      oEvent = eventResult.outboxEvent;
    }

    return {
      paymentReturn: pReturnDoc,
      outboxEvent: oEvent,
      legacyGlResult: lGlResult
    };
  });

  let glResult = legacyGlResult;
  let eventDriven = false;

  // Post-commit dispatch outside MongoDB transaction
  if (!isLegacy && outboxEvent) {
    const dispatchResult = await dispatchOutboxEventRecord(outboxEvent, { userId });
    if (dispatchResult.journal) {
      glResult = { journal: dispatchResult.journal };
      paymentReturn.journal_id = dispatchResult.journal._id;
      await PaymentReturn.updateOne({ _id: paymentReturn._id }, { journal_id: dispatchResult.journal._id });
    }
    eventDriven = true;
  }

  return {
    paymentReturn,
    journal: glResult ? glResult.journal : null,
    outboxEvent,
    eventDriven
  };
}

/**
 * Request & Disburse Premium Refund
 */
async function processRefundDisbursement({
  tenantId,
  userId,
  billingAccountId,
  amount,
  reason = 'Policy cancellation return premium',
  refundMethod = 'ACH',
  refundSourceType = null,
  useMigrationAdapter = false
}) {
  const isLegacy = await shouldUseLegacyAdapter({
    tenantId,
    eventCode: 'treasury.refund.disbursed',
    useMigrationAdapter
  });

  const { refund, outboxEvent, legacyGlResult } = await withOptionalTransaction(async (session) => {
    const billingAccount = await BillingAccount.findOne({ _id: billingAccountId, tenant_id: tenantId }).session(session);
    if (!billingAccount) throw new Error('Billing account not found');

    const amtBN = new BigNumber(amount.toString());
    if (amtBN.isLessThanOrEqualTo(0)) throw new Error('Refund amount must be positive');

    // F-05: Reconcile unapplied cash refund state & reject if exceeding unapplied cash
    const isUnappliedCashRefund = refundSourceType === 'UNAPPLIED_CASH' || /unapplied/i.test(reason);
    if (isUnappliedCashRefund) {
      const curUnapplied = new BigNumber(billingAccount.unapplied_cash ? billingAccount.unapplied_cash.toString() : '0');
      if (amtBN.isGreaterThan(curUnapplied)) {
        throw new Error(`Refund amount ($${amtBN.toFixed(2)}) exceeds available unapplied cash ($${curUnapplied.toFixed(2)})`);
      }
      billingAccount.unapplied_cash = mongoose.Types.Decimal128.fromString(curUnapplied.minus(amtBN).toFixed(2));
      await billingAccount.save({ session });
    }

    const count = await Refund.countDocuments({ tenant_id: tenantId }).session(session);
    const refundNumber = `REF-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    let lGlResult = null;
    if (isLegacy) {
      lGlResult = await legacyDirectPost({
        tenantId,
        userId,
        postingDate: new Date(),
        sourceModule: 'TREASURY_REFUND',
        referenceId: refundNumber,
        memo: `Premium Refund ${refundNumber} - ${billingAccount.customer_name}`,
        lines: [
          {
            account_code: '2100',
            debit: amtBN.toFixed(2),
            credit: '0.00',
            memo: `Dr Return Premium Payable cleared`
          },
          {
            account_code: '1010',
            debit: '0.00',
            credit: amtBN.toFixed(2),
            memo: `Cr Trust cash disbursed via ${refundMethod}`
          }
        ]
      });
    }

    const refundDoc = new Refund({
      tenant_id: tenantId,
      billing_account_id: billingAccountId,
      refund_number: refundNumber,
      refund_amount: mongoose.Types.Decimal128.fromString(amtBN.toFixed(2)),
      refund_method: refundMethod,
      reason,
      approved_by_user_id: userId,
      approved_at: new Date(),
      disbursed_at: new Date(),
      journal_id: lGlResult ? lGlResult.journal._id : null,
      status: 'DISBURSED'
    });
    await refundDoc.save({ session });

    let oEvent = null;
    if (!isLegacy) {
      const eventResult = await publishAndProcessDomainEvent({
        tenantId,
        eventType: 'treasury.refund.disbursed',
        eventVersion: '1.0.0',
        sourceModule: 'TREASURY',
        sourceEntityType: 'Refund',
        sourceEntityId: refundNumber,
        sourceTransactionId: refundNumber,
        correlationId: `CORR-REF-${refundNumber}`,
        occurredAt: new Date(),
        payload: {
          refund_number: refundNumber,
          billing_account_id: String(billingAccountId),
          refund_amount: amtBN.toNumber(),
          refund_method: refundMethod,
          reason,
          customer_name: billingAccount.customer_name,
          currency: 'USD'
        },
        userId,
        session,
        dispatchImmediately: false
      });
      oEvent = eventResult.outboxEvent;
    }

    return {
      refund: refundDoc,
      outboxEvent: oEvent,
      legacyGlResult: lGlResult
    };
  });

  let glResult = legacyGlResult;
  let eventDriven = false;

  // Post-commit dispatch outside MongoDB transaction
  if (!isLegacy && outboxEvent) {
    const dispatchResult = await dispatchOutboxEventRecord(outboxEvent, { userId });
    if (dispatchResult.journal) {
      glResult = { journal: dispatchResult.journal };
      refund.journal_id = dispatchResult.journal._id;
      await Refund.updateOne({ _id: refund._id }, { journal_id: dispatchResult.journal._id });
    }
    eventDriven = true;
  }

  return {
    refund,
    journal: glResult ? glResult.journal : null,
    outboxEvent,
    eventDriven
  };
}

module.exports = {
  executePaymentAttempt,
  importBankStatementLines,
  runAutoReconciliation,
  manualMatch,
  processPaymentReturn,
  processRefundDisbursement
};
