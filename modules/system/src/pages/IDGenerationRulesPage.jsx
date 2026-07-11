import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  buildRulesByTargetTable,
  bulkSeedIdGenerationRules,
  deleteIdGenerationRule,
  fetchAvailableTables,
  fetchIdGenerationRuleUsage,
  fetchIdGenerationRules,
  findIdGenerationRuleForTable,
  idGenerationRuleFormPath,
  normalizeTargetTable,
  PermissionGate,
  toggleIdGenerationRule,
} from '@nidus-admin/shared'
import {
  AdminCard,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { buildIdPreview, isDefaultRule } from './idGenerationPreview.js'
import {
  getTableName,
  getTableSchema,
  getSystemMeta,
  matchesRuleTab,
  qualifiedTableName,
  RULE_TABS,
} from './idGenerationConstants.js'

function entrySearchText(entry) {
  const { rule, targetTable, tableName, schema } = entry
  const preview = rule
    ? buildIdPreview({
      table_abbreviation: rule.table_abbreviation,
      separator: rule.separator,
      suffix: rule.suffix,
      segment_type: rule.segment_type,
      letter_case: rule.letter_case,
      num_letters: rule.num_letters,
      num_digits: rule.num_digits,
      excluded_chars: rule.excluded_chars,
    })
    : ''
  const status = !rule ? 'unconfigured' : rule.is_active ? 'active' : 'inactive'

  return [
    tableName,
    targetTable,
    schema,
    rule?.table_abbreviation,
    rule?.table_description,
    rule?.separator,
    preview,
    status,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')
}

function RuleActions({ rule, isBusy, onToggle, onEdit, onDelete }) {
  if (!rule) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50"
      >
        Configure Rule
      </button>
    )
  }

  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        disabled={isBusy}
        onClick={() => onToggle(rule.id)}
        className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60"
      >
        {isBusy ? 'Working...' : 'Toggle'}
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => onDelete(rule)}
        className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50"
      >
        Delete
      </button>
    </div>
  )
}

export default function IDGenerationRulesPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal: confirmModal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState([])
  const [usageByTable, setUsageByTable] = useState({})
  const [availableTables, setAvailableTables] = useState([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [busyId, setBusyId] = useState('')
  const [bulkSeeding, setBulkSeeding] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const [rulesRes, tablesRes, usageRes] = await Promise.all([
      fetchIdGenerationRules({ limit: 10000 }),
      fetchAvailableTables(),
      fetchIdGenerationRuleUsage(),
    ])
    if (rulesRes.error) showError(rulesRes.error.message || String(rulesRes.error))
    if (tablesRes.error) showError(tablesRes.error.message || String(tablesRes.error))
    if (usageRes.error) showError(usageRes.error.message || String(usageRes.error))
    setRules(rulesRes.data || [])
    setAvailableTables(tablesRes.data || [])
    setUsageByTable(Object.fromEntries((usageRes.data || []).map((row) => [row.target_table, row])))
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const rulesByTable = useMemo(
    () => buildRulesByTargetTable(rules),
    [rules],
  )

  const tableEntries = useMemo(() => {
    const seen = new Set()
    const entries = []

    for (const table of availableTables) {
      const targetTable = normalizeTargetTable(qualifiedTableName(table))
      if (seen.has(targetTable)) continue
      seen.add(targetTable)
      entries.push({
        targetTable,
        schema: getTableSchema(targetTable),
        tableName: getTableName(targetTable),
        rule: rulesByTable[targetTable] || null,
      })
    }

    for (const rule of rules) {
      const targetTable = normalizeTargetTable(rule.target_table)
      if (seen.has(targetTable)) continue
      seen.add(targetTable)
      entries.push({
        targetTable,
        schema: getTableSchema(targetTable),
        tableName: getTableName(targetTable),
        rule,
      })
    }

    return entries.sort((a, b) => a.tableName.localeCompare(b.tableName))
  }, [availableTables, rules, rulesByTable])

  const tabEntries = useMemo(
    () => tableEntries.filter((entry) => matchesRuleTab(activeTab, entry.schema)),
    [tableEntries, activeTab],
  )

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase()
    const source = term ? tableEntries : tabEntries
    if (!term) return tabEntries
    return source.filter((entry) => entrySearchText(entry).includes(term))
  }, [tabEntries, tableEntries, search])

  const searchResultsInOtherTabs = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term || activeTab === 'all') return 0
    return tableEntries.filter((entry) => entrySearchText(entry).includes(term)).length
      - tabEntries.filter((entry) => entrySearchText(entry).includes(term)).length
  }, [search, activeTab, tableEntries, tabEntries])

  const counts = useMemo(() => ({
    all: tableEntries.length,
    admin: tableEntries.filter((e) => e.schema === 'admin').length,
    public: tableEntries.filter((e) => e.schema === 'public').length,
    sim: tableEntries.filter((e) => e.schema === 'sim').length,
    configured: rules.filter((r) => r.is_active !== false).length,
    unconfigured: tableEntries.filter((e) => !e.rule).length,
  }), [tableEntries, rules])

  const unconfiguredForScope = useMemo(() => {
    if (activeTab === 'all') return counts.unconfigured
    return tableEntries.filter((entry) => !entry.rule && entry.schema === activeTab).length
  }, [activeTab, counts.unconfigured, tableEntries])

  const activeTabMeta = RULE_TABS.find((tab) => tab.key === activeTab) || RULE_TABS[0]

  const openRuleForm = (targetTable) => {
    const normalized = normalizeTargetTable(targetTable)
    const rule = findIdGenerationRuleForTable(rules, normalized)
    navigate(idGenerationRuleFormPath({ rule, targetTable: normalized }))
  }

  const openEditRule = (rule) => {
    navigate(idGenerationRuleFormPath({ rule }))
  }

  const handleToggle = async (ruleId) => {
    setBusyId(ruleId)
    const { error } = await toggleIdGenerationRule(ruleId)
    setBusyId('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Rule toggled.')
    await loadData()
  }

  const handleDelete = (rule) => {
    confirm({
      title: 'Delete ID generation rule',
      message: `Delete rule for ${getTableName(rule.target_table)}? Generated IDs will remain but new IDs will use defaults.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const { error } = await deleteIdGenerationRule(rule.id)
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Rule deleted.')
        await loadData()
      },
    })
  }

  const handleBulkSeed = () => {
    const schemaFilter = activeTab === 'all' ? null : activeTab
    const scopeLabel = activeTab === 'all'
      ? 'Admin, Platform, and Simulator'
      : (RULE_TABS.find((tab) => tab.key === activeTab)?.label || activeTab)

    confirm({
      title: 'Configure all unconfigured tables',
      message: `Create default ID generation rules for ${unconfiguredForScope} unconfigured table${unconfiguredForScope === 1 ? '' : 's'} in ${scopeLabel}? Each rule uses 5 letters + 4 digits (alpha-numeric, O0I1L excluded) with a unique abbreviation.`,
      confirmLabel: unconfiguredForScope === 0 ? 'Nothing to configure' : `Create ${unconfiguredForScope} rule${unconfiguredForScope === 1 ? '' : 's'}`,
      onConfirm: async () => {
        if (unconfiguredForScope === 0) return

        setBulkSeeding(true)
        const { data, error } = await bulkSeedIdGenerationRules({ schema: schemaFilter })
        setBulkSeeding(false)

        if (error) {
          showError(error)
          return
        }

        const created = Number(data?.created ?? 0)
        const skipped = Number(data?.skipped ?? 0)
        const failed = Number(data?.failed ?? 0)

        if (failed > 0) {
          const firstFailure = (data?.results || []).find((row) => row?.status === 'failed')
          showError(
            firstFailure?.error
              ? `Bulk configure finished with ${failed} failure(s). First error (${firstFailure.target_table}): ${firstFailure.error}`
              : `Bulk configure finished with ${failed} failure(s).`,
          )
        }

        if (created > 0) {
          showSuccess(`Created ${created} ID generation rule${created === 1 ? '' : 's'}.${skipped ? ` ${skipped} already configured.` : ''}`)
        } else if (!failed) {
          showSuccess(`No new rules needed — ${skipped} table${skipped === 1 ? ' was' : 's were'} already configured.`)
        }

        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading ID generation rules..." />
  if (bulkSeeding) return <LoadingState message="Creating default rules for unconfigured tables..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">ID Generation Rules</h1>
          <p className="text-sm text-gray-500">
            Configure human-readable display IDs for admin panel tables and platform/simulator database tables.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end lg:w-auto">
          <PermissionGate permission="system.id_generation.edit">
            <button
              type="button"
              onClick={handleBulkSeed}
              disabled={unconfiguredForScope === 0}
              className="rounded border border-blue-700 bg-blue-900/30 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-900/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Configure all unconfigured ({unconfiguredForScope})
            </button>
          </PermissionGate>
          <button
            type="button"
            onClick={() => openRuleForm('')}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            New Rule
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AdminCard title="All tables" value={counts.all} />
        <AdminCard title="Admin tables" value={counts.admin} />
        <AdminCard title="Platform tables" value={counts.public} />
        <AdminCard title="Simulator tables" value={counts.sim} />
        <AdminCard title="Active rules" value={counts.configured} />
        <AdminCard title="Unconfigured" value={counts.unconfigured} />
      </div>

      <div className="border-b border-gray-700">
        <div className="flex gap-1">
          {RULE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-t border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'border-blue-500 bg-gray-900 text-blue-200'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
              <span className="ml-2 text-xs text-gray-500">({counts[tab.key] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500">{activeTabMeta.description}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search table, abbreviation, preview, or status..."
          className="max-w-xl"
        />
        {search.trim() ? (
          <p className="text-xs text-gray-500">
            Showing {filteredEntries.length} of {search.trim() ? tableEntries.length : tabEntries.length} tables
            {searchResultsInOtherTabs > 0 ? ` (${searchResultsInOtherTabs} more on other tabs — switch to All)` : ''}
          </p>
        ) : null}
      </div>

      {!filteredEntries.length ? (
        <EmptyState
          title="No tables match your search"
          description={
            search.trim() && searchResultsInOtherTabs > 0
              ? 'Try the All tab, or search by qualified name (e.g. public.accounts).'
              : 'Try a different search term or create a new rule for a table in this category.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Database Table</th>
                <th className="px-4 py-3">Abbreviation</th>
                <th className="px-4 py-3">Separator</th>
                <th className="px-4 py-3">Format Preview</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const { rule, targetTable, tableName, schema } = entry
                const systemMeta = getSystemMeta(targetTable)
                const isBusy = rule && busyId === rule.id
                const usage = usageByTable[targetTable]
                const usagePct = usage?.usage_pct != null ? Number(usage.usage_pct) : null
                const preview = rule
                  ? buildIdPreview({
                    table_abbreviation: rule.table_abbreviation,
                    separator: rule.separator,
                    suffix: rule.suffix,
                    segment_type: rule.segment_type,
                    letter_case: rule.letter_case,
                    num_letters: rule.num_letters,
                    num_digits: rule.num_digits,
                    excluded_chars: rule.excluded_chars,
                  })
                  : '—'

                return (
                  <tr key={targetTable} className="border-t border-gray-800">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-gray-100">{tableName}</p>
                        <span className="inline-flex rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400">
                          {systemMeta.badge}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{targetTable}</p>
                      {rule?.table_description && (
                        <p className="text-xs text-gray-500">{rule.table_description}</p>
                      )}
                      {!rule && (
                        <p className="text-xs text-gray-500">No rule configured — default format applies on first use</p>
                      )}
                      {rule && isDefaultRule(rule) && (
                        <span className="mt-1 inline-flex rounded border border-amber-700 bg-amber-900/30 px-2 py-0.5 text-xs text-amber-200">
                          Default
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">{rule?.table_abbreviation || '—'}</td>
                    <td className="px-4 py-3 font-mono text-gray-400">
                      {!rule ? '—' : (rule.separator === '' ? '(none)' : rule.separator)}
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-200">{preview}</td>
                    <td className="px-4 py-3">
                      {!rule || !rule.is_active ? (
                        <span className="text-gray-500">—</span>
                      ) : usagePct == null ? (
                        <span className="text-gray-500">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={usagePct >= 70 ? 'text-amber-200' : 'text-gray-300'}>
                            {usagePct}%
                          </span>
                          {usagePct >= 70 && (
                            <span className="inline-flex rounded border border-amber-700 bg-amber-900/30 px-2 py-0.5 text-xs text-amber-200">
                              {usagePct >= 100 ? 'Saturated' : 'High'}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!rule ? (
                        <span className="inline-flex rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                          Unconfigured
                        </span>
                      ) : (
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${rule.is_active ? 'border-green-700 bg-green-900/40 text-green-300' : 'border-gray-600 bg-gray-800 text-gray-300'}`}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RuleActions
                        rule={rule}
                        isBusy={isBusy}
                        onToggle={handleToggle}
                        onEdit={() => (rule ? openEditRule(rule) : openRuleForm(targetTable))}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmModal}
    </div>
  )
}
