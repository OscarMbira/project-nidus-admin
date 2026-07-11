import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

export const ADMIN_AUTH_STORAGE_KEY = 'nidus-admin-auth'

export function getAnonClient() {
  const url = process.env.VITE_ADMIN_SUPABASE_URL
  const anonKey = process.env.VITE_ADMIN_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return createClient(url, anonKey, {
    db: { schema: 'admin' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function signInAdminAccount(email, password) {
  const client = getAnonClient()
  if (!client) throw new Error('VITE_ADMIN_SUPABASE_URL and VITE_ADMIN_SUPABASE_ANON_KEY required for E2E auth')
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  if (!data.session) throw new Error(`No session returned for ${email}`)
  return data.session
}

export async function injectAdminSession(context, session) {
  await context.addInitScript(({ storageKey, payload }) => {
    sessionStorage.setItem(storageKey, JSON.stringify(payload))
  }, { storageKey: ADMIN_AUTH_STORAGE_KEY, payload: session })
}

/** Playwright restores cookies from storageState but not sessionStorage — inject manually. */
export async function loadAdminStorageState(context, storageState) {
  if (!storageState || typeof storageState !== 'string' || !fs.existsSync(storageState)) return
  const state = JSON.parse(fs.readFileSync(storageState, 'utf8'))
  for (const origin of state.origins || []) {
    await context.addInitScript(({ sessionEntries, localEntries }) => {
      for (const { name, value } of sessionEntries) {
        if (value != null) sessionStorage.setItem(name, value)
      }
      for (const { name, value } of localEntries) {
        if (value != null) localStorage.setItem(name, value)
      }
    }, {
      sessionEntries: origin.sessionStorage || [],
      localEntries: origin.localStorage || [],
    })
  }
}

/** Playwright storageState() often omits sessionStorage — persist it explicitly. */
export async function saveAdminStorageState(context, page, filePath) {
  const cookies = await context.cookies()
  const originData = await page.evaluate((storageKey) => {
    const entries = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const name = sessionStorage.key(i)
      if (name) entries.push({ name, value: sessionStorage.getItem(name) })
    }
    const localEntries = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i)
      if (name) localEntries.push({ name, value: localStorage.getItem(name) })
    }
    return {
      origin: window.location.origin,
      sessionStorage: entries,
      localStorage: localEntries,
      hasAuth: entries.some((e) => e.name === storageKey && e.value?.includes('access_token')),
    }
  }, ADMIN_AUTH_STORAGE_KEY)

  if (!originData.hasAuth) {
    throw new Error('sessionStorage missing nidus-admin-auth access_token after login')
  }

  const state = {
    cookies,
    origins: [{
      origin: originData.origin,
      localStorage: originData.localStorage,
      sessionStorage: originData.sessionStorage,
    }],
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
}

/**
 * Generic version of saveAdminStorageState for non-admin systems (Platform, Simulator):
 * captures cookies + ALL sessionStorage/localStorage entries, with no admin-specific key check,
 * since each system's Supabase client uses its own sessionStorage key.
 */
export async function saveFullStorageState(context, page, filePath) {
  const cookies = await context.cookies()
  const originData = await page.evaluate(() => {
    const sessionEntries = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const name = sessionStorage.key(i)
      if (name) sessionEntries.push({ name, value: sessionStorage.getItem(name) })
    }
    const localEntries = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i)
      if (name) localEntries.push({ name, value: localStorage.getItem(name) })
    }
    return { origin: window.location.origin, sessionStorage: sessionEntries, localStorage: localEntries }
  })

  const state = {
    cookies,
    origins: [{
      origin: originData.origin,
      localStorage: originData.localStorage,
      sessionStorage: originData.sessionStorage,
    }],
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
}

export function assertStorageStateFile(filePath, email) {
  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const hasSession = saved.origins?.some(
    (origin) => origin.sessionStorage?.some(
      (item) => item.name === ADMIN_AUTH_STORAGE_KEY && item.value?.includes('access_token'),
    ),
  )
  if (!hasSession) {
    throw new Error(`Auth state file has no Supabase session for ${email} — check requires_2fa is false (pnpm test:seed-accounts)`)
  }
}
