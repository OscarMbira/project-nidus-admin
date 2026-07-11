import { useEffect, useState } from 'react'
import { fetchTcEvidence, fetchTestRuns, uploadTcEvidence } from '@nidus-admin/shared'
import { inputClass, LoadingState, useToast } from '@nidus-admin/ui'

export default function EvidencePage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [evidence, setEvidence] = useState([])
  const [runs, setRuns] = useState([])
  const [runId, setRunId] = useState('')
  const [lightbox, setLightbox] = useState(null)

  const load = async () => {
    const [ev, r] = await Promise.all([
      fetchTcEvidence({ runId: runId || undefined }),
      fetchTestRuns({ limit: 30 }),
    ])
    setEvidence(ev.data || [])
    setRuns(r.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [runId])

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !runId) {
      showError('Select a run first.')
      return
    }
    const { error } = await uploadTcEvidence(file, runId, null, 'actual')
    if (error) showError(error)
    else {
      showSuccess('Evidence uploaded.')
      await load()
    }
  }

  if (loading) return <LoadingState message="Loading evidence..." />

  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-100">Evidence Manager</h1>
      <div className="flex flex-wrap gap-2 items-end">
        <select className={inputClass} value={runId} onChange={(e) => setRunId(e.target.value)}>
          <option value="">All runs</option>
          {runs.map((r) => <option key={r.id} value={r.id}>{r.run_name}</option>)}
        </select>
        <label className="cursor-pointer rounded bg-blue-600 px-3 py-2 text-sm text-white">
          Upload file
          <input type="file" className="hidden" accept="image/*,.txt,.zip" onChange={onUpload} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {evidence.map((ev) => (
          <button key={ev.id} type="button" className="rounded-lg border border-gray-700 bg-gray-900 p-2 text-left" onClick={() => setLightbox(ev)}>
            {ev.file_type === 'screenshot' ? (
              <img src={`${base}/storage/v1/object/authenticated/testing-evidence/${ev.file_path}`} alt={ev.file_name} className="h-32 w-full object-cover rounded" />
            ) : (
              <div className="flex h-32 items-center justify-center bg-gray-800 text-gray-500">{ev.file_type}</div>
            )}
            <p className="mt-2 truncate text-xs text-gray-300">{ev.file_name}</p>
            <p className="text-xs text-gray-600">{ev.label}</p>
          </button>
        ))}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <div className="max-h-full max-w-full overflow-auto rounded bg-gray-900 p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-gray-200">{lightbox.file_name}</p>
            {lightbox.note && <p className="text-sm text-gray-400">{lightbox.note}</p>}
            <button type="button" className="mt-4 text-sm text-blue-400" onClick={() => setLightbox(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
