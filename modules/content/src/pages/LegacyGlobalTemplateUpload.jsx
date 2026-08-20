import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createGlobalTemplate,
  fetchGlobalTemplateById,
  publishGlobalTemplate,
  globalTemplateDetailPath,
  PermissionGate,
  getAdminStorageClient,
} from '@nidus-admin/shared'
import { useToast, DetailAuditTabList } from '@nidus-admin/ui'

/**
 * System Admin — Track B/C Global-tier upload into global_template_library,
 * then optional publish → Platform/Simulator via sync_global_template_node.
 */
export default function LegacyGlobalTemplateUpload() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [domain, setDomain] = useState('legacy_document')
  const [listType, setListType] = useState('risk_register')
  const [title, setTitle] = useState('')
  const [docCategory, setDocCategory] = useState('other')
  const [file, setFile] = useState(null)
  const [rowsJson, setRowsJson] = useState('[]')
  const [busy, setBusy] = useState(false)
  const [publishNotes, setPublishNotes] = useState('Publish legacy template from Admin upload')
  const [detailTab, setDetailTab] = useState('details')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      showError('Title is required')
      return
    }
    setBusy(true)
    try {
      let payload
      if (domain === 'legacy_document') {
        if (!file) throw new Error('Select a Word/PDF/PowerPoint file')
        const storage = getAdminStorageClient()
        if (!storage?.storage) throw new Error('Storage client not configured')
        const id = crypto.randomUUID()
        const safeName = String(file.name || 'upload.bin').replace(/[^\w.\-]+/g, '_')
        const path = `global/${id}/${safeName}`
        const { error: upErr } = await storage.storage
          .from('legacy-templates')
          .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })
        if (upErr) throw upErr
        payload = {
          doc_category: docCategory,
          original_filename: file.name,
          storage_bucket: 'legacy-templates',
          storage_path: path,
          file_size: file.size,
          mime_type: file.type || null,
          extracted_text: '',
        }
      } else {
        let rows
        try {
          rows = JSON.parse(rowsJson || '[]')
        } catch {
          throw new Error('Rows must be valid JSON array')
        }
        if (!Array.isArray(rows)) throw new Error('Rows must be a JSON array')
        payload = {
          list_type: listType,
          rows,
          column_mapping: {},
        }
      }

      const { data: id, error } = await createGlobalTemplate({
        domain,
        name: title.trim(),
        category: domain === 'legacy_document' ? docCategory : listType,
        payload,
      })
      if (error) throw new Error(typeof error === 'string' ? error : 'Create failed')

      if (publishNotes.trim()) {
        const { error: pubErr } = await publishGlobalTemplate(id, publishNotes.trim())
        if (pubErr) {
          showError(`Created but publish failed: ${pubErr}`)
          const { data: created } = await fetchGlobalTemplateById(id)
          navigate(globalTemplateDetailPath(created || { id }))
          return
        }
      }

      showSuccess('Legacy template created and published to Platform & Simulator.')
      const { data: created } = await fetchGlobalTemplateById(id)
      navigate(globalTemplateDetailPath(created || { id }))
    } catch (err) {
      showError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PermissionGate
      permission="content.global_templates.edit"
      fallback={<div className="p-6 text-sm text-gray-400">No permission.</div>}
    >
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
        <div>
          <Link to="/content/global-template-library" className="text-sm text-blue-400 hover:underline">
            ← Global Template Library
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-100">Upload legacy Global template</h1>
          <p className="text-sm text-gray-500">
            Parent library upload for reference documents or structured lists. Publish fans out via the shared sync RPC.
          </p>
        </div>

        <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

        {detailTab === 'audit' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Audit details appear on the Global Template Library record after this upload is saved (see the record's own Audit details tab).
          </p>
        )}

        {detailTab === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-4">
          <label className="block text-sm text-gray-300">
            Domain
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
            >
              <option value="legacy_document">Reference document (Track B)</option>
              <option value="structured_list">Structured list (Track C)</option>
            </select>
          </label>

          <label className="block text-sm text-gray-300">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
              required
            />
          </label>

          {domain === 'legacy_document' ? (
            <>
              <label className="block text-sm text-gray-300">
                Category
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
                >
                  <option value="charter">Charter</option>
                  <option value="brd">BRD</option>
                  <option value="status_report">Status report</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-sm text-gray-300">
                File
                <input
                  type="file"
                  accept=".doc,.docx,.pdf,.ppt,.pptx"
                  className="mt-1 block w-full text-sm text-gray-400"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm text-gray-300">
                List type
                <select
                  value={listType}
                  onChange={(e) => setListType(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
                >
                  <option value="risk_register">Risk register</option>
                  <option value="raid_log">RAID log</option>
                  <option value="stakeholder_register">Stakeholder register</option>
                  <option value="budget">Budget</option>
                </select>
              </label>
              <label className="block text-sm text-gray-300">
                Rows (JSON array)
                <textarea
                  value={rowsJson}
                  onChange={(e) => setRowsJson(e.target.value)}
                  rows={8}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2 font-mono text-xs"
                />
              </label>
            </>
          )}

          <label className="block text-sm text-gray-300">
            Publish notes (required to publish after create)
            <input
              value={publishNotes}
              onChange={(e) => setPublishNotes(e.target.value)}
              className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Create & publish'}
          </button>
        </form>
        )}
      </div>
    </PermissionGate>
  )
}
