/**
 * v210 (monorepo v1241) — View / edit one brand copy entry (public.site_content).
 * Route: /content/public-site-content?key=<content_key>[&view=1].
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchSiteContent, saveSiteContent, useUnsavedChangesGuard, PermissionGate } from '@nidus-admin/shared'
import {
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

export default function PublicSiteContentFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const key = searchParams.get('key') || ''
  const isViewOnly = searchParams.get('view') === '1'
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState(null)
  const [value, setValue] = useState('')
  const [baseline, setBaseline] = useState('')
  const [tab, setTab] = useState('details')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await fetchSiteContent()
      if (!active) return
      if (error) showError(String(error))
      const row = (data || []).find((r) => r.content_key === key) || null
      setRecord(row)
      setValue(row?.content_value || '')
      setBaseline(row?.content_value || '')
      setLoading(false)
    })()
    return () => { active = false }
  }, [key])

  const isDirty = useMemo(() => !isViewOnly && value !== baseline, [value, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved brand copy changes.')
  const goBack = () => requestNavigation('/content/public-site')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await saveSiteContent({ content_key: key, content_value: value, description: record?.description, is_active: record?.is_active !== false })
    setSaving(false)
    if (error) {
      showError(String(error))
      return
    }
    setBaseline(value)
    showSuccess(`${key} updated.`)
    navigate('/content/public-site')
  }

  if (loading) return <LoadingState message="Loading brand copy..." />
  if (!record) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Brand copy entry not found" description={`No entry with key "${key}".`} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to public site products
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← Back to public site products
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{isViewOnly ? 'View Brand Copy' : 'Edit Brand Copy'}</h1>
          <p className="font-mono text-xs text-gray-500">{key}</p>
        </div>
        {isViewOnly ? (
          <PermissionGate permission="system.public_site.edit">
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/public-site-content?key=${encodeURIComponent(key)}`)} />
          </PermissionGate>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" form="site-content-form" disabled={saving || !isDirty} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        )}
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && (
        <AuditDetailsPanel description="Who created or changed this brand copy entry.">
          <AuditCard title="Identity" description="Which entry this is.">
            <AuditField label="Key" value={record.content_key} />
          </AuditCard>
          <AuditCard title="Classification" description="What the entry is for.">
            <AuditField label="Purpose" value={record.description || null} />
            <AuditField label="Active" value={record.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this entry was created and last changed.">
            <AuditField label="Created by" value={record.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditField label="Updated by" value={record.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <AdminForm id="site-content-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit}>
          <fieldset disabled={isViewOnly} className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4">
            {record.description && <p className="text-sm text-gray-500 dark:text-gray-400">{record.description}</p>}
            <AdminField label="Value">
              <textarea className={inputClass} rows={4} value={value} onChange={(e) => setValue(e.target.value)} />
            </AdminField>
          </fieldset>
        </AdminForm>
      )}
    </div>
  )
}
