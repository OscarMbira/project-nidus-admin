import { describe, expect, it } from 'vitest'
import {
  countFormTemplateSampleCoverage,
  countProcessTemplateContentCoverage,
  countDefaultContentCoverage,
  processContentFieldsForType,
  formTemplateEditPath,
} from '../defaultContentCoverage.js'

describe('defaultContentCoverage', () => {
  it('counts form template sample coverage', () => {
    const payload = {
      schema: {
        sections: [{
          key: 'general',
          fields: [
            { key: 'a', sample: 'One' },
            { key: 'b', sample: '' },
            { key: 'c' },
          ],
        }],
      },
    }
    expect(countFormTemplateSampleCoverage(payload)).toEqual({ filled: 1, total: 3, pct: 33 })
  })

  it('counts process template content coverage from document_data catalog', () => {
    const fields = processContentFieldsForType('project_charters')
    expect(fields.map((f) => f.key)).toContain('objectives')
    expect(fields.map((f) => f.key)).toContain('sample_notes')

    const payload = {
      document_type: 'project_charters',
      document_data: {
        purpose: 'Auth charter',
        owner_role: 'PMO',
        review_cadence: '',
        sample_notes: 'Notes',
        objectives: 'Obj',
        success_criteria: '',
        high_level_scope: 'Scope',
      },
    }
    const cov = countProcessTemplateContentCoverage(payload)
    expect(cov.total).toBe(fields.length)
    expect(cov.filled).toBe(5)
    expect(cov.pct).toBe(Math.round((5 / fields.length) * 100))
  })

  it('returns applicable=false for unsupported domains', () => {
    expect(countDefaultContentCoverage({ domain: 'opa', payload: {} }).applicable).toBe(false)
    expect(countDefaultContentCoverage({
      domain: 'form_template',
      payload: { schema: { sections: [{ key: 'g', fields: [{ key: 'x', sample: 'y' }] }] } },
    }).applicable).toBe(true)
  })

  it('builds form edit path with focus=defaults and prefers display_id', () => {
    expect(formTemplateEditPath('abc')).toBe('/content/global-template-form?id=abc')
    expect(formTemplateEditPath('abc', { focusDefaults: true }))
      .toBe('/content/global-template-form?id=abc&focus=defaults')
    expect(formTemplateEditPath({ id: 'uuid-1', display_id: 'GTL-0007' }))
      .toBe('/content/global-template-form?id=GTL-0007')
  })

  it('process catalog keys are stable for normalize seed (option A)', () => {
    const keys = processContentFieldsForType('activity_cost_estimates').map((f) => f.key)
    expect(keys).toEqual([
      'purpose',
      'owner_role',
      'review_cadence',
      'sample_notes',
      'currency',
      'contingency_guidance',
    ])
  })
})
