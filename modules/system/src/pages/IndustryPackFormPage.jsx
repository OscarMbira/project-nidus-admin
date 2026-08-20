import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createIndustryPack,
  fetchAllMenuItemsForPicker,
  fetchIndustryCategories,
  fetchIndustryPackById,
  fetchIndustryPackMenuItems,
  setIndustryPackMenuItems,
  updateIndustryPack,
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
  SearchBar,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const EMPTY_FORM = { industry_category_id: '', pack_code: '', pack_name: '', description: '', is_active: true }

function packToForm(pack) {
  return {
    industry_category_id: pack.industry_category_id || '',
    pack_code: pack.pack_code || '',
    pack_name: pack.pack_name || '',
    description: pack.description || '',
    is_active: pack.is_active !== false,
  }
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export default function IndustryPackFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const packId = searchParams.get('id')
  const isEdit = Boolean(packId)
  const isViewOnly = searchParams.get('view') === '1' && Boolean(packId)
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingItems, setSavingItems] = useState(false)
  const [pack, setPack] = useState(null)
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [baselineForm, setBaselineForm] = useState(EMPTY_FORM)
  const [loadError, setLoadError] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  const [allMenuItems, setAllMenuItems] = useState([])
  const [selectedItemIds, setSelectedItemIds] = useState(new Set())
  const [baselineItemIds, setBaselineItemIds] = useState(new Set())
  const [itemSearch, setItemSearch] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setLoadError(null)

      const [categoriesRes, packRes, menuItemsRes, packItemsRes] = await Promise.all([
        fetchIndustryCategories(),
        isEdit ? fetchIndustryPackById(packId) : Promise.resolve({ data: null, error: null }),
        fetchAllMenuItemsForPicker(),
        isEdit ? fetchIndustryPackMenuItems(packId) : Promise.resolve({ data: [], error: null }),
      ])
      if (!active) return

      if (categoriesRes.error) showError(categoriesRes.error.message || String(categoriesRes.error))
      else setCategories(categoriesRes.data || [])

      if (menuItemsRes.error) showError(menuItemsRes.error.message || String(menuItemsRes.error))
      else setAllMenuItems(menuItemsRes.data || [])

      if (isEdit) {
        if (packRes.error || !packRes.data) {
          setLoadError(packRes.error?.message || String(packRes.error) || 'Industry pack not found.')
          setLoading(false)
          return
        }
        const nextForm = packToForm(packRes.data)
        setPack(packRes.data)
        setForm(nextForm)
        setBaselineForm(nextForm)

        const ids = new Set((packItemsRes.data || []).map((r) => r.menu_item_id))
        setSelectedItemIds(ids)
        setBaselineItemIds(new Set(ids))
      }

      setLoading(false)
    }
    load()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, packId])

  const isFieldsDirty = useMemo(() => !isViewOnly && !formsEqual(form, baselineForm), [form, baselineForm, isViewOnly])
  const isItemsDirty = useMemo(() => {
    if (isViewOnly) return false
    if (selectedItemIds.size !== baselineItemIds.size) return true
    for (const id of selectedItemIds) if (!baselineItemIds.has(id)) return true
    return false
  }, [selectedItemIds, baselineItemIds, isViewOnly])

  const { requestNavigation } = useUnsavedChangesGuard(
    isFieldsDirty || isItemsDirty,
    'You have unsaved industry pack changes.',
  )
  const goBack = () => requestNavigation('/system/industry-packs')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.pack_name.trim() || (!isEdit && (!form.industry_category_id || !form.pack_code.trim()))) {
      showError('Industry, pack code, and pack name are required.')
      return
    }
    setSaving(true)
    const { error, data } = isEdit ? await updateIndustryPack(packId, form) : await createIndustryPack(form)
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(isEdit ? 'Industry pack updated.' : 'Industry pack created.')
    if (isEdit) {
      setBaselineForm(form)
    } else {
      navigate(`/system/industry-pack-form?id=${data}`, { replace: true })
    }
  }

  const toggleItem = (itemId) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const handleSaveItems = async () => {
    setSavingItems(true)
    const { error } = await setIndustryPackMenuItems(packId, Array.from(selectedItemIds))
    setSavingItems(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    setBaselineItemIds(new Set(selectedItemIds))
    showSuccess('Pack menu items updated.')
  }

  const filteredMenuItems = useMemo(() => {
    const term = itemSearch.trim().toLowerCase()
    const sorted = [...allMenuItems].sort((a, b) => (a.menu_label || '').localeCompare(b.menu_label || ''))
    if (!term) return sorted
    return sorted.filter((item) => [item.menu_label, item.route_path].some((v) => String(v ?? '').toLowerCase().includes(term)))
  }, [allMenuItems, itemSearch])

  if (loading) return <LoadingState message={isEdit ? 'Loading industry pack...' : 'Loading form...'} />

  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load industry pack" description={loadError} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to industry packs
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← Back to industry packs
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {isViewOnly ? 'View Industry Pack' : isEdit ? 'Edit Industry Pack' : 'Create Industry Pack'}
          </h1>
          {isEdit && pack && <p className="text-xs text-gray-500 dark:text-gray-500">{pack.pack_code}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isEdit && pack && (
            <AdminBadge label={pack.is_active ? 'active' : 'inactive'} variant={pack.is_active ? 'active' : 'inactive'} />
          )}
          {isViewOnly ? (
            <PermissionGate permission="system.industries.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/industry-pack-form?id=${packId}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                form="industry-pack-form"
                disabled={saving || (isEdit && !isFieldsDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create pack')}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && !pack && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this pack is saved.</p>
      )}
      {detailTab === 'audit' && pack && (
        <AuditDetailsPanel description="How this industry pack is classified.">
          <AuditCard title="Identity" description="How this pack is labelled.">
            <AuditField label="Pack code" value={pack.pack_code} />
            <AuditField label="Pack name" value={pack.pack_name} />
          </AuditCard>
          <AuditCard title="Classification" description="Where this pack applies.">
            <AuditField label="Industry" value={pack.industry_categories?.name} />
            <AuditField label="Menu items" value={selectedItemIds.size} />
            <AuditField label="Active" value={pack.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this pack was created and last changed.">
            <AuditField label="Created by" value={pack.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={pack.created_at} />
            <AuditField label="Updated by" value={pack.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={pack.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {detailTab === 'details' && (
        <div className="flex flex-col gap-4">
          <AdminForm id="industry-pack-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit} className="space-y-0">
            <fieldset disabled={isViewOnly} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4 flex flex-col gap-3 disabled:opacity-95">
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                <AdminField label="Industry" required>
                  <select
                    className={`${inputClass} ${isEdit ? 'opacity-70' : ''}`}
                    value={form.industry_category_id}
                    disabled={isEdit}
                    onChange={(e) => setForm((prev) => ({ ...prev, industry_category_id: e.target.value }))}
                  >
                    <option value="">Select an industry</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="Pack code" required>
                  <input
                    className={`${inputClass} ${isEdit ? 'opacity-70' : ''}`}
                    value={form.pack_code}
                    readOnly={isEdit}
                    onChange={(e) => setForm((prev) => ({ ...prev, pack_code: e.target.value }))}
                    placeholder="healthcare"
                  />
                </AdminField>
                <AdminField label="Pack name" required>
                  <input
                    className={inputClass}
                    value={form.pack_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, pack_name: e.target.value }))}
                    placeholder="Healthcare"
                  />
                </AdminField>
              </div>
              <AdminField label="Description">
                <textarea
                  className={inputClass}
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </AdminField>
              <AdminField label="Active">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  Available to organisations in this industry
                </label>
              </AdminField>
            </fieldset>
          </AdminForm>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Menu items in this pack</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedItemIds.size} of {allMenuItems.length} selected. Menu items never classified into any pack stay
                available to every organisation regardless of this list (fail-open).
              </p>
            </div>

            {!isEdit ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Save the pack first, then choose its menu items.</p>
            ) : (
              <>
                <SearchBar value={itemSearch} onChange={setItemSearch} placeholder="Search menu items..." />
                <div className="max-h-96 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredMenuItems.map((item) => (
                    <label key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        disabled={isViewOnly}
                        onChange={() => toggleItem(item.id)}
                      />
                      <span>{item.menu_label}</span>
                      {item.route_path && <span className="text-xs text-gray-400 dark:text-gray-500">{item.route_path}</span>}
                    </label>
                  ))}
                </div>
                {!isViewOnly && (
                  <div>
                    <button
                      type="button"
                      onClick={handleSaveItems}
                      disabled={savingItems || !isItemsDirty}
                      className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingItems ? 'Saving...' : 'Save menu items'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
