/**
 * AI Centre (monorepo v1272 Phase 3, PRD D15) — one Simulator stakeholder's persona.
 * Route: /ai/sim-persona?role=<role_name>[&view=1] (friendly key, Admin rule 13.1).
 * Saved through admin_sim_ai_update_persona (ai.simulator.author, audited, reason required).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchSimAiPersonas, PermissionGate, updateSimAiPersona, useUnsavedChangesGuard } from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminMultiLineListInput,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { personaPath } from './AiSimPersonasPage.jsx'

const PERSONALITIES = ['balanced', 'cautious', 'demanding', 'optimistic', 'supportive']
const LIST_FIELDS = [
  ['goals', 'Goals', 'What they want from the project'],
  ['concerns', 'Concerns', 'What worries them'],
  ['priorities', 'Priorities', 'What they care about most, in order'],
  ['red_lines', 'Red lines', 'What they will not accept — ignoring these lowers their trust fast'],
]
const toForm = (r) => ({
  personality: r?.personality || 'balanced', communication_style: r?.communication_style || '',
  goals: r?.goals || '', concerns: r?.concerns || '', priorities: r?.priorities || '', red_lines: r?.red_lines || '', persona_notes: r?.persona_notes || '',
})

export default function AiSimPersonaPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const role = params.get('role')
  const isViewOnly = params.get('view') === '1'
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState(null)
  const [form, setForm] = useState(toForm(null))
  const [baseline, setBaseline] = useState(toForm(null))
  const [tab, setTab] = useState('details')

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchSimAiPersonas()
    if (error) showError(String(error))
    const found = data.find((r) => r.role_name === role || r.id === role) || null
    setRecord(found)
    setForm(toForm(found))
    setBaseline(toForm(found))
    setLoading(false)
  }
  useEffect(() => { load() }, [role])

  const isDirty = useMemo(() => !isViewOnly && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved persona changes.')
  const goBack = () => requestNavigation('/ai/sim-personas')
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === 'string' ? v : v.target.value }))

  const save = (e) => {
    e.preventDefault()
    const changes = Object.fromEntries(Object.keys(form).filter((k) => form[k] !== baseline[k]).map((k) => [k, form[k]]))
    confirm({
      title: `Save ${record.character_name}'s persona?`,
      message: 'New runs and new replies use the updated persona straight away. Memory in runs already in progress is kept.',
      confirmLabel: 'Save persona',
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = await updateSimAiPersona(record.id, changes, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess(`${record.role_name} persona updated.`)
        await load()
      },
    })
  }

  if (loading) return <LoadingState message="Loading persona..." />
  if (!record) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Stakeholder not found" description={`No stakeholder with the role "${role}".`} />
        <button type="button" onClick={() => navigate('/ai/sim-personas')} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">Back to personas</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" onClick={goBack} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">← Back to personas</button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{record.character_name}</h1>
          <p className="text-xs capitalize text-gray-500">{String(record.role_name).replace(/_/g, ' ')}</p>
        </div>
        {isViewOnly ? (
          <PermissionGate permission="ai.simulator.author">
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(personaPath(record))} />
          </PermissionGate>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={goBack} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
            <button type="submit" form="persona-form" disabled={!isDirty} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60">Save changes</button>
          </div>
        )}
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && (
        <AuditDetailsPanel description="This stakeholder persona.">
          <AuditCard title="Identity">
            <AuditField label="Name" value={record.character_name} />
            <AuditField label="Role" value={record.role_name} />
          </AuditCard>
          <AuditCard title="Classification"><AuditField label="Personality" value={record.personality} /></AuditCard>
          <AuditCard title="Record history">
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <AdminForm id="persona-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : save}>
          <fieldset disabled={isViewOnly} className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:grid-cols-2">
            <AdminField label="Personality">
              <select className={inputClass} value={form.personality} onChange={set('personality')}>
                {PERSONALITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </AdminField>
            <AdminField label="Communication style">
              <input className={inputClass} value={form.communication_style} onChange={set('communication_style')} placeholder="e.g. Direct, board-focused updates." />
            </AdminField>
            {LIST_FIELDS.map(([key, label, help]) => (
              <AdminField key={key} label={label}>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>
                <AdminMultiLineListInput viewModeId={`ai-sim-persona-${key}`} id={`persona-${key}`} value={form[key]} onChange={set(key)}
                  itemColumnLabel={label} ariaLabelPrefix={label.toLowerCase()} disabled={isViewOnly} />
              </AdminField>
            ))}
            <div className="md:col-span-2">
              <AdminField label="Notes for the AI (optional)">
                <textarea className={inputClass} rows={3} value={form.persona_notes} onChange={set('persona_notes')} placeholder="Background the stakeholder should keep in mind." />
              </AdminField>
            </div>
          </fieldset>
        </AdminForm>
      )}
      {modal}
    </div>
  )
}
