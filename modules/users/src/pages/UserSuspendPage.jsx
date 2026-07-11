import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchUserById, formatDate, suspendPlatformUser, useDisplayId } from '@nidus-admin/shared'
import { AdminBadge, AdminField, AdminForm, EmptyState, inputClass, LoadingState, useToast } from '@nidus-admin/ui'

const SUSPENSION_TYPES = [
  { key: 'standard', label: 'Standard suspension', description: 'Immediate access removal until manually reactivated.' },
  { key: 'investigation', label: 'Under investigation', description: 'Suspension linked to an investigation period with supporting evidence.' },
]

const ACCEPTED_FILE_TYPES = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx'
const DEFAULT_START_TIME = '09:00'

function toIsoDateTime(date, time) {
  if (!date) return null
  const dt = new Date(`${date}T${time || '00:00'}`)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function formatDateTimePreview(date, time) {
  if (!date) return null
  return `${date}${time ? ` at ${time}` : ''}`
}

function formatInvestigationWindow(startDate, startTime, endDate, endTime) {
  const start = formatDateTimePreview(startDate, startTime)
  if (!start) return 'Set start date and time on the form.'
  if (!endDate) return `${start} → open-ended`
  return `${start} → ${formatDateTimePreview(endDate, endTime || '23:59')}`
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UserSuspendPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const { uuid: userId, loading: resolving, error: resolveError } = useDisplayId('public.users', idParam)
  const { showSuccess } = useToast()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [form, setForm] = useState({
    reason: '',
    suspensionType: 'standard',
    startDate: '',
    startTime: DEFAULT_START_TIME,
    endDate: '',
    endTime: '',
  })
  const [files, setFiles] = useState([])

  useEffect(() => {
    if (resolving) return
    if (resolveError) {
      setError(resolveError)
      setUser(null)
      setLoading(false)
      return
    }
    if (!userId) {
      setLoading(false)
      return
    }

    const loadUser = async () => {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await fetchUserById(userId)
      if (fetchError) {
        setError(fetchError.message || String(fetchError))
        setUser(null)
      } else {
        setUser(data)
        if (data?.is_suspended) {
          setError('This user is already suspended.')
        } else if (data && !data.is_active) {
          setError('Only active users can be suspended.')
        }
      }
      setLoading(false)
    }

    loadUser()
  }, [userId, resolving, resolveError])

  const isInvestigation = form.suspensionType === 'investigation'

  const selectedType = useMemo(
    () => SUSPENSION_TYPES.find((type) => type.key === form.suspensionType),
    [form.suspensionType],
  )

  const handleFileChange = (event) => {
    const selected = Array.from(event.target.files || [])
    setFiles(selected)
    event.target.value = ''
  }

  const removeFile = (index) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  const validateForm = () => {
    if (!form.reason.trim()) return 'A suspension reason is required.'
    if (isInvestigation) {
      if (!form.startDate) return 'Start date is required.'
      if (!form.startTime) return 'Start time is required.'
      if (form.endTime && !form.endDate) return 'End date is required when end time is provided.'
      const startAt = toIsoDateTime(form.startDate, form.startTime)
      const endAt = form.endDate ? toIsoDateTime(form.endDate, form.endTime || '23:59') : null
      if (!startAt) return 'Start date and time are invalid.'
      if (endAt && endAt < startAt) {
        return 'End date and time must be on or after the start date and time.'
      }
    }
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user) return

    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSubmitting(true)
    setFormError(null)

    const { error: mutationError } = await suspendPlatformUser(user.id, {
      reason: form.reason.trim(),
      suspensionType: form.suspensionType,
      investigationStart: isInvestigation ? toIsoDateTime(form.startDate, form.startTime) : null,
      investigationEnd: isInvestigation && form.endDate
        ? toIsoDateTime(form.endDate, form.endTime || '23:59')
        : null,
      attachments: files,
    })

    setSubmitting(false)

    if (mutationError) {
      setFormError(mutationError.message || String(mutationError))
      return
    }

    showSuccess(`${user.full_name || user.email} has been suspended.`)
    navigate('/users/user-list')
  }

  if (resolving || loading) return <LoadingState message="Loading user..." />
  if (!userId) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => navigate('/users/user-list')}
          className="mb-4 text-xs text-gray-400 hover:text-gray-200"
        >
          ← Back to users
        </button>
        <EmptyState title="Missing user id" description="Open this page from the user list suspend action." />
      </div>
    )
  }
  if (error && !user) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => navigate('/users/user-list')}
          className="mb-4 text-xs text-gray-400 hover:text-gray-200"
        >
          ← Back to users
        </button>
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <section className="w-full border-b border-gray-800 p-4 md:p-6 lg:w-1/2 lg:border-b-0 lg:border-r">
        <button
          type="button"
          onClick={() => navigate('/users/user-list')}
          className="mb-4 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
        >
          ← Back to users
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-100">Suspend user</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure suspension details for {user.full_name || user.email}.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {error}
          </div>
        )}

        {formError && (
          <div className="mb-4 rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
            {formError}
          </div>
        )}

        <AdminForm onSubmit={handleSubmit} className="space-y-5">
          <AdminField label="Suspension type" required>
            <div className="space-y-2">
              {SUSPENSION_TYPES.map((type) => (
                <label
                  key={type.key}
                  className={`flex cursor-pointer gap-3 rounded border px-3 py-3 transition ${
                    form.suspensionType === type.key
                      ? 'border-orange-600 bg-orange-900/20'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="suspensionType"
                    value={type.key}
                    checked={form.suspensionType === type.key}
                    onChange={() => setForm((prev) => ({
                      ...prev,
                      suspensionType: type.key,
                      startTime: type.key === 'investigation' && !prev.startTime ? DEFAULT_START_TIME : prev.startTime,
                    }))}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-100">{type.label}</span>
                    <span className="block text-xs text-gray-500">{type.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </AdminField>

          {isInvestigation && (
            <div className="space-y-4 rounded border border-gray-800 bg-gray-900/40 p-4">
              <p className="text-sm font-medium text-gray-200">Investigation period</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="Start date" required>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.startDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  />
                </AdminField>
                <AdminField label="Start time" required>
                  <input
                    type="time"
                    className={inputClass}
                    value={form.startTime}
                    onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                  />
                </AdminField>
                <AdminField label="End date">
                  <input
                    type="date"
                    className={inputClass}
                    min={form.startDate || undefined}
                    value={form.endDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  />
                </AdminField>
                <AdminField label="End time">
                  <input
                    type="time"
                    className={inputClass}
                    value={form.endTime}
                    disabled={!form.endDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                  />
                </AdminField>
              </div>
              <p className="text-xs text-gray-500">End date and time are optional. Leave blank for an open-ended investigation.</p>
            </div>
          )}

          <AdminField label="Reason" required>
            <textarea
              rows={4}
              className={inputClass}
              placeholder="Describe why this user is being suspended..."
              value={form.reason}
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
            />
          </AdminField>

          <AdminField label="Supporting documents or images">
            <div className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded border border-dashed border-gray-600 bg-gray-900/60 px-4 py-6 text-center hover:border-gray-500">
                <span className="text-sm text-gray-300">Click to attach files</span>
                <span className="mt-1 text-xs text-gray-500">Images, PDF, or Word documents · up to 5 files · 10 MB each</span>
                <input
                  type="file"
                  multiple
                  accept={ACCEPTED_FILE_TYPES}
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="truncate text-gray-200">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-xs text-red-300 hover:text-red-200"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AdminField>

          <div className="flex flex-wrap gap-3 border-t border-gray-800 pt-4">
            <button
              type="button"
              onClick={() => navigate('/users/user-list')}
              className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || Boolean(error)}
              className="rounded border border-red-700 bg-red-900/50 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Suspending…' : 'Confirm suspension'}
            </button>
          </div>
        </AdminForm>
      </section>

      <aside className="w-full bg-gray-950/40 p-4 md:p-6 lg:w-1/2">
        <p className="text-xs uppercase tracking-wide text-gray-500">User summary</p>
        <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="text-lg font-semibold text-gray-100">{user.full_name || '—'}</h2>
          <p className="text-sm text-gray-400">{user.email}</p>
          <div className="mt-3">
            <AdminBadge
              label={user.is_active ? 'Active' : 'Inactive'}
              variant={user.is_active ? 'active' : 'inactive'}
            />
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm">
          <div className="rounded border border-gray-800 bg-gray-900/70 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">Selected action</p>
            <p className="mt-1 text-gray-200">{selectedType?.label}</p>
          </div>
          {isInvestigation && (
            <div className="rounded border border-gray-800 bg-gray-900/70 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-gray-500">Investigation window</p>
              <p className="mt-1 text-gray-200">
                {formatInvestigationWindow(form.startDate, form.startTime, form.endDate, form.endTime)}
              </p>
            </div>
          )}
          <div className="rounded border border-gray-800 bg-gray-900/70 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">Last login</p>
            <p className="mt-1 text-gray-200">{formatDate(user.last_login_at)}</p>
          </div>
          <div className="rounded border border-gray-800 bg-gray-900/70 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">Attachments</p>
            <p className="mt-1 text-gray-200">
              {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No files attached yet'}
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
