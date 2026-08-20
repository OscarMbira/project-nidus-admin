/**
 * Pure helpers for SearchableSelect allowCreate and MultiSearchableSelect chip logic.
 */

/**
 * Whether to show the "Use 'query'" create row.
 * @param {boolean} allowCreate
 * @param {string} search
 * @param {Array<{ value?: string, label?: string }>} options
 */
export function shouldShowCreateOption(allowCreate, search, options = []) {
  if (!allowCreate) return false
  const query = String(search || '').trim()
  if (!query) return false
  const lower = query.toLowerCase()
  return !options.some((option) => {
    const label = String(option.label || '').toLowerCase()
    const val = String(option.value || '').toLowerCase()
    return label === lower || val === lower
  })
}

/**
 * Append a unique trimmed value to a multi-select list (dedupe).
 * @param {string[]} values
 * @param {string} next
 */
export function appendUniqueMultiValue(values = [], next) {
  const selected = (Array.isArray(values) ? values : []).map((v) => String(v).trim()).filter(Boolean)
  const value = String(next || '').trim()
  if (!value || selected.includes(value)) return selected
  return [...selected, value]
}

/**
 * Remove a value from a multi-select list.
 * @param {string[]} values
 * @param {string} remove
 */
export function removeMultiValue(values = [], remove) {
  const selected = (Array.isArray(values) ? values : []).map((v) => String(v).trim()).filter(Boolean)
  return selected.filter((v) => v !== remove)
}
