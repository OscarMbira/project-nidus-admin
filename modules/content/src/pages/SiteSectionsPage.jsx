/**
 * v213 (monorepo v1262) — Site Sections: the marketing sections of a brand-site page (home and
 * the Solutions pages). Every change is a draft; "Preview drafts" opens the brand site with a
 * 60-minute preview link, "Publish" makes the page's drafts live. Route:
 * /content/site-sections?page=<home|slug>. Default order: the page's section order (the order is
 * the content — documented exception to Admin rule 12.1 in plan v213).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  SITE_SECTION_TYPES,
  addSiteSection,
  createSitePreviewToken,
  effectiveSiteSection,
  fetchSiteContent,
  fetchSitePages,
  fetchSiteSections,
  publishSiteSections,
  reorderSiteSections,
  saveSiteSectionDraft,
  sitePreviewUrl,
  siteSectionStatus,
  siteSectionTypeLabel,
  getDisplayRowNumber,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  AdminTable,
  EmptyState,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const STATUS_BADGE = { new: { label: 'new — not published', variant: 'pending' }, draft: { label: 'draft changes', variant: 'pending' }, published: { label: 'published', variant: 'active' } }

export default function SiteSectionsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageSlug = searchParams.get('page') || 'home'
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [pages, setPages] = useState([])
  const [brandUrl, setBrandUrl] = useState('')
  const [busy, setBusy] = useState('')
  const [newType, setNewType] = useState('feature_grid')
  const [newKey, setNewKey] = useState('')

  const loadData = async () => {
    // Independent reads in parallel (Admin rule 19).
    const [s, p, c] = await Promise.all([fetchSiteSections(), fetchSitePages(), fetchSiteContent()])
    if (s.error || p.error || c.error) showError(String(s.error || p.error || c.error))
    setRows(s.data || [])
    setPages(p.data || [])
    setBrandUrl((c.data || []).find((r) => r.content_key === 'brand.url')?.content_value || '')
    setLoading(false)
  }
  useEffect(() => { loadData() }, [])

  const pageOptions = useMemo(() => {
    const withSections = new Set(rows.map((r) => r.page_slug))
    const list = pages
      .filter((p) => p.page_kind === 'solution' || withSections.has(p.slug))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((p) => ({ value: p.slug, label: `${p.title} (/${p.slug})` }))
    return [{ value: 'home', label: 'Homepage (/)' }, ...list]
  }, [pages, rows])

  const sections = useMemo(() => rows
    .filter((r) => r.page_slug === pageSlug)
    .map((r) => {
      const e = effectiveSiteSection(r)
      return { ...r, effective: e, status: siteSectionStatus(r), shown: e.is_active !== false, order: Number(e.sort_order ?? r.sort_order) }
    })
    .sort((a, b) => a.order - b.order || a.section_key.localeCompare(b.section_key)), [rows, pageSlug])

  const draftCount = sections.filter((s) => s.draft).length

  const run = async (key, fn, ok) => {
    setBusy(key)
    const { error } = await fn()
    setBusy('')
    if (error) { showError(String(error)); return false }
    if (ok) showSuccess(ok)
    await loadData()
    return true
  }

  const move = (index, delta) => {
    const keys = sections.map((s) => s.section_key)
    const target = index + delta
    if (target < 0 || target >= keys.length) return
    ;[keys[index], keys[target]] = [keys[target], keys[index]]
    run('reorder', () => reorderSiteSections(pageSlug, keys), 'New order saved as a draft.')
  }

  const toggleShown = (s) => run(s.id, () => saveSiteSectionDraft(s.id, { is_active: !s.shown }), `${s.section_key} will be ${s.shown ? 'hidden' : 'shown'} when you publish.`)

  const openPreview = async () => {
    if (!brandUrl) { showError('Set brand.url under Public Site Products → Brand copy first.'); return }
    // Open the tab first (pop-up blockers allow it only straight from the click), then point it at the preview.
    const win = window.open('', '_blank')
    const { data, error } = await createSitePreviewToken()
    if (error || !data) { win?.close(); showError(String(error || 'Could not create a preview link')); return }
    const url = sitePreviewUrl(brandUrl, pageSlug, data)
    if (win) win.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  const publish = () => confirm({
    title: `Publish ${draftCount} change${draftCount === 1 ? '' : 's'} on this page?`,
    message: 'Visitors will see the drafted sections, order and show/hide changes straight away. The brand site\'s search-engine copy updates on its next build.',
    confirmLabel: 'Publish',
    onConfirm: () => run('publish', () => publishSiteSections(pageSlug), `Page ${pageSlug === 'home' ? 'Homepage' : '/' + pageSlug} published.`),
  })

  const addSection = async () => {
    const key = newKey.trim().toLowerCase()
    if (!/^[a-z0-9_-]+$/.test(key)) { showError('Key: use lowercase letters, numbers, - and _'); return }
    if (sections.some((s) => s.section_key === key)) { showError('This page already has a section with that key.'); return }
    const heading = siteSectionTypeLabel(newType)
    const ok = await run('add', () => addSiteSection({ page_slug: pageSlug, section_key: key, section_type: newType, changes: { heading } }), `Section ${key} added as a draft.`)
    if (ok) {
      setNewKey('')
      navigate(`/content/site-section?page=${encodeURIComponent(pageSlug)}&key=${encodeURIComponent(key)}`)
    }
  }

  if (loading) return <LoadingState message="Loading site sections..." />

  const editUrl = (s, view) => `/content/site-section?page=${encodeURIComponent(pageSlug)}&key=${encodeURIComponent(s.section_key)}${view ? '&view=1' : ''}`

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Site Sections</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Marketing sections of the brand site. Changes are drafts until you publish; use Preview to check them on the real site first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputClass} w-64`} value={pageSlug} onChange={(e) => setSearchParams({ page: e.target.value })} aria-label="Page">
            {pageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" onClick={openPreview} className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
            Preview drafts
          </button>
          <PermissionGate permission="system.public_site.edit">
            <button type="button" onClick={publish} disabled={!draftCount || busy === 'publish'}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
              {busy === 'publish' ? 'Publishing...' : `Publish${draftCount ? ` (${draftCount})` : ''}`}
            </button>
          </PermissionGate>
        </div>
      </div>

      {!sections.length ? (
        <EmptyState title="No sections on this page" description="Run monorepo SQL v1262 seed, or add a section below. Without sections the page shows its normal text." />
      ) : (
        <AdminTable
          rows={sections.map((s, i) => ({ ...s, '#': getDisplayRowNumber(i, { page: 1, pageSize: sections.length }) }))}
          pageSize={50}
          columns={[
            { key: '#', label: '#', sortable: false },
            { key: 'type', label: 'Type', sortable: false, render: (s) => siteSectionTypeLabel(s.section_type) },
            { key: 'heading', label: 'Heading', sortable: false, render: (s) => <span className="font-medium">{s.effective.heading || '—'}</span> },
            { key: 'section_key', label: 'Key', sortable: false, render: (s) => <span className="font-mono text-xs text-blue-600 dark:text-blue-400">#{s.section_key}</span> },
            { key: 'shown', label: 'On page', sortable: false, render: (s) => <AdminBadge label={s.shown ? 'shown' : 'hidden'} variant={s.shown ? 'active' : 'archived'} /> },
            { key: 'status', label: 'Status', sortable: false, render: (s) => <AdminBadge label={STATUS_BADGE[s.status].label} variant={STATUS_BADGE[s.status].variant} /> },
            {
              key: 'actions', label: 'Actions', sortable: false,
              render: (s) => {
                const i = sections.indexOf(s)
                return (
                  <AdminRowActions>
                    <AdminIconActionButton variant="view" label="View" onClick={() => navigate(editUrl(s, true))} />
                    <PermissionGate permission="system.public_site.edit">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(editUrl(s, false))} />
                      <button type="button" aria-label="Move up" title="Move up" disabled={i === 0 || !!busy} onClick={() => move(i, -1)}
                        className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-800"><span aria-hidden="true">↑</span></button>
                      <button type="button" aria-label="Move down" title="Move down" disabled={i === sections.length - 1 || !!busy} onClick={() => move(i, 1)}
                        className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-800"><span aria-hidden="true">↓</span></button>
                      <AdminActionButton onClick={() => toggleShown(s)} disabled={busy === s.id}>{s.shown ? 'Hide' : 'Show'}</AdminActionButton>
                    </PermissionGate>
                  </AdminRowActions>
                )
              },
            },
          ]}
        />
      )}

      <PermissionGate permission="system.public_site.edit">
        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add a section</h2>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm text-gray-700 dark:text-gray-300">Type
              <select className={`${inputClass} mt-1 w-64`} value={newType} onChange={(e) => setNewType(e.target.value)}>
                {SITE_SECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-700 dark:text-gray-300">Key (used for #links)
              <input className={`${inputClass} mt-1 w-56`} value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. more-features" />
            </label>
            <button type="button" onClick={addSection} disabled={busy === 'add' || !newKey.trim()}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
              Add section
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">New sections go to the end of the page as drafts. Visitors see them after you publish.</p>
        </section>
      </PermissionGate>

      {modal}
    </div>
  )
}
