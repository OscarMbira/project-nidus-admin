import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext.jsx'
import {
  generateTotpSecret,
  generateQrDataUrl,
  verifyTotpCode,
  generateBackupCodes,
  saveBackupCodes,
  saveTotpSecret,
} from '../../services/twoFactorService.js'
import { AdminForm, AdminField, inputClass } from '@nidus-admin/ui'

/** Mandatory 2FA configuration for active admins who have not yet set it up (e.g. Super Admin seed). */
export default function FirstLoginTwoFactorSetup() {
  const { adminUser, logout } = useAdminAuth()
  const navigate = useNavigate()
  const [secret, setSecret] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState(null)
  const [savedCodes, setSavedCodes] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!adminUser?.email) return
    const { secret: s, otpauth } = generateTotpSecret(adminUser.email)
    setSecret(s)
    generateQrDataUrl(otpauth).then(setQrUrl)
  }, [adminUser?.email])

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!(await verifyTotpCode(secret, code))) {
      setError('Invalid code.')
      return
    }
    setBackupCodes(generateBackupCodes(10))
    setError('')
  }

  const handleComplete = async () => {
    if (!savedCodes) { setError('Confirm you saved recovery codes.'); return }
    await saveTotpSecret(adminUser.id, secret)
    await saveBackupCodes(adminUser.id, backupCodes)
    navigate('/dashboard', { replace: true })
    window.location.reload()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-lg text-gray-200">Set up two-factor authentication</h1>
        {!backupCodes ? (
          <AdminForm onSubmit={handleVerify}>
            {qrUrl && <img src={qrUrl} alt="2FA QR" className="mx-auto rounded border border-gray-700" />}
            <p className="break-all text-center text-xs text-gray-500">{secret}</p>
            <AdminField label="Verification code" required>
              <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
            </AdminField>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="w-full rounded bg-gray-700 py-2 text-sm text-white">Verify</button>
          </AdminForm>
        ) : (
          <>
            <div className="rounded border border-gray-700 bg-gray-900 p-4 font-mono text-sm">
              {backupCodes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={savedCodes} onChange={(e) => setSavedCodes(e.target.checked)} />
              I have saved my recovery codes
            </label>
            <button type="button" onClick={handleComplete} className="w-full rounded bg-gray-700 py-2 text-sm text-white">Finish</button>
          </>
        )}
        <button type="button" onClick={logout} className="text-xs text-gray-500 hover:text-gray-300">Sign out</button>
      </div>
    </div>
  )
}
