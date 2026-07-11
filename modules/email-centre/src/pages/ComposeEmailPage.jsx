import { useEffect, useMemo, useState } from 'react'
import {
  extractTemplateVariables,
  fetchEmailTemplates,
  renderEmailTemplate,
  searchUsersForEmail,
  sendComposedEmail,
} from '@nidus-admin/shared'
import { AdminField, inputClass, LoadingState, useToast } from '@nidus-admin/ui'

const STEPS = ['Template', 'Recipient', 'Variables', 'Preview']

export default function ComposeEmailPage() {
  const { showSuccess, showError } = useToast()
  const [step, setStep] = useState(0)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [recipient, setRecipient] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [userHits, setUserHits] = useState([])
  const [variables, setVariables] = useState({})

  useEffect(() => {
    fetchEmailTemplates({ activeOnly: true }).then(({ data }) => {
      setTemplates(data || [])
      setLoading(false)
    })
  }, [])

  const template = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId])
  const varNames = useMemo(() => (template ? extractTemplateVariables(template) : []), [template])
  const previewSubject = template ? renderEmailTemplate(template.subject, variables) : ''
  const previewHtml = template ? renderEmailTemplate(template.body_html, variables) : ''

  useEffect(() => {
    if (!userSearch.trim()) { setUserHits([]); return }
    const t = setTimeout(() => {
      searchUsersForEmail(userSearch).then(({ data }) => setUserHits(data || []))
    }, 300)
    return () => clearTimeout(t)
  }, [userSearch])

  const handleSend = async () => {
    if (!template || !recipient) return
    setSending(true)
    const { data, error } = await sendComposedEmail({
      recipientEmail: recipient,
      templateKey: template.template_key,
      subject: previewSubject,
      bodyHtml: previewHtml,
      targetSystem: template.target_system,
      metadata: { variables, compose: true },
    })
    setSending(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(`Email sent${data?.messageId ? ` (${data.messageId})` : ''}.`)
    setStep(0)
    setRecipient('')
    setVariables({})
  }

  if (loading) return <LoadingState message="Loading templates..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Compose Email</h1>
        <p className="text-sm text-gray-500">Send a templated email to an individual user.</p>
      </div>

      <div className="flex gap-2 text-xs uppercase tracking-wide text-gray-500">
        {STEPS.map((label, i) => (
          <span key={label} className={i === step ? 'text-blue-400' : ''}>{i + 1}. {label}</span>
        ))}
      </div>

      {step === 0 && (
        <div className="max-w-lg space-y-4">
          <AdminField label="Template">
            <select className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Select template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.template_name} ({t.template_key})</option>
              ))}
            </select>
          </AdminField>
          <button type="button" disabled={!templateId} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => setStep(1)}>Next</button>
        </div>
      )}

      {step === 1 && (
        <div className="max-w-lg space-y-4">
          <AdminField label="Search user">
            <input className={inputClass} value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Name or email..." />
          </AdminField>
          {userHits.length > 0 && (
            <ul className="rounded border border-gray-700 bg-gray-900 text-sm">
              {userHits.map((u) => (
                <li key={u.id}>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-gray-800" onClick={() => { setRecipient(u.email); setUserSearch(u.full_name || u.email) }}>
                    {u.full_name || 'Unnamed'} — {u.email}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AdminField label="Recipient email">
            <input className={inputClass} value={recipient} onChange={(e) => setRecipient(e.target.value)} type="email" />
          </AdminField>
          <div className="flex gap-2">
            <button type="button" className="rounded border border-gray-600 px-4 py-2 text-sm" onClick={() => setStep(0)}>Back</button>
            <button type="button" disabled={!recipient} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => setStep(2)}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-lg space-y-4">
          {varNames.map((name) => (
            <AdminField key={name} label={name}>
              <input className={inputClass} value={variables[name] || ''} onChange={(e) => setVariables((v) => ({ ...v, [name]: e.target.value }))} />
            </AdminField>
          ))}
          {!varNames.length && <p className="text-sm text-gray-500">No template variables required.</p>}
          <div className="flex gap-2">
            <button type="button" className="rounded border border-gray-600 px-4 py-2 text-sm" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm text-white" onClick={() => setStep(3)}>Preview</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded border border-gray-700 bg-gray-900 p-4">
            <p className="text-sm text-gray-400">To: {recipient}</p>
            <p className="mt-2 font-medium text-gray-100">{previewSubject}</p>
            <div className="prose prose-invert mt-4 max-w-none text-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded border border-gray-600 px-4 py-2 text-sm" onClick={() => setStep(2)}>Back</button>
            <button type="button" disabled={sending} className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={handleSend}>
              {sending ? 'Sending...' : 'Send email'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
