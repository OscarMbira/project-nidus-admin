import { useAdminAuth } from '../context/AdminAuthContext.jsx'

export function usePermission(permissionKey) {
  const { hasPermission } = useAdminAuth()
  return hasPermission(permissionKey)
}
