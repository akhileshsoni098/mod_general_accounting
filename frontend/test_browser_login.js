import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testLogin() {
  console.log('[Browser] Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    consoleMessages.push(`[PAGE ERROR] ${err.toString()}`);
  });

  console.log('[Browser] Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 15000 });

  console.log('[Browser] Submitting login form...');
  const signInButton = await page.$('button[type="submit"]');
  if (!signInButton) {
    throw new Error('Sign In button not found');
  }

  await signInButton.click();

  // Wait for dashboard to render (header or sidebar)
  console.log('[Browser] Waiting for dashboard UI...');
  await page.waitForSelector('header', { timeout: 10000 });

  // Additional wait for metrics to settle
  await new Promise(r => setTimeout(r, 2000));

  const screenshotPath = path.resolve('../docs/qa/evidence/02_tenant_dashboard.png');
  await page.screenshot({ path: screenshotPath });
  console.log('[Browser] Dashboard screenshot saved to:', screenshotPath);

  console.log('[Browser Console Logs]:');
  consoleMessages.forEach(m => console.log('  ', m));

  await browser.close();
  console.log('[Browser] Login test completed successfully!');
}

testLogin().catch(err => {
  console.error('[Browser Login Error]:', err);
  process.exit(1);
});
