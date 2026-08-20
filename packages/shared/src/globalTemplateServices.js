import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'
import { needsPublishForTarget, isRecordUuid } from './globalTemplateUtils.js'
export {
  emptyFieldPayloadRow,
  syncStatusLabel,
  syncStatusLabelForTarget,
  needsPublishForTarget,
  isRecordUuid,
  globalTemplateUrlKey,
  globalTemplateDetailPath,
  globalTemplateFormPath,
} from './globalTemplateUtils.js'

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export async function fetchGlobalTemplates() {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  return db
    .from('global_template_library')
    .select('*')
    .neq('record_status', 'history')
    .order('name', { ascending: true })
}

export async function fetchGlobalTemplateById(idOrDisplayId) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const key = String(idOrDisplayId || '').trim()
  if (!key) return { data: null, error: 'Missing template id' }

  let query = db.from('global_template_library').select('*')
  if (isRecordUuid(key)) {
    query = query.eq('id', key)
  } else {
    query = query.eq('display_id', key)
  }
  return query.neq('record_status', 'history').maybeSingle()
}

export async function fetchGlobalTemplateVersions(templateId) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  return db
    .from('global_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false })
}

export async function createGlobalTemplate(data) {
  const domain = data.domain || 'fields'
  const objectDomains = new Set([
    'industry_plan', 'legacy_document', 'structured_list',
    'form_template', 'opa', 'process_template',
    'portfolio_template', 'programme_template', 'project_template',
  ])
  const defaultPayload = objectDomains.has(domain) ? {} : []
  return rpc('create_global_template', {
    p_domain: domain,
    p_name: data.name,
    p_description: data.description || null,
    p_category: data.category || null,
    p_methodology: data.methodology || null,
    p_payload: data.payload ?? defaultPayload,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateGlobalTemplate(templateId, data) {
  return rpc('update_global_template', {
    p_template_id: templateId,
    p_name: data.name ?? null,
    p_description: data.description ?? null,
    p_category: data.category !== undefined ? (data.category || '') : null,
    p_methodology: data.methodology !== undefined ? (data.methodology || '') : null,
    p_payload: data.payload ?? null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function archiveGlobalTemplate(templateId) {
  return rpc('archive_global_template', {
    p_template_id: templateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

/**
 * @param {string} templateId
 * @param {string|null} notes
 * @param {'platform'|'simulator'|'both'} [target='both']
 */
export async function publishGlobalTemplate(templateId, notes = null, target = 'both') {
  return rpc('publish_global_template', {
    p_template_id: templateId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_notes: notes,
    p_target: target || 'both',
  })
}

/**
 * Publish live Global Templates downstream.
 * @param {{ domain?: string|null, forceAll?: boolean, notes?: string, target?: 'platform'|'simulator'|'both' }} [opts]
 */
export async function publishAllGlobalTemplates({
  domain = null,
  forceAll = false,
  notes = 'Bulk publish from Global Template Library',
  target = 'both',
} = {}) {
  const { data: rows, error } = await fetchGlobalTemplates()
  if (error) return { data: null, error: error.message || String(error) }

  const publishTarget = target || 'both'
  const list = (rows || []).filter((row) => {
    if (row.record_status !== 'live') return false
    if (domain && row.domain !== domain) return false
    if (forceAll) return true
    return needsPublishForTarget(row, publishTarget)
  })

  let published = 0
  const failures = []
  /** Stop bulk loop when the same schema/RPC fault would repeat for every row. */
  const isStructuralPublishError = (msg) => {
    const text = String(msg || '').toLowerCase()
    return (
      text.includes('does not exist')
      || text.includes('could not choose the best candidate function')
      || text.includes('permission denied')
      || text.includes('admin user is required')
      || text.includes('publish notes are required')
      // Level-template domain_ref collision until v795 is applied
      || text.includes('uq_pm_template_nodes_current_scope')
    )
  }

  for (const row of list) {
    const { error: pubErr } = await publishGlobalTemplate(row.id, notes, publishTarget)
    if (pubErr) {
      failures.push({ id: row.id, name: row.name, error: pubErr })
      if (isStructuralPublishError(pubErr)) {
        const remaining = list.length - published - failures.length
        return {
          data: {
            attempted: list.length,
            published,
            failed: failures.length + Math.max(remaining, 0),
            failures,
            aborted: true,
            target: publishTarget,
          },
          error: pubErr,
        }
      }
    } else {
      published += 1
    }
  }

  return {
    data: {
      attempted: list.length,
      published,
      failed: failures.length,
      failures,
      target: publishTarget,
    },
    error: failures.length && published === 0
      ? (failures[0].error || 'Publish failed')
      : null,
  }
}

/** Platform catalog vs Admin library gap for industry_plan domain. */
export async function fetchIndustryPlanCatalogSyncStatus() {
  return rpc('industry_plan_catalog_sync_status', {
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

/**
 * Insert missing industry_plan Global Templates from public.pmo_industry_templates
 * and publish unsynced rows (Admin v170).
 */
export async function syncIndustryPlanTemplatesFromCatalog(notes = null) {
  return rpc('sync_industry_plan_templates_from_catalog', {
    p_admin_user_id: await getCurrentAdminUserId(),
    p_notes: notes,
  })
}
