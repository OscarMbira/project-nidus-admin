import { useEffect, useMemo, useState } from 'react'
import { fetchEnhancedEmailSendLog } from '@nidus-admin/shared'
import { AdminBadge, EmptyState, LoadingState, SearchBar, inputClass, useToast } from '@nidus-admin/ui'

const STATUS_FILTERS = ['all', 'pending', 'sent', 'delivered', 'failed', 'bounced']

const statusVariant = (status) => {
  if (status === 'sent' || status === 'delivered') return 'active'
  if (status === 'pending') return 'pending_activation'
  if (status === 'failed' || status === 'bounced') return 'rejected'
  return 'content_admin'
}

export default function EmailSendLogPage() {
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchEnhancedEmailSendLog({
      status: statusFilter === 'all' ? undefined : statusFilter,
      limit: 500,
    })
    if (error) showError(error.message || String(error))
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [statusFilter])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((r) => [r.recipient_email, r.subject, r.template_key, r.message_id, r.provider]
      .some((v) => String(v ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const copyId = (id) => {
    if (id) navigator.clipboard?.writeText(id)
  }

  if (loading) return <LoadingState message="Loading send log..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Email Send Log</h1>
          <p className="text-sm text-gray-500">Admin-initiated sends with delivery tracking.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search recipient, subject, message ID..." />
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
          </select>
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState title="No send log entries" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Message ID</th>
                <th className="px-4 py-3">Initiated by</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 whitespace-nowrap">{row.sent_at ? new Date(row.sent_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">{row.recipient_email}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{row.subject}</td>
                  <td className="px-4 py-3"><AdminBadge label={row.delivery_status || row.status} variant={statusVariant(row.status)} /></td>
                  <td className="px-4 py-3">{row.provider || '—'}</td>
                  <td className="px-4 py-3">
                    {row.message_id ? (
                      <button type="button" className="max-w-[8rem] truncate text-blue-400 hover:underline" title={row.message_id} onClick={() => copyId(row.message_id)}>
                        {row.message_id.slice(0, 12)}…
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">{row.initiated_by_admin?.email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
