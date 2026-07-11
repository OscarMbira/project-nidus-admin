import { test } from '../../../fixtures/test-data.js'
import { ADMIN_FEATURE_TESTS, MODULE_ROLES } from '../../../catalogs/admin-routes.js'
import { expectPageLoaded } from '../../../helpers/page-assertions.js'

for (const [module, tests] of Object.entries(ADMIN_FEATURE_TESTS)) {
  const roles = MODULE_ROLES[module] || ['super_admin']
  test.describe(`${module} module features`, () => {
    for (const role of roles) {
      test.describe(role, () => {
        for (const t of tests) {
          test(t.name, async ({ page }) => {
            const projectRole = test.info().project.name.replace('admin-', '')
            test.skip(projectRole !== role, `Requires ${role}`)
            await page.goto(t.path)
            await expectPageLoaded(page)
          })
        }
      })
    }
  })
}
