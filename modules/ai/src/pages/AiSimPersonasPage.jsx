/**
 * AI Centre (monorepo v1272 Phase 3, PRD D15, story 47) — Simulator stakeholder personas.
 * Each NPC's goals, concerns, priorities and red lines drive how the AI stakeholder replies and how
 * its trust in the learner moves. Personas are shared by every scenario.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSimAiPersonas, getDisplayRowNumber, PermissionGate } from '@nidus-admin/shared'
import {
  AdminBadge,
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

const VIEW_KEY = 'nidus.admin.aiSimPersonas.view'
const countLines = (v) => String(v || '').split(/\r?\n/).filter((s) => s.trim()).length
export const personaPath = (r, view = false) => `/ai/sim-persona?role=${encodeURIComponent(r.role_name)}${view ? '&view=1' : ''}`

function readView() {
  try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' }
}

export default function AiSimPersonasPage() {
  const navigate = useNavigate()
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)

  useEffect(() => {
    fetchSimAiPersonas().then(({ data, error }) => {
      if (error) showError(String(error))
      setRows(data)
      setLoading(false)
    })
  }, [])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  const list = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows
      .filter((r) => !term || [r.character_name, r.role_name, r.personality].some((v) => String(v ?? '').toLowerCase().includes(term)))
      .map((r) => ({ ...r, role_label: String(r.role_name || '').replace(/_/g, ' '), filled: countLines(r.goals) + countLines(r.concerns) + countLines(r.priorities) + countLines(r.red_lines) }))
  }, [rows, search])

  const exportRows = list.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: list.length || 1 }) }))
  const actions = (r) => (
    <AdminRowActions>
      <AdminIconActionButton variant="view" label="View" onClick={() => navigate(personaPath(r, true))} />
      <PermissionGate permission="ai.simulator.author">
        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(personaPath(r))} />
      </PermissionGate>
    </AdminRowActions>
  )
  const persona = (r) => (r.filled ? `${r.filled} point(s)` : <span className="text-amber-700 dark:text-amber-300">Not written yet</span>)

  if (loading) return <LoadingState message="Loading stakeholders..." />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Stakeholder personas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">How each Simulator stakeholder thinks: their goals, concerns, priorities and red lines. The AI stakeholder replies in character and remembers the learner's decisions within a run.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search stakeholders..." />
          <ExportListMenu columns={[{ key: '#', label: '#' }, { key: 'character_name', label: 'Name' }, { key: 'role_label', label: 'Role' },
            { key: 'personality', label: 'Personality' }, { key: 'goals', label: 'Goals' }, { key: 'concerns', label: 'Concerns' },
            { key: 'priorities', label: 'Priorities' }, { key: 'red_lines', label: 'Red lines' }]}
            data={exportRows} baseFilename="sim_stakeholder_personas" disabled={!exportRows.length} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>
      {!list.length ? (
        <EmptyState title="No stakeholders" description="Run monorepo SQL v540 and v1285." />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r, i) => (
            <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: list.length })} />
                <AdminBadge label={r.personality} variant="active" />
              </div>
              <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">{r.character_name}</p>
              <p className="capitalize text-gray-500 dark:text-gray-400">{r.role_label}</p>
              <p className="text-gray-500 dark:text-gray-400">Persona: {persona(r)}</p>
              <div className="mt-2">{actions(r)}</div>
            </div>
          ))}
        </div>
      ) : (
        <AdminTable
          rows={list}
          pageSize={25}
          columns={[
            { key: 'character_name', label: 'Name', render: (r) => <span className="font-medium">{r.character_name}</span> },
            { key: 'role_label', label: 'Role', render: (r) => <span className="capitalize">{r.role_label}</span> },
            { key: 'personality', label: 'Personality' },
            { key: 'filled', label: 'Persona', render: persona },
            { key: 'actions', label: 'Actions', sortable: false, render: actions },
          ]}
        />
      )}
    </div>
  )
}
