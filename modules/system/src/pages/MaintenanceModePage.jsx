import { useEffect, useMemo, useState } from 'react'
import {
  activateMaintenanceWindow,
  cancelMaintenanceWindow,
  completeMaintenanceWindow,
  createMaintenanceWindow,
  fetchMaintenanceWindows,
  fetchSystemSettings,
  formatDate,
  toggleMaintenanceMode,
} from '@nidus-admin/shared'
import {
  AdminCard,
  AdminField,
  AdminForm,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const TARGET_OPTIONS = ['platform', 'simulator', 'both']
const EMPTY_WINDOW_FORM = {
  target_system: 'platform',
  message: '',
  scheduled_start: '',
  scheduled_end: '',
}

function parseBooleanSetting(settingsMap, key) {
  return String(settingsMap.get(key) || '').toLowerCase() === 'true'
}

export default function MaintenanceModePage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal: confirmModal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [settingsRows, setSettingsRows] = useState([])
  const [windows, setWindows] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [quickMessage, setQuickMessage] = useState('')
  const [windowForm, setWindowForm] = useState(EMPTY_WINDOW_FORM)

  const loadData = async () => {
    setLoading(true)
    const [settingsRes, windowsRes] = await Promise.all([
      fetchSystemSettings(),
      fetchMaintenanceWindows(),
    ])

    if (settingsRes.error) {
      showError(settingsRes.error.message || String(settingsRes.error))
      setLoading(false)
      return
    }
    if (windowsRes.error) {
      showError(windowsRes.error.message || String(windowsRes.error))
      setLoading(false)
      return
    }

    setSettingsRows(settingsRes.data || [])
    setWindows(windowsRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const settingsMap = useMemo(() => {
    const map = new Map()
    for (const row of settingsRows) map.set(row.setting_key, row.setting_value)
    return map
  }, [settingsRows])

  const platformActive = parseBooleanSetting(settingsMap, 'platform_maintenance_enabled')
  const simulatorActive = parseBooleanSetting(settingsMap, 'simulator_maintenance_enabled')

  const filteredWindows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return windows
    return windows.filter((windowRow) => (
      String(windowRow.target_system || '').toLowerCase().includes(term)
      || String(windowRow.status || '').toLowerCase().includes(term)
      || String(windowRow.message || '').toLowerCase().includes(term)
    ))
  }, [windows, search])

  const handleQuickToggle = async (target, enabled) => {
    setBusy(`quick-${target}-${enabled}`)
    const { error } = await toggleMaintenanceMode(target, enabled, quickMessage.trim())
    setBusy('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(`${target} maintenance ${enabled ? 'enabled' : 'disabled'}.`)
    await loadData()
  }

  const handleSchedule = async (event) => {
    event.preventDefault()
    if (!windowForm.message.trim() || !windowForm.scheduled_start) {
      showError('Message and scheduled start are required.')
      return
    }
    const start = new Date(windowForm.scheduled_start)
    const end = windowForm.scheduled_end ? new Date(windowForm.scheduled_end) : null
    if (end && end <= start) {
      showError('Scheduled end must be after scheduled start.')
      return
    }

    setBusy('schedule')
    const { error } = await createMaintenanceWindow({
      target_system: windowForm.target_system,
      message: windowForm.message.trim(),
      scheduled_start: start.toISOString(),
      scheduled_end: end ? end.toISOString() : null,
    })
    setBusy('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Maintenance window scheduled.')
    setWindowForm(EMPTY_WINDOW_FORM)
    await loadData()
  }

  const runWindowAction = async (actionName, windowId) => {
    setBusy(`${actionName}-${windowId}`)
    let result
    if (actionName === 'activate') result = await activateMaintenanceWindow(windowId)
    if (actionName === 'complete') result = await completeMaintenanceWindow(windowId)
    if (actionName === 'cancel') result = await cancelMaintenanceWindow(windowId)
    setBusy('')
    if (result?.error) {
      showError(result.error.message || String(result.error))
      return
    }
    showSuccess(`Window ${actionName}d.`)
    await loadData()
  }

  if (loading) return <LoadingState message="Loading maintenance mode..." />

  const activeWindows = windows.filter((row) => row.status === 'active').length
  const scheduledWindows = windows.filter((row) => row.status === 'scheduled').length

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Maintenance Mode</h1>
        <p className="text-sm text-gray-500">Quick toggles and scheduled windows for planned downtime.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Platform Mode" value={platformActive ? 'ON' : 'OFF'} className={platformActive ? 'border-yellow-700' : ''} />
        <AdminCard title="Simulator Mode" value={simulatorActive ? 'ON' : 'OFF'} className={simulatorActive ? 'border-yellow-700' : ''} />
        <AdminCard title="Active Windows" value={activeWindows} />
        <AdminCard title="Scheduled Windows" value={scheduledWindows} />
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Quick Toggle</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Message</label>
            <input
              value={quickMessage}
              onChange={(e) => setQuickMessage(e.target.value)}
              placeholder="Optional message shown to users"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            disabled={busy === 'quick-platform-true'}
            onClick={() => handleQuickToggle('platform', true)}
            className="rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-sm text-yellow-200 hover:bg-yellow-900/50 disabled:opacity-60"
          >
            Platform ON
          </button>
          <button
            type="button"
            disabled={busy === 'quick-simulator-true'}
            onClick={() => handleQuickToggle('simulator', true)}
            className="rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-sm text-yellow-200 hover:bg-yellow-900/50 disabled:opacity-60"
          >
            Simulator ON
          </button>
          <button
            type="button"
            disabled={busy === 'quick-both-false'}
            onClick={() => handleQuickToggle('both', false)}
            className="rounded border border-green-700 bg-green-900/30 px-3 py-2 text-sm text-green-200 hover:bg-green-900/50 disabled:opacity-60"
          >
            Turn Both OFF
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Schedule Window</h2>
        <AdminForm onSubmit={handleSchedule} className="mt-3 grid gap-3 lg:grid-cols-4">
          <AdminField label="Target">
            <select
              value={windowForm.target_system}
              onChange={(e) => setWindowForm((prev) => ({ ...prev, target_system: e.target.value }))}
              className={inputClass}
            >
              {TARGET_OPTIONS.map((target) => (
                <option key={target} value={target}>{target}</option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Scheduled Start" required>
            <input
              type="datetime-local"
              value={windowForm.scheduled_start}
              onChange={(e) => setWindowForm((prev) => ({ ...prev, scheduled_start: e.target.value }))}
              className={inputClass}
            />
          </AdminField>
          <AdminField label="Scheduled End">
            <input
              type="datetime-local"
              value={windowForm.scheduled_end}
              onChange={(e) => setWindowForm((prev) => ({ ...prev, scheduled_end: e.target.value }))}
              className={inputClass}
            />
          </AdminField>
          <AdminField label="Message" required>
            <input
              value={windowForm.message}
              onChange={(e) => setWindowForm((prev) => ({ ...prev, message: e.target.value }))}
              className={inputClass}
              placeholder="User-facing maintenance note"
            />
          </AdminField>
          <div className="lg:col-span-4">
            <button
              type="submit"
              disabled={busy === 'schedule'}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {busy === 'schedule' ? 'Scheduling...' : 'Schedule Window'}
            </button>
          </div>
        </AdminForm>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Maintenance Windows</h2>
          <SearchBar value={search} onChange={setSearch} placeholder="Filter by target, status, or message..." />
        </div>
        {!filteredWindows.length ? (
          <EmptyState title="No maintenance windows" description="Scheduled windows will appear here." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
            <table className="min-w-full text-sm text-gray-200">
              <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWindows.map((windowRow) => {
                  const canActivate = !['active', 'completed', 'cancelled'].includes(windowRow.status)
                  const canComplete = !['completed', 'cancelled'].includes(windowRow.status)
                  const canCancel = windowRow.status !== 'completed' && windowRow.status !== 'cancelled'
                  return (
                    <tr key={windowRow.id} className="border-t border-gray-800">
                      <td className="px-4 py-3 text-gray-100">{windowRow.target_system}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${windowRow.status === 'active' ? 'border-yellow-700 bg-yellow-900/40 text-yellow-300' : windowRow.status === 'completed' ? 'border-green-700 bg-green-900/30 text-green-300' : windowRow.status === 'cancelled' ? 'border-red-700 bg-red-900/30 text-red-300' : 'border-blue-700 bg-blue-900/30 text-blue-300'}`}>
                          {windowRow.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        <p>{formatDate(windowRow.scheduled_start)}</p>
                        <p>{formatDate(windowRow.scheduled_end)}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{windowRow.message || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={!canActivate || busy === `activate-${windowRow.id}`}
                            onClick={() => runWindowAction('activate', windowRow.id)}
                            className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-40"
                          >
                            Activate
                          </button>
                          <button
                            type="button"
                            disabled={!canComplete || busy === `complete-${windowRow.id}`}
                            onClick={() => runWindowAction('complete', windowRow.id)}
                            className="rounded border border-green-700 bg-green-900/30 px-2.5 py-1 text-xs text-green-200 hover:bg-green-900/50 disabled:opacity-40"
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            disabled={!canCancel || busy === `cancel-${windowRow.id}`}
                            onClick={() => confirm({
                              title: 'Cancel maintenance window',
                              message: 'Cancel this maintenance window now?',
                              confirmLabel: 'Cancel Window',
                              danger: true,
                              onConfirm: async () => runWindowAction('cancel', windowRow.id),
                            })}
                            className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-40"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmModal}
    </div>
  )
}
