import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PermissionGate,
  deletePaymentGateway,
  listPaymentGateways,
  providerCoverage,
  providerLabel,
  setDefaultPaymentGateway,
  togglePaymentGateway,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminIconActionButton,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

export default function PaymentGatewayListPage() {
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await listPaymentGateways()
    if (error) showError(toError(error, 'Failed to load gateways.'))
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => [r.name, r.provider_key, r.display_name, r.environment]
      .some((v) => String(v ?? '').toLowerCase().includes(q)))
  }, [rows, search])

  const handleToggle = async (row) => {
    setBusyId(row.id)
    const { error } = await togglePaymentGateway(row.id, !row.is_active)
    setBusyId('')
    if (error) showError(toError(error, 'Failed to update gateway.'))
    else { showSuccess(`Gateway ${row.is_active ? 'deactivated' : 'activated'}.`); await load() }
  }

  const handleSetDefault = async (row) => {
    setBusyId(row.id)
    const { error } = await setDefaultPaymentGateway(row.id)
    setBusyId('')
    if (error) showError(toError(error, 'Failed to set default gateway.'))
    else { showSuccess('Default gateway updated.'); await load() }
  }

  const handleDelete = (row) => {
    confirm({
      title: `Delete ${row.name}?`,
      message: 'Blocked if active routing rules reference this gateway.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await deletePaymentGateway(row.id)
        setBusyId('')
        if (error) showError(toError(error, 'Failed to delete gateway.'))
        else { showSuccess('Gateway deleted.'); await load() }
      },
    })
  }

  if (loading) return <LoadingState message="Loading payment gateways..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Payment Gateways</h1>
          <p className="text-sm text-gray-500">Configure PayNow, Flutterwave, and Paddle processors.</p>
        </div>
        <div className="flex gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search gateways..." />
          <PermissionGate permission="billing.payment_config.edit">
            <button type="button" onClick={() => navigate('/subscriptions/payment-gateway-form')} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
              Add Gateway
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard title="Total gateways" value={rows.length} />
        <AdminCard title="Active" value={rows.filter((r) => r.is_active).length} />
        <AdminCard title="Default" value={rows.find((r) => r.is_default)?.name || '—'} />
      </div>

      {!filtered.length ? (
        <EmptyState title="No gateways found" description="Add a gateway or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Gateway</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Environment</th>
                <th className="px-4 py-3">Coverage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Default</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-gray-500">{row.display_name}</div>
                  </td>
                  <td className="px-4 py-3"><AdminBadge label={providerLabel(row.provider_key)} variant="active" /></td>
                  <td className="px-4 py-3 capitalize">{row.environment}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{providerCoverage(row.provider_key)}</td>
                  <td className="px-4 py-3"><AdminBadge label={row.is_active ? 'active' : 'inactive'} variant={row.is_active ? 'active' : 'inactive'} /></td>
                  <td className="px-4 py-3">{row.is_default ? 'Yes' : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end flex-wrap gap-2">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/subscriptions/payment-gateway-form?id=${row.id}`)} />
                      <PermissionGate permission="billing.payment_config.edit">
                        <button type="button" disabled={busyId === row.id} onClick={() => handleToggle(row)} className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/40 disabled:opacity-50">{row.is_active ? 'Deactivate' : 'Activate'}</button>
                        {!row.is_default && row.is_active && (
                          <button type="button" disabled={busyId === row.id} onClick={() => handleSetDefault(row)} className="rounded border border-blue-700 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/40 disabled:opacity-50">Set Default</button>
                        )}
                        <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(row)} disabled={busyId === row.id} />
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal}
    </div>
  )
}
