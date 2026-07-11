import { adminDb } from './supabase/adminClient.js'

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createInvitation({ email, role, customMessage, invitedBy }) {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  const { data, error } = await adminDb.from('admin_invitations').insert({
    token,
    email,
    target_role: role,
    custom_message: customMessage,
    invited_by: invitedBy,
    expires_at: expiresAt,
  }).select().single()
  if (error) throw error
  return data
}

export async function validateToken(token) {
  const { data, error } = await adminDb
    .from('admin_invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  return data
}

export async function revokeInvitation(id, reason) {
  return adminDb.from('admin_invitations').update({
    status: 'revoked',
    revoked_at: new Date().toISOString(),
    revoked_reason: reason,
  }).eq('id', id)
}

export async function getActiveInvitations() {
  return adminDb.from('admin_invitations').select('*').eq('status', 'pending').gt('expires_at', new Date().toISOString())
}
