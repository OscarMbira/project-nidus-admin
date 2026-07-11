import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext.jsx'
import { AdminForm, AdminField, inputClass } from '@nidus-admin/ui'

export default function AdminLogin() {
  const { login, verify2FA, pending2FA } = useAdminAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    const result = await login(email, password)
    if (result.error) {
      setAttempts((a) => a + 1)
      setError(result.error)
      return
    }
    if (result.requires2FA) return
    if (result.needs2FASetup) {
      navigate('/auth/2fa-setup')
      return
    }
    navigate('/dashboard')
  }

  const handle2FA = async (e) => {
    e.preventDefault()
    const result = await verify2FA(code)
    if (result.error) setError(result.error)
    else navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        {pending2FA ? (
          <AdminForm onSubmit={handle2FA}>
            <AdminField label="Authentication code" required>
              <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
            </AdminField>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="w-full rounded bg-gray-700 py-2 text-sm text-white hover:bg-gray-600">Verify</button>
          </AdminForm>
        ) : (
          <AdminForm onSubmit={handleLogin}>
            <AdminField label="Email" required>
              <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </AdminField>
            <AdminField label="Password" required>
              <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </AdminField>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {attempts > 0 && <p className="text-xs text-gray-500">Attempt {attempts} of 5</p>}
            <button type="submit" className="w-full rounded bg-gray-700 py-2 text-sm text-white hover:bg-gray-600">Continue</button>
          </AdminForm>
        )}
      </div>
    </div>
  )
}
