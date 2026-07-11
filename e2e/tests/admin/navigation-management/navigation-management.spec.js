import { test, expect } from '../../../fixtures/test-data.js'
import { expectPageLoaded } from '../../../helpers/page-assertions.js'

test.describe('Navigation management', () => {
  test.beforeEach(async () => {
    const projectRole = test.info().project.name.replace('admin-', '')
    test.skip(projectRole !== 'super_admin', 'Navigation management requires super_admin')
  })

  test('loads navigation management page', async ({ page }) => {
    await page.goto('/admin-mgmt/navigation-management')
    await expectPageLoaded(page)
    await expect(page.getByTestId('navigation-management-page')).toBeVisible()
    await expect(page.locator('h1')).toContainText('Navigation Management')
  })

  test('shows nav rows with editable labels', async ({ page }) => {
    await page.goto('/admin-mgmt/navigation-management')
    await expectPageLoaded(page)

    const firstLabelInput = page.locator('tbody input[type="text"]').first()
    await expect(firstLabelInput).toBeVisible({ timeout: 15_000 })

    const original = await firstLabelInput.inputValue()
    const tempLabel = `${original} E2E`
    await firstLabelInput.fill(tempLabel)
    await firstLabelInput.blur()

    await expect(page.getByText('Navigation label updated')).toBeVisible({ timeout: 15_000 })

    await firstLabelInput.fill(original)
    await firstLabelInput.blur()
    await expect(page.getByText('Navigation label updated')).toBeVisible({ timeout: 15_000 })
  })

  test('sidebar link appears after seed', async ({ page }) => {
    await page.goto('/dashboard')
    await expectPageLoaded(page)
    await expect(page.getByRole('link', { name: 'Navigation Management' })).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Navigation management access control', () => {
  test('system_admin cannot access admin-mgmt routes', async ({ page }) => {
    test.skip(test.info().project.name !== 'admin-system_admin')
    await page.goto('/admin-mgmt/navigation-management')
    await expect(page.getByTestId('navigation-management-page')).not.toBeVisible({ timeout: 10_000 })
  })
})
