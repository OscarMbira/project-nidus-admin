import { createClient } from '@supabase/supabase-js'

function readRuntimeConfig() {
  const injected = globalThis.__NIDUS_ADMIN_SUPABASE__
  return {
    url: import.meta.env.VITE_ADMIN_SUPABASE_URL || injected?.url || '',
    key: import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY || injected?.anonKey || '',
  }
}

const { url, key } = readRuntimeConfig()

const GLOBAL_KEY = '__nidus_admin_supabase__'

const authConfig = {
  persistSession: true,
  storageKey: 'nidus-admin-auth',
  storage: window.sessionStorage,
}

function getBaseClient() {
  if (!globalThis[GLOBAL_KEY]) globalThis[GLOBAL_KEY] = {}
  if (!globalThis[GLOBAL_KEY].base && url && key) {
    globalThis[GLOBAL_KEY].base = createClient(url, key, { db: { schema: 'admin' }, auth: authConfig })
  }
  return globalThis[GLOBAL_KEY].base || null
}

function getSchemaClient(schema) {
  const base = getBaseClient()
  if (!base) return null
  if (schema === 'admin') return base
  if (!globalThis[GLOBAL_KEY][schema]) {
    globalThis[GLOBAL_KEY][schema] = base.schema(schema)
  }
  return globalThis[GLOBAL_KEY][schema]
}

export const getAdminDb = () => getSchemaClient('admin')
export const getPublicDb = () => getSchemaClient('public')
export const getSimDb = () => getSchemaClient('sim')
/** Auth-aware client with Storage (bucket ops are not schema-scoped). */
export const getAdminStorageClient = () => getBaseClient()
