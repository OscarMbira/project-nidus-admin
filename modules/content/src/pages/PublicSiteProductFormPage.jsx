/**
 * v210 (monorepo v1241) — Create / view / edit one public site product card.
 * Route: /content/public-site-product[?slug=<slug>[&view=1]] — friendly slug in the URL
 * (Admin rule 13.1); loads by slug or id. Writes go through public.admin_upsert_site_product.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchSiteProductBySlugOrId,
  saveSiteProduct,
  validateSiteProduct,
  SITE_PRODUCT_ICON_KEYS,
  SITE_PRODUCT_ACCENT_KEYS,
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

const EMPTY = {
  slug: '', name: '', tagline: '', description: '', audience: '',
  landing_url: '', sign_in_url: '', sign_up_url: '', icon_key: '', accent_key: '',
  sort_order: 0, is_active: false, pricing_url: '', docs_url: '',
}

const toForm = (r) => ({
  slug: r.slug || '', name: r.name || '', tagline: r.tagline || '', description: r.description || '',
  audience: r.audience || '', landing_url: r.landing_url || '', sign_in_url: r.sign_in_url || '',
  sign_up_url: r.sign_up_url || '', icon_key: r.icon_key || '', accent_key: r.accent_key || '',
  sort_order: r.sort_order ?? 0, is_active: r.is_active !== false,
  pricing_url: r.pricing_url || '', docs_url: r.docs_url || '',
})

export default function PublicSiteProductFormPage() {
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
      setLoading(true)
      const { data, error } = await fetchSiteProductBySlugOrId(key)
      if (!active) return
      if (error || !data) {
        setLoadError(String(error || 'Product card not found.'))
      } else {
        setRecord(data)
        setForm(toForm(data))
        setBaseline(toForm(data))
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [isEdit, key])

  const isDirty = useMemo(() => !isViewOnly && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved product card changes.')
  const goBack = () => requestNavigation('/content/public-site')
  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validateSiteProduct(form)
    setErrors(found)
    if (Object.keys(found).length) {
      showError('Please fix the highlighted fields.')
      return
    }
    setSaving(true)
    const { error } = await saveSiteProduct({ ...form, id: record?.id || null })
    setSaving(false)
    if (error) {
      showError(String(error))
      return
    }
    setBaseline(form)
    showSuccess(`${form.slug.trim().toLowerCase()} ${isEdit ? 'updated' : 'created'}.`)
    navigate('/content/public-site')
  }

  if (loading) return <LoadingState message="Loading product card..." />
  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load product card" description={loadError} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to public site products
        </button>
      </div>
    )
  }

  const field = (name, label, props = {}) => (
    <AdminField label={label} required={props.required} error={errors[name]}>
      {props.multiline ? (
        <textarea className={inputClass} rows={props.rows || 3} value={form[name]} onChange={set(name)} />
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
            ← Back to public site products
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {isViewOnly ? 'View Product Card' : isEdit ? 'Edit Product Card' : 'Create Product Card'}
          </h1>
          {record && <p className="font-mono text-xs text-gray-500">{record.slug}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record && <AdminBadge label={record.is_active ? 'active' : 'inactive'} variant={record.is_active ? 'active' : 'inactive'} />}
          {isViewOnly ? (
            <PermissionGate permission="system.public_site.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/public-site-product?slug=${encodeURIComponent(record.slug)}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                form="site-product-form"
                disabled={saving || (isEdit && !isDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create card'}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && !record && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this card is saved.</p>
      )}
      {tab === 'audit' && record && (
        <AuditDetailsPanel description="Who created or changed this product card, and where it appears.">
          <AuditCard title="Identity" description="How this card is identified.">
            <AuditField label="Slug" value={record.slug} />
            <AuditField label="Name" value={record.name} />
          </AuditCard>
          <AuditCard title="Classification" description="Where and how the card is shown.">
            <AuditField label="Card order" value={record.sort_order} />
            <AuditField label="Shown on public site" value={record.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this card was created and last changed.">
            <AuditField label="Created by" value={record.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditField label="Updated by" value={record.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <AdminForm id="site-product-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit}>
          <fieldset disabled={isViewOnly} className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field('name', 'Name', { required: true, placeholder: 'Project Nidus Planner' })}
              {field('slug', 'Slug', { required: true, placeholder: 'planner' })}
            </div>
            {field('tagline', 'Tagline')}
            {field('description', 'Description', { multiline: true })}
            {field('audience', 'Who it is for')}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {field('landing_url', 'Landing page URL', { required: true, placeholder: 'https://planner.example.com/' })}
              {field('sign_in_url', 'Sign-in URL')}
              {field('sign_up_url', 'Sign-up URL')}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field('pricing_url', 'Pricing page URL', { placeholder: 'https://planner.example.com/pricing' })}
              {field('docs_url', 'Documentation URL')}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <AdminField label="Icon">
                {/* Presentation keys the brand site knows how to draw (icons as presentation, Admin rule 15). */}
                <select className={inputClass} value={form.icon_key} onChange={set('icon_key')}>
                  <option value="">Default</option>
                  {SITE_PRODUCT_ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </AdminField>
              <AdminField label="Accent colour">
                <select className={inputClass} value={form.accent_key} onChange={set('accent_key')}>
                  <option value="">Neutral</option>
                  {SITE_PRODUCT_ACCENT_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </AdminField>
              {field('sort_order', 'Card order', { type: 'number' })}
              <AdminField label="Shown on public site">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
                  Visible on the brand site and in the Products menu
                </label>
              </AdminField>
            </div>
          </fieldset>
        </AdminForm>
      )}
    </div>
  )
}
