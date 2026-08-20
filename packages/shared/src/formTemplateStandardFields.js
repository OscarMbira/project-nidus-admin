/**
 * Helpers to reinstate removed / missing standard fields on Admin form_template payloads.
 */

import catalog from './formTemplateStandardFieldsCatalog.json'

/**
 * @param {object} field
 * @returns {object}
 */
export function cloneFieldForRestore(field) {
  if (!field || typeof field !== 'object') return null
  const out = {
    key: String(field.key || '').trim(),
    label: String(field.label || field.key || '').trim(),
    type: field.type || 'text',
    required: Boolean(field.required),
    options: Array.isArray(field.options) ? field.options.map((o) => (typeof o === 'object' ? { ...o } : o)) : [],
    help: field.help != null ? String(field.help) : (field.guidance != null ? String(field.guidance) : ''),
    sample: field.sample != null ? String(field.sample) : '',
  }
  if (!out.key) return null
  return out
}

/**
 * @param {string} templateCode
 * @returns {{ title: string, sections: Array<{key:string,title:string,fields:object[]}> }|null}
 */
export function getStandardTemplateCatalog(templateCode) {
  const code = String(templateCode || '').trim().toUpperCase()
  if (!code || !catalog[code]) return null
  return catalog[code]
}

/**
 * Catalog fields for a section that are not present in currentFields (by key).
 * @param {string} templateCode
 * @param {string} sectionKey
 * @param {Array<{key?: string}>} currentFields
 */
export function listMissingCatalogFields(templateCode, sectionKey, currentFields = []) {
  const tmpl = getStandardTemplateCatalog(templateCode)
  if (!tmpl) return []
  const secKey = String(sectionKey || 'general').trim() || 'general'
  const section = (tmpl.sections || []).find((s) => s.key === secKey)
    || (tmpl.sections || []).find((s) => s.key === 'general')
    || tmpl.sections?.[0]
  if (!section?.fields?.length) return []
  const present = new Set(
    (currentFields || []).map((f) => String(f?.key || '').trim()).filter(Boolean),
  )
  return section.fields
    .map(cloneFieldForRestore)
    .filter((f) => f && !present.has(f.key))
}

/**
 * Build restore picker rows: session-removed first, then catalog-missing (deduped by key).
 * @param {{ sessionRemoved?: object[], templateCode?: string, sectionKey?: string, currentFields?: object[] }} opts
 * @returns {Array<{ source: 'session'|'catalog', field: object }>}
 */
export function listRestoreCandidates({
  sessionRemoved = [],
  templateCode = '',
  sectionKey = '',
  currentFields = [],
} = {}) {
  const present = new Set(
    (currentFields || []).map((f) => String(f?.key || '').trim()).filter(Boolean),
  )
  const seen = new Set()
  const out = []

  for (const raw of sessionRemoved || []) {
    const field = cloneFieldForRestore(raw)
    if (!field || present.has(field.key) || seen.has(field.key)) continue
    seen.add(field.key)
    out.push({ source: 'session', field })
  }

  for (const field of listMissingCatalogFields(templateCode, sectionKey, currentFields)) {
    if (seen.has(field.key) || present.has(field.key)) continue
    seen.add(field.key)
    out.push({ source: 'catalog', field })
  }

  return out
}

/**
 * Append a restored field at the end of the section fields array.
 * @param {object[]} fields
 * @param {object} field
 */
export function appendRestoredField(fields = [], field) {
  const cloned = cloneFieldForRestore(field)
  if (!cloned) return [...fields]
  const key = cloned.key
  if ((fields || []).some((f) => String(f?.key || '').trim() === key)) {
    return [...fields]
  }
  return [...(fields || []), cloned]
}

export { catalog as FORM_TEMPLATE_STANDARD_CATALOG }
