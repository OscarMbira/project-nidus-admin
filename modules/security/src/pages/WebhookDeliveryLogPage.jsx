import { useEffect, useMemo, useState } from 'react'
import {
  fetchWebhookDeliveryLog,
  fetchWebhooks,
  formatDate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  EmptyState,
  LoadingState,
  SearchBar,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const STATUS_VARIANTS = {
  delivered: 'active',
  failed: 'inactive',
  pending: 'pending_activation',
}

export default function WebhookDeliveryLogPage() {
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [webhooks, setWebhooks] = useState([])
  const [search, setSearch] = useState('')
  const [webhookFilter, setWebhookFilter] = useState('all')

  const loadWebhooks = async () => {
    const { data, error } = await fetchWebhooks()
    if (error) {
      showError(error.message || String(error))
      return
    }
    setWebhooks(data || [])
  }

  const loadLog = async (webhookId) => {
    setLoading(true)
    const { data, error } = await fetchWebhookDeliveryLog({
      webhookId: webhookId === 'all' ? null : webhookId,
      limit: 200,
    })
    if (error) {
      showError(error)
      setRows([])
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadWebhooks()
  }, [])

  useEffect(() => {
    loadLog(webhookFilter)
  }, [webhookFilter])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [
      row.webhook_name,
      row.event_type,
      row.status,
      row.response_status,
      row.response_body,
    ].some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  if (loading && !rows.length) return <LoadingState message="Loading webhook delivery log..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Webhook Delivery Log</h1>
          <p className="text-sm text-gray-500">Browse delivery attempts, HTTP responses, and retry outcomes.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="min-w-[200px]">
            <AdminField label="Webhook">
              <select
                className={inputClass}
                value={webhookFilter}
                onChange={(e) => setWebhookFilter(e.target.value)}
              >
                <option value="all">All webhooks</option>
                {webhooks.map((webhook) => (
                  <option key={webhook.id} value={webhook.id}>{webhook.webhook_name}</option>
                ))}
              </select>
            </AdminField>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search event, status, response..." />
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No delivery log entries" description="Deliveries will appear here after webhooks are triggered." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Webhook</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">HTTP</th>
                <th className="px-4 py-3">Attempt</th>
                <th className="px-4 py-3">Delivered</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Response</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-medium">{row.webhook_name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.event_type}</td>
                  <td className="px-4 py-3">
                    <AdminBadge
                      label={row.status || 'unknown'}
                      variant={STATUS_VARIANTS[row.status] || 'default'}
                    />
                  </td>
                  <td className="px-4 py-3">{row.response_status ?? '—'}</td>
                  <td className="px-4 py-3">{row.attempt_number ?? 1}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(row.delivered_at)}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs text-gray-500" title={row.response_body || ''}>
                    {row.response_body || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
