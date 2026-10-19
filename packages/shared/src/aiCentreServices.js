/**
 * AI Centre (monorepo v1272) — AI Centre: Admin controls for Ask Nidus and the AI agents.
 * Every call goes through the SECURITY DEFINER RPCs in SQL/v236 (settings, plans, organisations,
 * usage), SQL/v237 (data catalogue, AI languages), SQL/v238 (meaning search queue) and SQL/v239 (Simulator AI authoring). Each RPC checks an ai.* permission and is
 * audited; the acting admin comes from the session — no admin id is sent from the client.
 */
import { getPublicDb } from './supabase.js'

async function rpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

// ── Settings / models ──────────────────────────────────────────────────────
export const fetchAiSettings = () => rpc('admin_ai_get_settings')
export const updateAiSettings = (changes, reason) => rpc('admin_ai_update_settings', { p_changes: changes, p_reason: reason })

// ── Plans & credits ────────────────────────────────────────────────────────
export const fetchAiPlans = () => rpc('admin_ai_list_plans')
export const setAiPlanCredits = (planId, credits, reason) =>
  rpc('admin_ai_set_plan_credits', { p_plan_id: planId, p_credits: credits, p_reason: reason })
export const setAiPlannerCredits = (planCode, credits, reason) =>
  rpc('admin_ai_set_planner_credits', { p_plan_code: planCode, p_credits: credits, p_reason: reason })
export const setAiSimulatorCredits = (planType, credits, reason) =>
  rpc('admin_ai_set_simulator_credits', { p_plan_type: planType, p_credits: credits, p_reason: reason })

// ── Organisations ──────────────────────────────────────────────────────────
export const fetchAiOrganisations = async (search = null) => {
  const { data, error } = await rpc('admin_ai_list_organisations', { p_search: search || null })
  return { data: data || [], error }
}

/** Organisation by account code (friendly URL, Admin rule 13.1) or account id. */
export async function fetchAiOrganisation(codeOrId) {
  const { data, error } = await fetchAiOrganisations(null)
  if (error) return { data: null, error }
  const key = String(codeOrId || '').toLowerCase()
  const row = data.find((r) => String(r.account_code || '').toLowerCase() === key || r.account_id === codeOrId)
  return { data: row || null, error: row ? null : 'Organisation not found' }
}

export const updateAiOrganisation = (accountId, values, reason) =>
  rpc('admin_ai_update_organisation', {
    p_account_id: accountId,
    p_admin_ai_disabled: Boolean(values.admin_ai_disabled),
    p_admin_disabled_reason: values.admin_disabled_reason || null,
    p_credit_allowance_override: values.credit_allowance_override === '' || values.credit_allowance_override == null
      ? null : Number(values.credit_allowance_override),
    p_retention_admin_override: Boolean(values.retention_admin_override),
    p_conversation_retention_months: values.retention_admin_override ? Number(values.conversation_retention_months) : null,
    p_audit_retention_months: values.retention_admin_override ? Number(values.audit_retention_months) : null,
    p_reason: reason,
  })

export const addAiCredits = (accountId, credits, entryType, note) =>
  rpc('admin_ai_add_credits', { p_account_id: accountId, p_credits: Number(credits), p_entry_type: entryType, p_note: note })

// ── Usage ──────────────────────────────────────────────────────────────────
export const fetchAiUsageSummary = (days = 30) => rpc('admin_ai_usage_summary', { p_days: days })
export const fetchAiRuns = async (filter = {}) => {
  const clean = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== '' && v != null))
  const { data, error } = await rpc('admin_ai_list_runs', { p_filter: clean })
  return { data: data || [], error }
}

// ── Data catalogue / languages ─────────────────────────────────────────────
export const fetchAiCatalogue = async (schema = 'public') => {
  const { data, error } = await rpc('admin_ai_list_catalogue', { p_schema: schema })
  return { data: data || [], error }
}
export const updateAiCatalogueEntity = (schema, entityKey, changes, reason) =>
  rpc('admin_ai_update_catalogue_entity', { p_schema: schema, p_entity_key: entityKey, p_changes: changes, p_reason: reason })
export const upsertAiCatalogueField = (schema, entityKey, field, reason) =>
  rpc('admin_ai_upsert_catalogue_field', { p_schema: schema, p_entity_key: entityKey, p_field: field, p_reason: reason })
export const fetchAiLanguages = async () => {
  const { data, error } = await rpc('admin_ai_list_languages')
  return { data: data || [], error }
}
export const setAiLanguageSupported = (code, supported, reason) =>
  rpc('admin_ai_set_language_ai_supported', { p_code: code, p_supported: Boolean(supported), p_reason: reason })

// ── Meaning search (Admin SQL v238) ─────────────────────────────────────────
export const fetchAiEmbeddingStats = () => rpc('admin_ai_embedding_stats')
export const fetchAiEmbeddingFailures = async (schema = 'public', limit = 200) => {
  const { data, error } = await rpc('admin_ai_embedding_failures', { p_schema: schema, p_limit: limit })
  return { data: data || [], error }
}
export const reembedAi = (schema, accountId, failedOnly, reason) =>
  rpc('admin_ai_reembed', { p_schema: schema, p_account_id: accountId || null, p_failed_only: Boolean(failedOnly), p_reason: reason })

// ── Simulator AI authoring (Admin SQL v239) ─────────────────────────────────
export const fetchSimAiScenarios = async () => {
  const { data, error } = await rpc('admin_sim_ai_list_scenarios')
  return { data: data || [], error }
}
export const fetchSimAiScenario = (scenarioId) => rpc('admin_sim_ai_get_scenario', { p_scenario_id: scenarioId })
export const upsertSimAiCriterion = (scenarioId, criterion, reason) =>
  rpc('admin_sim_ai_upsert_criterion', { p_scenario_id: scenarioId, p_criterion: criterion, p_reason: reason })
export const updateSimAiScenario = (scenarioId, changes, reason) =>
  rpc('admin_sim_ai_update_scenario', { p_scenario_id: scenarioId, p_changes: changes, p_reason: reason })
export const calibrateSimAiAssessment = (assessmentId, levels, notes) =>
  rpc('admin_sim_ai_calibrate', { p_assessment_id: assessmentId, p_levels: levels, p_notes: notes || null })
export const reviewSimAiFlag = (flagId, status, note) => rpc('admin_sim_ai_review_flag', { p_flag_id: flagId, p_status: status, p_note: note })
export const fetchSimAiPersonas = async () => {
  const { data, error } = await rpc('admin_sim_ai_list_personas')
  return { data: data || [], error }
}
export const updateSimAiPersona = (npcId, changes, reason) => rpc('admin_sim_ai_update_persona', { p_npc_id: npcId, p_changes: changes, p_reason: reason })

/** A rubric criterion is complete when it has a key, title, positive weight and four described levels. */
export function validateRubricCriterion(c) {
  const e = {}
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(String(c?.criterion_key || ''))) e.criterion_key = 'lower_snake_case, 2–41 characters.'
  if (!String(c?.title || '').trim()) e.title = 'A title is required.'
  if (!(Number(c?.weight) > 0)) e.weight = 'More than 0.'
  const levels = Array.isArray(c?.levels) ? c.levels : []
  if (levels.length !== 4 || levels.some((l) => !String(l?.descriptor || '').trim())) e.levels = 'Describe all four levels.'
  return e
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

/** Share of the period's allowance used, 0–100+ (null when there is no allowance). */
export function aiUsagePercent(row) {
  const allowance = Number(row?.allowance) || 0
  if (allowance <= 0) return null
  return Math.round(((Number(row?.used) || 0) / allowance) * 100)
}

/** Status label for an organisation row: off / no notice / admin disabled / at limit / on. */
export function aiOrgState(row) {
  if (row?.admin_ai_disabled) return 'disabled'
  if (!row?.consent_accepted_at) return 'no_notice'
  if (!row?.ai_enabled) return 'off'
  const pct = aiUsagePercent(row)
  if (pct != null && pct >= 100) return 'at_limit'
  return 'on'
}

/** Model routing is valid when every routed model is approved and every approved model has a price. */
export function validateModelRouting(s) {
  const errors = {}
  const approved = (s?.approved_models || []).filter(Boolean)
  if (!approved.length) errors.approved_models = 'Add at least one approved model.'
  for (const key of ['model_routing', 'model_quick', 'model_agent']) {
    if (!s?.[key]) errors[key] = 'Choose a model.'
    else if (!approved.includes(s[key])) errors[key] = 'Must be an approved model.'
  }
  for (const m of approved) {
    const p = s?.model_prices?.[m]
    if (!p || !(Number(p.input) >= 0) || !(Number(p.output) >= 0) || p.input === '' || p.output === '') {
      errors[`price:${m}`] = 'Enter input and output prices.'
    }
  }
  return errors
}

/** Retention / limits settings validation. */
export function validateAiSettings(s) {
  const errors = {}
  const int = (v) => Number.isInteger(Number(v)) && String(v).trim() !== ''
  const min = Number(s?.retention_min_months), max = Number(s?.retention_max_months)
  if (!int(s?.retention_min_months) || min < 1) errors.retention_min_months = 'At least 1 month.'
  if (!int(s?.retention_max_months) || max < min) errors.retention_max_months = 'Must be at least the minimum.'
  for (const k of ['conversation_retention_months', 'audit_retention_months']) {
    const v = Number(s?.[k])
    if (!int(s?.[k]) || v < min || v > max) errors[k] = `Between ${min || 1} and ${max || 60} months.`
  }
  const wp = Number(s?.warn_percent)
  if (!int(s?.warn_percent) || wp < 1 || wp > 99) errors.warn_percent = 'Between 1 and 99.'
  if (!(Number(s?.credit_unit_usd) > 0)) errors.credit_unit_usd = 'Must be more than 0.'
  for (const k of ['default_trial_credits', 'max_agent_iterations', 'query_row_cap', 'query_timeout_ms']) {
    if (!int(s?.[k]) || Number(s[k]) < (k === 'default_trial_credits' ? 0 : 1)) errors[k] = 'Enter a whole number.'
  }
  if (s?.kill_switch && !String(s?.kill_switch_reason || '').trim()) errors.kill_switch_reason = 'Say why AI is switched off.'
  return errors
}
