import { getAdminDb, getPublicDb } from './supabase.js'

export async function fetchCancellationRequests(filters = {}) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('admin_fetch_cancellation_requests', {
    p_limit: filters.limit ?? 200,
    p_offset: filters.offset ?? 0,
    p_reason_category_id: filters.reasonCategoryId ?? null,
    p_target_system: filters.targetSystem && filters.targetSystem !== 'all' ? filters.targetSystem : null,
    p_from_date: filters.fromDate ?? null,
    p_to_date: filters.toDate ?? null,
  })
  return { data: data || [], error: error?.message || error || null }
}

export async function fetchCancellationTrends(days = 30) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('admin_get_cancellation_trends', { p_days: days })
  return { data: data || [], error: error?.message || error || null }
}

export async function fetchCancellationCategoriesAdmin() {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('admin_fetch_cancellation_categories')
  return { data: data || [], error: error?.message || error || null }
}

export async function fetchActiveCancellationCategories() {
  const db = getPublicDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('fetch_active_cancellation_categories')
  return { data: data || [], error: error?.message || error || null }
}
