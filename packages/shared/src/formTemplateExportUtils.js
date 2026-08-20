/**
 * Form-template → export-utils shaping helpers (Admin Global Template Library).
 * Export always follows section/field row order (not on-screen column order).
 */

/** Max length for Plain Template "Example:" lines in exports. */
export const EXPORT_EXAMPLE_MAX_LEN = 180

/**
 * Truncate a sample string for use as an export Example line.
 * @param {unknown} text
 * @param {number} [maxLen]
 * @returns {string}
 */
export function truncateExportExample(text, maxLen = EXPORT_EXAMPLE_MAX_LEN) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  if (s.length <= maxLen) return s
  return `${s.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`
}

/**
 * Map form schema sections/fields into exportRecordTo* sections shape.
 * Includes optional help (guidance) and example (from sample when includeExamples).
 * @param {{ sections?: Array<{ title?: string, fields?: Array<{ key?: string, label?: string, help?: string, guidance?: string, sample?: string }> }> }|null|undefined} schema
 * @param {{ includeExamples?: boolean }} [options]
 * @returns {Array<{ title: string, fields: Array<{ key: string, label: string, help?: string, example?: string }> }>}
 */
export function schemaToExportSections(schema, options = {}) {
  const includeExamples = Boolean(options.includeExamples)
  const sections = Array.isArray(schema?.sections) ? schema.sections : []
  return sections
    .map((section, sIdx) => ({
      title: String(section?.title || section?.key || `Section ${sIdx + 1}`).trim() || `Section ${sIdx + 1}`,
      fields: (Array.isArray(section?.fields) ? section.fields : [])
        .filter((f) => f && (f.key || f.label))
        .map((f, fIdx) => {
          const help = String(f.help || f.guidance || '').trim()
          const example = includeExamples ? truncateExportExample(f.sample) : ''
          const out = {
            key: String(f.key || `field_${fIdx + 1}`),
            label: String(f.label || f.key || `Field ${fIdx + 1}`),
          }
          if (help) out.help = help
          if (example) out.example = example
          return out
        }),
    }))
    .filter((s) => s.fields.length > 0)
}

/**
 * Build display lines for field guidance (description + optional Example).
 * @param {{ help?: string, example?: string }} field
 * @returns {string[]}
 */
export function getFieldGuidanceLines(field) {
  const lines = []
  const help = String(field?.help || '').trim()
  const example = String(field?.example || '').trim()
  if (help) lines.push(help)
  if (example) lines.push(`Example: ${example}`)
  return lines
}

/**
 * Compose a single export cell: optional guidance lines, then the value/blank.
 * Used by Excel/CSV/XML/JSON (light touch) so offline files still carry instructions.
 * @param {{ help?: string, example?: string }} field
 * @param {unknown} value
 * @param {(val: unknown, blank?: string) => string} formatValue
 * @param {string} [blankPlaceholder]
 * @returns {string}
 */
export function composeGuidedExportValue(field, value, formatValue, blankPlaceholder = '—') {
  const guidance = getFieldGuidanceLines(field)
  const display = typeof formatValue === 'function'
    ? formatValue(value, blankPlaceholder)
    : (value == null || value === '' ? blankPlaceholder : String(value))
  if (!guidance.length) return display
  return `${guidance.join('\n')}\n\n${display}`
}

/**
 * Flatten sample values from schema fields into a record object.
 * @param {{ sections?: Array<{ fields?: Array<{ key?: string, sample?: string }> }> }|null|undefined} schema
 * @returns {Record<string, string>}
 */
export function buildSampleRecord(schema) {
  const record = {}
  const sections = Array.isArray(schema?.sections) ? schema.sections : []
  sections.forEach((section) => {
    ;(Array.isArray(section?.fields) ? section.fields : []).forEach((field) => {
      if (!field?.key) return
      record[field.key] = field.sample != null ? String(field.sample) : ''
    })
  })
  return record
}

/**
 * Flatten empty values for Plain Template export.
 * @param {{ sections?: Array<{ fields?: Array<{ key?: string }> }> }|null|undefined} schema
 * @returns {Record<string, string>}
 */
export function buildBlankRecord(schema) {
  const record = {}
  const sections = Array.isArray(schema?.sections) ? schema.sections : []
  sections.forEach((section) => {
    ;(Array.isArray(section?.fields) ? section.fields : []).forEach((field) => {
      if (!field?.key) return
      record[field.key] = ''
    })
  })
  return record
}

/** Ruled blank line used for Plain Template fillable exports. */
export const PLAIN_TEMPLATE_BLANK = '_______________'

/**
 * Slugify a template name for export filenames.
 * @param {string} text
 * @returns {string}
 */
export function slugifyExportName(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64) || 'form_template'
}

/**
 * Build baseFilename: `${template_code}_${slugified name}`.
 * @param {{ templateCode?: string, templateName?: string }} opts
 * @returns {string}
 */
export function buildFormTemplateExportFilename({ templateCode, templateName } = {}) {
  const code = String(templateCode || 'FORM').trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'FORM'
  return `${code}_${slugifyExportName(templateName)}`
}
