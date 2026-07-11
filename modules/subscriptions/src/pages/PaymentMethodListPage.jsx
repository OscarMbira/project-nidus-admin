import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PermissionGate,
  deletePaymentMethod,
  listPaymentGateways,
  listPaymentMethods,
  methodTypesForProvider,
  togglePaymentMethod,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

const methodTypeLabel = (providerKey, methodType) =>
  methodTypesForProvider(providerKey).find((m) => m.value === methodType)?.label || methodType || '—'

const formatAmountRange = (min, max) => {
  const minStr = min != null ? `$${Number(min).toFixed(2)}` : '$0.00'
  const maxStr = max != null ? `$${Number(max).toFixed(2)}` : 'No limit'
  return `${minStr} – ${maxStr}`
}

const formatFee = (feeType, feeValue) => {
  if (!feeType || feeType === 'none') return '—'
  if (feeType === 'percentage') return `${Number(feeValue ?? 0)}%`
  return `$${Number(feeValue ?? 0).toFixed(2)}`
}

export default function PaymentMethodListPage() {
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [rows, setRows] = useState([])
  const [gateways, setGateways] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')
  const [expandedGateways, setExpandedGateways] = useState(new Set())

  const load = async () => {
    setLoading(true)
    const [methodsRes, gatewaysRes] = await Promise.all([
      listPaymentMethods(),
      listPaymentGateways(),
    ])
    if (methodsRes.error) showError(toError(methodsRes.error, 'Failed to load payment methods.'))
    else {
      const data = methodsRes.data || []
      setRows(data)
      setExpandedGateways(new Set(data.map((row) => row.gateway_id)))
    }
    if (gatewaysRes.error) showError(toError(gatewaysRes.error, 'Failed to load gateways.'))
    else setGateways(gatewaysRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => [
      row.display_name,
      row.method_type,
      row.gateway_name,
      methodTypeLabel(row.gateway_provider_key, row.method_type),
    ].some((value) => String(value ?? '').toLowerCase().includes(q)))
  }, [rows, search])

  const grouped = useMemo(() => {
    const map = new Map()
    filtered.forEach((row) => {
      if (!map.has(row.gateway_id)) {
        map.set(row.gateway_id, {
          gatewayId: row.gateway_id,
          gatewayName: row.gateway_name,
          providerKey: row.gateway_provider_key,
          methods: [],
        })
      }
      map.get(row.gateway_id).methods.push(row)
    })
    return Array.from(map.values())
  }, [filtered])

  const toggleGateway = (gatewayId) => {
    setExpandedGateways((prev) => {
      const next = new Set(prev)
      if (next.has(gatewayId)) next.delete(gatewayId)
      else next.add(gatewayId)
      return next
    })
  }

  const handleToggle = async (row) => {
    setBusyId(row.id)
    const { error } = await togglePaymentMethod(row.id, !row.is_enabled)
    setBusyId('')
    if (error) showError(toError(error, 'Failed to update payment method.'))
    else {
      showSuccess(`Payment method ${row.is_enabled ? 'disabled' : 'enabled'}.`)
      await load()
    }
  }

  const handleDelete = (row) => {
    confirm({
      title: `Delete ${row.display_name}?`,
      message: 'This payment method will be removed. Routing rules referencing it may block deletion.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await deletePaymentMethod(row.id)
        setBusyId('')
        if (error) showError(toError(error, 'Failed to delete payment method.'))
        else {
          showSuccess('Payment method deleted.')
          await load()
        }
      },
    })
  }

  if (loading) return <LoadingState message="Loading payment methods..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Payment Methods</h1>
          <p className="text-sm text-gray-500">
            Configure accepted payment types per gateway with limits and fees.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search methods, gateways..." />
          <PermissionGate permission="billing.payment_config.edit">
            <button
              type="button"
              onClick={() => navigate('/subscriptions/payment-method-form')}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              Add Method
            </button>
          </PermissionGate>
        </div>
      </div>

      {!grouped.length ? (
        <EmptyState
          title="No payment methods found"
          description={gateways.length ? 'Add a payment method or adjust your search.' : 'Create a gateway first, then add payment methods.'}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => {
            const expanded = expandedGateways.has(group.gatewayId)
            return (
              <div key={group.gatewayId} className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
                <button
                  type="button"
                  onClick={() => toggleGateway(group.gatewayId)}
                  className="flex w-full items-center justify-between bg-gray-800 px-4 py-3 text-left hover:bg-gray-700/50"
                >
                  <div>
                    <div className="font-medium text-gray-100">{group.gatewayName}</div>
                    <div className="text-xs text-gray-500">
                      {group.methods.length} method{group.methods.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span className="text-sm text-gray-400">{expanded ? '▼' : '▶'}</span>
                </button>

                {expanded && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-gray-200">
                      <thead className="bg-gray-800/50 text-left text-xs uppercase text-gray-400">
                        <tr>
                          <th className="px-4 py-3">Display Name</th>
                          <th className="px-4 py-3">Method Type</th>
                          <th className="px-4 py-3">Amount Range</th>
                          <th className="px-4 py-3">Fee</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.methods.map((row) => (
                          <tr key={row.id} className="border-t border-gray-800">
                            <td className="px-4 py-3 font-medium">{row.display_name}</td>
                            <td className="px-4 py-3">
                              {methodTypeLabel(row.gateway_provider_key, row.method_type)}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {formatAmountRange(row.min_amount, row.max_amount)}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {formatFee(row.fee_type, row.fee_value)}
                            </td>
                            <td className="px-4 py-3">
                              <AdminBadge
                                label={row.is_enabled ? 'enabled' : 'disabled'}
                                variant={row.is_enabled ? 'active' : 'inactive'}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/subscriptions/payment-method-form?id=${row.id}`)}
                                  className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                                >
                                  Edit
                                </button>
                                <PermissionGate permission="billing.payment_config.edit">
                                  <button
                                    type="button"
                                    disabled={busyId === row.id}
                                    onClick={() => handleToggle(row)}
                                    className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
                                  >
                                    {row.is_enabled ? 'Disable' : 'Enable'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === row.id}
                                    onClick={() => handleDelete(row)}
                                    className="rounded border border-red-700 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40 disabled:opacity-50"
                                  >
                                    Delete
                                  </button>
                                </PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal}
    </div>
  )
}
