import { test, expect } from '../../../fixtures/test-data.js'
import { expectPageLoaded } from '../../../helpers/page-assertions.js'

const GOVERNANCE_ROUTES = [
  { name: 'Lifecycle configuration', path: '/admin-mgmt/record-governance/lifecycle-configuration' },
  { name: 'Authorisers', path: '/admin-mgmt/record-governance/authorisers' },
  { name: 'Archive retention rules', path: '/admin-mgmt/record-governance/archive-retention-rules' },
  { name: 'My approvals', path: '/admin-mgmt/record-governance/my-approvals' },
]

test.describe('Record governance pages', () => {
  test.beforeEach(async ({ page }) => {
    const projectRole = test.info().project.name.replace('admin-', '')
    test.skip(projectRole !== 'super_admin', 'Record governance requires super_admin')
  })

  for (const route of GOVERNANCE_ROUTES) {
    test(`loads ${route.name}`, async ({ page }) => {
      await page.goto(route.path)
      await expectPageLoaded(page)
      await expect(page.locator('h1')).toBeVisible()
    })
  }
})

test.describe('Pilot lifecycle UI smoke', () => {
  test('plan catalog form shows lifecycle section when editing', async ({ page }) => {
    const projectRole = test.info().project.name.replace('admin-', '')
    test.skip(projectRole !== 'super_admin', 'Requires super_admin')

    await page.goto('/subscriptions/plan-catalog')
    await expectPageLoaded(page)

    const editLink = page.getByRole('link', { name: /edit/i }).first()
    if (await editLink.count() === 0) {
      test.skip(true, 'No catalog plans to edit')
    }
    await editLink.click()
    await expectPageLoaded(page)
    await expect(page.getByText('Record lifecycle')).toBeVisible({ timeout: 15_000 })
  })
})
