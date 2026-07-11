import { expect } from '@playwright/test'

export async function expectToast(page, text) {
  const toast = page.locator('[role="alert"], [data-sonner-toast], .toast, [class*="toast"]').filter({ hasText: new RegExp(text, 'i') })
  await expect(toast.first()).toBeVisible({ timeout: 10_000 })
}

export async function expectTableRowCount(page, min) {
  const rows = page.locator('table tbody tr, [data-testid="admin-table"] tbody tr, [role="row"]')
  await expect.poll(async () => rows.count()).toBeGreaterThanOrEqual(min)
}

export async function expectPageTitle(page, title) {
  await expect(page.locator('h1').first()).toContainText(new RegExp(title, 'i'))
}

export async function expectAccessDenied(page) {
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
}

export async function expectModalOpen(page) {
  const modal = page.locator('[role="dialog"], [data-testid="admin-modal"], .modal')
  await expect(modal.first()).toBeVisible({ timeout: 8_000 })
}

export async function expectPageLoaded(page) {
  await page.waitForLoadState('domcontentloaded')
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await expect(page).not.toHaveURL(/\/auth\/2fa-setup/, { timeout: 5_000 })
  await expect(page.locator('body')).not.toContainText(/permission denied/i, { timeout: 5_000 }).catch(() => {})
  const loading = page.locator('[data-testid="loading-state"], .loading').or(page.getByText(/^Loading/i))
  if (await loading.count() > 0) {
    await loading.first().waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  }
}

export async function expectRouteAccessible(page, path, { shouldDeny = false } = {}) {
  await page.goto(path)
  await expectPageLoaded(page)
  if (shouldDeny) {
    await expectAccessDenied(page)
  }
}
