import { getTableName, getTableSchema } from './idGenerationConstants.js'

export const DEFAULT_NUM_LETTERS = 5
export const DEFAULT_NUM_DIGITS = 4

const DISAMBIGUATION_LETTERS = ['X', 'Y', 'Z', 'W', 'V']

/** account_billing_delegates → Account Billing Delegates */
export function tableNameToDescription(targetTable) {
  const name = getTableName(targetTable)
  if (!name) return ''
  return name
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

/** account_billing_delegates → ABD; accounts → ACC (single-word uses first 3 letters) */
export function tableNameToAbbreviation(targetTable) {
  const name = getTableName(targetTable)
  if (!name) return ''

  const parts = name.split('_').filter(Boolean)
  if (parts.length > 1) {
    return parts
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
      .slice(0, 4)
  }

  return name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
}

function normalizeAbbrev(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

/** Build abbreviation candidates including schema-aware variants (sim.activity_attributes → SAA). */
export function buildAbbreviationCandidates(targetTable) {
  const base = tableNameToAbbreviation(targetTable)
  const schema = getTableSchema(targetTable)
  const candidates = [base]

  if (schema && schema !== 'public') {
    candidates.push(normalizeAbbrev(`${schema.charAt(0)}${base}`))
    candidates.push(normalizeAbbrev(`${schema.slice(0, 2)}${base}`))
  }

  for (const letter of DISAMBIGUATION_LETTERS) {
    candidates.push(normalizeAbbrev(`${base.slice(0, 3)}${letter}`))
  }

  return [...new Set(candidates.filter(Boolean))]
}

export function findAbbreviationConflict(abbrev, rules, excludeRuleId = null) {
  const normalized = normalizeAbbrev(abbrev)
  if (!normalized) return null

  return (rules || []).find((rule) => (
    rule?.table_abbreviation?.toUpperCase() === normalized
    && rule?.id !== excludeRuleId
  )) || null
}

export function ensureUniqueAbbreviation(targetTable, rules = [], excludeRuleId = null) {
  const used = new Set(
    (rules || [])
      .filter((rule) => rule?.id !== excludeRuleId && rule?.table_abbreviation)
      .map((rule) => rule.table_abbreviation.toUpperCase()),
  )

  for (const candidate of buildAbbreviationCandidates(targetTable)) {
    if (!used.has(candidate)) return candidate
  }

  return tableNameToAbbreviation(targetTable)
}

export function applyTableDefaults(form, targetTable, rules = [], excludeRuleId = null) {
  if (!targetTable) return form

  const segmentType = form.segment_type || 'alphanumeric'

  return {
    ...form,
    target_table: targetTable,
    table_abbreviation: ensureUniqueAbbreviation(targetTable, rules, excludeRuleId),
    table_description: tableNameToDescription(targetTable),
    num_letters: segmentType === 'numeric' ? 0 : DEFAULT_NUM_LETTERS,
    num_digits: segmentType === 'alpha' ? 0 : (form.num_digits || DEFAULT_NUM_DIGITS),
  }
}

export function getAbbreviationValidationError(abbrev, rules, excludeRuleId = null) {
  const normalized = normalizeAbbrev(abbrev)
  if (!normalized) return 'Abbreviation is required.'
  if (!/^[A-Z]{1,4}$/.test(normalized)) return 'Abbreviation must be 1–4 uppercase letters.'

  const conflict = findAbbreviationConflict(normalized, rules, excludeRuleId)
  if (conflict) {
    return `Abbreviation "${normalized}" is already used by ${conflict.target_table}. Choose a unique abbreviation.`
  }

  return null
}
