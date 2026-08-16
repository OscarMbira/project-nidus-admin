/**
 * Admin profile picture + signature management (v207 plan / monorepo v894 PRD).
 * Mirrors the monorepo's userAvatarService.js + the saved-signature functions in
 * processTemplateSignatoryService.js, but admin_users has no self-service direct-
 * UPDATE RLS path (every write in this repo goes through SECURITY DEFINER RPCs) —
 * see SQL/v207_admin_profile_avatar_and_signature.sql for update_own_avatar,
 * remove_own_avatar, save_own_signature, delete_own_signature.
 */

import { getAdminDb } from './supabase.js'

export const ADMIN_USER_AVATARS_BUCKET = 'admin-user-avatars'
export const ADMIN_USER_SIGNATURES_BUCKET = 'admin-user-signatures'
export const MAX_ADMIN_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB
export const ADMIN_AVATAR_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const ADMIN_SIGNATURE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']

function ok(data) {
  return { success: true, data }
}

function fail(error) {
  return { success: false, message: error?.message || String(error), error }
}

export function validateAdminAvatarFile(file) {
  if (!file) return 'No file selected.'
  if (!ADMIN_AVATAR_IMAGE_MIME_TYPES.includes(file.type)) {
    return `File type "${file.type || 'unknown'}" is not allowed — please upload a PNG, JPEG, GIF, or WEBP image.`
  }
  if (file.size > MAX_ADMIN_PROFILE_IMAGE_BYTES) {
    return `File is too large — max ${(MAX_ADMIN_PROFILE_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB.`
  }
  return null
}

export function validateAdminSignatureFile(file) {
  if (!file) return 'No file selected.'
  if (!ADMIN_SIGNATURE_IMAGE_MIME_TYPES.includes(file.type)) {
    return `File type "${file.type || 'unknown'}" is not allowed — please upload an image.`
  }
  if (file.size > MAX_ADMIN_PROFILE_IMAGE_BYTES) {
    return `File is too large — max ${(MAX_ADMIN_PROFILE_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB.`
  }
  return null
}

function fileExt(file) {
  const fromName = String(file?.name || '').split('.').pop()
  if (fromName && fromName.length <= 5) return fromName.toLowerCase()
  const fromType = String(file?.type || '').split('/').pop()
  return fromType || 'png'
}

async function currentAuthUserId(db) {
  const { data, error } = await db.auth.getUser()
  if (error || !data?.user?.id) throw new Error('Not signed in.')
  return data.user.id
}

/** Current admin's avatar storage path (or null). */
export async function getAdminAvatar() {
  try {
    const db = getAdminDb()
    const authUserId = await currentAuthUserId(db)
    const { data, error } = await db
      .from('admin_users')
      .select('avatar_url')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    if (error) throw error
    return ok(data?.avatar_url || null)
  } catch (error) {
    return fail(error)
  }
}

/** Upload a new avatar image and store its path via the update_own_avatar RPC. */
export async function saveAdminAvatar(file) {
  try {
    const db = getAdminDb()
    if (!file) throw new Error('File is required')
    const validationError = validateAdminAvatarFile(file)
    if (validationError) throw new Error(validationError)

    const authUserId = await currentAuthUserId(db)
    const ext = fileExt(file)
    const storagePath = `${authUserId}/avatar.${ext}`

    const { error: uploadError } = await db.storage
      .from(ADMIN_USER_AVATARS_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: true, contentType: file.type })
    if (uploadError) throw uploadError

    const { data, error } = await db.rpc('update_own_avatar', { p_avatar_path: storagePath })
    if (error) throw error
    return ok(data?.avatar_url || storagePath)
  } catch (error) {
    return fail(error)
  }
}

/** Remove the current admin's avatar (storage object + clears admin_users.avatar_url). */
export async function removeAdminAvatar() {
  try {
    const db = getAdminDb()
    const current = await getAdminAvatar()
    if (!current.success) throw new Error(current.message)

    if (current.data) {
      const { error: removeError } = await db.storage.from(ADMIN_USER_AVATARS_BUCKET).remove([current.data])
      if (removeError) throw removeError
    }

    const { error } = await db.rpc('remove_own_avatar')
    if (error) throw error
    return ok(null)
  } catch (error) {
    return fail(error)
  }
}

/** Signed URL for display — the bucket is private. */
export async function getAdminAvatarSignedUrl(storagePath, expiresInSeconds = 86400) {
  try {
    const db = getAdminDb()
    if (!storagePath) throw new Error('Storage path is required')
    const { data, error } = await db.storage
      .from(ADMIN_USER_AVATARS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds)
    if (error) throw error
    return ok(data.signedUrl)
  } catch (error) {
    return fail(error)
  }
}

/** Current admin's saved signature row (or null). */
export async function getAdminSavedSignature() {
  try {
    const db = getAdminDb()
    const authUserId = await currentAuthUserId(db)
    const { data, error } = await db
      .from('admin_user_signature_images')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    if (error) throw error
    return ok(data || null)
  } catch (error) {
    return fail(error)
  }
}

/** Upload a new signature image and save it via the save_own_signature RPC. */
export async function saveAdminSignatureImage(file) {
  try {
    const db = getAdminDb()
    if (!file) throw new Error('File is required')
    const validationError = validateAdminSignatureFile(file)
    if (validationError) throw new Error(validationError)

    const authUserId = await currentAuthUserId(db)
    const ext = fileExt(file)
    const storagePath = `${authUserId}/signature.${ext}`

    const { error: uploadError } = await db.storage
      .from(ADMIN_USER_SIGNATURES_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: true, contentType: file.type })
    if (uploadError) throw uploadError

    const { data, error } = await db.rpc('save_own_signature', {
      p_storage_path: storagePath,
      p_file_name: file.name,
      p_mime_type: file.type,
      p_file_size: file.size,
    })
    if (error) throw error
    return ok(data)
  } catch (error) {
    return fail(error)
  }
}

/** Remove the current admin's saved signature (storage object + row, via RPC). */
export async function deleteAdminSavedSignature() {
  try {
    const db = getAdminDb()
    const existing = await getAdminSavedSignature()
    if (!existing.success) throw new Error(existing.message)
    if (!existing.data) return ok(null)

    const { error: removeError } = await db.storage
      .from(existing.data.storage_bucket || ADMIN_USER_SIGNATURES_BUCKET)
      .remove([existing.data.storage_path])
    if (removeError) throw removeError

    const { error } = await db.rpc('delete_own_signature')
    if (error) throw error
    return ok(null)
  } catch (error) {
    return fail(error)
  }
}

/** Signed URL for the saved signature — the bucket is private. */
export async function getAdminSignatureSignedUrl(storagePath, expiresInSeconds = 86400) {
  try {
    const db = getAdminDb()
    if (!storagePath) throw new Error('Storage path is required')
    const { data, error } = await db.storage
      .from(ADMIN_USER_SIGNATURES_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds)
    if (error) throw error
    return ok(data.signedUrl)
  } catch (error) {
    return fail(error)
  }
}
