import { chromium } from './node_modules/@playwright/test/index.mjs';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:5175/subscriptions/subscription-list', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/tmp/page_state.png' });
  console.log('URL:', page.url());
  console.log('Title:', await page.title());
  console.log('Body text snippet:', (await page.locator('body').textContent()).substring(0, 300));
})().catch(e => { console.error(e.message); process.exit(1); });
