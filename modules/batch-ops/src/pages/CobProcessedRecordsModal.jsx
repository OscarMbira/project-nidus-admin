import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminModal, AdminTable } from '@nidus-admin/ui'

export default function CobProcessedRecordsModal({ open, onClose, step, context }) {
  const navigate = useNavigate()

  const columns = useMemo(() => [
    {
      key: 'record_type_label',
      label: 'Type',
      render: (row) => row.record_type_label || context?.recordTypeLabel || '—',
    },
    {
      key: 'label',
      label: 'Record',
      render: (row) => (
        <div>
          <p className="text-gray-100">{row.label}</p>
          {row.id && (
            <p className="font-mono text-xs text-gray-500">{row.id}</p>
          )}
        </div>
      ),
    },
    {
      key: 'system',
      label: 'System',
      render: (row) => row.system ? (
        <span className="capitalize text-gray-300">{row.system}</span>
      ) : '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => row.status || '—',
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (
        row.detail_path ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              navigate(row.detail_path)
            }}
            className="rounded border border-gray-600 px-2.5 py-1 text-xs text-blue-300 hover:bg-gray-800"
          >
            Open
          </button>
        ) : (
          <span className="text-xs text-gray-500">—</span>
        )
      ),
    },
  ], [context?.recordTypeLabel, navigate, onClose])

  if (!open || !step) return null

  const rows = context?.records || []
  const title = step.process_name || 'Processed records'

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={title}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          {context?.count ?? rows.length} {context?.recordTypeLabel || 'record'}(s)
          {context?.listPath && (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => {
                  onClose()
                  navigate(context.listPath)
                }}
                className="text-blue-300 hover:text-blue-200"
              >
                View all in module
              </button>
            </>
          )}
        </p>

        {rows.length ? (
          <AdminTable columns={columns} rows={rows} pageSize={10} />
        ) : (
          <p className="rounded border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
            Individual record IDs were not captured for this step. Open the module list to review matching records.
          </p>
        )}
      </div>
    </AdminModal>
  )
}
