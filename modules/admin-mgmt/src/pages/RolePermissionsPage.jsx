import { useEffect, useMemo, useState } from 'react'
import { PermissionGate, ROLE_LABELS, fetchAdminPermissions, fetchRolePermissions, updateRolePermissions } from '@nidus-admin/shared'
import { EmptyState, LoadingState, useToast } from '@nidus-admin/ui'

const EDITABLE_ROLES = ['system_admin', 'support_admin', 'content_admin']
const TABLE_ROLES = ['super_admin', ...EDITABLE_ROLES]

function normalizePermissionMap(rolePermissionRows) {
  const map = {
    super_admin: new Set(),
    system_admin: new Set(),
    support_admin: new Set(),
    content_admin: new Set(),
  }

  for (const row of rolePermissionRows || []) {
    if (!map[row.role]) map[row.role] = new Set()
    map[row.role].add(row.permission_key)
  }
  return map
}

export default function RolePermissionsPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [permissionMap, setPermissionMap] = useState(() => normalizePermissionMap([]))
  const [originalMap, setOriginalMap] = useState(() => normalizePermissionMap([]))

  const loadData = async () => {
    setLoading(true)
    setError(null)

    const [permissionsRes, rolePermissionsRes] = await Promise.all([
      fetchAdminPermissions(),
      fetchRolePermissions(),
    ])

    if (permissionsRes.error) {
      setError(permissionsRes.error.message || String(permissionsRes.error))
      setLoading(false)
      return
    }
    if (rolePermissionsRes.error) {
      setError(rolePermissionsRes.error.message || String(rolePermissionsRes.error))
      setLoading(false)
      return
    }

    const nextMap = normalizePermissionMap(rolePermissionsRes.data || [])
    setPermissions(permissionsRes.data || [])
    setPermissionMap(nextMap)
    setOriginalMap(normalizePermissionMap(rolePermissionsRes.data || []))
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const groupedPermissions = useMemo(() => {
    const groups = new Map()
    for (const permission of permissions) {
      const category = permission.category || 'uncategorized'
      if (!groups.has(category)) groups.set(category, [])
      groups.get(category).push(permission)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [permissions])

  const hasChanges = useMemo(() => {
    return EDITABLE_ROLES.some((role) => {
      const current = permissionMap[role] || new Set()
      const original = originalMap[role] || new Set()
      if (current.size !== original.size) return true
      for (const key of current) {
        if (!original.has(key)) return true
      }
      return false
    })
  }, [permissionMap, originalMap])

  const togglePermission = (role, key) => {
    setPermissionMap((prev) => {
      const next = { ...prev, [role]: new Set(prev[role] || []) }
      if (next[role].has(key)) next[role].delete(key)
      else next[role].add(key)
      return next
    })
  }

  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)

    for (const role of EDITABLE_ROLES) {
      const current = permissionMap[role] || new Set()
      const original = originalMap[role] || new Set()
      const unchanged = current.size === original.size && [...current].every((key) => original.has(key))
      if (unchanged) continue

      const { error: updateError } = await updateRolePermissions(role, [...current])
      if (updateError) {
        setSaving(false)
        showError(updateError.message || String(updateError))
        return
      }
    }

    showSuccess('Role permissions updated successfully.')
    await loadData()
    setSaving(false)
  }

  if (loading) return <LoadingState message="Loading role permissions..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!permissions.length) return <EmptyState title="No permissions found" description="No active permission keys are available." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Role Permissions</h1>
          <p className="text-sm text-gray-500">Manage role access matrix for admin capabilities.</p>
        </div>
        <PermissionGate permission="admins.permissions.update">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="rounded border border-blue-700 bg-blue-900/40 px-4 py-2 text-sm text-blue-200 hover:bg-blue-900/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </PermissionGate>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
        <table className="min-w-full text-sm text-gray-200">
          <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3">Permission</th>
              {TABLE_ROLES.map((role) => (
                <th key={role} className="px-4 py-3 text-center">{ROLE_LABELS[role] || role}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedPermissions.map(([category, items]) => (
              items.map((permission, index) => (
                <tr key={permission.permission_key} className="border-t border-gray-800 hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    {index === 0 && (
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">{category}</p>
                    )}
                    <p className="text-sm text-gray-100">{permission.permission_name || permission.permission_key}</p>
                    <p className="text-xs text-gray-500">{permission.permission_key}</p>
                  </td>
                  {TABLE_ROLES.map((role) => {
                    const isSuperAdmin = role === 'super_admin'
                    const checked = isSuperAdmin || (permissionMap[role] || new Set()).has(permission.permission_key)
                    return (
                      <td key={`${permission.permission_key}-${role}`} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isSuperAdmin}
                          onChange={() => !isSuperAdmin && togglePermission(role, permission.permission_key)}
                          className="h-4 w-4 accent-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                    )
                  })}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
