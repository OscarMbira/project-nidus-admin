import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminDb } from '../../services/supabase/adminClient.js'
import {
  generateTotpSecret,
  generateQrDataUrl,
  verifyTotpCode,
  generateBackupCodes,
  saveBackupCodes,
  saveTotpSecret,
} from '../../services/twoFactorService.js'
import { AdminForm, AdminField, inputClass } from '@nidus-admin/ui'

const SETUP_KEY = 'admin-setup-pending'

export default function TwoFactorSetup() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [setup, setSetup] = useState(null)
  const [secret, setSecret] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState(null)
  const [savedCodes, setSavedCodes] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem(SETUP_KEY)
    if (!raw) {
      setError('This link is no longer valid.')
      setLoading(false)
      return
    }
    const parsed = JSON.parse(raw)
    if (parsed.token !== token) {
      setError('This link is no longer valid.')
      setLoading(false)
      return
    }
    setSetup(parsed)
    const { secret: s, otpauth } = generateTotpSecret(parsed.email)
    setSecret(s)
    generateQrDataUrl(otpauth).then(setQrUrl)
    setLoading(false)
  }, [token])

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!(await verifyTotpCode(secret, code))) {
      setError('Invalid code. Check your authenticator app and try again.')
      return
    }
    setError('')
    setBackupCodes(generateBackupCodes(10))
  }

  const handleComplete = async () => {
    if (!savedCodes) {
      setError('Confirm you have saved your recovery codes.')
      return
    }

    const { data: authData, error: authErr } = await adminDb.auth.signUp({
      email: setup.email,
      password: setup.password,
    })
    if (authErr && !authErr.message?.includes('already')) {
      setError('Unable to complete setup.')
      return
    }

    let authUserId = authData?.user?.id
    if (!authUserId) {
      const { data: signIn } = await adminDb.auth.signInWithPassword({
        email: setup.email,
        password: setup.password,
      })
      authUserId = signIn?.user?.id
    }

    const { data: adminRow, error: insertErr } = await adminDb.from('admin_users').insert({
      auth_user_id: authUserId,
      email: setup.email,
      full_name: setup.fullName,
      role: setup.targetRole,
      activation_status: 'pending_activation',
      created_by: setup.invitedBy,
      is_2fa_configured: true,
      totp_secret: secret,
      registration_ip: null,
    }).select('id').single()

    if (insertErr) {
      setError('Unable to complete setup.')
      return
    }

    await saveBackupCodes(adminRow.id, backupCodes)
    await adminDb.from('admin_invitations').update({
      status: 'used',
      used_at: new Date().toISOString(),
    }).eq('id', setup.inviteId)

    await adminDb.auth.signOut()
    sessionStorage.removeItem(SETUP_KEY)
    navigate('/pending-activation')
  }

  if (loading) return <div className="min-h-screen bg-gray-950" />
  if (error && !setup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
        <p className="text-gray-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {!backupCodes ? (
          <>
            <p className="text-sm text-gray-400">Scan this QR code with your authenticator app, then enter the 6-digit code.</p>
            {qrUrl && <img src={qrUrl} alt="2FA QR" className="mx-auto rounded border border-gray-700" />}
            <p className="break-all text-center text-xs text-gray-500">Manual key: {secret}</p>
            <AdminForm onSubmit={handleVerify}>
              <AdminField label="Verification code" required>
                <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
              </AdminField>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button type="submit" className="w-full rounded bg-gray-700 py-2 text-sm text-white">Verify 2FA</button>
            </AdminForm>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-300">Save these recovery codes. Each can be used once.</p>
            <div className="rounded border border-gray-700 bg-gray-900 p-4 font-mono text-sm text-gray-200">
              {backupCodes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={savedCodes} onChange={(e) => setSavedCodes(e.target.checked)} />
              I have saved my recovery codes
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="button" onClick={handleComplete} className="w-full rounded bg-gray-700 py-2 text-sm text-white">Complete setup</button>
          </>
        )}
      </div>
    </div>
  )
}
