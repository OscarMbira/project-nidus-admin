import { describe, expect, it } from 'vitest'
import {
  countsToSeverityMap,
  evaluateErrorReleaseReadiness,
  parseReleaseGateThreshold,
} from './errorReadinessUtils.js'

describe('errorReadinessUtils', () => {
  it('parses comma-separated thresholds', () => {
    expect(parseReleaseGateThreshold('critical,high')).toEqual(['critical', 'high'])
    expect(parseReleaseGateThreshold('critical')).toEqual(['critical'])
  })

  it('blocks when threshold severity has open count', () => {
    const counts = countsToSeverityMap([
      { severity: 'critical', open_count: 2 },
      { severity: 'high', open_count: 1 },
    ])
    const readiness = evaluateErrorReleaseReadiness(counts, 'critical')
    expect(readiness.blocked).toBe(true)
    expect(readiness.blockingSeverities).toEqual(['critical'])
  })

  it('clears when only non-threshold severities are open', () => {
    const counts = countsToSeverityMap([{ severity: 'high', open_count: 3 }])
    const readiness = evaluateErrorReleaseReadiness(counts, 'critical')
    expect(readiness.blocked).toBe(false)
  })
})
