import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteNotificationTemplate,
  fetchNotificationTemplates,
  toggleNotificationTemplate,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

export default function NotificationTemplatesPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchNotificationTemplates()
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
    if (!term) return rows
    return rows.filter((row) => [
      row.template_key,
      row.template_name,
      row.category,
      row.channel,
      row.subject_template,
    ].some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const handleToggle = async (templateId) => {
    setBusyId(templateId)
    const { error } = await toggleNotificationTemplate(templateId)
    setBusyId('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Template toggled.')
    await loadData()
  }

  const handleDelete = (template) => {
    confirm({
      title: `Delete ${template.template_key}?`,
      message: 'Alert rules referencing this template will lose their template link.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(template.id)
        const { error } = await deleteNotificationTemplate(template.id)
        setBusyId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Notification template deleted.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading notification templates..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Notification Templates</h1>
          <p className="text-sm text-gray-500">Reusable in-app and email notification templates for alert rules.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search key, name, category..." />
          <button
            type="button"
            onClick={() => navigate('/system/notification-template-form')}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            New Template
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No notification templates found" description="Create a template or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((template) => {
                const isBusy = busyId === template.id
                return (
                  <tr key={template.id} className="border-t border-gray-800">
                    <td className="px-4 py-3 font-medium">{template.template_key}</td>
                    <td className="px-4 py-3">{template.template_name}</td>
                    <td className="px-4 py-3">{template.category}</td>
                    <td className="px-4 py-3">{template.channel}</td>
                    <td className="px-4 py-3">
                      <AdminBadge
                        label={template.is_active ? 'active' : 'inactive'}
                        variant={template.is_active ? 'active' : 'inactive'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <AdminRowActions>
                        <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/system/notification-template-form?id=${template.id}&view=1`)} />
                        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/notification-template-form?id=${template.id}`)} />
                        <AdminActionButton
                          variant="default"
                          disabled={isBusy}
                          onClick={() => handleToggle(template.id)}
                        >
                          {isBusy ? 'Working...' : 'Toggle'}
                        </AdminActionButton>
                        <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(template)} disabled={isBusy} />
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
