import { useEffect, useMemo, useState } from 'react'
import {
  deleteCalendarEntry,
  fetchBusinessCalendar,
  upsertCalendarEntry,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminModal,
  EmptyState,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const DAY_TYPE_STYLES = {
  working: 'bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800',
  weekend: 'bg-blue-950/60 border-blue-800 text-blue-200 hover:bg-blue-900/50',
  holiday: 'bg-red-950/60 border-red-800 text-red-200 hover:bg-red-900/50',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function padDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function inferDayType(dateStr, entry) {
  if (entry?.day_type) return entry.day_type
  const day = new Date(`${dateStr}T12:00:00`).getDay()
  return day === 0 || day === 6 ? 'weekend' : 'working'
}

export default function BusinessCalendarPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [form, setForm] = useState({ day_type: 'holiday', holiday_name: '', country_code: 'ZA' })
  const [saving, setSaving] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [entryTab, setEntryTab] = useState('details')

  const monthRange = useMemo(() => {
    const start = padDate(viewYear, viewMonth, 1)
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate()
    const end = padDate(viewYear, viewMonth, lastDay)
    return { start, end, lastDay }
  }, [viewYear, viewMonth])

  const entryMap = useMemo(
    () => Object.fromEntries(entries.map((entry) => [entry.calendar_date, entry])),
    [entries],
  )

  const loadCalendar = async () => {
    setLoading(true)
    const { data, error } = await fetchBusinessCalendar(monthRange.start, monthRange.end)
    if (error) {
      showError(typeof error === 'string' ? error : error.message || 'Failed to load calendar.')
      setLoading(false)
      return
    }
    setEntries(data || [])
    setLoading(false)
  }

  useEffect(() => { loadCalendar() }, [monthRange.start, monthRange.end])

  const calendarCells = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay()
    const cells = []
    for (let i = 0; i < firstDow; i += 1) cells.push(null)
    for (let day = 1; day <= monthRange.lastDay; day += 1) {
      const dateStr = padDate(viewYear, viewMonth, day)
      const entry = entryMap[dateStr]
      const dayType = inferDayType(dateStr, entry)
      cells.push({ day, dateStr, entry, dayType })
    }
    return cells
  }, [viewYear, viewMonth, monthRange.lastDay, entryMap])

  const openDate = (cell) => {
    setSelectedDate(cell.dateStr)
    setSelectedEntry(cell.entry || null)
    setEntryTab('details')
    setForm({
      day_type: cell.entry?.day_type || cell.dayType,
      holiday_name: cell.entry?.holiday_name || '',
      country_code: cell.entry?.country_code || 'ZA',
    })
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!selectedDate) return
    setSaving(true)
    const { error } = await upsertCalendarEntry(
      selectedDate,
      form.day_type,
      form.day_type === 'holiday' ? form.holiday_name : null,
      form.country_code,
    )
    setSaving(false)
    if (error) {
      showError(typeof error === 'string' ? error : error.message || 'Failed to save entry.')
      return
    }
    showSuccess('Calendar entry saved.')
    setSelectedDate(null)
    await loadCalendar()
  }

  const handleDelete = () => {
    if (!selectedDate) return
    confirm({
      title: 'Remove calendar entry?',
      message: `Delete override for ${selectedDate}. The day will revert to default weekend/working rules.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const { error } = await deleteCalendarEntry(selectedDate)
        if (error) {
          showError(typeof error === 'string' ? error : error.message || 'Failed to delete entry.')
          return
        }
        showSuccess('Calendar entry removed.')
        setSelectedDate(null)
        await loadCalendar()
      },
    })
  }

  const shiftMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  if (loading) return <LoadingState message="Loading business calendar..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Business Calendar</h1>
          <p className="text-sm text-gray-500">Configure working days, weekends, and public holidays for COB processing.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800">←</button>
          <span className="min-w-[160px] text-center text-sm font-medium text-gray-200">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800">→</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-gray-600 bg-gray-900" /> Working</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-blue-800 bg-blue-950/60" /> Weekend</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-red-800 bg-red-950/60" /> Holiday</span>
      </div>

      {!calendarCells.length ? (
        <EmptyState title="No calendar data" description="Unable to render the calendar grid." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs uppercase text-gray-500">
            {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarCells.map((cell, index) => (
              cell ? (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => openDate(cell)}
                  className={`min-h-[72px] rounded border p-2 text-left text-sm transition ${DAY_TYPE_STYLES[cell.dayType]}`}
                >
                  <div className="font-medium">{cell.day}</div>
                  {cell.entry?.holiday_name && (
                    <div className="mt-1 truncate text-xs opacity-80">{cell.entry.holiday_name}</div>
                  )}
                </button>
              ) : (
                <div key={`blank-${index}`} className="min-h-[72px]" />
              )
            ))}
          </div>
        </div>
      )}

      <AdminModal
        open={Boolean(selectedDate)}
        title={`Calendar Entry — ${selectedDate || ''}`}
        onClose={() => setSelectedDate(null)}
      >
        <div className="mb-3">
          <DetailAuditTabList activeTab={entryTab} onChange={setEntryTab} />
        </div>

        {entryTab === 'audit' && !selectedEntry && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this entry is saved.</p>
        )}

        {entryTab === 'audit' && selectedEntry && (
          <AuditDetailsPanel description="Who created this calendar override, and how it is classified.">
            <AuditCard title="Identity" description="How this entry is labelled.">
              <AuditField label="Date" value={selectedEntry.calendar_date} />
              <AuditField label="Holiday name" value={selectedEntry.holiday_name} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this entry sits.">
              <AuditField label="Day type" value={selectedEntry.day_type} />
              <AuditField label="Country code" value={selectedEntry.country_code} />
            </AuditCard>
            <AuditCard title="Record history" description="When this entry was created.">
              <AuditField label="Created by" value={selectedEntry.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={selectedEntry.created_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {entryTab === 'details' && (
        <AdminForm onSubmit={handleSave} className="mt-2 space-y-3">
          <AdminField label="Day Type" required>
            <select
              className={inputClass}
              value={form.day_type}
              onChange={(e) => setForm((prev) => ({ ...prev, day_type: e.target.value }))}
            >
              <option value="working">Working</option>
              <option value="weekend">Weekend</option>
              <option value="holiday">Holiday</option>
            </select>
          </AdminField>
          {form.day_type === 'holiday' && (
            <AdminField label="Holiday Name">
              <input
                className={inputClass}
                value={form.holiday_name}
                onChange={(e) => setForm((prev) => ({ ...prev, holiday_name: e.target.value }))}
                placeholder="e.g. Christmas Day"
              />
            </AdminField>
          )}
          <AdminField label="Country Code">
            <input
              className={inputClass}
              value={form.country_code}
              maxLength={2}
              onChange={(e) => setForm((prev) => ({ ...prev, country_code: e.target.value.toUpperCase() }))}
            />
          </AdminField>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/30"
            >
              Remove Entry
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelectedDate(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
              <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {modal}
    </div>
  )
}
