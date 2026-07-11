import { useEffect, useState } from 'react'
import { fetchTcSettings, upsertTcSetting } from '@nidus-admin/shared'
import { AdminField, AdminForm, inputClass, LoadingState, useToast } from '@nidus-admin/ui'

export default function SettingsPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState([])

  useEffect(() => {
    fetchTcSettings().then(({ data }) => {
      setSettings(data || [])
      setLoading(false)
    })
  }, [])

  const update = async (key, value) => {
    const row = settings.find((s) => s.setting_key === key)
    const { error } = await upsertTcSetting(key, value, row?.setting_type || 'text', row?.description)
    if (error) showError(error)
    else showSuccess('Setting saved.')
  }

  if (loading) return <LoadingState message="Loading settings..." />

  const byKey = Object.fromEntries(settings.map((s) => [s.setting_key, s.setting_value]))

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-100">Testing Centre Settings</h1>
      <AdminForm onSubmit={(e) => e.preventDefault()}>
        {settings.map((s) => (
          <AdminField key={s.setting_key} label={s.setting_key}>
            <div className="flex gap-2">
              <input
                className={inputClass}
                defaultValue={s.setting_value || ''}
                onBlur={(e) => update(s.setting_key, e.target.value)}
              />
            </div>
            {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
          </AdminField>
        ))}
      </AdminForm>
      <p className="text-xs text-gray-600">Local URL: {byKey['tc.env.local_url'] || '—'}</p>
    </div>
  )
}
