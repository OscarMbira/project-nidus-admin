import { test, expect } from '../../../../fixtures/auth.js'
import { expectPageLoaded } from '../../../../helpers/page-assertions.js'

test.describe('Subscriptions — Payment Dashboard detach', () => {
  test.use({ storageState: '.auth/admin_super_admin.json' })

  test('Detach opens a chromeless popout window', async ({ page, context }) => {
    test.skip(test.info().project.name !== 'admin-super_admin')

    await page.goto('/subscriptions/payment-dashboard')
    await expectPageLoaded(page)

    const detachBtn = page.getByRole('button', { name: /detach/i })
    await expect(detachBtn).toBeVisible()

    const [popout] = await Promise.all([
      context.waitForEvent('page'),
      detachBtn.click(),
    ])

    await popout.waitForLoadState('domcontentloaded')
    await expect(popout).toHaveURL(/\/popout\/subscriptions\/payment-dashboard/)
    await expect(popout.locator('h1')).toContainText(/payment dashboard/i)
    await expect(popout.locator('aside')).toHaveCount(0)

    await popout.close()
  })
})
