import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './load-env.js'

export function getSupabaseAdmin() {
  loadEnv()

  const url = process.env.VITE_ADMIN_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.VITE_ADMIN_SUPABASE_SERVICE_ROLE_KEY
    || process.env.VITE_SUPABASE_ADMIN_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return {
      client: null,
      error: 'Set VITE_ADMIN_SUPABASE_URL and VITE_ADMIN_SUPABASE_SERVICE_ROLE_KEY in .env',
    }
  }

  const client = createClient(url, serviceKey, {
    db: { schema: 'admin' },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return { client, error: null }
}
