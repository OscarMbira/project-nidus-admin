/**
 * Admin field-level help — text helpers and data access (Admin rule 23, monorepo v1345 slice 6).
 * Admin's own copy of the monorepo @nidus/shared fieldHelp utils + fieldHelpService (no cross-repo import).
 * Help rows live in admin.field_help (keys admin.<table>.<column>); Admin never reads public.field_help.
 * Admin has no Regional & Format Settings, so tokens resolve to Admin's fixed formats (D MMM YYYY, 24-hour).
 */
import { getAdminDb } from '@nidus-admin/shared'

const TOKENS = { date_format: 'D MMM YYYY', example_date: '15 Mar 2027', currency: 'USD', decimals: '2' }

/** Replace {date_format}, {example_date}, {currency}, {decimals}; unknown tokens stay as written. */
export function resolveAdminHelpTokens(text) {
  if (!text) return ''
  return String(text).replace(/\{([a-z_]+)\}/g, (m, token) => (TOKENS[token] != null ? TOKENS[token] : m))
}

/** Paragraphs and "- " bullet lists, as plain strings (rendered as text, never HTML). */
export function parseAdminHelpText(text) {
  const blocks = []
  let list = null
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) { list = null; continue }
    if (line.startsWith('- ')) {
      if (!list) { list = { type: 'ul', items: [] }; blocks.push(list) }
      list.items.push(line.slice(2).trim())
    } else {
      list = null
      blocks.push({ type: 'p', text: line })
    }
  }
  return blocks
}

/** Rules read from the live field (required, max length, min / max, options) — never stored as text. */
export function buildAdminHelpRules({ required, maxLength, min, max, options } = {}) {
  const lines = []
  if (required === true) lines.push('Required.')
  else if (required === false) lines.push('Optional.')
  if (Number.isFinite(maxLength) && maxLength > 0) lines.push(`Up to ${maxLength} characters.`)
  if (Number.isFinite(min) && Number.isFinite(max)) lines.push(`Between ${min} and ${max}.`)
  else if (Number.isFinite(min)) lines.push(`At least ${min}.`)
  else if (Number.isFinite(max)) lines.push(`At most ${max}.`)
  if (Array.isArray(options)) {
    const labels = options.map((o) => (typeof o === 'string' ? o : (o?.label ?? o?.value ?? ''))).map((l) => String(l).trim())
      .filter((l) => l && l !== '—' && l.toLowerCase() !== 'not specified' && !/^select\b|^choose\b|^all\b/i.test(l))
    if (labels.length) {
      const shown = labels.slice(0, 12)
      const more = labels.length - shown.length
      lines.push(`Choose from: ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}.`)
    }
  }
  return lines
}

// ── Data access: one query per scope, cached for the browser session (Admin rule 19 / monorepo rule 66) ──
const CACHE_KEY = 'nidus-admin:fieldHelp:v1'
let versionCheck = null

function readCache() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
    if (parsed && typeof parsed === 'object' && parsed.entries) return parsed
  } catch { /* ignore */ }
  return { version: null, entries: {} }
}
function writeCache(cache) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* quota / private mode */ }
}

/** For tests. */
export function resetAdminFieldHelpCacheForTests() {
  versionCheck = null
  try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

async function ensureFreshCache(db) {
  if (!versionCheck) {
    versionCheck = (async () => {
      const { data } = await db.from('field_help').select('updated_at').order('updated_at', { ascending: false }).limit(1)
      const latest = data?.[0]?.updated_at || null
      const cache = readCache()
      if (cache.version !== latest) writeCache({ version: latest, entries: {} })
    })().catch(() => { /* keep whatever is cached */ })
  }
  await versionCheck
}

/**
 * Load help rows for keys (form override wins over the shared row). Returns key → row (null when none).
 * @param {string[]} keys
 * @param {{ formKey?: string, db?: object }} [opts]
 */
export async function loadAdminFieldHelp(keys, { formKey = '', db = null } = {}) {
  const wanted = [...new Set((keys || []).filter(Boolean))]
  if (!wanted.length) return {}
  const client = db || getAdminDb()
  await ensureFreshCache(client)
  const cache = readCache()
  const result = {}
  const missing = wanted.filter((k) => {
    const id = `${formKey}|${k}`
    if (Object.prototype.hasOwnProperty.call(cache.entries, id)) { result[k] = cache.entries[id]; return false }
    return true
  })
  if (missing.length) {
    const forms = formKey ? ['', formKey] : ['']
    const { data, error } = await client.from('field_help')
      .select('help_key, form_key, title, purpose, examples, format_notes, extra_notes')
      .in('help_key', missing).in('form_key', forms).eq('locale', 'en').eq('is_active', true)
    if (error) throw error
    for (const key of missing) {
      const rows = (data || []).filter((r) => r.help_key === key)
      const row = rows.find((r) => r.form_key === formKey) || rows.find((r) => r.form_key === '') || null
      result[key] = row
      cache.entries[`${formKey}|${key}`] = row
    }
    writeCache(cache)
  }
  return result
}
