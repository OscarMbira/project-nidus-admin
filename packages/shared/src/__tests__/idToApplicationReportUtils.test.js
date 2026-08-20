import { describe, expect, it } from 'vitest'
import {
  buildIdToApplicationReportRow,
  buildIdToApplicationReportRows,
  extractTableAbbreviationFromDisplayId,
  filterIdToApplicationReportRows,
  resolveApplicationFromTargetTable,
  summarizeIdToApplicationReport,
} from '../idToApplicationReportUtils.js'

describe('idToApplicationReportUtils', () => {
  it('extracts table abbreviation from display id when needed elsewhere', () => {
    expect(extractTableAbbreviationFromDisplayId('ADU-9Z9J6XM')).toBe('ADU')
    expect(extractTableAbbreviationFromDisplayId('SXPS-U9N4ZS83D')).toBe('SXPS')
  })

  it('resolves application from target table schema', () => {
    expect(resolveApplicationFromTargetTable('admin.admin_users')).toBe('Admin')
    expect(resolveApplicationFromTargetTable('public.projects')).toBe('Platform')
    expect(resolveApplicationFromTargetTable('sim.scenarios')).toBe('Simulator')
  })

  it('builds one report row per id generation rule', () => {
    const row = buildIdToApplicationReportRow({
      table_abbreviation: 'AR',
      target_table: 'public.acceptance_records',
      table_description: 'Acceptance Records',
    })

    expect(row.table_abbreviation).toBe('AR')
    expect(row.application).toBe('Platform')
    expect(row.target_table).toBe('public.acceptance_records')
    expect(row.table_name).toBe('acceptance_records')
    expect(row.table_description).toBe('Acceptance Records')
  })

  it('summarizes and filters unique rule rows', () => {
    const rows = buildIdToApplicationReportRows([
      {
        table_abbreviation: 'ADU',
        target_table: 'admin.admin_users',
      },
      {
        table_abbreviation: 'PRJ',
        target_table: 'public.projects',
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.table_abbreviation)).toEqual(['ADU', 'PRJ'])

    const summary = summarizeIdToApplicationReport(rows)
    expect(summary.total).toBe(2)
    expect(summary.byApplication.Admin).toBe(1)
    expect(summary.byApplication.Platform).toBe(1)

    const filtered = filterIdToApplicationReportRows(rows, {
      application: 'Platform',
      search: 'PRJ',
    })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].table_abbreviation).toBe('PRJ')
  })
})
