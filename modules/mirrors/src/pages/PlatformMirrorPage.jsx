import { useAdminListPage, fetchPlatformMirrorMenuItems } from '@nidus-admin/shared'
import { AdminTable, AdminCard, LoadingState, EmptyState } from '@nidus-admin/ui'

const MIRROR_COLUMNS = [
  { key: 'menu_code', label: 'Menu Code' },
  { key: 'menu_label', label: 'Label' },
  { key: 'route_path', label: 'Route' },
  { key: 'menu_level', label: 'Level' },
  { key: 'methodology', label: 'Methodology' },
  { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
]

export default function PlatformMirrorPage() {
  const { rows, loading, error } = useAdminListPage({
    fetchFn: fetchPlatformMirrorMenuItems,
    storageKey: 'admin-mirrors-PlatformMirrorPage',
  })

  if (loading) return <LoadingState message="Loading Platform Mirror..." />
  if (error) return <div className="text-red-400 p-4">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-gray-100">Platform Mirror</h1>
        <span className="text-sm text-gray-500">Live platform menu structure (non-simulator routes)</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total" value={rows.length} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No records" description="Run platform:seed-admin-console after v60 RLS migration." />
      ) : (
        <AdminTable columns={MIRROR_COLUMNS} rows={rows} />
      )}
    </div>
  )
}
