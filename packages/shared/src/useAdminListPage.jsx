import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminTable, AdminCard, LoadingState, EmptyState, SearchBar, ViewToggle } from '@nidus-admin/ui'
import { rowMatchesListSearch } from './listSearchUtils.js'

/**
 * Shared hook for admin list pages — fetches from DB, supports search/sort/card-table toggle.
 */
export function useAdminListPage({
  fetchFn,
  storageKey,
  defaultView = 'table',
  readSearchFromUrl = false,
  getExtraSearchText,
}) {
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState(() => (
    readSearchFromUrl ? (searchParams.get('search') || '') : ''
  ))
  const [view, setView] = useState(() => localStorage.getItem(storageKey) || defaultView)

  useEffect(() => {
    localStorage.setItem(storageKey, view)
  }, [view, storageKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchFn()
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(err.message || String(err))
        else setRows(data || [])
        setLoading(false)
      })
      .catch((e) => {
        if (!cancelled) { setError(e.message); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [fetchFn])

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return rows
    return rows.filter((row) => rowMatchesListSearch(row, q, {
      extraTexts: getExtraSearchText ? [getExtraSearchText(row)] : [],
    }))
  }, [rows, search, getExtraSearchText])

  return {
    rows: filtered,
    sourceRows: rows,
    loading,
    error,
    search,
    setSearch,
    view,
    setView,
    total: rows.length,
  }
}

export function AdminListPageLayout({
  title,
  subtitle,
  storageKey,
  columns,
  fetchFn,
  renderCard,
}) {
  const { rows, loading, error, search, setSearch, view, setView } = useAdminListPage({
    fetchFn,
    storageKey,
  })

  if (loading) return <LoadingState message={`Loading ${title}...`} />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex gap-3">
          <SearchBar value={search} onChange={setSearch} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>
      <AdminCard title="Total records" value={rows.length} />
      {rows.length === 0 ? (
        <EmptyState title="No records" description="No data matches your criteria." />
      ) : view === 'table' ? (
        <AdminTable columns={columns} rows={rows} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, i) => renderCard(r, i))}
        </div>
      )}
    </div>
  )
}
