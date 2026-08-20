import { test, expect } from '../../fixtures/auth.js'
import { getAdminClient } from '../../helpers/api-client.js'
import { expectPageLoaded, expectToast } from '../../helpers/page-assertions.js'

test.describe('Errors — dashboard release readiness', () => {
  test.use({ storageState: '.auth/admin_super_admin.json' })

  const OPEN_STATUSES = ['new', 'acknowledged', 'investigating', 'recurring']

  let aggregationId = null
  let errorHash = null
  // The readiness banner is a global signal (all open errors across the
  // system), not scoped to this test's seeded row — if other blocking
  // errors already exist independently of this test, resolving our one
  // seeded row won't flip the banner to "ready". Snapshot that baseline so
  // the final assertion doesn't assume exclusive control over shared state.
  let baselineBlocked = false

  test.beforeAll(async () => {
    test.skip(test.info().project.name !== 'admin-super_admin', 'Requires super_admin auth project')

    const db = getAdminClient()
    if (!db) test.skip(true, 'Admin database client not configured')

    const { data: thresholdRow } = await db
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'errors.release_gate_severity_threshold')
      .maybeSingle()
    const thresholdSeverities = String(thresholdRow?.setting_value || 'critical')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const { count: baselineCount } = await db
      .from('error_aggregations')
      .select('id', { count: 'exact', head: true })
      .in('status', OPEN_STATUSES)
      .in('severity', thresholdSeverities)
    baselineBlocked = (baselineCount || 0) > 0

    errorHash = `e2e-readiness-${Date.now()}`
    const now = new Date().toISOString()

    const { data, error } = await db
      .from('error_aggregations')
      .insert({
        error_hash: errorHash,
        error_type: 'E2EReadinessTest',
        error_message: 'Synthetic critical error for release readiness e2e',
        status: 'new',
        severity: 'critical',
        system: 'admin',
        occurrence_count: 1,
        affected_user_count: 0,
        first_seen_at: now,
        last_seen_at: now,
      })
      .select('id')
      .single()

    if (error) {
      throw new Error(`Failed to seed error aggregation: ${error.message}`)
    }
    aggregationId = data?.id
  })

  test.afterAll(async () => {
    const db = getAdminClient()
    if (!db || !aggregationId) return
    await db.from('error_aggregations').delete().eq('id', aggregationId)
  })

  test('blocked banner then resolve clears readiness', async ({ page }) => {
    test.skip(test.info().project.name !== 'admin-super_admin')
    test.skip(!aggregationId, 'No seeded error aggregation')

    await page.goto('/errors/error-dashboard')
    await expectPageLoaded(page)

    const banner = page.getByTestId('release-readiness-banner')
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await expect(banner).toHaveAttribute('data-release-ready', 'false')
    await expect(banner).toContainText(/not release ready/i)

    await page.goto(`/errors/error-detail?id=${aggregationId}`)
    await expectPageLoaded(page)

    await page.locator('select').first().selectOption('resolved')
    await page.getByRole('button', { name: /save status/i }).click()

    await expectToast(page, 'Error status updated')
    await expect(page.locator('body')).not.toContainText(/permission denied.*errors\.edit/i)

    await page.goto('/errors/error-dashboard')
    await expectPageLoaded(page)

    if (baselineBlocked) {
      // Other errors already blocked release independently of this test —
      // the banner will legitimately stay "blocked" for those unrelated
      // reasons. Just confirm this test's own row was actually resolved.
      const db = getAdminClient()
      const { data: row } = await db.from('error_aggregations').select('status').eq('id', aggregationId).single()
      expect(row.status).toBe('resolved')
    } else {
      await expect(banner).toHaveAttribute('data-release-ready', 'true', { timeout: 15_000 })
      await expect(banner).toContainText(/release ready/i)
    }
  })
})
