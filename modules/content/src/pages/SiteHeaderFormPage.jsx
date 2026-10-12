/**
 * v215 (monorepo v1264) — View / edit one public header's colours and main button.
 * Route: /content/site-header?scope=<brand|product slug>[&view=1] — friendly key in the URL (Admin rule 13.1).
 * Save is blocked below WCAG AA contrast (4.5:1); the database checks the same rule (SQL v1264 / v233).
 * Saving publishes at once (PRD D10): apps within ~10 minutes, brand site on its next build.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  contrastRatio,
  fetchSiteHeaderSettings,
  fetchSiteProducts,
  saveSiteHeaderSettings,
  siteHeaderLabel,
  validateSiteHeaderSettings,
  SITE_HEADER_MIN_CONTRAST,
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

// Today's dark header (monorepo DEFAULT_HEADER_COLORS) as the starting point for an unsaved header.
const BUILT_IN = { bg_color: '#030712', text_color: '#D1D5DB', accent_color: '#2563EB', cta_text_color: '#FFFFFF' }
const toForm = (r, scope) => ({
  scope_slug: scope,
  bg_color: r?.bg_color || BUILT_IN.bg_color,
  text_color: r?.text_color || BUILT_IN.text_color,
  accent_color: r?.accent_color || BUILT_IN.accent_color,
  cta_text_color: r?.cta_text_color || BUILT_IN.cta_text_color,
  cta_label: r?.cta_label || 'Get started',
  cta_url: r?.cta_url || '',
  is_active: r ? r.is_active !== false : true,
})

const COLOUR_FIELDS = [
  ['bg_color', 'Background'],
  ['text_color', 'Text'],
  ['accent_color', 'Accent (button and icons)'],
  ['cta_text_color', 'Button text'],
]

function ContrastNote({ label, ratio }) {
  const ok = ratio !== null && ratio >= SITE_HEADER_MIN_CONTRAST
  return (
    <p className={`text-xs ${ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {label}: {ratio === null ? '—' : `${ratio}:1`} {ok ? '✓ readable' : `— needs ${SITE_HEADER_MIN_CONTRAST}:1`}
    </p>
  )
}

/** A simplified header in the chosen colours (the real one also has dropdowns and a mobile menu). */
function HeaderPreview({ form, title, isBrand }) {
  const links = isBrand ? ['Products ▾', 'Solutions ▾', 'Pricing', 'Resources ▾', 'Company ▾'] : ['Features', 'Pricing', 'Docs', 'Project Nidus ▾']
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex min-w-[640px] items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: form.bg_color, color: form.text_color }}>
        <div className="flex items-center gap-4">
          <span className="text-lg font-extrabold">Project Nidus</span>
          {!isBrand && <span className="text-sm font-semibold" style={{ color: form.accent_color }}>▦ <span style={{ color: form.text_color }}>{title}</span></span>}
          {links.map((l) => <span key={l} className="text-sm">{l}</span>)}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">Sign in</span>
          <span className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ backgroundColor: form.accent_color, color: form.cta_text_color }}>{form.cta_label || 'Button'}</span>
        </div>
      </div>
    </div>
  )
}

export default function SiteHeaderFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const scope = String(searchParams.get('scope') || '').trim().toLowerCase()
  const isViewOnly = searchParams.get('view') === '1'
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState(null)
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(() => toForm(null, scope))
  const [baseline, setBaseline] = useState(() => toForm(null, scope))
  const [errors, setErrors] = useState({})
  const [loadError, setLoadError] = useState(null)
  const [tab, setTab] = useState('details')

  useEffect(() => {
    let active = true
    ;(async () => {
      const [p, s] = await Promise.all([fetchSiteProducts(), fetchSiteHeaderSettings()])
      if (!active) return
      const list = p.data || []
      setProducts(list)
      if (p.error || s.error) setLoadError(String(p.error || s.error))
      else if (scope !== 'brand' && !list.some((x) => x.slug === scope && x.slug !== 'admin')) setLoadError('Header not found.')
      else {
        const row = (s.data || []).find((r) => r.scope_slug === scope) || null
        setRecord(row)
        setForm(toForm(row, scope))
        setBaseline(toForm(row, scope))
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [scope])

  const isBrand = scope === 'brand'
  const title = siteHeaderLabel(scope, products)
  const isDirty = useMemo(() => !isViewOnly && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved header changes.')
  const goBack = () => requestNavigation('/content/site-headers')
  const setValue = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))
  const textRatio = contrastRatio(form.text_color, form.bg_color)
  const ctaRatio = contrastRatio(form.cta_text_color, form.accent_color)
  const liveErrors = validateSiteHeaderSettings(form)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrors(liveErrors)
    if (Object.keys(liveErrors).length) {
      showError('Please fix the highlighted fields.')
      return
    }
    setSaving(true)
    const { error } = await saveSiteHeaderSettings(form)
    setSaving(false)
    if (error) {
      showError(String(error))
      return
    }
    setBaseline(form)
    showSuccess(`Header ${title} ${record ? 'updated' : 'created'}.`)
    navigate('/content/site-headers')
  }

  if (loading) return <LoadingState message="Loading header..." />
  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load header" description={loadError} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to site headers
        </button>
      </div>
    )
  }

  const err = (name) => errors[name] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[name]}</p>

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← Back to site headers
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{isViewOnly ? 'View' : 'Edit'} Header — {title}</h1>
          <p className="font-mono text-xs text-gray-500">{scope}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge label={!record ? 'not set' : record.is_active ? 'active' : 'inactive'} variant={record?.is_active ? 'active' : 'inactive'} />
          {isViewOnly ? (
            <PermissionGate permission="system.public_site.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/site-header?scope=${encodeURIComponent(scope)}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                form="site-header-form"
                disabled={saving || (record && !isDirty) || Boolean(liveErrors.text_color || liveErrors.cta_text_color)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save and publish'}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && !record && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this header is saved.</p>
      )}
      {tab === 'audit' && record && (
        <AuditDetailsPanel description="Who created or changed this header.">
          <AuditCard title="Identity" description="Which header this is.">
            <AuditField label="Header" value={title} />
            <AuditField label="Key" value={record.scope_slug} />
          </AuditCard>
          <AuditCard title="Classification" description="Colours and main button.">
            <AuditField label="Colours" value={`${record.bg_color} / ${record.text_color} / ${record.accent_color}`} />
            <AuditField label="Button" value={record.cta_label} />
            <AuditField label="Shown" value={record.is_active ? 'Yes' : 'No (built-in colours)'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this header was created and last changed.">
            <AuditField label="Created by" value={record.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditField label="Updated by" value={record.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <AdminForm id="site-header-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit}>
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Preview</p>
              <HeaderPreview form={form} title={title} isBrand={isBrand} />
            </div>
            <fieldset disabled={isViewOnly} className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {COLOUR_FIELDS.map(([name, label]) => (
                  <AdminField key={name} label={label} required error={errors[name]}>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`${label} colour picker`}
                        value={/^#[0-9a-f]{6}$/i.test(form[name]) ? form[name] : '#000000'}
                        onChange={(e) => setValue(name, e.target.value.toUpperCase())}
                        className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
                      />
                      <input className={`${inputClass} font-mono`} value={form[name]} onChange={(e) => setValue(name, e.target.value)} placeholder="#0B1220" maxLength={7} />
                    </div>
                    {err(name)}
                  </AdminField>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <ContrastNote label="Text on background" ratio={textRatio} />
                <ContrastNote label="Button text on accent" ratio={ctaRatio} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <AdminField label="Button label" required error={errors.cta_label}>
                  <input className={inputClass} value={form.cta_label} onChange={(e) => setValue('cta_label', e.target.value)} maxLength={40} placeholder="Request a demo" />
                  {err('cta_label')}
                </AdminField>
                <AdminField label="Button goes to" error={errors.cta_url}>
                  <input
                    className={inputClass}
                    value={form.cta_url}
                    onChange={(e) => setValue('cta_url', e.target.value)}
                    placeholder={isBrand ? 'Blank = "Which product?" chooser' : 'Blank = product sign-up · /platform/request-demo · https://…'}
                  />
                  {err('cta_url')}
                </AdminField>
              </div>
              <AdminField label="Shown">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setValue('is_active', e.target.checked)} />
                  Use these settings (off = built-in colours and the product sign-up button)
                </label>
              </AdminField>
            </fieldset>
          </div>
        </AdminForm>
      )}
    </div>
  )
}
