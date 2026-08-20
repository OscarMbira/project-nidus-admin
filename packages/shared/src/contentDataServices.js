import { getAdminDb, getPublicDb } from './supabase.js'

export const fetchDocumentationGuides = (opts = {}) => {
  const db = getPublicDb()
  if (!db) return Promise.resolve({ data: [], error: null })
  let query = db
    .from('documentation_guides')
    .select('id, guide_id, title, file_name, category, module, system, sort_order, is_active, updated_at')
    .order('system')
    .order('sort_order')
  if (opts.system && opts.system !== 'all') {
    query = query.eq('system', opts.system)
  }
  return query
}

export const fetchHelpArticles = () => {
  const db = getPublicDb()
  if (!db) return Promise.resolve({ data: [], error: null })
  return db
    .from('help_articles')
    .select('id, title, slug, excerpt, role, methodology, featured, is_published, sort_order, view_count, created_at')
    .eq('is_deleted', false)
    .order('sort_order')
}

export const fetchGuidedTours = () => {
  const db = getPublicDb()
  if (!db) return Promise.resolve({ data: [], error: null })
  return db
    .from('guided_tours')
    .select('id, tour_name, tour_key, description, target_role, target_page, trigger_type, is_active, created_at')
    .eq('is_deleted', false)
    .order('tour_name')
}

export const fetchPwaSettings = () => {
  const db = getAdminDb()
  if (!db) return Promise.resolve({ data: [], error: null })
  return db
    .from('pwa_settings')
    .select('*')
    .eq('is_active', true)
    .order('target_system')
}

export const fetchRoleMenuConfig = () => {
  const db = getPublicDb()
  if (!db) return Promise.resolve({ data: [], error: null })
  return db
    .from('role_menu_items')
    .select(`
      id,
      can_view,
      can_use,
      is_active,
      roles ( role_name, role_display_name ),
      menu_items ( menu_code, menu_label, route_path, menu_level )
    `)
    .eq('is_deleted', false)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(500)
}

/** Active Platform roles for searchable selects (Global Template Roles tab, etc.). */
let _activeRolesCache = null
let _activeRolesPromise = null

export function clearActivePublicRolesCache() {
  _activeRolesCache = null
  _activeRolesPromise = null
}

/**
 * @returns {Promise<{ data: Array<{ id: string, role_name: string, role_display_name: string, role_description: string|null }>, error: Error|null }>}
 */
export async function fetchActivePublicRoles() {
  if (_activeRolesCache) return { data: _activeRolesCache, error: null }
  if (_activeRolesPromise) return _activeRolesPromise

  _activeRolesPromise = (async () => {
    const db = getPublicDb()
    if (!db) return { data: [], error: null }
    const { data, error } = await db
      .from('roles')
      .select('id, role_name, role_display_name, role_description')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('role_display_name', { ascending: true })
    if (error) {
      _activeRolesPromise = null
      return { data: [], error }
    }
    _activeRolesCache = data || []
    return { data: _activeRolesCache, error: null }
  })()

  return _activeRolesPromise
}

/** Active system risk categories for searchable selects (Global Template Risks tab). */
let _riskCategoryCache = null
let _riskCategoryPromise = null

export function clearRiskCategoryOptionsCache() {
  _riskCategoryCache = null
  _riskCategoryPromise = null
}

/**
 * @returns {Promise<{ data: Array<{ category_code: string, category_name: string, category_description?: string|null, display_order?: number }>, error: Error|null }>}
 */
export async function fetchRiskCategoryOptions() {
  if (_riskCategoryCache) return { data: _riskCategoryCache, error: null }
  if (_riskCategoryPromise) return _riskCategoryPromise

  _riskCategoryPromise = (async () => {
    const db = getPublicDb()
    if (!db) return { data: [], error: null }

    const { data: rpcData, error: rpcError } = await db.rpc('list_risk_category_options')
    if (!rpcError && Array.isArray(rpcData) && rpcData.length) {
      _riskCategoryCache = rpcData
      return { data: _riskCategoryCache, error: null }
    }

    // Fallback: direct table read (system rows organisation_id IS NULL)
    const { data, error } = await db
      .from('risk_categories')
      .select('category_code, category_name, category_description, display_order')
      .is('organisation_id', null)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      _riskCategoryPromise = null
      return { data: [], error: rpcError || error }
    }
    _riskCategoryCache = data || []
    return { data: _riskCategoryCache, error: null }
  })()

  return _riskCategoryPromise
}
