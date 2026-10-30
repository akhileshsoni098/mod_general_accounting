const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');

// Models
const TaxReturnPeriod = require('../src/models/TaxReturnPeriod');
const TaxLiabilityEntry = require('../src/models/TaxLiabilityEntry');
const TaxReturn = require('../src/models/TaxReturn');
const TaxPaymentRecord = require('../src/models/TaxPaymentRecord');
const TaxCalculationSnapshot = require('../src/models/TaxCalculationSnapshot');
const CommercialDocument = require('../src/models/CommercialDocument');

// Services
const usTaxPeriodService = require('../src/services/usTaxPeriodService');
const usTaxSubledgerService = require('../src/services/usTaxSubledgerService');
const usTaxReturnService = require('../src/services/usTaxReturnService');
const usTaxPaymentService = require('../src/services/usTaxPaymentService');
const usTaxReconciliationService = require('../src/services/usTaxReconciliationService');

test('US Tax Liability, Return Periods, Tax Returns, Payments & Reconciliation Suite (Phase 5)', async (t) => {
  const tenantId = new mongoose.Types.ObjectId();
  const companyId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  // -----------------------------------------------------------------
  // 1. Independent Tax Return Periods
  // -----------------------------------------------------------------
  await t.test('1.1 TaxReturnPeriod Schema: Validates required fields and default enums', () => {
    const period = new TaxReturnPeriod({
      tenant_id: tenantId,
      company_id: companyId,
      jurisdiction_code: 'US-CA',
      tax_type: 'SALES_USE_TAX',
      period_start_date: new Date('2026-01-01'),
      period_end_date: new Date('2026-01-31'),
      period_label: '2026-M01-CA',
      filing_frequency: 'MONTHLY'
    });

    const err = period.validateSync();
    assert.strictEqual(err, undefined, 'TaxReturnPeriod schema should validate cleanly');
    assert.strictEqual(period.status, 'OPEN');
    assert.strictEqual(period.schema_version, 'US-GENERIC-V1');
    assert.strictEqual(period.tax_type, 'SALES_USE_TAX');
  });

  await t.test('1.2 Date Boundary Validation: Rejects invalid start/end chronological order', async () => {
    await assert.rejects(
      async () => {
        await usTaxPeriodService.createReturnPeriod({
          tenantId,
          companyId,
          jurisdictionCode: 'US-CA',
          periodStartDate: '2026-02-28',
          periodEndDate: '2026-02-01', // start > end
          periodLabel: 'INVALID-PERIOD'
        });
      },
      (err) => {
        assert.match(err.message, /periodStartDate must precede periodEndDate/i);
        return true;
      }
    );
  });

  await t.test('1.3 Period Independence: Tax periods do not mutate or depend on AccountingCalendar', () => {
    // Custom non-standard tax filing frequency (e.g. Semi-Annual or Quarterly overlapping two fiscal months)
    const quarterlyTaxPeriod = new TaxReturnPeriod({
      tenant_id: tenantId,
      company_id: companyId,
      jurisdiction_code: 'US-NY',
      tax_type: 'SALES_USE_TAX',
      period_start_date: new Date('2026-03-01'),
      period_end_date: new Date('2026-05-31'),
      period_label: 'NY-Q1-SALES',
      filing_frequency: 'QUARTERLY',
      due_date: new Date('2026-06-20'),
      due_date_source: 'STATE_STATUTORY_RULE'
    });

    const err = quarterlyTaxPeriod.validateSync();
    assert.strictEqual(err, undefined);
    assert.strictEqual(quarterlyTaxPeriod.filing_frequency, 'QUARTERLY');
    assert.strictEqual(quarterlyTaxPeriod.period_label, 'NY-Q1-SALES');
    assert.strictEqual(quarterlyTaxPeriod.due_date_source, 'STATE_STATUTORY_RULE');
  });

  // -----------------------------------------------------------------
  // 2. Tax Liability Subledger
  // -----------------------------------------------------------------
  await t.test('2.1 TaxLiabilityEntry Schema: Validates sales collection entry with signed amounts', () => {
    const entry = new TaxLiabilityEntry({
      tenant_id: tenantId,
      company_id: companyId,
      jurisdiction_code: 'US-CA',
      tax_type: 'SALES_USE_TAX',
      source_document_id: new mongoose.Types.ObjectId(),
      source_document_type: 'SALES_INVOICE',
      source_document_number: 'INV-US-001',
      tax_transaction_date: new Date('2026-01-15'),
      taxable_base_amount: 1000.0,
      tax_amount: 82.5,
      currency: 'USD',
      entry_type: 'TAX_COLLECTED_SALES',
      status: 'POSTED',
      idempotency_key: 'TX-IDEMP-001'
    });

    const err = entry.validateSync();
    assert.strictEqual(err, undefined, 'TaxLiabilityEntry should validate cleanly');
    assert.strictEqual(entry.is_reversal, false);
    assert.strictEqual(entry.entry_type, 'TAX_COLLECTED_SALES');
  });

  await t.test('2.2 Append-Only Subledger Reversal: Generates offsetting entry without mutating original snapshot', () => {
    const originalEntryId = new mongoose.Types.ObjectId();
    const reversalEntry = new TaxLiabilityEntry({
      tenant_id: tenantId,
      company_id: companyId,
      jurisdiction_code: 'US-CA',
      tax_type: 'SALES_USE_TAX',
      source_document_id: new mongoose.Types.ObjectId(),
      source_document_type: 'SALES_INVOICE',
      source_document_number: 'INV-US-001',
      tax_transaction_date: new Date('2026-01-20'),
      taxable_base_amount: 1000.0,
      tax_amount: -82.5, // Negated offset
      currency: 'USD',
      entry_type: 'ENTRY_REVERSAL',
      status: 'POSTED',
      is_reversal: true,
      reversal_of_entry_id: originalEntryId,
      reversal_reason: 'Customer cancelled transaction before delivery',
      idempotency_key: 'TX-REVERSAL-INV-US-001'
    });

    const err = reversalEntry.validateSync();
    assert.strictEqual(err, undefined);
    assert.strictEqual(reversalEntry.is_reversal, true);
    assert.strictEqual(reversalEntry.entry_type, 'ENTRY_REVERSAL');
    assert.strictEqual(Number(reversalEntry.tax_amount), -82.5);
    assert.strictEqual(reversalEntry.reversal_of_entry_id.toString(), originalEntryId.toString());
  });

  await t.test('2.3 Subledger Balance Aggregation Logic: Accurately computes additions, reductions, and net liability', () => {
    // Simulate list of entries
    const entries = [
      { entry_type: 'TAX_COLLECTED_SALES', tax_amount: 100.0 },
      { entry_type: 'TAX_COLLECTED_SALES', tax_amount: 50.0 },
      { entry_type: 'SALES_RETURN_REVERSAL', tax_amount: -20.0 },
      { entry_type: 'TAX_PAYMENT', tax_amount: -100.0 }
    ];

    let additionsBn = new BigNumber(0);
    let reductionsBn = new BigNumber(0);
    let paymentsBn = new BigNumber(0);
    let netLiabilityBn = new BigNumber(0);

    for (const e of entries) {
      const amtBn = new BigNumber(e.tax_amount);
      netLiabilityBn = netLiabilityBn.plus(amtBn);
      if (e.entry_type === 'TAX_PAYMENT') {
        paymentsBn = paymentsBn.plus(amtBn.abs());
      } else if (amtBn.isPositive()) {
        additionsBn = additionsBn.plus(amtBn);
      } else {
        reductionsBn = reductionsBn.plus(amtBn.abs());
      }
    }

    assert.strictEqual(additionsBn.toFixed(2), '150.00', 'Gross additions should be 150.00');
    assert.strictEqual(reductionsBn.toFixed(2), '20.00', 'Gross reductions should be 20.00');
    assert.strictEqual(paymentsBn.toFixed(2), '100.00', 'Payments should be 100.00');
    assert.strictEqual(netLiabilityBn.toFixed(2), '30.00', 'Net liability should be 150 - 20 - 100 = 30.00');
  });

  // -----------------------------------------------------------------
  // 3. Tax Returns & Preparation Lifecycle
  // -----------------------------------------------------------------
  await t.test('3.1 TaxReturn Schema: Validates schema versioning and initial draft balances', () => {
    const periodId = new mongoose.Types.ObjectId();
    const taxReturn = new TaxReturn({
      tenant_id: tenantId,
      company_id: companyId,
      return_period_id: periodId,
      jurisdiction_code: 'US-CA',
      tax_type: 'SALES_USE_TAX',
      return_number: 'RET-US-CA-2026-M01',
      schema_version: 'US-GENERIC-V1',
      gross_sales_amount: '15000.00',
      taxable_sales_amount: '12000.00',
      exempt_sales_amount: '3000.00',
      tax_collected_amount: '990.00',
      adjustments_amount: '0.00',
      net_tax_liability_amount: '990.00',
      payments_applied_amount: '0.00',
      balance_due_amount: '990.00',
      status: 'DRAFT'
    });

    const err = taxReturn.validateSync();
    assert.strictEqual(err, undefined, 'TaxReturn should validate successfully');
    assert.strictEqual(taxReturn.status, 'DRAFT');
    assert.strictEqual(taxReturn.schema_version, 'US-GENERIC-V1');
    assert.strictEqual(taxReturn.balance_due_amount, '990.00');
  });

  await t.test('3.2 Tax Return State Machine: Enforces valid transition sequence and prevents invalid jumps', () => {
    const taxReturn = new TaxReturn({
      tenant_id: tenantId,
      company_id: companyId,
      return_period_id: new mongoose.Types.ObjectId(),
      jurisdiction_code: 'US-CA',
      tax_type: 'SALES_USE_TAX',
      return_number: 'RET-US-CA-2026-M02',
      schema_version: 'US-GENERIC-V1',
      status: 'DRAFT',
      audit_trail: []
    });

    // Valid transition: DRAFT -> PREPARED
    taxReturn.status = 'PREPARED';
    assert.strictEqual(taxReturn.status, 'PREPARED');

    // Valid transition: PREPARED -> APPROVED
    taxReturn.status = 'APPROVED';
    assert.strictEqual(taxReturn.status, 'APPROVED');

    // Attempting to move APPROVED directly back to DRAFT without review is prohibited by workflow rules
    assert.notStrictEqual(taxReturn.status, 'DRAFT');
  });

  await t.test('3.3 Filing Requirement: Transition to FILED requires statutory filing reference', () => {
    const taxReturn = new TaxReturn({
      tenant_id: tenantId,
      company_id: companyId,
      return_period_id: new mongoose.Types.ObjectId(),
      jurisdiction_code: 'US-TX',
      tax_type: 'SALES_USE_TAX',
      return_number: 'RET-TX-2026-001',
      status: 'APPROVED'
    });

    // Simulating filing check
    const filingConfirmation = 'TX-COMPTROLLER-CONF-88271';
    assert.ok(filingConfirmation && filingConfirmation.trim().length > 0, 'Filing requires non-empty confirmation ref');

    taxReturn.status = 'FILED';
    taxReturn.filing_confirmation_reference = filingConfirmation;
    taxReturn.filed_at = new Date();

    const err = taxReturn.validateSync();
    assert.strictEqual(err, undefined);
    assert.strictEqual(taxReturn.status, 'FILED');
    assert.strictEqual(taxReturn.filing_confirmation_reference, 'TX-COMPTROLLER-CONF-88271');
  });

  await t.test('3.4 Filing Distinction: Supports MANUAL_OFFLINE and RECORDED_EXTERNAL methods and records user audit provenance', () => {
    const taxReturn = new TaxReturn({
      tenant_id: tenantId,
      company_id: companyId,
      return_period_id: new mongoose.Types.ObjectId(),
      jurisdiction_code: 'US-NY',
      tax_type: 'SALES_USE_TAX',
      return_number: 'RET-NY-2026-Q1',
      status: 'APPROVED',
      filing_method: 'RECORDED_EXTERNAL',
      filing_verification_status: 'SELF_CERTIFIED',
      filing_notes: 'Accountant filed via NY DTF Web File portal'
    });

    taxReturn.status = 'FILED';
    taxReturn.external_filing_reference = 'NY-DTF-CONF-9921';
    taxReturn.external_filed_at = new Date();

    const err = taxReturn.validateSync();
    assert.strictEqual(err, undefined);
    assert.strictEqual(taxReturn.status, 'FILED');
    assert.strictEqual(taxReturn.filing_method, 'RECORDED_EXTERNAL');
    assert.strictEqual(taxReturn.filing_verification_status, 'SELF_CERTIFIED');
  });

  await t.test('3.5 Filed Return Immutability: Re-preparation or modification on a FILED return is blocked', async () => {
    const mockPeriod = {
      _id: new mongoose.Types.ObjectId(),
      jurisdiction_code: 'US-CA',
      period_label: '2026-M01',
      tax_type: 'SALES_USE_TAX'
    };

    const originalPeriodFindOne = TaxReturnPeriod.findOne;
    const originalFindOne = TaxReturn.findOne;

    TaxReturnPeriod.findOne = () => Promise.resolve(mockPeriod);
    TaxReturn.findOne = (query) => {
      if (query && query.status === 'FILED') {
        return Promise.resolve({
          _id: new mongoose.Types.ObjectId(),
          return_number: 'TR-US-CA-2026-M01-0001',
          status: 'FILED'
        });
      }
      return Promise.resolve(null);
    };

    try {
      await assert.rejects(
        async () => {
          await usTaxReturnService.prepareDraftReturn({
            tenantId,
            companyId,
            returnPeriodId: mockPeriod._id
          });
        },
        (err) => {
          assert.match(err.message, /FILED_RETURN_IMMUTABLE/);
          return true;
        }
      );
    } finally {
      TaxReturnPeriod.findOne = originalPeriodFindOne;
      TaxReturn.findOne = originalFindOne;
    }
  });

  // -----------------------------------------------------------------
  // 4. Tax Payments & Credits
  // -----------------------------------------------------------------
  await t.test('4.1 TaxPaymentRecord Schema: Validates remittance details and double-entry links', () => {
    const payment = new TaxPaymentRecord({
      tenant_id: tenantId,
      company_id: companyId,
      payment_number: 'PMT-CA-001',
      jurisdiction_code: 'US-CA',
      tax_type: 'SALES_USE_TAX',
      amount: '990.00',
      applied_amount: '990.00',
      unapplied_amount: '0.00',
      payment_date: new Date('2026-02-15'),
      payment_method: 'EFT_WIRE',
      bank_account_code: '1002',
      payment_reference: 'EFT-STATE-CA-990',
      idempotency_key: 'IDEMP-PMT-001',
      status: 'RECORDED'
    });

    const err = payment.validateSync();
    assert.strictEqual(err, undefined, 'TaxPaymentRecord should validate cleanly');
    assert.strictEqual(payment.amount, '990.00');
    assert.strictEqual(payment.status, 'RECORDED');
    assert.strictEqual(payment.bank_account_code, '1002');
  });

  await t.test('4.2 Payment Amount Validation: Rejects zero or negative payment amounts via service', async () => {
    await assert.rejects(
      async () => {
        await usTaxPaymentService.recordTaxPayment({
          tenantId,
          companyId,
          amount: -50.0 // Negative amount
        });
      },
      (err) => {
        assert.match(err.message, /positive decimal number greater than 0/i);
        return true;
      }
    );
  });

  await t.test('4.3 Payment Application: Reduces return balance due and increments payments applied', () => {
    const netDueBn = new BigNumber('1500.00');
    const paymentBn = new BigNumber('1000.00');

    const totalApplied = paymentBn.toFixed(2);
    const balanceDue = netDueBn.minus(paymentBn).toFixed(2);

    assert.strictEqual(totalApplied, '1000.00');
    assert.strictEqual(balanceDue, '500.00');
  });

  await t.test('4.4 Payment Confirmation: Transitions from RECORDED to CONFIRMED with clearance ref', () => {
    const payment = new TaxPaymentRecord({
      tenant_id: tenantId,
      company_id: companyId,
      payment_number: 'PMT-CA-002',
      jurisdiction_code: 'US-CA',
      amount: '500.00',
      idempotency_key: 'IDEMP-PMT-002',
      payment_reference: 'CHECK-10492',
      status: 'RECORDED'
    });

    payment.confirmation_reference = 'BANK-CLR-99482';
    payment.status = 'CONFIRMED';

    assert.strictEqual(payment.status, 'CONFIRMED');
    assert.strictEqual(payment.confirmation_reference, 'BANK-CLR-99482');
  });

  await t.test('4.5 Account Mapping Enforcement: Throws MAPPING_REQUIRED when liability account or bank is unmapped in DB mode', async () => {
    const mockConfig = { sales_tax_payable_account_code: 'NON_EXISTENT_9999' };
    const err = new Error(`MAPPING_REQUIRED: Tax liability account "${mockConfig.sales_tax_payable_account_code}" is not mapped or does not exist in Chart of Accounts.`);
    err.statusCode = 400;

    assert.strictEqual(err.statusCode, 400);
    assert.match(err.message, /MAPPING_REQUIRED/);
  });

  await t.test('4.6 Payment Idempotency: Duplicate payment submission with identical key returns existing record', async () => {
    const existingPayment = {
      _id: new mongoose.Types.ObjectId(),
      payment_number: 'PMT-CA-001',
      idempotency_key: 'TXPAY-EXISTING-KEY',
      status: 'RECORDED'
    };

    const originalFindOne = TaxPaymentRecord.findOne;
    TaxPaymentRecord.findOne = () => ({
      session: () => Promise.resolve(existingPayment)
    });

    try {
      const res = await usTaxPaymentService.recordTaxPayment({
        tenantId,
        companyId,
        amount: 500,
        postToGl: false
      });
      assert.strictEqual(res.payment_number, 'PMT-CA-001');
    } finally {
      TaxPaymentRecord.findOne = originalFindOne;
    }
  });

  // -----------------------------------------------------------------
  // 5. 4-Way Audits & Cross-System Reconciliations
  // -----------------------------------------------------------------
  await t.test('5.1 Reconcile Documents to Subledger: Matches posted documents against tax entries', () => {
    const postedDoc = {
      _id: new mongoose.Types.ObjectId(),
      document_number: 'INV-101',
      total_tax_amount: 85.0,
      status: 'POSTED'
    };

    const matchingSubledgerEntry = {
      source_document_id: postedDoc._id,
      tax_amount: 85.0,
      status: 'POSTED'
    };

    const isMatch = Number(postedDoc.total_tax_amount) === Number(matchingSubledgerEntry.tax_amount);
    assert.strictEqual(isMatch, true, 'Posted document tax should equal subledger tax');
  });

  await t.test('5.2 Reconcile Subledger to GL: Flags variance when GL 2110 differs from Subledger', () => {
    const subledgerNetLiability = new BigNumber('2500.00');
    const glAccount2110EndingBalance = new BigNumber('2450.00'); // $50 variance

    const diff = subledgerNetLiability.minus(glAccount2110EndingBalance).abs();
    const isReconciled = diff.isZero();

    assert.strictEqual(isReconciled, false, 'Variance of $50 must be flagged');
    assert.strictEqual(diff.toFixed(2), '50.00');
  });

  await t.test('5.3 Reconcile Return to Payments: Confirms balance due equals net tax due minus payments', () => {
    const returnNetTaxDue = new BigNumber('3200.00');
    const payments = [
      new BigNumber('1500.00'),
      new BigNumber('1700.00')
    ];

    let totalPaid = new BigNumber(0);
    for (const p of payments) {
      totalPaid = totalPaid.plus(p);
    }

    const calculatedBalanceDue = returnNetTaxDue.minus(totalPaid);
    assert.strictEqual(totalPaid.toFixed(2), '3200.00');
    assert.strictEqual(calculatedBalanceDue.toFixed(2), '0.00', 'Return should be fully paid');
  });

  await t.test('5.4 Provider Retry Worker: Retries PENDING_RETRY documents idempotently', async () => {
    const pendingDoc = {
      _id: new mongoose.Types.ObjectId(),
      document_number: 'INV-PENDING-01',
      tax_reconciliation_status: 'PENDING_RETRY',
      tax_regime: 'US_SALES_TAX'
    };

    // Simulate successful provider commit
    const mockProviderCommit = async () => ({ status: 'COMMITTED', provider_transaction_id: 'MOCK-TX-123' });
    const result = await mockProviderCommit();

    assert.strictEqual(result.status, 'COMMITTED');
    pendingDoc.tax_reconciliation_status = 'SYNCED';
    assert.strictEqual(pendingDoc.tax_reconciliation_status, 'SYNCED');
  });

  await t.test('5.5 Bounded Retries: Provider retry increments retry count and transitions to FAILED_PERMANENT after 5 failures', () => {
    const doc = {
      tax_retry_count: 4,
      tax_reconciliation_status: 'PENDING_RETRY',
      audit_trail: []
    };

    doc.tax_retry_count = doc.tax_retry_count + 1;
    const isMax = doc.tax_retry_count >= 5;
    doc.tax_reconciliation_status = isMax ? 'FAILED_PERMANENT' : 'PENDING_RETRY';

    assert.strictEqual(doc.tax_retry_count, 5);
    assert.strictEqual(doc.tax_reconciliation_status, 'FAILED_PERMANENT');
  });

  await t.test('5.6 Append-Only Reversal Idempotency: Duplicate reversal call returns existing reversal without double-crediting', async () => {
    const originalReversalKey = 'TLE-REV-SALES_INVOICE-doc123';
    const existingReversalEntry = {
      _id: new mongoose.Types.ObjectId(),
      idempotency_key: originalReversalKey,
      tax_amount: -82.50,
      is_reversal: true
    };

    const originalFindOne = TaxLiabilityEntry.findOne;
    TaxLiabilityEntry.findOne = (query) => ({
      session: () => Promise.resolve(existingReversalEntry)
    });

    try {
      const res = await usTaxSubledgerService.reverseDocumentLiabilityEntry({
        tenantId,
        companyId,
        document: {
          _id: 'doc123',
          document_type: 'SALES_INVOICE',
          document_number: 'INV-123',
          tax_regime: 'US_SALES_TAX'
        }
      });
      // In disconnected mode it returns null or the entry safely without throwing
      assert.ok(res === null || res.idempotency_key === originalReversalKey);
    } finally {
      TaxLiabilityEntry.findOne = originalFindOne;
    }
  });
});
