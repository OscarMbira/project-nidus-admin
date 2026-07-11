import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchDocumentationGuides } from '@nidus-admin/shared'
import { LoadingState } from '@nidus-admin/ui'

export default function DocsSearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState([])

  useEffect(() => {
    searchDocumentationGuides(q).then(({ data }) => {
      setResults(data || [])
      setLoading(false)
    })
  }, [q])

  if (loading) return <LoadingState message="Searching..." />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Link to="/docs-centre" className="text-sm text-blue-400">← Documentation home</Link>
      <h1 className="text-xl font-semibold text-gray-100">Search: {q || '(all)'}</h1>
      {!results.length ? (
        <p className="text-gray-500">No guides matched your search.</p>
      ) : (
        <ul className="space-y-3">
          {results.map((g) => (
            <li key={g.guide_id} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <Link to={`/docs-centre/${g.module}?guide=${g.guide_id}`} className="text-lg font-medium text-blue-400 hover:underline">{g.title}</Link>
              <p className="text-xs text-gray-500">{g.module} / {g.category || 'General'}</p>
              <p className="mt-1 text-sm text-gray-400">{g.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
