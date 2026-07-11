import { adminDb } from './supabase/adminClient.js'

export async function getPendingActivations() {
  return adminDb.from('admin_users').select('*').eq('activation_status', 'pending_activation').order('created_at', { ascending: false })
}

export async function activateAdmin(adminUserId, activatedBy) {
  const { data, error } = await adminDb.from('admin_users').update({
    activation_status: 'active',
    activated_by: activatedBy,
    activated_at: new Date().toISOString(),
  }).eq('id', adminUserId).select().single()
  if (error) throw error
  await adminDb.rpc('log_admin_action', {
    p_admin_user_id: activatedBy,
    p_action: 'admins.activate',
    p_target_type: 'admin_user',
    p_target_id: adminUserId,
  })
  return data
}

export async function rejectAdmin(adminUserId, reason, rejectedBy) {
  return adminDb.from('admin_users').update({
    activation_status: 'rejected',
    rejection_reason: reason,
  }).eq('id', adminUserId)
}

export async function suspendAdmin(adminUserId, reason) {
  await adminDb.from('admin_sessions').update({ is_active: false, ended_at: new Date().toISOString() }).eq('admin_user_id', adminUserId)
  return adminDb.from('admin_users').update({ activation_status: 'suspended', suspended_reason: reason }).eq('id', adminUserId)
}
