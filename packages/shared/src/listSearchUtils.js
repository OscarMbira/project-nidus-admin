import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Search state initialised from ?search= on first render. */
export function useInitialUrlSearch(paramKey = 'search', defaultValue = '') {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get(paramKey) || defaultValue)
  return [search, setSearch]
}

export function rowMatchesListSearch(row, query, { extraTexts = [] } = {}) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return true

  const haystack = [
    ...extraTexts.map((value) => String(value ?? '')),
    ...Object.values(row || {}).map((value) => String(value ?? '')),
  ]

  return haystack.some((value) => value.toLowerCase().includes(q))
}
