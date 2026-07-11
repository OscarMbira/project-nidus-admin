import { useEffect, useMemo, useState } from 'react'
import {
  countryCodeToFlag,
  createCountry,
  currenciesRowsToOptions,
  deleteCountry,
  fetchActiveCurrencies,
  fetchCountries,
  toggleCountrySystem,
  updateCountry,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminModal,
  EmptyState,
  LoadingState,
  SearchBar,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania']
const STATUS_FILTERS = ['all', 'active', 'inactive', 'platform_blocked', 'simulator_blocked']

const EMPTY_FORM = {
  country_code: '',
  country_name: '',
  iso3_code: '',
  phone_code: '',
  default_currency: '',
  region: 'Africa',
  is_active: true,
  platform_allowed: true,
  simulator_allowed: true,
  platform_reason: '',
  simulator_reason: '',
  sort_order: '0',
}

export default function CountryListPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [currencyOptions, setCurrencyOptions] = useState([])
  const [search, setSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingCountry, setEditingCountry] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [countriesRes, currenciesRes] = await Promise.all([
      fetchCountries(),
      fetchActiveCurrencies(),
    ])
    if (countriesRes.error) showError(countriesRes.error.message || String(countriesRes.error))
    else setRows(countriesRes.data || [])
    if (!currenciesRes.error) {
      setCurrencyOptions(currenciesRowsToOptions(currenciesRes.data || []))
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows
      .filter((row) => {
        if (regionFilter !== 'all' && row.region !== regionFilter) return false
        if (statusFilter === 'active' && !row.is_active) return false
        if (statusFilter === 'inactive' && row.is_active) return false
        if (statusFilter === 'platform_blocked' && row.platform_allowed !== false) return false
        if (statusFilter === 'simulator_blocked' && row.simulator_allowed !== false) return false
        if (!term) return true
        return [row.country_code, row.country_name, row.iso3_code, row.default_currency]
          .some((value) => String(value ?? '').toLowerCase().includes(term))
      })
      .sort((a, b) => String(a.country_name || '').localeCompare(String(b.country_name || ''), undefined, { sensitivity: 'base' }))
  }, [rows, search, regionFilter, statusFilter])

  const hasActiveFilters = Boolean(search.trim()) || regionFilter !== 'all' || statusFilter !== 'all'
  const countLabel = filteredRows.length === 1 ? 'country' : 'countries'
  const countText = hasActiveFilters && filteredRows.length !== rows.length
    ? `${filteredRows.length} of ${rows.length} ${countLabel}`
    : `${filteredRows.length} ${countLabel}`

  const openEdit = (country) => {
    setEditingCountry(country)
    setEditForm({
      country_code: country.country_code || '',
      country_name: country.country_name || '',
      iso3_code: country.iso3_code || '',
      phone_code: country.phone_code || '',
      default_currency: country.default_currency || '',
      region: country.region || 'Africa',
      is_active: country.is_active !== false,
      platform_allowed: country.platform_allowed !== false,
      simulator_allowed: country.simulator_allowed !== false,
      platform_reason: country.platform_reason || '',
      simulator_reason: country.simulator_reason || '',
      sort_order: String(country.sort_order ?? 0),
    })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.country_code.trim() || !createForm.country_name.trim()) {
      showError('Country code and name are required.')
      return
    }
    setSaving(true)
    const { error } = await createCountry({
      country_code: createForm.country_code.trim().toUpperCase(),
      country_name: createForm.country_name.trim(),
      iso3_code: createForm.iso3_code.trim().toUpperCase() || null,
      phone_code: createForm.phone_code.trim() || null,
      default_currency: createForm.default_currency || null,
      region: createForm.region,
      is_active: createForm.is_active,
      platform_allowed: createForm.platform_allowed,
      simulator_allowed: createForm.simulator_allowed,
      platform_reason: createForm.platform_allowed ? null : createForm.platform_reason,
      simulator_reason: createForm.simulator_allowed ? null : createForm.simulator_reason,
      sort_order: Number.parseInt(createForm.sort_order, 10) || 0,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Country created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingCountry) return
    setSaving(true)
    const { error } = await updateCountry(editingCountry.id, {
      country_name: editForm.country_name.trim(),
      iso3_code: editForm.iso3_code.trim().toUpperCase() || null,
      phone_code: editForm.phone_code.trim() || null,
      default_currency: editForm.default_currency || null,
      region: editForm.region,
      is_active: editForm.is_active,
      platform_allowed: editForm.platform_allowed,
      simulator_allowed: editForm.simulator_allowed,
      platform_reason: editForm.platform_allowed ? null : editForm.platform_reason,
      simulator_reason: editForm.simulator_allowed ? null : editForm.simulator_reason,
      sort_order: Number.parseInt(editForm.sort_order, 10) || 0,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Country updated.')
    setEditingCountry(null)
    await loadData()
  }

  const handleToggleSystem = (country, system, nextAllowed) => {
    if (nextAllowed) {
      setBusyId(country.id)
      toggleCountrySystem(country.id, system, true, null).then(async ({ error }) => {
        setBusyId('')
        if (error) showError(error)
        else {
          showSuccess(`${country.country_code} allowed on ${system}.`)
          await loadData()
        }
      })
      return
    }

    confirm({
      title: `Block ${country.country_code} on ${system}?`,
      message: 'Provide a reason for restricting this country.',
      confirmLabel: 'Block',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        setBusyId(country.id)
        const { error } = await toggleCountrySystem(country.id, system, false, reason)
        setBusyId('')
        if (error) showError(error)
        else {
          showSuccess(`${country.country_code} blocked on ${system}.`)
          await loadData()
        }
      },
    })
  }

  const handleDelete = (country) => {
    confirm({
      title: `Delete ${country.country_name}?`,
      message: 'This removes the country from admin management.',
      confirmLabel: 'Delete',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        setBusyId(country.id)
        const { error } = await deleteCountry(country.id, reason)
        setBusyId('')
        if (error) showError(error)
        else {
          showSuccess('Country deleted.')
          await loadData()
        }
      },
    })
  }

  const renderFormFields = (form, setForm, isEdit = false) => (
    <>
      <AdminField label="Country Code" required>
        <input className={inputClass} value={form.country_code} readOnly={isEdit} maxLength={2} onChange={(e) => setForm((p) => ({ ...p, country_code: e.target.value.toUpperCase() }))} />
      </AdminField>
      <AdminField label="Country Name" required>
        <input className={inputClass} value={form.country_name} onChange={(e) => setForm((p) => ({ ...p, country_name: e.target.value }))} />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="ISO3 Code">
          <input className={inputClass} value={form.iso3_code} maxLength={3} onChange={(e) => setForm((p) => ({ ...p, iso3_code: e.target.value.toUpperCase() }))} />
        </AdminField>
        <AdminField label="Phone Code">
          <input className={inputClass} value={form.phone_code} onChange={(e) => setForm((p) => ({ ...p, phone_code: e.target.value }))} placeholder="+27" />
        </AdminField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Default Currency">
          <select className={inputClass} value={form.default_currency} onChange={(e) => setForm((p) => ({ ...p, default_currency: e.target.value }))}>
            <option value="">None</option>
            {currencyOptions.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
          </select>
        </AdminField>
        <AdminField label="Region">
          <select className={inputClass} value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}>
            {REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </AdminField>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
        Active (master toggle)
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.platform_allowed} onChange={(e) => setForm((p) => ({ ...p, platform_allowed: e.target.checked }))} />
        Platform allowed
      </label>
      {!form.platform_allowed && (
        <AdminField label="Platform restriction reason">
          <input className={inputClass} value={form.platform_reason} onChange={(e) => setForm((p) => ({ ...p, platform_reason: e.target.value }))} />
        </AdminField>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.simulator_allowed} onChange={(e) => setForm((p) => ({ ...p, simulator_allowed: e.target.checked }))} />
        Simulator allowed
      </label>
      {!form.simulator_allowed && (
        <AdminField label="Simulator restriction reason">
          <input className={inputClass} value={form.simulator_reason} onChange={(e) => setForm((p) => ({ ...p, simulator_reason: e.target.value }))} />
        </AdminField>
      )}
    </>
  )

  const SystemToggle = ({ allowed }) => (
    allowed
      ? <span className="text-emerald-400">✓</span>
      : <span className="text-red-400">✗</span>
  )

  if (loading) return <LoadingState message="Loading countries..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Countries</h1>
          <p className="text-sm text-gray-500">Manage country availability per system (Platform and Simulator).</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search country name or code..." />
          <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">New Country</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
            <option value="all">All regions</option>
            {REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-gray-400">{countText}</p>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No countries found" description="Adjust filters or create a country." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="w-12 px-3 py-3 text-center">#</th>
                <th className="px-4 py-3">Flag</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Simulator</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((country, index) => (
                <tr key={country.id} className="border-t border-gray-800">
                  <td className="px-3 py-3 text-center text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3 text-lg">{countryCodeToFlag(country.country_code)}</td>
                  <td className="px-4 py-3 font-medium">{country.country_code}</td>
                  <td className="px-4 py-3">{country.country_name}</td>
                  <td className="px-4 py-3">{country.region || '—'}</td>
                  <td className="px-4 py-3">{country.phone_code || '—'}</td>
                  <td className="px-4 py-3">{country.default_currency || '—'}</td>
                  <td className="px-4 py-3"><SystemToggle allowed={country.is_active && country.platform_allowed} /></td>
                  <td className="px-4 py-3"><SystemToggle allowed={country.is_active && country.simulator_allowed} /></td>
                  <td className="px-4 py-3">
                    <AdminBadge label={country.is_active ? 'active' : 'inactive'} variant={country.is_active ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" disabled={busyId === country.id} onClick={() => handleToggleSystem(country, 'platform', !country.platform_allowed)} className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60">Platform</button>
                      <button type="button" disabled={busyId === country.id} onClick={() => handleToggleSystem(country, 'simulator', !country.simulator_allowed)} className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60">Simulator</button>
                      <button type="button" onClick={() => openEdit(country)} className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800">Edit</button>
                      <button type="button" disabled={busyId === country.id} onClick={() => handleDelete(country)} className="rounded border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Country" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          {renderFormFields(createForm, setCreateForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingCountry)} title={`Edit ${editingCountry?.country_name || 'Country'}`} onClose={() => setEditingCountry(null)}>
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm, true)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingCountry(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      {modal}
    </div>
  )
}
