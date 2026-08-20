/**
 * Display helpers for Audit details panels (v866) — Admin-local copy.
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

export function humanizeAuditToken(value) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  return raw
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
