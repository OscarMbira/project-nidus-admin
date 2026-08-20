import { describe, it, expect } from 'vitest'
import {
  normalizeCustomColumnDefs,
  mergeColumnOptsWithCustom,
  wbsColumnOpts,
  formatIndustryPlanCell,
  MAX_CUSTOM_COLUMNS,
  isCustomColumnKey,
} from '../industryPlanGridColumns.js'
import {
  normalizeIndustryPlanPayload,
  buildIndustryPlanPayload,
  addIndustryPlanCustomColumn,
  updateIndustryPlanCustomColumn,
  deleteIndustryPlanCustomColumn,
} from '../globalTemplateUtils.js'

describe('industry plan custom columns (v184)', () => {
  it('normalizeCustomColumnDefs caps and assigns stable cf_ ids', () => {
    const defs = normalizeCustomColumnDefs([
      { id: 'cf_abc', label: 'QA pack', type: 'text' },
      { id: 'bad', label: 'X', type: 'number' },
      { label: 'Flag', type: 'yes_no' },
    ])
    expect(defs[0]).toEqual({ id: 'cf_abc', label: 'QA pack', type: 'text' })
    expect(isCustomColumnKey(defs[1].id)).toBe(true)
    expect(defs[1].type).toBe('number')
    expect(defs[2].type).toBe('yes_no')
  })

  it('mergeColumnOptsWithCustom appends custom keys to optional pool', () => {
    const merged = mergeColumnOptsWithCustom(wbsColumnOpts(), [
      { id: 'cf_qa', label: 'QA pack ref', type: 'text' },
    ])
    expect(merged.optionalPool).toContain('cf_qa')
    expect(merged.labels.cf_qa).toBe('QA pack ref')
  })

  it('add / update / delete custom columns and strip values on delete', () => {
    let plan = normalizeIndustryPlanPayload({
      industry_code: 'CONSTRUCTION',
      industry_name: 'Construction',
      phases: [{ phase_number: 1, phase_name: 'Init' }],
      activities: [{ activity_name: 'Pour footing', phase_number: 1 }],
    })

    const added = addIndustryPlanCustomColumn(plan, { label: 'QA pack ref', type: 'text' })
    expect(added.ok).toBe(true)
    plan = added.plan
    expect(plan.ui.custom_column_defs).toHaveLength(1)
    expect(plan.activities[0].custom_fields[added.id]).toBe('')

    plan = {
      ...plan,
      activities: [{
        ...plan.activities[0],
        custom_fields: { [added.id]: 'Foundation QA' },
      }],
    }

    const updated = updateIndustryPlanCustomColumn(plan, added.id, { label: 'QA ref', type: 'text' })
    expect(updated.ok).toBe(true)
    expect(updated.plan.ui.custom_column_defs[0].label).toBe('QA ref')

    const deleted = deleteIndustryPlanCustomColumn(updated.plan, added.id)
    expect(deleted.ok).toBe(true)
    expect(deleted.plan.ui.custom_column_defs).toHaveLength(0)
    expect(deleted.plan.activities[0].custom_fields[added.id]).toBeUndefined()
  })

  it('buildIndustryPlanPayload round-trips custom defs and values', () => {
    let plan = normalizeIndustryPlanPayload({
      industry_code: 'CONSTRUCTION',
      phases: [{ phase_name: 'P1' }],
      activities: [{ activity_name: 'A1' }],
    })
    const added = addIndustryPlanCustomColumn(plan, { label: 'Offset note', type: 'text' })
    plan = {
      ...added.plan,
      activities: [{
        ...added.plan.activities[0],
        custom_fields: { [added.id]: 'note-1' },
      }],
    }
    const built = buildIndustryPlanPayload(plan)
    expect(built.ok).toBe(true)
    expect(built.payload.ui.custom_column_defs[0].label).toBe('Offset note')
    expect(built.payload.activities[0].custom_fields[added.id]).toBe('note-1')

    const again = normalizeIndustryPlanPayload(built.payload)
    expect(again.ui.custom_column_defs).toHaveLength(1)
    expect(again.activities[0].custom_fields[added.id]).toBe('note-1')
  })

  it('formatIndustryPlanCell renders custom field values', () => {
    const defs = [{ id: 'cf_x', label: 'Flag', type: 'yes_no' }]
    expect(formatIndustryPlanCell('cf_x', {
      row: { custom_fields: { cf_x: true } },
      customDefs: defs,
    })).toBe('Yes')
    expect(formatIndustryPlanCell('cf_x', {
      row: { custom_fields: { cf_x: false } },
      customDefs: defs,
    })).toBe('No')
  })

  it('rejects add beyond MAX_CUSTOM_COLUMNS', () => {
    let plan = normalizeIndustryPlanPayload({
      industry_code: 'X',
      phases: [{ phase_name: 'P' }],
    })
    for (let i = 0; i < MAX_CUSTOM_COLUMNS; i += 1) {
      const r = addIndustryPlanCustomColumn(plan, { label: `C${i}`, type: 'text' })
      expect(r.ok).toBe(true)
      plan = r.plan
    }
    const over = addIndustryPlanCustomColumn(plan, { label: 'Too many', type: 'text' })
    expect(over.ok).toBe(false)
  })
})
