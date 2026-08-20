import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchProfessionalRoles, deactivateProfessionalRole, PermissionGate } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

export default function ProfessionalRolesPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchProfessionalRoles()
    if (error) {
      showError(error.message || String(error))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    const sorted = [...rows].sort((a, b) => (a.role_label || '').localeCompare(b.role_label || ''))
    if (!term) return sorted
    return sorted.filter((row) => [row.role_code, row.role_label, row.description].some((v) => String(v ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const handleDeactivate = (role) => {
    confirm({
      title: `Deactivate ${role.role_label}?`,
      message: 'This role will no longer be offered to users at registration or invitation acceptance. Existing users keep it on their profile.',
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        setBusyId(role.id)
        const { error } = await deactivateProfessionalRole(role.id)
        setBusyId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Professional role deactivated.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading professional roles..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Professional Roles</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Informational "what do you do" labels offered at registration and invitation acceptance. Never an authorization input.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search code, label..." />
          <PermissionGate permission="system.industries.edit">
            <button
              type="button"
              onClick={() => navigate('/system/professional-role-form')}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              New Professional Role
            </button>
          </PermissionGate>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No professional roles found" description="Create a role or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <table className="min-w-full text-sm text-gray-700 dark:text-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((role) => {
                const isBusy = busyId === role.id
                return (
                  <tr key={role.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 font-medium">{role.role_code}</td>
                    <td className="px-4 py-3">{role.role_label}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{role.description || '—'}</td>
                    <td className="px-4 py-3">
                      <AdminBadge label={role.is_active ? 'active' : 'inactive'} variant={role.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-4 py-3">
                      <AdminRowActions>
                        <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/system/professional-role-form?id=${role.id}&view=1`)} />
                        <PermissionGate permission="system.industries.edit">
                          <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/professional-role-form?id=${role.id}`)} />
                          <AdminIconActionButton variant="delete" label="Deactivate" onClick={() => handleDeactivate(role)} disabled={isBusy} />
                        </PermissionGate>
                      </AdminRowActions>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal}
    </div>
  )
}
