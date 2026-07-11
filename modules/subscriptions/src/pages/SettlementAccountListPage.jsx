import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PermissionGate,
  deleteSettlementAccount,
  listSettlementAccounts,
  setDefaultSettlementAccount,
  toggleSettlementAccount,
} from '@nidus-admin/shared'
import { AdminBadge, AdminCard, EmptyState, LoadingState, SearchBar, useConfirmAction, useToast } from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

export default function SettlementAccountListPage() {
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await listSettlementAccounts()
    if (error) showError(toError(error, 'Failed to load settlement accounts.'))
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [row.account_name, row.bank_name, row.currency_code, row.gateway_name, row.account_number_masked]
        .some((value) => String(value ?? '').toLowerCase().includes(q)),
    )
  }, [rows, search])

  const grouped = useMemo(() => {
    const map = new Map()
    filtered.forEach((row) => {
      const key = row.currency_code || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(row)
    })
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const handleToggle = async (row) => {
    setBusyId(row.id)
    const { error } = await toggleSettlementAccount(row.id, !row.is_active)
    setBusyId('')
    if (error) showError(toError(error, 'Failed to update account.'))
    else {
      showSuccess(`Account ${row.is_active ? 'deactivated' : 'activated'}.`)
      await load()
    }
  }

  const handleSetDefault = async (row) => {
    setBusyId(row.id)
    const { error } = await setDefaultSettlementAccount(row.id)
    setBusyId('')
    if (error) showError(toError(error, 'Failed to set default account.'))
    else {
      showSuccess('Default settlement account updated.')
      await load()
    }
  }

  const handleDelete = (row) => {
    confirm({
      title: `Delete ${row.account_name}?`,
      message: 'Only inactive accounts can be deleted.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await deleteSettlementAccount(row.id)
        setBusyId('')
        if (error) showError(toError(error, 'Failed to delete account.'))
        else {
          showSuccess('Settlement account deleted.')
          await load()
        }
      },
    })
  }

  if (loading) return <LoadingState message="Loading settlement accounts..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Settlement Accounts</h1>
          <p className="text-sm text-gray-500">Bank and merchant accounts where gateway funds settle.</p>
        </div>
        <div className="flex gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search accounts..." />
          <PermissionGate permission="billing.payment_config.edit">
            <button
              type="button"
              onClick={() => navigate('/subscriptions/settlement-account-form')}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              Add Account
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard title="Total accounts" value={rows.length} />
        <AdminCard title="Active" value={rows.filter((r) => r.is_active).length} />
        <AdminCard title="Currencies" value={new Set(rows.map((r) => r.currency_code)).size} />
      </div>

      {!filtered.length ? (
        <EmptyState title="No settlement accounts found" description="Add an account or adjust your search." />
      ) : (
        <div className="space-y-6">
          {grouped.map(([currencyCode, accounts]) => (
            <div key={currencyCode} className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
              <div className="border-b border-gray-800 bg-gray-800/80 px-4 py-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">{currencyCode}</h2>
              </div>
              <table className="min-w-full text-sm text-gray-200">
                <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Account Name</th>
                    <th className="px-4 py-3">Bank</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Gateway</th>
                    <th className="px-4 py-3">Default</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((row) => (
                    <tr key={row.id} className="border-t border-gray-800">
                      <td className="px-4 py-3 font-medium">{row.account_name}</td>
                      <td className="px-4 py-3">{row.bank_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{row.account_number_masked || '—'}</td>
                      <td className="px-4 py-3">{row.gateway_name || '—'}</td>
                      <td className="px-4 py-3">
                        {row.is_default ? (
                          <AdminBadge label="default" variant="active" />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AdminBadge
                          label={row.is_active ? 'active' : 'inactive'}
                          variant={row.is_active ? 'active' : 'inactive'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/subscriptions/settlement-account-form?id=${row.id}`)}
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
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            {!row.is_default && row.is_active && (
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => handleSetDefault(row)}
                                className="rounded border border-blue-700 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/40 disabled:opacity-50"
                              >
                                Set Default
                              </button>
                            )}
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
          ))}
        </div>
      )}
      {modal}
    </div>
  )
}
