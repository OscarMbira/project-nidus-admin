import { useEffect, useMemo, useState } from 'react'
import {
  createExchangeRate,
  fetchActiveCurrencies,
  fetchCurrentExchangeRates,
  fetchExchangeRateHistory,
  formatDate,
  updateExchangeRate,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
  EmptyState,
  inputClass,
  LoadingState,
  SelectField,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const toLocalInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const EMPTY_RATE_FORM = {
  from_currency: '',
  to_currency: '',
  rate: '',
  effective_from: toLocalInput(new Date().toISOString()),
  source: 'manual',
  source_detail: '',
}

export default function ExchangeRateListPage() {
  const { showSuccess, showError } = useToast()
  const [activeTab, setActiveTab] = useState('current')
  const [loading, setLoading] = useState(true)
  const [currencies, setCurrencies] = useState([])
  const [currentRates, setCurrentRates] = useState([])
  const [historyRates, setHistoryRates] = useState([])
  const [historyFrom, setHistoryFrom] = useState('USD')
  const [historyTo, setHistoryTo] = useState('EUR')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_RATE_FORM)
  const [editingRate, setEditingRate] = useState(null)
  const [editForm, setEditForm] = useState({ rate: '', source: 'manual', source_detail: '' })
  const [saving, setSaving] = useState(false)
  const [editTab, setEditTab] = useState('details')

  const currencyCodes = useMemo(() => currencies.map((c) => c.currency_code), [currencies])

  const loadCurrent = async () => {
    const [currencyRes, ratesRes] = await Promise.all([
      fetchActiveCurrencies(),
      fetchCurrentExchangeRates(),
    ])
    if (currencyRes.error) showError(currencyRes.error.message || String(currencyRes.error))
    else setCurrencies(currencyRes.data || [])
    if (ratesRes.error) showError(ratesRes.error.message || String(ratesRes.error))
    else setCurrentRates(ratesRes.data || [])
  }

  const loadHistory = async () => {
    if (!historyFrom || !historyTo) return
    const { data, error } = await fetchExchangeRateHistory(historyFrom, historyTo)
    if (error) showError(error)
    else setHistoryRates(data || [])
  }

  const loadAll = async () => {
    setLoading(true)
    await loadCurrent()
    await loadHistory()
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
  }, [historyFrom, historyTo, activeTab])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.from_currency || !createForm.to_currency || !createForm.rate) {
      showError('From currency, to currency, and rate are required.')
      return
    }
    setSaving(true)
    const { error } = await createExchangeRate({
      from_currency: createForm.from_currency,
      to_currency: createForm.to_currency,
      rate: Number(createForm.rate),
      effective_from: createForm.effective_from ? new Date(createForm.effective_from).toISOString() : new Date().toISOString(),
      source: createForm.source,
      source_detail: createForm.source_detail || null,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Exchange rate created.')
    setShowCreate(false)
    setCreateForm(EMPTY_RATE_FORM)
    await loadAll()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingRate) return
    setSaving(true)
    const { error } = await updateExchangeRate(editingRate.id, {
      rate: Number(editForm.rate),
      source: editForm.source,
      source_detail: editForm.source_detail || null,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Exchange rate updated.')
    setEditingRate(null)
    await loadAll()
  }

  if (loading) return <LoadingState message="Loading exchange rates..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Exchange Rates</h1>
          <p className="text-sm text-gray-500">Manage FX rates with full history for multi-currency reporting.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
          New Rate
        </button>
      </div>

      <div className="flex border-b border-gray-800">
        {[
          { id: 'current', label: 'Current Rates' },
          { id: 'history', label: 'Rate History' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium ${activeTab === tab.id ? 'border-b-2 border-blue-500 text-blue-200' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'current' && (
        !currentRates.length ? (
          <EmptyState title="No current rates" description="Create an exchange rate to get started." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
            <table className="min-w-full text-sm text-gray-200">
              <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Inverse</th>
                  <th className="px-4 py-3">Effective From</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRates.map((rate) => (
                  <tr key={rate.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">{rate.from_currency}</td>
                    <td className="px-4 py-3">{rate.to_currency}</td>
                    <td className="px-4 py-3">{Number(rate.rate).toFixed(6)}</td>
                    <td className="px-4 py-3">{rate.inverse_rate ? Number(rate.inverse_rate).toFixed(6) : '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(rate.effective_from)}</td>
                    <td className="px-4 py-3">{rate.source || 'manual'}</td>
                    <td className="px-4 py-3 text-right">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => {
                          setEditingRate(rate)
                          setEditTab('details')
                          setEditForm({ rate: String(rate.rate), source: rate.source || 'manual', source_detail: rate.source_detail || '' })
                        }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <AdminField label="From Currency">
              <SelectField
                value={historyFrom}
                onChange={setHistoryFrom}
                placeholder="Select currency..."
                searchPlaceholder="Search currency..."
                forceSearchable
                options={currencyCodes.map((code) => ({ value: code, label: code }))}
              />
            </AdminField>
            <AdminField label="To Currency">
              <SelectField
                value={historyTo}
                onChange={setHistoryTo}
                placeholder="Select currency..."
                searchPlaceholder="Search currency..."
                forceSearchable
                options={currencyCodes
                  .filter((code) => code !== historyFrom)
                  .map((code) => ({ value: code, label: code }))}
              />
            </AdminField>
          </div>
          {!historyRates.length ? (
            <EmptyState title="No history for this pair" description="Select another currency pair or create a rate." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
              <table className="min-w-full text-sm text-gray-200">
                <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Rate</th>
                    <th className="px-4 py-3">Effective From</th>
                    <th className="px-4 py-3">Effective To</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRates.map((rate) => (
                    <tr key={rate.id} className="border-t border-gray-800">
                      <td className="px-4 py-3">{Number(rate.rate).toFixed(6)}</td>
                      <td className="px-4 py-3 text-gray-400">{formatDate(rate.effective_from)}</td>
                      <td className="px-4 py-3 text-gray-400">{rate.effective_to ? formatDate(rate.effective_to) : 'Current'}</td>
                      <td className="px-4 py-3">{rate.source || 'manual'}</td>
                      <td className="px-4 py-3 text-gray-400">{formatDate(rate.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <AdminModal open={showCreate} title="Create Exchange Rate" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="From Currency" required>
              <SelectField
                value={createForm.from_currency}
                onChange={(v) => setCreateForm((p) => ({ ...p, from_currency: v }))}
                placeholder="Select..."
                searchPlaceholder="Search currency..."
                forceSearchable
                options={currencyCodes.map((code) => ({ value: code, label: code }))}
              />
            </AdminField>
            <AdminField label="To Currency" required>
              <SelectField
                value={createForm.to_currency}
                onChange={(v) => setCreateForm((p) => ({ ...p, to_currency: v }))}
                placeholder="Select..."
                searchPlaceholder="Search currency..."
                forceSearchable
                options={currencyCodes
                  .filter((code) => code !== createForm.from_currency)
                  .map((code) => ({ value: code, label: code }))}
              />
            </AdminField>
          </div>
          <AdminField label="Rate" required>
            <input type="number" step="0.0000000001" min="0" className={inputClass} value={createForm.rate} onChange={(e) => setCreateForm((p) => ({ ...p, rate: e.target.value }))} />
          </AdminField>
          <AdminField label="Effective From">
            <input type="datetime-local" className={inputClass} value={createForm.effective_from} onChange={(e) => setCreateForm((p) => ({ ...p, effective_from: e.target.value }))} />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Source">
              <select className={inputClass} value={createForm.source} onChange={(e) => setCreateForm((p) => ({ ...p, source: e.target.value }))}>
                <option value="manual">manual</option>
                <option value="api">api</option>
              </select>
            </AdminField>
            <AdminField label="Source Detail">
              <input className={inputClass} value={createForm.source_detail} onChange={(e) => setCreateForm((p) => ({ ...p, source_detail: e.target.value }))} />
            </AdminField>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingRate)} title="Edit Exchange Rate" onClose={() => setEditingRate(null)}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editingRate && (
          <AuditDetailsPanel description="Who created this exchange rate, and how it is classified.">
            <AuditCard title="Identity" description="How this rate is labelled.">
              <AuditField label="From currency" value={editingRate.from_currency} />
              <AuditField label="To currency" value={editingRate.to_currency} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this rate sits.">
              <AuditField label="Source" value={editingRate.source} />
              <AuditField label="Active" value={editingRate.is_active ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this rate was created.">
              <AuditField label="Created by" value={editingRate.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editingRate.created_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          <p className="text-xs text-gray-400">Pair: {editingRate?.from_currency} → {editingRate?.to_currency} (pair cannot be changed)</p>
          <AdminField label="Rate" required>
            <input type="number" step="0.0000000001" min="0" className={inputClass} value={editForm.rate} onChange={(e) => setEditForm((p) => ({ ...p, rate: e.target.value }))} />
          </AdminField>
          <AdminField label="Source">
            <select className={inputClass} value={editForm.source} onChange={(e) => setEditForm((p) => ({ ...p, source: e.target.value }))}>
              <option value="manual">manual</option>
              <option value="api">api</option>
            </select>
          </AdminField>
          <AdminField label="Source Detail">
            <input className={inputClass} value={editForm.source_detail} onChange={(e) => setEditForm((p) => ({ ...p, source_detail: e.target.value }))} />
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingRate(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
        )}
      </AdminModal>
    </div>
  )
}
