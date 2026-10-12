/**
 * v210 (monorepo v1241) — Public site products: product cards and brand copy shown on the public
 * Nidus brand site (apex domain). Data: public.site_products / public.site_content via the
 * SQL/v225 admin RPCs. Inactive cards (e.g. the Planner before launch) are listed here but hidden
 * on the public site.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSiteProducts,
  fetchSiteContent,
  setSiteProductActive,
  getDisplayRowNumber,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  AdminTable,
  AdminActionButton,
  EmptyState,
  ExportListMenu,
  LoadingState,
  RowNumberBadge,
  SearchBar,
  ViewToggle,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const VIEW_KEY = 'nidus.admin.publicSiteProducts.view'
const EXPORT_COLUMNS = [
  { key: '#', label: '#' },
  { key: 'name', label: 'Name' },
  { key: 'slug', label: 'Slug' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'landing_url', label: 'Landing URL' },
  { key: 'sort_order', label: 'Card order' },
  { key: 'status', label: 'Status' },
]

// Rule 12.1 default: name A→Z (case-insensitive), then created_at oldest first.
const byNameThenCreated = (a, b) =>
  String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }) ||
  String(a.created_at || '').localeCompare(String(b.created_at || ''))

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) || 'table'
  } catch {
    return 'table'
  }
}

export default function PublicSiteProductsPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [content, setContent] = useState([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    // Independent reads in parallel (rule 19 / monorepo rule 66).
    const [p, c] = await Promise.all([fetchSiteProducts(), fetchSiteContent()])
    if (p.error || c.error) showError(String(p.error || c.error))
    setProducts(p.data || [])
    setContent(c.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ }
  }, [view])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    const sorted = [...products].sort(byNameThenCreated)
    const filtered = term
      ? sorted.filter((r) => [r.name, r.slug, r.tagline, r.audience].some((v) => String(v ?? '').toLowerCase().includes(term)))
      : sorted
    return filtered.map((r) => ({ ...r, status: r.is_active ? 'active' : 'inactive' }))
  }, [products, search])

  const exportRows = rows.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }) }))

  const toggleActive = (row) => {
    const turningOn = !row.is_active
    confirm({
      title: turningOn ? `Show ${row.name} on the public site?` : `Hide ${row.name} from the public site?`,
      message: turningOn
        ? 'The card appears on the brand site and in the Products menu of the shared header.'
        : 'The card disappears from the brand site and the Products menu. Nothing is deleted.',
      confirmLabel: turningOn ? 'Show card' : 'Hide card',
      danger: !turningOn,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await setSiteProductActive(row.id, turningOn)
        setBusyId('')
        if (error) {
          showError(String(error))
          return
        }
        showSuccess(`${row.slug} ${turningOn ? 'shown' : 'hidden'} on the public site.`)
        await loadData()
      },
    })
  }

  const rowActions = (row) => (
    <AdminRowActions>
      <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/content/public-site-product?slug=${encodeURIComponent(row.slug)}&view=1`)} />
      <PermissionGate permission="system.public_site.edit">
        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/public-site-product?slug=${encodeURIComponent(row.slug)}`)} />
        <AdminActionButton onClick={() => toggleActive(row)} disabled={busyId === row.id}>
          {row.is_active ? 'Hide' : 'Show'}
        </AdminActionButton>
      </PermissionGate>
    </AdminRowActions>
  )

  const columns = [
    { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'slug', label: 'Slug', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400">{r.slug}</span> },
    { key: 'tagline', label: 'Tagline', render: (r) => <span className="text-gray-500 dark:text-gray-400">{r.tagline || '—'}</span> },
    { key: 'sort_order', label: 'Card order' },
    { key: 'status', label: 'Status', render: (r) => <AdminBadge label={r.status} variant={r.status} /> },
    { key: 'actions', label: 'Actions', sortable: false, render: rowActions },
  ]

  if (loading) return <LoadingState message="Loading public site products..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Public Site Products</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Product cards and copy on the public Nidus brand site. Hidden cards stay here but are not shown publicly. The Admin app is never listed.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, slug..." />
          <ExportListMenu columns={EXPORT_COLUMNS} data={exportRows} baseFilename="public_site_products" disabled={!exportRows.length} />
          <ViewToggle view={view} onChange={setView} />
          <PermissionGate permission="system.public_site.edit">
            <button
              type="button"
              onClick={() => navigate('/content/public-site-product')}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              New Product Card
            </button>
          </PermissionGate>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState title="No product cards found" description="Run SQL v1241 seed or create a card." />
      ) : view === 'card' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <div key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: rows.length })} />
                <AdminBadge label={r.status} variant={r.status} />
              </div>
              <h2 className="mt-2 font-semibold text-gray-900 dark:text-gray-100">{r.name}</h2>
              <p className="font-mono text-xs text-blue-600 dark:text-blue-400">{r.slug}</p>
              {r.tagline && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{r.tagline}</p>}
              <div className="mt-3">{rowActions(r)}</div>
            </div>
          ))}
        </div>
      ) : (
        <AdminTable columns={columns} rows={rows} pageSize={25} />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Brand copy</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Hero text, meta tags and the brand site address used by the shared header and footer.</p>
        <AdminTable
          rows={[...content].sort((a, b) => a.content_key.localeCompare(b.content_key))}
          pageSize={25}
          columns={[
            { key: 'content_key', label: 'Key', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400">{r.content_key}</span> },
            { key: 'content_value', label: 'Value', render: (r) => <span className="line-clamp-2">{r.content_value || '—'}</span> },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                <AdminRowActions>
                  <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/content/public-site-content?key=${encodeURIComponent(r.content_key)}&view=1`)} />
                  <PermissionGate permission="system.public_site.edit">
                    <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/public-site-content?key=${encodeURIComponent(r.content_key)}`)} />
                  </PermissionGate>
                </AdminRowActions>
              ),
            },
          ]}
        />
      </section>

      {modal}
    </div>
  )
}
