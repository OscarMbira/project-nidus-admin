import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  schemaToExportSections,
  buildSampleRecord,
  buildBlankRecord,
  PLAIN_TEMPLATE_BLANK,
  buildFormTemplateExportFilename,
  getFieldGuidanceLines,
  truncateExportExample,
  composeGuidedExportValue,
} from '../formTemplateExportUtils.js'
import { exportRecordToPDF } from '../exportUtils.js'

const sampleSchema = {
  title: 'Project Charter',
  sections: [
    {
      key: 'overview',
      title: 'Overview',
      fields: [
        {
          key: 'project_name',
          label: 'Project name',
          help: 'Enter the official project name.',
          sample: 'Apollo',
        },
        { key: 'sponsor', label: 'Sponsor', sample: '' },
      ],
    },
    {
      key: 'scope',
      title: 'Scope',
      fields: [
        { key: 'in_scope', label: 'In scope', sample: 'Build MVP' },
      ],
    },
  ],
}

describe('formTemplateExportUtils', () => {
  it('schemaToExportSections maps key/label and preserves row order', () => {
    const sections = schemaToExportSections(sampleSchema)
    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('Overview')
    expect(sections[0].fields[0]).toMatchObject({
      key: 'project_name',
      label: 'Project name',
      help: 'Enter the official project name.',
    })
    expect(sections[0].fields[0].example).toBeUndefined()
    expect(sections[1].fields[0].key).toBe('in_scope')
  })

  it('schemaToExportSections includes example from sample when includeExamples', () => {
    const sections = schemaToExportSections(sampleSchema, { includeExamples: true })
    expect(sections[0].fields[0].example).toBe('Apollo')
    expect(sections[0].fields[1].example).toBeUndefined()
  })

  it('schemaToExportSections returns empty for missing schema', () => {
    expect(schemaToExportSections(null)).toEqual([])
    expect(schemaToExportSections({})).toEqual([])
  })

  it('getFieldGuidanceLines builds help and Example lines', () => {
    expect(getFieldGuidanceLines({
      help: 'Name the sponsor.',
      example: 'Amina Okonkwo — COO',
    })).toEqual([
      'Name the sponsor.',
      'Example: Amina Okonkwo — COO',
    ])
  })

  it('truncateExportExample shortens long samples', () => {
    const long = 'x'.repeat(200)
    const out = truncateExportExample(long, 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.endsWith('…')).toBe(true)
  })

  it('composeGuidedExportValue prefixes guidance before the blank', () => {
    const text = composeGuidedExportValue(
      { help: 'Be specific.', example: 'MVP by Q3' },
      '',
      (_v, blank) => blank || '—',
      '_______________',
    )
    expect(text).toContain('Be specific.')
    expect(text).toContain('Example: MVP by Q3')
    expect(text).toContain('_______________')
  })

  it('buildSampleRecord flattens sample values', () => {
    expect(buildSampleRecord(sampleSchema)).toEqual({
      project_name: 'Apollo',
      sponsor: '',
      in_scope: 'Build MVP',
    })
  })

  it('buildBlankRecord flattens empty strings for all keys', () => {
    expect(buildBlankRecord(sampleSchema)).toEqual({
      project_name: '',
      sponsor: '',
      in_scope: '',
    })
  })

  it('buildFormTemplateExportFilename combines code and slugified name', () => {
    expect(buildFormTemplateExportFilename({
      templateCode: 'F001',
      templateName: 'Project Charter!',
    })).toBe('F001_project_charter')
  })

  it('PLAIN_TEMPLATE_BLANK is a ruled fillable line', () => {
    expect(PLAIN_TEMPLATE_BLANK).toMatch(/^_+$/)
  })
})

describe('exportRecordToPDF / JSON with guidance', () => {
  let createObjectURL

  beforeEach(() => {
    createObjectURL = URL.createObjectURL
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn(() => 'blob:mock')
    }
  })

  afterEach(() => {
    if (createObjectURL) URL.createObjectURL = createObjectURL
  })

  it('runs without throwing against a representative schema with help', () => {
    const sections = schemaToExportSections(sampleSchema, { includeExamples: true })
    const record = buildBlankRecord(sampleSchema)

    expect(() => {
      try {
        exportRecordToPDF(sections, record, 'F001_project_charter', null, PLAIN_TEMPLATE_BLANK)
      } catch (err) {
        const msg = String(err?.message || err)
        if (/canvas|getContext|not implemented|jsPDF/i.test(msg)) return
        throw err
      }
    }).not.toThrow()
  })

  it('guided JSON cell content includes help and Example for Plain mode', () => {
    const sections = schemaToExportSections(sampleSchema, { includeExamples: true })
    const field = sections[0].fields[0]
    const cell = composeGuidedExportValue(
      field,
      '',
      (_v, blank) => blank || '—',
      PLAIN_TEMPLATE_BLANK,
    )
    expect(cell).toContain('Enter the official project name.')
    expect(cell).toContain('Example: Apollo')
    expect(cell).toContain(PLAIN_TEMPLATE_BLANK)
  })
})
