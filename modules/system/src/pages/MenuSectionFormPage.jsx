/**
 * Admin plan v217 (monorepo v1341 D29, D4) — edit one sidebar section or shared slot.
 * Routed page (Admin rule 18): /system/menu-section-form?type=section|slot&app=platform|simulator&code=<code>.
 * Saves ask for a reason and are audited (SQL v249). Sections and slots are seeded by SQL; this
 * screen renames and reorders them (codes stay fixed, the engine and placements refer to them).
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MENU_APPS, fetchMenuSections, fetchMenuSlots, upsertMenuSection, upsertMenuSlot, useUnsavedChangesGuard } from '@nidus-admin/shared'
import {
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

export default function MenuSectionFormPage() {
  const [params] = useSearchParams()
  const type = params.get('type') === 'slot' ? 'slot' : 'section'
  const app = params.get('app') || 'platform'
  const code = params.get('code') || ''
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [tab, setTab] = useState('details')
  const [record, setRecord] = useState(null)
  const [sections, setSections] = useState([])
  const [form, setForm] = useState(null)
  const [baseline, setBaseline] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [s, sl] = await Promise.all([fetchMenuSections(app), fetchMenuSlots(app)])
      if (cancelled) return
      setSections(s.data)
      const row = type === 'section' ? s.data.find((r) => r.section_code === code) : sl.data.find((r) => r.slot_key === code)
      if (row) {
        const next = {
          label: row.label || '', icon: row.icon || '', sortOrder: row.sort_order ?? 0, overflowLabel: row.overflow_label || '',
          sectionCode: row.section_code || '', isActive: row.is_active !== false,
        }
        setRecord(row)
        setForm(next)
        setBaseline(JSON.stringify(next))
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [app, code, type])

  const isDirty = !saved && form && JSON.stringify(form) !== baseline
  const { requestNavigation } = useUnsavedChangesGuard(Boolean(isDirty), 'You have unsaved changes.')
  const listPath = `/system/menu-sections?app=${app}`
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const save = () => {
    if (!form.label.trim()) { showError('A label is required'); return }
    confirm({
      title: `Save ${type === 'section' ? 'section' : 'slot'} "${form.label}"?`,
      message: 'Every consolidated sidebar picks up the change at its next page load.',
      confirmLabel: 'Save',
      requireReason: true,
      onConfirm: async (reason) => {
        const { error } = type === 'section'
          ? await upsertMenuSection({ app, sectionCode: code, label: form.label.trim(), icon: form.icon, sortOrder: form.sortOrder, overflowLabel: form.overflowLabel, isActive: form.isActive }, reason)
          : await upsertMenuSlot({ app, slotKey: code, label: form.label.trim(), sectionCode: form.sectionCode, sortOrder: form.sortOrder, isActive: form.isActive }, reason)
        if (error) { showError(error); return }
        setSaved(true)
        showSuccess(`${type === 'section' ? 'Section' : 'Slot'} "${form.label.trim()}" (${code}) updated.`)
        requestNavigation(listPath)
      },
    })
  }

  if (loading) return <LoadingState message="Loading..." />
  if (!record) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <button type="button" onClick={() => requestNavigation(listPath)} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">← Back to sections & slots</button>
        <p className="text-sm text-gray-600 dark:text-gray-400">Not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button type="button" onClick={() => requestNavigation(listPath)} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">← Back to sections & slots</button>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Edit {type === 'section' ? 'section' : 'shared slot'}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">{MENU_APPS[app]} · <span className="font-mono">{code}</span></p>
      </div>
      <DetailAuditTabList activeTab={tab} onChange={setTab} />
      {tab === 'audit' ? (
        <AuditDetailsPanel description="When this was created and last changed.">
          <AuditCard title="Identity" description="How it is labelled.">
            <AuditField label="Code" value={code} />
            <AuditField label="Label" value={record.label} />
          </AuditCard>
          <AuditCard title="Classification" description="Where it applies.">
            <AuditField label="App" value={MENU_APPS[app]} />
            <AuditField label="Type" value={type === 'section' ? 'Section' : 'Shared slot'} />
          </AuditCard>
          <AuditCard title="Record history" description="Changes are also in the admin audit log.">
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      ) : (
        <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 md:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ms-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
              <input id="ms-label" className={inputClass} value={form.label} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div>
              <label htmlFor="ms-order" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Order</label>
              <input id="ms-order" type="number" className={inputClass} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
            </div>
            {type === 'section' ? (
              <>
                <div>
                  <label htmlFor="ms-icon" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Icon name</label>
                  <input id="ms-icon" className={inputClass} value={form.icon} onChange={(e) => set('icon', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ms-overflow" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Industry group label</label>
                  <input id="ms-overflow" className={inputClass} value={form.overflowLabel} onChange={(e) => set('overflowLabel', e.target.value)} />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used when the section has more than 12 entries and its industry pages are grouped.</p>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="ms-section" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Section</label>
                <select id="ms-section" className={inputClass} value={form.sectionCode} onChange={(e) => set('sectionCode', e.target.value)}>
                  {sections.map((s) => <option key={s.section_code} value={s.section_code}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Active
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={save} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">Save</button>
            <button type="button" onClick={() => requestNavigation(listPath)} className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          </div>
        </div>
      )}
      {modal}
    </div>
  )
}
