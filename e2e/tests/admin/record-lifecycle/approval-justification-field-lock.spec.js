import { test, expect } from '../../../fixtures/test-data.js'
import { expectPageLoaded } from '../../../helpers/page-assertions.js'

test.describe('Approval justification and field lock', () => {
  test.beforeEach(async ({ page }) => {
    const projectRole = test.info().project.name.replace('admin-', '')
    test.skip(projectRole !== 'super_admin', 'Requires super_admin')
  })

  test('record page disables approve/reject until justification is entered', async ({ page }) => {
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
      test.skip(true, 'No unauthorised plan available')
    }

    const approveBtn = page.getByRole('button', { name: /^Approve$/i })
    const rejectBtn = page.getByRole('button', { name: /^Reject$/i })
    await expect(approveBtn).toBeVisible()
    await expect(rejectBtn).toBeVisible()
    await expect(approveBtn).toBeDisabled()
    await expect(rejectBtn).toBeDisabled()

    await page.getByPlaceholder(/explain why you are approving/i).fill('E2E approval justification')
    await expect(approveBtn).toBeEnabled()
    await expect(rejectBtn).toBeEnabled()
  })

  test('form fields are disabled while record is unauthorised', async ({ page }) => {
    await page.goto('/subscriptions/plan-catalog')
    await expectPageLoaded(page)

    const editLink = page.getByRole('link', { name: /edit/i }).first()
    if (await editLink.count() === 0) {
      test.skip(true, 'No catalog plans to edit')
    }
    await editLink.click()
    await expectPageLoaded(page)

    const unauthorisedBadge = page.getByText('Unauthorised', { exact: true })
    if (await unauthorisedBadge.count() === 0) {
      test.skip(true, 'No unauthorised plan available')
    }

    await expect(page.getByText(/locked for editing until the pending change/i)).toBeVisible()
    const fieldset = page.locator('fieldset[disabled]').first()
    await expect(fieldset).toBeVisible()
    await expect(fieldset.locator('input:not([type="hidden"])').first()).toBeDisabled()
  })

  test('My Approvals shows view changes and blocks empty justification in review modal', async ({ page }) => {
    await page.goto('/admin-mgmt/record-governance/my-approvals')
    await expectPageLoaded(page)

    const viewChangesBtn = page.getByRole('button', { name: /view changes/i }).first()
    if (await viewChangesBtn.count() === 0) {
      test.skip(true, 'No pending approvals in queue')
    }

    await viewChangesBtn.click()
    await expect(page.getByText('Pending changes')).toBeVisible({ timeout: 15_000 })

    const approveBtn = page.getByRole('button', { name: /^Approve$/i }).first()
    await approveBtn.click()

    const confirmBtn = page.getByRole('button', { name: /^Approve$/i }).last()
    await expect(confirmBtn).toBeDisabled()

    const reasonField = page.locator('#authoriser-justification')
    await reasonField.fill('E2E queue approval justification')
    await expect(confirmBtn).toBeEnabled()

    await page.getByRole('button', { name: /^Cancel$/i }).click()
  })
})

test.describe('Unified decision path manual verification', () => {
  test('documents record-page decision clears My Approvals queue row', async () => {
    test.info().annotations.push({
      type: 'manual',
      description: [
        '1. Submit a governed edit so a row appears in My Approvals.',
        '2. Open the record edit page (do not use My Approvals).',
        '3. Enter approval justification and click Approve.',
        '4. Confirm the matching queue row disappears from My Approvals (no ghost pending row).',
        '5. Repeat with Reject — record returns to live; queue row cleared.',
      ].join(' '),
    })
    expect(true).toBe(true)
  })
})
