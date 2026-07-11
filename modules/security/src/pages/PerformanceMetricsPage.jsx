import { useState, useEffect } from 'react'
import { AdminTable, AdminCard, LoadingState, EmptyState } from '@nidus-admin/ui'

export default function PerformanceMetricsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(false)
    setRows([])
  }, [])

  if (loading) return <LoadingState message="Loading Performance Metrics..." />
  if (error) return <div className="text-red-400 p-4">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-gray-100">Performance Metrics</h1>
        <span className="text-sm text-gray-500">Security module</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total" value={rows.length} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No records" description="Data will appear here once loaded from the database." />
      ) : (
        <AdminTable columns={[{ key: 'id', label: 'ID' }]} rows={rows} />
      )}
    </div>
  )
}
