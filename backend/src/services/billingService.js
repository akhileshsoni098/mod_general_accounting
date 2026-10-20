const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  BillingPlan,
  BillingAccount,
  BillingAccountPolicy,
  InstallmentSchedule,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentAllocation,
  BillingAdjustment
} = require('../models');
const { publishAndProcessDomainEvent, dispatchOutboxEventRecord } = require('./domainEventPublisher');
const { legacyDirectPost } = require('./legacyPostingAdapter');
const { createOutboxEvent } = require('./outboxService');
const { withOptionalTransaction } = require('../utils/transactionHelper');
const { shouldUseLegacyAdapter } = require('../utils/resolvePostingMode');

/**
 * Seed default billing plans for a tenant if none exist.
 */
async function seedDefaultBillingPlans(tenantId) {
  const existing = await BillingPlan.find({ tenant_id: tenantId });
  if (existing.length > 0) return existing;

  const defaults = [
    {
      tenant_id: tenantId,
      plan_code: 'FULL_PAY',
      plan_name: 'Full Pay (100% Upfront)',
      description: 'Single upfront annual payment with zero installment fees',
      installment_count: 1,
      down_payment_pct: mongoose.Types.Decimal128.fromString('100.00'),
      installment_fee: mongoose.Types.Decimal128.fromString('0.00'),
      interval_months: 0
    },
    {
      tenant_id: tenantId,
      plan_code: '4_PAY_25_DOWN',
      plan_name: '4-Pay (25% Down + 3 Installments)',
      description: '25% down payment + $150 policy fee followed by 3 quarterly installments',
      installment_count: 4,
      down_payment_pct: mongoose.Types.Decimal128.fromString('25.00'),
      installment_fee: mongoose.Types.Decimal128.fromString('0.00'), // Fee is distinct on deposit
      interval_months: 3
    },
    {
      tenant_id: tenantId,
      plan_code: '10_PAY',
      plan_name: '10-Pay Monthly',
      description: '20% down payment followed by 9 equal monthly installments with $15 fee',
      installment_count: 10,
      down_payment_pct: mongoose.Types.Decimal128.fromString('20.00'),
      installment_fee: mongoose.Types.Decimal128.fromString('15.00'),
      interval_months: 1
    }
  ];

  return await BillingPlan.insertMany(defaults);
}

/**
 * Generate Installment Schedule from Billing Plan & Policy Details.
 * For 4-Pay $37,650 + $150 policy fee:
 * Down payment = 25% * $37,650 = $9,412.50 (+ $150 fee) = $9,562.50.
 * Remaining 3 installments = $9,412.50 each.
 */
async function generateInstallmentSchedule({
  tenantId,
  billingAccountId,
  policyId,
  policyNumber,
  effectiveDate,
  totalPremium,
  policyFee = '0.00',
  taxAmount = '0.00',
  billingPlanCode = '4_PAY_25_DOWN'
}) {
  const plan = await BillingPlan.findOne({ tenant_id: tenantId, plan_code: billingPlanCode });
  if (!plan) {
    throw new Error(`Billing plan ${billingPlanCode} not found`);
  }

  // Clear existing unbilled schedule for this policy to ensure idempotency
  await InstallmentSchedule.deleteMany({
    tenant_id: tenantId,
    policy_id: policyId,
    status: 'SCHEDULED'
  });

  const premiumBN = new BigNumber(totalPremium.toString());
  const feeBN = new BigNumber(policyFee.toString());
  const taxBN = new BigNumber(taxAmount.toString());
  const count = plan.installment_count;

  const schedules = [];
  const effDate = new Date(effectiveDate);

  if (count === 1) {
    // Single pay
    const total = premiumBN.plus(feeBN).plus(taxBN);
    schedules.push({
      tenant_id: tenantId,
      billing_account_id: billingAccountId,
      policy_id: policyId,
      policy_number: policyNumber,
      installment_number: 1,
      due_date: effDate,
      premium_amount: mongoose.Types.Decimal128.fromString(premiumBN.toFixed(2)),
      fee_amount: mongoose.Types.Decimal128.fromString(feeBN.toFixed(2)),
      tax_amount: mongoose.Types.Decimal128.fromString(taxBN.toFixed(2)),
      total_amount: mongoose.Types.Decimal128.fromString(total.toFixed(2)),
      balance_amount: mongoose.Types.Decimal128.fromString(total.toFixed(2)),
      status: 'SCHEDULED'
    });
  } else {
    const downPct = new BigNumber(plan.down_payment_pct.toString()).dividedBy(100);
    const downPremium = premiumBN.multipliedBy(downPct).dp(2, BigNumber.ROUND_HALF_UP);
    const remainingPremium = premiumBN.minus(downPremium);
    const remainingInstallmentsCount = count - 1;
    const baseInstallment = remainingPremium.dividedBy(remainingInstallmentsCount).dp(2, BigNumber.ROUND_DOWN);

    // Installment 1: Down Payment (+ full initial policy fee + initial tax)
    const inst1Total = downPremium.plus(feeBN).plus(taxBN);
    schedules.push({
      tenant_id: tenantId,
      billing_account_id: billingAccountId,
      policy_id: policyId,
      policy_number: policyNumber,
      installment_number: 1,
      due_date: new Date(effDate),
      premium_amount: mongoose.Types.Decimal128.fromString(downPremium.toFixed(2)),
      fee_amount: mongoose.Types.Decimal128.fromString(feeBN.toFixed(2)),
      tax_amount: mongoose.Types.Decimal128.fromString(taxBN.toFixed(2)),
      total_amount: mongoose.Types.Decimal128.fromString(inst1Total.toFixed(2)),
      balance_amount: mongoose.Types.Decimal128.fromString(inst1Total.toFixed(2)),
      status: 'SCHEDULED'
    });

    // Subsequent installments
    let runningRemaining = remainingPremium;
    for (let i = 2; i <= count; i++) {
      const nextDate = new Date(effDate);
      nextDate.setMonth(nextDate.getMonth() + (i - 1) * (plan.interval_months || 1));

      let instPremium;
      if (i === count) {
        // Last installment absorbs any penny rounding remainder
        instPremium = runningRemaining;
      } else {
        instPremium = baseInstallment;
        runningRemaining = runningRemaining.minus(instPremium);
      }

      schedules.push({
        tenant_id: tenantId,
        billing_account_id: billingAccountId,
        policy_id: policyId,
        policy_number: policyNumber,
        installment_number: i,
        due_date: nextDate,
        premium_amount: mongoose.Types.Decimal128.fromString(instPremium.toFixed(2)),
        fee_amount: mongoose.Types.Decimal128.fromString('0.00'),
        tax_amount: mongoose.Types.Decimal128.fromString('0.00'),
        total_amount: mongoose.Types.Decimal128.fromString(instPremium.toFixed(2)),
        balance_amount: mongoose.Types.Decimal128.fromString(instPremium.toFixed(2)),
        status: 'SCHEDULED'
      });
    }
  }

  return await InstallmentSchedule.insertMany(schedules);
}

/**
 * Create and Issue an Invoice from an Installment or direct parameters.
 * Automatically posts double-entry GL journal:
 * Debit 1100 Premium Receivable
 * Credit 2200 Unearned Premium Reserve (for premium portion)
 * Credit 4100 Policy Fee Income (for fee portion)
 */
async function issueInvoice({
  tenantId,
  userId,
  billingAccountId,
  policyId,
  installmentNumber = 1,
  invoiceDate = new Date(),
  lines = [], // [{ line_type: 'PREMIUM', description, amount, ledger_account_code }]
  carrierId = null,
  carrierName = null,
  brokerId = null,
  brokerName = null,
  dimensions = {},
  useEventPipeline = null,
  useMigrationAdapter = false,
  correlationId = null,
  dispatchImmediately = null
}) {
  const isLegacy = await shouldUseLegacyAdapter({
    tenantId,
    eventCode: 'billing.invoice.issued',
    useMigrationAdapter
  });

  const { invoice, createdLines, outboxEvent, legacyGlResult } = await withOptionalTransaction(async (session) => {
    const billingAccount = await BillingAccount.findOne({ _id: billingAccountId, tenant_id: tenantId }).session(session);
    if (!billingAccount) throw new Error('Billing account not found');

    const existingInvoice = await Invoice.findOne({
      tenant_id: tenantId,
      policy_id: policyId,
      installment_number: installmentNumber,
      status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] }
    }).session(session);
    if (existingInvoice) {
      throw new Error(`Invoice already issued for policy ${policyId} installment #${installmentNumber} (${existingInvoice.invoice_number})`);
    }

    let totalAmountBN = new BigNumber(0);
    for (const l of lines) {
      const amt = new BigNumber(l.amount.toString());
      if (amt.isLessThanOrEqualTo(0)) throw new Error('Invoice line amount must be greater than zero');
      totalAmountBN = totalAmountBN.plus(amt);
    }

    const invoiceCount = await Invoice.countDocuments({ tenant_id: tenantId }).session(session);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(5, '0')}`;
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);

    let lGlResult = null;
    if (isLegacy) {
      const journalLines = [
        {
          account_code: '1100',
          debit: totalAmountBN.toFixed(2),
          credit: '0.00',
          memo: `Dr AR for Invoice ${invoiceNumber}`
        }
      ];

      for (const l of lines) {
        journalLines.push({
          account_code: l.ledger_account_code || (l.line_type === 'FEE' ? '4100' : '2200'),
          debit: '0.00',
          credit: new BigNumber(l.amount.toString()).toFixed(2),
          memo: `Cr ${l.description}`
        });
      }

      lGlResult = await legacyDirectPost({
        tenantId,
        userId,
        postingDate: invoiceDate,
        sourceModule: 'BILLING_INVOICE',
        referenceId: invoiceNumber,
        memo: `Billing Invoice ${invoiceNumber} - ${billingAccount.customer_name}`,
        lines: journalLines
      });
    }

    // Resolve Carrier and Broker details
    let resolvedCarrierName = carrierName || billingAccount.carrier_name;
    let resolvedBrokerName = brokerName || billingAccount.broker_name;
    let resolvedCarrierId = carrierId || billingAccount.carrier_id;
    let resolvedBrokerId = brokerId || billingAccount.broker_id;

    if (!resolvedCarrierName) {
      const polLink = await BillingAccountPolicy.findOne({ tenant_id: tenantId, policy_id: policyId }).session(session);
      if (polLink && polLink.carrier_name) resolvedCarrierName = polLink.carrier_name;
    }

    const mergedDimensions = {
      ...(billingAccount.dimensions || {}),
      ...(dimensions || {})
    };
    if (resolvedCarrierName) mergedDimensions.carrier_name = resolvedCarrierName;
    if (resolvedCarrierId) mergedDimensions.carrier_id = String(resolvedCarrierId);
    if (resolvedBrokerName) mergedDimensions.broker_name = resolvedBrokerName;
    if (resolvedBrokerId) mergedDimensions.broker_id = String(resolvedBrokerId);

    const invDoc = new Invoice({
      tenant_id: tenantId,
      billing_account_id: billingAccountId,
      policy_id: policyId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      installment_number: installmentNumber,
      total_amount: mongoose.Types.Decimal128.fromString(totalAmountBN.toFixed(2)),
      amount_paid: mongoose.Types.Decimal128.fromString('0.00'),
      balance_due: mongoose.Types.Decimal128.fromString(totalAmountBN.toFixed(2)),
      status: 'ISSUED',
      journal_id: lGlResult ? lGlResult.journal._id : null,
      memo: `Policy ${policyId} Installment #${installmentNumber}`,
      carrier_id: resolvedCarrierId || null,
      carrier_name: resolvedCarrierName || null,
      broker_id: resolvedBrokerId || null,
      broker_name: resolvedBrokerName || null,
      dimensions: mergedDimensions
    });
    await invDoc.save({ session });

    const crLines = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const l = lines[idx];
      const lineDoc = new InvoiceLine({
        tenant_id: tenantId,
        invoice_id: invDoc._id,
        line_number: idx + 1,
        line_type: l.line_type || 'PREMIUM',
        description: l.description,
        amount: mongoose.Types.Decimal128.fromString(new BigNumber(l.amount.toString()).toFixed(2)),
        ledger_account_code: l.ledger_account_code || (l.line_type === 'FEE' ? '4100' : '2200')
      });
      await lineDoc.save({ session });
      crLines.push(lineDoc);
    }

    await InstallmentSchedule.updateOne(
      { tenant_id: tenantId, policy_id: policyId, installment_number: installmentNumber },
      { status: 'BILLED', invoice_id: invDoc._id },
      { session }
    );

    const currentAccBal = new BigNumber(billingAccount.current_balance ? billingAccount.current_balance.toString() : '0');
    billingAccount.current_balance = mongoose.Types.Decimal128.fromString(currentAccBal.plus(totalAmountBN).toFixed(2));
    await billingAccount.save({ session });

    let oEvent = null;
    if (!isLegacy) {
      const premiumLines = lines.filter(l => l.line_type !== 'FEE');
      const feeLines = lines.filter(l => l.line_type === 'FEE');
      const premiumAmt = premiumLines.reduce((acc, l) => acc.plus(new BigNumber(l.amount.toString())), new BigNumber(0)).toNumber();
      const feeAmt = feeLines.reduce((acc, l) => acc.plus(new BigNumber(l.amount.toString())), new BigNumber(0)).toNumber();

      const eventResult = await publishAndProcessDomainEvent({
        tenantId,
        eventType: 'billing.invoice.issued',
        eventVersion: '1.0.0',
        sourceModule: 'BILLING',
        sourceEntityType: 'Invoice',
        sourceEntityId: invoiceNumber,
        sourceTransactionId: invoiceNumber,
        correlationId: correlationId || `CORR-${invoiceNumber}`,
        occurredAt: invoiceDate,
        payload: {
          invoice_id: String(invDoc._id),
          invoice_number: invoiceNumber,
          policy_id: String(policyId),
          billing_account_id: String(billingAccountId),
          installment_number: installmentNumber,
          total_amount: totalAmountBN.toNumber(),
          premium_amount: premiumAmt,
          gross_premium: premiumAmt,
          fee_amount: feeAmt,
          policy_fee: feeAmt,
          transaction_type: 'DIRECT_BILL',
          currency: 'USD',
          customer_name: billingAccount.customer_name,
          carrier_id: resolvedCarrierId ? String(resolvedCarrierId) : undefined,
          carrier_name: resolvedCarrierName || undefined,
          broker_id: resolvedBrokerId ? String(resolvedBrokerId) : undefined,
          broker_name: resolvedBrokerName || undefined,
          dimensions: mergedDimensions
        },
        userId,
        session,
        dispatchImmediately: false
      });
      oEvent = eventResult.outboxEvent;
    }

    return {
      invoice: invDoc,
      createdLines: crLines,
      outboxEvent: oEvent,
      legacyGlResult: lGlResult
    };
  });

  let glResult = legacyGlResult;
  let eventDriven = false;

  // Post-commit dispatch outside MongoDB transaction
  if (!isLegacy && outboxEvent) {
    const shouldDispatch = dispatchImmediately !== null ? dispatchImmediately : !useEventPipeline;
    if (shouldDispatch) {
      const dispatchResult = await dispatchOutboxEventRecord(outboxEvent, { userId });
      if (dispatchResult.journal) {
        glResult = { journal: dispatchResult.journal };
        invoice.journal_id = dispatchResult.journal._id;
        await Invoice.updateOne({ _id: invoice._id }, { journal_id: dispatchResult.journal._id });
      }
    }
    eventDriven = true;
  }

  return {
    invoice,
    lines: createdLines,
    journal: glResult ? glResult.journal : null,
    outboxEvent,
    eventDriven
  };
}

/**
 * Process Customer Cash Receipt and Waterfall Allocation against open invoices.
 * Posts GL Journal:
 * Debit 1010 Premium Trust (or 1000 Operating Cash)
 * Credit 1100 Premium Receivable (for allocated amount)
 * Credit 2190 Unapplied Cash Suspense (for excess payment amount)
 */
async function processPaymentReceipt({
  tenantId,
  userId,
  billingAccountId,
  amount,
  paymentMethod = 'ACH',
  referenceNumber = '',
  paymentDate = new Date(),
  targetInvoiceId = null,
  isFiduciary = true,
  useMigrationAdapter = false
}) {
  const isLegacy = await shouldUseLegacyAdapter({
    tenantId,
    eventCode: 'billing.payment.received',
    useMigrationAdapter
  });

  const { payment, createdAllocations, outboxEvent, legacyGlResult } = await withOptionalTransaction(async (session) => {
    const billingAccount = await BillingAccount.findOne({ _id: billingAccountId, tenant_id: tenantId }).session(session);
    if (!billingAccount) throw new Error('Billing account not found');

    const paymentAmountBN = new BigNumber(amount.toString());
    if (paymentAmountBN.isLessThanOrEqualTo(0)) {
      throw new Error('Payment amount must be greater than zero');
    }

    const pCount = await Payment.countDocuments({ tenant_id: tenantId }).session(session);
    const paymentNumber = `PAY-${new Date().getFullYear()}-${String(pCount + 1).padStart(5, '0')}`;

    // Find candidate open invoices for allocation
    let invoiceQuery = {
      tenant_id: tenantId,
      billing_account_id: billingAccountId,
      status: { $in: ['ISSUED', 'PARTIALLY_PAID'] }
    };
    if (targetInvoiceId) {
      invoiceQuery._id = targetInvoiceId;
    }

    // Sort oldest due date first (standard waterfall)
    const openInvoices = await Invoice.find(invoiceQuery).session(session).sort({ due_date: 1, createdAt: 1 });

    let unallocatedBN = paymentAmountBN;
    let totalAllocatedBN = new BigNumber(0);
    const allocationRecords = [];

    for (const inv of openInvoices) {
      if (unallocatedBN.isZero()) break;

      const invBalance = new BigNumber(inv.balance_due.toString());
      if (invBalance.isLessThanOrEqualTo(0)) continue;

      const allocAmt = BigNumber.min(unallocatedBN, invBalance);
      unallocatedBN = unallocatedBN.minus(allocAmt);
      totalAllocatedBN = totalAllocatedBN.plus(allocAmt);

      const newInvBalance = invBalance.minus(allocAmt);
      const newPaidAmount = new BigNumber(inv.amount_paid.toString()).plus(allocAmt);
      inv.balance_due = mongoose.Types.Decimal128.fromString(newInvBalance.toFixed(2));
      inv.amount_paid = mongoose.Types.Decimal128.fromString(newPaidAmount.toFixed(2));
      inv.status = newInvBalance.isZero() ? 'PAID' : 'PARTIALLY_PAID';
      await inv.save({ session });

      allocationRecords.push({
        invoice_id: inv._id,
        installment_number: inv.installment_number,
        allocated_amount: allocAmt
      });

      // Update corresponding installment schedule if exists
      if (inv.installment_number) {
        await InstallmentSchedule.updateOne(
          { tenant_id: tenantId, invoice_id: inv._id },
          {
            paid_amount: mongoose.Types.Decimal128.fromString(newPaidAmount.toFixed(2)),
            balance_amount: mongoose.Types.Decimal128.fromString(newInvBalance.toFixed(2)),
            status: newInvBalance.isZero() ? 'PAID' : 'PARTIALLY_PAID'
          },
          { session }
        );
      }
    }

    let lGlResult = null;
    if (isLegacy) {
      const cashAccountCode = isFiduciary ? '1010' : '1000';
      const journalLines = [
        {
          account_code: cashAccountCode,
          debit: paymentAmountBN.toFixed(2),
          credit: '0.00',
          memo: `Dr Cash received via ${paymentMethod} (${paymentNumber})`
        }
      ];

      if (totalAllocatedBN.isGreaterThan(0)) {
        journalLines.push({
          account_code: '1100',
          debit: '0.00',
          credit: totalAllocatedBN.toFixed(2),
          memo: `Cr AR knocked off by Payment ${paymentNumber}`
        });
      }

      if (unallocatedBN.isGreaterThan(0)) {
        journalLines.push({
          account_code: '2190',
          debit: '0.00',
          credit: unallocatedBN.toFixed(2),
          memo: `Cr Unapplied Cash Suspense for excess payment ${paymentNumber}`
        });
      }

      lGlResult = await legacyDirectPost({
        tenantId,
        userId,
        postingDate: paymentDate,
        sourceModule: 'BILLING_PAYMENT',
        referenceId: paymentNumber,
        memo: `Customer Cash Receipt ${paymentNumber} - ${billingAccount.customer_name}`,
        lines: journalLines
      });
    }

    // 2. Persist Payment Header
    const paymentStatus = unallocatedBN.isZero()
      ? 'FULLY_ALLOCATED'
      : totalAllocatedBN.isGreaterThan(0)
      ? 'PARTIALLY_ALLOCATED'
      : 'RECEIVED';

    const paymentDoc = new Payment({
      tenant_id: tenantId,
      billing_account_id: billingAccountId,
      payment_number: paymentNumber,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      reference_number: referenceNumber,
      amount: mongoose.Types.Decimal128.fromString(paymentAmountBN.toFixed(2)),
      allocated_amount: mongoose.Types.Decimal128.fromString(totalAllocatedBN.toFixed(2)),
      unapplied_amount: mongoose.Types.Decimal128.fromString(unallocatedBN.toFixed(2)),
      status: paymentStatus,
      journal_id: lGlResult && lGlResult.journal ? lGlResult.journal._id : null,
      notes: `Simulated receipt via ${paymentMethod}`
    });
    await paymentDoc.save({ session });

    // 3. Persist Allocation Records
    const crAllocations = [];
    for (const alloc of allocationRecords) {
      const allocDoc = new PaymentAllocation({
        tenant_id: tenantId,
        payment_id: paymentDoc._id,
        invoice_id: alloc.invoice_id,
        allocated_amount: mongoose.Types.Decimal128.fromString(alloc.allocated_amount.toFixed(2)),
        allocation_type: 'WATERFALL',
        status: 'APPLIED'
      });
      await allocDoc.save({ session });
      crAllocations.push(allocDoc);
    }

    // 4. Update Billing Account balances
    const curBalBN = new BigNumber(billingAccount.current_balance ? billingAccount.current_balance.toString() : '0');
    const unappliedAccBN = new BigNumber(billingAccount.unapplied_cash ? billingAccount.unapplied_cash.toString() : '0');

    billingAccount.current_balance = mongoose.Types.Decimal128.fromString(
      BigNumber.max(0, curBalBN.minus(totalAllocatedBN)).toFixed(2)
    );
    billingAccount.unapplied_cash = mongoose.Types.Decimal128.fromString(
      unappliedAccBN.plus(unallocatedBN).toFixed(2)
    );
    await billingAccount.save({ session });

    let oEvent = null;
    if (!isLegacy) {
      const eventResult = await publishAndProcessDomainEvent({
        tenantId,
        eventType: 'billing.payment.received',
        eventVersion: '1.0.0',
        sourceModule: 'BILLING',
        sourceEntityType: 'Payment',
        sourceEntityId: paymentNumber,
        sourceTransactionId: paymentNumber,
        correlationId: `CORR-PMT-${paymentNumber}`,
        occurredAt: paymentDate,
        payload: {
          payment_id: String(paymentDoc._id),
          payment_number: paymentNumber,
          billing_account_id: String(billingAccountId),
          policy_id: openInvoices[0]?.policy_id ? String(openInvoices[0].policy_id) : (billingAccount.policies?.[0]?.policy_id ? String(billingAccount.policies[0].policy_id) : ''),
          invoice_id: targetInvoiceId ? String(targetInvoiceId) : (openInvoices[0] ? String(openInvoices[0]._id) : ''),
          amount: paymentAmountBN.toNumber(),
          payment_amount: paymentAmountBN.toNumber(),
          allocated_amount: totalAllocatedBN.toNumber(),
          unapplied_amount: unallocatedBN.toNumber(),
          payment_method: paymentMethod,
          reference_number: referenceNumber || '',
          is_fiduciary: Boolean(isFiduciary),
          currency: 'USD'
        },
        userId,
        session,
        dispatchImmediately: false
      });
      oEvent = eventResult.outboxEvent;
    }

    return {
      payment: paymentDoc,
      createdAllocations: crAllocations,
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
      payment.journal_id = dispatchResult.journal._id;
      await Payment.updateOne({ _id: payment._id }, { journal_id: dispatchResult.journal._id });
    }
    eventDriven = true;
  }

  return {
    payment,
    allocations: createdAllocations,
    journal: glResult ? glResult.journal : null,
    outboxEvent,
    eventDriven
  };
}

/**
 * Create Billing Adjustment (Fee Waiver, Credit Memo, Bad Debt Write-off)
 */
async function createAdjustment({
  tenantId,
  userId,
  billingAccountId,
  invoiceId = null,
  adjustmentType,
  amount,
  reasonCode,
  reasonDescription = '',
  useMigrationAdapter = false
}) {
  const isLegacy = await shouldUseLegacyAdapter({
    tenantId,
    eventCode: 'billing.adjustment.applied',
    useMigrationAdapter
  });

  const { adjustment, outboxEvent, legacyGlResult } = await withOptionalTransaction(async (session) => {
    const billingAccount = await BillingAccount.findOne({ _id: billingAccountId, tenant_id: tenantId }).session(session);
    if (!billingAccount) throw new Error('Billing account not found');

    const adjAmountBN = new BigNumber(amount.toString());
    if (adjAmountBN.isLessThanOrEqualTo(0)) throw new Error('Adjustment amount must be positive');

    // F-06: Strict validation against invoice open balance
    let invToAdjust = null;
    if (invoiceId) {
      invToAdjust = await Invoice.findOne({ _id: invoiceId, tenant_id: tenantId }).session(session);
      if (!invToAdjust) throw new Error('Invoice not found');
      const invCurBal = new BigNumber(invToAdjust.balance_due.toString());
      if (adjAmountBN.isGreaterThan(invCurBal)) {
        throw new Error(`Adjustment amount ($${adjAmountBN.toFixed(2)}) cannot exceed open invoice balance ($${invCurBal.toFixed(2)})`);
      }
    }

    const count = await BillingAdjustment.countDocuments({ tenant_id: tenantId }).session(session);
    const adjustmentNumber = `ADJ-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    let lGlResult = null;
    if (isLegacy) {
      const debitAccount = adjustmentType === 'FEE_WAIVER' ? '4100' : '5000';
      lGlResult = await legacyDirectPost({
        tenantId,
        userId,
        postingDate: new Date(),
        sourceModule: 'BILLING_ADJUSTMENT',
        referenceId: adjustmentNumber,
        memo: `Billing Adjustment ${adjustmentNumber} (${adjustmentType}): ${reasonDescription}`,
        lines: [
          {
            account_code: debitAccount,
            debit: adjAmountBN.toFixed(2),
            credit: '0.00',
            memo: `Dr ${adjustmentType} adjustment`
          },
          {
            account_code: '1100',
            debit: '0.00',
            credit: adjAmountBN.toFixed(2),
            memo: `Cr AR knocked off by ${adjustmentNumber}`
          }
        ]
      });
    }

    const adjDoc = new BillingAdjustment({
      tenant_id: tenantId,
      billing_account_id: billingAccountId,
      invoice_id: invoiceId || null,
      adjustment_number: adjustmentNumber,
      adjustment_type: adjustmentType,
      amount: mongoose.Types.Decimal128.fromString(adjAmountBN.toFixed(2)),
      reason_code: reasonCode,
      reason_description: reasonDescription,
      approved_by_user_id: userId,
      approved_at: new Date(),
      journal_id: lGlResult ? lGlResult.journal._id : null,
      status: 'APPLIED'
    });
    await adjDoc.save({ session });

    // If tied to an invoice, knock off invoice balance exactly
    if (invToAdjust) {
      const invCurBal = new BigNumber(invToAdjust.balance_due.toString());
      const newBalance = invCurBal.minus(adjAmountBN);
      invToAdjust.balance_due = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
      if (newBalance.isZero()) {
        invToAdjust.status = 'PAID';
      }
      await invToAdjust.save({ session });
    }

    // Update account current balance
    const curBal = new BigNumber(billingAccount.current_balance ? billingAccount.current_balance.toString() : '0');
    billingAccount.current_balance = mongoose.Types.Decimal128.fromString(BigNumber.max(0, curBal.minus(adjAmountBN)).toFixed(2));
    await billingAccount.save({ session });

    let oEvent = null;
    if (!isLegacy) {
      const eventResult = await publishAndProcessDomainEvent({
        tenantId,
        eventType: 'billing.adjustment.applied',
        eventVersion: '1.0.0',
        sourceModule: 'BILLING',
        sourceEntityType: 'BillingAdjustment',
        sourceEntityId: adjustmentNumber,
        sourceTransactionId: adjustmentNumber,
        correlationId: `CORR-ADJ-${adjustmentNumber}`,
        occurredAt: new Date(),
        payload: {
          adjustment_number: adjustmentNumber,
          billing_account_id: String(billingAccountId),
          invoice_id: invoiceId ? String(invoiceId) : null,
          adjustment_type: adjustmentType,
          amount: adjAmountBN.toNumber(),
          reason_code: reasonCode,
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
      adjustment: adjDoc,
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
      adjustment.journal_id = dispatchResult.journal._id;
      await BillingAdjustment.updateOne({ _id: adjustment._id }, { journal_id: dispatchResult.journal._id });
    }
    eventDriven = true;
  }

  return {
    adjustment,
    journal: glResult ? glResult.journal : null,
    outboxEvent,
    eventDriven
  };
}

module.exports = {
  seedDefaultBillingPlans,
  generateInstallmentSchedule,
  issueInvoice,
  processPaymentReceipt,
  createAdjustment
};
