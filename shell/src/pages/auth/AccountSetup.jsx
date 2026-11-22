import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminDb } from '../../services/supabase/adminClient.js'
import { validatePassword } from '@nidus-admin/shared'
import { AdminForm, AdminField, inputClass } from '@nidus-admin/ui'

const SETUP_KEY = 'admin-setup-pending'

export default function AccountSetup() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminDb.from('admin_invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) setError('This link is no longer valid.')
        else {
          setInvite(data)
          setFullName(data.email.split('@')[0])
        }
        setLoading(false)
      })
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const pw = validatePassword(password)
    if (!pw.valid) { setError(pw.errors.join('. ')); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    sessionStorage.setItem(SETUP_KEY, JSON.stringify({
      token,
      email: invite.email,
      fullName,
      password,
      targetRole: invite.target_role,
      invitedBy: invite.invited_by,
      inviteId: invite.id,
    }))
    navigate(`/setup/${token}/2fa`)
  }

  if (loading) return <div className="min-h-screen bg-gray-950" />
  if (error && !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
        <p className="text-gray-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md">
        <AdminForm onSubmit={handleSubmit}>
          <AdminField helpKey="admin.admin_invitations.email" htmlFor="fh-admin-invitations-email" label="Email">
            <input id="fh-admin-invitations-email" className={inputClass} value={invite.email} readOnly />
          </AdminField>
          <AdminField helpKey="admin.admin_users.full_name" htmlFor="fh-admin-users-full-name" label="Full name" required>
            <input id="fh-admin-users-full-name" className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </AdminField>
          <AdminField helpKey="admin.admin_users.password" htmlFor="fh-admin-users-password" label="Password" required>
            <input id="fh-admin-users-password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </AdminField>
          <AdminField helpKey="admin.admin_users.confirm_password" htmlFor="fh-admin-users-confirm-password" label="Confirm password" required>
            <input id="fh-admin-users-confirm-password" type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </AdminField>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="w-full rounded bg-gray-700 py-2 text-sm text-white">Continue to 2FA setup</button>
        </AdminForm>
      </div>
    </div>
  )
}
