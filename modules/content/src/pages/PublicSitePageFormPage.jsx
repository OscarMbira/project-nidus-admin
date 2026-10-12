/**
 * v212 (monorepo v1241 Amendment A) — Create / view / edit one common page of the brand site.
 * Route: /content/public-site-page[?slug=<slug>[&view=1]] — friendly slug in the URL (Admin rule 13.1).
 * Body is Markdown; the brand site renders it. Pages are hidden, never deleted.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchSitePages,
  saveSitePage,
  validateSitePage,
  SITE_PAGE_KINDS,
  useUnsavedChangesGuard,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const EMPTY = { slug: '', title: '', summary: '', body_md: '', page_kind: 'page', sort_order: 0, is_active: true }
const toForm = (r) => ({
  slug: r.slug || '', title: r.title || '', summary: r.summary || '', body_md: r.body_md || '',
  page_kind: r.page_kind || 'page', sort_order: r.sort_order ?? 0, is_active: r.is_active !== false,
})

export default function PublicSitePageFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const key = searchParams.get('slug') || searchParams.get('id')
  const isEdit = Boolean(key)
  const isViewOnly = isEdit && searchParams.get('view') === '1'
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [baseline, setBaseline] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [loadError, setLoadError] = useState(null)
  const [tab, setTab] = useState('details')

  useEffect(() => {
    let active = true
    if (!isEdit) return undefined
    ;(async () => {
      const { data, error } = await fetchSitePages()
      if (!active) return
      const row = (data || []).find((r) => r.slug === key || r.id === key) || null
      if (error || !row) setLoadError(String(error || 'Page not found.'))
      else {
        setRecord(row)
        setForm(toForm(row))
        setBaseline(toForm(row))
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [isEdit, key])

  const isDirty = useMemo(() => !isViewOnly && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved page changes.')
  const goBack = () => requestNavigation('/content/public-site-pages')
  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validateSitePage(form)
    setErrors(found)
    if (Object.keys(found).length) {
      showError('Please fix the highlighted fields.')
      return
    }
    setSaving(true)
    const { error } = await saveSitePage({ ...form, id: record?.id || null })
    setSaving(false)
    if (error) {
      showError(String(error))
      return
    }
    setBaseline(form)
    showSuccess(`Page /${form.slug.trim().toLowerCase()} ${isEdit ? 'updated' : 'created'}.`)
    navigate('/content/public-site-pages')
  }

  if (loading) return <LoadingState message="Loading page..." />
  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load page" description={loadError} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to pages &amp; menus
        </button>
      </div>
    )
  }

  const field = (name, label, props = {}) => (
    <AdminField label={label} required={props.required} error={errors[name]}>
      {props.multiline ? (
        <textarea className={`${inputClass} ${props.mono ? 'font-mono text-xs' : ''}`} rows={props.rows || 3} value={form[name]} onChange={set(name)} placeholder={props.placeholder} />
      ) : (
        <input className={inputClass} value={form[name]} onChange={set(name)} placeholder={props.placeholder} type={props.type || 'text'} />
      )}
      {errors[name] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[name]}</p>}
    </AdminField>
  )

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← Back to pages &amp; menus
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {isViewOnly ? 'View Site Page' : isEdit ? 'Edit Site Page' : 'Create Site Page'}
          </h1>
          {record && <p className="font-mono text-xs text-gray-500">/{record.slug}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record && <AdminBadge label={record.is_active ? 'active' : 'inactive'} variant={record.is_active ? 'active' : 'inactive'} />}
          {isViewOnly ? (
            <PermissionGate permission="system.public_site.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/public-site-page?slug=${encodeURIComponent(record.slug)}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                form="site-page-form"
                disabled={saving || (isEdit && !isDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create page'}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && !record && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this page is saved.</p>
      )}
      {tab === 'audit' && record && (
        <AuditDetailsPanel description="Who created or changed this page.">
          <AuditCard title="Identity" description="How this page is identified.">
            <AuditField label="Address" value={`/${record.slug}`} />
            <AuditField label="Title" value={record.title} />
          </AuditCard>
          <AuditCard title="Classification" description="What kind of page it is.">
            <AuditField label="Kind" value={record.page_kind} />
            <AuditField label="Shown on public site" value={record.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this page was created and last changed.">
            <AuditField label="Created by" value={record.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditField label="Updated by" value={record.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <AdminForm id="site-page-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit}>
          <fieldset disabled={isViewOnly} className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field('title', 'Title', { required: true, placeholder: 'About Project Nidus' })}
              {field('slug', 'Address (slug)', { required: true, placeholder: 'about or solutions/pmo' })}
            </div>
            {field('summary', 'Summary (intro line and search description)', { multiline: true, rows: 2 })}
            {field('body_md', 'Page content (Markdown)', { multiline: true, rows: 18, mono: true, placeholder: '## Heading\n\nParagraph text, **bold**, [links](https://example.com) and - bullet lists.' })}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <AdminField label="Kind">
                <select className={inputClass} value={form.page_kind} onChange={set('page_kind')}>
                  {SITE_PAGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </AdminField>
              {field('sort_order', 'Order', { type: 'number' })}
              <AdminField label="Shown on public site">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
                  Visible (links to hidden pages are hidden too)
                </label>
              </AdminField>
            </div>
          </fieldset>
        </AdminForm>
      )}
    </div>
  )
}
