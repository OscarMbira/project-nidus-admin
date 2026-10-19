/**
 * AI Centre (monorepo v1272 Phase 3, PRD D14, D27, story 47) — one scenario's Simulator AI settings.
 * Route: /ai/assessor-scenario?id=<scenario id>[&tab=rubric|scoring|calibration|flags|audit][&view=1]
 *   Rubric               criteria, weights and the four level descriptors
 *   Scoring & difficulty  adaptive difficulty on/off and its min/max (1–5); "counts toward score" + weight
 *                         (only once calibrated — enforced by admin_sim_ai_update_scenario)
 *   Calibration          score recent assessments yourself; agreement is worked out per criterion
 *   Flags                learner disagreements: uphold or dismiss with a note
 * Learners are never identified here.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  calibrateSimAiAssessment,
  fetchSimAiScenario,
  PermissionGate,
  reviewSimAiFlag,
  updateSimAiScenario,
  upsertSimAiCriterion,
  useCurrentAdmin,
  useUnsavedChangesGuard,
  validateRubricCriterion,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminField,
  AdminIconActionButton,
  AdminTable,
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
import { scenarioPath } from './AiAssessorPage.jsx'

const TABS = [
  { value: 'rubric', label: 'Rubric' },
  { value: 'scoring', label: 'Scoring & difficulty' },
  { value: 'calibration', label: 'Calibration' },
  { value: 'flags', label: 'Flags' },
  { value: 'audit', label: 'Audit details' },
]
const blankCriterion = () => ({
  criterion_key: '', title: '', description: '', weight: 1, applies_to: 'both', sort_order: 100, is_active: true,
  levels: [1, 2, 3, 4].map((level) => ({ level, descriptor: '' })), isNew: true,
})
const scoringForm = (s) => ({
  adaptive_enabled: Boolean(s?.adaptive_enabled), min_difficulty: s?.min_difficulty ?? 2, max_difficulty: s?.max_difficulty ?? 4,
  assessor_counts: Boolean(s?.assessor_counts), assessor_weight: s?.assessor_weight ?? 0,
})

export default function AiAssessorScenarioPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const id = params.get('id')
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'rubric'
  const isViewOnly = params.get('view') === '1'
  const { hasPermission } = useCurrentAdmin()
  const canEdit = !isViewOnly && hasPermission('ai.simulator.author')
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(null)
  const [scoring, setScoring] = useState(scoringForm(null))
  const [scoringBase, setScoringBase] = useState(scoringForm(null))
  const [levels, setLevels] = useState({}) // assessmentId → {criterion_key: level}
  const [openAssessment, setOpenAssessment] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data: d, error } = await fetchSimAiScenario(id)
    if (error) showError(String(error))
    setData(d || null)
    setScoring(scoringForm(d?.scenario))
    setScoringBase(scoringForm(d?.scenario))
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const isDirty = useMemo(() => canEdit && (Boolean(edit) || JSON.stringify(scoring) !== JSON.stringify(scoringBase)), [edit, scoring, scoringBase, canEdit])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved changes to this scenario.')
  const setTab = (t) => setParams({ id, tab: t, ...(isViewOnly ? { view: '1' } : {}) })

  const saveCriterion = () => {
    const errs = validateRubricCriterion(edit)
    if (Object.keys(errs).length) { showError(Object.values(errs)[0]); return }
    const { isNew, ...criterion } = edit
    confirm({
      title: `Save criterion "${criterion.title}"?`,
      message: 'New assessments use it straight away. Existing assessments keep their scores.',
      confirmLabel: 'Save',
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = await upsertSimAiCriterion(id, criterion, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess(`${criterion.criterion_key} saved.`)
        setEdit(null)
        await load()
      },
    })
  }

  const saveScoring = () => {
    const changes = Object.fromEntries(Object.keys(scoring).filter((k) => scoring[k] !== scoringBase[k]).map((k) => [k, scoring[k]]))
    if (Number(scoring.min_difficulty) > Number(scoring.max_difficulty)) { showError('The minimum difficulty cannot be above the maximum.'); return }
    if (scoring.assessor_counts && !(Number(scoring.assessor_weight) > 0 && Number(scoring.assessor_weight) <= 100)) { showError('Choose a weight between 1 and 100%.'); return }
    confirm({
      title: 'Save scoring and difficulty?',
      message: changes.assessor_counts === true ? 'The AI Assessor will count toward learners\' scores and certificates for new assessments.' : 'Applies to new runs and new assessments.',
      confirmLabel: 'Save',
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = await updateSimAiScenario(id, changes, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess('Scenario settings saved.')
        await load()
      },
    })
  }

  const saveCalibration = async (assessment) => {
    const lv = levels[assessment.id] || {}
    if (!Object.keys(lv).length) { showError('Choose your level for at least one criterion.'); return }
    const { data: res, error } = await calibrateSimAiAssessment(assessment.id, lv, null)
    if (error) { showError(String(error)); return }
    showSuccess(`Saved. Agreement with the Assessor on this assessment: ${res?.agreement}%.`)
    await load()
  }

  const reviewFlag = (flag, status) => confirm({
    title: status === 'upheld' ? 'Uphold this flag?' : 'Dismiss this flag?',
    message: status === 'upheld' ? 'Use this to note the Assessor got it wrong; consider changing the rubric.' : 'The Assessor\'s result stands.',
    confirmLabel: status === 'upheld' ? 'Uphold' : 'Dismiss',
    requireReason: true,
    reasonLabel: 'Note (required)',
    onConfirm: async (note) => {
      const { error } = await reviewSimAiFlag(flag.id, status, note)
      if (error) { showError(String(error)); throw new Error(error) }
      showSuccess('Flag reviewed.')
      await load()
    },
  })

  if (loading) return <LoadingState message="Loading scenario..." />
  if (!data?.scenario) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Scenario not found" description="It may have been removed." />
        <button type="button" onClick={() => navigate('/ai/assessor')} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">Back to scenarios</button>
      </div>
    )
  }

  const s = data.scenario
  const cal = data.calibration || {}
  const rubricByKey = Object.fromEntries((data.rubric || []).map((r) => [r.criterion_key, r]))

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" onClick={() => requestNavigation('/ai/assessor')} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">← Back to scenarios</button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{s.name}</h1>
          <p className="text-xs text-gray-500">
            Calibration {cal.calibrated_assessments || 0}/30{cal.agreement != null ? ` · ${cal.agreement}% agreement` : ''} · Assessor {s.assessor_counts ? `counts ${Number(s.assessor_weight)}%` : 'advisory'}
          </p>
        </div>
        {isViewOnly && (
          <PermissionGate permission="ai.simulator.author">
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(scenarioPath(id, tab))} />
          </PermissionGate>
        )}
      </div>

      <DetailAuditTabList tabs={TABS} activeTab={tab} onChange={setTab} ariaLabel="Scenario AI sections" />

      {tab === 'rubric' && (
        <section className="space-y-3">
          {canEdit && !edit && <AdminActionButton onClick={() => setEdit(blankCriterion())}>Add a criterion</AdminActionButton>}
          {edit && (
            <div className="grid gap-3 rounded-lg border border-blue-300 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/20 md:grid-cols-3">
              <AdminField label="Key" required>
                <input className={`${inputClass} font-mono`} value={edit.criterion_key} disabled={!edit.isNew}
                  onChange={(e) => setEdit((c) => ({ ...c, criterion_key: e.target.value }))} placeholder="stakeholder_engagement" />
              </AdminField>
              <AdminField label="Title" required><input className={inputClass} value={edit.title} onChange={(e) => setEdit((c) => ({ ...c, title: e.target.value }))} /></AdminField>
              <AdminField label="Weight" required><input className={inputClass} type="number" min="0.1" step="0.1" value={edit.weight} onChange={(e) => setEdit((c) => ({ ...c, weight: e.target.value }))} /></AdminField>
              <div className="md:col-span-2">
                <AdminField label="What it assesses"><input className={inputClass} value={edit.description || ''} onChange={(e) => setEdit((c) => ({ ...c, description: e.target.value }))} /></AdminField>
              </div>
              <AdminField label="Used for">
                <select className={inputClass} value={edit.applies_to} onChange={(e) => setEdit((c) => ({ ...c, applies_to: e.target.value }))}>
                  <option value="both">Decisions and the whole run</option>
                  <option value="decision">Individual decisions</option>
                  <option value="run_end">The whole run</option>
                </select>
              </AdminField>
              {edit.levels.map((l, i) => (
                <div key={l.level} className="md:col-span-3">
                  <AdminField label={`Level ${l.level}${l.level === 1 ? ' (lowest)' : l.level === 4 ? ' (highest)' : ''}`} required>
                    <input className={inputClass} value={l.descriptor}
                      onChange={(e) => setEdit((c) => ({ ...c, levels: c.levels.map((x, j) => (j === i ? { ...x, descriptor: e.target.value } : x)) }))} />
                  </AdminField>
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit((c) => ({ ...c, is_active: e.target.checked }))} /> In use
              </label>
              <div className="flex gap-2 md:col-span-3">
                <button type="button" onClick={saveCriterion} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600">Save criterion</button>
                <button type="button" onClick={() => setEdit(null)} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
              </div>
            </div>
          )}
          {!(data.rubric || []).length ? (
            <EmptyState title="No rubric yet" description="The AI Assessor stays off for this scenario until it has at least one criterion." />
          ) : (
            <AdminTable
              rows={data.rubric}
              pageSize={50}
              columns={[
                { key: 'title', label: 'Criterion', render: (r) => <span className="font-medium">{r.title}</span> },
                { key: 'criterion_key', label: 'Key', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400">{r.criterion_key}</span> },
                { key: 'weight', label: 'Weight' },
                { key: 'applies_to', label: 'Used for' },
                { key: 'is_active', label: 'In use', render: (r) => (r.is_active ? 'Yes' : 'No') },
                {
                  key: 'actions', label: 'Actions', sortable: false,
                  render: (r) => canEdit && <AdminIconActionButton variant="edit" label="Edit criterion" onClick={() => setEdit({ ...r, isNew: false })} />,
                },
              ]}
            />
          )}
        </section>
      )}

      {tab === 'scoring' && (
        <fieldset disabled={!canEdit} className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Adaptive difficulty</h2>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={scoring.adaptive_enabled} onChange={(e) => setScoring((f) => ({ ...f, adaptive_enabled: e.target.checked }))} />
              Adjust event difficulty to the learner's performance
            </label>
            <div className="grid grid-cols-2 gap-3">
              {['min_difficulty', 'max_difficulty'].map((k) => (
                <AdminField key={k} label={k === 'min_difficulty' ? 'Easiest level' : 'Hardest level'}>
                  <select className={inputClass} value={scoring[k]} onChange={(e) => setScoring((f) => ({ ...f, [k]: Number(e.target.value) }))}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </AdminField>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Level 1 is gentle (fewer, milder events, more time); level 5 is tough. Options and scoring never change.</p>
          </div>
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">AI Assessor in the score</h2>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={scoring.assessor_counts} disabled={!cal.is_calibrated && !scoringBase.assessor_counts}
                onChange={(e) => setScoring((f) => ({ ...f, assessor_counts: e.target.checked }))} />
              Count the Assessor's run score toward the learner's score and certificates
            </label>
            {!cal.is_calibrated && !scoringBase.assessor_counts && (
              <p className="text-xs text-amber-700 dark:text-amber-300">Calibrate first: {cal.calibrated_assessments || 0} of 30 assessments scored by an author{cal.agreement != null ? `, ${cal.agreement}% agreement (needs 80%)` : ''}.</p>
            )}
            <AdminField label="Weight of the Assessor (%)">
              <input className={inputClass} type="number" min="0" max="100" value={scoring.assessor_weight} disabled={!scoring.assessor_counts}
                onChange={(e) => setScoring((f) => ({ ...f, assessor_weight: e.target.value === '' ? '' : Number(e.target.value) }))} />
            </AdminField>
          </div>
          {canEdit && (
            <div className="md:col-span-2">
              <button type="button" onClick={saveScoring} disabled={JSON.stringify(scoring) === JSON.stringify(scoringBase)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60">Save changes</button>
            </div>
          )}
        </fieldset>
      )}

      {tab === 'calibration' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Score recent assessments yourself without looking at the Assessor's levels first, then compare. Learners are not identified.</p>
          {!(data.assessments || []).length ? (
            <EmptyState title="No assessments yet" description="They appear here once learners run this scenario with AI on." />
          ) : (data.assessments || []).map((a) => {
            const isOpen = openAssessment === a.id
            const mine = a.my_calibration
            return (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-gray-900 dark:text-gray-100">
                    {a.assessment_point === 'run_end' ? 'Whole run' : 'Decision'} · {new Date(a.created_at).toLocaleDateString()}
                    {mine ? <span className="ml-2"><AdminBadge label={`Your agreement ${mine.agreement}%`} variant="active" /></span> : null}
                    {a.flags ? <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">{a.flags} flag(s)</span> : null}
                  </p>
                  <AdminActionButton onClick={() => setOpenAssessment(isOpen ? null : a.id)}>{isOpen ? 'Close' : mine ? 'Review' : 'Score it'}</AdminActionButton>
                </div>
                {isOpen && (
                  <div className="mt-3 space-y-3">
                    {(a.criteria || []).map((c) => (
                      <div key={c.criterion_key} className="rounded bg-gray-50 p-2 dark:bg-gray-800">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{c.title || rubricByKey[c.criterion_key]?.title || c.criterion_key}</p>
                        {(c.evidence || []).map((e, i) => e.quote && <p key={i} className="text-xs italic text-gray-500 dark:text-gray-400">“{e.quote}”</p>)}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <label className="text-xs text-gray-700 dark:text-gray-300">
                            Your level{' '}
                            <select className="rounded border border-gray-300 bg-white px-1 py-0.5 dark:border-gray-600 dark:bg-gray-900" disabled={!canEdit}
                              value={levels[a.id]?.[c.criterion_key] ?? mine?.author_levels?.[c.criterion_key] ?? ''}
                              onChange={(e) => setLevels((l) => ({ ...l, [a.id]: { ...(l[a.id] || {}), [c.criterion_key]: Number(e.target.value) } }))}>
                              <option value="">—</option>
                              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </label>
                          {(mine || levels[a.id]?.[c.criterion_key]) && (
                            <span className="text-xs text-gray-600 dark:text-gray-400">Assessor: level {c.level} — {c.reason}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {canEdit && <button type="button" onClick={() => saveCalibration(a)} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600">Save my scores</button>}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      {tab === 'flags' && (
        !(data.flags || []).length ? <EmptyState title="No learner flags" description="Learners can flag an Assessor result they disagree with." /> : (
          <AdminTable
            rows={data.flags}
            pageSize={25}
            columns={[
              { key: 'created_at', label: 'Raised', render: (f) => new Date(f.created_at).toLocaleDateString() },
              { key: 'criterion_key', label: 'Criterion', render: (f) => f.criterion_key ? rubricByKey[f.criterion_key]?.title || f.criterion_key : 'Whole assessment' },
              { key: 'reason', label: 'Learner says', render: (f) => <span className="text-sm">{f.reason}</span> },
              { key: 'status', label: 'Status', render: (f) => <AdminBadge label={f.status} variant={f.status === 'open' ? 'pending' : 'archived'} /> },
              {
                key: 'actions', label: 'Actions', sortable: false,
                render: (f) => canEdit && f.status === 'open' && (
                  <div className="flex gap-1">
                    <AdminActionButton onClick={() => reviewFlag(f, 'upheld')}>Uphold</AdminActionButton>
                    <AdminActionButton onClick={() => reviewFlag(f, 'dismissed')}>Dismiss</AdminActionButton>
                  </div>
                ),
              },
            ]}
          />
        )
      )}

      {tab === 'audit' && (
        <AuditDetailsPanel description="This scenario's Simulator AI settings.">
          <AuditCard title="Identity"><AuditField label="Scenario" value={s.name} /></AuditCard>
          <AuditCard title="Classification">
            <AuditField label="Assessor" value={s.assessor_counts ? `Counts ${Number(s.assessor_weight)}%` : 'Advisory'} />
            <AuditField label="Difficulty range" value={`${s.min_difficulty}–${s.max_difficulty}${s.adaptive_enabled ? '' : ' (fixed)'}`} />
          </AuditCard>
          <AuditCard title="Record history">
            <AuditTimestampPair dateLabel="Created at" value={s.created_at} />
            <AuditTimestampPair dateLabel="Last updated" value={s.updated_at} />
            <AuditField label="Change history" value="Admin Audit log (ai.sim_* actions)" />
          </AuditCard>
        </AuditDetailsPanel>
      )}
      {modal}
    </div>
  )
}
