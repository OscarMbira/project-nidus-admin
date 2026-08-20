import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  approveAffiliate,
  fetchPendingAffiliateApplications,
  formatDate,
  notifyEmailEvent,
  PermissionGate,
  terminateAffiliate,
  updateAffiliate,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
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
import { statusVariant, toError } from '../utils/affiliateUi.js'

export default function AffiliateApplicationsPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', application_notes: '' })
  const [busyId, setBusyId] = useState('')
  const [editTab, setEditTab] = useState('details')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchPendingAffiliateApplications()
    if (error) showError(toError(error, 'Failed to load applications.'))
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const openEdit = (row) => {
    setEditing(row)
    setEditForm({
      name: row.name || '',
      email: row.email || '',
      application_notes: row.application_notes || '',
    })
    setEditTab('details')
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editing) return
    setBusyId(editing.id)
    const { error } = await updateAffiliate(editing.id, editForm)
    setBusyId('')
    if (error) {
      showError(toError(error, 'Failed to update application.'))
      return
    }
    showSuccess('Application updated.')
    setEditing(null)
    await loadData()
  }

  const runAction = ({ row, title, message, confirmLabel, danger, action, successMessage, errorMessage, emailEvent }) => {
    confirm({
      title,
      message,
      confirmLabel,
      danger,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await action()
        setBusyId('')
        if (error) {
          showError(toError(error, errorMessage))
          return
        }
        showSuccess(successMessage)
        if (emailEvent && row.email) {
          await notifyEmailEvent(emailEvent, row.email, {
            first_name: row.name?.split(' ')[0] || 'Partner',
            platform_name: 'Project Nidus',
            referral_code: row.code,
            affiliate_dashboard_url: 'https://projectnidus.com/affiliates',
          })
        }
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading applications..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Affiliate Applications</h1>
          <p className="text-sm text-gray-500">Review pending partner applications from landing pages.</p>
        </div>
        <Link
          to="/affiliates/apply-preview"
          className="shrink-0 rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
        >
          View apply pages
        </Link>
      </div>

      {!rows.length ? (
        <EmptyState title="No pending applications" description="New applications from the affiliate landing pages will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.target_system}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(row.created_at)}</td>
                  <td className="max-w-xs truncate px-4 py-3" title={row.application_notes}>{row.application_notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <PermissionGate permission="affiliate:update">
                        <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(row)} />
                      </PermissionGate>
                      <PermissionGate permission="affiliate:approve">
                        <button type="button" disabled={busyId === row.id} onClick={() => runAction({
                          row,
                          title: 'Approve application?',
                          message: `Activate ${row.name} with code ${row.code}.`,
                          confirmLabel: 'Approve',
                          action: () => approveAffiliate(row.id),
                          emailEvent: 'affiliate_welcome',
                          successMessage: 'Application approved.',
                          errorMessage: 'Failed to approve application.',
                        })} className="rounded border border-green-700 bg-green-900/30 px-2.5 py-1 text-xs text-green-200">Approve</button>
                      </PermissionGate>
                      <PermissionGate permission="affiliate:terminate">
                        <button type="button" disabled={busyId === row.id} onClick={() => runAction({
                          row,
                          title: 'Reject application?',
                          message: 'This will terminate the application.',
                          confirmLabel: 'Reject',
                          danger: true,
                          action: () => terminateAffiliate(row.id),
                          successMessage: 'Application rejected.',
                          errorMessage: 'Failed to reject application.',
                        })} className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200">Reject</button>
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={Boolean(editing)} title={`Edit ${editing?.name || 'Application'}`} onClose={() => setEditing(null)}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editing && (
          <AuditDetailsPanel description="Who created or changed this application, and how it is classified.">
            <AuditCard title="Identity" description="How this application is labelled.">
              <AuditField label="Name" value={editing.name} />
              <AuditField label="Code" value={editing.code} />
              <AuditField label="Email" value={editing.email} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this application sits.">
              <AuditField label="Status" value={humanizeAuditToken(editing.status)} />
              <AuditField label="Target system" value={humanizeAuditToken(editing.target_system)} />
            </AuditCard>
            <AuditCard title="Record history" description="When this application was created and last changed.">
              <AuditField label="Created by" value={editing.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editing.created_at} />
              <AuditField label="Updated by" value={editing.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={editing.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          <AdminField label="Name" required><input className={inputClass} value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required /></AdminField>
          <AdminField label="Email" required><input type="email" className={inputClass} value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} required /></AdminField>
          <AdminField label="Notes"><textarea rows={3} className={inputClass} value={editForm.application_notes} onChange={(e) => setEditForm((p) => ({ ...p, application_notes: e.target.value }))} /></AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={busyId === editing?.id} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white">Save</button>
          </div>
        </AdminForm>
        )}
      </AdminModal>
      {modal}
    </div>
  )
}
