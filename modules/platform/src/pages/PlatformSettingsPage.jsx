import { useAdminListPage, fetchSystemSettingsByCategory } from '@nidus-admin/shared'
import { AdminTable, AdminCard, LoadingState, EmptyState } from '@nidus-admin/ui'

export default function PlatformSettingsPage() {
  const { rows, loading, error } = useAdminListPage({
    fetchFn: () => fetchSystemSettingsByCategory('platform'),
    storageKey: 'admin-platform-PlatformSettingsPage',
  })

  if (loading) return <LoadingState message="Loading Platform Settings..." />
  if (error) return <div className="text-red-400 p-4">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-gray-100">Platform Settings</h1>
        <span className="text-sm text-gray-500">Platform Admin module</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total" value={rows.length} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No records" description="Run admin:seed-platform-admin-console to load demo settings." />
      ) : (
        <AdminTable
          columns={[
            { key: 'setting_key', label: 'Key' },
            { key: 'setting_value', label: 'Value' },
            { key: 'setting_type', label: 'Type' },
            { key: 'description', label: 'Description' },
          ]}
          rows={rows}
        />
      )}
    </div>
  )
}
