import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testBrowser() {
  console.log('[Browser] Launching Chrome at:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('[Browser] Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 15000 });

  const title = await page.title();
  console.log('[Browser] Page title:', title);

  const screenshotPath = path.resolve('../docs/qa/evidence/01_login_page.png');
  await page.screenshot({ path: screenshotPath });
  console.log('[Browser] Screenshot saved to:', screenshotPath);

  await browser.close();
  console.log('[Browser] Smoke test successful!');
}

testBrowser().catch(err => {
  console.error('[Browser Error]:', err);
  process.exit(1);
});
