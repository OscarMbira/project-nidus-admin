import { test } from '../../../fixtures/auth.js'
import { platformRoutesForRole, PLATFORM_FEATURE_TESTS } from '../../../catalogs/platform-routes.js'
import { expectPageLoaded } from '../../../helpers/page-assertions.js'

const ROLES = ['pmo_admin', 'project_manager', 'programme_manager', 'portfolio_manager', 'team_lead', 'team_member', 'stakeholder', 'viewer']

for (const role of ROLES) {
  test.describe(`Platform access — ${role}`, () => {
    for (const routePath of platformRoutesForRole(role)) {
      test(`Route ${routePath}`, async ({ page }) => {
        test.skip(test.info().project.name !== `platform-${role}`)
        try {
          await page.goto(routePath, { timeout: 20_000 })
          await expectPageLoaded(page)
        } catch (err) {
          if (String(err.message).includes('ERR_CONNECTION_REFUSED')) {
            test.skip(true, 'Platform dev server not running')
          }
          throw err
        }
      })
    }
  })
}

for (const [area, tests] of Object.entries(PLATFORM_FEATURE_TESTS)) {
  test.describe(`Platform features — ${area}`, () => {
    for (const t of tests) {
      for (const role of t.roles) {
        test(`${t.name} (${role})`, async ({ page }) => {
          test.skip(test.info().project.name !== `platform-${role}`)
          try {
            await page.goto(t.path, { timeout: 20_000 })
            await expectPageLoaded(page)
          } catch (err) {
            if (String(err.message).includes('ERR_CONNECTION_REFUSED')) {
              test.skip(true, 'Platform dev server not running')
            }
            throw err
          }
        })
      }
    }
  })
}
