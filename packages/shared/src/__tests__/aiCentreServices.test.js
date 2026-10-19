// AI Centre (monorepo v1272) — AI Centre pure helpers: organisation status, usage %, settings validation.
import { describe, it, expect, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({ getPublicDb: () => ({ rpc }) }))
import {
  aiOrgState,
  aiUsagePercent,
  fetchAiOrganisation,
  updateAiOrganisation,
  validateAiSettings,
  validateModelRouting,
} from '../aiCentreServices.js'

const good = {
  kill_switch: false, kill_switch_reason: '', credit_unit_usd: 0.001, warn_percent: 80, default_trial_credits: 300,
  conversation_retention_months: 12, audit_retention_months: 24, retention_min_months: 1, retention_max_months: 60,
  max_agent_iterations: 8, query_row_cap: 500, query_timeout_ms: 8000,
}

describe('aiUsagePercent / aiOrgState', () => {
  it('returns null without an allowance', () => {
    expect(aiUsagePercent({ allowance: 0, used: 5 })).toBeNull()
  })
  it('rounds the share used', () => {
    expect(aiUsagePercent({ allowance: 300, used: 100 })).toBe(33)
  })
  it('puts an Admin disable first, then the notice, then the org switch, then credits', () => {
    expect(aiOrgState({ admin_ai_disabled: true, consent_accepted_at: 'x', ai_enabled: true })).toBe('disabled')
    expect(aiOrgState({ ai_enabled: true })).toBe('no_notice')
    expect(aiOrgState({ consent_accepted_at: 'x', ai_enabled: false })).toBe('off')
    expect(aiOrgState({ consent_accepted_at: 'x', ai_enabled: true, allowance: 10, used: 10 })).toBe('at_limit')
    expect(aiOrgState({ consent_accepted_at: 'x', ai_enabled: true, allowance: 10, used: 2 })).toBe('on')
  })
})

describe('validateAiSettings', () => {
  it('accepts sensible settings', () => {
    expect(validateAiSettings(good)).toEqual({})
  })
  it('keeps the defaults inside the min/max', () => {
    expect(validateAiSettings({ ...good, conversation_retention_months: 72 })).toHaveProperty('conversation_retention_months')
    expect(validateAiSettings({ ...good, retention_max_months: 0 })).toHaveProperty('retention_max_months')
  })
  it('needs a reason when the kill switch is on', () => {
    expect(validateAiSettings({ ...good, kill_switch: true })).toHaveProperty('kill_switch_reason')
    expect(validateAiSettings({ ...good, kill_switch: true, kill_switch_reason: 'incident' })).toEqual({})
  })
  it('rejects a zero credit unit and an out-of-range warning level', () => {
    const e = validateAiSettings({ ...good, credit_unit_usd: 0, warn_percent: 100 })
    expect(e).toHaveProperty('credit_unit_usd')
    expect(e).toHaveProperty('warn_percent')
  })
})

describe('validateModelRouting', () => {
  const routing = {
    approved_models: ['m-small', 'm-big'],
    model_routing: 'm-small', model_quick: 'm-small', model_agent: 'm-big',
    model_prices: { 'm-small': { input: 0.1, output: 0.5 }, 'm-big': { input: 2, output: 10 } },
  }
  it('accepts approved, priced models', () => {
    expect(validateModelRouting(routing)).toEqual({})
  })
  it('rejects a routed model that is not approved', () => {
    expect(validateModelRouting({ ...routing, model_agent: 'm-other' })).toHaveProperty('model_agent')
  })
  it('needs a price for every approved model', () => {
    expect(validateModelRouting({ ...routing, model_prices: { 'm-small': { input: 0.1, output: 0.5 } } })).toHaveProperty(['price:m-big'])
  })
})

describe('organisation RPC wrappers', () => {
  it('finds an organisation by account code, case-insensitively', async () => {
    rpc.mockResolvedValueOnce({ data: [{ account_id: 'id-1', account_code: 'ACC-0001' }], error: null })
    const { data } = await fetchAiOrganisation('acc-0001')
    expect(data.account_id).toBe('id-1')
  })
  it('sends retention values only when overriding', async () => {
    rpc.mockResolvedValueOnce({ data: {}, error: null })
    await updateAiOrganisation('id-1', { retention_admin_override: false, conversation_retention_months: 3, credit_allowance_override: '' }, 'why')
    const params = rpc.mock.calls.at(-1)[1]
    expect(params.p_conversation_retention_months).toBeNull()
    expect(params.p_credit_allowance_override).toBeNull()
    expect(params.p_reason).toBe('why')
  })
})

describe('validateRubricCriterion (Simulator AI authoring)', async () => {
  const { validateRubricCriterion } = await import('../aiCentreServices.js')
  const levels = [1, 2, 3, 4].map((level) => ({ level, descriptor: `Level ${level}` }))
  it('accepts a complete criterion', () => {
    expect(validateRubricCriterion({ criterion_key: 'risk_handling', title: 'Risk handling', weight: 2, levels })).toEqual({})
  })
  it('needs a snake_case key, a title, a positive weight and four described levels', () => {
    const e = validateRubricCriterion({ criterion_key: 'Risk Handling', title: '', weight: 0, levels: levels.slice(0, 3) })
    expect(Object.keys(e).sort()).toEqual(['criterion_key', 'levels', 'title', 'weight'])
  })
})
