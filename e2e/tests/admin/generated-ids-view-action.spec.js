import { test, expect } from '../../fixtures/auth.js'
import { getAdminClient } from '../../helpers/api-client.js'
import { expectPageLoaded } from '../../helpers/page-assertions.js'

test.describe('System — Generated IDs view action', () => {
  test.use({ storageState: '.auth/admin_super_admin.json' })

  test('View user navigates to user detail', async ({ page }) => {
    test.skip(test.info().project.name !== 'admin-super_admin')

    const db = getAdminClient()
    const { data: generatedRow } = await db
      .from('generated_ids')
      .select('display_id, target_table, record_id')
      .eq('target_table', 'public.users')
      .limit(1)
      .maybeSingle()

    if (!generatedRow?.display_id) {
      test.skip(true, 'No public.users generated ID in database')
    }

    await page.goto(
      `/system/id-generated-list?table=public.users&search=${encodeURIComponent(generatedRow.display_id)}`,
    )
    await expectPageLoaded(page)

    const viewLink = page.getByRole('link', { name: /view user/i }).first()
    await viewLink.click()

    await page.waitForURL(/\/users\/user-detail/)
    expect(page.url()).toMatch(/id=/)
  })

  test('Unmapped table shows View unavailable', async ({ page }) => {
    test.skip(test.info().project.name !== 'admin-super_admin')

    const db = getAdminClient()
    const { data: generatedRow } = await db
      .from('generated_ids')
      .select('display_id, target_table')
      .eq('target_table', 'public.activity_logs')
      .limit(1)
      .maybeSingle()

    if (!generatedRow?.display_id) {
      test.skip(true, 'No public.activity_logs generated ID in database')
    }

    await page.goto(
      `/system/id-generated-list?table=${encodeURIComponent(generatedRow.target_table)}&search=${encodeURIComponent(generatedRow.display_id)}`,
    )
    await expectPageLoaded(page)

    await page.getByText('View unavailable').first().isVisible()
  })
})
