import { test } from '../../../fixtures/auth.js'
import { simulatorRoutesForRole, SIMULATOR_FEATURE_TESTS } from '../../../catalogs/simulator-routes.js'
import { expectPageLoaded } from '../../../helpers/page-assertions.js'

const ROLES = ['portfolio', 'programme', 'coordinator', 'pmo']

for (const role of ROLES) {
  test.describe(`Simulator access — ${role}`, () => {
    for (const routePath of simulatorRoutesForRole(role)) {
      test(`Route ${routePath}`, async ({ page }) => {
        test.skip(test.info().project.name !== `sim-${role}`)
        try {
          await page.goto(routePath, { timeout: 20_000 })
          await expectPageLoaded(page)
        } catch (err) {
          if (String(err.message).includes('ERR_CONNECTION_REFUSED')) {
            test.skip(true, 'Simulator dev server not running')
          }
          throw err
        }
      })
    }
  })
}

for (const [area, tests] of Object.entries(SIMULATOR_FEATURE_TESTS)) {
  test.describe(`Simulator features — ${area}`, () => {
    for (const t of tests) {
      for (const role of t.roles) {
        test(`${t.name} (${role})`, async ({ page }) => {
          test.skip(test.info().project.name !== `sim-${role}`)
          try {
            await page.goto(t.path, { timeout: 20_000 })
            await expectPageLoaded(page)
          } catch (err) {
            if (String(err.message).includes('ERR_CONNECTION_REFUSED')) {
              test.skip(true, 'Simulator dev server not running')
            }
            throw err
          }
        })
      }
    }
  })
}
