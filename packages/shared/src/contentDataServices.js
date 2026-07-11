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
