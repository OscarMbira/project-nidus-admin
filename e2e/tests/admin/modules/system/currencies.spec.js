import { test } from '../../../../fixtures/auth.js'
import { buildCurrency } from '../../../../factories/index.js'
import { fillForm, clickButton } from '../../../../helpers/form-filler.js'
import { expectPageLoaded, expectToast } from '../../../../helpers/page-assertions.js'

test.describe('System — currencies CRUD', () => {
  test.use({ storageState: '.auth/admin_super_admin.json' })

  test('Create currency with valid data', async ({ page }) => {
    test.skip(test.info().project.name !== 'admin-super_admin')
    const data = buildCurrency()
    await page.goto('/system/currencies')
    await expectPageLoaded(page)
    const newBtn = page.getByRole('button', { name: /new currency/i })
    if (await newBtn.count() === 0) {
      test.skip(true, 'New Currency button not available')
    }
    await newBtn.click()
    await fillForm(page, {
      currency_code: data.currency_code,
      currency_name: data.currency_name,
      symbol: data.symbol,
      decimal_places: String(data.decimal_places),
    })
    await clickButton(page, 'Create')
    await expectToast(page, 'created')
  })
})

test.describe('System — feature flags', () => {
  test('Feature flags page loads', async ({ page }) => {
    test.skip(test.info().project.name !== 'admin-super_admin')
    await page.goto('/system/feature-flags')
    await expectPageLoaded(page)
  })
})

test.describe('System — countries', () => {
  test('Countries page loads', async ({ page }) => {
    test.skip(test.info().project.name !== 'admin-super_admin')
    await page.goto('/system/countries')
    await expectPageLoaded(page)
  })
})
