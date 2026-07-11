import { useEffect, useMemo, useState } from 'react'
import { fetchEnhancedEmailSendLog } from '@nidus-admin/shared'
import {
  AdminBadge,
  EmptyState,
  LoadingState,
  SearchBar,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const STATUS_FILTERS = ['all', 'pending', 'sent', 'delivered', 'failed', 'bounced']
const CATEGORY_FILTERS = ['all', 'auth', 'billing', 'support', 'system', 'affiliate', 'testers', 'marketing']

export default function EmailSendLogPage() {
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchEnhancedEmailSendLog({
      status: statusFilter === 'all' ? undefined : statusFilter,
      limit: 500,
    })
    if (error) {
      showError(error.message || String(error))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [statusFilter])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = rows
    if (categoryFilter !== 'all') {
      list = list.filter((row) => {
        const key = row.template_key || ''
        if (categoryFilter === 'affiliate') return key.includes('affiliate')
        if (categoryFilter === 'testers') return key.includes('tester') || key.includes('moratorium')
        if (categoryFilter === 'marketing') return key.includes('announcement')
        return key.includes(categoryFilter)
      })
    }
    if (!term) return list
    return list.filter((row) => [row.recipient_email, row.subject, row.error_message, row.message_id, row.provider]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search, categoryFilter])

  const statusVariant = (status) => {
    if (status === 'sent' || status === 'delivered') return 'active'
    if (status === 'pending') return 'pending_activation'
    if (status === 'failed') return 'rejected'
    return 'pending_activation'
  }

  const formatDate = (value) => {
    if (!value) return '—'
    return new Date(value).toLocaleString()
  }

  if (loading) return <LoadingState message="Loading email send log..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Email Send Log</h1>
          <p className="text-sm text-gray-500">Audit history of transactional emails sent through admin templates.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search recipient, subject..." />
          <select
            className={inputClass}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {CATEGORY_FILTERS.map((cat) => (
              <option key={cat} value={cat}>{cat === 'all' ? 'All categories' : cat}</option>
            ))}
          </select>
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'All statuses' : status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No send log entries" description="Sent emails will appear here once templates are used." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Sent At</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Message ID</th>
                <th className="px-4 py-3">Initiated by</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((entry) => (
                <tr key={entry.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(entry.sent_at)}</td>
                  <td className="px-4 py-3">{entry.recipient_email}</td>
                  <td className="px-4 py-3 max-w-md truncate">{entry.subject}</td>
                  <td className="px-4 py-3">
                    <AdminBadge label={entry.delivery_status || entry.status} variant={statusVariant(entry.status)} />
                  </td>
                  <td className="px-4 py-3">{entry.provider || '—'}</td>
                  <td className="px-4 py-3 max-w-[8rem] truncate text-xs">{entry.message_id || '—'}</td>
                  <td className="px-4 py-3">{entry.initiated_by_admin?.email || '—'}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-red-300">{entry.error_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
