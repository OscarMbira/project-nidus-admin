import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deactivateDocumentationGuide,
  getDocumentationGuides,
  getDocumentationGuideById,
  loadDocumentationFile,
  PermissionGate,
  saveDocumentationToStorage,
  upsertDocumentationGuide,
} from '@nidus-admin/shared'
import { AdminField, AdminForm, EmptyState, inputClass, LoadingState, useToast } from '@nidus-admin/ui'
import MarkdownView from '../components/MarkdownView.jsx'

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function DocsEditorPage() {
  const { showSuccess, showError } = useToast()
  const [guides, setGuides] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    guide_id: '', title: '', file_name: '', module: 'general', category: 'Reference', description: '', sort_order: 0,
  })
  const [markdown, setMarkdown] = useState('# New Guide\n\n')

  const loadGuides = () => getDocumentationGuides().then(({ data }) => setGuides(data || []))

  useEffect(() => {
    loadGuides().then(() => setLoading(false))
    const params = new URLSearchParams(window.location.search)
    const guideId = params.get('guide')
    if (guideId) selectGuide(guideId)
  }, [])

  const selectGuide = async (guideId) => {
    const { data: g } = await getDocumentationGuideById(guideId)
    if (!g) return
    setForm({
      guide_id: g.guide_id,
      title: g.title,
      file_name: g.file_name,
      module: g.module,
      category: g.category || '',
      description: g.description || '',
      sort_order: g.sort_order || 0,
    })
    const { data } = await loadDocumentationFile(g.file_name, g.module)
    setMarkdown(data)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setBusy(true)
    const fileName = form.file_name || `${form.title.replace(/\s+/g, '_')}.md`
    const guideId = form.guide_id || slugify(form.title)
    const { error: storageErr } = await saveDocumentationToStorage(form.module, fileName, markdown)
    if (storageErr) {
      setBusy(false)
      showError(storageErr)
      return
    }
    const { error } = await upsertDocumentationGuide({ ...form, guide_id: guideId, file_name: fileName })
    setBusy(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Guide saved to Storage and index.')
    await loadGuides()
  }

  const handleDelete = async () => {
    if (!form.guide_id || !confirm('Deactivate this guide?')) return
    setBusy(true)
    await deactivateDocumentationGuide(form.guide_id)
    setBusy(false)
    showSuccess('Guide deactivated.')
    await loadGuides()
  }

  if (loading) return <LoadingState message="Loading editor..." />

  return (
    <PermissionGate permission="docs.manage" fallback={<p className="p-6 text-gray-500">docs.manage permission required.</p>}>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-100">Documentation Editor</h1>
          <Link to="/docs-centre" className="text-sm text-blue-400">Browse docs</Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <aside className="rounded-lg border border-gray-700 bg-gray-900 p-3 lg:col-span-1">
            <button type="button" className="mb-2 text-sm text-blue-400" onClick={() => { setForm({ guide_id: '', title: '', file_name: '', module: 'general', category: 'Reference', description: '', sort_order: 0 }); setMarkdown('# New Guide\n\n') }}>+ New guide</button>
            {!guides.length ? <EmptyState title="No guides" /> : (
              <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
                {guides.map((g) => (
                  <li key={g.guide_id}>
                    <button type="button" className="text-left text-gray-300 hover:text-white" onClick={() => selectGuide(g.guide_id)}>{g.title}</button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div className="lg:col-span-3 space-y-4">
            <AdminForm onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
              <AdminField label="Title"><input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></AdminField>
              <AdminField label="Module"><input className={inputClass} value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} required /></AdminField>
              <AdminField label="Category"><input className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></AdminField>
              <AdminField label="File name"><input className={inputClass} value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} placeholder="Guide_Name.md" /></AdminField>
              <AdminField label="Description" className="sm:col-span-2"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></AdminField>
              <div className="sm:col-span-2 flex gap-2">
                <button type="submit" disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Save</button>
                {form.guide_id && <button type="button" disabled={busy} onClick={handleDelete} className="rounded border border-red-700 px-4 py-2 text-sm text-red-400">Deactivate</button>}
              </div>
            </AdminForm>

            <div className="grid gap-4 lg:grid-cols-2">
              <textarea className={`${inputClass} min-h-[400px] font-mono text-sm`} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
              <div className="rounded-lg border border-gray-700 bg-gray-950 p-4 overflow-auto max-h-[500px]">
                <p className="mb-2 text-xs uppercase text-gray-500">Preview</p>
                <MarkdownView content={markdown} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PermissionGate>
  )
}
