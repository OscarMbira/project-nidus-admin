import { useCallback } from 'react'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import { adminDb } from '../services/supabase/adminClient.js'

export function useAuditLog() {
  const { adminUser } = useAdminAuth()

  const logAction = useCallback(async ({ action, targetType, targetId, previousValue, newValue, targetDetails }) => {
    if (!adminUser || !adminDb) return
    await adminDb.from('admin_audit_log').insert({
      admin_user_id: adminUser.id,
      admin_role: adminUser.role,
      action,
      target_type: targetType,
      target_id: targetId,
      previous_value: previousValue,
      new_value: newValue,
      target_details: targetDetails,
    })
  }, [adminUser])

  return { logAction }
}
