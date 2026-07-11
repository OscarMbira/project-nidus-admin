import { useEffect, useState } from 'react'
import { getAdminDb } from '@nidus-admin/shared'
import { AdminCard, EmptyState, LoadingState } from '@nidus-admin/ui'

export default function SystemHealthPage() {
  const [loading, setLoading] = useState(true)
  const [dbStatus, setDbStatus] = useState('unknown')
  const [checkedAt, setCheckedAt] = useState('')
  const [errorText, setErrorText] = useState('')

  const checkHealth = async () => {
    setLoading(true)
    setErrorText('')
    const db = getAdminDb()
    if (!db) {
      setDbStatus('disconnected')
      setErrorText('Database not configured')
      setCheckedAt(new Date().toISOString())
      setLoading(false)
      return
    }

    const { error } = await db.from('system_settings').select('id').limit(1)
    setDbStatus(error ? 'degraded' : 'connected')
    if (error) setErrorText(error.message || String(error))
    setCheckedAt(new Date().toISOString())
    setLoading(false)
  }

  useEffect(() => {
    checkHealth()
  }, [])

  if (loading) return <LoadingState message="Checking system health..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">System Health</h1>
          <p className="text-sm text-gray-500">Read-only health stub for phase rollout.</p>
        </div>
        <button
          type="button"
          onClick={checkHealth}
          className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminCard
          title="Admin DB Connection"
          value={dbStatus}
          className={dbStatus === 'connected' ? 'border-green-700' : dbStatus === 'degraded' ? 'border-yellow-700' : 'border-red-700'}
        />
        <AdminCard title="Last Checked" value={checkedAt ? new Date(checkedAt).toLocaleString() : '—'} />
        <AdminCard title="Route Mode" value="Read-only stub" />
      </div>

      {errorText ? (
        <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 p-4 text-sm text-yellow-200">{errorText}</div>
      ) : (
        <EmptyState title="No additional checks yet" description="This page intentionally remains a read-only health placeholder." />
      )}
    </div>
  )
}
