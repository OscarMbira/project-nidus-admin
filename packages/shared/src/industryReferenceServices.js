/**
 * Admin CRUD for monorepo-owned industry/professional-role reference data (v918 Phase 8).
 * industry_categories, industry_segments, industry_packs, industry_pack_menu_items, and
 * professional_roles all live in the shared Supabase project's `public` schema (not admin) —
 * reads go straight to public via getPublicDb(); writes go through the public-schema RPCs in
 * SQL/v208_industry_reference_admin_rpcs.sql, each internally gated by
 * admin.check_admin_permission('system.industries.edit').
 */
import { getPublicDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

async function publicRpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

async function publicSelect(table, select, { order, filters } = {}) {
  const db = getPublicDb()
  if (!db) return { data: [], error: 'Database not configured' }
  let query = db.from(table).select(select)
  if (filters) {
    for (const f of filters) {
      if (f.op === 'eq') query = query.eq(f.col, f.val)
      else if (f.op === 'in') query = query.in(f.col, f.val)
      else if (f.op === 'ilike') query = query.ilike(f.col, f.val)
    }
  }
  if (order?.column) query = query.order(order.column, { ascending: order.asc !== false })
  const { data, error } = await query
  return { data: data || [], error: error?.message || error || null }
}

// ─── Professional Roles ────────────────────────────────────────────────────

export const fetchProfessionalRoles = () =>
  publicSelect('professional_roles', '*', { order: { column: 'display_order' } })

export const fetchProfessionalRoleById = async (id) => {
  const { data, error } = await publicSelect('professional_roles', '*', { filters: [{ op: 'eq', col: 'id', val: id }] })
  if (error) return { data: null, error }
  return { data: data?.[0] || null, error: null }
}

export const createProfessionalRole = async (data) =>
  publicRpc('admin_create_professional_role', {
    p_role_code: data.role_code,
    p_role_label: data.role_label,
    p_description: data.description || null,
    p_display_order: data.display_order ?? 0,
    p_admin_user_id: await getCurrentAdminUserId(),
  })

export const updateProfessionalRole = async (id, data) =>
  publicRpc('admin_update_professional_role', {
    p_id: id,
    p_role_code: data.role_code ?? null,
    p_role_label: data.role_label ?? null,
    p_description: data.description ?? null,
    p_display_order: data.display_order ?? null,
    p_is_active: data.is_active ?? null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })

export const deactivateProfessionalRole = async (id) =>
  publicRpc('admin_deactivate_professional_role', { p_id: id, p_admin_user_id: await getCurrentAdminUserId() })

// ─── Industry Categories ───────────────────────────────────────────────────

export const fetchIndustryCategories = () =>
  publicSelect('industry_categories', '*', { order: { column: 'name' } })

export const fetchIndustryCategoryById = async (id) => {
  const { data, error } = await publicSelect('industry_categories', '*', { filters: [{ op: 'eq', col: 'id', val: id }] })
  if (error) return { data: null, error }
  return { data: data?.[0] || null, error: null }
}

export const createIndustryCategory = async (data) =>
  publicRpc('admin_create_industry_category', {
    p_name: data.name,
    p_is_active: data.is_active ?? true,
    p_admin_user_id: await getCurrentAdminUserId(),
  })

export const updateIndustryCategory = async (id, data) =>
  publicRpc('admin_update_industry_category', {
    p_id: id,
    p_name: data.name ?? null,
    p_is_active: data.is_active ?? null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })

export const deactivateIndustryCategory = async (id) =>
  publicRpc('admin_deactivate_industry_category', { p_id: id, p_admin_user_id: await getCurrentAdminUserId() })

// ─── Industry Segments ──────────────────────────────────────────────────────

export const fetchIndustrySegments = () =>
  publicSelect('industry_segments', '*, industry_categories(name)', { order: { column: 'display_order' } })

export const fetchIndustrySegmentById = async (id) => {
  const { data, error } = await publicSelect('industry_segments', '*, industry_categories(name)', { filters: [{ op: 'eq', col: 'id', val: id }] })
  if (error) return { data: null, error }
  return { data: data?.[0] || null, error: null }
}

export const createIndustrySegment = async (data) =>
  publicRpc('admin_create_industry_segment', {
    p_industry_category_id: data.industry_category_id,
    p_name: data.name,
    p_description: data.description || null,
    p_display_order: data.display_order ?? 0,
    p_admin_user_id: await getCurrentAdminUserId(),
  })

export const updateIndustrySegment = async (id, data) =>
  publicRpc('admin_update_industry_segment', {
    p_id: id,
    p_name: data.name ?? null,
    p_description: data.description ?? null,
    p_display_order: data.display_order ?? null,
    p_is_active: data.is_active ?? null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })

export const deactivateIndustrySegment = async (id) =>
  publicRpc('admin_deactivate_industry_segment', { p_id: id, p_admin_user_id: await getCurrentAdminUserId() })

// ─── Industry Packs ─────────────────────────────────────────────────────────

export const fetchIndustryPacks = () =>
  publicSelect('industry_packs', '*, industry_categories(name)', { order: { column: 'pack_name' } })

export const fetchIndustryPackById = async (id) => {
  const { data, error } = await publicSelect('industry_packs', '*, industry_categories(name)', { filters: [{ op: 'eq', col: 'id', val: id }] })
  if (error) return { data: null, error }
  return { data: data?.[0] || null, error: null }
}

export const createIndustryPack = async (data) =>
  publicRpc('admin_create_industry_pack', {
    p_industry_category_id: data.industry_category_id,
    p_pack_code: data.pack_code,
    p_pack_name: data.pack_name,
    p_description: data.description || null,
    p_is_active: data.is_active ?? true,
    p_admin_user_id: await getCurrentAdminUserId(),
  })

export const updateIndustryPack = async (id, data) =>
  publicRpc('admin_update_industry_pack', {
    p_id: id,
    p_pack_name: data.pack_name ?? null,
    p_description: data.description ?? null,
    p_is_active: data.is_active ?? null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })

export const deactivateIndustryPack = async (id) =>
  publicRpc('admin_deactivate_industry_pack', { p_id: id, p_admin_user_id: await getCurrentAdminUserId() })

// ─── Industry Pack <-> Menu Items ──────────────────────────────────────────

export const fetchIndustryPackMenuItems = (industryPackId) =>
  publicSelect('industry_pack_menu_items', 'id, menu_item_id, menu_items(id, menu_label, route_path)', {
    filters: [{ op: 'eq', col: 'industry_pack_id', val: industryPackId }],
  })

/** Platform's full menu tree (public.menu_items), for the pack curation picker. */
export const fetchAllMenuItemsForPicker = () =>
  publicSelect('menu_items', 'id, menu_label, route_path, parent_menu_id', {
    filters: [{ op: 'eq', col: 'is_deleted', val: false }],
    order: { column: 'menu_label' },
  })

export const setIndustryPackMenuItems = async (industryPackId, menuItemIds) =>
  publicRpc('admin_set_industry_pack_menu_items', {
    p_industry_pack_id: industryPackId,
    p_menu_item_ids: menuItemIds,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
