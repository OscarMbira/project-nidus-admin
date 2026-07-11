import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  getDocumentationCategories,
  getDocumentationGuideById,
  getDocumentationGuides,
  loadDocumentationFile,
  PermissionGate,
} from '@nidus-admin/shared'
import { LoadingState } from '@nidus-admin/ui'
import MarkdownView from '../components/MarkdownView.jsx'

export default function ModuleDocsPage() {
  const { module } = useParams()
  const [params] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [guides, setGuides] = useState([])
  const [activeId, setActiveId] = useState(params.get('guide') || '')
  const [content, setContent] = useState('')
  const [source, setSource] = useState('')

  useEffect(() => {
    getDocumentationGuides(module).then(({ data }) => {
      setGuides(data || [])
      if (!activeId && data?.[0]) setActiveId(data[0].guide_id)
      setLoading(false)
    })
  }, [module])

  const active = useMemo(() => guides.find((g) => g.guide_id === activeId), [guides, activeId])
  const categories = useMemo(() => getDocumentationCategories(guides), [guides])

  useEffect(() => {
    if (!active) return
    loadDocumentationFile(active.file_name, active.module).then(({ data, source: src }) => {
      setContent(data)
      setSource(src)
    })
  }, [active])

  if (loading) return <LoadingState message="Loading module docs..." />

  return (
    <div className="flex min-h-[70vh] flex-col gap-4 p-4 md:flex-row md:p-6">
      <aside className="w-full shrink-0 rounded-lg border border-gray-700 bg-gray-900 p-3 md:w-64">
        <Link to="/docs-centre" className="text-xs text-blue-400">← All modules</Link>
        <h2 className="mt-2 capitalize text-lg font-medium text-gray-100">{module?.replace(/-/g, ' ')}</h2>
        {categories.map((cat) => (
          <div key={cat} className="mt-4">
            <p className="text-xs uppercase text-gray-500">{cat}</p>
            <ul className="mt-1 space-y-1">
              {guides.filter((g) => g.category === cat).map((g) => (
                <li key={g.guide_id}>
                  <button type="button" onClick={() => setActiveId(g.guide_id)} className={`w-full text-left text-sm ${activeId === g.guide_id ? 'text-blue-400' : 'text-gray-300 hover:text-white'}`}>
                    {g.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {guides.filter((g) => !g.category).length > 0 && (
          <ul className="mt-4 space-y-1">
            {guides.filter((g) => !g.category).map((g) => (
              <li key={g.guide_id}>
                <button type="button" onClick={() => setActiveId(g.guide_id)} className={`w-full text-left text-sm ${activeId === g.guide_id ? 'text-blue-400' : 'text-gray-300'}`}>{g.title}</button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 p-6">
        {active ? (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-gray-800 pb-4">
              <div>
                <h1 className="text-2xl font-semibold text-gray-100">{active.title}</h1>
                <p className="text-sm text-gray-500">{active.description}</p>
                <p className="text-xs text-gray-600">Source: {source}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300" onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy link</button>
                <button type="button" className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300" onClick={() => window.print()}>Print</button>
                <PermissionGate permission="docs.manage">
                  <Link to={`/docs-centre/editor?guide=${active.guide_id}`} className="rounded bg-blue-600 px-2 py-1 text-xs text-white">Edit</Link>
                </PermissionGate>
              </div>
            </div>
            <MarkdownView content={content} />
          </>
        ) : (
          <p className="text-gray-500">Select a guide from the sidebar.</p>
        )}
      </main>
    </div>
  )
}
