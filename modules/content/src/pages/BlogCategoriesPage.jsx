/**
 * v214 (monorepo v1263) — Blog Categories: the list readers filter blog posts by. Add, rename,
 * reorder, hide; a category used by posts cannot be deleted (hide it instead). Small reference
 * data, so the editor is a panel on this page with Details / Audit details tabs.
 * Default order: the category order shown to readers (sort_order), then name.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  deleteBlogCategory,
  fetchBlogCategories,
  fetchBlogPosts,
  getDisplayRowNumber,
  saveBlogCategory,
  slugifyBlogTitle,
  useUnsavedChangesGuard,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminField,
  AdminIconActionButton,
  AdminRowActions,
  AdminTable,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  ExportListMenu,
  LoadingState,
  SearchBar,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const EMPTY = { id: null, slug: '', name: '', description: '', sort_order: 0, is_active: true }

export default function BlogCategoriesPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [usage, setUsage] = useState({})
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null = closed; EMPTY = new
  const [baseline, setBaseline] = useState(null)
  const [tab, setTab] = useState('details')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [c, p] = await Promise.all([fetchBlogCategories(), fetchBlogPosts()])
    if (c.error || p.error) showError(String(c.error || p.error))
    setRows(c.data || [])
    setUsage((p.data || []).reduce((acc, x) => (x.category_id ? { ...acc, [x.category_id]: (acc[x.category_id] || 0) + 1 } : acc), {}))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const isDirty = useMemo(() => Boolean(editing) && JSON.stringify(editing) !== JSON.stringify(baseline), [editing, baseline])
  useUnsavedChangesGuard(isDirty, 'You have unsaved category changes.')

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows
      .filter((r) => !term || [r.name, r.slug, r.description].some((v) => String(v ?? '').toLowerCase().includes(term)))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((r, i) => ({ ...r, posts: usage[r.id] || 0, status: r.is_active ? 'active' : 'inactive', '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }) }))
  }, [rows, usage, search])

  const open = (row) => { const v = row ? { ...EMPTY, ...row } : { ...EMPTY }; setEditing(v); setBaseline(v); setTab('details') }
  const close = () => {
    if (!isDirty) { setEditing(null); return }
    confirm({ title: 'Discard your changes?', message: 'Your edits to this category are not saved.', confirmLabel: 'Discard', danger: true, onConfirm: () => setEditing(null) })
  }
  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setEditing((f) => ({ ...f, [field]: value, ...(field === 'name' && !f.id ? { slug: slugifyBlogTitle(value) } : {}) }))
  }

  const save = async (e) => {
    e.preventDefault()
    if (!editing.name.trim() || !/^[a-z0-9-]+$/.test(editing.slug)) { showError('Name and key (lowercase letters, numbers, hyphens) are required.'); return }
    setSaving(true)
    const { error } = await saveBlogCategory(editing)
    setSaving(false)
    if (error) { showError(String(error)); return }
    showSuccess(`Category ${editing.name} ${editing.id ? 'updated' : 'created'}.`)
    setEditing(null)
    await load()
  }
  const remove = (r) => confirm({
    title: `Delete category "${r.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true,
    onConfirm: async () => {
      const { error } = await deleteBlogCategory(r.id)
      if (error) { showError(String(error)); return }
      showSuccess(`Category ${r.name} deleted.`)
      await load()
    },
  })
  const toggle = async (r) => {
    const { error } = await saveBlogCategory({ ...r, is_active: !r.is_active })
    if (error) { showError(String(error)); return }
    showSuccess(`${r.name} ${r.is_active ? 'hidden' : 'shown'}.`)
    await load()
  }

  if (loading) return <LoadingState message="Loading blog categories..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Blog Categories</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Readers filter blog posts by these. Hidden categories disappear from the blog filter.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search categories..." />
          <ExportListMenu columns={[{ key: '#', label: '#' }, { key: 'name', label: 'Name' }, { key: 'slug', label: 'Key' }, { key: 'posts', label: 'Posts' }, { key: 'status', label: 'Status' }]}
            data={visible} baseFilename="blog_categories" disabled={!visible.length} />
          <PermissionGate permission="system.public_site.edit">
            <button type="button" onClick={() => open(null)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">New Category</button>
          </PermissionGate>
        </div>
      </div>

      {editing && (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{editing.id ? `Edit ${baseline.name}` : 'New category'}</h2>
          <DetailAuditTabList activeTab={tab} onChange={setTab} />
          {tab === 'audit' && !editing.id && <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this category is saved.</p>}
          {tab === 'audit' && editing.id && (
            <AuditDetailsPanel description="Who created or changed this category.">
              <AuditCard title="Identity" description="How this category is identified."><AuditField label="Key" value={editing.slug} /><AuditField label="Name" value={baseline.name} /></AuditCard>
              <AuditCard title="Classification" description="Where it is used."><AuditField label="Posts" value={usage[editing.id] || 0} /><AuditField label="Shown" value={baseline.is_active ? 'Yes' : 'No'} /></AuditCard>
              <AuditCard title="Record history" description="When it was created and last changed.">
                <AuditField label="Created by" value={editing.created_by || null} /><AuditTimestampPair dateLabel="Created at" value={editing.created_at} />
                <AuditField label="Updated by" value={editing.updated_by || null} /><AuditTimestampPair dateLabel="Last updated" value={editing.updated_at} />
              </AuditCard>
            </AuditDetailsPanel>
          )}
          {tab === 'details' && (
            <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
              <AdminField label="Name" required><input className={inputClass} value={editing.name} onChange={set('name')} maxLength={60} /></AdminField>
              <AdminField label="Key (used in links, e.g. /blog?category=pmo)" required><input className={inputClass} value={editing.slug} onChange={set('slug')} maxLength={60} /></AdminField>
              <AdminField label="Description"><input className={inputClass} value={editing.description || ''} onChange={set('description')} maxLength={200} /></AdminField>
              <AdminField label="Order"><input type="number" className={inputClass} value={editing.sort_order} onChange={set('sort_order')} /></AdminField>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={editing.is_active} onChange={set('is_active')} /> Shown in the blog filter</label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button type="button" onClick={close} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
                <button type="submit" disabled={saving || !isDirty} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          )}
        </section>
      )}

      {!visible.length ? (
        <EmptyState title="No categories" description="Run monorepo SQL v1263 seed, or add one with New Category." />
      ) : (
        <AdminTable
          rows={visible}
          pageSize={50}
          columns={[
            { key: '#', label: '#', sortable: false },
            { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'slug', label: 'Key', render: (r) => <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{r.slug}</span> },
            { key: 'description', label: 'Description', render: (r) => <span className="text-gray-500 dark:text-gray-400">{r.description || '—'}</span> },
            { key: 'posts', label: 'Posts' },
            { key: 'sort_order', label: 'Order' },
            { key: 'status', label: 'Status', render: (r) => <AdminBadge label={r.status} variant={r.status} /> },
            {
              key: 'actions', label: 'Actions', sortable: false,
              render: (r) => (
                <AdminRowActions>
                  <PermissionGate permission="system.public_site.edit">
                    <AdminIconActionButton variant="edit" label="Edit" onClick={() => open(r)} />
                    <AdminActionButton onClick={() => toggle(r)}>{r.is_active ? 'Hide' : 'Show'}</AdminActionButton>
                    {!r.posts && <AdminIconActionButton variant="delete" label="Delete" onClick={() => remove(r)} />}
                  </PermissionGate>
                </AdminRowActions>
              ),
            },
          ]}
        />
      )}
      {modal}
    </div>
  )
}
