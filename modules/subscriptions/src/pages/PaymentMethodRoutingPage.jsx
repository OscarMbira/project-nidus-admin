import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PermissionGate,
  REGION_SCOPES,
  deleteRoutingRule,
  fetchCountries,
  listPaymentGateways,
  listPaymentMethods,
  listRoutingRules,
  reorderRoutingRules,
  resolvePaymentMethods,
  toggleRoutingRule,
  upsertRoutingRule,
  useCurrentAdmin,
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
  SelectField,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

const EMPTY_FORM = {
  id: null,
  display_label: '',
  payment_method_id: '',
  primary_gateway_id: '',
  fallback_gateway_id: '',
  region_scope: 'global',
  supported_countries: [],
  display_order: 0,
  is_enabled: true,
}

function formatCountries(codes) {
  if (!codes?.length) return 'All in region'
  return codes.join(', ')
}

export default function PaymentMethodRoutingPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const { hasPermission } = useCurrentAdmin()
  const canEdit = hasPermission('billing.payment_config.edit')
  const showErrorRef = useRef(showError)
  showErrorRef.current = showError

  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState([])
  const [methods, setMethods] = useState([])
  const [gateways, setGateways] = useState([])
  const [countries, setCountries] = useState([])
  const [previewCountry, setPreviewCountry] = useState('ZW')
  const [previewMethods, setPreviewMethods] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editingRow, setEditingRow] = useState(null)
  const [modalTab, setModalTab] = useState('details')

  const countryMap = useMemo(() => {
    const map = new Map()
    countries.forEach((c) => map.set(c.country_code, c))
    return map
  }, [countries])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [rulesRes, methodsRes, gatewaysRes, countriesRes] = await Promise.all([
      listRoutingRules(),
      listPaymentMethods(),
      listPaymentGateways(),
      fetchCountries({ activeOnly: true }),
    ])
    if (rulesRes.error) showErrorRef.current(toError(rulesRes.error, 'Failed to load routing rules.'))
    else setRules(rulesRes.data || [])
    if (methodsRes.error) showErrorRef.current(toError(methodsRes.error, 'Failed to load payment methods.'))
    else setMethods(methodsRes.data || [])
    if (gatewaysRes.error) showErrorRef.current(toError(gatewaysRes.error, 'Failed to load gateways.'))
    else setGateways(gatewaysRes.data || [])
    if (countriesRes.error) showErrorRef.current(toError(countriesRes.error, 'Failed to load countries.'))
    else setCountries(countriesRes.data || [])
    setLoading(false)
  }, [])

  const loadPreview = useCallback(async (countryCode) => {
    if (!countryCode) {
      setPreviewMethods([])
      return
    }
    setPreviewLoading(true)
    const { data, error } = await resolvePaymentMethods(countryCode)
    setPreviewLoading(false)
    if (error) showErrorRef.current(toError(error, 'Failed to resolve payment methods.'))
    else setPreviewMethods(data || [])
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!countries.length) return
    if (!countries.some((c) => c.country_code === previewCountry)) {
      setPreviewCountry(countries[0].country_code)
    }
  }, [countries, previewCountry])

  useEffect(() => {
    if (loading || !previewCountry) return
    loadPreview(previewCountry)
  }, [loading, previewCountry, loadPreview])

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      display_order: rules.length,
    })
    setEditingRow(null)
    setModalTab('details')
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditingRow(row)
    setModalTab('details')
    setForm({
      id: row.id,
      display_label: row.display_label || '',
      payment_method_id: row.payment_method_id || '',
      primary_gateway_id: row.primary_gateway_id || '',
      fallback_gateway_id: row.fallback_gateway_id || '',
      region_scope: row.region_scope || 'global',
      supported_countries: row.supported_countries || [],
      display_order: row.display_order ?? 0,
      is_enabled: Boolean(row.is_enabled),
    })
    setModalOpen(true)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!form.display_label.trim() || !form.payment_method_id || !form.primary_gateway_id) {
      showError('Display label, payment method, and primary gateway are required.')
      return
    }
    setSaving(true)
    const { error } = await upsertRoutingRule({
      id: form.id,
      display_label: form.display_label.trim(),
      payment_method_id: form.payment_method_id,
      primary_gateway_id: form.primary_gateway_id,
      fallback_gateway_id: form.fallback_gateway_id || null,
      region_scope: form.region_scope,
      supported_countries: form.supported_countries.length ? form.supported_countries : null,
      display_order: Number(form.display_order) || 0,
      is_enabled: form.is_enabled,
    })
    setSaving(false)
    if (error) showError(toError(error, 'Failed to save routing rule.'))
    else {
      showSuccess(form.id ? 'Routing rule updated.' : 'Routing rule created.')
      setModalOpen(false)
      await loadData()
      await loadPreview(previewCountry)
    }
  }

  const handleToggle = async (row) => {
    setBusyId(row.id)
    const { error } = await toggleRoutingRule(row.id, !row.is_enabled)
    setBusyId('')
    if (error) showError(toError(error, 'Failed to update routing rule.'))
    else {
      showSuccess(`Route ${row.is_enabled ? 'disabled' : 'enabled'}.`)
      await loadData()
      await loadPreview(previewCountry)
    }
  }

  const handleDelete = (row) => {
    confirm({
      title: `Delete ${row.display_label}?`,
      message: 'Customers will no longer see this payment option where it applied.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await deleteRoutingRule(row.id)
        setBusyId('')
        if (error) showError(toError(error, 'Failed to delete routing rule.'))
        else {
          showSuccess('Routing rule deleted.')
          await loadData()
          await loadPreview(previewCountry)
        }
      },
    })
  }

  const handleReorder = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= rules.length) return
    const next = [...rules]
    const temp = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = temp
    setBusyId(rules[index].id)
    const { error } = await reorderRoutingRules(next.map((r) => r.id))
    setBusyId('')
    if (error) showError(toError(error, 'Failed to reorder routing rules.'))
    else {
      showSuccess('Display order updated.')
      await loadData()
      await loadPreview(previewCountry)
    }
  }

  const toggleCountry = (code) => {
    setForm((prev) => {
      const set = new Set(prev.supported_countries)
      if (set.has(code)) set.delete(code)
      else set.add(code)
      return { ...prev, supported_countries: [...set].sort() }
    })
  }

  if (loading) return <LoadingState message="Loading method routing..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Method Routing</h1>
          <p className="text-sm text-gray-500">
            Map customer-facing payment choices to gateways by country and region.
          </p>
        </div>
        <PermissionGate permission="billing.payment_config.edit">
          <button
            type="button"
            onClick={openCreate}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Add Route
          </button>
        </PermissionGate>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {!rules.length ? (
            <EmptyState title="No routing rules" description="Add a route to control checkout payment options." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
              <table className="min-w-full text-sm text-gray-200">
                <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Display Label</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Primary</th>
                    <th className="px-4 py-3">Fallback</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Countries</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((row, index) => (
                    <tr key={row.id} className="border-t border-gray-800">
                      <td className="px-4 py-3 font-medium">{row.display_label}</td>
                      <td className="px-4 py-3">
                        <div>{row.method_type}</div>
                        <div className="text-xs text-gray-500">{row.method_display_name}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">{row.primary_gateway_name || '—'}</td>
                      <td className="px-4 py-3 text-xs">{row.fallback_gateway_name || '—'}</td>
                      <td className="px-4 py-3 capitalize">{row.region_scope}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatCountries(row.supported_countries)}</td>
                      <td className="px-4 py-3">
                        <AdminBadge
                          label={row.is_enabled ? 'enabled' : 'disabled'}
                          variant={row.is_enabled ? 'active' : 'inactive'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end flex-wrap gap-2">
                          <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(row)} />
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                disabled={busyId === row.id || index === 0}
                                onClick={() => handleReorder(index, 'up')}
                                className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={busyId === row.id || index === rules.length - 1}
                                onClick={() => handleReorder(index, 'down')}
                                className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => handleToggle(row)}
                                className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
                              >
                                {row.is_enabled ? 'Disable' : 'Enable'}
                              </button>
                              <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(row)} disabled={busyId === row.id} />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Checkout Preview</p>
            <p className="mt-1 text-sm text-gray-400">Admin view — gateway names shown for routing verification.</p>
            <div className="mt-4">
              <AdminField label="Customer country">
                <SelectField
                  value={previewCountry}
                  onChange={setPreviewCountry}
                  placeholder="Select country..."
                  searchPlaceholder="Search country..."
                  forceSearchable
                  options={countries.map((country) => ({
                    value: country.country_code,
                    label: `${country.country_code} — ${country.country_name}`,
                  }))}
                />
              </AdminField>
            </div>
            {previewLoading ? (
              <p className="mt-4 text-sm text-gray-500">Resolving methods...</p>
            ) : !previewMethods.length ? (
              <EmptyState title="No methods" description="No enabled routes match this country." />
            ) : (
              <ul className="mt-4 space-y-2">
                {previewMethods.map((method) => (
                  <li
                    key={method.routing_rule_id}
                    className="rounded border border-gray-800 bg-gray-950/60 px-3 py-2"
                  >
                    <div className="font-medium text-gray-100">{method.display_label}</div>
                    <div className="mt-1 text-xs text-gray-400">
                      Primary: {method.primary_gateway_name || '—'}
                      {method.fallback_gateway_name ? ` · Fallback: ${method.fallback_gateway_name}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <AdminModal
        open={modalOpen}
        title={form.id ? 'Edit Routing Rule' : 'Add Routing Rule'}
        onClose={() => setModalOpen(false)}
        size="xl"
        hideFooter
      >
        <div className="mb-3">
          <DetailAuditTabList activeTab={modalTab} onChange={setModalTab} />
        </div>

        {modalTab === 'audit' && !editingRow && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this route is saved.</p>
        )}

        {modalTab === 'audit' && editingRow && (
          <AuditDetailsPanel description="Who created or changed this routing rule, and how it is classified.">
            <AuditCard title="Identity" description="How this route is labelled.">
              <AuditField label="Display label" value={editingRow.display_label} />
              <AuditField label="Method type" value={editingRow.method_type} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this route sits.">
              <AuditField label="Region scope" value={editingRow.region_scope} />
              <AuditField label="Enabled" value={editingRow.is_enabled ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this route was created and last changed.">
              <AuditField label="Created by" value={editingRow.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editingRow.created_at} />
              <AuditField label="Updated by" value={editingRow.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={editingRow.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {modalTab === 'details' && (
        <AdminForm onSubmit={handleSave} className="mt-2 space-y-3">
          <AdminField label="Display Label" required>
            <input
              className={inputClass}
              value={form.display_label}
              onChange={(e) => setForm((p) => ({ ...p, display_label: e.target.value }))}
              placeholder="EcoCash, M-Pesa, Pay by Card"
            />
          </AdminField>
          <AdminField label="Payment Method" required>
            <select
              className={inputClass}
              value={form.payment_method_id}
              onChange={(e) => setForm((p) => ({ ...p, payment_method_id: e.target.value }))}
            >
              <option value="">Select method...</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.method_type})
                </option>
              ))}
            </select>
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Primary Gateway" required>
              <select
                className={inputClass}
                value={form.primary_gateway_id}
                onChange={(e) => setForm((p) => ({ ...p, primary_gateway_id: e.target.value }))}
              >
                <option value="">Select gateway...</option>
                {gateways.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Fallback Gateway">
              <select
                className={inputClass}
                value={form.fallback_gateway_id}
                onChange={(e) => setForm((p) => ({ ...p, fallback_gateway_id: e.target.value }))}
              >
                <option value="">None</option>
                {gateways.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </AdminField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Region Scope" required>
              <select
                className={inputClass}
                value={form.region_scope}
                onChange={(e) => setForm((p) => ({ ...p, region_scope: e.target.value }))}
              >
                {REGION_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Display Order">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.display_order}
                onChange={(e) => setForm((p) => ({ ...p, display_order: e.target.value }))}
              />
            </AdminField>
          </div>
          <AdminField label="Supported Countries">
            <p className="mb-2 text-xs text-gray-500">Leave empty for all countries in the selected region.</p>
            <div className="max-h-48 overflow-y-auto rounded border border-gray-700 bg-gray-950 p-2">
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {countries.map((country) => (
                  <label key={country.country_code} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-gray-300 hover:bg-gray-900">
                    <input
                      type="checkbox"
                      checked={form.supported_countries.includes(country.country_code)}
                      onChange={() => toggleCountry(country.country_code)}
                    />
                    <span className="truncate">{country.country_code} — {country.country_name}</span>
                  </label>
                ))}
              </div>
            </div>
            {form.supported_countries.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                Selected: {form.supported_countries.map((c) => countryMap.get(c)?.country_name || c).join(', ')}
              </p>
            )}
          </AdminField>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(e) => setForm((p) => ({ ...p, is_enabled: e.target.checked }))}
            />
            Enabled
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Saving...' : form.id ? 'Save' : 'Create'}
            </button>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {modal}
    </div>
  )
}
