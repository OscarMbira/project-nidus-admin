/**
 * v214 (monorepo v1263) — Blog Posts: every brand-site blog post with its status (Draft,
 * Scheduled, Published, Archived) and whether it has unpublished changes. Data via SQL v232 RPCs.
 * Default order: newest publish date first (a publication list — documented exception to Admin
 * rule 12.1 in plan v214); column headers re-sort.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  blogPostStatus,
  fetchBlogAttachments,
  fetchBlogCategories,
  fetchBlogPosts,
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
  RowNumberBadge,
  SearchBar,
  ViewToggle,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const VIEW_KEY = 'nidus.admin.blogPosts.view'
export const BLOG_STATUS_BADGE = {
  draft: { label: 'draft', variant: 'pending' },
  scheduled: { label: 'scheduled', variant: 'retrying' },
  published: { label: 'published', variant: 'active' },
  archived: { label: 'archived', variant: 'archived' },
}
const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : '—')

function readView() {
  try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' }
}

export default function BlogPostsPage() {
  const navigate = useNavigate()
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [counts, setCounts] = useState({})
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [view, setView] = useState(readView)

  useEffect(() => {
    ;(async () => {
      // Independent reads in parallel (Admin rule 19).
      const [p, c, a] = await Promise.all([fetchBlogPosts(), fetchBlogCategories(), fetchBlogAttachments()])
      if (p.error || c.error || a.error) showError(String(p.error || c.error || a.error))
      setPosts(p.data || [])
      setCategories(c.data || [])
      setCounts((a.data || []).reduce((acc, x) => ({ ...acc, [x.post_id]: (acc[x.post_id] || 0) + 1 }), {}))
      setLoading(false)
    })()
  }, [])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  const catName = (id) => categories.find((c) => c.id === id)?.name || '—'
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return posts
      .map((p) => ({ ...p, status: blogPostStatus(p), category: catName(p.category_id), files: counts[p.id] || 0, changes: p.draft ? 'yes' : '' }))
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => category === 'all' || p.category_id === category)
      .filter((p) => !term || [p.title, p.slug, p.summary, p.author_name, p.category].some((v) => String(v ?? '').toLowerCase().includes(term)))
      .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at))
  }, [posts, categories, counts, search, status, category])

  const exportRows = rows.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }), published: fmt(r.published_at) }))
  const openUrl = (r, view1) => `/content/blog-post?slug=${encodeURIComponent(r.slug)}${view1 ? '&view=1' : ''}`
  const actions = (r) => (
    <AdminRowActions>
      <AdminIconActionButton variant="view" label="View" onClick={() => navigate(openUrl(r, true))} />
      <PermissionGate permission="system.public_site.edit">
        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(openUrl(r, false))} />
      </PermissionGate>
    </AdminRowActions>
  )
  const badge = (r) => <AdminBadge label={BLOG_STATUS_BADGE[r.status].label} variant={BLOG_STATUS_BADGE[r.status].variant} />

  if (loading) return <LoadingState message="Loading blog posts..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Blog Posts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Articles and downloads on the brand site blog. Changes to a published post stay as drafts until you publish again.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search title, author..." />
          <select className={`${inputClass} sm:w-36`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="all">All statuses</option>
            {Object.keys(BLOG_STATUS_BADGE).map((s) => <option key={s} value={s}>{BLOG_STATUS_BADGE[s].label}</option>)}
          </select>
          <select className={`${inputClass} sm:w-40`} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ExportListMenu
            columns={[{ key: '#', label: '#' }, { key: 'title', label: 'Title' }, { key: 'slug', label: 'Address' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }, { key: 'published', label: 'Publish date' }, { key: 'files', label: 'Downloads' }]}
            data={exportRows} baseFilename="blog_posts" disabled={!exportRows.length}
          />
          <ViewToggle view={view} onChange={setView} />
          <PermissionGate permission="system.public_site.edit">
            <button type="button" onClick={() => navigate('/content/blog-post')} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">New Post</button>
          </PermissionGate>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState title="No blog posts" description={posts.length ? 'No posts match these filters.' : 'Create the first post with New Post.'} />
      ) : view === 'card' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: rows.length })} />
                {badge(r)}
              </div>
              <h2 className="mt-2 font-semibold text-gray-900 dark:text-gray-100">{r.title}</h2>
              <p className="font-mono text-xs text-blue-600 dark:text-blue-400">/blog/{r.slug}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{r.category} · {fmt(r.published_at)}{r.draft ? ' · unpublished changes' : ''}</p>
              <div className="mt-3">{actions(r)}</div>
            </div>
          ))}
        </div>
      ) : (
        <AdminTable
          rows={rows.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length }) }))}
          pageSize={25}
          columns={[
            { key: '#', label: '#', sortable: false },
            { key: 'title', label: 'Title', render: (r) => <span className="font-medium">{r.title}</span> },
            { key: 'slug', label: 'Address', render: (r) => <span className="font-mono text-xs text-blue-600 dark:text-blue-400">/blog/{r.slug}</span> },
            { key: 'category', label: 'Category' },
            { key: 'status', label: 'Status', render: badge },
            { key: 'changes', label: 'Unpublished changes', render: (r) => (r.draft ? 'Yes' : '') },
            { key: 'published_at', label: 'Publish date', render: (r) => fmt(r.published_at) },
            { key: 'files', label: 'Downloads' },
            { key: 'actions', label: 'Actions', sortable: false, render: actions },
          ]}
        />
      )}
    </div>
  )
}
