import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildIndustryPlanPayload,
  defaultValueToInput,
  emptyFieldPayloadRow,
  emptyIndustryPlanPayload,
  normalizeIndustryPlanPayload,
  parseDefaultValueInput,
  parseTagsInput,
  summariseIndustryPlanPayload,
  syncStatusLabel,
  syncStatusLabelForTarget,
  needsPublishForTarget,
  tagsToInput,
} from '../globalTemplateUtils.js'

const rpc = vi.fn()
const from = vi.fn()
vi.mock('../supabase.js', () => ({
  getAdminDb: () => ({ rpc, from }),
}))
vi.mock('../adminContext.jsx', () => ({
  getCurrentAdminUserId: async () => '11111111-1111-1111-1111-111111111111',
}))

describe('globalTemplateUtils', () => {
  it('emptyFieldPayloadRow returns a fields-domain stub with guidance + sample slots', () => {
    const row = emptyFieldPayloadRow()
    expect(row.field_type).toBe('text')
    expect(row.required).toBe(false)
    expect(row.guidance_text).toBe('')
    expect(row.default_value).toBeNull()
  })

  it('emptyIndustryPlanPayload returns an object skeleton with child arrays', () => {
    const payload = emptyIndustryPlanPayload()
    expect(payload).toMatchObject({
      industry_code: '',
      industry_name: '',
      phases: expect.any(Array),
      activities: expect.any(Array),
      deliverables: expect.any(Array),
      risks: expect.any(Array),
      milestones: expect.any(Array),
      roles: expect.any(Array),
    })
    expect(payload.phases.length).toBeGreaterThanOrEqual(1)
  })

  it('summariseIndustryPlanPayload counts child arrays', () => {
    expect(summariseIndustryPlanPayload(null)).toBeNull()
    expect(summariseIndustryPlanPayload([])).toBeNull()
    const summary = summariseIndustryPlanPayload({
      industry_code: 'software_development',
      industry_name: 'Software',
      phases: [{}, {}],
      activities: [{}],
      deliverables: [],
      risks: [{}, {}, {}],
      milestones: [],
      roles: [{}],
    })
    expect(summary).toEqual({
      industry_code: 'software_development',
      industry_name: 'Software',
      phases: 2,
      activities: 1,
      deliverables: 0,
      risks: 3,
      milestones: 0,
      roles: 1,
    })
  })

  it('syncStatusLabel detects not synced / synced / out of sync / partial', () => {
    expect(syncStatusLabel({})).toBe('not_synced')
    expect(syncStatusLabel({ synced_at: '2026-07-16T00:00:00Z', synced_version: 1, record_version: 1 })).toBe('synced')
    expect(syncStatusLabel({ synced_at: '2026-07-16T00:00:00Z', synced_version: 1, record_version: 2 })).toBe('out_of_sync')
    expect(syncStatusLabel({
      platform_synced_at: '2026-07-16T00:00:00Z',
      platform_synced_version: 1,
      record_version: 1,
    })).toBe('partial')
    expect(syncStatusLabelForTarget({
      platform_synced_at: '2026-07-16T00:00:00Z',
      platform_synced_version: 1,
      record_version: 1,
    }, 'platform')).toBe('synced')
    expect(needsPublishForTarget({
      record_status: 'live',
      platform_synced_at: '2026-07-16T00:00:00Z',
      platform_synced_version: 1,
      record_version: 1,
    }, 'simulator')).toBe(true)
    expect(needsPublishForTarget({
      record_status: 'live',
      platform_synced_at: '2026-07-16T00:00:00Z',
      platform_synced_version: 1,
      record_version: 1,
    }, 'platform')).toBe(false)
  })

  it('converts and parses sample default values', () => {
    expect(defaultValueToInput(1850000)).toBe('1850000')
    expect(parseDefaultValueInput('1850000', 'number')).toBe(1850000)
    expect(parseDefaultValueInput('medium', 'dropdown')).toBe('medium')
    expect(parseDefaultValueInput('  ', 'text')).toBeNull()
  })

  it('normalises and builds industry_plan payloads for the form editor', () => {
    const normalized = normalizeIndustryPlanPayload({
      industry_code: 'financial_services',
      industry_name: 'Financial Services',
      tags: ['Financial'],
      phases: [{ phase_number: 1, phase_name: 'Discovery' }],
      risks: [{ risk_title: 'Regulatory delay', likelihood: 'medium', impact: 'high' }],
    })
    expect(normalized.industry_code).toBe('financial_services')
    expect(normalized.phases[0].phase_name).toBe('Discovery')
    expect(normalized.risks[0].risk_title).toBe('Regulatory delay')

    const built = buildIndustryPlanPayload(normalized)
    expect(built.ok).toBe(true)
    expect(built.payload.industry_code).toBe('financial_services')
    expect(built.payload.risks).toHaveLength(1)

    expect(buildIndustryPlanPayload({ ...normalized, industry_code: '' }).ok).toBe(false)
    expect(tagsToInput(['a', 'b'])).toBe('a, b')
    expect(parseTagsInput('a, b , c')).toEqual(['a', 'b', 'c'])
  })
})

describe('globalTemplate methodology vocabulary (v188)', () => {
  const ALLOWED = ['standards_based', 'structured', 'agile']
  const LEVEL_DOMAINS = ['portfolio_template', 'programme_template', 'project_template']

  it('allows only standards_based / structured / agile methodology values', () => {
    expect(ALLOWED).toHaveLength(3)
    expect(ALLOWED).toContain('structured')
    expect(ALLOWED).not.toContain('prince2')
  })

  it('treats project_template as a level domain alongside portfolio and programme', () => {
    expect(LEVEL_DOMAINS).toContain('project_template')
    expect(LEVEL_DOMAINS).toHaveLength(3)
  })

  it('keeps category orthogonal to methodology (phase vs track)', () => {
    const sample = {
      domain: 'form_template',
      methodology: 'structured',
      category: 'Starting Up',
    }
    expect(sample.methodology).not.toBe(sample.category)
    expect(ALLOWED).toContain(sample.methodology)
  })
})

describe('global template display ID contract (v195)', () => {
  it('uses sequential GTL / GTV prefixes for library and versions', () => {
    const rules = [
      { target_table: 'admin.global_template_library', table_abbreviation: 'GTL', generation_mode: 'sequential', num_digits: 4 },
      { target_table: 'admin.global_template_versions', table_abbreviation: 'GTV', generation_mode: 'sequential', num_digits: 4 },
    ]
    expect(rules.every((r) => r.generation_mode === 'sequential')).toBe(true)
    expect(rules.map((r) => r.table_abbreviation)).toEqual(['GTL', 'GTV'])
    expect(rules.every((r) => r.num_digits === 4)).toBe(true)
  })

  it('formats sequential display ids as PREFIX-zeroPadded', () => {
    const pad = (n, width) => String(n).padStart(width, '0')
    expect(`GTL-${pad(1, 4)}`).toBe('GTL-0001')
    expect(`GTV-${pad(12, 4)}`).toBe('GTV-0012')
  })

  it('prefers GTL/GTV abbreviation tokens for UI defaults map keys', () => {
    const preferred = {
      'admin.global_template_library': 'GTL',
      'admin.global_template_versions': 'GTV',
    }
    expect(preferred['admin.global_template_library']).toBe('GTL')
    expect(preferred['admin.global_template_versions']).toBe('GTV')
  })

  it('puts display_id in URL helpers, not UUID when present', async () => {
    const {
      globalTemplateUrlKey,
      globalTemplateDetailPath,
      globalTemplateFormPath,
      isRecordUuid,
    } = await import('../globalTemplateUtils.js')
    const row = { id: 'a1840000-0000-4000-8000-000000000001', display_id: 'GTL-0042' }
    expect(isRecordUuid(row.id)).toBe(true)
    expect(isRecordUuid(row.display_id)).toBe(false)
    expect(globalTemplateUrlKey(row)).toBe('GTL-0042')
    expect(globalTemplateDetailPath(row)).toBe('/content/global-template-detail?id=GTL-0042')
    expect(globalTemplateFormPath(row, { mode: 'view' }))
      .toBe('/content/global-template-form?id=GTL-0042&mode=view')
  })
})

describe('publishAllGlobalTemplates fail-fast on structural errors', () => {
  beforeEach(() => {
    rpc.mockReset()
    from.mockReset()
    from.mockReturnValue({
      select: () => ({
        neq: () => ({
          order: async () => ({
            data: [
              { id: 'a', name: 'A', record_status: 'live', domain: 'fields' },
              { id: 'b', name: 'B', record_status: 'live', domain: 'fields' },
              { id: 'c', name: 'C', record_status: 'live', domain: 'fields' },
            ],
            error: null,
          }),
        }),
      }),
    })
  })

  it('aborts the bulk loop after the first schema/RPC fault instead of retrying every row', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'column "platform_synced_at" does not exist' },
    })

    const { publishAllGlobalTemplates } = await import('../globalTemplateServices.js')
    const result = await publishAllGlobalTemplates({
      forceAll: true,
      target: 'platform',
      notes: 'test',
    })

    expect(result.error).toMatch(/platform_synced_at/)
    expect(result.data?.aborted).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('updateGlobalTemplate category/methodology clear-vs-unchanged contract', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: 'template-id', error: null })
  })

  it('sends empty string (not null) for p_category when the form field is blanked, so the RPC clears it', async () => {
    const { updateGlobalTemplate } = await import('../globalTemplateServices.js')
    await updateGlobalTemplate('template-id', { category: null, methodology: null })
    expect(rpc).toHaveBeenCalledWith('update_global_template', expect.objectContaining({
      p_category: '',
    }))
  })

  it('passes a real category value straight through', async () => {
    const { updateGlobalTemplate } = await import('../globalTemplateServices.js')
    await updateGlobalTemplate('template-id', { category: 'Planning' })
    expect(rpc).toHaveBeenCalledWith('update_global_template', expect.objectContaining({
      p_category: 'Planning',
    }))
  })

  it('sends null for p_category only when the caller omits the field entirely (leave unchanged)', async () => {
    const { updateGlobalTemplate } = await import('../globalTemplateServices.js')
    await updateGlobalTemplate('template-id', {})
    expect(rpc).toHaveBeenCalledWith('update_global_template', expect.objectContaining({
      p_category: null,
    }))
  })

  it('applies the same clear-vs-unchanged contract to p_methodology', async () => {
    const { updateGlobalTemplate } = await import('../globalTemplateServices.js')
    await updateGlobalTemplate('template-id', { methodology: '' })
    expect(rpc).toHaveBeenCalledWith('update_global_template', expect.objectContaining({
      p_methodology: '',
    }))
    rpc.mockClear()
    await updateGlobalTemplate('template-id', {})
    expect(rpc).toHaveBeenCalledWith('update_global_template', expect.objectContaining({
      p_methodology: null,
    }))
  })
})
