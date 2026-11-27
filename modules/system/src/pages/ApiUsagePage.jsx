/**
 * Admin v260 / monorepo v1356 — System › Public API: usage summary and emergency revoke.
 */
import { useEffect, useMemo, useState } from 'react'
import { apiUsageSummary, listApiCredentials, revokeApiCredential } from '@nidus-admin/shared'
import {
  AdminIconActionButton,
  EmptyState,
  LoadingState,
  SearchBar,
} from '@nidus-admin/ui'

export default function ApiUsagePage() {
  const [usage, setUsage] = useState([])
  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function reload() {
    setLoading(true)
    const why = reason.trim() || 'View public API usage'
    const [u, c] = await Promise.all([
      apiUsageSummary(7, why),
      listApiCredentials(null, why),
    ])
    setUsage(Array.isArray(u.data) ? u.data : [])
    setCredentials(Array.isArray(c.data) ? c.data : (c.data?.credentials || []))
    setError(u.error || c.error)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const q = search.trim().toLowerCase()
  const visibleKeys = useMemo(
    () => (credentials || []).filter((r) => !q || [r.name, r.key_prefix, r.credential_reference, r.account_id]
      .some((v) => String(v || '').toLowerCase().includes(q))),
    [credentials, q],
  )

  async function onRevoke(id) {
    const why = reason.trim()
    if (!why) {
      setError('Enter a reason before revoking a key.')
      return
    }
    setBusyId(id)
    const res = await revokeApiCredential(id, why)
    setBusyId(null)
    if (res.error) {
      setError(res.error)
      return
    }
    await reload()
  }

  if (loading) return <LoadingState message="Loading API usage..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Public API</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Organisation API usage and emergency key revoke (v1356). A reason is required for every action.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      <label className="block text-sm text-gray-800 dark:text-gray-100">
        Reason
        <input
          className="mt-1 w-full max-w-xl rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why you are viewing or revoking"
        />
      </label>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Usage (7 days)</h2>
        {!usage.length ? (
          <EmptyState title="No API calls yet" description="Usage appears after organisations call the public API." />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="text-left p-2">Account</th>
                <th className="text-left p-2">Calls</th>
                <th className="text-left p-2">Errors</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((row) => (
                <tr key={row.account_id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="p-2 font-mono text-gray-800 dark:text-gray-100">{row.account_id}</td>
                  <td className="p-2 text-gray-800 dark:text-gray-100">{row.calls}</td>
                  <td className="p-2 text-gray-800 dark:text-gray-100">{row.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Credentials</h2>
          <SearchBar value={search} onChange={setSearch} placeholder="Search keys…" />
        </div>
        {!visibleKeys.length ? (
          <EmptyState title="No credentials" description="No organisation API keys match this search." />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="text-left p-2">Reference</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Prefix</th>
                <th className="text-left p-2">Revoked</th>
                <th data-help="exempt"> </th>
              </tr>
            </thead>
            <tbody>
              {visibleKeys.map((r) => (
                <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="p-2 font-mono text-blue-600 dark:text-blue-400">{r.credential_reference || r.id}</td>
                  <td className="p-2 text-gray-800 dark:text-gray-100">{r.name}</td>
                  <td className="p-2 font-mono text-gray-800 dark:text-gray-100">{r.key_prefix}</td>
                  <td className="p-2 text-gray-800 dark:text-gray-100">{r.revoked_at ? 'Yes' : 'No'}</td>
                  <td className="p-2">
                    {!r.revoked_at && (
                      <AdminIconActionButton
                        variant="delete"
                        label="Revoke key"
                        disabled={busyId === r.id}
                        onClick={() => onRevoke(r.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
