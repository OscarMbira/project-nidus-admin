import { describe, it, expect } from 'vitest'
import {
  buildIndustryPlanPayload,
  emptyIndustryActivityRow,
  emptyIndustryDeliverableRow,
  emptyIndustryMilestoneRow,
  emptyIndustryPhaseRow,
  normalizeIndustryPlanPayload,
} from '../globalTemplateUtils.js'

describe('industry plan planning-default fields', () => {
  it('factories default priority/hours/cost/offset to blank and locked to false', () => {
    for (const factory of [emptyIndustryPhaseRow, emptyIndustryActivityRow, emptyIndustryDeliverableRow, emptyIndustryMilestoneRow]) {
      const row = factory(1)
      expect(row.priority).toBe('')
      expect(row.planned_hours).toBe('')
      expect(row.planned_cost).toBe('')
      expect(row.is_locked).toBe(false)
      expect(row.start_offset_days).toBe('')
    }
  })

  it('normalize rejects an invalid priority and coerces non-numeric hours/cost/offset to blank', () => {
    const normalized = normalizeIndustryPlanPayload({
      industry_code: 'construction',
      phases: [{ phase_name: 'Design', priority: 'not-a-priority', planned_hours: 'abc', planned_cost: '12.5', start_offset_days: '10', is_locked: 'yes' }],
    })
    const [phase] = normalized.phases
    expect(phase.priority).toBe('')
    expect(phase.planned_hours).toBe('')
    expect(phase.planned_cost).toBe(12.5)
    expect(phase.start_offset_days).toBe(10)
    expect(phase.is_locked).toBe(true)
  })

  it('normalize accepts a valid priority', () => {
    const normalized = normalizeIndustryPlanPayload({
      industry_code: 'construction',
      phases: [{ phase_name: 'Design', priority: 'HIGH' }],
    })
    expect(normalized.phases[0].priority).toBe('high')
  })

  it('build publishes planning defaults as null when unset, never 0, across all four row kinds', () => {
    const result = buildIndustryPlanPayload({
      industry_code: 'construction',
      phases: [{ phase_name: 'Design' }],
      activities: [{ activity_name: 'Draft drawings' }],
      deliverables: [{ deliverable_name: 'IFC set' }],
      milestones: [{ milestone_name: 'Design freeze' }],
    })
    expect(result.ok).toBe(true)
    for (const key of ['phases', 'activities', 'deliverables', 'milestones']) {
      const [row] = result.payload[key]
      expect(row.priority).toBeNull()
      expect(row.planned_hours).toBeNull()
      expect(row.planned_cost).toBeNull()
      expect(row.start_offset_days).toBeNull()
      expect(row.is_locked).toBe(false)
    }
  })

  it('build carries a set planning default through untouched', () => {
    const result = buildIndustryPlanPayload({
      industry_code: 'construction',
      phases: [{ phase_name: 'Construction', priority: 'critical', planned_hours: 400, planned_cost: 250000, start_offset_days: 90, is_locked: true }],
    })
    const [phase] = result.payload.phases
    expect(phase.priority).toBe('critical')
    expect(phase.planned_hours).toBe(400)
    expect(phase.planned_cost).toBe(250000)
    expect(phase.start_offset_days).toBe(90)
    expect(phase.is_locked).toBe(true)
  })
})

describe('activity required_skills', () => {
  it('factory defaults to an empty array', () => {
    expect(emptyIndustryActivityRow(1).required_skills).toEqual([])
  })

  it('normalize trims entries and drops blanks', () => {
    const normalized = normalizeIndustryPlanPayload({
      industry_code: 'construction',
      activities: [{ activity_name: 'Steel erection', required_skills: [' Structural engineering ', '', 'Site supervision'] }],
    })
    expect(normalized.activities[0].required_skills).toEqual(['Structural engineering', 'Site supervision'])
  })

  it('normalize tolerates a non-array value', () => {
    const normalized = normalizeIndustryPlanPayload({
      industry_code: 'construction',
      activities: [{ activity_name: 'Steel erection', required_skills: 'not-an-array' }],
    })
    expect(normalized.activities[0].required_skills).toEqual([])
  })

  it('build publishes the normalized skills list', () => {
    const result = buildIndustryPlanPayload({
      industry_code: 'construction',
      phases: [{ phase_name: 'Construction' }],
      activities: [{ activity_name: 'Steel erection', required_skills: ['Structural engineering', 'Site supervision'] }],
    })
    expect(result.payload.activities[0].required_skills).toEqual(['Structural engineering', 'Site supervision'])
  })
})
