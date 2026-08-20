import { getAdminDb } from './supabase.js'

const SESSION_KEY = 'nidus-admin-error-session'

async function computeErrorHash(errorType, errorMessage, pageRoute) {
  const normalized = `${errorType || ''}|${String(errorMessage || '').slice(0, 500)}|${pageRoute || ''}`
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(normalized)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }
  let hash = 0
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i)
    hash |= 0
  }
  return `fallback-${Math.abs(hash).toString(16)}`
}

function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || `sess-${Date.now()}`
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

function parseClientEnvironment() {
  const ua = navigator.userAgent || ''
  let browser = 'Unknown'
  if (ua.includes('Edg/')) {
    browser = `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] || ''}`.trim()
  } else if (ua.includes('Chrome/')) {
    browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] || ''}`.trim()
  } else if (ua.includes('Firefox/')) {
    browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] || ''}`.trim()
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    browser = `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] || ''}`.trim()
  }

  let os = 'Unknown'
  if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac OS X/i.test(ua)) os = 'macOS'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let device_type = 'desktop'
  if (/Mobi|Android/i.test(ua) && !/Tablet|iPad/i.test(ua)) device_type = 'mobile'
  else if (/Tablet|iPad/i.test(ua)) device_type = 'tablet'

  return {
    browser: browser.slice(0, 100),
    os: os.slice(0, 100),
    device_type,
  }
}

export function buildStackTrace(error, info = null) {
  const parts = []
  if (error?.stack) parts.push(`--- JavaScript Stack ---\n${error.stack}`)
  if (info?.componentStack) parts.push(`--- Component Stack ---\n${info.componentStack.trim()}`)
  return parts.join('\n\n') || null
}

export async function reportClientError({
  error,
  info = null,
  module = null,
  componentName = null,
  errorType = 'render_error',
  system = 'admin',
  userDescription = null,
} = {}) {
  const db = getAdminDb()
  if (!db) {
    console.error('[errorReporting] Admin DB unavailable', error)
    return { error: new Error('Admin DB unavailable') }
  }

  const { browser, os, device_type } = parseClientEnvironment()
  const pageRoute = `${window.location.pathname}${window.location.search || ''}`.slice(0, 500)
  const errorMessage = (error?.message || String(error) || 'Unknown error').slice(0, 10000)
  const error_hash = await computeErrorHash(errorType, errorMessage, pageRoute)

  let user_id = null
  let user_email = null
  let user_role = null

  try {
    const { data: { session } } = await db.auth.getSession()
    if (session?.user) {
      user_id = session.user.id
      user_email = session.user.email?.slice(0, 255) || null
      const { data: adminUser } = await db
        .from('admin_users')
        .select('role')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()
      user_role = adminUser?.role || null
    }
  } catch {
    // Best-effort user context only.
  }

  const payload = {
    error_type: errorType,
    error_message: errorMessage,
    error_hash,
    stack_trace: buildStackTrace(error, info),
    system,
    page_route: pageRoute,
    component_name: (componentName || module || null)?.slice(0, 255) || null,
    browser,
    os,
    device_type,
    session_id: getSessionId()?.slice(0, 100) || null,
    user_id,
    user_email,
    user_role,
    user_description: userDescription,
  }

  const result = await db.from('system_error_log').insert(payload)
  if (result.error && payload.system === 'admin') {
    const code = result.error.code
    const message = String(result.error.message || result.error.details || '')
    const shouldRetryAsPlatform = code === '23514'
      || /system_error_log_system_check/i.test(message)
    if (shouldRetryAsPlatform) {
      return db.from('system_error_log').insert({ ...payload, system: 'platform' })
    }
  }
  if (result.error) {
    console.error('[errorReporting] Failed to persist error log', result.error, payload)
  }
  return result
}

export function installGlobalErrorHandlers() {
  if (globalThis.__nidusAdminGlobalErrorHandlersInstalled) return
  globalThis.__nidusAdminGlobalErrorHandlersInstalled = true

  window.addEventListener('error', (event) => {
    reportClientError({
      error: event.error || new Error(event.message || 'Unknown script error'),
      errorType: 'js_error',
      system: 'admin',
      componentName: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null,
    }).catch(() => {})
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    reportClientError({
      error: reason instanceof Error ? reason : new Error(String(reason)),
      errorType: 'js_error',
      system: 'admin',
    }).catch(() => {})
  })
}
