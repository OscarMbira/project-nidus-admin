import { describe, expect, it } from 'vitest'
import {
  buildPortfolioTemplatePayload,
  buildProgrammeTemplatePayload,
  emptyPortfolioTemplatePayload,
  emptyProgrammeTemplatePayload,
  normalizePortfolioTemplatePayload,
  normalizeProgrammeTemplatePayload,
} from '../globalTemplateUtils.js'

describe('portfolio / programme template payloads (v187)', () => {
  it('emptyPortfolioTemplatePayload has overview defaults and empty lists', () => {
    const p = emptyPortfolioTemplatePayload()
    expect(p.template_code).toBe('')
    expect(p.portfolio_type).toBe('strategic')
    expect(p.objectives).toEqual([])
    expect(p.risks).toEqual([])
    expect(p.roles).toEqual([])
  })

  it('emptyProgrammeTemplatePayload has overview defaults and empty lists', () => {
    const p = emptyProgrammeTemplatePayload()
    expect(p.template_code).toBe('')
    expect(p.programme_type).toBe('transformation')
    expect(p.milestones).toEqual([])
    expect(p.dependencies).toEqual([])
  })

  it('normalize + build portfolio round-trip keeps curated rows', () => {
    const normalized = normalizePortfolioTemplatePayload({
      template_code: 'PT-1',
      portfolio_type: 'innovation',
      objectives: [{ objective_name: 'Grow', importance_score: '4' }],
      risks: [{ risk_title: 'Adoption' }],
      roles: [{ role_title: 'Owner', is_key_role: true }],
    })
    const built = buildPortfolioTemplatePayload(normalized)
    expect(built.ok).toBe(true)
    expect(built.payload.template_code).toBe('PT-1')
    expect(built.payload.objectives).toHaveLength(1)
    expect(built.payload.risks[0].risk_title).toBe('Adoption')
    expect(built.payload.roles[0].is_key_role).toBe(true)

    const again = normalizePortfolioTemplatePayload(built.payload)
    expect(again.objectives[0].objective_name).toBe('Grow')
  })

  it('buildPortfolioTemplatePayload requires template_code', () => {
    expect(buildPortfolioTemplatePayload(emptyPortfolioTemplatePayload()).ok).toBe(false)
  })

  it('normalize + build programme round-trip', () => {
    const normalized = normalizeProgrammeTemplatePayload({
      template_code: 'PG-1',
      milestones: [{ milestone_name: 'Gate 1', start_offset_days: '14' }],
      benefits: [{ benefit_name: 'Compliance', category: 'compliance' }],
      dependencies: [{ dependency_description: 'Legal policy' }],
    })
    const built = buildProgrammeTemplatePayload(normalized)
    expect(built.ok).toBe(true)
    expect(built.payload.milestones).toHaveLength(1)
    expect(built.payload.benefits[0].category).toBe('compliance')
    expect(built.payload.dependencies[0].dependency_description).toBe('Legal policy')
  })

  it('buildProgrammeTemplatePayload requires template_code', () => {
    expect(buildProgrammeTemplatePayload(emptyProgrammeTemplatePayload()).ok).toBe(false)
  })

  it('curated seed shapes (v184) build successfully — publish-ready', () => {
    const portfolioSeed = normalizePortfolioTemplatePayload({
      template_code: 'PT-TECH-01',
      portfolio_type: 'strategic',
      governance_model: 'steering_committee',
      review_frequency: 'monthly',
      description: 'Guides technology transformation portfolios',
      objectives: [{ objective_code: 'OBJ-01', objective_name: 'Modernise core platforms', importance_score: '5' }],
      governance: [{ board_name: 'Technology Portfolio Board', decision_making_process: 'Monthly board' }],
      benefit_categories: [{ category: 'financial' }, { category: 'operational' }],
      risks: [{ risk_title: 'Low adoption of new platforms', likelihood: 'medium', impact: 'high' }],
      metrics: [{ kpi_name: 'Active platform users', target: '2500' }],
      roles: [{ role_title: 'Portfolio Manager', is_key_role: true }],
    })
    const portfolioBuilt = buildPortfolioTemplatePayload(portfolioSeed)
    expect(portfolioBuilt.ok).toBe(true)
    expect(portfolioBuilt.payload.objectives.length).toBeGreaterThan(0)
    expect(portfolioBuilt.payload.risks.length).toBeGreaterThan(0)

    const programmeSeed = normalizeProgrammeTemplatePayload({
      template_code: 'PG-REG-01',
      programme_type: 'compliance',
      milestones: [{ milestone_name: 'Regulatory gap assessment complete' }],
      dependencies: [{ dependency_description: 'Policy updates from Legal' }],
      benefits: [{ benefit_name: 'Reduced regulatory findings', category: 'compliance' }],
      risks: [{ risk_title: 'Interpretation of regulation changes mid-programme' }],
      roles: [{ role_title: 'Programme Manager', is_key_role: true }],
    })
    const programmeBuilt = buildProgrammeTemplatePayload(programmeSeed)
    expect(programmeBuilt.ok).toBe(true)
    expect(programmeBuilt.payload.milestones.length).toBeGreaterThan(0)
    expect(programmeBuilt.payload.benefits[0].category).toBe('compliance')
  })
})
