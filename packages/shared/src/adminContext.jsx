import { useState, useEffect, useCallback } from 'react'
import { getAdminDb } from './supabase.js'
import { hasPermission } from './permissions.js'

let cachedState = null
let inflightFetch = null
let authListenerAttached = false

export function clearAdminContextCache() {
  cachedState = null
  inflightFetch = null
}

function attachAuthCacheInvalidation() {
  if (authListenerAttached) return
  const db = getAdminDb()
  if (!db) return
  authListenerAttached = true
  db.auth.onAuthStateChange(() => {
    clearAdminContextCache()
  })
}

export async function fetchAdminContext() {
  if (cachedState) return cachedState
  if (inflightFetch) return inflightFetch

  attachAuthCacheInvalidation()

  inflightFetch = (async () => {
    const db = getAdminDb()
    if (!db) {
      cachedState = { adminUser: null, permissions: [] }
      return cachedState
    }

    const { data: { session } } = await db.auth.getSession()
    if (!session?.user) {
      cachedState = { adminUser: null, permissions: [] }
      return cachedState
    }

    const { data } = await db
      .from('admin_users')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()

    if (!data) {
      cachedState = { adminUser: null, permissions: [] }
      return cachedState
    }

    const { data: perms } = await db
      .from('role_permissions')
      .select('permission_key')
      .eq('role', data.role)

    cachedState = {
      adminUser: data,
      permissions: (perms || []).map((p) => p.permission_key),
    }
    return cachedState
  })()

  try {
    return await inflightFetch
  } finally {
    inflightFetch = null
  }
}

export async function getCurrentAdminUserId() {
  const db = getAdminDb()
  if (!db) return null
  const { data: { session } } = await db.auth.getSession()
  if (!session?.user) return null
  const ctx = await fetchAdminContext()
  return ctx.adminUser?.id ?? null
}

export function useCurrentAdmin() {
  const [state, setState] = useState(() => ({
    adminUser: cachedState?.adminUser ?? null,
    permissions: cachedState?.permissions ?? [],
    loading: !cachedState,
  }))

  const reload = useCallback(async () => {
    clearAdminContextCache()
    setState((prev) => ({ ...prev, loading: true }))
    const result = await fetchAdminContext()
    setState({ ...result, loading: false })
  }, [])

  useEffect(() => {
    let active = true
    fetchAdminContext().then((result) => {
      if (active) setState({ ...result, loading: false })
    })
    return () => { active = false }
  }, [])

  const checkPermission = useCallback(
    (key) => hasPermission(state.adminUser?.role, state.permissions, key),
    [state.adminUser?.role, state.permissions],
  )

  return {
    adminUser: state.adminUser,
    role: state.adminUser?.role,
    permissions: state.permissions,
    loading: state.loading,
    reload,
    hasPermission: checkPermission,
  }
}
