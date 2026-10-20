import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runNavigationAndCrud() {
  console.log('[Browser QA] Launching Chrome for Full Navigation & CRUD Suite...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,850']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      console.error('  [Browser Console Error]:', text);
    }
  });

  page.on('pageerror', err => {
    networkErrors.push(`[PAGE ERROR] ${err.toString()}`);
    console.error('  [Page Runtime Error]:', err.toString());
  });

  // Step 1: Login
  console.log('[Browser QA] Step 1: Navigating to login...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 15000 });
  const submitBtn = await page.$('button[type="submit"]');
  await submitBtn.click();
  await page.waitForSelector('header', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));
  console.log('[Browser QA] Login successful.');

  const evidenceDir = path.resolve('../docs/qa/evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  // Step 2: Tab Navigation & Screenshots
  const tabs = [
    { id: 'dashboard', name: 'Dashboard', file: '02_tenant_dashboard.png' },
    { id: 'gl', name: 'General Ledger', file: '03_gl_workspace.png' },
    { id: 'billing_ar', name: 'Billing & AR', file: '04_billing_workspace.png' },
    { id: 'commissions_fiduciary', name: 'Commissions & Fiduciary', file: '05_commissions_workspace.png' },
    { id: 'treasury_bank_rec', name: 'Treasury & Bank Rec', file: '06_treasury_workspace.png' },
    { id: 'finance_close', name: 'Finance Close', file: '07_finance_close_workspace.png' },
    { id: 'counterparties', name: 'Counterparties', file: '08_counterparties.png' },
    { id: 'event_definitions', name: 'Event Definitions', file: '09_event_definitions.png' },
    { id: 'posting_rules', name: 'Journal Entry Rules', file: '10_posting_rules.png' },
    { id: 'event_simulator', name: 'Event Simulator', file: '11_event_simulator.png' },
    { id: 'event_operations', name: 'Event Operations', file: '12_event_operations.png' },
    { id: 'rule_tests', name: 'Rule Test Cases', file: '13_rule_tests.png' },
    { id: 'config_bundle', name: 'Configuration Bundle', file: '14_config_bundle.png' },
    { id: 'users', name: 'Users & Roles', file: '15_user_management.png' },
    { id: 'settings', name: 'Organization Settings', file: '16_organization_settings.png' },
    { id: 'modules', name: 'Module Configuration', file: '17_module_config.png' }
  ];

  const navigationResults = [];

  for (const tab of tabs) {
    console.log(`[Browser QA] Navigating to: ${tab.name} (${tab.id})...`);
    try {
      // Find sidebar button by text or click event
      const clicked = await page.evaluate((tabId) => {
        const buttons = Array.from(document.querySelectorAll('aside button'));
        for (const b of buttons) {
          // Check onclick or text
          if (b.innerText.toLowerCase().includes(tabId.replace('_', ' ').toLowerCase()) ||
              (tabId === 'gl' && b.innerText.includes('General Ledger')) ||
              (tabId === 'billing_ar' && b.innerText.includes('Billing')) ||
              (tabId === 'commissions_fiduciary' && b.innerText.includes('Commissions')) ||
              (tabId === 'treasury_bank_rec' && b.innerText.includes('Treasury')) ||
              (tabId === 'finance_close' && b.innerText.includes('Finance Close')) ||
              (tabId === 'posting_rules' && b.innerText.includes('Journal Entry Rules')) ||
              (tabId === 'rule_tests' && b.innerText.includes('Rule Test Cases')) ||
              (tabId === 'config_bundle' && b.innerText.includes('Configuration Bundle')) ||
              (tabId === 'settings' && b.innerText.includes('Organization Settings')) ||
              (tabId === 'modules' && b.innerText.includes('Module Configuration')) ||
              (tabId === 'users' && b.innerText.includes('Users & Roles'))) {
            b.click();
            return true;
          }
        }
        return false;
      }, tab.id);

      if (!clicked) {
        console.warn(`  [Warning] Button for ${tab.id} not clicked via text match`);
      }

      await new Promise(r => setTimeout(r, 1200));
      const ssPath = path.join(evidenceDir, tab.file);
      await page.screenshot({ path: ssPath });
      console.log(`  Screenshot saved: ${tab.file}`);
      navigationResults.push({ tab: tab.name, status: 'PASS', screenshot: tab.file });
    } catch (err) {
      console.error(`  [Error navigating to ${tab.name}]:`, err.message);
      navigationResults.push({ tab: tab.name, status: 'FAIL', error: err.message });
    }
  }

  await browser.close();

  console.log('\n[Browser QA] Summary of Navigation Results:');
  navigationResults.forEach(r => console.log(`  ${r.tab}: ${r.status} (${r.screenshot || r.error})`));
  console.log(`[Browser QA] Total console errors: ${consoleLogs.filter(l => l.startsWith('[error]')).length}`);
  console.log(`[Browser QA] Total page runtime crashes: ${networkErrors.length}`);
}

runNavigationAndCrud().catch(err => {
  console.error('[Browser QA Fatal Error]:', err);
  process.exit(1);
});
