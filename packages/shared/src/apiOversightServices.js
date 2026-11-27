/**
 * Admin v260 / monorepo v1356 — Public API oversight RPCs.
 * Permissions: system.api.view / system.api.edit. Reason required and audited.
 */
import { getPublicDb } from './supabase.js'

async function rpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export const listApiCredentials = (accountId, reason) =>
  rpc('admin_api_list_credentials', { p_account_id: accountId || null, p_reason: reason })

export const revokeApiCredential = (credentialId, reason) =>
  rpc('admin_api_revoke_credential', { p_credential_id: credentialId, p_reason: reason })

export const setApiPlanLimits = (planId, patch, reason) =>
  rpc('admin_api_set_plan_limits', {
    p_plan_id: planId,
    p_api_enabled: patch.api_enabled ?? null,
    p_scim_enabled: patch.scim_enabled ?? null,
    p_api_rate_per_minute: patch.api_rate_per_minute ?? null,
    p_api_rate_per_day: patch.api_rate_per_day ?? null,
    p_scim_rate_per_minute: patch.scim_rate_per_minute ?? null,
    p_reason: reason,
  })

export const apiUsageSummary = (days, reason) =>
  rpc('admin_api_usage_summary', { p_days: days || 7, p_reason: reason })
