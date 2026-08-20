import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

/**
 * List completed (submitted) form instances for a Global Template on Platform or Simulator.
 * Requires content.global_templates.export_completed permission (enforced in RPC).
 * @param {string} globalTemplateId
 * @param {'platform'|'simulator'} target
 */
export async function fetchCompletedFormInstances(globalTemplateId, target) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('list_completed_form_instances', {
    p_global_template_id: globalTemplateId,
    p_target: target,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
  return { data: data || [], error: error?.message || error || null }
}

/**
 * Fetch export-ready values for one completed form instance.
 * @param {string} formInstanceId
 * @param {'platform'|'simulator'} target
 */
export async function fetchCompletedFormInstanceData(formInstanceId, target) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_completed_form_instance', {
    p_form_instance_id: formInstanceId,
    p_target: target,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
  return { data: data || null, error: error?.message || error || null }
}
