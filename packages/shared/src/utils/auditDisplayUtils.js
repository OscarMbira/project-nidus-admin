/**
 * Display helpers for Audit details panels (v866).
 */

function parseAuditDate(value) {
  if (!value) return null
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

/** Date only (locale) — use with formatAuditTime for a separate Time field. */
export function formatAuditDate(value) {
  const d = parseAuditDate(value)
  if (!d) return value ? String(value) : '—'
  return d.toLocaleDateString()
}

/** Time only (locale), e.g. 10:36:41 PM */
export function formatAuditTime(value) {
  const d = parseAuditDate(value)
  if (!d) return '—'
  return d.toLocaleTimeString()
}

/** Combined date + time (legacy / non-audit uses). */
export function formatAuditDateTime(value) {
  const d = parseAuditDate(value)
  if (!d) return value ? String(value) : '—'
  return d.toLocaleString()
}

/** snake_case / kebab → Title Case; blank → em dash */
export function humanizeAuditToken(value) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  return raw
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Resolve scope_entity_id to a friendly label (project_code, portfolio name, etc.).
 * Falls back to the raw id when unresolved.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ scopeType?: string | null, scopeId?: string | null }} opts
 * @returns {Promise<string | null>}
 */
export async function resolveScopeReferenceLabel(db, { scopeType, scopeId } = {}) {
  const id = String(scopeId || '').trim()
  if (!id) return null
  if (!db?.from) return id

  const type = String(scopeType || '').trim().toLowerCase()

  try {
    if (type === 'project' || type === 'projects') {
      const { data } = await db
        .from('projects')
        .select('project_code, project_name')
        .eq('id', id)
        .maybeSingle()
      const code = data?.project_code != null && String(data.project_code).trim() !== ''
        ? String(data.project_code).trim()
        : null
      if (code) return code
      const name = data?.project_name != null && String(data.project_name).trim() !== ''
        ? String(data.project_name).trim()
        : null
      if (name) return name
      return id
    }

    if (type === 'portfolio' || type === 'portfolios') {
      const { data } = await db
        .from('portfolios')
        .select('portfolio_code, name, portfolio_name')
        .eq('id', id)
        .maybeSingle()
      const code = data?.portfolio_code != null && String(data.portfolio_code).trim() !== ''
        ? String(data.portfolio_code).trim()
        : null
      if (code) return code
      const name = data?.name || data?.portfolio_name
      if (name && String(name).trim()) return String(name).trim()
      return id
    }

    if (type === 'programme' || type === 'program' || type === 'programmes') {
      const { data } = await db
        .from('programmes')
        .select('programme_code, name, programme_name')
        .eq('id', id)
        .maybeSingle()
      const code = data?.programme_code != null && String(data.programme_code).trim() !== ''
        ? String(data.programme_code).trim()
        : null
      if (code) return code
      const name = data?.name || data?.programme_name
      if (name && String(name).trim()) return String(name).trim()
      return id
    }

    if (type === 'account' || type === 'organisation' || type === 'organization') {
      const { data: acct } = await db
        .from('accounts')
        .select('account_name, name, display_name')
        .eq('id', id)
        .maybeSingle()
      const label = acct?.account_name || acct?.name || acct?.display_name
      if (label && String(label).trim()) return String(label).trim()
      return id
    }
  } catch {
    return id
  }

  return id
}
