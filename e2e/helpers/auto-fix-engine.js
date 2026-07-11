import { getAdminClient, recordTestResult } from './api-client.js'

const DEFAULT_PATTERNS = [
  { regex: /no rows.*currencies|currency.*not found/i, category: 'missing_data', strategy: 'seed_missing_record', confidence: 'high', autoApply: true },
  { regex: /Permission denied|permission.*required/i, category: 'permission_denied', strategy: 'grant_permission', confidence: 'high', autoApply: true },
  { regex: /duplicate key|already exists|unique.*violation/i, category: 'stale_state', strategy: 'clear_stale_data', confidence: 'high', autoApply: true },
  { regex: /session.*expired|401|unauthorized|login.*redirect/i, category: 'session_expired', strategy: 'refresh_auth', confidence: 'high', autoApply: true },
  { regex: /timeout.*exceeded|navigation.*timeout/i, category: 'timeout', strategy: 'increase_timeout', confidence: 'high', autoApply: true },
  { regex: /required|cannot be empty|must provide/i, category: 'validation_error', strategy: 'adjust_factory_data', confidence: 'medium', autoApply: true },
  { regex: /violates foreign key/i, category: 'db_constraint', strategy: 'seed_dependency', confidence: 'medium', autoApply: true },
  { regex: /violates check constraint/i, category: 'db_constraint', strategy: 'adjust_factory_data', confidence: 'medium', autoApply: true },
  { regex: /waiting for selector|locator.*0 elements/i, category: 'element_not_found', strategy: 'flag_selector_change', confidence: 'low', autoApply: false },
]

export function classifyError(errorMessage, dbPatterns = []) {
  const msg = String(errorMessage || '')
  const patterns = [...dbPatterns, ...DEFAULT_PATTERNS]
  for (const p of patterns) {
    const regex = p.error_regex ? new RegExp(p.error_regex, 'i') : p.regex
    if (regex.test(msg)) {
      return {
        category: p.error_category || p.category,
        strategy: p.fix_strategy || p.strategy,
        pattern: p.error_regex || p.regex?.source || p.pattern_name,
        confidence: p.confidence || 'medium',
        autoApply: p.auto_apply ?? p.autoApply ?? false,
        fixConfig: p.fix_config || p.fixConfig || {},
      }
    }
  }
  return { category: 'unknown', strategy: 'flag_for_review', pattern: '.*', confidence: 'low', autoApply: false, fixConfig: {} }
}

export async function loadFixPatterns() {
  const db = getAdminClient()
  if (!db) return []
  const { data } = await db.from('test_fix_patterns').select('*').eq('is_active', true)
  return data || []
}

export async function recordAutoFixAttempt(runId, resultId, classification, description, actions = []) {
  const db = getAdminClient()
  if (!db) return null
  const { data, error } = await db.rpc('record_auto_fix', {
    p_result_id: resultId,
    p_run_id: runId,
    p_category: classification.category,
    p_pattern: classification.pattern,
    p_strategy: classification.strategy,
    p_description: description,
    p_actions: actions,
    p_confidence: classification.confidence,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function applyFix(classification, context = {}) {
  const actions = []
  switch (classification.strategy) {
    case 'clear_stale_data':
      actions.push({ type: 'clear_stale_data', detail: 'Remove [TEST] tagged records', tag: '[TEST]' })
      break
    case 'increase_timeout':
      actions.push({ type: 'increase_timeout', detail: 'Retry with 2x timeout', factor: 2 })
      break
    case 'refresh_auth':
      actions.push({ type: 'refresh_auth', detail: 'Re-authenticate role', role: context.role })
      break
    case 'seed_missing_record':
      actions.push({ type: 'seed_missing_record', detail: 'Re-seed required data', config: classification.fixConfig })
      break
    case 'grant_permission':
      actions.push({ type: 'grant_permission', detail: 'Grant missing permission mapping' })
      break
    case 'adjust_factory_data':
      actions.push({ type: 'adjust_factory_data', detail: 'Regenerate factory data with valid constraints' })
      break
    case 'flag_selector_change':
    case 'flag_for_review':
    default:
      actions.push({ type: 'flag_for_review', detail: 'Manual review required' })
      break
  }
  return actions
}

export async function handleTestFailure({ runId, caseId, error, role, retryFn }) {
  const dbPatterns = await loadFixPatterns()
  const classification = classifyError(error?.message || String(error), dbPatterns)
  const resultId = await recordTestResult(runId, {
    caseId,
    status: 'failed',
    error: error?.message || String(error),
    errorStack: error?.stack || null,
  })

  if (!classification.autoApply) {
    await recordAutoFixAttempt(runId, resultId, classification, 'Flagged for manual review — auto-apply disabled', [])
    return { fixed: false, resultId }
  }

  const actions = await applyFix(classification, { role })
  const fixId = await recordAutoFixAttempt(runId, resultId, classification, `Applied ${classification.strategy}`, actions)

  if (typeof retryFn === 'function') {
    try {
      await retryFn()
      const retryResultId = await recordTestResult(runId, { caseId, status: 'passed' })
      const db = getAdminClient()
      if (db && fixId) {
        await db.rpc('update_auto_fix_result', {
          p_fix_id: fixId,
          p_retry_result_id: retryResultId,
          p_retry_passed: true,
        })
      }
      return { fixed: true, resultId: retryResultId }
    } catch (retryError) {
      const db = getAdminClient()
      if (db && fixId) {
        const retryResultId = await recordTestResult(runId, {
          caseId,
          status: 'failed',
          error: retryError?.message || String(retryError),
        })
        await db.rpc('update_auto_fix_result', {
          p_fix_id: fixId,
          p_retry_result_id: retryResultId,
          p_retry_passed: false,
        })
      }
      return { fixed: false, resultId }
    }
  }

  return { fixed: false, resultId }
}
