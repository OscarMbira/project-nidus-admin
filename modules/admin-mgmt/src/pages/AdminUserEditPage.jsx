import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PermissionGate,
  ADMIN_ROLES,
  ROLE_LABELS,
  fetchAdminUserById,
  fetchAuditLogForTarget,
  formatDate,
  resetAdmin2fa,
  updateAdminUser,
  useDisplayId,
  useUnsavedChangesGuard,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AuditTrailWidget,
  EmptyState,
  inputClass,
  LoadingState,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
  humanizeAuditToken,
} from '@nidus-admin/ui'

export default function AdminUserEditPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const isViewOnly = searchParams.get('view') === '1' && Boolean(idParam)
  const { uuid: userId, loading: resolving, error: resolveError } = useDisplayId('admin.admin_users', idParam)

  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [error, setError] = useState(null)
  const [adminUser, setAdminUser] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [detailTab, setDetailTab] = useState('details')
  const [formValues, setFormValues] = useState({
    full_name: '',
    role: 'system_admin',
    requires_2fa: true,
  })

  const loadData = async () => {
    if (!userId) {
      setError('Missing admin user ID in query string.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [userRes, auditPrimaryRes, auditFallbackRes] = await Promise.all([
      fetchAdminUserById(userId),
      fetchAuditLogForTarget('admin_user', userId),
      fetchAuditLogForTarget('admin_users', userId),
    ])

    if (userRes.error) {
      setError(userRes.error.message || String(userRes.error))
      setLoading(false)
      return
    }
    if (!userRes.data) {
      setError('Admin user not found.')
      setLoading(false)
      return
    }

    const mergedEntries = [...(auditPrimaryRes.data || []), ...(auditFallbackRes.data || [])]
      .filter((entry, index, arr) => arr.findIndex((candidate) => candidate.id === entry.id) === index)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setAdminUser(userRes.data)
    setFormValues({
      full_name: userRes.data.full_name || '',
      role: userRes.data.role || 'system_admin',
      requires_2fa: Boolean(userRes.data.requires_2fa),
    })
    setAuditEntries(mergedEntries)
    setLoading(false)
  }

  useEffect(() => {
    if (resolving) return
    if (resolveError) {
      setError(resolveError)
      setLoading(false)
      return
    }
    loadData()
  }, [userId, resolving, resolveError])

  const hasChanges = useMemo(() => {
    if (!adminUser || isViewOnly) return false
    return (
      formValues.full_name !== (adminUser.full_name || '') ||
      formValues.role !== adminUser.role ||
      formValues.requires_2fa !== Boolean(adminUser.requires_2fa)
    )
  }, [adminUser, formValues, isViewOnly])

  const { requestNavigation } = useUnsavedChangesGuard(
    hasChanges,
    'You have unsaved admin user changes.',
  )

  const persistChanges = async () => {
    if (!adminUser) return
    setSaving(true)
    const { error: updateError } = await updateAdminUser(adminUser.id, formValues)
    setSaving(false)
    if (updateError) {
      showError(updateError.message || String(updateError))
      return
    }
    showSuccess('Admin user updated successfully.')
    await loadData()
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!adminUser || !hasChanges) return

    if (formValues.role !== adminUser.role) {
      confirm({
        title: 'Confirm role change',
        message: `Change role from ${ROLE_LABELS[adminUser.role] || adminUser.role} to ${ROLE_LABELS[formValues.role] || formValues.role}?`,
        confirmLabel: 'Update Role',
        danger: true,
        onConfirm: persistChanges,
      })
      return
    }

    await persistChanges()
  }

  const handleReset2fa = () => {
    if (!adminUser) return
    confirm({
      title: `Reset 2FA for ${adminUser.full_name || adminUser.email}?`,
      message: 'The admin user will need to enroll a new authenticator on next login.',
      confirmLabel: 'Reset 2FA',
      onConfirm: async () => {
        setSecurityLoading(true)
        const { error: mutationError } = await resetAdmin2fa(adminUser.id)
        setSecurityLoading(false)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('2FA reset successfully.')
      },
    })
  }

  const handleForcePasswordReset = () => {
    confirm({
      title: 'Force password reset',
      message: 'Password reset RPC is not available yet. This action is currently blocked.',
      confirmLabel: 'Understood',
      onConfirm: async () => {
        showError('Force password reset is not available in the current shared services.')
      },
    })
  }

  const goBack = () => requestNavigation('../admin-user-list', { relative: 'path' })

  const openEditMode = () => {
    navigate(`../admin-user-edit?id=${idParam}`, { relative: 'path' })
  }

  if (resolving || loading) return <LoadingState message="Loading admin user..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!adminUser) return <EmptyState title="No user found" description="Select a valid admin user to edit." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">
            {isViewOnly ? 'View Admin User' : 'Edit Admin User'}
          </h1>
          <p className="text-sm text-gray-500">
            {isViewOnly
              ? 'Review profile and access details for this admin account.'
              : 'Update profile and access controls for this admin account.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isViewOnly ? (
            <PermissionGate permission="admins.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={openEditMode} />
            </PermissionGate>
          ) : null}
          <button
            type="button"
            className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
            onClick={goBack}
          >
            Back to Admin Users
          </button>
        </div>
      </div>

      {isViewOnly && (
        <div className="rounded-lg border border-gray-600 bg-gray-800/80 px-3 py-2 text-sm text-gray-300">
          Viewing admin user in read-only mode. Use Edit to make changes.
        </div>
      )}

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && (
        <div className="space-y-4">
          <AuditDetailsPanel description="Who created or changed this admin user, and how it is classified.">
            <AuditCard title="Identity" description="How this admin user is labelled.">
              <AuditField label="Full name" value={adminUser.full_name} />
              <AuditField label="Email" value={adminUser.email} />
            </AuditCard>
            <AuditCard title="Classification" description="Access level and status.">
              <AuditField label="Role" value={ROLE_LABELS[adminUser.role] || adminUser.role} />
              <AuditField label="Status" value={humanizeAuditToken(adminUser.activation_status)} />
              <AuditField label="Requires 2FA" value={adminUser.requires_2fa ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this admin user was created and last changed.">
              <AuditField label="Created by" value={adminUser.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={adminUser.created_at} />
              <AuditField label="Updated by" value={adminUser.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={adminUser.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-5">
            <h2 className="mb-3 text-lg font-semibold text-gray-100">Audit Trail</h2>
            <AuditTrailWidget entries={auditEntries} />
          </div>
        </div>
      )}

      {detailTab === 'details' && (
      <div className="grid gap-6">
        <div className="space-y-5 rounded-lg border border-gray-700 bg-gray-900 p-5">
          <AdminForm onSubmit={isViewOnly ? (event) => event.preventDefault() : handleSave} className="space-y-4">
            <fieldset disabled={isViewOnly} className="space-y-4 border-0 p-0 m-0 min-w-0 disabled:opacity-95">
            <AdminField label="Full Name">
              <input
                className={inputClass}
                value={formValues.full_name}
                onChange={(event) => setFormValues((prev) => ({ ...prev, full_name: event.target.value }))}
                placeholder="Admin full name"
              />
            </AdminField>

            <AdminField label="Role">
              <select
                className={inputClass}
                value={formValues.role}
                onChange={(event) => setFormValues((prev) => ({ ...prev, role: event.target.value }))}
              >
                {ADMIN_ROLES.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>
                ))}
              </select>
            </AdminField>

            <div className="rounded border border-gray-700 bg-gray-950 px-3 py-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={formValues.requires_2fa}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, requires_2fa: event.target.checked }))}
                />
                Require 2FA
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-gray-700 bg-gray-950 p-3">
                <p className="text-xs uppercase text-gray-400">Email</p>
                <p className="mt-1 text-sm text-gray-200">{adminUser.email || '—'}</p>
              </div>
              <div className="rounded border border-gray-700 bg-gray-950 p-3">
                <p className="text-xs uppercase text-gray-400">Status</p>
                <p className="mt-1">
                  <AdminBadge label={(adminUser.activation_status || 'unknown').replaceAll('_', ' ')} variant={adminUser.activation_status} />
                </p>
              </div>
              <div className="rounded border border-gray-700 bg-gray-950 p-3">
                <p className="text-xs uppercase text-gray-400">Last Login</p>
                <p className="mt-1 text-sm text-gray-200">{formatDate(adminUser.last_login_at)}</p>
              </div>
              <div className="rounded border border-gray-700 bg-gray-950 p-3">
                <p className="text-xs uppercase text-gray-400">Created At</p>
                <p className="mt-1 text-sm text-gray-200">{formatDate(adminUser.created_at)}</p>
              </div>
            </div>
            </fieldset>

            {!isViewOnly && (
              <div className="flex flex-wrap gap-2 pt-2">
                <PermissionGate permission="admins.edit">
                  <button
                    type="submit"
                    disabled={saving || !hasChanges}
                    className="rounded border border-blue-700 bg-blue-900/40 px-4 py-2 text-sm text-blue-200 hover:bg-blue-900/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </PermissionGate>
              </div>
            )}
          </AdminForm>

          {!isViewOnly && (
          <div className="space-y-2 border-t border-gray-800 pt-4">
            <p className="text-sm font-medium text-gray-200">Security Actions</p>
            <div className="flex flex-wrap gap-2">
              <PermissionGate permission="admins.2fa.reset">
                <button
                  type="button"
                  onClick={handleReset2fa}
                  disabled={securityLoading}
                  className="rounded border border-amber-700 bg-amber-900/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset 2FA
                </button>
              </PermissionGate>
              <PermissionGate permission="admins.password_reset">
                <button
                  type="button"
                  onClick={handleForcePasswordReset}
                  disabled={securityLoading}
                  className="rounded border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Force Password Reset
                </button>
              </PermissionGate>
            </div>
          </div>
          )}
        </div>
      </div>
      )}

      {modal}
    </div>
  )
}
