import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { inviteAdminUser, sendAdminInvitationEmail } from '@nidus-admin/shared'
import { AdminField, AdminForm, inputClass, useToast, DetailAuditTabList } from '@nidus-admin/ui'

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
  const [detailTab, setDetailTab] = useState('details')
  const [failedLink, setFailedLink] = useState(null)

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
    const { data: invitationId, error } = await inviteAdminUser(email.trim(), targetRole, customMessage.trim(), Number(expiryHours))
    // Already invited (the admin record exists, or a pending invitation does): email the pending invitation's link
    // again instead of failing. If nothing is pending (e.g. the admin is already active), show the original message.
    const message = error ? (error.message || String(error)) : ''
    const resend = Boolean(error) && /pending invitation already exists|admin user already exists/i.test(message)
    if (error && !resend) {
      setSubmitting(false)
      showError(message)
      return
    }

    // The invitation exists; now email the account-setup link (Admin SQL v269).
    const sent = await sendAdminInvitationEmail(resend ? email.trim() : invitationId)
    setSubmitting(false)
    if (resend && sent.error && !sent.link) {
      showError(message)
      return
    }
    if (sent.error) {
      setFailedLink(sent.link)
      showError(`The invitation was created, but the email could not be sent: ${sent.error}${sent.link ? ' Copy the setup link below and send it yourself.' : ''}`)
      return
    }

    showSuccess(resend ? `The pending invitation was emailed again to ${email.trim()}.` : `Invitation emailed to ${email.trim()}.`)
    navigate('../admin-user-list', { relative: 'path' })
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Invite Admin User</h1>
        <p className="text-sm text-gray-500">Create a role-scoped invitation for a new admin account.</p>
      </div>

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this invitation is sent.</p>
      )}

      {detailTab === 'details' && (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-5">
        <AdminForm onSubmit={handleSubmit} className="space-y-5">
          <AdminField helpKey="admin.admin_invitations.email" htmlFor="fh-admin-invitations-email" label="Email" required error={errors.email}>
            <input id="fh-admin-invitations-email"
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
            />
          </AdminField>

          <AdminField helpKey="admin.admin_invitations.target_role" htmlFor="fh-admin-invitations-target-role" label="Target Role" required error={errors.targetRole}>
            <select id="fh-admin-invitations-target-role"
              className={inputClass}
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </AdminField>

          <AdminField helpKey="admin.admin_invitations.custom_message" htmlFor="fh-admin-invitations-custom-message" label="Custom Message">
            <textarea id="fh-admin-invitations-custom-message"
              className={inputClass}
              rows={4}
              value={customMessage}
              onChange={(event) => setCustomMessage(event.target.value)}
              placeholder="Optional message included with the invite."
            />
          </AdminField>

          <AdminField helpKey="admin.admin_invitations.expiry_hours" htmlFor="fh-admin-invitations-expiry-hours" label="Expiry (hours)" required error={errors.expiryHours}>
            <input id="fh-admin-invitations-expiry-hours"
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
          {failedLink && (
            <div role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              <p className="mb-1 font-medium">Account setup link (send it to the invitee):</p>
              <code className="break-all">{failedLink}</code>
            </div>
          )}
        </AdminForm>
      </div>
      )}
    </div>
  )
}
