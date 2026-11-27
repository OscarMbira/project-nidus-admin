/**
 * Admin plan v219, Slice 3 section (monorepo v1352 Slice 3) — edit one housekeeping setting on its own routed
 * page (Admin rule 18), with Details | Audit details tabs (rule 16.1), field help (rule 23) and the
 * unsaved-changes guard (rule 6). Three kinds, chosen by the route:
 *   /system/background-jobs/housekeeping/run-history           keep periods of job runs (D11)
 *   /system/background-jobs/housekeeping/retention/:key        one retention target (schema.table)
 *   /system/background-jobs/housekeeping/storage/:key          one Storage clean-up bucket
 * Save asks for a reason in a confirm dialog and is audited (Admin SQL v262). Switching deletion on for a
 * bucket is a danger confirmation; the server refuses it before one report-only scan.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  describeStatusFilter,
  fetchBackgroundJobHousekeeping,
  formatJobTime,
  isValidKeepDays,
  KEEP_DAYS_MAX,
  KEEP_DAYS_MIN,
  pickHousekeepingRecord,
  setRetentionTarget,
  setRunHistoryRetention,
  setStorageCleanupBucket,
  useCurrentAdmin,
  useUnsavedChangesGuard,
  validateRunHistoryRetention,
} from '@nidus-admin/shared'
import {
  AdminFieldLabelWithHelp,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const LIST_PATH = '/system/background-jobs/housekeeping'
const INPUT = 'w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:w-48'
const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300'
const TABS = [{ value: 'details', label: 'Details' }, { value: 'audit', label: 'Audit details' }]
const RANGE_HINT = `Whole days, ${KEEP_DAYS_MIN} to ${KEEP_DAYS_MAX}.`

function ReadOnly({ helpKey, label, children }) {
  return (
    <div>
      <AdminFieldLabelWithHelp as="dt" helpKey={helpKey} className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</AdminFieldLabelWithHelp>
      <dd className="mt-0.5 break-words text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  )
}

function OnOff({ id, helpKey, label, value, onChange, offLabel = 'Off', onLabel = 'On', disabled }) {
  return (
    <div>
      <AdminFieldLabelWithHelp helpKey={helpKey} htmlFor={id} className={LABEL}>{label}</AdminFieldLabelWithHelp>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`mt-1 ${INPUT}`}>
        <option value="off">{offLabel}</option>
        <option value="on">{onLabel}</option>
      </select>
    </div>
  )
}

export default function BackgroundJobHousekeepingEditPage({ kind }) {
  const { key = '' } = useParams()
  const navigate = useNavigate()
  const { hasPermission } = useCurrentAdmin()
  const canEdit = hasPermission('system.background_jobs.edit')
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [tab, setTab] = useState('details')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [record, setRecord] = useState(null)
  const [form, setForm] = useState(null)
  const [baseline, setBaseline] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetchBackgroundJobHousekeeping()
      if (cancelled) return
      const picked = pickHousekeepingRecord(kind, key, res.data)
      setError(res.error)
      setRecord(picked?.record || null)
      setForm(picked?.form || null)
      setBaseline(picked?.form || null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [kind, key])

  const isDirty = useMemo(() => canEdit && form && JSON.stringify(form) !== JSON.stringify(baseline), [canEdit, form, baseline])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved housekeeping changes.')
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  const title = kind === 'run-history' ? 'Run history keep periods'
    : kind === 'retention' ? `Log retention — ${key}` : `Storage clean-up — ${key}`

  const validation = !form ? null
    : kind === 'run-history' ? validateRunHistoryRetention(form.success, form.failure)
      : isValidKeepDays(form.days) ? null : `Enter ${RANGE_HINT.toLowerCase()}`

  const save = () => {
    if (validation) { showError(validation); return }
    const enablingDeletion = kind === 'storage' && form.deletion === 'on' && !record.delete_enabled
    confirm({
      title: enablingDeletion ? `Delete orphaned files in "${key}"?` : 'Save these housekeeping settings?',
      message: enablingDeletion
        ? `From the next clean-up run, files in ${key} that no record points to and that are older than ${form.days} days are deleted. Deleted files cannot be recovered.`
        : 'The new values apply from the next run of the job.',
      confirmLabel: enablingDeletion ? 'Switch deletion on' : 'Save',
      danger: enablingDeletion,
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const call = kind === 'run-history'
          ? () => setRunHistoryRetention(form.success, form.failure, reason)
          : kind === 'retention'
            ? () => setRetentionTarget(record.table_schema, record.table_name, form.days, form.active === 'on', reason)
            : () => setStorageCleanupBucket(record.bucket_id, form.days, form.deletion === 'on', form.active === 'on', reason)
        const { error: err } = await call()
        if (err) { showError(err); return }
        setBaseline(form)
        showSuccess(`${title}: saved.`)
        navigate(LIST_PATH)
      },
    })
  }

  if (loading) return <LoadingState message="Loading setting..." />

  const back = (
    <button type="button" onClick={() => requestNavigation(LIST_PATH)}
      className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
      <ArrowLeft className="h-4 w-4" />
      Back to Housekeeping
    </button>
  )

  if (!record || !form) {
    return (
      <div className="p-4 md:p-6">
        {back}
        <EmptyState title="Setting not found" description={error || 'It may have been removed by SQL. Go back and pick another.'} />
      </div>
    )
  }

  const disabled = !canEdit

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        {back}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="break-words text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => requestNavigation(LIST_PATH)}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={!isDirty}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Save changes
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <DetailAuditTabList activeTab={tab} onChange={setTab} tabs={TABS} />

      {tab === 'details' && (
        <div className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-700 dark:bg-gray-900">
          {kind === 'run-history' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <AdminFieldLabelWithHelp helpKey="admin.background_job_settings.success_retention_days" htmlFor="hk-success" className={LABEL}>Keep successful runs (days)</AdminFieldLabelWithHelp>
                <input id="hk-success" type="number" min={KEEP_DAYS_MIN} max={KEEP_DAYS_MAX} value={form.success} disabled={disabled}
                  onChange={(e) => set('success')(e.target.value)} className={`mt-1 ${INPUT}`} />
              </div>
              <div>
                <AdminFieldLabelWithHelp helpKey="admin.background_job_settings.failure_retention_days" htmlFor="hk-failure" className={LABEL}>Keep failed runs (days)</AdminFieldLabelWithHelp>
                <input id="hk-failure" type="number" min={KEEP_DAYS_MIN} max={KEEP_DAYS_MAX} value={form.failure} disabled={disabled}
                  onChange={(e) => set('failure')(e.target.value)} className={`mt-1 ${INPUT}`} />
              </div>
            </div>
          )}

          {kind === 'retention' && (
            <>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ReadOnly helpKey="admin.retention_targets.target_key" label="Table"><span className="font-mono">{record.target_key}</span></ReadOnly>
                <ReadOnly helpKey="admin.retention_targets.date_column" label="Date column"><span className="font-mono">{record.date_column}</span></ReadOnly>
                <ReadOnly helpKey="admin.retention_targets.status_filter" label="Only rows with">{describeStatusFilter(record.status_column, record.status_values)}</ReadOnly>
                <ReadOnly helpKey="admin.retention_targets.last_result" label="Last run">
                  {record.problem ? `Skipped: ${record.problem}` : record.last_purged_at
                    ? `${formatJobTime(record.last_purged_at)} — ${record.last_result || 'ok'} (${record.last_deleted_count ?? 0} deleted)` : 'Not run yet'}
                </ReadOnly>
              </dl>
              {record.notes && <p className="text-sm text-gray-600 dark:text-gray-400">{record.notes}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <AdminFieldLabelWithHelp helpKey="admin.retention_targets.retain_days" htmlFor="hk-days" className={LABEL}>Keep for (days)</AdminFieldLabelWithHelp>
                  <input id="hk-days" type="number" min={KEEP_DAYS_MIN} max={KEEP_DAYS_MAX} value={form.days} disabled={disabled}
                    onChange={(e) => set('days')(e.target.value)} className={`mt-1 ${INPUT}`} />
                </div>
                <OnOff id="hk-active" helpKey="admin.retention_targets.is_active" label="Status" value={form.active} onChange={set('active')} disabled={disabled} />
              </div>
            </>
          )}

          {kind === 'storage' && (
            <>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ReadOnly helpKey="admin.storage_cleanup_buckets.bucket_id" label="Bucket"><span className="font-mono">{record.bucket_id}</span></ReadOnly>
                <ReadOnly helpKey="admin.storage_cleanup_buckets.references" label="Checked against">
                  <span className="font-mono text-xs">{(record.references || []).join(', ') || '—'}</span>
                </ReadOnly>
                <ReadOnly helpKey="admin.storage_cleanup_buckets.last_result" label="Last scan">
                  {record.last_scanned_at
                    ? `${formatJobTime(record.last_scanned_at)} — ${record.last_orphan_count ?? 0} orphaned of ${record.last_object_count ?? 0}; ${record.last_result || ''}`
                    : 'Not scanned yet'}
                </ReadOnly>
              </dl>
              {record.notes && <p className="text-sm text-gray-600 dark:text-gray-400">{record.notes}</p>}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <AdminFieldLabelWithHelp helpKey="admin.storage_cleanup_buckets.min_age_days" htmlFor="hk-window" className={LABEL}>Safety window (days)</AdminFieldLabelWithHelp>
                  <input id="hk-window" type="number" min={KEEP_DAYS_MIN} max={KEEP_DAYS_MAX} value={form.days} disabled={disabled}
                    onChange={(e) => set('days')(e.target.value)} className={`mt-1 ${INPUT}`} />
                </div>
                <OnOff id="hk-deletion" helpKey="admin.storage_cleanup_buckets.delete_enabled" label="Delete orphaned files"
                  value={form.deletion} onChange={set('deletion')} offLabel="Off — report only" onLabel="On — delete" disabled={disabled} />
                <OnOff id="hk-bucket-active" helpKey="admin.storage_cleanup_buckets.is_active" label="Status" value={form.active} onChange={set('active')} disabled={disabled} />
              </div>
              {!record.last_scanned_at && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Deletion can be switched on after the first report-only scan.</p>
              )}
            </>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">{RANGE_HINT}</p>
        </div>
      )}

      {tab === 'audit' && (
        <AuditDetailsPanel description="When this setting was added and last changed. Every change is also in the admin audit log.">
          <AuditCard title="Identity" description="What this setting is.">
            <AuditField label={kind === 'storage' ? 'Bucket' : kind === 'retention' ? 'Table' : 'Setting'}
              value={kind === 'storage' ? record.bucket_id : kind === 'retention' ? record.target_key : 'Run history keep periods'} />
          </AuditCard>
          <AuditCard title="Classification" description="Which job uses it.">
            <AuditField label="Used by" value={kind === 'storage' ? 'Storage clean-up' : 'Log retention'} />
            {kind !== 'run-history' && <AuditField label="Status" value={record.is_active ? 'On' : 'Off'} />}
          </AuditCard>
          <AuditCard title="Record history" description="Creation and the last change made in Admin.">
            {kind !== 'run-history' && <AuditTimestampPair dateLabel="Added at" value={record.created_at} />}
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
            <AuditField label="Last changed by" value={record.updated_by_email || '—'} />
            {kind !== 'run-history' && <AuditField label="Reason for the last change" value={record.change_reason || '—'} />}
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {modal}
    </div>
  )
}
