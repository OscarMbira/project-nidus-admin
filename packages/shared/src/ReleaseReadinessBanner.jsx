import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { PermissionGate } from './PermissionGate.jsx'
import { fetchErrorReadinessSummary } from './dataServices.js'
import {
  buildErrorDashboardFilterLink,
  formatReleaseReadinessMessage,
} from './errorReadinessUtils.js'

export function ReleaseReadinessBanner({
  variant = 'banner',
  reloadKey = 0,
  className = '',
}) {
  const [loading, setLoading] = useState(true)
  const [readiness, setReadiness] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await fetchErrorReadinessSummary()
      if (cancelled) return
      if (fetchError) {
        setError(typeof fetchError === 'string' ? fetchError : fetchError.message || String(fetchError))
        setReadiness(null)
      } else {
        setReadiness(data)
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [reloadKey])

  const message = useMemo(() => (
    readiness ? formatReleaseReadinessMessage(readiness) : ''
  ), [readiness])

  const dashboardLink = buildErrorDashboardFilterLink({
    severity: readiness?.blockingSeverities?.[0] || readiness?.thresholdSeverities?.[0] || 'critical',
  })

  if (loading) {
    return (
      <div className={`rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-500 ${className}`}>
        Checking release readiness…
      </div>
    )
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-200 ${className}`}>
        Release readiness unavailable: {error}
      </div>
    )
  }

  const blocked = readiness?.blocked
  const icon = blocked ? '🔴' : '🟢'

  if (variant === 'card') {
    return (
      <div
        data-testid="release-readiness-banner"
        data-release-ready={blocked ? 'false' : 'true'}
        className={`rounded-lg border p-4 ${
          blocked
            ? 'border-red-800/70 bg-red-950/25'
            : 'border-emerald-800/60 bg-emerald-950/20'
        } ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Release readiness</p>
            <p className={`mt-1 text-lg font-semibold ${blocked ? 'text-red-200' : 'text-emerald-200'}`}>
              {blocked ? 'Blocked' : 'Clear'}
            </p>
            <p className="mt-1 text-sm text-gray-300">{icon} {message}</p>
          </div>
          <Link
            to={dashboardLink}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:border-blue-600 hover:text-blue-200"
          >
            Error dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="release-readiness-banner"
      data-release-ready={blocked ? 'false' : 'true'}
      className={`flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        blocked
          ? 'border-red-800/70 bg-red-950/25 text-red-100'
          : 'border-emerald-800/60 bg-emerald-950/20 text-emerald-100'
      } ${className}`}
    >
      <p className="text-sm">
        <span aria-hidden="true">{icon}</span>{' '}
        <span className="font-medium">{blocked ? 'Not release ready' : 'Release ready'}</span>
        {' — '}
        {message}
      </p>
      <Link
        to={dashboardLink}
        className="shrink-0 text-sm text-blue-300 underline hover:text-blue-200"
      >
        View open errors
      </Link>
    </div>
  )
}

export function ReleaseReadinessBannerGate(props) {
  return (
    <PermissionGate permission="errors.dashboard.view">
      <ReleaseReadinessBanner {...props} />
    </PermissionGate>
  )
}
