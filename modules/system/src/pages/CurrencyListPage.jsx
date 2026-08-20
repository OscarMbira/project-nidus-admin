import { useEffect, useMemo, useState } from 'react'
import {
  createCurrency,
  deleteCurrency,
  fetchCurrencies,
  updateCurrency,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
  EmptyState,
  inputClass,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const EMPTY_FORM = {
  currency_code: '',
  currency_name: '',
  symbol: '',
  symbol_position: 'prefix',
  decimal_places: '2',
  is_active: true,
  is_base: false,
  sort_order: '0',
}

export default function CurrencyListPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingCurrency, setEditingCurrency] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editTab, setEditTab] = useState('details')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchCurrencies()
    if (error) {
      showError(error.message || String(error))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.currency_code, row.currency_name, row.symbol]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const openEdit = (currency) => {
    setEditingCurrency(currency)
    setEditTab('details')
    setEditForm({
      currency_code: currency.currency_code || '',
      currency_name: currency.currency_name || '',
      symbol: currency.symbol || '',
      symbol_position: currency.symbol_position || 'prefix',
      decimal_places: String(currency.decimal_places ?? 2),
      is_active: currency.is_active !== false,
      is_base: Boolean(currency.is_base),
      sort_order: String(currency.sort_order ?? 0),
    })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.currency_code.trim() || !createForm.currency_name.trim() || !createForm.symbol.trim()) {
      showError('Currency code, name, and symbol are required.')
      return
    }
    setSaving(true)
    const { error } = await createCurrency({
      currency_code: createForm.currency_code.trim().toUpperCase(),
      currency_name: createForm.currency_name.trim(),
      symbol: createForm.symbol.trim(),
      symbol_position: createForm.symbol_position,
      decimal_places: Number.parseInt(createForm.decimal_places, 10) || 2,
      is_active: createForm.is_active,
      is_base: createForm.is_base,
      sort_order: Number.parseInt(createForm.sort_order, 10) || 0,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Currency created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingCurrency) return
    setSaving(true)
    const { error } = await updateCurrency(editingCurrency.id, {
      currency_name: editForm.currency_name.trim(),
      symbol: editForm.symbol.trim(),
      symbol_position: editForm.symbol_position,
      decimal_places: Number.parseInt(editForm.decimal_places, 10) || 2,
      is_active: editForm.is_active,
      is_base: editForm.is_base,
      sort_order: Number.parseInt(editForm.sort_order, 10) || 0,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Currency updated.')
    setEditingCurrency(null)
    await loadData()
  }

  const handleSetBase = (currency) => {
    confirm({
      title: `Set ${currency.currency_code} as base currency?`,
      message: 'This will replace the current base currency used for reporting conversions.',
      confirmLabel: 'Set as Base',
      onConfirm: async () => {
        setBusyId(currency.id)
        const { error } = await updateCurrency(currency.id, { is_base: true, is_active: true })
        setBusyId('')
        if (error) {
          showError(error)
          return
        }
        showSuccess(`${currency.currency_code} is now the base currency.`)
        await loadData()
      },
    })
  }

  const handleDelete = (currency) => {
    confirm({
      title: `Delete ${currency.currency_code}?`,
      message: 'If this currency is referenced by subscriptions or payments it will be deactivated instead of deleted.',
      confirmLabel: 'Delete',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        setBusyId(currency.id)
        const { error } = await deleteCurrency(currency.id, reason)
        setBusyId('')
        if (error) {
          showError(error)
          return
        }
        showSuccess('Currency removed or deactivated.')
        await loadData()
      },
    })
  }

  const renderFormFields = (form, setForm, isEdit = false) => (
    <>
      <AdminField label="Currency Code" required>
        <input
          className={inputClass}
          value={form.currency_code}
          readOnly={isEdit}
          maxLength={3}
          onChange={(e) => setForm((prev) => ({ ...prev, currency_code: e.target.value.toUpperCase() }))}
          placeholder="USD"
        />
      </AdminField>
      <AdminField label="Currency Name" required>
        <input className={inputClass} value={form.currency_name} onChange={(e) => setForm((prev) => ({ ...prev, currency_name: e.target.value }))} />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Symbol" required>
          <input className={inputClass} value={form.symbol} onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value }))} />
        </AdminField>
        <AdminField label="Symbol Position">
          <select className={inputClass} value={form.symbol_position} onChange={(e) => setForm((prev) => ({ ...prev, symbol_position: e.target.value }))}>
            <option value="prefix">Prefix</option>
            <option value="suffix">Suffix</option>
          </select>
        </AdminField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Decimal Places">
          <input type="number" min={0} max={6} className={inputClass} value={form.decimal_places} onChange={(e) => setForm((prev) => ({ ...prev, decimal_places: e.target.value }))} />
        </AdminField>
        <AdminField label="Sort Order">
          <input type="number" className={inputClass} value={form.sort_order} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))} />
        </AdminField>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
        Active
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.is_base} onChange={(e) => setForm((prev) => ({ ...prev, is_base: e.target.checked }))} />
        Set as base currency
      </label>
      {form.is_base && (
        <p className="text-xs text-amber-300">This changes the system base currency used for revenue reporting.</p>
      )}
    </>
  )

  if (loading) return <LoadingState message="Loading currencies..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Currencies</h1>
          <p className="text-sm text-gray-500">Manage ISO 4217 currencies and the reporting base currency.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search code, name, symbol..." />
          <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New Currency
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No currencies found" description="Create a currency or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Decimals</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((currency) => (
                <tr key={currency.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-medium">{currency.currency_code}</td>
                  <td className="px-4 py-3">{currency.currency_name}</td>
                  <td className="px-4 py-3">{currency.symbol} ({currency.symbol_position})</td>
                  <td className="px-4 py-3">{currency.decimal_places}</td>
                  <td className="px-4 py-3">
                    <AdminBadge label={currency.is_active ? 'active' : 'inactive'} variant={currency.is_active ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-4 py-3">{currency.is_base ? '★ Base' : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(currency)} />
                      {!currency.is_base && (
                        <button type="button" disabled={busyId === currency.id} onClick={() => handleSetBase(currency)} className="rounded border border-violet-700 bg-violet-900/30 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-900/50 disabled:opacity-60">Set Base</button>
                      )}
                      <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(currency)} disabled={busyId === currency.id || currency.is_base} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Currency" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          {renderFormFields(createForm, setCreateForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingCurrency)} title={`Edit ${editingCurrency?.currency_code || 'Currency'}`} onClose={() => setEditingCurrency(null)}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editingCurrency && (
          <AuditDetailsPanel description="Who created or changed this currency, and how it is classified.">
            <AuditCard title="Identity" description="How this currency is labelled.">
              <AuditField label="Currency code" value={editingCurrency.currency_code} />
              <AuditField label="Currency name" value={editingCurrency.currency_name} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this currency sits.">
              <AuditField label="Base currency" value={editingCurrency.is_base ? 'Yes' : 'No'} />
              <AuditField label="Active" value={editingCurrency.is_active ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this currency was created and last changed.">
              <AuditField label="Created by" value={editingCurrency.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editingCurrency.created_at} />
              <AuditField label="Updated by" value={editingCurrency.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={editingCurrency.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm, true)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingCurrency(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {modal}
    </div>
  )
}
