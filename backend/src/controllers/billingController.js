const BigNumber = require('bignumber.js');
const mongoose = require('mongoose');
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
const {
  seedDefaultBillingPlans,
  generateInstallmentSchedule,
  issueInvoice,
  processPaymentReceipt,
  createAdjustment
} = require('../services/billingService');
const { authorizeMigrationAdapter } = require('../utils/migrationAdapterAuth');

// Get AR Summary Overview
async function getBillingOverview(req, res) {
  try {
    const tenantId = req.tenantId;

    // Ensure billing plans are seeded
    await seedDefaultBillingPlans(tenantId);

    const invoices = await Invoice.find({ tenant_id: tenantId });
    const payments = await Payment.find({ tenant_id: tenantId });
    const accounts = await BillingAccount.find({ tenant_id: tenantId });

    let totalBilled = new BigNumber(0);
    let totalOutstanding = new BigNumber(0);
    let totalPaid = new BigNumber(0);
    let totalUnapplied = new BigNumber(0);

    for (const inv of invoices) {
      if (inv.status !== 'VOID') {
        totalBilled = totalBilled.plus(new BigNumber(inv.total_amount.toString()));
        totalOutstanding = totalOutstanding.plus(new BigNumber(inv.balance_due.toString()));
        totalPaid = totalPaid.plus(new BigNumber(inv.amount_paid.toString()));
      }
    }

    for (const acc of accounts) {
      if (acc.unapplied_cash) {
        totalUnapplied = totalUnapplied.plus(new BigNumber(acc.unapplied_cash.toString()));
      }
    }

    return res.success({
      totalBilled: totalBilled.toFixed(2),
      totalOutstanding: totalOutstanding.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalUnapplied: totalUnapplied.toFixed(2),
      activeAccountsCount: accounts.length,
      invoicesCount: invoices.length,
      paymentsCount: payments.length
    });
  } catch (err) {
    return res.error('Failed to load AR overview', 500, err.message);
  }
}

// List Billing Accounts
async function getBillingAccounts(req, res) {
  try {
    const tenantId = req.tenantId;
    const accounts = await BillingAccount.find({ tenant_id: tenantId })
      .populate('default_billing_plan_id')
      .sort({ createdAt: -1 });

    return res.success(accounts);
  } catch (err) {
    return res.error('Failed to list billing accounts', 500, err.message);
  }
}

// Create Billing Account
async function createBillingAccount(req, res) {
  try {
    const tenantId = req.tenantId;
    const { account_number, customer_name, customer_email, billing_address, default_billing_plan_id } = req.body;

    if (!account_number || !customer_name) {
      return res.error('account_number and customer_name are required', 400);
    }

    const exists = await BillingAccount.findOne({ tenant_id: tenantId, account_number: account_number.trim().toUpperCase() });
    if (exists) {
      return res.error(`Billing account number "${account_number}" already exists`, 409);
    }

    const account = await BillingAccount.create({
      tenant_id: tenantId,
      account_number: account_number.trim().toUpperCase(),
      customer_name: customer_name.trim(),
      customer_email: customer_email || '',
      billing_address: billing_address || {},
      default_billing_plan_id: default_billing_plan_id || null
    });

    return res.success(account, { message: 'Billing account created' }, 201);
  } catch (err) {
    return res.error('Failed to create billing account', 500, err.message);
  }
}

// Get Billing Account Detail with linked policies and schedules
async function getBillingAccountDetail(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const account = await BillingAccount.findOne({ _id: id, tenant_id: tenantId }).populate('default_billing_plan_id');
    if (!account) return res.error('Billing account not found', 404);

    const policies = await BillingAccountPolicy.find({ billing_account_id: account._id, tenant_id: tenantId });
    const invoices = await Invoice.find({ billing_account_id: account._id, tenant_id: tenantId }).sort({ due_date: 1 });
    const payments = await Payment.find({ billing_account_id: account._id, tenant_id: tenantId }).sort({ payment_date: -1 });
    const schedules = await InstallmentSchedule.find({ billing_account_id: account._id, tenant_id: tenantId }).sort({ due_date: 1 });

    return res.success({
      account,
      policies,
      invoices,
      payments,
      schedules
    });
  } catch (err) {
    return res.error('Failed to get billing account detail', 500, err.message);
  }
}

// List Billing Plans
async function getBillingPlans(req, res) {
  try {
    const tenantId = req.tenantId;
    let plans = await BillingPlan.find({ tenant_id: tenantId }).sort({ installment_count: 1 });
    if (plans.length === 0) {
      plans = await seedDefaultBillingPlans(tenantId);
    }
    return res.success(plans);
  } catch (err) {
    return res.error('Failed to list billing plans', 500, err.message);
  }
}

// Create Custom Billing Plan
async function createBillingPlan(req, res) {
  try {
    const tenantId = req.tenantId;
    const { plan_code, plan_name, description, installment_count, down_payment_pct, installment_fee, interval_months } = req.body;

    if (!plan_code || !plan_name || !installment_count) {
      return res.error('plan_code, plan_name, and installment_count are required', 400);
    }

    const exists = await BillingPlan.findOne({ tenant_id: tenantId, plan_code: plan_code.trim().toUpperCase() });
    if (exists) {
      return res.error(`Billing plan code "${plan_code}" already exists`, 409);
    }

    const plan = await BillingPlan.create({
      tenant_id: tenantId,
      plan_code: plan_code.trim().toUpperCase(),
      plan_name: plan_name.trim(),
      description: description || '',
      installment_count: Number(installment_count),
      down_payment_pct: mongoose.Types.Decimal128.fromString(down_payment_pct ? String(down_payment_pct) : '100.00'),
      installment_fee: mongoose.Types.Decimal128.fromString(installment_fee ? String(installment_fee) : '0.00'),
      interval_months: Number(interval_months || 1)
    });

    return res.success(plan, { message: 'Billing plan created' }, 201);
  } catch (err) {
    return res.error('Failed to create billing plan', 500, err.message);
  }
}

// Link Policy & Generate Installment Schedule
async function linkPolicyAndGenerateSchedule(req, res) {
  try {
    const tenantId = req.tenantId;
    const billing_account_id = req.body.billing_account_id;
    const policy_id = req.body.policy_id || req.body.contract_id || req.body.order_id || req.body.reference_id;
    const policy_number = req.body.policy_number || req.body.contract_number || req.body.order_number || req.body.reference_number || policy_id;
    const carrier_name = req.body.carrier_name || req.body.vendor_name || 'Enterprise Commercial Solutions';
    const line_of_business = req.body.line_of_business || req.body.business_segment || 'COMMERCIAL_SALES';
    const effective_date = req.body.effective_date;
    const expiration_date = req.body.expiration_date;
    const total_premium = req.body.total_premium || req.body.total_amount || req.body.total_value;
    const policy_fee = req.body.policy_fee || req.body.service_fee || req.body.fee_amount;
    const tax_amount = req.body.tax_amount;
    const billing_plan_code = req.body.billing_plan_code;

    if (!billing_account_id || !policy_id || !policy_number || !total_premium || !effective_date) {
      return res.error('billing_account_id, policy_id, policy_number, total_premium, and effective_date are required', 400);
    }

    // Upsert Policy Link
    let policyLink = await BillingAccountPolicy.findOne({
      tenant_id: tenantId,
      billing_account_id,
      policy_id
    });

    if (!policyLink) {
      policyLink = await BillingAccountPolicy.create({
        tenant_id: tenantId,
        billing_account_id,
        policy_id,
        policy_number: policy_number.trim().toUpperCase(),
        carrier_name: carrier_name || 'Summit Mutual Insurance',
        line_of_business: line_of_business || 'COMMERCIAL_AUTO',
        effective_date: new Date(effective_date),
        expiration_date: new Date(expiration_date || new Date(effective_date).setFullYear(new Date(effective_date).getFullYear() + 1)),
        total_premium: mongoose.Types.Decimal128.fromString(String(total_premium)),
        total_fees: mongoose.Types.Decimal128.fromString(policy_fee ? String(policy_fee) : '0.00'),
        total_taxes: mongoose.Types.Decimal128.fromString(tax_amount ? String(tax_amount) : '0.00'),
        status: 'BOUND'
      });
    }

    // Generate Installment Schedule
    const schedules = await generateInstallmentSchedule({
      tenantId,
      billingAccountId: billing_account_id,
      policyId: policy_id,
      policyNumber: policy_number,
      effectiveDate: effective_date,
      totalPremium: total_premium,
      policyFee: policy_fee || '0.00',
      taxAmount: tax_amount || '0.00',
      billingPlanCode: billing_plan_code || '4_PAY_25_DOWN'
    });

    return res.success({ policyLink, schedules }, { message: `Generated ${schedules.length} installment schedules` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// List Invoices
async function getInvoices(req, res) {
  try {
    const tenantId = req.tenantId;
    const { status, policy_id, billing_account_id } = req.query;

    const filter = { tenant_id: tenantId };
    if (status) filter.status = status.toUpperCase();
    if (policy_id) filter.policy_id = policy_id;
    if (billing_account_id) filter.billing_account_id = billing_account_id;

    const invoices = await Invoice.find(filter)
      .populate('billing_account_id', 'account_number customer_name')
      .populate('journal_id', 'journal_number posting_date')
      .sort({ createdAt: -1 });

    return res.success(invoices);
  } catch (err) {
    return res.error('Failed to list invoices', 500, err.message);
  }
}

// Get Invoice Detail with Lines
async function getInvoiceDetail(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const invoice = await Invoice.findOne({ _id: id, tenant_id: tenantId })
      .populate('billing_account_id')
      .populate('journal_id');

    if (!invoice) return res.error('Invoice not found', 404);

    const lines = await InvoiceLine.find({ invoice_id: invoice._id, tenant_id: tenantId }).sort({ line_number: 1 });
    const allocations = await PaymentAllocation.find({ invoice_id: invoice._id, tenant_id: tenantId })
      .populate('payment_id', 'payment_number payment_date payment_method');

    return res.success({ invoice, lines, allocations });
  } catch (err) {
    return res.error('Failed to get invoice detail', 500, err.message);
  }
}

// Issue Invoice
async function postIssueInvoice(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const {
      billing_account_id,
      installment_number,
      invoice_date,
      lines,
      carrier_id,
      carrier_name,
      broker_id,
      broker_name,
      dimensions
    } = req.body;
    const policy_id = req.body.policy_id || req.body.contract_id || req.body.order_id || req.body.reference_id || 'CTR-2026-0001';
    let useMigrationAdapter = false;
    if (req.body.use_migration_adapter === true || req.headers['x-use-migration-adapter'] === 'true') {
      const authCheck = await authorizeMigrationAdapter(req);
      if (!authCheck.authorized) {
        return res.error(authCheck.reason, 403);
      }
      useMigrationAdapter = true;
    }

    if (!billing_account_id || !policy_id || !lines || lines.length === 0) {
      return res.error('billing_account_id, policy_id, and at least one line item are required', 400);
    }

    const result = await issueInvoice({
      tenantId,
      userId,
      billingAccountId: billing_account_id,
      policyId: policy_id,
      installmentNumber: Number(installment_number || 1),
      invoiceDate: invoice_date ? new Date(invoice_date) : new Date(),
      lines,
      carrierId: carrier_id || null,
      carrierName: carrier_name || null,
      brokerId: broker_id || null,
      brokerName: broker_name || null,
      dimensions: dimensions || {},
      useMigrationAdapter
    });

    const jNum = result.journal ? result.journal.journal_number : 'PENDING';
    return res.success(result, { message: `Invoice ${result.invoice.invoice_number} issued successfully with GL Journal ${jNum}` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Record & Allocate Payment Receipt
async function postPaymentReceipt(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { billing_account_id, amount, payment_method, reference_number, payment_date, target_invoice_id, is_fiduciary } = req.body;
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

    const result = await processPaymentReceipt({
      tenantId,
      userId,
      billingAccountId: billing_account_id,
      amount,
      paymentMethod: payment_method || 'ACH',
      referenceNumber: reference_number || '',
      paymentDate: payment_date ? new Date(payment_date) : new Date(),
      targetInvoiceId: target_invoice_id || null,
      isFiduciary: typeof is_fiduciary === 'boolean' ? is_fiduciary : true,
      useMigrationAdapter
    });

    const jNum = result.journal ? result.journal.journal_number : 'PENDING';
    return res.success(result, { message: `Payment ${result.payment.payment_number} captured and allocated with GL Journal ${jNum}` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// List Payments
async function getPayments(req, res) {
  try {
    const tenantId = req.tenantId;
    const payments = await Payment.find({ tenant_id: tenantId })
      .populate('billing_account_id', 'account_number customer_name')
      .populate('journal_id', 'journal_number')
      .sort({ createdAt: -1 });

    return res.success(payments);
  } catch (err) {
    return res.error('Failed to list payments', 500, err.message);
  }
}

// Post Billing Adjustment
async function postAdjustment(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { billing_account_id, invoice_id, adjustment_type, amount, reason_code, reason_description } = req.body;
    let useMigrationAdapter = false;
    if (req.body.use_migration_adapter === true || req.headers['x-use-migration-adapter'] === 'true') {
      const authCheck = await authorizeMigrationAdapter(req);
      if (!authCheck.authorized) {
        return res.error(authCheck.reason, 403);
      }
      useMigrationAdapter = true;
    }

    if (!billing_account_id || !adjustment_type || !amount || !reason_code) {
      return res.error('billing_account_id, adjustment_type, amount, and reason_code are required', 400);
    }

    const result = await createAdjustment({
      tenantId,
      userId,
      billingAccountId: billing_account_id,
      invoiceId: invoice_id || null,
      adjustmentType: adjustment_type,
      amount,
      reasonCode: reason_code,
      reasonDescription: reason_description || '',
      useMigrationAdapter
    });

    const jNum = result.journal ? result.journal.journal_number : 'PENDING';
    return res.success(result, { message: `Adjustment ${result.adjustment.adjustment_number} applied with GL Journal ${jNum}` }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// List Adjustments
async function getAdjustments(req, res) {
  try {
    const tenantId = req.tenantId;
    const adjustments = await BillingAdjustment.find({ tenant_id: tenantId })
      .populate('billing_account_id', 'account_number customer_name')
      .populate('invoice_id', 'invoice_number')
      .sort({ createdAt: -1 });

    return res.success(adjustments);
  } catch (err) {
    return res.error('Failed to list adjustments', 500, err.message);
  }
}

// List Installment Schedules
async function getInstallmentSchedules(req, res) {
  try {
    const tenantId = req.tenantId;
    const { policy_id, billing_account_id, status } = req.query;

    const filter = { tenant_id: tenantId };
    if (policy_id) filter.policy_id = policy_id;
    if (billing_account_id) filter.billing_account_id = billing_account_id;
    if (status) filter.status = status.toUpperCase();

    const schedules = await InstallmentSchedule.find(filter)
      .populate('billing_account_id', 'account_number customer_name')
      .populate('invoice_id', 'invoice_number status balance_due')
      .sort({ policy_number: 1, installment_number: 1, due_date: 1 });

    return res.success(schedules);
  } catch (err) {
    return res.error('Failed to list installment schedules', 500, err.message);
  }
}

module.exports = {
  getBillingOverview,
  getBillingAccounts,
  createBillingAccount,
  getBillingAccountDetail,
  getBillingPlans,
  createBillingPlan,
  linkPolicyAndGenerateSchedule,
  getInstallmentSchedules,
  getInvoices,
  getInvoiceDetail,
  postIssueInvoice,
  postPaymentReceipt,
  getPayments,
  postAdjustment,
  getAdjustments
};
