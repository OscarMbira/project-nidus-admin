/**
 * Admin plan v217 (monorepo v1341 D21) — add or edit one placement: which section (and optional
 * sub-menu parent or shared slot) a menu item appears in for one role's sidebar. Also sets the
 * item's default section, used when a role has no placement for it (full menus only).
 * Routed page (Admin rule 18): /system/menu-placement-form?key=<placement key>[&id=<placement>&item=<menu item>].
 * Saves ask for a reason and are audited (SQL v249).
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  PLACEMENT_KEY_LABELS,
  fetchMenuPlacements,
  fetchMenuSections,
  fetchMenuSlots,
  searchMenuItemsForPlacement,
  setMenuItemDefaultSection,
  upsertMenuPlacement,
  useUnsavedChangesGuard,
} from '@nidus-admin/shared'
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

const EMPTY = { menuItemId: '', menuLabel: '', sectionCode: '', parentMenuItemId: '', parentLabel: '', slotKey: '', sortOrder: 0, scope: 'project', isActive: true, defaultSection: '' }

function ItemPicker({ id, label, value, onPick, disabled, placeholder }) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  useEffect(() => {
    let cancelled = false
    if (disabled || query.trim().length < 2) { setOptions([]); return undefined }
    const t = setTimeout(async () => {
      const { data } = await searchMenuItemsForPlacement(query.trim())
      if (!cancelled) setOptions(data)
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, disabled])
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {value && <p className="mb-1 text-sm text-gray-900 dark:text-gray-100">{value}</p>}
      {!disabled && (
        <>
          <input id={id} type="search" className={inputClass} placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
          {options.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              {options.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => { onPick(o); setQuery(''); setOptions([]) }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                    <span className="text-gray-900 dark:text-gray-100">{o.parent_label ? `${o.parent_label} › ` : ''}{o.menu_label}</span>
                    <span className="ml-2 font-mono text-xs text-gray-500 dark:text-gray-400">{o.menu_code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export default function MenuPlacementFormPage() {
  const [params] = useSearchParams()
  const placementKey = params.get('key') || 'pm'
  const placementId = params.get('id')
  const isEdit = Boolean(placementId)
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [tab, setTab] = useState('details')
  const [form, setForm] = useState(EMPTY)
  const [baseline, setBaseline] = useState(JSON.stringify(EMPTY))
  const [record, setRecord] = useState(null)
  const [sections, setSections] = useState([])
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [s, sl, p] = await Promise.all([
        fetchMenuSections('platform'),
        fetchMenuSlots('platform'),
        isEdit ? fetchMenuPlacements(placementKey) : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      setSections(s.data)
      setSlots(sl.data)
      if (isEdit) {
        const row = (p.data || []).find((r) => r.id === placementId)
        if (row) {
          const next = {
            menuItemId: row.menu_item_id, menuLabel: `${row.menu_label} (${row.menu_code})`, sectionCode: row.section_code,
            parentMenuItemId: row.parent_menu_item_id || '', parentLabel: row.parent_label || '', slotKey: row.slot_key || '',
            sortOrder: row.sort_order ?? 0, scope: row.scope || 'project', isActive: row.is_active !== false,
            defaultSection: row.default_section_code || '',
          }
          setRecord(row)
          setForm(next)
          setBaseline(JSON.stringify(next))
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [isEdit, placementId, placementKey])

  const isDirty = !saved && JSON.stringify(form) !== baseline
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved placement changes.')
  const listPath = `/system/menu-placements?key=${encodeURIComponent(placementKey)}`
  const goBack = () => requestNavigation(listPath)
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const slotOptions = useMemo(() => slots.filter((s) => !form.sectionCode || s.section_code === form.sectionCode), [slots, form.sectionCode])

  const save = () => {
    if (!form.menuItemId) { showError('Choose a menu item'); return }
    if (!form.sectionCode) { showError('Choose a section'); return }
    confirm({
      title: `${isEdit ? 'Save' : 'Add'} this placement for ${PLACEMENT_KEY_LABELS[placementKey]}?`,
      message: 'Sidebars refresh their placements at the next page load.',
      confirmLabel: isEdit ? 'Save placement' : 'Add placement',
      requireReason: true,
      onConfirm: async (reason) => {
        const { error } = await upsertMenuPlacement({ ...form, placementKey }, reason)
        if (error) { showError(error); return }
        if (form.defaultSection !== (record?.default_section_code || '')) {
          const { error: e2 } = await setMenuItemDefaultSection(form.menuItemId, form.defaultSection, reason)
          if (e2) { showError(e2); return }
        }
        setSaved(true)
        showSuccess(`Placement ${isEdit ? 'updated' : 'added'}: ${form.menuLabel || 'menu item'} → ${sections.find((s) => s.section_code === form.sectionCode)?.label || form.sectionCode}.`)
        requestNavigation(listPath)
      },
    })
  }

  if (loading) return <LoadingState message="Loading placement..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button type="button" onClick={goBack} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">← Back to menu placements</button>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{isEdit ? 'Edit placement' : 'Add placement'}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Sidebar of: {PLACEMENT_KEY_LABELS[placementKey] || placementKey}</p>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' ? (
        !record ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this placement is saved.</p>
        ) : (
          <AuditDetailsPanel description="When this placement was created and last changed.">
            <AuditCard title="Identity" description="The menu item and role.">
              <AuditField label="Menu item" value={record.menu_label} />
              <AuditField label="Code" value={record.menu_code} />
              <AuditField label="Role sidebar" value={PLACEMENT_KEY_LABELS[placementKey]} />
            </AuditCard>
            <AuditCard title="Classification" description="Where it appears.">
              <AuditField label="Section" value={sections.find((s) => s.section_code === record.section_code)?.label || record.section_code} />
              <AuditField label="Slot" value={record.slot_key || '—'} />
              <AuditField label="Scope" value={record.scope} />
            </AuditCard>
            <AuditCard title="Record history" description="Changes are also in the admin audit log.">
              <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
              <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )
      ) : (
        <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 md:p-6">
          <ItemPicker id="placement-item" label="Menu item" value={form.menuLabel} disabled={isEdit} placeholder="Type at least 2 letters…"
            onPick={(o) => setForm((f) => ({ ...f, menuItemId: o.id, menuLabel: `${o.menu_label} (${o.menu_code})`, defaultSection: o.default_section_code || '' }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="placement-section" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Section</label>
              <select id="placement-section" className={inputClass} value={form.sectionCode} onChange={(e) => set('sectionCode', e.target.value)}>
                <option value="">Choose a section…</option>
                {sections.map((s) => <option key={s.section_code} value={s.section_code}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="placement-slot" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shared slot (optional)</label>
              <select id="placement-slot" className={inputClass} value={form.slotKey} onChange={(e) => set('slotKey', e.target.value)}>
                <option value="">None</option>
                {slotOptions.map((s) => <option key={s.slot_key} value={s.slot_key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="placement-order" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Order in the section</label>
              <input id="placement-order" type="number" className={inputClass} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
            </div>
            <div>
              <label htmlFor="placement-scope" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scope</label>
              <select id="placement-scope" className={inputClass} value={form.scope} onChange={(e) => set('scope', e.target.value)}>
                <option value="project">Project pages (shown inside a project)</option>
                <option value="organisation">Organisation pages (PMO Organisation zone)</option>
              </select>
            </div>
          </div>
          <ItemPicker id="placement-parent" label="Sub-menu of (optional)" value={form.parentLabel} placeholder="Search a parent menu item…"
            onPick={(o) => setForm((f) => ({ ...f, parentMenuItemId: o.id, parentLabel: o.menu_label }))} />
          {form.parentMenuItemId && (
            <button type="button" className="text-xs text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setForm((f) => ({ ...f, parentMenuItemId: '', parentLabel: '' }))}>
              Remove sub-menu parent
            </button>
          )}
          <div>
            <label htmlFor="placement-default" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default section of this item (all roles)</label>
            <select id="placement-default" className={inputClass} value={form.defaultSection} onChange={(e) => set('defaultSection', e.target.value)}>
              <option value="">None</option>
              {sections.map((s) => <option key={s.section_code} value={s.section_code}>{s.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used when a full-menu role has no placement for this item or its pages.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Active
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={save} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">{isEdit ? 'Save placement' : 'Add placement'}</button>
            <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          </div>
        </div>
      )}
      {modal}
    </div>
  )
}
