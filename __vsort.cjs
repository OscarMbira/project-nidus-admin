const { chromium } = require('./node_modules/playwright/index.js');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:5175/subscriptions/subscription-list', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2500);

  const btn = page.locator('thead th button').filter({ hasText: /System/ }).first();
  const vis = await btn.isVisible();
  console.log('Sort button visible:', vis);
  if (vis) {
    console.log('Header text:', (await btn.textContent()).trim());
    await btn.click();
    await page.waitForTimeout(700);
    const cells = await page.locator('tbody tr').evaluateAll(rows =>
      rows.slice(0, 8).map(r => r.querySelector('td:nth-child(3)')?.textContent?.trim())
    );
    console.log('Asc:', JSON.stringify(cells));
    await btn.click();
    await page.waitForTimeout(700);
    const cells2 = await page.locator('tbody tr').evaluateAll(rows =>
      rows.slice(0, 8).map(r => r.querySelector('td:nth-child(3)')?.textContent?.trim())
    );
    console.log('Desc:', JSON.stringify(cells2));
  } else {
    // dump all th buttons
    const allBtns = await page.locator('thead th button').allTextContents();
    console.log('All th buttons:', JSON.stringify(allBtns));
    const allTh = await page.locator('thead th').allTextContents();
    console.log('All th:', JSON.stringify(allTh));
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
