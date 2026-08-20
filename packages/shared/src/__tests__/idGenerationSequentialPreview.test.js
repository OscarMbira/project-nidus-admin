import { describe, expect, it } from 'vitest'
import {
  buildRandomDateMiddle,
  buildSequentialIdPreview,
  computeSequentialKeyspaceSize,
  describeSequentialCapacity,
  formatPeriodKeyPreview,
  formatRandomPreviewPattern,
  formatRuleModeBadge,
  formatSequentialPreviewPattern,
  isSequentialMode,
} from '../idGenerationSequentialPreview.js'

describe('idGenerationSequentialPreview', () => {
  it('detects sequential mode', () => {
    expect(isSequentialMode({ generation_mode: 'sequential' })).toBe(true)
    expect(isSequentialMode({ generation_mode: 'random' })).toBe(false)
    expect(isSequentialMode({})).toBe(false)
  })

  it('computes sequential keyspace as 10^digits', () => {
    expect(computeSequentialKeyspaceSize(3)).toBe(1000n)
    expect(computeSequentialKeyspaceSize(1)).toBe(10n)
    expect(computeSequentialKeyspaceSize(0)).toBe(0n)
  })

  it('formats period keys for preview', () => {
    const ref = new Date('2026-07-12T12:00:00Z')
    expect(formatPeriodKeyPreview('YYYY', ref)).toBe('2026')
    expect(formatPeriodKeyPreview('YYYYMM', ref)).toBe('202607')
    expect(formatPeriodKeyPreview('YYYYMMDD', ref)).toBe('20260712')
  })

  it('builds sequential preview with date and padded sequence', () => {
    const ref = new Date('2026-01-15T12:00:00Z')
    const preview = buildSequentialIdPreview({
      table_abbreviation: 'RCC',
      separator: '-',
      suffix: '',
      include_date: true,
      date_format: 'YYYY',
      num_digits: 3,
      seed_value: 1,
    }, ref)

    expect(preview).toBe('RCC-2026-001')
  })

  it('builds sequential preview without date', () => {
    const preview = buildSequentialIdPreview({
      table_abbreviation: 'R',
      separator: '-',
      suffix: '',
      include_date: false,
      num_digits: 3,
      seed_value: 42,
    })

    expect(preview).toBe('R-042')
  })

  it('describes scoped and dated capacity', () => {
    expect(describeSequentialCapacity({
      num_digits: 3,
      scope_column: 'risk_register_id',
      include_date: true,
    })).toContain('risk_register_id')

    expect(describeSequentialCapacity({
      num_digits: 2,
      include_date: false,
      scope_column: '',
    })).toContain('100 sequential IDs')
  })

  it('formats rule mode badges', () => {
    expect(formatRuleModeBadge({ generation_mode: 'random' }).label).toBe('Random')
    expect(formatRuleModeBadge({
      generation_mode: 'random',
      include_date: true,
      date_format: 'YYYY',
    }).label).toContain('YYYY')
    expect(formatRuleModeBadge({
      generation_mode: 'sequential',
      include_date: true,
      date_format: 'YYYY',
      scope_column: 'risk_register_id',
    }).label).toContain('Sequential')
  })

  it('formats random preview pattern with optional date', () => {
    expect(formatRandomPreviewPattern({
      segment_type: 'alphanumeric',
      num_letters: 5,
      num_digits: 4,
      separator: '-',
      include_date: false,
    })).toBe('[L5D4]')

    expect(formatRandomPreviewPattern({
      segment_type: 'alphanumeric',
      num_letters: 5,
      num_digits: 4,
      separator: '-',
      include_date: true,
    })).toBe('[DATE]-[L5D4]')
  })

  it('builds random date middle segment for preview', () => {
    const ref = new Date('2026-07-12T12:00:00Z')
    expect(buildRandomDateMiddle({
      include_date: false,
      separator: '-',
    }, ref)).toBe('')

    expect(buildRandomDateMiddle({
      include_date: true,
      date_format: 'YYYY',
      separator: '-',
    }, ref)).toBe('2026-')
  })

  it('formats sequential preview pattern', () => {
    expect(formatSequentialPreviewPattern({
      include_date: true,
      num_digits: 3,
      separator: '-',
    })).toBe('[DATE]-[000]')
  })
})
