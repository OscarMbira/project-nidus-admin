import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchIndustryPacks, deactivateIndustryPack, PermissionGate } from '@nidus-admin/shared'
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

export default function IndustryPacksPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchIndustryPacks()
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
    const sorted = [...rows].sort((a, b) => (a.pack_name || '').localeCompare(b.pack_name || ''))
    if (!term) return sorted
    return sorted.filter((row) => [row.pack_code, row.pack_name, row.industry_categories?.name].some((v) => String(v ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const handleDeactivate = (pack) => {
    confirm({
      title: `Deactivate ${pack.pack_name}?`,
      message: 'Organisations with this industry will fall back to Core + Generic PM menu items only (fail-open menu items are unaffected).',
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        setBusyId(pack.id)
        const { error } = await deactivateIndustryPack(pack.id)
        setBusyId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Industry pack deactivated.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading industry packs..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Industry Packs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Curated sets of sidebar menu items unlocked when an organisation selects an industry. Edit a pack to choose its menu items.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search code, name, industry..." />
          <PermissionGate permission="system.industries.edit">
            <button
              type="button"
              onClick={() => navigate('/system/industry-pack-form')}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              New Industry Pack
            </button>
          </PermissionGate>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No industry packs found" description="Create a pack or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <table className="min-w-full text-sm text-gray-700 dark:text-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Pack</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((pack) => {
                const isBusy = busyId === pack.id
                return (
                  <tr key={pack.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3">
                      <div className="font-medium">{pack.pack_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">{pack.pack_code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{pack.industry_categories?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <AdminBadge label={pack.is_active ? 'active' : 'inactive'} variant={pack.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-4 py-3">
                      <AdminRowActions>
                        <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/system/industry-pack-form?id=${pack.id}&view=1`)} />
                        <PermissionGate permission="system.industries.edit">
                          <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/industry-pack-form?id=${pack.id}`)} />
                          <AdminIconActionButton variant="delete" label="Deactivate" onClick={() => handleDeactivate(pack)} disabled={isBusy} />
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
