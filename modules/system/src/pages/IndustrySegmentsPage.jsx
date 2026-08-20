import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchIndustrySegments, deactivateIndustrySegment, PermissionGate } from '@nidus-admin/shared'
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

export default function IndustrySegmentsPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchIndustrySegments()
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
    const sorted = [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (!term) return sorted
    return sorted.filter((row) => [row.name, row.industry_categories?.name].some((v) => String(v ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const handleDeactivate = (segment) => {
    confirm({
      title: `Deactivate ${segment.name}?`,
      message: 'Organisations that already selected this sub-industry keep it. New selections will no longer offer it.',
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        setBusyId(segment.id)
        const { error } = await deactivateIndustrySegment(segment.id)
        setBusyId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Industry segment deactivated.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading industry segments..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Industry Segments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Optional sub-industries offered under an industry category. Always optional — never required at registration.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search segment or industry..." />
          <PermissionGate permission="system.industries.edit">
            <button
              type="button"
              onClick={() => navigate('/system/industry-segment-form')}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              New Industry Segment
            </button>
          </PermissionGate>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No industry segments found" description="Create a segment or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <table className="min-w-full text-sm text-gray-700 dark:text-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((segment) => {
                const isBusy = busyId === segment.id
                return (
                  <tr key={segment.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 font-medium">{segment.name}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{segment.industry_categories?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <AdminBadge label={segment.is_active ? 'active' : 'inactive'} variant={segment.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-4 py-3">
                      <AdminRowActions>
                        <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/system/industry-segment-form?id=${segment.id}&view=1`)} />
                        <PermissionGate permission="system.industries.edit">
                          <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/industry-segment-form?id=${segment.id}`)} />
                          <AdminIconActionButton variant="delete" label="Deactivate" onClick={() => handleDeactivate(segment)} disabled={isBusy} />
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
