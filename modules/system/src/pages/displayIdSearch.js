/**
 * Display IDs follow: ABBREV + separator + code reference (+ optional suffix).
 * e.g. SUB-8BF9Y25 → code reference "8BF9Y25"
 */

const DISPLAY_ID_PARTS_RE = /^([A-Za-z]{1,4})([^A-Za-z0-9]?)([\s\S]+)$/

export function extractDisplayIdCodeReference(displayId) {
  const id = String(displayId || '').trim()
  if (!id) return ''

  const match = id.match(DISPLAY_ID_PARTS_RE)
  if (!match) return id

  return match[3] || id
}

export function splitDisplayIdParts(displayId) {
  const id = String(displayId || '').trim()
  if (!id) return { prefix: '', code: '' }

  const match = id.match(DISPLAY_ID_PARTS_RE)
  if (!match) return { prefix: '', code: id }

  return {
    prefix: `${match[1]}${match[2] || ''}`,
    code: match[3] || '',
  }
}

export function displayIdMatchesSearch(row, searchTerm) {
  const term = String(searchTerm || '').trim().toLowerCase()
  if (!term) return true

  const displayId = String(row?.display_id ?? '').toLowerCase()
  const codeRef = extractDisplayIdCodeReference(row?.display_id).toLowerCase()
  const targetTable = String(row?.target_table ?? '').toLowerCase()
  const recordId = String(row?.record_id ?? '').toLowerCase()

  return displayId.includes(term)
    || codeRef.includes(term)
    || targetTable.includes(term)
    || recordId.includes(term)
}

export function buildGeneratedIdsListPath({ table, search } = {}) {
  const params = new URLSearchParams()
  if (table) params.set('table', table)
  if (search) params.set('search', search)
  const query = params.toString()
  return `/system/id-generated-list${query ? `?${query}` : ''}`
}

export function highlightMatch(text, searchTerm) {
  const source = String(text ?? '')
  const term = String(searchTerm || '').trim()
  if (!term || !source) return [{ text: source, match: false }]

  const lowerSource = source.toLowerCase()
  const lowerTerm = term.toLowerCase()
  const index = lowerSource.indexOf(lowerTerm)
  if (index < 0) return [{ text: source, match: false }]

  const parts = []
  if (index > 0) parts.push({ text: source.slice(0, index), match: false })
  parts.push({ text: source.slice(index, index + term.length), match: true })
  if (index + term.length < source.length) {
    parts.push({ text: source.slice(index + term.length), match: false })
  }
  return parts
}
