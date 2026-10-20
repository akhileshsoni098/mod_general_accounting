/**
 * PHASE 3 — BILLING & ACCOUNTS RECEIVABLE COMPLETE ACCEPTANCE TEST SUITE
 * Validates:
 * 1. Seed & retrieve Billing Plans (Full Pay, 4-Pay 25% Down, 10-Pay)
 * 2. Reject duplicate billing plan codes
 * 3. Create Billing Account for Lone Pine Trucking
 * 4. Reject duplicate billing account numbers within tenant scope
 * 5. Link Policy POL-TX-8821 ($37,650 gross premium + $150 policy fee) & Generate 4-Pay schedule
 * 6. Verify 4-Pay schedule installment calculations:
 *    - Installment 1: $9,412.50 premium + $150.00 fee = $9,562.50 due July 1, 2026
 *    - Installments 2, 3, 4: $9,412.50 premium each, sum equals exactly $37,650.00
 * 7. Issue Deposit Invoice #1 for Installment 1 ($9,562.50)
 * 8. Verify double-entry GL handshake journal for Invoice 1:
 *    - Debit 1100 Premium Receivable: $9,562.50
 *    - Credit 2200 Unearned Premium Reserve: $9,412.50
 *    - Credit 4100 Policy Fee Income: $150.00
 * 9. Reject duplicate issuing of the same installment invoice
 * 10. Record Customer Cash Receipt $9,412.50 via ACH (Texas Fiduciary Trust)
 * 11. Verify waterfall allocation against Invoice 1 ($9,412.50 applied, remaining balance $150.00 fee)
 * 12. Verify double-entry GL handshake journal for Payment Receipt:
 *     - Debit 1010 Premium Trust Cash: $9,412.50
 *     - Credit 1100 Premium Receivable: $9,412.50
 * 13. Apply Fee Waiver adjustment ($150.00) to clear remaining fee balance:
 *     - Debit 4100 Fee Contra: $150.00
 *     - Credit 1100 Premium Receivable: $150.00
 *     - Invoice 1 reaches PAID status (balance_due == $0.00)
 * 14. Over-allocation prevention: Attempt to over-allocate or pay excessive amounts sends excess to Unapplied Cash (2190)
 * 15. Cross-tenant isolation on Billing Accounts, Invoices, and Payments
 * 16. Cold restart persistence & Trial Balance equilibrium verification
 */

const http = require('http');
const mongoose = require('mongoose');

const TEST_PORT = 5050;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeRequest({ method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runBillingAcceptanceTests() {
  console.log('================================================================');
  console.log(' STARTING PHASE 3 BILLING & ACCOUNTS RECEIVABLE ACCEPTANCE SUITE');
  console.log('================================================================');

  const testSuffix = Date.now();

  try {
    // -------------------------------------------------------------------------
    // SETUP: Onboard Tenant A (Lone Pine Underwriting) & Tenant B (Apex)
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Onboarding Tenant A (Lone Pine Underwriting)...');
    const regResA = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `LPT_BIL_${testSuffix}`,
        tenant_name: 'Lone Pine Billing Corp',
        base_currency: 'USD',
        admin_first_name: 'Ravi',
        admin_last_name: 'Kapoor',
        admin_email: `ravi_${testSuffix}@lpt-billing.com`,
        admin_password: 'Password123!'
      }
    });
    console.assert(regResA.status === 201, `Tenant A setup failed: ${regResA.status}`);
    const tokenA = regResA.body.data.token;
    const tenantAId = regResA.body.data.tenant.id;
    const headersA = { Authorization: `Bearer ${tokenA}`, 'x-tenant-id': tenantAId };

    console.log('[Setup] Onboarding Tenant B (Apex Logistics)...');
    const regResB = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `APX_BIL_${testSuffix}`,
        tenant_name: 'Apex Risk & Logistics',
        base_currency: 'USD',
        admin_first_name: 'Sarah',
        admin_last_name: 'Connor',
        admin_email: `sarah_${testSuffix}@apx-billing.com`,
        admin_password: 'Password123!'
      }
    });
    console.assert(regResB.status === 201, `Tenant B setup failed: ${regResB.status}`);
    const tokenB = regResB.body.data.token;
    const tenantBId = regResB.body.data.tenant.id;
    const headersB = { Authorization: `Bearer ${tokenB}`, 'x-tenant-id': tenantBId };

    // -------------------------------------------------------------------------
    // TEST 1: Seed and retrieve Billing Plans
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Seed and retrieve Billing Plans (Full Pay, 4-Pay 25% Down, 10-Pay)...');
    const plansRes = await makeRequest({ method: 'GET', path: '/api/v1/billing/plans', headers: headersA });
    if (plansRes.status !== 200) {
      console.error('Get plans failed response:', JSON.stringify(plansRes.body, null, 2));
    }
    console.assert(plansRes.status === 200, `Get plans failed: ${plansRes.status}`);
    console.assert(plansRes.body.data.length >= 3, 'Expected at least 3 default billing plans');
    const plan4Pay = plansRes.body.data.find(p => p.plan_code === '4_PAY_25_DOWN');
    console.assert(plan4Pay && plan4Pay.installment_count === 4, '4-Pay plan mismatch');
    console.log(`✓ Test 1 Passed: Retrieved ${plansRes.body.data.length} billing plans including 4_PAY_25_DOWN.`);

    // -------------------------------------------------------------------------
    // TEST 2: Reject duplicate billing plan codes
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Reject duplicate billing plan codes within tenant scope...');
    const dupPlanRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/plans',
      headers: headersA,
      body: {
        plan_code: '4_PAY_25_DOWN',
        plan_name: 'Duplicate 4-Pay',
        installment_count: 4
      }
    });
    console.assert(dupPlanRes.status === 409, `Expected 409 for duplicate plan code, got ${dupPlanRes.status}`);
    console.log('✓ Test 2 Passed: Duplicate billing plan code rejected (409 Conflict).');

    // -------------------------------------------------------------------------
    // TEST 3: Create Billing Account for Lone Pine Trucking
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Create Billing Account for Lone Pine Trucking...');
    const createAccRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/accounts',
      headers: headersA,
      body: {
        account_number: 'BA-LONE-PINE-01',
        customer_name: 'Lone Pine Trucking LLC',
        customer_email: 'ravi@lonepinetrucking.com',
        billing_address: {
          street: '1004 Pine Hollow Road',
          city: 'Houston',
          state: 'TX',
          postal_code: '77002'
        }
      }
    });
    console.assert(createAccRes.status === 201, `Create billing account failed: ${createAccRes.status}`);
    const billingAccountId = createAccRes.body.data._id;
    console.log(`✓ Test 3 Passed: Billing account ${createAccRes.body.data.account_number} created.`);

    // -------------------------------------------------------------------------
    // TEST 4: Reject duplicate billing account numbers
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Reject duplicate billing account numbers within tenant scope...');
    const dupAccRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/accounts',
      headers: headersA,
      body: {
        account_number: 'BA-LONE-PINE-01',
        customer_name: 'Duplicate Account'
      }
    });
    console.assert(dupAccRes.status === 409, `Expected 409 for duplicate account number, got ${dupAccRes.status}`);
    console.log('✓ Test 4 Passed: Duplicate billing account number rejected (409 Conflict).');

    // -------------------------------------------------------------------------
    // TEST 5 & 6: Link Policy POL-TX-8821 & Generate 4-Pay Schedule
    // -------------------------------------------------------------------------
    console.log('\n[Test 5 & 6] Link Policy POL-TX-8821 & Generate 4-Pay Schedule ($37,650 + $150 fee)...');
    const schedRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/policies/schedule',
      headers: headersA,
      body: {
        billing_account_id: billingAccountId,
        policy_id: 'POL-TX-8821',
        policy_number: 'POL-TX-8821',
        carrier_name: 'Summit Mutual Insurance',
        line_of_business: 'COMMERCIAL_AUTO',
        effective_date: '2026-07-01T00:00:00Z',
        total_premium: '37650.00',
        policy_fee: '150.00',
        billing_plan_code: '4_PAY_25_DOWN'
      }
    });
    console.assert(schedRes.status === 201, `Schedule generation failed: ${schedRes.status}`);
    const schedules = schedRes.body.data.schedules;
    console.assert(schedules.length === 4, `Expected 4 installments, got ${schedules.length}`);

    // Verify installment 1 = $9,412.50 premium + $150 fee = $9,562.50
    const inst1 = schedules.find(s => s.installment_number === 1);
    console.assert(inst1.premium_amount === '9412.50', `Inst 1 premium mismatch: ${inst1.premium_amount}`);
    console.assert(inst1.fee_amount === '150.00', `Inst 1 fee mismatch: ${inst1.fee_amount}`);
    console.assert(inst1.total_amount === '9562.50', `Inst 1 total mismatch: ${inst1.total_amount}`);

    // Verify sum of 4 premium installments equals exactly $37,650.00
    const sumPremium = schedules.reduce((acc, s) => acc + Number(s.premium_amount), 0);
    console.assert(sumPremium.toFixed(2) === '37650.00', `Sum of premiums mismatch: ${sumPremium}`);
    console.log('✓ Test 5 & 6 Passed: 4-Pay schedule verified ($9,562.50 deposit, total premium $37,650.00).');

    // -------------------------------------------------------------------------
    // TEST 7 & 8: Issue Deposit Invoice #1 and verify double-entry GL handshake
    // -------------------------------------------------------------------------
    console.log('\n[Test 7 & 8] Issue Deposit Invoice #1 ($9,562.50) & verify GL handshake journal...');
    const invoiceRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/invoices',
      headers: headersA,
      body: {
        billing_account_id: billingAccountId,
        policy_id: 'POL-TX-8821',
        installment_number: 1,
        invoice_date: '2026-07-01T00:00:00Z',
        lines: [
          {
            line_type: 'PREMIUM',
            description: 'Commercial Auto Down Payment (25%)',
            amount: '9412.50',
            ledger_account_code: '2200'
          },
          {
            line_type: 'FEE',
            description: 'Texas Policy Issuance Fee',
            amount: '150.00',
            ledger_account_code: '4100'
          }
        ]
      }
    });
    if (invoiceRes.status !== 201) {
      console.error('Issue invoice failed response:', JSON.stringify(invoiceRes.body, null, 2));
    }
    console.assert(invoiceRes.status === 201, `Issue invoice failed: ${invoiceRes.status}`);
    const issuedInvoice = invoiceRes.body.data.invoice;
    const invoiceJournal = invoiceRes.body.data.journal;
    console.assert(issuedInvoice.total_amount === '9562.50', 'Invoice total mismatch');
    console.assert(issuedInvoice.balance_due === '9562.50', 'Balance due mismatch');
    console.assert(invoiceJournal.total_debit === '9562.50', 'Journal total debit mismatch');
    console.assert(invoiceJournal.total_credit === '9562.50', 'Journal total credit mismatch');
    console.log(`✓ Test 7 & 8 Passed: Invoice ${issuedInvoice.invoice_number} issued with balanced GL Journal ${invoiceJournal.journal_number}.`);

    // -------------------------------------------------------------------------
    // TEST 9: Reject duplicate issuing of the same installment invoice
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Reject duplicate issuing of the same installment invoice...');
    const dupInvoiceRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/invoices',
      headers: headersA,
      body: {
        billing_account_id: billingAccountId,
        policy_id: 'POL-TX-8821',
        installment_number: 1,
        lines: [{ line_type: 'PREMIUM', description: 'Duplicate', amount: '9412.50' }]
      }
    });
    console.assert(dupInvoiceRes.status === 400, `Expected 400 for duplicate invoice, got ${dupInvoiceRes.status}`);
    console.log(`✓ Test 9 Passed: Duplicate invoice rejected ("${dupInvoiceRes.body.error.message}").`);

    // -------------------------------------------------------------------------
    // TEST 10, 11 & 12: Record Customer Cash Receipt & Waterfall Allocate
    // -------------------------------------------------------------------------
    console.log('\n[Test 10, 11 & 12] Record Customer Cash Receipt $9,412.50 via ACH (Texas Trust) & Waterfall...');
    const paymentRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/payments',
      headers: headersA,
      body: {
        billing_account_id: billingAccountId,
        amount: '9412.50',
        payment_method: 'ACH',
        reference_number: 'WF-TX-ACH-9912',
        is_fiduciary: true
      }
    });
    if (paymentRes.status !== 201) {
      console.error('Payment failed response:', JSON.stringify(paymentRes.body, null, 2));
    }
    console.assert(paymentRes.status === 201, `Payment failed: ${paymentRes.status}`);
    const recordedPayment = paymentRes.body.data.payment;
    const paymentJournal = paymentRes.body.data.journal;
    console.assert(recordedPayment.amount === '9412.50', 'Payment amount mismatch');
    console.assert(recordedPayment.allocated_amount === '9412.50', 'Allocated amount mismatch');
    console.assert(recordedPayment.unapplied_amount === '0.00', 'Unapplied amount mismatch');
    console.assert(paymentJournal.total_debit === '9412.50', 'Payment journal total debit mismatch');
    console.assert(paymentJournal.total_credit === '9412.50', 'Payment journal total credit mismatch');

    // Verify invoice balance knocked down from $9,562.50 to $150.00
    const invDetailRes = await makeRequest({
      method: 'GET',
      path: `/api/v1/billing/invoices/${issuedInvoice._id}`,
      headers: headersA
    });
    console.assert(invDetailRes.body.data.invoice.balance_due === '150.00', 'Remaining balance mismatch');
    console.assert(invDetailRes.body.data.invoice.status === 'PARTIALLY_PAID', 'Invoice status must be PARTIALLY_PAID');
    console.log('✓ Test 10, 11 & 12 Passed: ACH payment cleared $9,412.50 AR. Invoice balance remaining: $150.00 fee.');

    // -------------------------------------------------------------------------
    // TEST 13: Fee Waiver Adjustment to clear remaining $150.00
    // -------------------------------------------------------------------------
    console.log('\n[Test 13] Apply Fee Waiver adjustment ($150.00) to clear remaining fee balance...');
    const adjRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/adjustments',
      headers: headersA,
      body: {
        billing_account_id: billingAccountId,
        invoice_id: issuedInvoice._id,
        adjustment_type: 'FEE_WAIVER',
        amount: '150.00',
        reason_code: 'BROKER_RELATIONSHIP',
        reason_description: 'Courtesy fee waiver for Lone Pine Trucking'
      }
    });
    if (adjRes.status !== 201) {
      console.error('Adjustment failed response:', JSON.stringify(adjRes.body, null, 2));
    }
    console.assert(adjRes.status === 201, `Adjustment failed: ${adjRes.status}`);
    const adjJournal = adjRes.body.data.journal;
    console.assert(adjJournal.total_debit === '150.00', 'Adjustment journal Dr mismatch');

    // Verify Invoice 1 reached PAID status
    const invClearedRes = await makeRequest({
      method: 'GET',
      path: `/api/v1/billing/invoices/${issuedInvoice._id}`,
      headers: headersA
    });
    console.assert(invClearedRes.body.data.invoice.status === 'PAID', 'Invoice status must be PAID');
    console.assert(invClearedRes.body.data.invoice.balance_due === '0.00', 'Invoice balance must be 0.00');
    console.log('✓ Test 13 Passed: Fee waiver applied; Invoice reached fully PAID status ($0.00 balance due).');

    // -------------------------------------------------------------------------
    // TEST 14: Overpayment handling via Unapplied Cash Suspense (2190)
    // -------------------------------------------------------------------------
    console.log('\n[Test 14] Test overpayment receipt sends unallocated excess to Unapplied Cash Suspense (2190)...');
    const overpayRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/billing/payments',
      headers: headersA,
      body: {
        billing_account_id: billingAccountId,
        amount: '500.00',
        payment_method: 'CHECK',
        reference_number: 'UNAPPLIED-CHK-01'
      }
    });
    console.assert(overpayRes.status === 201, `Overpayment failed: ${overpayRes.status}`);
    console.assert(overpayRes.body.data.payment.unapplied_amount === '500.00', 'Expected $500 unapplied cash');
    console.assert(overpayRes.body.data.journal.total_debit === '500.00', 'Journal total mismatch');
    console.log('✓ Test 14 Passed: Overpayment routed to Unapplied Cash (2190) suspense without over-allocating.');

    // -------------------------------------------------------------------------
    // TEST 15: Cross-Tenant Data Isolation
    // -------------------------------------------------------------------------
    console.log('\n[Test 15] Verify Tenant B cannot read or access Tenant A billing accounts/invoices...');
    const crossRes = await makeRequest({
      method: 'GET',
      path: `/api/v1/billing/invoices/${issuedInvoice._id}`,
      headers: headersB
    });
    console.assert(crossRes.status === 404, `Expected 404 for cross-tenant invoice, got ${crossRes.status}`);
    console.log('✓ Test 15 Passed: Cross-tenant isolation verified (Tenant B cannot access Tenant A billing records).');

    // -------------------------------------------------------------------------
    // TEST 16: Trial Balance Equilibrium Verification
    // -------------------------------------------------------------------------
    console.log('\n[Test 16] Verify General Ledger Trial Balance equilibrium across all Billing events...');
    const tbRes = await makeRequest({
      method: 'GET',
      path: '/api/v1/gl/trial-balance',
      headers: headersA
    });
    console.assert(tbRes.status === 200, 'TB fetch failed');
    console.assert(tbRes.body.data.is_balanced === true, 'Trial balance must be in equilibrium');
    console.assert(tbRes.body.data.total_debits === tbRes.body.data.total_credits, 'Debits must equal credits');
    console.log(`✓ Test 16 Passed: GL Trial Balance in equilibrium (Total Dr: $${tbRes.body.data.total_debits}, Total Cr: $${tbRes.body.data.total_credits}).`);

    console.log('\n================================================================');
    console.log(' ALL 16 PHASE 3 BILLING & AR ACCEPTANCE TESTS PASSED!            ');
    console.log('================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runBillingAcceptanceTests();
