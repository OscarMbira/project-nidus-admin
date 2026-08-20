import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchSimLeaderboard, fetchSimScenarioById, formatDate, updateSimScenario, useDisplayId } from '@nidus-admin/shared'
import {
  AdminCard,
  AdminIconActionButton,
  EmptyState,
  LoadingState,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const EDITABLE_FIELDS = ['name', 'description', 'difficulty_level', 'target_role', 'duration_minutes']

function asPrettyJson(value) {
  if (!value) return '—'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function SimScenarioDetailPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showSuccess, showError } = useToast()

  const idParam = searchParams.get('id')
  const { uuid: scenarioId, loading: resolving, error: resolveError } = useDisplayId('sim.scenarios', idParam)
  const startsInEditMode = searchParams.get('edit') === '1'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [scenario, setScenario] = useState(null)
  const [form, setForm] = useState({})
  const [isEditing, setIsEditing] = useState(startsInEditMode)
  const [leaderboardRows, setLeaderboardRows] = useState([])
  const [detailTab, setDetailTab] = useState('details')

  const loadScenario = async () => {
    if (!scenarioId) {
      setError('Scenario ID is missing from the URL.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const [scenarioRes, leaderboardRes] = await Promise.all([
      fetchSimScenarioById(scenarioId),
      fetchSimLeaderboard({ limit: 1000 }),
    ])

    if (scenarioRes.error) {
      setError(scenarioRes.error.message || String(scenarioRes.error))
      setScenario(null)
      setLoading(false)
      return
    }

    setScenario(scenarioRes.data)
    setForm({
      name: scenarioRes.data?.name || '',
      description: scenarioRes.data?.description || '',
      difficulty_level: scenarioRes.data?.difficulty_level || '',
      target_role: scenarioRes.data?.target_role || '',
      duration_minutes: scenarioRes.data?.duration_minutes || '',
      is_active: Boolean(scenarioRes.data?.is_active),
      is_featured: Boolean(scenarioRes.data?.is_featured),
      is_published: Boolean(scenarioRes.data?.is_published),
    })

    if (!leaderboardRes.error) {
      setLeaderboardRows(leaderboardRes.data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (resolving) return
    if (resolveError) {
      setError(resolveError)
      setLoading(false)
      return
    }
    loadScenario()
  }, [scenarioId, resolving, resolveError])

  useEffect(() => {
    setIsEditing(startsInEditMode)
  }, [startsInEditMode])

  const stats = useMemo(() => {
    const scoped = leaderboardRows.filter((row) => {
      const fromColumn = row.scenario_id
      const fromMetadata = row.metadata?.scenario_id || row.metadata?.scenarioId
      return String(fromColumn || fromMetadata || '') === String(scenarioId || '')
    })
    const avgScore = scoped.length
      ? Math.round(scoped.reduce((sum, row) => sum + Number(row.score || 0), 0) / scoped.length)
      : scenario?.average_score || 0

    return {
      completions: scenario?.completions_count ?? scoped.length,
      averageScore: avgScore,
      topScore: scoped.length ? Math.max(...scoped.map((row) => Number(row.score || 0))) : '—',
    }
  }, [leaderboardRows, scenario, scenarioId])

  const handleFieldChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!scenarioId) return
    setSaving(true)
    const payload = {
      ...Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, form[field]])),
      duration_minutes: Number(form.duration_minutes || 0),
      is_active: Boolean(form.is_active),
      is_featured: Boolean(form.is_featured),
      is_published: Boolean(form.is_published),
    }
    const { error: mutationError } = await updateSimScenario(scenarioId, payload)
    setSaving(false)
    if (mutationError) {
      showError(mutationError.message || String(mutationError))
      return
    }
    showSuccess('Scenario updated successfully.')
    setIsEditing(false)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('edit')
      return next
    })
    await loadScenario()
  }

  if (resolving || loading) return <LoadingState message="Loading scenario details..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!scenario) return <EmptyState title="Scenario not found" description="The selected scenario could not be loaded." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">{scenario.name || 'Scenario Detail'}</h1>
          <p className="text-sm text-gray-500">Scenario ID: {scenario.id}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('../sim-scenario-admin', { relative: 'path' })}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Back to list
          </button>
          {!isEditing ? (
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => setIsEditing(true)} />
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Completions" value={stats.completions} />
        <AdminCard title="Average score" value={stats.averageScore} />
        <AdminCard title="Top score" value={stats.topScore} />
        <AdminCard title="Created at" value={formatDate(scenario.created_at)} />
      </div>

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && (
        <AuditDetailsPanel description="How this scenario is classified and when it last changed.">
          <AuditCard title="Identity" description="How this scenario is labelled.">
            <AuditField label="Name" value={scenario.name} />
            <AuditField label="Scenario ID" value={scenario.id} />
          </AuditCard>
          <AuditCard title="Classification" description="Where this scenario sits.">
            <AuditField label="Difficulty" value={scenario.difficulty_level} />
            <AuditField label="Target role" value={scenario.target_role} />
            <AuditField label="Active" value={scenario.is_active ? 'Yes' : 'No'} />
            <AuditField label="Published" value={scenario.is_published ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this scenario was created and last changed.">
            <AuditTimestampPair dateLabel="Created at" value={scenario.created_at} />
            <AuditTimestampPair dateLabel="Last updated" value={scenario.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {detailTab === 'details' && (
      <>
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">Scenario metadata</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {EDITABLE_FIELDS.map((field) => (
            <label key={field} className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">{field.replaceAll('_', ' ')}</span>
              {isEditing ? (
                field === 'description' ? (
                  <textarea
                    value={form[field] ?? ''}
                    onChange={(event) => handleFieldChange(field, event.target.value)}
                    rows={4}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                ) : (
                  <input
                    type={field === 'duration_minutes' ? 'number' : 'text'}
                    value={form[field] ?? ''}
                    onChange={(event) => handleFieldChange(field, event.target.value)}
                    className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                )
              ) : (
                <p className="rounded border border-gray-800 bg-gray-950 px-3 py-2 text-gray-200">{scenario[field] ?? '—'}</p>
              )}
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {['is_active', 'is_featured', 'is_published'].map((flag) => (
            <label key={flag} className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(isEditing ? form[flag] : scenario[flag])}
                disabled={!isEditing}
                onChange={(event) => handleFieldChange(flag, event.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
              />
              {flag.replaceAll('_', ' ')}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">Scenario data</h2>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-gray-950 p-3 text-xs text-gray-200">
            {asPrettyJson(scenario.scenario_data)}
          </pre>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">Learning and skills</h2>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-gray-950 p-3 text-xs text-gray-200">
            {asPrettyJson({
              learning_objectives: scenario.learning_objectives,
              skills_covered: scenario.skills_covered,
              prerequisites: scenario.prerequisites,
            })}
          </pre>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
