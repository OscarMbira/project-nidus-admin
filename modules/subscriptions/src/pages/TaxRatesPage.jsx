import { useEffect, useMemo, useState } from 'react'
import {
  createTaxRate,
  deleteTaxRate,
  fetchCountries,
  fetchTaxRates,
  updateTaxRate,
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
  SelectField,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const APPLIES_TO = ['all', 'platform', 'simulator']

const EMPTY_FORM = {
  country_code: '',
  tax_name: '',
  rate: '',
  is_inclusive: false,
  applies_to: 'all',
  effective_from: '',
  effective_to: '',
  is_active: true,
}

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

export default function TaxRatesPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [countries, setCountries] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingRate, setEditingRate] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editTab, setEditTab] = useState('details')

  const countryMap = useMemo(() => {
    const map = new Map()
    countries.forEach((country) => map.set(country.country_code, country))
    return map
  }, [countries])

  const loadData = async () => {
    setLoading(true)
    const [ratesRes, countriesRes] = await Promise.all([
      fetchTaxRates(),
      fetchCountries({ activeOnly: true }),
    ])
    if (ratesRes.error) {
      showError(toErrorMessage(ratesRes.error, 'Failed to load tax rates.'))
      setLoading(false)
      return
    }
    if (countriesRes.error) {
      showError(toErrorMessage(countriesRes.error, 'Failed to load countries.'))
      setLoading(false)
      return
    }
    setRows(ratesRes.data || [])
    setCountries(countriesRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      const country = countryMap.get(row.country_code)
      return [row.country_code, country?.country_name, row.tax_name, row.applies_to]
        .some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [rows, search, countryMap])

  const openEdit = (rate) => {
    setEditingRate(rate)
    setEditTab('details')
    setEditForm({
      country_code: rate.country_code || '',
      tax_name: rate.tax_name || '',
      rate: String(rate.rate ?? ''),
      is_inclusive: Boolean(rate.is_inclusive),
      applies_to: rate.applies_to || 'all',
      effective_from: rate.effective_from ? rate.effective_from.slice(0, 10) : '',
      effective_to: rate.effective_to ? rate.effective_to.slice(0, 10) : '',
      is_active: rate.is_active !== false,
    })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.country_code || !createForm.tax_name.trim() || !createForm.rate.trim() || !createForm.effective_from) {
      showError('Country, tax name, rate, and effective from date are required.')
      return
    }
    const rate = Number.parseFloat(createForm.rate)
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      showError('Rate must be between 0 and 100.')
      return
    }
    setSaving(true)
    const { error } = await createTaxRate({
      country_code: createForm.country_code,
      tax_name: createForm.tax_name.trim(),
      rate,
      is_inclusive: createForm.is_inclusive,
      applies_to: createForm.applies_to,
      effective_from: createForm.effective_from,
      effective_to: createForm.effective_to || null,
      is_active: createForm.is_active,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to create tax rate.'))
      return
    }
    showSuccess('Tax rate created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingRate) return
    const rate = Number.parseFloat(editForm.rate)
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      showError('Rate must be between 0 and 100.')
      return
    }
    setSaving(true)
    const { error } = await updateTaxRate(editingRate.id, {
      tax_name: editForm.tax_name.trim(),
      rate,
      is_inclusive: editForm.is_inclusive,
      applies_to: editForm.applies_to,
      effective_from: editForm.effective_from,
      effective_to: editForm.effective_to || null,
      is_active: editForm.is_active,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to update tax rate.'))
      return
    }
    showSuccess('Tax rate updated.')
    setEditingRate(null)
    await loadData()
  }

  const handleDelete = (rate) => {
    confirm({
      title: `Delete ${rate.tax_name}?`,
      message: 'This tax rate will be removed from the system.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(rate.id)
        const { error } = await deleteTaxRate(rate.id)
        setBusyId('')
        if (error) {
          showError(toErrorMessage(error, 'Failed to delete tax rate.'))
          return
        }
        showSuccess('Tax rate deleted.')
        await loadData()
      },
    })
  }

  const renderFormFields = (form, setForm, isEdit = false) => (
    <>
      <AdminField label="Country" required>
        <SelectField
          value={form.country_code}
          disabled={isEdit}
          onChange={(v) => setForm((prev) => ({ ...prev, country_code: v }))}
          placeholder="Select country..."
          searchPlaceholder="Search country..."
          forceSearchable
          options={countries.map((country) => ({
            value: country.country_code,
            label: `${country.country_code} — ${country.country_name}`,
          }))}
        />
      </AdminField>
      <AdminField label="Tax Name" required>
        <input className={inputClass} value={form.tax_name} onChange={(e) => setForm((prev) => ({ ...prev, tax_name: e.target.value }))} placeholder="VAT, GST, Sales Tax" />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Rate (%)" required>
          <input type="number" min={0} max={100} step="0.01" className={inputClass} value={form.rate} onChange={(e) => setForm((prev) => ({ ...prev, rate: e.target.value }))} />
        </AdminField>
        <AdminField label="Applies To">
          <select className={inputClass} value={form.applies_to} onChange={(e) => setForm((prev) => ({ ...prev, applies_to: e.target.value }))}>
            {APPLIES_TO.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </AdminField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Effective From" required>
          <input type="date" className={inputClass} value={form.effective_from} onChange={(e) => setForm((prev) => ({ ...prev, effective_from: e.target.value }))} />
        </AdminField>
        <AdminField label="Effective To">
          <input type="date" className={inputClass} value={form.effective_to} onChange={(e) => setForm((prev) => ({ ...prev, effective_to: e.target.value }))} />
        </AdminField>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.is_inclusive} onChange={(e) => setForm((prev) => ({ ...prev, is_inclusive: e.target.checked }))} />
        Tax inclusive (included in price)
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
        Active
      </label>
    </>
  )

  if (loading) return <LoadingState message="Loading tax rates..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Tax Rates</h1>
          <p className="text-sm text-gray-500">Manage country-specific tax rates with effective dating.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search country, tax name..." />
          <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New Tax Rate
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No tax rates found" description="Create a tax rate or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Tax Name</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Inclusive</th>
                <th className="px-4 py-3">Applies To</th>
                <th className="px-4 py-3">Effective</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((rate) => {
                const country = countryMap.get(rate.country_code)
                return (
                  <tr key={rate.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">
                      <div className="font-medium">{rate.country_code}</div>
                      <div className="text-xs text-gray-500">{country?.country_name || '—'}</div>
                    </td>
                    <td className="px-4 py-3">{rate.tax_name}</td>
                    <td className="px-4 py-3">{rate.rate}%</td>
                    <td className="px-4 py-3">{rate.is_inclusive ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3">{rate.applies_to}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {rate.effective_from?.slice(0, 10) || '—'}
                      {rate.effective_to ? ` → ${rate.effective_to.slice(0, 10)}` : ' → ongoing'}
                    </td>
                    <td className="px-4 py-3">
                      <AdminBadge label={rate.is_active ? 'active' : 'inactive'} variant={rate.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(rate)} />
                        <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(rate)} disabled={busyId === rate.id} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Tax Rate" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          {renderFormFields(createForm, setCreateForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingRate)} title={`Edit ${editingRate?.tax_name || 'Tax Rate'}`} onClose={() => setEditingRate(null)}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editingRate && (
          <AuditDetailsPanel description="Who created or changed this tax rate, and how it is classified.">
            <AuditCard title="Identity" description="How this rate is labelled.">
              <AuditField label="Country" value={editingRate.country_code} />
              <AuditField label="Tax name" value={editingRate.tax_name} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this rate sits.">
              <AuditField label="Applies to" value={editingRate.applies_to} />
              <AuditField label="Active" value={editingRate.is_active ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this rate was created and last changed.">
              <AuditField label="Created by" value={editingRate.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editingRate.created_at} />
              <AuditField label="Updated by" value={editingRate.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={editingRate.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm, true)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingRate(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {modal}
    </div>
  )
}
