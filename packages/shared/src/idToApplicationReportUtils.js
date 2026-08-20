import { getTargetTableName, getTargetTableSchema } from './idGenerationRuleUtils.js'

const DISPLAY_ID_PARTS_RE = /^([A-Za-z]{1,4})([^A-Za-z0-9]?)([\s\S]+)$/

export const APPLICATION_LABELS = {
  admin: 'Admin',
  public: 'Platform',
  sim: 'Simulator',
}

export function extractTableAbbreviationFromDisplayId(displayId) {
  const id = String(displayId || '').trim()
  if (!id) return ''

  const match = id.match(DISPLAY_ID_PARTS_RE)
  if (!match) return id.slice(0, 4).toUpperCase()

  return (match[1] || '').toUpperCase()
}

export function extractDisplayIdCodeReference(displayId) {
  const id = String(displayId || '').trim()
  if (!id) return ''

  const match = id.match(DISPLAY_ID_PARTS_RE)
  if (!match) return id

  return match[3] || id
}

export function resolveApplicationFromTargetTable(targetTable) {
  const schema = getTargetTableSchema(targetTable)
  return APPLICATION_LABELS[schema] || schema
}

export function buildIdToApplicationReportRow(rule) {
  const targetTable = rule.target_table || ''
  return {
    table_abbreviation: String(rule.table_abbreviation || '').toUpperCase(),
    application: resolveApplicationFromTargetTable(targetTable),
    target_table: targetTable,
    table_name: getTargetTableName(targetTable),
    table_description: rule.table_description || '',
  }
}

export function buildIdToApplicationReportRows(rules = []) {
  return (rules || [])
    .map(buildIdToApplicationReportRow)
    .sort((a, b) => a.target_table.localeCompare(b.target_table))
}

export function summarizeIdToApplicationReport(rows = []) {
  const summary = {
    total: rows.length,
    byApplication: {},
    byTable: {},
  }

  for (const row of rows) {
    summary.byApplication[row.application] = (summary.byApplication[row.application] || 0) + 1
    summary.byTable[row.target_table] = (summary.byTable[row.target_table] || 0) + 1
  }

  return summary
}

export function filterIdToApplicationReportRows(rows = [], { search = '', application = 'all', table = 'all' } = {}) {
  const term = String(search || '').trim().toLowerCase()

  return rows.filter((row) => {
    if (application !== 'all' && row.application !== application) return false
    if (table !== 'all' && row.target_table !== table) return false
    if (!term) return true

    return [
      row.table_abbreviation,
      row.application,
      row.target_table,
      row.table_name,
      row.table_description,
    ].some((value) => String(value || '').toLowerCase().includes(term))
  })
}

export const ID_TO_APPLICATION_REPORT_COLUMNS = [
  { key: 'table_abbreviation', label: 'Table Abbreviation' },
  { key: 'application', label: 'Application' },
  { key: 'target_table', label: 'Target Table' },
  { key: 'table_name', label: 'Table Name' },
  { key: 'table_description', label: 'Table Description' },
]
