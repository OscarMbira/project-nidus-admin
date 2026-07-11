import { useAdminAuth } from '../../context/AdminAuthContext.jsx'
import { Navigate } from 'react-router-dom'

export function RoleGuard({ roles = [], children }) {
  const { isAuthenticated, role, loading } = useAdminAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles.length && !roles.includes(role)) return <Navigate to="/dashboard" replace />
  return children
}

export function PermissionGuard({ permission, children, fallback = null }) {
  const { hasPermission } = useAdminAuth()
  if (!hasPermission(permission)) return fallback
  return children
}
