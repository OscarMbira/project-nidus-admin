import { useCurrentAdmin } from './adminContext.jsx'

export function PermissionGate({ permission, children, fallback = null }) {
  const { hasPermission, loading } = useCurrentAdmin()
  if (loading) return null
  if (!hasPermission(permission)) return fallback
  return children
}
