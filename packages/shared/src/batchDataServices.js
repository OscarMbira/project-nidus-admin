import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const clean = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) clean[key] = value
  }
  const { data, error } = await db.rpc(fn, clean)
  return { data, error: error?.message || error || null }
}

export async function fetchBatchJobs(opts = {}) {
  return rpc('get_batch_jobs', {
    p_status: opts.status || undefined,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function fetchBatchJobDetail(jobId) {
  return rpc('get_batch_job_detail', {
    p_job_id: jobId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createBatchJob(jobType, parameters, recordIds, recordLabels = []) {
  return rpc('create_batch_job', {
    p_job_type: jobType,
    p_parameters: parameters || {},
    p_record_ids: recordIds || [],
    p_record_labels: recordLabels || [],
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateBatchJobItem(jobId, itemId, status, errorMessage = null) {
  return rpc('update_batch_job_item', {
    p_job_id: jobId,
    p_item_id: itemId,
    p_status: status,
    p_error_message: errorMessage,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function completeBatchJob(jobId) {
  return rpc('complete_batch_job', {
    p_job_id: jobId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function cancelBatchJob(jobId) {
  return rpc('cancel_batch_job', {
    p_job_id: jobId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function processBatchJobChunk(jobId, chunkSize = 50) {
  return rpc('process_batch_job_chunk', {
    p_job_id: jobId,
    p_chunk_size: chunkSize,
  })
}
