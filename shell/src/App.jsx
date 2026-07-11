import { BrowserRouter, Navigate } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext.jsx'
import { ToastProvider } from '@nidus-admin/ui'
import { UnsavedChangesProvider } from '@nidus-admin/shared'
import ShellRoutes from './routes/shellRoutes.jsx'
import './index.css'

function AuthGate({ children }) {
  const { loading, isAuthenticated, needs2FASetup } = useAdminAuth()
  const path = window.location.pathname
  const publicPaths = ['/login', '/pending-activation']
  const isPublic = publicPaths.some((p) => path.startsWith(p)) || path.startsWith('/setup/')
  const is2FASetup = path === '/auth/2fa-setup'

  if (loading) return null
  if (needs2FASetup && !is2FASetup) return <Navigate to="/auth/2fa-setup" replace />
  if (!isAuthenticated && !isPublic && !is2FASetup) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AdminAuthProvider>
      <ToastProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <UnsavedChangesProvider>
            <AuthGate>
              <ShellRoutes />
            </AuthGate>
          </UnsavedChangesProvider>
        </BrowserRouter>
      </ToastProvider>
    </AdminAuthProvider>
  )
}
