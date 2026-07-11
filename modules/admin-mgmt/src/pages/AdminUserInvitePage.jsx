import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { inviteAdminUser } from '@nidus-admin/shared'
import { AdminField, AdminForm, inputClass, useToast } from '@nidus-admin/ui'

const INVITABLE_ROLES = [
  { value: 'system_admin', label: 'System Admin' },
  { value: 'support_admin', label: 'Support Admin' },
  { value: 'content_admin', label: 'Content Admin' },
]

export default function AdminUserInvitePage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()

  const [email, setEmail] = useState('')
  const [targetRole, setTargetRole] = useState('system_admin')
  const [customMessage, setCustomMessage] = useState('')
  const [expiryHours, setExpiryHours] = useState(72)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})

  const validate = () => {
    const nextErrors = {}
    if (!email.trim()) nextErrors.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!INVITABLE_ROLES.some((role) => role.value === targetRole)) nextErrors.targetRole = 'Select a valid role.'
    const parsedExpiry = Number(expiryHours)
    if (!Number.isFinite(parsedExpiry) || parsedExpiry <= 0 || parsedExpiry > 720) {
      nextErrors.expiryHours = 'Expiry must be between 1 and 720 hours.'
    }
    return nextErrors
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    const { error } = await inviteAdminUser(email.trim(), targetRole, customMessage.trim(), Number(expiryHours))
    setSubmitting(false)

    if (error) {
      showError(error.message || String(error))
      return
    }

    showSuccess('Admin invitation sent successfully.')
    navigate('../admin-user-list', { relative: 'path' })
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Invite Admin User</h1>
        <p className="text-sm text-gray-500">Create a role-scoped invitation for a new admin account.</p>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-5">
        <AdminForm onSubmit={handleSubmit} className="space-y-5">
          <AdminField label="Email" required error={errors.email}>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
            />
          </AdminField>

          <AdminField label="Target Role" required error={errors.targetRole}>
            <select
              className={inputClass}
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </AdminField>

          <AdminField label="Custom Message">
            <textarea
              className={inputClass}
              rows={4}
              value={customMessage}
              onChange={(event) => setCustomMessage(event.target.value)}
              placeholder="Optional message included with the invite."
            />
          </AdminField>

          <AdminField label="Expiry (hours)" required error={errors.expiryHours}>
            <input
              type="number"
              min={1}
              max={720}
              className={inputClass}
              value={expiryHours}
              onChange={(event) => setExpiryHours(event.target.value)}
            />
          </AdminField>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded border border-blue-700 bg-blue-900/40 px-4 py-2 text-sm text-blue-200 hover:bg-blue-900/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Sending Invite...' : 'Send Invite'}
            </button>
            <button
              type="button"
              disabled={submitting}
              className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => navigate('../admin-user-list', { relative: 'path' })}
            >
              Cancel
            </button>
          </div>
        </AdminForm>
      </div>
    </div>
  )
}
