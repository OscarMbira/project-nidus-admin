import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

const SUSPENSION_BUCKET = 'admin-user-suspensions'
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_FILES = 5

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export async function uploadSuspensionAttachments(userId, files = []) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  if (!files.length) return { data: [], error: null }
  if (files.length > MAX_FILES) {
    return { data: null, error: `You can attach up to ${MAX_FILES} files.` }
  }

  const uploaded = []
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return { data: null, error: `${file.name} exceeds the 10 MB limit.` }
    }
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return { data: null, error: `${file.name} has an unsupported file type.` }
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${userId}/${Date.now()}-${safeName}`
    const { error } = await db.storage.from(SUSPENSION_BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) return { data: null, error: error.message || String(error) }

    uploaded.push({
      name: file.name,
      path,
      mime_type: file.type || null,
      size: file.size,
    })
  }

  return { data: uploaded, error: null }
}

export async function suspendPlatformUser(userId, options) {
  const payload = typeof options === 'string'
    ? { reason: options }
    : (options || {})

  const {
    reason,
    suspensionType = 'standard',
    investigationStart = null,
    investigationEnd = null,
    attachments = [],
  } = payload

  let attachmentMeta = attachments
  if (Array.isArray(attachments) && attachments[0] instanceof File) {
    const { data, error } = await uploadSuspensionAttachments(userId, attachments)
    if (error) return { data: null, error }
    attachmentMeta = data
  }

  return rpc('suspend_platform_user', {
    p_user_id: userId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason,
    p_suspension_type: suspensionType,
    p_investigation_start: investigationStart || null,
    p_investigation_end: investigationEnd || null,
    p_attachments: attachmentMeta,
  })
}
