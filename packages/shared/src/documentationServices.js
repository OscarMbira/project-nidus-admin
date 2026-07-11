import { createClient } from '@supabase/supabase-js'
import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

const q = (client, table, select, opts = {}) => {
  if (!client) return Promise.resolve({ data: [], error: null })
  let query = client.from(table).select(select)
  if (opts.order?.column) {
    query = opts.order.asc === false
      ? query.order(opts.order.column, { ascending: false })
      : query.order(opts.order.column)
  }
  if (opts.limit) query = query.limit(opts.limit)
  if (opts.filters) {
    for (const f of opts.filters) {
      if (f.op === 'eq') query = query.eq(f.col, f.val)
      else if (f.op === 'ilike') query = query.ilike(f.col, f.val)
      else if (f.op === 'in') query = query.in(f.col, f.val)
    }
  }
  return query
}

const supabaseUrl = () => import.meta.env.VITE_ADMIN_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || ''

export const documentationStorageUrl = (module, fileName) => {
  const base = supabaseUrl().replace(/\/$/, '')
  return `${base}/storage/v1/object/public/documentation/admin/${module}/${fileName}`
}

export const evidenceStoragePath = (runId, fileName) =>
  `admin/${runId}/${fileName}`

export async function getDocumentationModules() {
  const db = getAdminDb()
  if (!db) return { data: [], error: null }
  const { data, error } = await db
    .from('documentation_guides')
    .select('module')
    .eq('is_active', true)
  if (error) return { data: [], error }
  const counts = {}
  for (const row of data || []) {
    counts[row.module] = (counts[row.module] || 0) + 1
  }
  return {
    data: Object.entries(counts).map(([module, guideCount]) => ({ module, guideCount })).sort((a, b) => a.module.localeCompare(b.module)),
    error: null,
  }
}

export const getDocumentationGuides = (module) =>
  q(getAdminDb(), 'documentation_guides', '*', {
    filters: [
      { op: 'eq', col: 'is_active', val: true },
      ...(module ? [{ op: 'eq', col: 'module', val: module }] : []),
    ],
    order: { column: 'sort_order' },
    limit: 500,
  })

export const getDocumentationGuideById = (guideId) =>
  q(getAdminDb(), 'documentation_guides', '*', {
    filters: [{ op: 'eq', col: 'guide_id', val: guideId }],
    limit: 1,
  }).then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export function getDocumentationCategories(guides) {
  const cats = new Set()
  for (const g of guides || []) {
    if (g.category) cats.add(g.category)
  }
  return [...cats].sort()
}

export async function loadDocumentationFile(fileName, module) {
  const url = documentationStorageUrl(module, fileName)
  try {
    const res = await fetch(url)
    if (res.ok) return { data: await res.text(), error: null, source: 'storage' }
  } catch {
    // fallback below
  }
  try {
    const res = await fetch(`/Documentation/${fileName}`)
    if (res.ok) return { data: await res.text(), error: null, source: 'local' }
  } catch {
    // ignore
  }
  return {
    data: `# ${fileName.replace(/_/g, ' ').replace(/\.md$/, '')}\n\nDocumentation content will appear here after the first CI sync or in-app save.`,
    error: null,
    source: 'placeholder',
  }
}

export async function searchDocumentationGuides(query) {
  const term = query?.trim()
  if (!term) return getDocumentationGuides()
  return q(getAdminDb(), 'documentation_guides', '*', {
    filters: [{ op: 'eq', col: 'is_active', val: true }],
    order: { column: 'title' },
    limit: 100,
  }).then(({ data, error }) => ({
    data: (data || []).filter(
      (g) =>
        g.title?.toLowerCase().includes(term.toLowerCase()) ||
        g.description?.toLowerCase().includes(term.toLowerCase()) ||
        g.module?.toLowerCase().includes(term.toLowerCase()),
    ),
    error,
  }))
}

async function adminRpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export async function upsertDocumentationGuide(payload) {
  return adminRpc('upsert_documentation_guide', {
    p_guide_id: payload.guide_id,
    p_title: payload.title,
    p_file_name: payload.file_name,
    p_module: payload.module,
    p_category: payload.category || null,
    p_description: payload.description || null,
    p_target_roles: payload.target_roles || null,
    p_sort_order: payload.sort_order ?? 0,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deactivateDocumentationGuide(guideId) {
  return adminRpc('deactivate_documentation_guide', {
    p_guide_id: guideId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function saveDocumentationToStorage(module, fileName, content) {
  const url = import.meta.env.VITE_ADMIN_SUPABASE_URL
  const key = import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY
  if (!url || !key) return { error: 'Supabase not configured' }
  const client = createClient(url, key, {
    auth: { storageKey: 'nidus-admin-auth', storage: window.sessionStorage },
  })
  const path = `admin/${module}/${fileName}`
  const { error } = await client.storage.from('documentation').upload(path, new Blob([content], { type: 'text/markdown' }), {
    upsert: true,
    contentType: 'text/markdown',
  })
  return { error: error?.message || error || null }
}

export async function deleteDocumentationFromStorage(module, fileName) {
  const url = import.meta.env.VITE_ADMIN_SUPABASE_URL
  const key = import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY
  if (!url || !key) return { error: 'Supabase not configured' }
  const client = createClient(url, key, {
    auth: { storageKey: 'nidus-admin-auth', storage: window.sessionStorage },
  })
  const { error } = await client.storage.from('documentation').remove([`admin/${module}/${fileName}`])
  return { error: error?.message || error || null }
}
