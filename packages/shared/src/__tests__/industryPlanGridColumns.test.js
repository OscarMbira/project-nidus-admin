import { describe, it, expect } from 'vitest'
import {
  normalizeColumnLayout,
  moveColumn,
  showColumn,
  hideColumn,
  availableColumns,
  WBS_DEFAULT_SHOWN,
  WBS_OPTIONAL_POOL,
  wbsColumnOpts,
  formatIndustryPlanCell,
} from '../industryPlanGridColumns.js'

const opts = wbsColumnOpts()

describe('industryPlanGridColumns', () => {
  it('normalizeColumnLayout keeps locked prefix/suffix and unique optionals', () => {
    const layout = normalizeColumnLayout(
      ['duration', 'wbs', 'priority', 'duration', 'bogus', '_actions', 'kind', 'name'],
      opts,
    )
    expect(layout.slice(0, 3)).toEqual(['wbs', 'kind', 'name'])
    expect(layout[layout.length - 1]).toBe('_actions')
    expect(layout.filter((k) => k === 'duration')).toHaveLength(1)
    expect(layout).toContain('priority')
    expect(layout).not.toContain('bogus')
  })

  it('normalizeColumnLayout falls back to default when input is not an array', () => {
    expect(normalizeColumnLayout(null, opts)).toEqual(WBS_DEFAULT_SHOWN)
  })

  it('normalizeColumnLayout allows zero optionals when explicitly cleared', () => {
    expect(normalizeColumnLayout(['wbs', 'kind', 'name', '_actions'], opts)).toEqual([
      'wbs', 'kind', 'name', '_actions',
    ])
  })

  it('moveColumn reorders optionals but rejects locked moves', () => {
    const base = ['wbs', 'kind', 'name', 'duration', 'priority', '_actions']
    expect(moveColumn(base, 'duration', 'priority', opts)).toEqual([
      'wbs', 'kind', 'name', 'priority', 'duration', '_actions',
    ])
    expect(moveColumn(base, 'wbs', 'priority', opts)).toEqual(base)
    expect(moveColumn(base, 'priority', '_actions', opts)).toEqual(base)
  })

  it('showColumn / hideColumn and availableColumns', () => {
    let layout = [...WBS_DEFAULT_SHOWN]
    expect(availableColumns(layout, WBS_OPTIONAL_POOL)).toContain('priority')
    layout = showColumn(layout, 'priority', opts)
    expect(layout).toContain('priority')
    expect(layout[layout.length - 1]).toBe('_actions')
    layout = hideColumn(layout, 'priority', opts)
    expect(layout).not.toContain('priority')
    // cannot hide locked
    expect(hideColumn(layout, 'name', opts)).toContain('name')
  })

  it('formatIndustryPlanCell returns dash for inapplicable kind fields', () => {
    expect(formatIndustryPlanCell('phase_number', { kind: 'phases', isPhase: true, row: { phase_number: 1 } })).toBe('—')
    expect(formatIndustryPlanCell('duration', {
      kind: 'activities',
      row: { typical_duration: '2d' },
    })).toBe('2d')
    expect(formatIndustryPlanCell('required_skills', {
      kind: 'activities',
      row: { required_skills: ['A', 'B', 'C'] },
    })).toBe('A, B +1')
  })
})
