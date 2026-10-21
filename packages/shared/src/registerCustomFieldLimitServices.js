/**
 * v216 (monorepo v1311) — Admin controls for the Local Register custom-field limit.
 * Reads/writes go through the SECURITY DEFINER RPCs in SQL/v242 (permissions
 * system.register_custom_fields.view / .edit, reason required, audited). The acting admin comes
 * from the session — no admin id is sent from the client.
 */
import { getPublicDb } from './supabase.js'

async function rpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export const REGISTER_CUSTOM_FIELD_LIMIT_MIN = 1
export const REGISTER_CUSTOM_FIELD_LIMIT_MAX = 200

export const fetchRegisterCustomFieldLimits = async () => {
  const { data, error } = await rpc('admin_register_custom_field_get_settings')
  return { data: data || { default_limit: 30, overrides: [] }, error }
}

export const searchOrganisationsForCustomFieldLimit = async (search) => {
  const { data, error } = await rpc('admin_register_custom_field_search_accounts', { p_search: search || '' })
  return { data: data || [], error }
}

export const setRegisterCustomFieldDefaultLimit = (limit, reason) =>
  rpc('admin_register_custom_field_set_default', { p_limit: Number(limit), p_reason: reason })

export const setRegisterCustomFieldOverride = (accountId, limit, reason) =>
  rpc('admin_register_custom_field_set_override', { p_account_id: accountId, p_limit: Number(limit), p_reason: reason })

export const removeRegisterCustomFieldOverride = (accountId, reason) =>
  rpc('admin_register_custom_field_remove_override', { p_account_id: accountId, p_reason: reason })

/** Whole number within the allowed range. Pure; exported for tests. */
export function isValidCustomFieldLimit(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= REGISTER_CUSTOM_FIELD_LIMIT_MIN && n <= REGISTER_CUSTOM_FIELD_LIMIT_MAX
}
