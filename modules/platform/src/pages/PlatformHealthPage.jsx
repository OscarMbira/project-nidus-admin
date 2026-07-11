import { useAdminListPage, fetchSystemSettingsByCategory } from '@nidus-admin/shared'
import { AdminTable, AdminCard, LoadingState, EmptyState, AdminBadge } from '@nidus-admin/ui'

const healthVariant = (value) => {
  const v = String(value || '').toLowerCase()
  if (v === 'healthy') return 'success'
  if (v === 'degraded') return 'pending'
  if (v === 'down') return 'failed'
  return 'active'
}

export default function PlatformHealthPage() {
  const { rows, loading, error } = useAdminListPage({
    fetchFn: () => fetchSystemSettingsByCategory('platform_health'),
    storageKey: 'admin-platform-PlatformHealthPage',
  })

  if (loading) return <LoadingState message="Loading Platform Health..." />
  if (error) return <div className="text-red-400 p-4">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-gray-100">Platform Health</h1>
        <span className="text-sm text-gray-500">Service probe status from admin.system_settings</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Checks" value={rows.length} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No records" description="Run admin:seed-platform-admin-console to load health probes." />
      ) : (
        <AdminTable
          columns={[
            { key: 'setting_key', label: 'Service' },
            {
              key: 'setting_value',
              label: 'Status',
              render: (r) => (
                r.setting_key === 'platform.health.last_checked_at'
                  ? r.setting_value
                  : <AdminBadge label={r.setting_value} variant={healthVariant(r.setting_value)} />
              ),
            },
            { key: 'description', label: 'Description' },
          ]}
          rows={rows}
        />
      )}
    </div>
  )
}
