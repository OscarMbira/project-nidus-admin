import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDocumentationGuides, getDocumentationModules } from '@nidus-admin/shared'
import { EmptyState, inputClass, LoadingState } from '@nidus-admin/ui'

const QUICK = [
  { label: 'Getting Started', module: 'general', guide: 'getting-started' },
  { label: 'Role Guides', module: 'general', guide: 'role-guides-overview' },
  { label: 'Security', module: 'security', guide: 'security-overview-guide' },
  { label: 'Testing Centre', module: 'testing-centre', guide: 'testing-centre-guide' },
]

export default function DocsHomePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [modules, setModules] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getDocumentationModules().then(({ data }) => {
      setModules(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingState message="Loading documentation..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Documentation</h1>
        <p className="text-sm text-gray-500">Live guides from Supabase Storage — updated without redeploying the admin app.</p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(`/docs-centre/search?q=${encodeURIComponent(search)}`)
        }}
      >
        <input className={inputClass} placeholder="Search guides..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Search</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK.map((q) => (
          <Link key={q.guide} to={`/docs-centre/${q.module}?guide=${q.guide}`} className="rounded-lg border border-gray-700 bg-gray-900 p-4 hover:border-blue-600">
            <p className="font-medium text-gray-100">{q.label}</p>
            <p className="text-xs text-gray-500">{q.module}</p>
          </Link>
        ))}
      </div>

      {!modules.length ? (
        <EmptyState title="No guides indexed" description="Run admin:seed-docs and sync markdown to Storage." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Link key={m.module} to={`/docs-centre/${m.module}`} className="rounded-lg border border-gray-700 bg-gray-900 p-4 hover:border-gray-500">
              <p className="text-lg font-medium capitalize text-gray-100">{m.module.replace(/-/g, ' ')}</p>
              <p className="text-sm text-gray-500">{m.guideCount} guide{m.guideCount === 1 ? '' : 's'}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
