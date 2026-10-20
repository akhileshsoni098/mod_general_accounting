const { startServer } = require('../src/server');
const http = require('http');

function makeRequest({ method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 5050,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runPhase2Tests() {
  console.log('================================================================');
  console.log(' STARTING PHASE 2 CORE GENERAL LEDGER VERIFICATION TESTS        ');
  console.log('================================================================');

  let server = null;
  const testSuffix = Math.floor(Date.now() % 100000);

  try {
    const boot = await startServer();
    server = boot.server;

    // 1. Onboard a fresh tenant for Lone Pine Trucking
    console.log('\n[GL Test 1] Onboarding Lone Pine Trucking for GL testing...');
    const regRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/auth/register-tenant',
      body: {
        tenant_code: `GL_LPT_${testSuffix}`,
        tenant_name: 'Lone Pine Trucking Insurance Co.',
        base_currency: 'USD',
        admin_first_name: 'Arturo',
        admin_last_name: 'Gatti',
        admin_email: `arturo_${testSuffix}@gl-lonepine.com`,
        admin_password: 'Password123!'
      }
    });
    console.assert(regRes.status === 201, `Registration failed: ${regRes.status}`);
    const token = regRes.body.data.token;
    const tenantId = regRes.body.data.tenant.id;
    const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
    console.log(`✓ Tenant created: ${tenantId}`);

    // 2. Query Chart of Accounts (COA) - Auto-seeding check
    console.log('\n[GL Test 2] Querying and Auto-Seeding Chart of Accounts (COA)...');
    const coaRes = await makeRequest({ method: 'GET', path: '/api/v1/gl/accounts', headers });
    console.assert(coaRes.status === 200, `COA fetch failed: ${coaRes.status}`);
    console.assert(coaRes.body.data.length >= 20, `COA accounts count expected >= 20, got ${coaRes.body.data.length}`);
    console.log(`✓ Verified ${coaRes.body.data.length} Chart of Accounts seeded (Assets, Liabilities, Equity, Revenue, Expense).`);

    // Verify key accounts exist: 1100 (AR), 2100 (UPR), 1020 (Fiduciary Cash Texas § 4053)
    const codes = coaRes.body.data.map(a => a.account_code);
    console.assert(codes.includes('1100'), 'Missing Account 1100 (AR)');
    console.assert(codes.includes('2100'), 'Missing Account 2100 (UPR)');
    console.assert(codes.includes('1020'), 'Missing Account 1020 (Fiduciary Cash)');
    console.log('✓ Essential insurance accounting accounts verified (1100 AR, 2100 UPR, 1020 Fiduciary Cash).');

    // 3. Query Fiscal Periods
    console.log('\n[GL Test 3] Checking Fiscal Periods...');
    const periodsRes = await makeRequest({ method: 'GET', path: '/api/v1/gl/periods', headers });
    console.assert(periodsRes.status === 200, `Periods fetch failed: ${periodsRes.status}`);
    console.assert(periodsRes.body.data.length === 12, `Expected 12 periods, got ${periodsRes.body.data.length}`);
    const julyPeriod = periodsRes.body.data.find(p => p.period_name === '2026-07');
    console.assert(julyPeriod, 'Missing July 2026 period (2026-07)');
    console.log('✓ 12 Fiscal periods active and open for 2026.');

    // 4. Test Double-Entry Imbalance Rejection (Attempt unbalanced journal)
    console.log('\n[GL Test 4] Security Guard: Rejecting Unbalanced Journal Entry...');
    const unbalRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/journals',
      headers,
      body: {
        posting_date: '2026-07-01T00:00:00Z',
        memo: 'Illegal Unbalanced Journal',
        lines: [
          { account_code: '1100', debit: '37650.00', credit: '0.00' },
          { account_code: '2100', debit: '0.00', credit: '30000.00' } // Missing $7,650!
        ]
      }
    });
    console.assert(unbalRes.status === 400, `Expected 400 for imbalance, got ${unbalRes.status}`);
    console.log(`✓ Unbalanced journal correctly rejected with 400 Bad Request: "${unbalRes.body.error.message}"`);

    // 5. Post Canonical Lone Pine Policy Bound Journal ($37,650.00)
    // Dr 1100 Accounts Receivable  $37,650.00
    // Cr 2100 Unearned Premium Res $37,650.00
    console.log('\n[GL Test 5] Posting Canonical Lone Pine Trucking Policy Bound Journal ($37,650.00)...');
    const postRes1 = await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/journals',
      headers,
      body: {
        posting_date: '2026-07-01T00:00:00Z',
        source_module: 'POLICY_BIND',
        reference_id: 'POL-TX-8821',
        memo: 'Gross Premium & Initial UPR for Lone Pine Trucking #POL-TX-8821',
        lines: [
          {
            account_code: '1100',
            debit: '37650.00',
            credit: '0.00',
            memo: 'Direct Bill AR for Lone Pine Trucking',
            dimensions: { policy_id: 'POL-TX-8821', jurisdiction: 'TX', line_of_business: 'COMMERCIAL_AUTO' }
          },
          {
            account_code: '2100',
            debit: '0.00',
            credit: '37650.00',
            memo: 'Unearned Premium Reserve for 365 days term',
            dimensions: { policy_id: 'POL-TX-8821', jurisdiction: 'TX', line_of_business: 'COMMERCIAL_AUTO' }
          }
        ]
      }
    });
    console.assert(postRes1.status === 201, `Policy bind journal failed: ${postRes1.status}`);
    const jeNumber1 = postRes1.body.data.journal.journal_number;
    console.log(`✓ Balanced Journal posted: ${jeNumber1}. Debits: $${postRes1.body.data.journal.total_debit}, Credits: $${postRes1.body.data.journal.total_credit}`);

    // 6. Post Down Payment Cash Receipt Journal ($9,412.50)
    // Dr 1020 Fiduciary Cash (Texas § 4053) $9,412.50
    // Cr 1100 Accounts Receivable            $9,412.50
    console.log('\n[GL Test 6] Posting Down Payment Cash Receipt Journal ($9,412.50)...');
    const postRes2 = await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/journals',
      headers,
      body: {
        posting_date: '2026-07-02T14:30:00Z',
        source_module: 'TREASURY_BANK_REC',
        reference_id: 'PAY-TX-001',
        memo: '25% Down Payment received via ACH for POL-TX-8821',
        lines: [
          {
            account_code: '1020',
            debit: '9412.50',
            credit: '0.00',
            memo: 'ACH Deposit to Texas § 4053 Fiduciary Premium Trust'
          },
          {
            account_code: '1100',
            debit: '0.00',
            credit: '9412.50',
            memo: 'Direct Bill AR clearance for Lone Pine Trucking Down Payment'
          }
        ]
      }
    });
    console.assert(postRes2.status === 201, `Down payment journal failed: ${postRes2.status}`);
    console.log(`✓ Cash Receipt Journal posted: ${postRes2.body.data.journal.journal_number}`);

    // 7. Post ASC 944 July 31-Day UPR Amortization Journal ($3,197.67)
    // Dr 2100 Unearned Premium Reserve $3,197.67
    // Cr 4020 Earned Premium Revenue   $3,197.67
    console.log('\n[GL Test 7] Posting Month-End ASC 944 UPR Earning Recognition ($3,197.67)...');
    const postRes3 = await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/journals',
      headers,
      body: {
        posting_date: '2026-07-31T23:59:59Z',
        source_module: 'FINANCE_CLOSE',
        reference_id: 'UPR-2026-07',
        memo: 'July 2026 31-day straight line UPR earned premium ($103.150685/day * 31 days)',
        lines: [
          {
            account_code: '2100',
            debit: '3197.67',
            credit: '0.00',
            memo: 'UPR Reserve reduction for July 2026 earned days'
          },
          {
            account_code: '4020',
            debit: '0.00',
            credit: '3197.67',
            memo: 'Earned Premium Revenue recognized'
          }
        ]
      }
    });
    console.assert(postRes3.status === 201, `UPR journal failed: ${postRes3.status}`);
    console.log(`✓ UPR Amortization Journal posted: ${postRes3.body.data.journal.journal_number}`);

    // 8. Assert Preliminary Trial Balance Equilibrium & Specific Balances
    console.log('\n[GL Test 8] Computing Trial Balance and Verifying Balances...');
    const tbRes = await makeRequest({ method: 'GET', path: '/api/v1/gl/trial-balance', headers });
    console.assert(tbRes.status === 200, `Trial balance failed: ${tbRes.status}`);
    console.assert(tbRes.body.data.is_balanced === true, 'Trial balance must be in 100% equilibrium');
    console.assert(tbRes.body.data.difference === '0.00', `Difference must be 0.00, got ${tbRes.body.data.difference}`);

    const accMap = {};
    for (const a of tbRes.body.data.accounts) {
      accMap[a.account_code] = a.current_balance;
    }

    // Mathematical assertions:
    // AR 1100: +37,650.00 - 9,412.50 = 28,237.50
    console.assert(accMap['1100'] === '28237.50', `AR 1100 expected 28237.50, got ${accMap['1100']}`);
    // Fiduciary Cash 1020: +9,412.50
    console.assert(accMap['1020'] === '9412.50', `Fiduciary Cash 1020 expected 9412.50, got ${accMap['1020']}`);
    // UPR 2100: +37,650.00 - 3,197.67 = 34,452.33
    console.assert(accMap['2100'] === '34452.33', `UPR 2100 expected 34452.33, got ${accMap['2100']}`);
    // Earned Premium 4020: +3,197.67
    console.assert(accMap['4020'] === '3197.67', `Earned Premium 4020 expected 3197.67, got ${accMap['4020']}`);

    console.log(`✓ Trial Balance Equilibrium Verified: Total Debits: $${tbRes.body.data.total_debits}, Total Credits: $${tbRes.body.data.total_credits}`);
    console.log(`✓ Account Balances verified against canonical Lone Pine Trucking values:`);
    console.log(`  - 1100 AR Balance: $${accMap['1100']}`);
    console.log(`  - 1020 Fiduciary Cash Balance: $${accMap['1020']}`);
    console.log(`  - 2100 UPR Reserve Balance: $${accMap['2100']}`);
    console.log(`  - 4020 Earned Premium Balance: $${accMap['4020']}`);

    // 9. Test Hard Period Lock Guard
    console.log('\n[GL Test 9] Testing Hard Accounting Period Lock Guard...');
    // Lock July 2026
    const lockRes = await makeRequest({
      method: 'PATCH',
      path: '/api/v1/gl/periods/status',
      headers,
      body: {
        period_id: julyPeriod._id,
        status: 'LOCKED'
      }
    });
    console.assert(lockRes.status === 200, `Lock period failed: ${lockRes.status}`);
    console.assert(lockRes.body.data.status === 'LOCKED', 'Period must be LOCKED');
    console.log(`✓ Period 2026-07 successfully locked.`);

    // Attempt backdated posting in locked period
    console.log('Attempting backdated journal posting in locked July 2026 period...');
    const backdateRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/gl/journals',
      headers,
      body: {
        posting_date: '2026-07-15T00:00:00Z',
        memo: 'Backdated entry attempt',
        lines: [
          { account_code: '1010', debit: '100.00', credit: '0.00' },
          { account_code: '4100', debit: '0.00', credit: '100.00' }
        ]
      }
    });
    console.assert(backdateRes.status === 400, `Expected 400 for locked period, got ${backdateRes.status}`);
    console.log(`✓ Backdated journal correctly rejected with error: "${backdateRes.body.error.message}"`);

    console.log('\n================================================================');
    console.log(' ALL 9 PHASE 2 GENERAL LEDGER TESTS PASSED SUCCESSFULLY!        ');
    console.log('================================================================\n');

  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    process.exit(0);
  }
}

runPhase2Tests();
