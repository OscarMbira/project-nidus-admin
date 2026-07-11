import { test, expect } from '../../fixtures/auth.js'
import { expectPageLoaded } from '../../helpers/page-assertions.js'

test.describe('Platform — dashboard detach', () => {
  test('Detach opens a chromeless popout window', async ({ page, context }) => {
    test.skip(test.info().project.name !== 'platform-pmo_admin')

    await page.goto('/platform/dashboard')
    await expectPageLoaded(page)

    const detachBtn = page.getByRole('button', { name: /detach/i })
    await expect(detachBtn).toBeVisible()

    const [popout] = await Promise.all([
      context.waitForEvent('page'),
      detachBtn.click(),
    ])

    await popout.waitForLoadState('domcontentloaded')
    await expect(popout).toHaveURL(/popout=1/)
    await expect(popout.locator('aside')).toHaveCount(0)

    await popout.close()
  })
})
