/**
 * AI Centre (monorepo v1272 Phase 3, PRD D14, D27, story 47) — Assessor Calibration.
 * Per scenario: rubric, how many AI assessments exist, calibration progress (≥ 30 author-scored,
 * ≥ 80% within ±1 level), whether the Assessor counts toward the score, difficulty range, open flags.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchSimAiScenarios, getDisplayRowNumber, PermissionGate } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminIconActionButton,
  AdminRowActions,
  AdminTable,
  EmptyState,
  ExportListMenu,
  LoadingState,
  RowNumberBadge,
  SearchBar,
  ViewToggle,
  useToast,
} from '@nidus-admin/ui'

const VIEW_KEY = 'nidus.admin.aiAssessor.view'
export const scenarioPath = (id, tab = null, view = false) => `/ai/assessor-scenario?id=${id}${tab ? `&tab=${tab}` : ''}${view ? '&view=1' : ''}`

function readView() {
  try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' }
}

export default function AiAssessorPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = params.get('filter') || ''
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)

  useEffect(() => {
    fetchSimAiScenarios().then(({ data, error }) => {
      if (error) showError(String(error))
      setRows(data)
      setLoading(false)
    })
  }, [])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  const list = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows
      .filter((r) => !filter || (filter === 'flags' ? r.open_flags > 0 : filter === 'counts' ? r.assessor_counts : filter === 'no_rubric' ? !r.criteria : true))
      .filter((r) => !term || String(r.name || '').toLowerCase().includes(term))
      .map((r) => ({
        ...r,
        calibrated: r.calibration?.calibrated_assessments || 0,
        agreement: r.calibration?.agreement,
        scoring: r.assessor_counts ? `Counts ${Number(r.assessor_weight)}%` : 'Advisory',
        range: `${r.min_difficulty}–${r.max_difficulty}${r.adaptive_enabled ? '' : ' (fixed)'}`,
      }))
  }, [rows, search, filter])

  const setFilter = (f) => setParams(f ? { filter: f } : {})
  const exportRows = list.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: list.length || 1 }) }))
  const actions = (r) => (
    <AdminRowActions>
      <AdminIconActionButton variant="view" label="View" onClick={() => navigate(scenarioPath(r.id, null, true))} />
      <PermissionGate permission="ai.simulator.author">
        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(scenarioPath(r.id))} />
      </PermissionGate>
    </AdminRowActions>
  )
  const calib = (r) => `${r.calibrated}/30${r.agreement != null ? ` · ${r.agreement}%` : ''}`

  if (loading) return <LoadingState message="Loading scenarios..." />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">AI Assessor calibration</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          The Assessor is advisory until a scenario is calibrated: 30 assessments scored by an author, with at least 80% of criterion levels within one level of the Assessor. Then the scenario can count it toward the score with a weight.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminCard title="Scenarios" value={rows.length} onClick={() => setFilter('')} />
        <AdminCard title="Without a rubric" value={rows.filter((r) => !r.criteria).length} onClick={() => setFilter('no_rubric')} />
        <AdminCard title="Counting toward score" value={rows.filter((r) => r.assessor_counts).length} onClick={() => setFilter('counts')} />
        <AdminCard title="With open learner flags" value={rows.filter((r) => r.open_flags > 0).length} onClick={() => setFilter('flags')} />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
        {filter && <button type="button" onClick={() => setFilter('')} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-300">Clear filter ✕</button>}
        <SearchBar value={search} onChange={setSearch} placeholder="Search scenarios..." />
        <ExportListMenu columns={[{ key: '#', label: '#' }, { key: 'name', label: 'Scenario' }, { key: 'criteria', label: 'Criteria' }, { key: 'assessments', label: 'Assessments' },
          { key: 'calibrated', label: 'Author-scored' }, { key: 'agreement', label: 'Agreement %' }, { key: 'scoring', label: 'Assessor' }, { key: 'range', label: 'Difficulty' }, { key: 'open_flags', label: 'Open flags' }]}
          data={exportRows} baseFilename="sim_assessor_calibration" disabled={!exportRows.length} />
        <ViewToggle view={view} onChange={setView} />
      </div>
      {!list.length ? (
        <EmptyState title="No scenarios" description="Nothing matches." />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r, i) => (
            <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: list.length })} />
                <AdminBadge label={r.scoring} variant={r.assessor_counts ? 'active' : 'archived'} />
              </div>
              <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">{r.name}</p>
              <p className="text-gray-500 dark:text-gray-400">{r.criteria} criteria · {r.assessments} assessments · calibration {calib(r)}</p>
              <p className="text-gray-500 dark:text-gray-400">Difficulty {r.range}{r.open_flags ? ` · ${r.open_flags} open flag(s)` : ''}</p>
              <div className="mt-2">{actions(r)}</div>
            </div>
          ))}
        </div>
      ) : (
        <AdminTable
          rows={list}
          pageSize={25}
          columns={[
            { key: 'name', label: 'Scenario', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'criteria', label: 'Criteria' },
            { key: 'assessments', label: 'Assessments' },
            { key: 'calibrated', label: 'Calibration', render: calib },
            { key: 'scoring', label: 'Assessor', render: (r) => <AdminBadge label={r.scoring} variant={r.assessor_counts ? 'active' : 'archived'} /> },
            { key: 'range', label: 'Difficulty' },
            { key: 'open_flags', label: 'Flags' },
            { key: 'actions', label: 'Actions', sortable: false, render: actions },
          ]}
        />
      )}
    </div>
  )
}
