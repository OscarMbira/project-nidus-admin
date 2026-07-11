import { test, expect } from '@playwright/test'
import crypto from 'crypto'
import { getAdminClient } from '../../helpers/api-client.js'

const TEST_TABLE = 'admin.documentation_guides'
const TEST_ABBREV = 'TID'

async function getSuperAdminUserId(db) {
  const { data } = await db
    .from('admin_users')
    .select('id')
    .eq('role', 'super_admin')
    .eq('activation_status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function ensureTestRule(db, adminUserId, config = {}) {
  const { data: existing } = await db
    .from('id_generation_rules')
    .select('id')
    .eq('target_table', TEST_TABLE)
    .eq('is_active', true)
    .maybeSingle()

  if (existing?.id) {
    await db.rpc('update_id_generation_rule', {
      p_rule_id: existing.id,
      p_target_table: TEST_TABLE,
      p_table_abbreviation: TEST_ABBREV,
      p_table_description: '[E2E] ID generation concurrency test rule',
      p_separator: '-',
      p_suffix: '',
      p_letter_case: 'uppercase',
      p_segment_type: config.segment_type ?? 'alpha',
      p_num_letters: config.num_letters ?? 1,
      p_num_digits: config.num_digits ?? 0,
      p_excluded_chars: config.excluded_chars ?? '',
      p_seed_value: 1,
      p_is_active: true,
      p_admin_user_id: adminUserId,
    })
    return existing.id
  }

  const { data: ruleId, error } = await db.rpc('create_id_generation_rule', {
    p_target_table: TEST_TABLE,
    p_table_abbreviation: TEST_ABBREV,
    p_table_description: '[E2E] ID generation concurrency test rule',
    p_separator: '-',
    p_suffix: '',
    p_letter_case: 'uppercase',
    p_segment_type: config.segment_type ?? 'alpha',
    p_num_letters: config.num_letters ?? 1,
    p_num_digits: config.num_digits ?? 0,
    p_excluded_chars: config.excluded_chars ?? '',
    p_seed_value: 1,
    p_is_active: true,
    p_admin_user_id: adminUserId,
  })

  if (error) throw new Error(error.message)
  return ruleId
}

async function cleanupGeneratedIds(db, recordIds) {
  if (!recordIds.length) return
  await db.from('generated_ids').delete().in('record_id', recordIds)
}

async function snapshotGeneratedIds(db) {
  const { data } = await db
    .from('generated_ids')
    .select('*')
    .eq('target_table', TEST_TABLE)
  return data || []
}

async function restoreGeneratedIds(db, rows) {
  if (!rows.length) return
  await db.from('generated_ids').insert(rows)
}

async function snapshotExistingRule(db) {
  const { data } = await db
    .from('id_generation_rules')
    .select('*')
    .eq('target_table', TEST_TABLE)
    .eq('is_active', true)
    .maybeSingle()
  return data || null
}

async function restoreRule(db, adminUserId, originalRule) {
  const { data: current } = await db
    .from('id_generation_rules')
    .select('id')
    .eq('target_table', TEST_TABLE)
    .eq('is_active', true)
    .maybeSingle()

  if (!current?.id) return

  if (originalRule) {
    // Restore the rule that existed before this suite ran, so the real
    // table's ID format isn't left saturated by the tiny test keyspaces.
    await db.rpc('update_id_generation_rule', {
      p_rule_id: current.id,
      p_target_table: originalRule.target_table,
      p_table_abbreviation: originalRule.table_abbreviation,
      p_table_description: originalRule.table_description,
      p_separator: originalRule.separator,
      p_suffix: originalRule.suffix,
      p_letter_case: originalRule.letter_case,
      p_segment_type: originalRule.segment_type,
      p_num_letters: originalRule.num_letters,
      p_num_digits: originalRule.num_digits,
      p_excluded_chars: originalRule.excluded_chars,
      p_seed_value: originalRule.seed_value,
      p_is_active: originalRule.is_active,
      p_admin_user_id: adminUserId,
    })
  } else {
    // No rule existed for this table before the suite ran — remove the
    // one the suite created rather than leaving it behind.
    await db.rpc('delete_id_generation_rule', {
      p_rule_id: current.id,
      p_admin_user_id: adminUserId,
    })
  }
}

test.describe('ID generation concurrency safeguards', () => {
  let originalRule = null
  let snapshotTaken = false

  test.beforeAll(async () => {
    const db = getAdminClient()
    if (!db) return
    originalRule = await snapshotExistingRule(db)
    snapshotTaken = true
  })

  test.afterAll(async () => {
    const db = getAdminClient()
    if (!db || !snapshotTaken) return
    const adminUserId = await getSuperAdminUserId(db)
    if (!adminUserId) return
    await restoreRule(db, adminUserId, originalRule)
  })

  test('concurrent same-record calls dedupe to one generated_ids row', async () => {
    const db = getAdminClient()
    test.skip(!db, 'Admin Supabase client not configured')

    const adminUserId = await getSuperAdminUserId(db)
    test.skip(!adminUserId, 'No active super_admin user for RPC calls')

    await ensureTestRule(db, adminUserId, { segment_type: 'alpha', num_letters: 3, num_digits: 0 })

    const recordId = crypto.randomUUID()
    const [first, second] = await Promise.all([
      db.rpc('generate_display_id', { p_table: TEST_TABLE, p_record_id: recordId }),
      db.rpc('generate_display_id', { p_table: TEST_TABLE, p_record_id: recordId }),
    ])

    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect(first.data).toBeTruthy()
    expect(first.data).toBe(second.data)

    const { data: rows } = await db
      .from('generated_ids')
      .select('display_id')
      .eq('target_table', TEST_TABLE)
      .eq('record_id', recordId)

    expect(rows).toHaveLength(1)
    await cleanupGeneratedIds(db, [recordId])
  })

  test('concurrent different-record calls stay unique under collision pressure', async () => {
    const db = getAdminClient()
    test.skip(!db, 'Admin Supabase client not configured')

    const adminUserId = await getSuperAdminUserId(db)
    test.skip(!adminUserId, 'No active super_admin user for RPC calls')

    await ensureTestRule(db, adminUserId, { segment_type: 'alpha', num_letters: 2, num_digits: 0 })

    const recordIds = Array.from({ length: 50 }, () => crypto.randomUUID())
    const results = await Promise.all(
      recordIds.map((recordId) => db.rpc('generate_display_id', {
        p_table: TEST_TABLE,
        p_record_id: recordId,
      })),
    )

    for (const result of results) {
      expect(result.error).toBeNull()
      expect(result.data).toBeTruthy()
    }

    const displayIds = results.map((result) => result.data)
    expect(new Set(displayIds).size).toBe(displayIds.length)

    await cleanupGeneratedIds(db, recordIds)
  })

  test('exhausted keyspace surfaces ID_KEYSPACE_EXHAUSTED error', async () => {
    const db = getAdminClient()
    test.skip(!db, 'Admin Supabase client not configured')

    const adminUserId = await getSuperAdminUserId(db)
    test.skip(!adminUserId, 'No active super_admin user for RPC calls')

    const { data: capacityRows, error: capacityError } = await db.rpc('preview_id_generation_capacity', {
      p_target_table: TEST_TABLE,
      p_num_letters: 0,
      p_num_digits: 1,
      p_letter_case: 'uppercase',
      p_excluded_chars: '',
      p_segment_type: 'numeric',
    })
    test.skip(capacityError, capacityError?.message || 'Capacity preview unavailable')
    const tableRows = Number(capacityRows?.[0]?.table_row_count ?? 0)
    test.skip(tableRows > 10, `Table row count (${tableRows}) exceeds 1-digit numeric keyspace`)

    // Force a deterministic clean slate for the exhaustion scenario without
    // discarding any real generated_ids rows — snapshot and restore instead
    // of deleting outright.
    const preExisting = await snapshotGeneratedIds(db)
    if (preExisting.length) {
      await db.from('generated_ids').delete().eq('target_table', TEST_TABLE)
    }

    try {
      await ensureTestRule(db, adminUserId, { segment_type: 'numeric', num_letters: 0, num_digits: 1 })

      const recordIds = []
      let exhaustionError = null

      for (let i = 0; i < 12; i += 1) {
        const recordId = crypto.randomUUID()
        recordIds.push(recordId)
        const { data, error } = await db.rpc('generate_display_id', {
          p_table: TEST_TABLE,
          p_record_id: recordId,
        })

        if (error) {
          exhaustionError = error.message
          recordIds.pop()
          break
        }
        expect(data).toBeTruthy()
      }

      expect(exhaustionError).toContain('ID_KEYSPACE_EXHAUSTED:')
      await cleanupGeneratedIds(db, recordIds)
    } finally {
      if (preExisting.length) {
        await restoreGeneratedIds(db, preExisting)
      }
    }
  })
})
