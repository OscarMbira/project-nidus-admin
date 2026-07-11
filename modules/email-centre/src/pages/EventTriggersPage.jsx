import { useEffect, useState } from 'react'
import {
  fetchEmailEventTriggers,
  fireEmailEvent,
  updateEmailEventTrigger,
  useCurrentAdmin,
} from '@nidus-admin/shared'
import { AdminBadge, EmptyState, LoadingState, useToast } from '@nidus-admin/ui'

export default function EventTriggersPage() {
  const { showSuccess, showError } = useToast()
  const { adminUser } = useCurrentAdmin()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchEmailEventTriggers()
    if (error) showError(error.message || String(error))
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggle = async (row) => {
    setBusy(row.event_type)
    const { error } = await updateEmailEventTrigger(row.event_type, { is_active: !row.is_active })
    setBusy('')
    if (error) showError(error.message || String(error))
    else {
      showSuccess(`Trigger ${row.is_active ? 'disabled' : 'enabled'}.`)
      load()
    }
  }

  const testFire = async (row) => {
    if (!adminUser?.email) {
      showError('No admin email on session.')
      return
    }
    setBusy(row.event_type)
    const { error } = await fireEmailEvent(row.event_type, adminUser.email, {
      first_name: adminUser.full_name?.split(' ')[0] || 'Admin',
      platform_name: 'Project Nidus',
      rejection_reason: 'Test only',
      amount: '0.00',
      currency: '$',
    })
    setBusy('')
    if (error) showError(error.message || String(error))
    else showSuccess('Test email dispatched.')
  }

  if (loading) return <LoadingState message="Loading event triggers..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Event Triggers</h1>
        <p className="text-sm text-gray-500">Automatic emails fired after admin actions or scheduled jobs.</p>
      </div>

      {!rows.length ? (
        <EmptyState title="No triggers" description="Run admin:seed-email-data to load defaults." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Delay (h)</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.event_type}</p>
                    <p className="text-xs text-gray-500">{row.description}</p>
                  </td>
                  <td className="px-4 py-3">{row.template_key}</td>
                  <td className="px-4 py-3">
                    <AdminBadge label={row.is_active ? 'active' : 'inactive'} variant={row.is_active ? 'active' : 'suspended'} />
                  </td>
                  <td className="px-4 py-3">{row.delay_hours}</td>
                  <td className="px-4 py-3 space-x-2">
                    <button type="button" disabled={busy === row.event_type} className="text-blue-400 hover:underline" onClick={() => toggle(row)}>
                      {row.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" disabled={busy === row.event_type} className="text-green-400 hover:underline" onClick={() => testFire(row)}>Test fire</button>
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
