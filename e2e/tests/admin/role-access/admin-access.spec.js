import { test, expect } from '../../../fixtures/auth.js'
import { routesForRole } from '../../../catalogs/admin-routes.js'
import { expectRouteAccessible } from '../../../helpers/page-assertions.js'

const ROLES = ['super_admin', 'system_admin', 'support_admin', 'content_admin']

for (const role of ROLES) {
  test.describe(`Admin access — ${role}`, () => {
    for (const route of routesForRole(role)) {
      test(`${route.label} (${route.path})`, async ({ page }) => {
        test.skip(test.info().project.name !== `admin-${role}`, `Requires admin-${role} project`)
        await expectRouteAccessible(page, route.path, { shouldDeny: route.shouldDeny })
      })
    }
  })
}

test('Dashboard loads for authenticated admin', async ({ page }) => {
  test.skip(!test.info().project.name.startsWith('admin-'))
  await page.goto('/dashboard')
  await expect(page.locator('h1, [data-testid="dashboard"]')).toBeVisible({ timeout: 15_000 })
})
