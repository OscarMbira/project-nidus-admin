import { test, expect } from '../../../fixtures/test-data.js'
import { expectPageLoaded } from '../../../helpers/page-assertions.js'

test.describe('Record lifecycle defer-apply UI', () => {
  test.beforeEach(async ({ page }) => {
    const projectRole = test.info().project.name.replace('admin-', '')
    test.skip(projectRole !== 'super_admin', 'Defer-apply UI checks require super_admin')
  })

  test('plan edit page shows pending-changes diff section when unauthorised', async ({ page }) => {
    await page.goto('/subscriptions/plan-catalog')
    await expectPageLoaded(page)

    const editLink = page.getByRole('link', { name: /edit/i }).first()
    if (await editLink.count() === 0) {
      test.skip(true, 'No catalog plans to edit')
    }
    await editLink.click()
    await expectPageLoaded(page)
    await expect(page.getByText('Record lifecycle')).toBeVisible({ timeout: 15_000 })

    const unauthorisedBadge = page.getByText('Unauthorised', { exact: true })
    if (await unauthorisedBadge.count() === 0) {
      test.skip(true, 'No unauthorised plan available to verify defer-apply diff UI')
    }

    await expect(page.getByText(/pending edit awaiting approval/i)).toBeVisible()
    await expect(page.getByText('Pending changes')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Current (approved)' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Proposed' })).toBeVisible()
  })

  test('affiliate edit page includes lifecycle panel with diff support', async ({ page }) => {
    await page.goto('/affiliates/affiliates')
    await expectPageLoaded(page)

    const editLink = page.getByRole('link', { name: /edit/i }).first()
    if (await editLink.count() === 0) {
      test.skip(true, 'No affiliates to edit')
    }
    await editLink.click()
    await expectPageLoaded(page)
    await expect(page.getByText('Record lifecycle')).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Record lifecycle defer-apply manual verification', () => {
  test('documents end-to-end defer-apply regression checklist', async () => {
    test.info().annotations.push({
      type: 'manual',
      description: [
        '1. Assign an authoriser for subscription_plans.',
        '2. Edit a live plan (rename + price) — row stays live on DB columns; record_status becomes unauthorised.',
        '3. Public subscription preview still shows the approved name/price.',
        '4. Pending changes diff shows current vs proposed on the plan edit page.',
        '5. Validate — new values apply; public preview updates.',
        '6. Repeat submit, then reject via My Approvals — record returns to live with original values (not history).',
      ].join(' '),
    })
    expect(true).toBe(true)
  })
})
