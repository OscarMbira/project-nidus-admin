import { test, expect } from '../../fixtures/auth.js'
import { expectPageLoaded } from '../../helpers/page-assertions.js'

test.describe('Simulator — dashboard detach', () => {
  test('Detach opens a chromeless popout window', async ({ page, context }) => {
    test.skip(test.info().project.name !== 'sim-portfolio')

    await page.goto('/simulator/practice-portfolio/dashboard')
    await expectPageLoaded(page)

    await page.getByText('Maybe later').click({ timeout: 5000 }).catch(() => {})

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
