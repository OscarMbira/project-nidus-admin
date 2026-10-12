/**
 * v212 (monorepo v1241 Amendment A) — Public site pages & menus.
 * Common pages (About, Contact, Blog, Resources, Solutions, Terms, Privacy) live only on the
 * brand site; Platform, Simulator and Planner link to them. Menu links fill the shared header
 * dropdowns, the footer columns and each product's own bar.
 * Data: public.site_pages / public.site_nav_links via the SQL/v230 admin RPCs.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSitePages,
  fetchSiteNavLinks,
  deleteSiteNavLink,
  siteNavGroupLabel,
  getDisplayRowNumber,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  AdminTable,
  EmptyState,
  ExportListMenu,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const byText = (field) => (a, b) =>
  String(a[field] || '').localeCompare(String(b[field] || ''), undefined, { sensitivity: 'base' }) ||
  String(a.created_at || '').localeCompare(String(b.created_at || ''))

const matches = (term, values) => !term || values.some((v) => String(v ?? '').toLowerCase().includes(term))
const withNumbers = (rows) => rows.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }) }))

export default function PublicSitePagesPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [pages, setPages] = useState([])
  const [links, setLinks] = useState([])
  const [search, setSearch] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [p, l] = await Promise.all([fetchSitePages(), fetchSiteNavLinks()])
    if (p.error || l.error) showError(String(p.error || l.error))
    setPages(p.data || [])
    setLinks(l.data || [])
    setLoading(false)
  }
  useEffect(() => { loadData() }, [])

  const term = search.trim().toLowerCase()
  const pageRows = useMemo(
    () => [...pages].sort(byText('title')).filter((r) => matches(term, [r.title, r.slug, r.summary]))
      .map((r) => ({ ...r, status: r.is_active ? 'active' : 'inactive' })),
    [pages, term],
  )
  const linkRows = useMemo(
    () => [...links].sort(byText('label')).filter((r) => matches(term, [r.label, r.link_key, r.nav_group, r.page_slug, r.url]))
      .map((r) => ({ ...r, menu: siteNavGroupLabel(r.nav_group), target: r.page_slug ? `/${r.page_slug}` : r.url, status: r.is_active ? 'active' : 'inactive' })),
    [links, term],
  )

  const removeLink = (row) => confirm({
    title: `Delete the "${row.label}" link?`,
    message: `It disappears from ${row.menu}. The page it points at is not affected.`,
    confirmLabel: 'Delete link',
    danger: true,
    onConfirm: async () => {
      const { error } = await deleteSiteNavLink(row.id)
      if (error) { showError(String(error)); return }
      showSuccess(`Link ${row.link_key} deleted.`)
      await loadData()
    },
  })

  if (loading) return <LoadingState message="Loading site pages and menus..." />

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Public Site Pages &amp; Menus</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Common pages live only on the brand site; Platform, Simulator and Planner link to them. Links to other apps open in a new window.
            Visitors see changes on the brand site at their next page load, and in the apps within about ten minutes.
          </p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search pages and links..." />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pages</h2>
          <div className="flex gap-2">
            <ExportListMenu
              columns={[{ key: '#', label: '#' }, { key: 'title', label: 'Title' }, { key: 'slug', label: 'Slug' }, { key: 'page_kind', label: 'Kind' }, { key: 'status', label: 'Status' }]}
              data={withNumbers(pageRows)}
              baseFilename="public_site_pages"
              disabled={!pageRows.length}
            />
            <PermissionGate permission="system.public_site.edit">
              <button type="button" onClick={() => navigate('/content/public-site-page')} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
                New Page
              </button>
            </PermissionGate>
          </div>
        </div>
        {!pageRows.length ? (
          <EmptyState title="No pages found" description="Run monorepo SQL v1260 and its seed, or create a page." />
        ) : (
          <AdminTable
            rows={pageRows}
            pageSize={25}
            columns={[
              { key: 'title', label: 'Title', render: (r) => <span className="font-medium">{r.title}</span> },
              { key: 'slug', label: 'Address', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400">/{r.slug}</span> },
              { key: 'page_kind', label: 'Kind' },
              { key: 'status', label: 'Status', render: (r) => <AdminBadge label={r.status} variant={r.status} /> },
              {
                key: 'actions', label: 'Actions', sortable: false,
                render: (r) => (
                  <AdminRowActions>
                    <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/content/public-site-page?slug=${encodeURIComponent(r.slug)}&view=1`)} />
                    <PermissionGate permission="system.public_site.edit">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/public-site-page?slug=${encodeURIComponent(r.slug)}`)} />
                    </PermissionGate>
                  </AdminRowActions>
                ),
              },
            ]}
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Menu links</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Header dropdowns, footer columns and each product&apos;s own bar.</p>
          </div>
          <div className="flex gap-2">
            <ExportListMenu
              columns={[{ key: '#', label: '#' }, { key: 'label', label: 'Label' }, { key: 'menu', label: 'Menu' }, { key: 'target', label: 'Goes to' }, { key: 'sort_order', label: 'Order' }, { key: 'status', label: 'Status' }]}
              data={withNumbers(linkRows)}
              baseFilename="public_site_menu_links"
              disabled={!linkRows.length}
            />
            <PermissionGate permission="system.public_site.edit">
              <button type="button" onClick={() => navigate('/content/public-site-link')} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
                New Link
              </button>
            </PermissionGate>
          </div>
        </div>
        {!linkRows.length ? (
          <EmptyState title="No menu links found" description="Run monorepo SQL v1260 seed, or create a link." />
        ) : (
          <AdminTable
            rows={linkRows}
            pageSize={50}
            columns={[
              { key: 'label', label: 'Label', render: (r) => <span className="font-medium">{r.label}</span> },
              { key: 'menu', label: 'Menu' },
              { key: 'target', label: 'Goes to', render: (r) => <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{r.target}</span> },
              { key: 'sort_order', label: 'Order' },
              { key: 'status', label: 'Status', render: (r) => <AdminBadge label={r.status} variant={r.status} /> },
              {
                key: 'actions', label: 'Actions', sortable: false,
                render: (r) => (
                  <AdminRowActions>
                    <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/content/public-site-link?key=${encodeURIComponent(r.link_key)}&view=1`)} />
                    <PermissionGate permission="system.public_site.edit">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/public-site-link?key=${encodeURIComponent(r.link_key)}`)} />
                      <AdminIconActionButton variant="delete" label="Delete" onClick={() => removeLink(r)} />
                    </PermissionGate>
                  </AdminRowActions>
                ),
              },
            ]}
          />
        )}
      </section>

      {modal}
    </div>
  )
}
