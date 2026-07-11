import { test, expect } from '../../fixtures/auth.js'
import { expectPageLoaded } from '../../helpers/page-assertions.js'

test.describe('Cross-system integration', () => {
  test.use({ storageState: '.auth/admin_super_admin.json' })

  test('Admin users page accessible for suspend workflow', async ({ page }) => {
    test.skip(test.info().project.name !== 'cross-system')
    await page.goto('/users/user-list')
    await expectPageLoaded(page)
    await expect(page.locator('h1')).toContainText(/user/i)
  })

  test('Countries page accessible for disable workflow', async ({ page }) => {
    test.skip(test.info().project.name !== 'cross-system')
    await page.goto('/system/countries')
    await expectPageLoaded(page)
  })

  test('Subscriptions page accessible for cross-system check', async ({ page }) => {
    test.skip(test.info().project.name !== 'cross-system')
    await page.goto('/subscriptions/subscription-list')
    await expectPageLoaded(page)
  })

  test('Currencies page accessible for propagation check', async ({ page }) => {
    test.skip(test.info().project.name !== 'cross-system')
    await page.goto('/system/currencies')
    await expectPageLoaded(page)
  })

  test('Maintenance mode page accessible', async ({ page }) => {
    test.skip(test.info().project.name !== 'cross-system')
    await page.goto('/system/maintenance-mode')
    await expectPageLoaded(page)
  })
})
