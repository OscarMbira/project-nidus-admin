import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteCancellationRequest,
  fetchCancellationCategoriesAdmin,
  fetchCancellationRequests,
  fetchCancellationTrends,
  fetchActiveCancellationCategories,
  fetchLifecycleLogs,
  formatDate,
  PermissionGate,
  systemLabel,
  upsertCancellationCategory,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminField,
  AdminForm,
  AdminModal,
  AdminTable,
  EmptyState,
  LoadingState,
  RecordLifecyclePanel,
  RecordStatusBadge,
  RecordVersionHistory,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const SYSTEM_FILTERS = ['all', 'platform', 'simulator']
const EMPTY_CATEGORY_FORM = { code: '', label: '', description: '', sort_order: 0, is_active: true }

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

export default function CancellationReasonsPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [tab, setTab] = useState('submissions')
  const [loading, setLoading] = useState(true)
  const [submissions, setSubmissions] = useState([])
  const [trends, setTrends] = useState([])
  const [categories, setCategories] = useState([])
  const [adminCategories, setAdminCategories] = useState([])
  const [showAllTrends, setShowAllTrends] = useState(false)
  const [systemFilter, setSystemFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [busyId, setBusyId] = useState('')
  const [categoryModal, setCategoryModal] = useState(null)
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY_FORM)
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryLifecycleMeta, setCategoryLifecycleMeta] = useState(null)
  const [categoryLifecycleLogs, setCategoryLifecycleLogs] = useState([])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [subsRes, trendsRes, catsPublicRes] = await Promise.all([
      fetchCancellationRequests({
        targetSystem: systemFilter,
        reasonCategoryId: categoryFilter === 'all' ? null : categoryFilter,
        fromDate: fromDate || null,
        toDate: toDate || null,
        limit: 200,
      }),
      fetchCancellationTrends(30),
      fetchActiveCancellationCategories(),
    ])
    if (subsRes.error) showError(toErrorMessage(subsRes.error, 'Failed to load submissions.'))
    if (trendsRes.error) showError(toErrorMessage(trendsRes.error, 'Failed to load trends.'))
    setSubmissions(subsRes.data || [])
    setTrends(trendsRes.data || [])
    setCategories(catsPublicRes.data || [])
    setLoading(false)
  }, [systemFilter, categoryFilter, fromDate, toDate, showError])

  const loadAdminCategories = useCallback(async () => {
    const catsRes = await fetchCancellationCategoriesAdmin()
    if (catsRes.error) {
      showError(toErrorMessage(catsRes.error, 'Failed to load categories.'))
      return
    }
    setAdminCategories(catsRes.data || [])
  }, [showError])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (tab === 'categories') loadAdminCategories()
  }, [tab, loadAdminCategories])

  const categoryOptions = useMemo(
    () => categories.filter((c) => c.is_active).map((c) => ({ id: c.id, label: c.label })),
    [categories],
  )

  const topTrends = useMemo(() => trends.slice(0, 3), [trends])
  const visibleTrends = showAllTrends ? trends : topTrends

  const openCreateCategory = () => {
    setCategoryForm(EMPTY_CATEGORY_FORM)
    setCategoryLifecycleMeta(null)
    setCategoryLifecycleLogs([])
    setCategoryModal({ mode: 'create' })
  }

  const openEditCategory = (row) => {
    setCategoryForm({
      code: row.code,
      label: row.label,
      description: row.description || '',
      sort_order: row.sort_order ?? 0,
      is_active: row.is_active !== false,
    })
    const rootId = row.root_record_id || row.id
    setCategoryLifecycleMeta({
      record_status: row.record_status || 'live',
      root_record_id: rootId,
    })
    fetchLifecycleLogs('cancellation_reason_categories', rootId).then(({ data }) => {
      setCategoryLifecycleLogs(data || [])
    })
    setCategoryModal({ mode: 'edit', id: row.id })
  }

  const refreshCategoryLifecycle = async (categoryId) => {
    const catsRes = await fetchCancellationCategoriesAdmin()
    if (catsRes.data) setAdminCategories(catsRes.data)
    const row = (catsRes.data || []).find((c) => c.id === categoryId) || {}
    const rootId = row.root_record_id || categoryId
    setCategoryLifecycleMeta({
      record_status: row.record_status || 'live',
      root_record_id: rootId,
    })
    const { data } = await fetchLifecycleLogs('cancellation_reason_categories', rootId)
    setCategoryLifecycleLogs(data || [])
  }

  const handleSaveCategory = async (event) => {
    event.preventDefault()
    setSavingCategory(true)
    const { error } = await upsertCancellationCategory({
      id: categoryModal?.mode === 'edit' ? categoryModal.id : null,
      ...categoryForm,
      sort_order: Number(categoryForm.sort_order) || 0,
    })
    setSavingCategory(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to save category.'))
      return
    }
    showSuccess(categoryModal?.mode === 'edit' ? 'Category updated.' : 'Category created.')
    setCategoryModal(null)
    await Promise.all([loadData(), loadAdminCategories()])
  }

  const handleDeleteSubmission = (row) => {
    confirm({
      title: 'Delete submission?',
      message: 'This permanently removes the cancellation reason record.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await deleteCancellationRequest(row.id)
        setBusyId('')
        if (error) {
          showError(toErrorMessage(error, 'Failed to delete submission.'))
          return
        }
        showSuccess('Submission deleted.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading cancellation reasons..." />

  return (
    <PermissionGate permission="cancellation:view">
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Cancellation Reasons</h1>
          <p className="text-sm text-gray-500">
            Customer-submitted reasons when cancelling Platform or Simulator subscriptions.
          </p>
        </div>

        {trends.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Last 30 days</h2>
              {trends.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllTrends((v) => !v)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {showAllTrends ? 'Show top 3' : 'View all'}
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTrends.map((t) => (
                <AdminCard
                  key={t.reason_code}
                  title={t.reason_label}
                  value={`${t.count} (${t.pct}%)`}
                />
              ))}
            </div>
            {showAllTrends && trends.length > 3 && (
              <AdminTable
                columns={[
                  { key: 'reason_label', label: 'Reason' },
                  { key: 'count', label: 'Count' },
                  { key: 'pct', label: '% Share', render: (r) => `${r.pct}%` },
                ]}
                rows={trends}
              />
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-2">
          <button
            type="button"
            onClick={() => setTab('submissions')}
            className={`rounded px-3 py-1.5 text-sm ${tab === 'submissions' ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Submissions
          </button>
          <PermissionGate permission="cancellation:manage_categories">
            <button
              type="button"
              onClick={() => setTab('categories')}
              className={`rounded px-3 py-1.5 text-sm ${tab === 'categories' ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Reason Categories
            </button>
          </PermissionGate>
        </div>

        {tab === 'submissions' && (
          <>
            <div className="flex flex-wrap gap-3">
              <select
                value={systemFilter}
                onChange={(e) => setSystemFilter(e.target.value)}
                className={inputClass}
              >
                {SYSTEM_FILTERS.map((v) => (
                  <option key={v} value={v}>{v === 'all' ? 'All systems' : systemLabel(v)}</option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={inputClass}
              >
                <option value="all">All reasons</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
            </div>

            {submissions.length === 0 ? (
              <EmptyState title="No submissions" description="Customer cancellation reasons will appear here." />
            ) : (
              <AdminTable
                columns={[
                  { key: 'created_at', label: 'Date', render: (r) => formatDate(r.created_at) },
                  { key: 'target_system', label: 'System', render: (r) => systemLabel(r.target_system) },
                  { key: 'reason_label', label: 'Reason' },
                  {
                    key: 'notes',
                    label: 'Notes',
                    render: (r) => (
                      <span className="block max-w-xs truncate" title={r.notes || ''}>{r.notes || '—'}</span>
                    ),
                  },
                  {
                    key: 'subscription_id',
                    label: 'Subscription',
                    render: (r) => (
                      r.subscription_id
                        ? (
                          <Link
                            to={`/subscriptions/subscription-detail?id=${r.subscription_id}`}
                            className="font-mono text-xs text-blue-400 hover:underline"
                          >
                            View
                          </Link>
                        )
                        : '—'
                    ),
                  },
                  { key: 'user_email', label: 'User' },
                  {
                    key: 'actions',
                    label: '',
                    render: (r) => (
                      <PermissionGate permission="cancellation:delete">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => handleDeleteSubmission(r)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </PermissionGate>
                    ),
                  },
                ]}
                rows={submissions}
              />
            )}
          </>
        )}

        {tab === 'categories' && (
          <PermissionGate permission="cancellation:manage_categories">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openCreateCategory}
                className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
              >
                New Category
              </button>
            </div>
            {adminCategories.length === 0 ? (
              <EmptyState title="No categories" description="Create reason categories for the customer cancel modal." />
            ) : (
              <AdminTable
                columns={[
                  { key: 'sort_order', label: 'Order' },
                  { key: 'code', label: 'Code' },
                  { key: 'label', label: 'Label' },
                  {
                    key: 'record_status',
                    label: 'Lifecycle',
                    render: (r) => <RecordStatusBadge status={r.record_status || 'live'} />,
                  },
                  {
                    key: 'is_active',
                    label: 'Active',
                    render: (r) => (
                      <AdminBadge label={r.is_active ? 'Active' : 'Inactive'} variant={r.is_active ? 'active' : 'suspended'} />
                    ),
                  },
                  { key: 'submission_count', label: 'Submissions' },
                  {
                    key: 'edit',
                    label: '',
                    render: (r) => (
                      <button
                        type="button"
                        onClick={() => openEditCategory(r)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Edit
                      </button>
                    ),
                  },
                ]}
                rows={adminCategories}
              />
            )}
          </PermissionGate>
        )}

        <AdminModal
          open={Boolean(categoryModal)}
          title={categoryModal?.mode === 'edit' ? 'Edit Category' : 'New Category'}
          onClose={() => setCategoryModal(null)}
        >
          {categoryModal?.mode === 'edit' && categoryLifecycleMeta?.record_status === 'unauthorised' && (
            <div className="mb-4 rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
              This record is locked for editing until the pending change is approved or rejected.
            </div>
          )}
          <AdminForm
            onSubmit={
              categoryModal?.mode === 'edit' && categoryLifecycleMeta?.record_status === 'unauthorised'
                ? (event) => event.preventDefault()
                : handleSaveCategory
            }
          >
            <fieldset
              disabled={categoryModal?.mode === 'edit' && categoryLifecycleMeta?.record_status === 'unauthorised'}
              className="space-y-0 border-0 p-0 m-0 min-w-0 disabled:opacity-95"
            >
            <AdminField label="Code">
              <input
                className={inputClass}
                value={categoryForm.code}
                onChange={(e) => setCategoryForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="too_expensive"
                required
              />
            </AdminField>
            <AdminField label="Label">
              <input
                className={inputClass}
                value={categoryForm.label}
                onChange={(e) => setCategoryForm((f) => ({ ...f, label: e.target.value }))}
                required
              />
            </AdminField>
            <AdminField label="Description">
              <textarea
                className={inputClass}
                rows={2}
                value={categoryForm.description}
                onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))}
              />
            </AdminField>
            <AdminField label="Sort order">
              <input
                type="number"
                className={inputClass}
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
            </AdminField>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={categoryForm.is_active}
                onChange={(e) => setCategoryForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active (visible to customers)
            </label>
            </fieldset>
            {categoryModal?.mode === 'edit' && categoryLifecycleMeta && (
              <div className="mt-4 space-y-4 border-t border-gray-700 pt-4">
                <RecordLifecyclePanel
                  tableName="cancellation_reason_categories"
                  recordId={categoryModal.id}
                  rootRecordId={categoryLifecycleMeta.root_record_id}
                  recordStatus={categoryLifecycleMeta.record_status}
                  onChanged={() => refreshCategoryLifecycle(categoryModal.id)}
                />
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-200">Lifecycle history</h4>
                  <RecordVersionHistory logs={categoryLifecycleLogs} />
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCategoryModal(null)} className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-300">
                Cancel
              </button>
              <button type="submit" disabled={savingCategory} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500">
                {savingCategory ? 'Saving…' : 'Save'}
              </button>
            </div>
          </AdminForm>
        </AdminModal>

        {modal}
      </div>
    </PermissionGate>
  )
}
