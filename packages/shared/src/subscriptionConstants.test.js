import { describe, expect, it } from 'vitest'
import { formatPlanLabel } from './subscriptionConstants.js'

describe('formatPlanLabel', () => {
  it('formats snake_case plan types', () => {
    expect(formatPlanLabel('professional')).toBe('Professional')
    expect(formatPlanLabel('lifetime_enterprise')).toBe('Lifetime Enterprise')
  })

  it('accepts plan rows without throwing', () => {
    expect(formatPlanLabel({ plan_type: 'starter', plan_name: 'Starter Monthly' })).toBe('Starter')
  })

  it('returns em dash for empty values', () => {
    expect(formatPlanLabel(null)).toBe('—')
    expect(formatPlanLabel('')).toBe('—')
  })
})
