import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createEmailTemplate,
  fetchEmailTemplateById,
  sendTestEmail,
  updateEmailTemplate,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  EmptyState,
  LoadingState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const CATEGORIES = ['auth', 'billing', 'support', 'system']
const TARGET_SYSTEMS = ['platform', 'simulator', 'all']

const EMPTY_FORM = {
  template_key: '',
  template_name: '',
  subject: '',
  body_html: '<p></p>',
  body_text: '',
  category: 'system',
  target_system: 'all',
  variables_json: '[]',
  is_active: true,
}

function templateToForm(template) {
  return {
    template_key: template.template_key || '',
    template_name: template.template_name || '',
    subject: template.subject || '',
    body_html: template.body_html || '<p></p>',
    body_text: template.body_text || '',
    category: template.category || 'system',
    target_system: template.target_system || 'all',
    variables_json: JSON.stringify(template.variables || [], null, 2),
    is_active: template.is_active !== false,
  }
}

function parseVariables(jsonText) {
  const parsed = JSON.parse(jsonText)
  if (!Array.isArray(parsed)) throw new Error('Variables must be a JSON array.')
  return parsed
}

function renderPreview(text, variables) {
  if (!text) return ''
  let result = text
  for (const variable of variables) {
    const name = variable?.name || variable
    if (!name) continue
    const sample = `[${name}]`
    result = result.replaceAll(`{{${name}}}`, sample)
  }
  return result
}

export default function EmailTemplateEditorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('id')
  const isEdit = Boolean(templateId)

  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [error, setError] = useState(null)
  const [template, setTemplate] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [testRecipient, setTestRecipient] = useState('')

  useEffect(() => {
    if (!isEdit) return undefined

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchEmailTemplateById(templateId).then(({ data, error: fetchError }) => {
      if (cancelled) return
      if (fetchError || !data) {
        setError(fetchError?.message || String(fetchError) || 'Email template not found.')
        setTemplate(null)
      } else {
        setTemplate(data)
        setForm(templateToForm(data))
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [isEdit, templateId])

  const parsedVariables = useMemo(() => {
    try {
      return parseVariables(form.variables_json)
    } catch {
      return []
    }
  }, [form.variables_json])

  const previewSubject = useMemo(
    () => renderPreview(form.subject, parsedVariables),
    [form.subject, parsedVariables],
  )

  const previewHtml = useMemo(
    () => renderPreview(form.body_html, parsedVariables),
    [form.body_html, parsedVariables],
  )

  const insertVariable = (name) => {
    if (!name) return
    const token = `{{${name}}}`
    setForm((prev) => ({
      ...prev,
      body_html: `${prev.body_html}${prev.body_html.endsWith('>') ? '' : ' '}${token}`,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.template_key.trim() || !form.template_name.trim() || !form.subject.trim() || !form.body_html.trim()) {
      showError('Template key, name, subject, and HTML body are required.')
      return
    }

    let variables
    try {
      variables = parseVariables(form.variables_json)
    } catch (err) {
      showError(err.message || 'Invalid variables JSON.')
      return
    }

    const payload = {
      template_name: form.template_name.trim(),
      subject: form.subject.trim(),
      body_html: form.body_html,
      body_text: form.body_text.trim() || null,
      category: form.category,
      target_system: form.target_system,
      variables,
      is_active: form.is_active,
    }

    setSaving(true)
    const { error: mutationError } = isEdit
      ? await updateEmailTemplate(templateId, payload)
      : await createEmailTemplate({
        ...payload,
        template_key: form.template_key.trim(),
      })
    setSaving(false)

    if (mutationError) {
      showError(mutationError.message || String(mutationError))
      return
    }

    showSuccess(isEdit ? 'Template updated.' : 'Template created.')
    navigate('/content/email-templates')
  }

  const handleTestSend = async () => {
    if (!isEdit || !templateId) {
      showError('Save the template before sending a test email.')
      return
    }
    const email = testRecipient.trim()
    if (!email) {
      showError('Enter a recipient email address.')
      return
    }
    setSendingTest(true)
    const { error: sendError } = await sendTestEmail(templateId, email)
    setSendingTest(false)
    if (sendError) {
      showError(sendError.message || String(sendError))
      return
    }
    showSuccess(`Test email sent to ${email}.`)
  }

  if (loading) return <LoadingState message={isEdit ? 'Loading template...' : 'Loading editor...'} />
  if (isEdit && error) return <div className="p-6 text-red-400">{error}</div>
  if (isEdit && !template) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Template not found" description="Select a valid email template to edit." />
        <button
          type="button"
          className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
          onClick={() => navigate('/content/email-templates')}
        >
          Back to Templates
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">
            {isEdit ? 'Edit Email Template' : 'Create Email Template'}
          </h1>
          <p className="text-sm text-gray-500">
            {isEdit ? `Editing ${template.template_key}` : 'Define subject, HTML body, and template variables.'}
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
          onClick={() => navigate('/content/email-templates')}
        >
          Back to Templates
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 md:p-6">
          <AdminForm onSubmit={handleSubmit} className="space-y-4">
            <AdminField label="Template Key" required>
              <input
                className={inputClass}
                value={form.template_key}
                readOnly={isEdit}
                onChange={(e) => setForm((prev) => ({ ...prev, template_key: e.target.value }))}
                placeholder="welcome_email"
              />
            </AdminField>
            <AdminField label="Template Name" required>
              <input
                className={inputClass}
                value={form.template_name}
                onChange={(e) => setForm((prev) => ({ ...prev, template_name: e.target.value }))}
              />
            </AdminField>
            <AdminField label="Subject" required>
              <input
                className={inputClass}
                value={form.subject}
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
              />
            </AdminField>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Category">
                <select
                  className={inputClass}
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Target System">
                <select
                  className={inputClass}
                  value={form.target_system}
                  onChange={(e) => setForm((prev) => ({ ...prev, target_system: e.target.value }))}
                >
                  {TARGET_SYSTEMS.map((sys) => (
                    <option key={sys} value={sys}>{sys}</option>
                  ))}
                </select>
              </AdminField>
            </div>
            <AdminField label="HTML Body" required>
              <textarea
                className={`${inputClass} min-h-[180px] font-mono text-xs`}
                value={form.body_html}
                onChange={(e) => setForm((prev) => ({ ...prev, body_html: e.target.value }))}
              />
            </AdminField>
            <AdminField label="Plain Text Body">
              <textarea
                className={`${inputClass} min-h-[100px] font-mono text-xs`}
                value={form.body_text}
                onChange={(e) => setForm((prev) => ({ ...prev, body_text: e.target.value }))}
              />
            </AdminField>
            <AdminField label="Variables (JSON)">
              <textarea
                className={`${inputClass} min-h-[120px] font-mono text-xs`}
                value={form.variables_json}
                onChange={(e) => setForm((prev) => ({ ...prev, variables_json: e.target.value }))}
              />
            </AdminField>
            {parsedVariables.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-gray-500">Insert variable:</span>
                {parsedVariables.map((variable) => {
                  const name = variable?.name || variable
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => insertVariable(name)}
                      className="rounded border border-gray-600 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-800"
                    >
                      {`{{${name}}}`}
                    </button>
                  )
                })}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Active
            </label>
            <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
              <button
                type="button"
                onClick={() => navigate('/content/email-templates')}
                className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-60"
              >
                {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save' : 'Create')}
              </button>
            </div>
          </AdminForm>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 md:p-6">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">Live Preview</h2>
            <p className="mb-4 text-sm text-gray-300">
              <span className="text-gray-500">Subject: </span>
              {previewSubject || '—'}
            </p>
            <div
              className="prose prose-invert max-w-none rounded border border-gray-800 bg-white p-4 text-gray-900"
              dangerouslySetInnerHTML={{ __html: previewHtml || '<p></p>' }}
            />
          </div>

          {isEdit && (
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 md:p-6">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">Test Send</h2>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  className={inputClass}
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="recipient@example.com"
                />
                <button
                  type="button"
                  disabled={sendingTest}
                  onClick={handleTestSend}
                  className="rounded bg-violet-700 px-4 py-2 text-sm text-white hover:bg-violet-600 disabled:opacity-60"
                >
                  {sendingTest ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
