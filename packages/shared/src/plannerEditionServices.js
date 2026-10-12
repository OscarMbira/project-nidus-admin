/**
 * v211 (monorepo v1239 Slice 8.4) — Admin controls for the Project Planner edition.
 * Writes go through the SECURITY DEFINER RPCs in SQL/v227_planner_edition_admin_rpc.sql
 * (permissions accounts.edition.change / system.planner_menu.edit, audited). The acting admin
 * comes from the session — no admin id is sent from the client.
 */
import { getPublicDb } from './supabase.js'

async function rpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export const EDITION_LABELS = { platform: 'Full PMIS', planner: 'Project Planner' }

export const changeAccountEdition = (accountId, edition, reason) =>
  rpc('admin_change_account_edition', { p_account_id: accountId, p_edition: edition, p_reason: reason })

export const fetchPlannerMenuItems = async () => {
  const { data, error } = await rpc('admin_list_planner_menu_items')
  return { data: data || [], error }
}

export const setMenuPlannerAvailable = (menuItemId, available, reason) =>
  rpc('admin_set_menu_planner_available', { p_menu_item_id: menuItemId, p_available: !!available, p_reason: reason })

/** Edition filter used by the Organisations list. Pure; exported for tests. */
export function filterByEdition(rows, edition) {
  if (!edition || edition === 'all') return rows
  return (rows || []).filter((r) => (r.product_edition || 'platform') === edition)
}
