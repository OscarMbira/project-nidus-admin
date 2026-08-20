const MAX_KEYSPACE = 9223372036854775807n

export const GENERATION_MODE_OPTIONS = [
  { value: 'random', label: 'Random' },
  { value: 'sequential', label: 'Sequential' },
]

export const DATE_FORMAT_OPTIONS = [
  { value: 'YYYY', label: 'Year (2026)' },
  { value: 'YYYYMM', label: 'Year-Month (202606)' },
  { value: 'YYYYMMDD', label: 'Full Date (20260712)' },
]

export function isSequentialMode(form) {
  return (form?.generation_mode || 'random') === 'sequential'
}

export function computeSequentialKeyspaceSize(numDigits) {
  const digits = Math.max(0, Number(numDigits) || 0)
  if (digits <= 0) return 0n
  if (digits >= 19) return MAX_KEYSPACE
  let size = 1n
  for (let i = 0; i < digits; i += 1) {
    size *= 10n
    if (size >= MAX_KEYSPACE) return MAX_KEYSPACE
  }
  return size
}

export function formatPeriodKeyPreview(dateFormat, referenceDate = new Date()) {
  const year = referenceDate.getFullYear()
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0')
  const day = String(referenceDate.getDate()).padStart(2, '0')

  switch (dateFormat) {
    case 'YYYYMM':
      return `${year}${month}`
    case 'YYYYMMDD':
      return `${year}${month}${day}`
    case 'YYYY':
    default:
      return String(year)
  }
}

export function formatSequentialPreviewPattern(form) {
  const digits = Math.max(1, Number(form.num_digits) || 1)
  const parts = []
  if (form.include_date) parts.push('[DATE]')
  parts.push(`[${'0'.repeat(Math.min(digits, 10))}]`)
  return parts.join(form.separator ?? '-')
}

export function buildSequentialIdPreview(form, referenceDate = new Date()) {
  const hasAbbrev = Boolean(String(form.table_abbreviation || '').trim())
  const separator = form.separator ?? '-'
  const prefix = hasAbbrev ? `${String(form.table_abbreviation).toUpperCase().slice(0, 4)}${separator}` : ''
  const suffix = form.suffix || ''
  const digits = Math.max(1, Number(form.num_digits) || 3)
  const seed = Math.max(1, Number(form.seed_value) || 1)
  const sequence = String(seed).padStart(digits, '0')

  let middle = ''
  if (form.include_date) {
    middle = formatPeriodKeyPreview(form.date_format || 'YYYY', referenceDate) + separator
  }

  return `${prefix}${middle}${sequence}${suffix}`
}

export function describeSequentialCapacity(form) {
  const keyspace = computeSequentialKeyspaceSize(form.num_digits)
  const maxLabel = keyspace >= 1000n ? `${keyspace.toLocaleString()}` : String(keyspace)

  if (form.scope_column && form.include_date) {
    return `${maxLabel} IDs per ${form.scope_column} per period`
  }
  if (form.scope_column) {
    return `${maxLabel} IDs per ${form.scope_column}`
  }
  if (form.include_date) {
    return `${maxLabel} IDs per period`
  }
  return `${maxLabel} sequential IDs (global counter)`
}

export function formatRandomPreviewPattern(form) {
  const type = form.segment_type || 'alphanumeric'
  const letters = Math.max(0, Number(form.num_letters) || 0)
  const digits = Math.max(0, Number(form.num_digits) || 0)
  let codePattern = `[L${letters}D${digits}]`
  if (type === 'numeric') codePattern = `[D${digits}]`
  else if (type === 'alpha') codePattern = `[L${letters}]`

  const parts = []
  if (form.include_date) parts.push('[DATE]')
  parts.push(codePattern)
  return parts.join(form.separator ?? '-')
}

export function buildRandomDateMiddle(form, referenceDate = new Date()) {
  if (!form.include_date) return ''
  return `${formatPeriodKeyPreview(form.date_format || 'YYYY', referenceDate)}${form.separator ?? '-'}`
}

export function formatRuleModeBadge(rule) {
  const mode = rule?.generation_mode || 'random'
  const parts = [mode === 'sequential' ? 'Sequential' : 'Random']
  if (rule?.include_date) parts.push(rule.date_format || 'YYYY')
  if (mode === 'sequential' && rule?.scope_column) parts.push(`scope: ${rule.scope_column}`)

  return {
    label: parts.join(' · '),
    className: mode === 'sequential' || rule?.include_date
      ? 'border-indigo-700 bg-indigo-900/40 text-indigo-200'
      : 'border-gray-600 bg-gray-800 text-gray-300',
  }
}
