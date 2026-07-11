import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getAffiliateApplyPageUrl,
  PermissionGate,
  systemLabel,
} from '@nidus-admin/shared'

export default function AffiliateLandingPreviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSystem = searchParams.get('system') === 'simulator' ? 'simulator' : 'platform'
  const [system, setSystem] = useState(initialSystem)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  useEffect(() => {
    setSearchParams({ system }, { replace: true })
  }, [system, setSearchParams])

  useEffect(() => {
    setIframeLoaded(false)
    setIframeError(false)
  }, [system])

  const previewUrl = useMemo(() => getAffiliateApplyPageUrl(system), [system])

  return (
    <PermissionGate permission="affiliate:view">
      <div className="flex h-[calc(100vh-4rem)] flex-col p-4 md:p-6">
        <div className="mb-4 flex shrink-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to="/affiliates/applications"
              className="mb-2 inline-block text-xs text-gray-400 hover:text-gray-200"
            >
              ← Back to applications
            </Link>
            <h1 className="text-2xl font-semibold text-gray-100">Affiliate Apply Page Preview</h1>
            <p className="text-sm text-gray-500">
              Live user-facing application screen for {systemLabel(system)} — same page partners see when applying.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              Open in new tab
            </a>
          </div>
        </div>

        <div className="mb-3 flex shrink-0 flex-wrap gap-2">
          {['platform', 'simulator'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSystem(value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                system === value
                  ? value === 'simulator'
                    ? 'border-rose-500 bg-rose-600/20 text-rose-200'
                    : 'border-violet-500 bg-violet-600/20 text-violet-200'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {systemLabel(value)}
            </button>
          ))}
        </div>

        <div className="mb-3 shrink-0 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          This embeds the live {systemLabel(system)} affiliate page. Form submissions create real pending applications
          in the queue — use test data only, or open in a separate browser profile if you need to submit a sample.
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-700 bg-gray-950">
          {!iframeLoaded && !iframeError && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
              Loading {systemLabel(system)} apply page…
            </div>
          )}
          {iframeError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-gray-400">
                Could not embed the page (the app may block iframes). Use Open in new tab instead.
              </p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-blue-600 bg-blue-900/40 px-4 py-2 text-sm text-blue-200 hover:bg-blue-900/60"
              >
                Open {systemLabel(system)} apply page
              </a>
            </div>
          )}
          <iframe
            key={previewUrl}
            title={`${systemLabel(system)} affiliate application preview`}
            src={previewUrl}
            className="h-full w-full border-0 bg-white"
            onLoad={() => {
              setIframeLoaded(true)
              setIframeError(false)
            }}
            onError={() => setIframeError(true)}
          />
        </div>

        <p className="mt-2 shrink-0 text-xs text-gray-600">
          URL: <span className="font-mono text-gray-500">{previewUrl}</span>
        </p>
      </div>
    </PermissionGate>
  )
}
