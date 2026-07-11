import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { adminDb, publicDb } from '../services/supabase/adminClient.js'
import { hasPermission } from '@nidus-admin/shared'
import { verifyTotpCode, verifyBackupCode, getTotpSecret } from '../services/twoFactorService.js'

const AdminAuthContext = createContext(null)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

const STATUS_MESSAGES = {
  pending_activation: 'Your account is not yet activated. Contact the Super Admin.',
  rejected: 'Your account access has been denied.',
  suspended: 'Your account has been suspended. Contact the Super Admin.',
  deactivated: 'Your account access has been denied.',
}

export function AdminAuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [pending2FA, setPending2FA] = useState(false)
  const [needs2FASetup, setNeeds2FASetup] = useState(false)
  const lastActivity = useRef(Date.now())

  const loadAdminProfile = useCallback(async (authUserId) => {
    const { data, error } = await adminDb
      .from('admin_users')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null

    const { data: perms } = await adminDb
      .from('role_permissions')
      .select('permission_key')
      .eq('role', data.role)
    setPermissions((perms || []).map((p) => p.permission_key))
    setAdminUser(data)
    if (data.activation_status === 'active' && data.requires_2fa && !data.is_2fa_configured) {
      setNeeds2FASetup(true)
    }
    return data
  }, [])

  useEffect(() => {
    if (!adminDb) {
      setLoading(false)
      return
    }
    adminDb.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          await loadAdminProfile(session.user.id)
        } catch {
          await adminDb.auth.signOut()
        }
      }
      setLoading(false)
    })
    const { data: { subscription } } = adminDb.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) await loadAdminProfile(session.user.id)
      else {
        setAdminUser(null)
        setPermissions([])
      }
    })
    return () => subscription.unsubscribe()
  }, [loadAdminProfile])

  useEffect(() => {
    const interval = setInterval(() => {
      if (adminUser && Date.now() - lastActivity.current > SESSION_TIMEOUT_MS) {
        logout()
      }
    }, 60000)
    const bump = () => { lastActivity.current = Date.now() }
    window.addEventListener('click', bump)
    window.addEventListener('keydown', bump)
    return () => {
      clearInterval(interval)
      window.removeEventListener('click', bump)
      window.removeEventListener('keydown', bump)
    }
  }, [adminUser])

  const checkActivation = async (email) => {
    const { data, error } = await adminDb.rpc('validate_admin_login', { p_email: email })
    if (error) return { ok: false, message: 'Invalid credentials' }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.activation_status) return { ok: false, message: 'Invalid credentials' }
    if (row.activation_status !== 'active') {
      return { ok: false, message: STATUS_MESSAGES[row.activation_status] || 'Access denied' }
    }
    return { ok: true, role: row.role }
  }

  const login = async (email, password) => {
    const activation = await checkActivation(email)
    if (!activation.ok) return { error: activation.message }

    const { data, error } = await adminDb.auth.signInWithPassword({ email, password })
    if (error) {
      await adminDb.rpc('record_login_attempt', { p_email: email, p_ip: null, p_success: false })
      return { error: 'Invalid credentials' }
    }
    await adminDb.rpc('record_login_attempt', { p_email: email, p_ip: null, p_success: true })
    const profile = await loadAdminProfile(data.user.id)
    if (profile?.requires_2fa && profile?.is_2fa_configured) {
      setPending2FA(true)
      return { requires2FA: true }
    }
    if (profile?.requires_2fa && !profile?.is_2fa_configured) {
      setNeeds2FASetup(true)
      return { needs2FASetup: true }
    }
    return { success: true }
  }

  const verify2FA = async (code) => {
    if (!adminUser) return { error: 'Session expired' }
    const secret = await getTotpSecret(adminUser.id)
    const valid = secret && await verifyTotpCode(secret, code)
    const backupOk = !valid && await verifyBackupCode(adminUser.id, code)
    if (!valid && !backupOk) return { error: 'Invalid authentication code' }
    setPending2FA(false)
    return { success: true }
  }

  const logout = async () => {
    if (adminUser) {
      await adminDb.from('admin_audit_log').insert({
        admin_user_id: adminUser.id,
        admin_role: adminUser.role,
        action: 'auth.logout',
      })
    }
    await adminDb?.auth.signOut()
    setAdminUser(null)
    setPermissions([])
    setPending2FA(false)
    setNeeds2FASetup(false)
  }

  const checkPermission = (key) => hasPermission(adminUser?.role, permissions, key)

  const value = {
    adminUser,
    role: adminUser?.role,
    permissions,
    activationStatus: adminUser?.activation_status,
    loading,
    pending2FA,
    needs2FASetup,
    isAuthenticated: !!adminUser && adminUser.activation_status === 'active' && !pending2FA && !needs2FASetup,
    login,
    verify2FA,
    logout,
    hasPermission: checkPermission,
  }

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}

export default AdminAuthContext
