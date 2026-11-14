/**
 * Admin plan v217 (monorepo v1341, D20 / D21 / D30) — consolidated role menu placements and the
 * per-organisation switch. Every call goes through the public.admin_* RPCs in SQL v249
 * (permissions system.menu_placements.view / .edit; writes need a reason and are audited).
 * The acting admin comes from the session — no admin id is sent from the client.
 */
import { getPublicDb } from './supabase.js'

async function rpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

/** Placement keys and the role each one stands for (same keys as the CHECK in monorepo SQL v1449). */
export const PLACEMENT_KEY_LABELS = {
  pm: 'Project Manager',
  team: 'Team Lead / Team Manager',
  team_member: 'Team Member',
  programme: 'Programme Manager',
  portfolio: 'Portfolio Manager',
  pmo_oversight: 'PMO Admin / Account Owner',
  pmo_organisation: 'PMO Organisation zone',
  executive: 'Executive',
  sponsor: 'Project Sponsor',
  board: 'Project Board Member',
  assurance: 'Project Assurance',
  qa: 'Quality Assurance',
  change_authority: 'Change Authority',
  stakeholder: 'Stakeholder',
  viewer: 'Viewer',
}

export const MENU_APPS = { platform: 'Platform', simulator: 'Simulator' }

export const fetchMenuSections = async (app) => {
  const { data, error } = await rpc('admin_list_menu_sections', { p_app: app })
  return { data: data || [], error }
}

export const fetchMenuSlots = async (app) => {
  const { data, error } = await rpc('admin_list_menu_slots', { p_app: app })
  return { data: data || [], error }
}

export const fetchMenuPlacements = async (placementKey) => {
  const { data, error } = await rpc('admin_list_menu_placements', { p_placement_key: placementKey })
  return { data: data || [], error }
}

export const searchMenuItemsForPlacement = async (search) => {
  const { data, error } = await rpc('admin_search_menu_items', { p_search: search || '' })
  return { data: data || [], error }
}

export const fetchAccountMenuSettings = async () => {
  const { data, error } = await rpc('admin_list_account_menu_settings')
  return { data: data || [], error }
}

export const upsertMenuSection = ({ app, sectionCode, label, icon, sortOrder, overflowLabel, isActive }, reason) =>
  rpc('admin_upsert_menu_section', {
    p_app: app, p_section_code: sectionCode, p_label: label, p_icon: icon || null, p_sort_order: Number(sortOrder) || 0,
    p_overflow_label: overflowLabel || null, p_is_active: isActive !== false, p_reason: reason,
  })

export const upsertMenuSlot = ({ app, slotKey, label, sectionCode, sortOrder, isActive }, reason) =>
  rpc('admin_upsert_menu_slot', {
    p_app: app, p_slot_key: slotKey, p_label: label, p_section_code: sectionCode, p_sort_order: Number(sortOrder) || 0,
    p_is_active: isActive !== false, p_reason: reason,
  })

export const upsertMenuPlacement = ({ menuItemId, placementKey, sectionCode, parentMenuItemId, slotKey, sortOrder, scope, isActive }, reason) =>
  rpc('admin_upsert_menu_placement', {
    p_menu_item_id: menuItemId, p_placement_key: placementKey, p_section_code: sectionCode,
    p_parent_menu_item_id: parentMenuItemId || null, p_slot_key: slotKey || null, p_sort_order: Number(sortOrder) || 0,
    p_scope: scope || 'project', p_is_active: isActive !== false, p_reason: reason,
  })

export const deleteMenuPlacement = (placementId, reason) =>
  rpc('admin_delete_menu_placement', { p_placement_id: placementId, p_reason: reason })

export const setMenuItemDefaultSection = (menuItemId, sectionCode, reason) =>
  rpc('admin_set_menu_item_default_section', { p_menu_item_id: menuItemId, p_section_code: sectionCode || null, p_reason: reason })

export const setAccountConsolidatedMenu = (accountId, enabled, reason) =>
  rpc('admin_set_account_consolidated_menu', { p_account_id: accountId, p_enabled: !!enabled, p_reason: reason })

export const setConsolidatedMenuForAll = (enabled, reason) =>
  rpc('admin_set_consolidated_menu_all', { p_enabled: !!enabled, p_reason: reason })

/** Pure: placement rows grouped by section, in sidebar order. Exported for tests. */
export function groupPlacementsBySection(rows = [], sections = []) {
  const order = new Map((sections || []).map((s, i) => [s.section_code, s.is_footer ? 1000 + i : i]))
  const groups = new Map()
  for (const r of rows || []) {
    if (!groups.has(r.section_code)) groups.set(r.section_code, [])
    groups.get(r.section_code).push(r)
  }
  return [...groups.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
    .map(([sectionCode, items]) => ({
      sectionCode,
      label: (sections || []).find((s) => s.section_code === sectionCode)?.label || sectionCode,
      items: [...items].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)),
    }))
}
