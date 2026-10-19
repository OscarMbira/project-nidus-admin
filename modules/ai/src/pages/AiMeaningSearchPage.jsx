/**
 * AI Centre (monorepo v1272 Phase 2b, PRD story 41 / D22a, D24) — Meaning Search.
 * The background embedding queue per app and record type, failures, each organisation's share of
 * non-English content (gte-small is English-only until the D22a decision), and re-embed controls.
 * Record titles and text are never shown here.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchAiEmbeddingFailures, fetchAiEmbeddingStats, getDisplayRowNumber, PermissionGate, reembedAi } from '@nidus-admin/shared'
import { AdminActionButton, AdminCard, AdminTable, EmptyState, ExportListMenu, LoadingState, SearchBar, useConfirmAction, useToast } from '@nidus-admin/ui'

const APP = { public: 'Platform', sim: 'Simulator' }
const n = (v) => (Number(v) || 0).toLocaleString()

export default function AiMeaningSearchPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [schema, setSchema] = useState('public')
  const [failures, setFailures] = useState([])
  const [showFailures, setShowFailures] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    const [s, f] = await Promise.all([fetchAiEmbeddingStats(), fetchAiEmbeddingFailures(schema)])
    if (s.error || f.error) showError(String(s.error || f.error))
    setStats(s.data || null)
    setFailures(f.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [schema])

  const reembed = ({ accountId = null, accountName = null, failedOnly = false }) => {
    confirm({
      title: failedOnly ? 'Retry failed rows?' : `Re-embed ${accountName || `all ${APP[schema]} records`}?`,
      message: 'The rows go back into the queue and are embedded in the background over the next few minutes. Search keeps working meanwhile (keyword matches).',
      confirmLabel: failedOnly ? 'Retry' : 'Re-embed',
      requireReason: true,
      reasonLabel: 'Reason (required)',
      onConfirm: async (reason) => {
        const { data, error } = await reembedAi(schema, accountId, failedOnly, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess(`${n(data?.rows)} row(s) queued for embedding.`)
        await load()
      },
    })
  }

  const orgRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (stats?.organisations || [])
      .filter((r) => !term || [r.account_name, r.account_code].some((v) => String(v ?? '').toLowerCase().includes(term)))
      .sort((a, b) => String(a.account_name).localeCompare(String(b.account_name), undefined, { sensitivity: 'base' }))
  }, [stats, search])

  if (loading) return <LoadingState message="Loading meaning search..." />
  if (!stats) return <EmptyState title="Meaning search is not set up" description="Run monorepo SQL v1283–v1284 and Admin SQL v238." />

  const s = stats[schema] || {}
  const nonEnglish = s.embedded ? Math.round((100 * (s.non_english || 0)) / s.embedded) : 0
  const exportRows = orgRows.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: orgRows.length || 1 }) }))

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Meaning search</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Records are embedded in the background (every 2 minutes) so Ask Nidus and meeting filing can find similar records by meaning.
            Model: {Object.keys(s.models || {}).join(', ') || 'none yet'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded border border-gray-300 dark:border-gray-600">
            {Object.entries(APP).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setSchema(k)}
                className={`px-3 py-1.5 text-sm ${schema === k ? 'bg-blue-700 text-white' : 'text-gray-700 dark:text-gray-300'}`}>{label}</button>
            ))}
          </div>
          <PermissionGate permission="ai.embeddings.manage">
            <AdminActionButton onClick={() => reembed({})}>Re-embed all {APP[schema]} records</AdminActionButton>
          </PermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <AdminCard title="Records to embed" value={n(s.embeddable)} />
        <AdminCard title="Embedded" value={n(s.embedded)} />
        <AdminCard title="Waiting" value={n(s.waiting)} trend={s.oldest_waiting ? `Oldest since ${new Date(s.oldest_waiting).toLocaleString()}` : 'Queue is empty'} />
        <AdminCard title="Failed 3 times" value={n(s.failed)} onClick={() => setShowFailures(true)} />
        <AdminCard title="Not embedded (keyword only)" value={n((s.indexed || 0) - (s.embeddable || 0))} trend="Projects, milestones, changes, stakeholders" />
        <AdminCard title="Non-English content" value={`${nonEnglish}%`} trend="Found by keyword only for now (D22a)" />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">By record type</h2>
        <AdminTable
          rows={s.by_type || []}
          idKey="entity_type"
          pageSize={20}
          columns={[
            { key: 'entity_type', label: 'Record type' },
            { key: 'embeddable', label: 'To embed', render: (r) => n(r.embeddable) },
            { key: 'embedded', label: 'Embedded', render: (r) => n(r.embedded) },
            { key: 'waiting', label: 'Waiting', render: (r) => n(r.waiting) },
            { key: 'failed', label: 'Failed', render: (r) => n(r.failed) },
          ]}
        />
      </section>

      {showFailures && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Failed rows ({failures.length})</h2>
            <PermissionGate permission="ai.embeddings.manage">
              {failures.length > 0 && <AdminActionButton onClick={() => reembed({ failedOnly: true })}>Retry all failed</AdminActionButton>}
            </PermissionGate>
          </div>
          {!failures.length ? <EmptyState title="No failed rows" description="Every record waiting has been embedded or is still being retried." /> : (
            <AdminTable
              rows={failures}
              pageSize={20}
              columns={[
                { key: 'entity_type', label: 'Record type' },
                { key: 'account_name', label: 'Organisation', render: (r) => r.account_name || '—' },
                { key: 'attempts', label: 'Attempts' },
                { key: 'error', label: 'Error', render: (r) => <span className="text-xs text-red-600 dark:text-red-400">{r.error || '—'}</span> },
                { key: 'updated_at', label: 'Last change', render: (r) => (r.updated_at ? new Date(r.updated_at).toLocaleString() : '—') },
              ]}
            />
          )}
        </section>
      )}

      {schema === 'public' && (
        <section className="space-y-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">By organisation</h2>
            <div className="flex items-center gap-2">
              <SearchBar value={search} onChange={setSearch} placeholder="Search organisation..." />
              <ExportListMenu
                columns={[{ key: '#', label: '#' }, { key: 'account_name', label: 'Organisation' }, { key: 'account_code', label: 'Code' },
                  { key: 'embeddable', label: 'To embed' }, { key: 'embedded', label: 'Embedded' }, { key: 'waiting', label: 'Waiting' },
                  { key: 'failed', label: 'Failed' }, { key: 'non_english_share', label: 'Non-English %' }]}
                data={exportRows} baseFilename="ai_meaning_search_organisations" disabled={!exportRows.length} />
            </div>
          </div>
          <AdminTable
            rows={orgRows}
            idKey="account_id"
            pageSize={25}
            columns={[
              { key: 'account_name', label: 'Organisation', render: (r) => <span className="font-medium">{r.account_name}</span> },
              { key: 'embeddable', label: 'To embed', render: (r) => n(r.embeddable) },
              { key: 'embedded', label: 'Embedded', render: (r) => n(r.embedded) },
              { key: 'waiting', label: 'Waiting', render: (r) => n(r.waiting) },
              { key: 'failed', label: 'Failed', render: (r) => n(r.failed) },
              { key: 'non_english_share', label: 'Non-English', render: (r) => (r.non_english_share == null ? '—' : `${r.non_english_share}%`) },
              {
                key: 'actions', label: 'Actions', sortable: false,
                render: (r) => (
                  <PermissionGate permission="ai.embeddings.manage">
                    <AdminActionButton onClick={() => reembed({ accountId: r.account_id, accountName: r.account_name })}>Re-embed</AdminActionButton>
                  </PermissionGate>
                ),
              },
            ]}
          />
        </section>
      )}
      {modal}
    </div>
  )
}
