import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import {
  PermissionGate,
  archiveGlobalTemplate,
  fetchGlobalTemplateById,
  fetchGlobalTemplateVersions,
  fetchLifecycleLogs,
  publishGlobalTemplate,
  syncStatusLabel,
  syncStatusLabelForTarget,
  globalTemplateDetailPath,
  globalTemplateFormPath,
  globalTemplateUrlKey,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  LoadingState,
  RecordLifecyclePanel,
  RecordVersionHistory,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
  humanizeAuditToken,
} from '@nidus-admin/ui'
import GlobalTemplatePayloadView from './GlobalTemplatePayloadView.jsx'

export default function GlobalTemplateLibraryDetail() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState(null)
  const [versions, setVersions] = useState([])
  const [lifecycleLogs, setLifecycleLogs] = useState([])
  const [publishingTarget, setPublishingTarget] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  const reload = async () => {
    if (!idParam) return
    setLoading(true)
    const { data, error } = await fetchGlobalTemplateById(idParam)
    if (error || !data) {
      showError('Global template not found.')
      setLoading(false)
      return
    }
    setRow(data)
    const canonical = globalTemplateUrlKey(data)
    if (canonical && canonical !== idParam) {
      const next = new URLSearchParams(searchParams)
      next.set('id', canonical)
      setSearchParams(next, { replace: true })
    }
    const rootId = data.root_record_id || data.id
    const [{ data: vers }, { data: logs }] = await Promise.all([
      fetchGlobalTemplateVersions(data.id),
      fetchLifecycleLogs('global_template_library', rootId),
    ])
    setVersions(vers || [])
    setLifecycleLogs(logs || [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [idParam])

  const handlePublish = (target) => {
    const label = target === 'platform' ? 'Platform' : 'Simulator'
    const schemaNote = target === 'platform' ? 'public schema' : 'sim schema'
    confirm({
      title: `Publish to ${label}`,
      message: `This syncs the live template into ${label} (${schemaNote}) for every active account. The other system is not updated. Continue?`,
      requireReason: true,
      reasonLabel: 'Publish notes (required)',
      confirmLabel: `Publish to ${label}`,
      onConfirm: async (notes) => {
        setPublishingTarget(target)
        const { data, error } = await publishGlobalTemplate(row.id, notes || null, target)
        setPublishingTarget(null)
        if (error) {
          showError(typeof error === 'string' ? error : `Publish to ${label} failed.`)
          throw new Error(typeof error === 'string' ? error : `Publish to ${label} failed.`)
        }
        const accounts = data?.sync?.accounts_synced ?? data?.accounts_synced
        showSuccess(
          `Published to ${label}${accounts != null ? ` (${accounts} accounts synced)` : ''}. `
            + `${row.display_id ? `ID: ${row.display_id}` : `Record id: ${row.id}`}.`,
        )
        reload()
      },
    })
  }

  const handleArchive = () => {
    confirm({
      title: 'Archive template',
      message: 'Archived templates cannot be published. Continue?',
      requireReason: true,
      reasonLabel: 'Archive justification (required)',
      confirmLabel: 'Archive',
      danger: true,
      onConfirm: async () => {
        const { error } = await archiveGlobalTemplate(row.id)
        if (error) {
          showError(typeof error === 'string' ? error : 'Archive failed.')
          throw new Error(typeof error === 'string' ? error : 'Archive failed.')
        }
        showSuccess(
          `Global template archived (${row.display_id || row.id}).`,
        )
        reload()
      },
    })
  }

  if (!idParam) {
    return <div className="p-6 text-sm text-gray-400">Missing template id.</div>
  }
  if (loading) return <LoadingState message="Loading template..." />
  if (!row) return <div className="p-6 text-sm text-red-400">Template not found.</div>

  const syncKey = syncStatusLabel(row)
  const platformSync = syncStatusLabelForTarget(row, 'platform')
  const simSync = syncStatusLabelForTarget(row, 'simulator')
  const rootId = row.root_record_id || row.id

  const syncBadge = (key) => {
    if (key === 'synced') return <AdminBadge label="Synced" variant="success" />
    if (key === 'partial') return <AdminBadge label="Partial" variant="pending" />
    if (key === 'out_of_sync') return <AdminBadge label="Out of sync" variant="failed" />
    return <AdminBadge label="Not synced" variant="pending" />
  }

  return (
    <PermissionGate
      permission="content.global_templates.view"
      fallback={<div className="p-6 text-sm text-gray-400">You do not have permission to view Global Templates.</div>}
    >
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{row.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {row.display_id ? (
                <>
                  <span className="font-mono text-gray-700 dark:text-gray-300">{row.display_id}</span>
                  {' · '}
                </>
              ) : null}
              {row.domain}
              {' · '}
              {row.methodology || 'no methodology'}
              {' · '}
              {row.category || 'uncategorised'}
              {' · uuid '}
              {row.id}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminBadge label={row.record_status || 'live'} variant={row.record_status || 'live'} />
            {syncKey === 'synced' && <AdminBadge label="Synced" variant="success" />}
            {syncKey === 'partial' && <AdminBadge label="Partial" variant="pending" />}
            {syncKey === 'out_of_sync' && <AdminBadge label="Out of sync" variant="failed" />}
            {syncKey === 'not_synced' && <AdminBadge label="Not synced" variant="pending" />}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <AdminIconActionButton variant="view" label="View" onClick={() => navigate(globalTemplateFormPath(row, { mode: 'view' }))} />
          <PermissionGate permission="content.global_templates.edit">
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(globalTemplateFormPath(row))} />
          </PermissionGate>
          <PermissionGate permission="content.global_templates.publish">
            <button
              type="button"
              disabled={publishingTarget != null || row.record_status !== 'live'}
              onClick={() => handlePublish('platform')}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {publishingTarget === 'platform' ? 'Publishing…' : 'Publish to Platform'}
            </button>
            <button
              type="button"
              disabled={publishingTarget != null || row.record_status !== 'live'}
              onClick={() => handlePublish('simulator')}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {publishingTarget === 'simulator' ? 'Publishing…' : 'Publish to Simulator'}
            </button>
          </PermissionGate>
          <PermissionGate permission="content.global_templates.edit">
            <button
              type="button"
              onClick={handleArchive}
              className="rounded border border-red-800 px-3 py-1.5 text-sm text-red-300"
            >
              Archive
            </button>
          </PermissionGate>
          <Link
            to="/content/global-template-library"
            className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
          >
            ← Back to list
          </Link>
        </div>

        <DetailAuditTabList
          activeTab={detailTab}
          onChange={setDetailTab}
          detailsLabel="Template details"
          ariaLabel="Global template sections"
        />

        {detailTab === 'audit' && (
          <AuditDetailsPanel description="Who created or changed this global template, and how it is classified.">
            <AuditCard title="Identity" description="How this record is labelled and versioned.">
              <AuditField label="Display ID" value={row.display_id} />
              <AuditField label="Status" value={humanizeAuditToken(row.record_status || 'live')} />
              <AuditField label="Version" value={row.record_version != null ? String(row.record_version) : null} />
              <AuditField label="Name" value={row.name} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this master sits in the library.">
              <AuditField label="Domain" value={humanizeAuditToken(row.domain)} />
              <AuditField label="Methodology" value={humanizeAuditToken(row.methodology)} />
              <AuditField label="Category" value={row.category || null} />
              <AuditField label="Sync status" value={humanizeAuditToken(syncKey)} />
            </AuditCard>
            <AuditCard title="Record history" description="When this template row was created and last changed.">
              <AuditField label="Created by" value={row.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={row.created_at} />
              <AuditField label="Updated by" value={row.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={row.updated_at} />
            </AuditCard>
            <AuditCard title="Publish history" description="Last sync timestamps for Platform and Simulator.">
              <AuditField
                label="Platform synced"
                value={
                  (row.platform_synced_at || row.synced_at)
                    ? new Date(row.platform_synced_at || row.synced_at).toLocaleString()
                    : null
                }
              />
              <AuditField
                label="Simulator synced"
                value={
                  (row.sim_synced_at || row.synced_at)
                    ? new Date(row.sim_synced_at || row.synced_at).toLocaleString()
                    : null
                }
              />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {detailTab === 'details' && (
        <>
        <div className="grid gap-4 lg:grid-cols-2">
          <RecordLifecyclePanel
            tableName="global_template_library"
            recordId={row.id}
            rootRecordId={rootId}
            recordStatus={row.record_status || 'live'}
            onChanged={reload}
          />
          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-200">Lifecycle history</h3>
            <RecordVersionHistory logs={lifecycleLogs} />
          </section>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Sync status</h3>
          <div className="flex flex-wrap gap-3 text-sm text-gray-700 dark:text-gray-300">
            <span className="inline-flex items-center gap-2">
              Platform {syncBadge(platformSync)}
            </span>
            <span className="inline-flex items-center gap-2">
              Simulator {syncBadge(simSync)}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Platform last synced:{' '}
            {(row.platform_synced_at || row.synced_at)
              ? new Date(row.platform_synced_at || row.synced_at).toLocaleString()
              : 'never'}
            {' · '}version {row.platform_synced_version ?? row.synced_version ?? '—'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Simulator last synced:{' '}
            {(row.sim_synced_at || row.synced_at)
              ? new Date(row.sim_synced_at || row.synced_at).toLocaleString()
              : 'never'}
            {' · '}version {row.sim_synced_version ?? row.synced_version ?? '—'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Current record version: {row.record_version ?? 1}
          </p>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Description</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{row.description || '—'}</p>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
            <GlobalTemplatePayloadView
              domain={row.domain}
              payload={row.payload}
              templateName={row.name}
              globalTemplateId={row.domain === 'form_template' ? row.id : null}
            />
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-200">Version snapshots</h3>
          {versions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No versions yet.</p>
          ) : (
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {versions.map((v) => (
                <li key={v.id} className="border-b border-gray-200 pb-2 dark:border-gray-800">
                  v{v.version_number} — {v.change_description || 'snapshot'} · {new Date(v.changed_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </section>
        </>
        )}
      </div>
      {modal}
    </PermissionGate>
  )
}
