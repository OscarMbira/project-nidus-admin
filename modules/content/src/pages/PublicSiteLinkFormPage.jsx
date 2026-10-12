/**
 * v212 (monorepo v1241 Amendment A) — Create / view / edit one menu link of the public sites
 * (header dropdown, footer column, or a product's own bar).
 * Route: /content/public-site-link[?key=<link_key>[&view=1]] — friendly key in the URL (Admin rule 13.1).
 * A link goes to a brand-site page or to an address (another app opens in a new window).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchSiteNavLinks,
  fetchSitePages,
  fetchSiteProducts,
  saveSiteNavLink,
  validateSiteNavLink,
  siteNavGroupLabel,
  SITE_NAV_GROUPS,
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
  SelectField,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const EMPTY = { link_key: '', nav_group: 'company', label: '', description: '', target: 'page', page_slug: '', url: '', sort_order: 0, is_active: true }
const toForm = (r) => ({
  link_key: r.link_key || '', nav_group: r.nav_group || '', label: r.label || '', description: r.description || '',
  target: r.page_slug ? 'page' : 'url', page_slug: r.page_slug || '', url: r.url || '',
  sort_order: r.sort_order ?? 0, is_active: r.is_active !== false,
})

export default function PublicSiteLinkFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const key = searchParams.get('key') || searchParams.get('id')
  const isEdit = Boolean(key)
  const isViewOnly = isEdit && searchParams.get('view') === '1'
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState(null)
  const [pages, setPages] = useState([])
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [baseline, setBaseline] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [loadError, setLoadError] = useState(null)
  const [tab, setTab] = useState('details')

  useEffect(() => {
    let active = true
    ;(async () => {
      // Independent reads in parallel (Admin rule 19).
      const [l, p, pr] = await Promise.all([isEdit ? fetchSiteNavLinks() : Promise.resolve({ data: [] }), fetchSitePages(), fetchSiteProducts()])
      if (!active) return
      setPages(p.data || [])
      setProducts(pr.data || [])
      if (isEdit) {
        const row = (l.data || []).find((r) => r.link_key === key || r.id === key) || null
        if (l.error || !row) setLoadError(String(l.error || 'Link not found.'))
        else {
          setRecord(row)
          setForm(toForm(row))
          setBaseline(toForm(row))
        }
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [isEdit, key])

  const groupOptions = useMemo(() => [
    ...SITE_NAV_GROUPS,
    ...products.map((p) => ({ value: `product_${p.slug}`, label: siteNavGroupLabel(`product_${p.slug}`) })),
  ], [products])
  const pageOptions = useMemo(
    () => [...pages].sort((a, b) => a.title.localeCompare(b.title)).map((p) => ({ value: p.slug, label: `${p.title} (/${p.slug})${p.is_active ? '' : ' — hidden'}` })),
    [pages],
  )

  const isDirty = useMemo(() => !isViewOnly && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved link changes.')
  const goBack = () => requestNavigation('/content/public-site-pages')
  const setValue = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))
  const set = (field) => (e) => setValue(field, e.target.type === 'checkbox' ? e.target.checked : e.target.value)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validateSiteNavLink(form)
    setErrors(found)
    if (Object.keys(found).length) {
      showError('Please fix the highlighted fields.')
      return
    }
    setSaving(true)
    const { error } = await saveSiteNavLink({ ...form, id: record?.id || null })
    setSaving(false)
    if (error) {
      showError(String(error))
      return
    }
    setBaseline(form)
    showSuccess(`Link ${form.link_key.trim().toLowerCase()} ${isEdit ? 'updated' : 'created'}.`)
    navigate('/content/public-site-pages')
  }

  if (loading) return <LoadingState message="Loading link..." />
  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load link" description={loadError} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to pages &amp; menus
        </button>
      </div>
    )
  }

  const err = (name) => errors[name] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[name]}</p>
  const input = (name, label, props = {}) => (
    <AdminField label={label} required={props.required} error={errors[name]}>
      <input className={inputClass} value={form[name]} onChange={set(name)} placeholder={props.placeholder} type={props.type || 'text'} />
      {err(name)}
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
            {isViewOnly ? 'View Menu Link' : isEdit ? 'Edit Menu Link' : 'Create Menu Link'}
          </h1>
          {record && <p className="font-mono text-xs text-gray-500">{record.link_key}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record && <AdminBadge label={record.is_active ? 'active' : 'inactive'} variant={record.is_active ? 'active' : 'inactive'} />}
          {isViewOnly ? (
            <PermissionGate permission="system.public_site.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/public-site-link?key=${encodeURIComponent(record.link_key)}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                form="site-link-form"
                disabled={saving || (isEdit && !isDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create link'}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && !record && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this link is saved.</p>
      )}
      {tab === 'audit' && record && (
        <AuditDetailsPanel description="Who created or changed this link.">
          <AuditCard title="Identity" description="How this link is identified.">
            <AuditField label="Key" value={record.link_key} />
            <AuditField label="Label" value={record.label} />
          </AuditCard>
          <AuditCard title="Classification" description="Where the link appears and where it goes.">
            <AuditField label="Menu" value={siteNavGroupLabel(record.nav_group)} />
            <AuditField label="Goes to" value={record.page_slug ? `/${record.page_slug}` : record.url} />
            <AuditField label="Shown" value={record.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this link was created and last changed.">
            <AuditField label="Created by" value={record.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditField label="Updated by" value={record.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <AdminForm id="site-link-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit}>
          <fieldset disabled={isViewOnly} className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {input('label', 'Label', { required: true, placeholder: 'About us' })}
              {input('link_key', 'Key', { required: true, placeholder: 'company.about' })}
            </div>
            <AdminField label="Menu" required error={errors.nav_group}>
              <SelectField value={form.nav_group} onChange={(v) => setValue('nav_group', v)} options={groupOptions} placeholder="Choose a menu" className={inputClass} />
              {err('nav_group')}
            </AdminField>
            {input('description', 'Short description (shown under the label in header menus)')}
            <AdminField label="Goes to">
              <div className="flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-300">
                <label className="flex items-center gap-2">
                  <input type="radio" name="target" checked={form.target === 'page'} onChange={() => setValue('target', 'page')} />
                  A page on the brand site
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="target" checked={form.target === 'url'} onChange={() => setValue('target', 'url')} />
                  An address (another app opens in a new window)
                </label>
              </div>
            </AdminField>
            {form.target === 'page' ? (
              <AdminField label="Page" required error={errors.page_slug}>
                <SelectField value={form.page_slug} onChange={(v) => setValue('page_slug', v)} options={pageOptions} placeholder="Choose a page" className={inputClass} />
                {err('page_slug')}
              </AdminField>
            ) : (
              input('url', 'Address', { required: true, placeholder: 'https://platform.example.com/pricing or /platform/features' })
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {input('sort_order', 'Order', { type: 'number' })}
              <AdminField label="Shown">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
                  Visible in the menu
                </label>
              </AdminField>
            </div>
          </fieldset>
        </AdminForm>
      )}
    </div>
  )
}
