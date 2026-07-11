import { useEffect, useState } from 'react'
import { getEmailProviderConfig, getEmailSenderProfiles } from '@nidus-admin/shared'
import { AdminCard, LoadingState } from '@nidus-admin/ui'

export default function EmailProviderConfigPage() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState(null)
  const [profiles, setProfiles] = useState([])

  useEffect(() => {
    Promise.all([getEmailProviderConfig(), getEmailSenderProfiles()]).then(([c, p]) => {
      setConfig(c.data || null)
      setProfiles(Array.isArray(p.data) ? p.data : [])
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingState message="Loading email provider..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Email Provider</h1>
        <p className="text-sm text-gray-500">
          Read-only view of Platform email configuration. Changes are made in the Platform app Email Settings.
        </p>
      </div>

      {!config?.id ? (
        <p className="text-amber-300">No active email configuration found. Configure a provider in Platform Settings.</p>
      ) : (
        <AdminCard title="Active provider">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500">Name</dt><dd className="text-gray-100">{config.config_name}</dd></div>
            <div><dt className="text-gray-500">Provider</dt><dd className="text-gray-100">{config.service_provider}</dd></div>
            <div><dt className="text-gray-500">From</dt><dd className="text-gray-100">{config.from_name} &lt;{config.from_email}&gt;</dd></div>
            <div><dt className="text-gray-500">Daily limit</dt><dd className="text-gray-100">{config.daily_send_limit ?? '—'}</dd></div>
            <div><dt className="text-gray-500">Monthly limit</dt><dd className="text-gray-100">{config.monthly_send_limit ?? '—'}</dd></div>
            <div><dt className="text-gray-500">Status</dt><dd className="text-gray-100">{config.is_active ? 'Active' : 'Inactive'}</dd></div>
          </dl>
        </AdminCard>
      )}

      <AdminCard title="Sender profiles">
        {!profiles.length ? (
          <p className="text-sm text-gray-500">No sender profiles configured.</p>
        ) : (
          <ul className="divide-y divide-gray-800 text-sm">
            {profiles.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span className="text-gray-200">{p.profile_name}{p.is_default ? ' (default)' : ''}</span>
                <span className="text-gray-500">{p.from_name} &lt;{p.from_email}&gt;</span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  )
}
