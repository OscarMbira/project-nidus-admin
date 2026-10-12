/**
 * v213 (monorepo v1262) — View / edit one brand-site section. Route:
 * /content/site-section?page=<home|slug>&key=<section_key>[&view=1] (friendly keys, Admin rule 13.1).
 * Saving stores a draft; visitors see it only after "Publish" on the Site Sections page.
 * Fields shown depend on the section type; repeating items are edited as a table.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  SITE_ICON_KEYS,
  SITE_SECTION_FIELDS,
  SITE_SECTION_ITEM_FIELDS,
  discardSiteSectionDraft,
  effectiveSiteSection,
  fetchSiteSections,
  saveSiteSectionDraft,
  siteSectionChanges,
  siteSectionStatus,
  siteSectionTypeLabel,
  uploadSiteAsset,
  validateSiteSection,
  normalizeImageFile,
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
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import PasteImageButton from '../components/PasteImageButton.jsx'

const toForm = (e) => ({
  heading: e.heading || '',
  subheading: e.subheading || '',
  body: e.body || '',
  primary_cta: { label: e.primary_cta?.label || '', href: e.primary_cta?.href || '' },
  secondary_cta: { label: e.secondary_cta?.label || '', href: e.secondary_cta?.href || '' },
  image_url: e.image_url || '',
  image_alt: e.image_alt || '',
  items: Array.isArray(e.items) ? e.items.map((i) => ({ ...i })) : [],
  is_active: e.is_active !== false,
})

// Form → stored content: empty buttons become null, empty item fields are dropped.
const toContent = (f) => {
  const cta = (c) => (c.label.trim() || c.href.trim() ? { label: c.label.trim(), href: c.href.trim() } : null)
  return {
    heading: f.heading.trim(),
    subheading: f.subheading.trim(),
    body: f.body.trim(),
    primary_cta: cta(f.primary_cta),
    secondary_cta: cta(f.secondary_cta),
    image_url: f.image_url.trim(),
    image_alt: f.image_alt.trim(),
    items: f.items.map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v))),
    is_active: f.is_active,
  }
}

function ImagePicker({ url, onChange, disabled, label = 'Upload image' }) {
  const { showError } = useToast()
  const [busy, setBusy] = useState(false)
  const applyFile = async (file) => {
    setBusy(true)
    const { data, error } = await uploadSiteAsset(normalizeImageFile(file, 'section-image.png'))
    setBusy(false)
    if (error) showError(String(error))
    else onChange(data.url)
  }
  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) applyFile(file)
  }
  return (
    <div className="flex flex-wrap items-start gap-2">
      {url && <img src={url} alt="" className="h-10 w-10 rounded border border-gray-200 object-cover dark:border-gray-700" />}
      {!disabled && (
        <label className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
          {busy ? 'Uploading...' : url ? 'Replace' : label}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={pick} disabled={busy} />
        </label>
      )}
      {!disabled && <PasteImageButton onFile={applyFile} disabled={busy} className="!px-2 !py-1 !text-xs" fileName="section-image" />}
      {url && !disabled && <button type="button" onClick={() => onChange('')} className="text-xs text-red-600 hover:underline dark:text-red-400">Remove</button>}
    </div>
  )
}

export default function SiteSectionFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pageSlug = searchParams.get('page') || 'home'
  const key = searchParams.get('key') || ''
  const isViewOnly = searchParams.get('view') === '1'
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState(null)
  const [form, setForm] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [errors, setErrors] = useState({})
  const [tab, setTab] = useState('details')

  const load = async () => {
    const { data, error } = await fetchSiteSections()
    if (error) showError(String(error))
    const row = (data || []).find((r) => r.page_slug === pageSlug && (r.section_key === key || r.id === key)) || null
    setRecord(row)
    if (row) {
      const f = toForm(effectiveSiteSection(row))
      setForm(f)
      setBaseline(f)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [pageSlug, key])

  const isDirty = useMemo(() => !isViewOnly && form && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved section changes.')
  const goBack = () => requestNavigation(`/content/site-sections?page=${encodeURIComponent(pageSlug)}`)

  if (loading) return <LoadingState message="Loading section..." />
  if (!record || !form) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Section not found" description={`No section "${key}" on page ${pageSlug}.`} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Back to site sections</button>
      </div>
    )
  }

  const type = record.section_type
  const fields = SITE_SECTION_FIELDS[type] || []
  const itemFields = SITE_SECTION_ITEM_FIELDS[type] || []
  const status = siteSectionStatus(record)
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const setCta = (which, part, value) => setForm((f) => ({ ...f, [which]: { ...f[which], [part]: value } }))
  const setItem = (i, field, value) => setForm((f) => ({ ...f, items: f.items.map((it, n) => (n === i ? { ...it, [field]: value } : it)) }))
  const moveItem = (i, d) => setForm((f) => {
    const items = [...f.items]
    const j = i + d
    if (j < 0 || j >= items.length) return f
    ;[items[i], items[j]] = [items[j], items[i]]
    return { ...f, items }
  })
  const removeItem = (i) => confirm({
    title: `Delete item ${i + 1}?`,
    message: 'It is removed from this draft. Visitors keep seeing it until you publish.',
    confirmLabel: 'Delete item',
    danger: true,
    onConfirm: () => setForm((f) => ({ ...f, items: f.items.filter((_, n) => n !== i) })),
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const content = toContent(form)
    const found = validateSiteSection(type, content)
    setErrors(found)
    if (Object.keys(found).length) { showError('Please fix the highlighted fields.'); return }
    const changes = siteSectionChanges(toContent(baseline), content)
    if (!Object.keys(changes).length) return
    setSaving(true)
    const { error } = await saveSiteSectionDraft(record.id, changes)
    setSaving(false)
    if (error) { showError(String(error)); return }
    setBaseline(form)
    showSuccess(`Section ${record.section_key} saved as a draft. Publish the page to make it live.`)
    navigate(`/content/site-sections?page=${encodeURIComponent(pageSlug)}`)
  }

  const discard = () => confirm({
    title: 'Discard this section\'s draft?',
    message: record.published_at ? 'The section goes back to the published version.' : 'This section was never published; it stays hidden with no content.',
    confirmLabel: 'Discard draft',
    danger: true,
    onConfirm: async () => {
      const { error } = await discardSiteSectionDraft(record.id)
      if (error) { showError(String(error)); return }
      showSuccess(`Draft of ${record.section_key} discarded.`)
      setLoading(true)
      await load()
    },
  })

  const text = (name, label, props = {}) => (
    <AdminField label={label} required={props.required} error={errors[name]}>
      {props.multiline
        ? <textarea className={inputClass} rows={props.rows || 3} value={form[name]} onChange={(e) => set(name, e.target.value)} placeholder={props.placeholder} />
        : <input className={inputClass} value={form[name]} onChange={(e) => set(name, e.target.value)} placeholder={props.placeholder} />}
      {errors[name] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[name]}</p>}
    </AdminField>
  )
  const cta = (which, label) => (
    <AdminField label={label} error={errors[which]}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={inputClass} placeholder="Button text" value={form[which].label} onChange={(e) => setCta(which, 'label', e.target.value)} />
        <input className={inputClass} placeholder="#get-started, /contact?topic=sales or https://…" value={form[which].href} onChange={(e) => setCta(which, 'href', e.target.value)} />
      </div>
      {errors[which] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[which]}</p>}
    </AdminField>
  )
  const itemErrors = Object.entries(errors).filter(([k]) => k.startsWith('items'))

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">← Back to site sections</button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{isViewOnly ? 'View' : 'Edit'} {siteSectionTypeLabel(type)}</h1>
          <p className="font-mono text-xs text-gray-500">{pageSlug === 'home' ? '/' : `/${pageSlug}`} #{record.section_key}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge label={status === 'published' ? 'published' : status === 'draft' ? 'draft changes' : 'new — not published'} variant={status === 'published' ? 'active' : 'pending'} />
          {isViewOnly ? (
            <PermissionGate permission="system.public_site.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/site-section?page=${encodeURIComponent(pageSlug)}&key=${encodeURIComponent(record.section_key)}`)} />
            </PermissionGate>
          ) : (
            <>
              {record.draft && <button type="button" onClick={discard} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30">Discard draft</button>}
              <button type="button" onClick={goBack} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
              <button type="submit" form="site-section-form" disabled={saving || !isDirty}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving...' : 'Save draft'}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && (
        <AuditDetailsPanel description="Who created, changed and published this section.">
          <AuditCard title="Identity" description="Where this section lives.">
            <AuditField label="Page" value={pageSlug === 'home' ? 'Homepage' : `/${pageSlug}`} />
            <AuditField label="Key" value={record.section_key} />
          </AuditCard>
          <AuditCard title="Classification" description="What kind of section it is.">
            <AuditField label="Type" value={siteSectionTypeLabel(type)} />
            <AuditField label="Shown to visitors" value={record.is_active ? 'Yes' : 'No'} />
            <AuditField label="Unpublished changes" value={record.draft ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this section was created, changed and published.">
            <AuditField label="Created by" value={record.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditField label="Updated by" value={record.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
            <AuditField label="Published by" value={record.published_by || null} />
            <AuditTimestampPair dateLabel="Last published" value={record.published_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <AdminForm id="site-section-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit}>
          <fieldset disabled={isViewOnly} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 md:p-4">
            {fields.includes('heading') && text('heading', type === 'hero' ? 'Headline' : 'Heading', { required: !['trust_strip', 'testimonials', 'product_cards'].includes(type) })}
            {fields.includes('subheading') && text('subheading', type === 'hero' ? 'Value statement' : 'Intro text', { multiline: true, rows: 2 })}
            {fields.includes('body') && text('body', 'Small print (optional)', { placeholder: 'e.g. Start with a free trial.' })}
            {fields.includes('primary_cta') && cta('primary_cta', 'Main button')}
            {fields.includes('secondary_cta') && cta('secondary_cta', 'Second button (optional)')}
            {fields.includes('image') && (
              <AdminField label="Image (PNG, JPG, WebP or SVG, up to 2 MB)" error={errors.image_alt}>
                <ImagePicker url={form.image_url} onChange={(u) => set('image_url', u)} disabled={isViewOnly} />
                {form.image_url && <input className={`${inputClass} mt-2`} placeholder="Describe the image for screen readers" value={form.image_alt} onChange={(e) => set('image_alt', e.target.value)} />}
                {errors.image_alt && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.image_alt}</p>}
              </AdminField>
            )}
            {type === 'product_cards' && (
              <p className="text-sm text-gray-500 dark:text-gray-400">The cards come from Public Site Products, so they always match the products listed there.</p>
            )}

            {itemFields.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Items ({form.items.length})</h2>
                  {!isViewOnly && (
                    <button type="button" onClick={() => set('items', [...form.items, {}])} disabled={form.items.length >= 24}
                      className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                      Add item
                    </button>
                  )}
                </div>
                {!form.items.length && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {['trust_strip', 'testimonials'].includes(type) ? 'No items yet. Add real logos, figures or quotes only; the section stays empty until you do.' : 'No items yet.'}
                  </p>
                )}
                {itemErrors.map(([k, msg]) => <p key={k} className="text-xs text-red-600 dark:text-red-400">{msg}</p>)}
                {form.items.length > 0 && (
                  <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        <tr>
                          <th className="px-2 py-2">#</th>
                          {itemFields.map((f) => <th key={f.key} className="px-2 py-2">{f.label}</th>)}
                          {!isViewOnly && <th className="px-2 py-2">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {form.items.map((item, i) => (
                          <tr key={i} className="align-top">
                            <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                            {itemFields.map((f) => (
                              <td key={f.key} className="px-2 py-2">
                                {f.icon ? (
                                  <select className={inputClass} value={item[f.key] || ''} onChange={(e) => setItem(i, f.key, e.target.value)}>
                                    <option value="">Default</option>
                                    {SITE_ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                                  </select>
                                ) : f.image ? (
                                  <ImagePicker url={item[f.key]} onChange={(u) => setItem(i, f.key, u)} disabled={isViewOnly} label="Upload" />
                                ) : f.key === 'text' ? (
                                  <textarea className={`${inputClass} min-w-[14rem]`} rows={2} value={item[f.key] || ''} onChange={(e) => setItem(i, f.key, e.target.value)} />
                                ) : (
                                  <input className={`${inputClass} min-w-[10rem]`} value={item[f.key] || ''} onChange={(e) => setItem(i, f.key, e.target.value)}
                                    placeholder={f.key === 'href' ? '/solutions/pmo or https://…' : ''} />
                                )}
                              </td>
                            ))}
                            {!isViewOnly && (
                              <td className="whitespace-nowrap px-2 py-2">
                                <button type="button" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => moveItem(i, -1)}
                                  className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-800"><span aria-hidden="true">↑</span></button>
                                <button type="button" aria-label="Move down" title="Move down" disabled={i === form.items.length - 1} onClick={() => moveItem(i, 1)}
                                  className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-800"><span aria-hidden="true">↓</span></button>
                                <AdminIconActionButton variant="delete" label="Delete item" onClick={() => removeItem(i)} />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <AdminField label="Shown on the page">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                Show this section to visitors (after publishing)
              </label>
            </AdminField>
          </fieldset>
        </AdminForm>
      )}
      {modal}
    </div>
  )
}
