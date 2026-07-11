import { useEffect, useState } from 'react'
import {
  PAYMENT_EVENT_TYPE_CONFIG,
  fetchPaymentJourney,
  formatCurrency,
  formatDate,
} from '@nidus-admin/shared'
import { EmptyState, LoadingState } from '@nidus-admin/ui'

export default function PaymentJourneyTab({ subscriptionId, targetSystem }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!subscriptionId) {
      setLoading(false)
      return
    }
    ;(async () => {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await fetchPaymentJourney(subscriptionId, targetSystem)
      if (fetchError) setError(typeof fetchError === 'string' ? fetchError : fetchError.message)
      setEvents(data || [])
      setLoading(false)
    })()
  }, [subscriptionId, targetSystem])

  if (loading) return <LoadingState message="Loading payment journey..." />
  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (events.length === 0) {
    return (
      <EmptyState
        title="No payment events"
        description="Payment lifecycle events will appear here once recorded in the payment event log."
      />
    )
  }

  return (
    <div className="relative space-y-0 pl-6">
      <div className="absolute bottom-0 left-2 top-0 w-px bg-gray-700" />
      {events.map((event, index) => {
        const cfg = PAYMENT_EVENT_TYPE_CONFIG[event.event_type] || {
          icon: '●',
          color: 'text-gray-400',
          label: event.event_type,
        }
        const nextEvent = events[index + 1]
        const showRetryHint = event.event_type === 'failed' && nextEvent?.event_type === 'retry_scheduled'

        return (
          <div key={event.id} className="relative pb-8">
            <span className={`absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-xs ${cfg.color}`}>
              {cfg.icon}
            </span>
            <div>
              <p className="text-sm font-medium text-gray-200">
                <span className="text-gray-500">{formatDate(event.created_at)}</span>
                {' '}{cfg.label}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {event.method_display_name && <>Method: {event.method_display_name} · </>}
                {event.gateway_name && <>Gateway: {event.gateway_name} · </>}
                {event.amount != null && formatCurrency(event.amount, event.currency || 'USD')}
              </p>
              {event.failure_message && (
                <p className="mt-1 text-xs text-red-400">
                  Reason: {event.failure_message}
                  {event.duration_ms ? ` · Duration: ${event.duration_ms.toLocaleString()}ms` : ''}
                </p>
              )}
              {event.transaction_id && event.event_type === 'success' && (
                <p className="mt-1 text-xs text-green-400/80">
                  Transaction ID: {event.transaction_id}
                  {event.duration_ms ? ` · Duration: ${event.duration_ms.toLocaleString()}ms` : ''}
                </p>
              )}
              {event.invoice_number && (
                <p className="mt-1 text-xs text-gray-400">
                  Invoice #{event.invoice_number}
                  {event.invoice_id && (
                    <> · <a href={`/subscriptions/invoices?id=${event.invoice_id}`} className="text-cyan-400 hover:underline">View invoice</a></>
                  )}
                </p>
              )}
              {showRetryHint && nextEvent.next_retry_at && (
                <p className="mt-1 text-xs text-orange-400">
                  → Retry scheduled {formatDate(nextEvent.next_retry_at)}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
