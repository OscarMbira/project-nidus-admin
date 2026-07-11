/**
 * Generic form auto-fill by field name or data-testid.
 */
export async function fillForm(page, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    const testId = `field-${key.toLowerCase().replace(/\s+/g, '-')}`
    const selectors = [
      `[data-testid="${testId}"] input`,
      `[data-testid="${testId}"] select`,
      `[data-testid="${testId}"] textarea`,
      `[data-testid="${testId}"]`,
      `[name="${key}"]`,
      `input[name="${key}"]`,
      `select[name="${key}"]`,
      `textarea[name="${key}"]`,
    ]

    let filled = false
    for (const selector of selectors) {
      const el = page.locator(selector).first()
      if (await el.count() === 0) continue
      await el.scrollIntoViewIfNeeded()
      const tag = await el.evaluate((node) => node.tagName?.toLowerCase?.() || '')
      if (tag === 'select') {
        await el.selectOption(String(value))
      } else if (tag === 'input') {
        const type = await el.getAttribute('type')
        if (type === 'checkbox') {
          if (Boolean(value)) await el.check()
          else await el.uncheck()
        } else {
          await el.fill(String(value))
        }
      } else if (tag === 'textarea') {
        await el.fill(String(value))
      } else {
        const inner = el.locator('input, select, textarea').first()
        if (await inner.count() > 0) {
          await inner.scrollIntoViewIfNeeded()
          await inner.fill(String(value))
        }
      }
      filled = true
      break
    }
    if (!filled) {
      // best-effort: label-based fill
      const label = page.getByLabel(new RegExp(key.replace(/_/g, ' '), 'i'))
      if (await label.count() > 0) {
        await label.first().fill(String(value))
      }
    }
  }
}

export async function clickButton(page, text) {
  await page.getByRole('button', { name: new RegExp(text, 'i') }).first().click()
}
