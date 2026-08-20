import { describe, it, expect } from 'vitest'
import {
  cloneFieldForRestore,
  listMissingCatalogFields,
  listRestoreCandidates,
  appendRestoredField,
  getStandardTemplateCatalog,
} from '../formTemplateStandardFields.js'

describe('formTemplateStandardFields', () => {
  it('loads F018 Activity Attributes catalog', () => {
    const tmpl = getStandardTemplateCatalog('F018')
    expect(tmpl?.title).toMatch(/Activity Attributes/i)
    const keys = tmpl.sections[0].fields.map((f) => f.key)
    expect(keys).toContain('activity_id')
    expect(keys).toContain('predecessor')
  })

  it('cloneFieldForRestore copies key/label/type/help/sample/options', () => {
    const cloned = cloneFieldForRestore({
      key: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      help: 'Pick status',
      sample: 'approved',
      options: [{ value: 'approved', label: 'Approved' }],
    })
    expect(cloned).toMatchObject({
      key: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      help: 'Pick status',
      sample: 'approved',
    })
    expect(cloned.options).toHaveLength(1)
    expect(cloned.options[0]).not.toBe(
      [{ value: 'approved', label: 'Approved' }][0],
    )
  })

  it('listMissingCatalogFields skips keys already present', () => {
    const missing = listMissingCatalogFields('F018', 'general', [
      { key: 'activity_id' },
      { key: 'predecessor' },
    ])
    expect(missing.some((f) => f.key === 'activity_id')).toBe(false)
    expect(missing.some((f) => f.key === 'duration')).toBe(true)
  })

  it('listRestoreCandidates prefers session then catalog and dedupes', () => {
    const sessionRemoved = [
      { key: 'location', label: 'Location', type: 'text', help: 'Session help' },
    ]
    const rows = listRestoreCandidates({
      sessionRemoved,
      templateCode: 'F018',
      sectionKey: 'general',
      currentFields: [{ key: 'activity_id' }],
    })
    const location = rows.find((r) => r.field.key === 'location')
    expect(location?.source).toBe('session')
    expect(location?.field.help).toBe('Session help')
    expect(rows.filter((r) => r.field.key === 'location')).toHaveLength(1)
    expect(rows.some((r) => r.field.key === 'activity_id')).toBe(false)
  })

  it('appendRestoredField appends at end and rejects duplicates', () => {
    const fields = [{ key: 'a', label: 'A', type: 'text' }]
    const next = appendRestoredField(fields, { key: 'b', label: 'B', type: 'text' })
    expect(next.map((f) => f.key)).toEqual(['a', 'b'])
    expect(appendRestoredField(next, { key: 'a', label: 'Again' })).toEqual(next)
  })
})
