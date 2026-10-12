/**
 * v215 (monorepo v1264) — Public site headers: one header per site (Brand site, Platform,
 * Simulator, Planner), each with its own colours and primary button.
 * Data: public.site_header_settings + public.site_products via the SQL/v233 / v225 admin RPCs.
 * A header without a settings row uses the built-in dark colours until it is saved once.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSiteHeaderSettings,
  fetchSiteProducts,
  getDisplayRowNumber,
  siteHeaderLabel,
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
  useToast,
} from '@nidus-admin/ui'

const matches = (term, values) => !term || values.some((v) => String(v ?? '').toLowerCase().includes(term))

function Swatches({ row }) {
  if (!row.settings) return <span className="text-xs text-gray-500 dark:text-gray-400">Built-in</span>
  const s = row.settings
  return (
    <span className="flex items-center gap-1" aria-label={`Background ${s.bg_color}, text ${s.text_color}, accent ${s.accent_color}`}>
      {[s.bg_color, s.text_color, s.accent_color].map((c, i) => (
        <span key={i} title={c} className="h-5 w-5 rounded border border-gray-300 dark:border-gray-600" style={{ backgroundColor: c }} />
      ))}
    </span>
  )
}

export default function SiteHeadersPage() {
  const navigate = useNavigate()
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [settings, setSettings] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const [p, s] = await Promise.all([fetchSiteProducts(), fetchSiteHeaderSettings()])
      if (!active) return
      if (p.error || s.error) showError(String(p.error || s.error))
      setProducts(p.data || [])
      setSettings(s.data || [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [showError])

  const term = search.trim().toLowerCase()
  // Brand site first, then products alphabetically (Admin rule 12.1 default sort).
  const rows = useMemo(() => {
    const scopes = ['brand', ...products.filter((p) => p.slug !== 'admin').map((p) => p.slug)]
    return scopes
      .map((scope) => {
        const s = settings.find((r) => r.scope_slug === scope) || null
        return {
          id: scope,
          scope_slug: scope,
          header: siteHeaderLabel(scope, products),
          settings: s,
          cta_label: s?.cta_label || '—',
          goes_to: s?.cta_url || (scope === 'brand' ? 'Which product? chooser' : 'Product sign-up'),
          status: !s ? 'not set' : s.is_active ? 'active' : 'inactive',
        }
      })
      .sort((a, b) => (a.scope_slug === 'brand' ? -1 : b.scope_slug === 'brand' ? 1 : a.header.localeCompare(b.header, undefined, { sensitivity: 'base' })))
      .filter((r) => matches(term, [r.header, r.cta_label, r.goes_to]))
  }, [products, settings, term])

  if (loading) return <LoadingState message="Loading site headers..." />

  const open = (r, view) => navigate(`/content/site-header?scope=${encodeURIComponent(r.scope_slug)}${view ? '&view=1' : ''}`)

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Public Site Headers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Each site has its own header colours and main button. Product menu links are edited in Public Site Pages &amp; Menus.
            The apps show changes within about ten minutes; the brand site on its next build.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search headers..." />
          <ExportListMenu
            columns={[{ key: '#', label: '#' }, { key: 'header', label: 'Header' }, { key: 'cta_label', label: 'Button' }, { key: 'goes_to', label: 'Button goes to' }, { key: 'status', label: 'Status' }]}
            data={rows.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }) }))}
            baseFilename="public_site_headers"
            disabled={!rows.length}
          />
        </div>
      </div>

      {!rows.length ? (
        <EmptyState title="No headers found" description="Run monorepo SQL v1264 and its seed." />
      ) : (
        <AdminTable
          rows={rows}
          pageSize={25}
          columns={[
            { key: 'header', label: 'Header', render: (r) => <span className="font-medium">{r.header}</span> },
            { key: 'colours', label: 'Colours', sortable: false, render: (r) => <Swatches row={r} /> },
            { key: 'cta_label', label: 'Button' },
            { key: 'goes_to', label: 'Button goes to', render: (r) => <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{r.goes_to}</span> },
            { key: 'status', label: 'Status', render: (r) => <AdminBadge label={r.status} variant={r.status === 'active' ? 'active' : 'inactive'} /> },
            {
              key: 'actions', label: 'Actions', sortable: false,
              render: (r) => (
                <AdminRowActions>
                  <AdminIconActionButton variant="view" label="View" onClick={() => open(r, true)} />
                  <PermissionGate permission="system.public_site.edit">
                    <AdminIconActionButton variant="edit" label="Edit" onClick={() => open(r, false)} />
                  </PermissionGate>
                </AdminRowActions>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
