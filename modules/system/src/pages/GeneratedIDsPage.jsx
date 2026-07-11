import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  buildGeneratedIdAdminLink,
  fetchGeneratedIds,
  formatDate,
  resolveGeneratedIdRecordView,
} from '@nidus-admin/shared'
import { EmptyState, LoadingState, SearchBar, useToast } from '@nidus-admin/ui'
import {
  displayIdMatchesSearch,
  extractDisplayIdCodeReference,
  highlightMatch,
  splitDisplayIdParts,
} from './displayIdSearch.js'

async function copyText(value, showSuccess) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    showSuccess('Copied to clipboard.')
  } catch {
    showSuccess('Copy failed — select text manually.')
  }
}

function DisplayIdCell({ displayId, searchTerm, onCopy }) {
  const { prefix, code } = splitDisplayIdParts(displayId)
  const term = searchTerm.trim()

  if (!code || code === displayId) {
    const parts = highlightMatch(displayId, term)
    return (
      <button
        type="button"
        onClick={() => onCopy(displayId)}
        className="font-mono text-blue-200 hover:text-blue-100"
        title="Copy display ID"
      >
        {parts.map((part, index) => (
          <span
            key={`${part.text}-${index}`}
            className={part.match ? 'rounded bg-amber-900/50 text-amber-100' : undefined}
          >
            {part.text}
          </span>
        ))}
      </button>
    )
  }

  const codeParts = highlightMatch(code, term)
  const prefixParts = highlightMatch(prefix, term)

  return (
    <button
      type="button"
      onClick={() => onCopy(displayId)}
      className="font-mono text-blue-200 hover:text-blue-100"
      title="Copy display ID"
    >
      {prefixParts.map((part, index) => (
        <span
          key={`prefix-${part.text}-${index}`}
          className={part.match ? 'rounded bg-amber-900/50 text-amber-100' : undefined}
        >
          {part.text}
        </span>
      ))}
      {codeParts.map((part, index) => (
        <span
          key={`code-${part.text}-${index}`}
          className={part.match
            ? 'rounded bg-amber-900/50 text-amber-100'
            : 'rounded bg-blue-900/30 px-0.5 text-blue-100'}
        >
          {part.text}
        </span>
      ))}
    </button>
  )
}

function GeneratedIdActions({ row, onCopyLink }) {
  const view = resolveGeneratedIdRecordView({
    target_table: row.target_table,
    record_id: row.record_id,
    display_id: row.display_id,
  })

  if (!view.available) {
    return (
      <span className="text-xs text-gray-500" title={view.reason || undefined}>
        View unavailable
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to={view.href}
        className="rounded border border-gray-600 px-2.5 py-1 text-xs text-blue-200 hover:border-blue-500 hover:bg-blue-900/20"
      >
        {view.label}
      </Link>
      <button
        type="button"
        onClick={() => onCopyLink(view.href)}
        className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
        title="Copy admin link"
      >
        Copy link
      </button>
    </div>
  )
}

export default function GeneratedIDsPage() {
  const { showSuccess } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [tableFilter, setTableFilter] = useState(() => searchParams.get('table') || 'all')

  useEffect(() => {
    setSearch(searchParams.get('search') || '')
    setTableFilter(searchParams.get('table') || 'all')
  }, [searchParams])

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchGeneratedIds({ limit: 2000 })
    if (error) {
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const syncUrlParams = (nextSearch, nextTableFilter) => {
    const params = new URLSearchParams()
    const trimmedSearch = nextSearch.trim()
    if (trimmedSearch) params.set('search', trimmedSearch)
    if (nextTableFilter && nextTableFilter !== 'all') params.set('table', nextTableFilter)
    setSearchParams(params, { replace: true })
  }

  const handleSearchChange = (value) => {
    setSearch(value)
    syncUrlParams(value, tableFilter)
  }

  const handleTableFilterChange = (value) => {
    setTableFilter(value)
    syncUrlParams(search, value)
  }

  const tableOptions = useMemo(() => {
    const tables = new Set(rows.map((row) => row.target_table).filter(Boolean))
    if (tableFilter !== 'all') tables.add(tableFilter)
    return ['all', ...Array.from(tables).sort()]
  }, [rows, tableFilter])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (tableFilter !== 'all' && row.target_table !== tableFilter) return false
      return displayIdMatchesSearch(row, search)
    })
  }, [rows, search, tableFilter])

  const searchHint = useMemo(() => {
    const term = search.trim()
    if (!term) return null
    const codeMatches = filteredRows.filter(
      (row) => extractDisplayIdCodeReference(row.display_id).toLowerCase().includes(term.toLowerCase()),
    ).length
    if (codeMatches > 0 && !term.includes('-')) {
      return `${codeMatches} match${codeMatches === 1 ? '' : 'es'} on code reference (segment after prefix).`
    }
    return null
  }, [search, filteredRows])

  if (loading) return <LoadingState message="Loading generated IDs..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Generated IDs</h1>
          <p className="text-sm text-gray-500">
            Browse human-readable display IDs mapped to record UUIDs. Search by full display ID or
            {' '}
            <span className="font-mono text-gray-400">code reference</span>
            {' '}
            (the segment after the prefix, e.g.{' '}
            <span className="font-mono text-gray-400">8BF9Y25</span>
            {' '}in{' '}
            <span className="font-mono text-gray-400">SUB-8BF9Y25</span>
            ).
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar
            value={search}
            onChange={handleSearchChange}
            placeholder="Code reference, display ID, table, or UUID..."
          />
          <select
            value={tableFilter}
            onChange={(e) => handleTableFilterChange(e.target.value)}
            className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
          >
            {tableOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All tables' : option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {searchHint && (
        <p className="text-xs text-amber-200/90">{searchHint}</p>
      )}

      {tableFilter !== 'all' && (
        <p className="text-xs text-gray-500">
          Filtered to table{' '}
          <span className="font-mono text-gray-400">{tableFilter}</span>
          {search.trim() ? ` — searching for "${search.trim()}"` : ''}
        </p>
      )}

      {!filteredRows.length ? (
        <EmptyState
          title="No generated IDs found"
          description={
            search.trim()
              ? 'Try searching only the code reference (part after the prefix) or clear the table filter.'
              : 'Display IDs appear here after rules generate them for records.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Display ID</th>
                <th className="px-4 py-3">Code Reference</th>
                <th className="px-4 py-3">Target Table</th>
                <th className="px-4 py-3">Record UUID</th>
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">
                    <DisplayIdCell
                      displayId={row.display_id}
                      searchTerm={search}
                      onCopy={(value) => copyText(value, showSuccess)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => copyText(extractDisplayIdCodeReference(row.display_id), showSuccess)}
                      className="font-mono text-sm text-blue-100 hover:text-white"
                      title="Copy code reference"
                    >
                      {extractDisplayIdCodeReference(row.display_id)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{row.target_table}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => copyText(row.record_id, showSuccess)}
                      className="font-mono text-xs text-gray-400 hover:text-gray-200"
                      title="Copy UUID"
                    >
                      {row.record_id}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <GeneratedIdActions
                      row={row}
                      onCopyLink={(href) => copyText(buildGeneratedIdAdminLink(href), showSuccess)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
