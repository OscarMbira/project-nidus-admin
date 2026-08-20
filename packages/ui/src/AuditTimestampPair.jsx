/**
 * Compact date + time in one AuditCard grid cell (keeps 2-column cards dense).
 * Primary line = date; secondary line = Time label + clock value.
 */
import { formatAuditDate, formatAuditTime } from './auditDisplayUtils.js'

export default function AuditTimestampPair({ dateLabel = 'Created at', value }) {
  const date = formatAuditDate(value)
  const time = formatAuditTime(value)
  const empty = date === '—' && time === '—'

  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{dateLabel}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-900 dark:text-gray-100">
        {empty ? (
          '—'
        ) : (
          <>
            <div>{date}</div>
            {time !== '—' ? (
              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium">Time</span>
                <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                <span>{time}</span>
              </div>
            ) : null}
          </>
        )}
      </dd>
    </div>
  )
}
