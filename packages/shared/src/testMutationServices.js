import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export async function createTestRun(name, suites = null, role = null, trigger = 'manual') {
  return rpc('create_test_run', {
    p_name: name,
    p_suites: suites,
    p_role: role,
    p_trigger: trigger,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateTestRunStatus(runId, status, counts = {}) {
  return rpc('update_test_run_status', {
    p_run_id: runId,
    p_status: status,
    p_total: counts.total ?? null,
    p_passed: counts.passed ?? null,
    p_failed: counts.failed ?? null,
    p_skipped: counts.skipped ?? null,
    p_duration_ms: counts.durationMs ?? null,
  })
}

export async function createFixPattern(payload) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.from('test_fix_patterns').insert({
    pattern_name: payload.patternName,
    error_regex: payload.errorRegex,
    error_category: payload.errorCategory,
    fix_strategy: payload.fixStrategy,
    fix_config: payload.fixConfig || {},
    confidence: payload.confidence || 'medium',
    auto_apply: payload.autoApply !== false,
    is_active: true,
  }).select('id').single()
  return { data, error: error?.message || error || null }
}

export async function updateFixPattern(id, payload) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.from('test_fix_patterns').update({
    pattern_name: payload.patternName,
    error_regex: payload.errorRegex,
    error_category: payload.errorCategory,
    fix_strategy: payload.fixStrategy,
    fix_config: payload.fixConfig,
    confidence: payload.confidence,
    auto_apply: payload.autoApply,
    is_active: payload.isActive,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('id').single()
  return { data, error: error?.message || error || null }
}

export async function toggleFixPatternAutoApply(id, autoApply) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.from('test_fix_patterns')
    .update({ auto_apply: autoApply, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single()
  return { data, error: error?.message || error || null }
}

export const CLI_COMMANDS = {
  all: 'pnpm test:e2e',
  admin: 'pnpm test:e2e:admin',
  platform: 'pnpm test:e2e:platform',
  simulator: 'pnpm test:e2e:simulator',
  cross: 'pnpm test:e2e:cross',
  access: 'pnpm test:e2e:access',
}
