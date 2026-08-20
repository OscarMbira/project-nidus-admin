import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PermissionGate,
  deletePromoCode,
  listPromoCodes,
  togglePromoCode,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

const actionBtnClass = 'rounded border px-3 py-1.5 text-sm font-medium whitespace-nowrap'

function formatDiscount(row) {
  if (row.discount_type === 'percentage') return `${row.discount_value}%`
  return `$${Number(row.discount_value).toFixed(2)}`
}

function formatUsage(row) {
  const current = row.current_uses ?? 0
  if (row.max_uses == null) return `${current} / ∞`
  return `${current} / ${row.max_uses}`
}

function usagePercent(row) {
  if (row.max_uses == null || row.max_uses <= 0) return 0
  return Math.min(100, Math.round(((row.current_uses ?? 0) / row.max_uses) * 100))
}

function promoStatus(row) {
  if (!row.is_active) return { label: 'inactive', variant: 'inactive' }
  if (row.valid_until && new Date(row.valid_until) < new Date()) {
    return { label: 'expired', variant: 'inactive' }
  }
  if (row.max_uses != null && (row.current_uses ?? 0) >= row.max_uses) {
    return { label: 'exhausted', variant: 'inactive' }
  }
  return { label: 'active', variant: 'active' }
}

export default function PromoCodeListPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await listPromoCodes()
    if (error) showError(toError(error, 'Failed to load promo codes.'))
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => [r.code, r.name, r.description]
      .some((v) => String(v ?? '').toLowerCase().includes(q)))
  }, [rows, search])

  const handleToggle = async (row) => {
    setBusyId(row.id)
    const { error } = await togglePromoCode(row.id, !row.is_active)
    setBusyId('')
    if (error) showError(toError(error, 'Failed to update promo code.'))
    else {
      showSuccess(`Promo code ${row.is_active ? 'deactivated' : 'activated'}.`)
      await load()
    }
  }

  const handleDelete = (row) => {
    confirm({
      title: `Delete ${row.code}?`,
      message: 'Only unused promo codes can be deleted.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await deletePromoCode(row.id)
        setBusyId('')
        if (error) showError(toError(error, 'Failed to delete promo code.'))
        else {
          showSuccess('Promo code deleted.')
          await load()
        }
      },
    })
  }

  if (loading) return <LoadingState message="Loading promo codes..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Promo Codes</h1>
          <p className="text-sm text-gray-500">Time-limited discount codes applied at checkout.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto lg:min-w-[22rem]">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search codes..."
            className="w-full min-w-[12rem] max-w-md"
          />
          <PermissionGate permission="billing.payment_config.edit">
            <button
              type="button"
              onClick={() => navigate('/subscriptions/promo-code-form')}
              className="shrink-0 whitespace-nowrap rounded bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600"
            >
              Create Promo Code
            </button>
          </PermissionGate>
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState title="No promo codes found" description="Create a promo code or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Valid Until</th>
                <th className="px-4 py-3">Status</th>
                <th className="min-w-[15rem] px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const status = promoStatus(row)
                const pct = usagePercent(row)
                return (
                  <tr key={row.id} className="border-t border-gray-800">
                    <td className="px-4 py-3 font-mono font-medium">{row.code}</td>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3">
                      <div>{formatDiscount(row)}</div>
                      <div className="text-xs capitalize text-gray-500">{row.discount_type?.replace('_', ' ')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{formatUsage(row)}</div>
                      {row.max_uses != null && (
                        <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
                          <div
                            className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {row.valid_until ? row.valid_until.slice(0, 10) : 'No expiry'}
                    </td>
                    <td className="px-4 py-3">
                      <AdminBadge label={status.label} variant={status.variant} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end flex-wrap gap-2">
                        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/subscriptions/promo-code-form?id=${row.id}`)} />
                        <PermissionGate permission="billing.payment_config.edit">
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => handleToggle(row)}
                            className={`${actionBtnClass} border-amber-700 text-amber-200 hover:bg-amber-900/40 disabled:opacity-50`}
                          >
                            {row.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(row)} disabled={busyId === row.id} />
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal}
    </div>
  )
}
