/**
 * AI Centre (monorepo v1272, PRD story 7 / D1) — which approved model handles each kind of work, and
 * each model's price (USD per 1M tokens) used to turn tokens into credits. No model IDs are in
 * app code: the edge functions read these values (cached up to 30 seconds).
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchAiSettings, PermissionGate, updateAiSettings, useCurrentAdmin, useUnsavedChangesGuard, validateModelRouting } from '@nidus-admin/shared'
import { AdminField, AdminIconActionButton, AdminTable, EmptyState, LoadingState, inputClass, useConfirmAction, useToast } from '@nidus-admin/ui'

const TIERS = [
  ['model_routing', 'Routing and classification', 'Decides whether a question is simple or needs several steps.'],
  ['model_quick', 'Quick answers', 'Simple look-ups and counts; NPC replies; short text.'],
  ['model_agent', 'Agent work and drafting', 'Multi-step questions, status report drafts, meeting filing, assessments.'],
]
const PRICE_KEYS = [['input', 'Input'], ['output', 'Output'], ['cache_read', 'Cache read'], ['cache_write', 'Cache write']]

const toForm = (s) => ({
  approved_models: [...(s?.approved_models || [])],
  model_routing: s?.model_routing || '',
  model_quick: s?.model_quick || '',
  model_agent: s?.model_agent || '',
  model_prices: JSON.parse(JSON.stringify(s?.model_prices || {})),
})

export default function AiModelsPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const { hasPermission } = useCurrentAdmin()
  const canEdit = hasPermission('ai.settings.edit')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(toForm(null))
  const [baseline, setBaseline] = useState(toForm(null))
  const [errors, setErrors] = useState({})
  const [newModel, setNewModel] = useState('')

  const load = async () => {
    const { data, error } = await fetchAiSettings()
    if (error) showError(String(error))
    setForm(toForm(data))
    setBaseline(toForm(data))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline])
  useUnsavedChangesGuard(isDirty, 'You have unsaved model changes.')

  const setPrice = (model, key, value) => setForm((f) => ({
    ...f, model_prices: { ...f.model_prices, [model]: { ...(f.model_prices[model] || {}), [key]: value === '' ? '' : Number(value) } },
  }))
  const addModel = () => {
    const id = newModel.trim()
    if (!id || form.approved_models.includes(id)) return
    setForm((f) => ({ ...f, approved_models: [...f.approved_models, id], model_prices: { ...f.model_prices, [id]: f.model_prices[id] || { input: '', output: '' } } }))
    setNewModel('')
  }
  const removeModel = (id) => setForm((f) => {
    const prices = { ...f.model_prices }
    delete prices[id]
    return { ...f, approved_models: f.approved_models.filter((m) => m !== id), model_prices: prices }
  })

  const save = () => {
    const found = validateModelRouting(form)
    setErrors(found)
    if (Object.keys(found).length) { showError('Please fix the highlighted fields.'); return }
    confirm({
      title: 'Save model routing and prices?',
      message: 'All AI functions use the new models within about a minute.',
      confirmLabel: 'Save',
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = await updateAiSettings(form, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess('Model routing updated.')
        await load()
      },
    })
  }

  if (loading) return <LoadingState message="Loading models..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Models & routing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Choose which approved model does each kind of work. Prices are USD per 1 million tokens.</p>
        </div>
        <PermissionGate permission="ai.settings.edit">
          <div className="flex gap-2">
            <button type="button" disabled={!isDirty} onClick={() => { setForm(baseline); setErrors({}) }}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 disabled:opacity-50">Discard</button>
            <button type="button" disabled={!isDirty} onClick={save}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">Save changes</button>
          </div>
        </PermissionGate>
      </div>

      <fieldset disabled={!canEdit} className="space-y-6">
        <section className="grid gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 md:grid-cols-3">
          {TIERS.map(([key, label, help]) => (
            <AdminField key={key} label={label} required error={errors[key]}>
              <select className={inputClass} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}>
                <option value="">Choose…</option>
                {form.approved_models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>
            </AdminField>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Approved models and prices</h2>
          {errors.approved_models && <p className="text-sm text-red-600 dark:text-red-400">{errors.approved_models}</p>}
          {!form.approved_models.length ? (
            <EmptyState title="No approved models" description="Add a model ID below." />
          ) : (
            <AdminTable
              rows={form.approved_models.map((m) => ({ id: m, model: m }))}
              pageSize={25}
              columns={[
                { key: 'model', label: 'Model ID', render: (r) => <span className="font-mono text-xs">{r.model}</span> },
                ...PRICE_KEYS.map(([k, label]) => ({
                  key: k, label, sortable: false,
                  render: (r) => (
                    <div>
                      <input className={`${inputClass} w-24`} type="number" min="0" step="0.01"
                        value={form.model_prices[r.model]?.[k] ?? ''} onChange={(e) => setPrice(r.model, k, e.target.value)}
                        placeholder={k.startsWith('cache') ? 'default' : ''} />
                      {k === 'output' && errors[`price:${r.model}`] && <p className="text-xs text-red-600 dark:text-red-400">{errors[`price:${r.model}`]}</p>}
                    </div>
                  ),
                })),
                {
                  key: 'actions', label: 'Actions', sortable: false,
                  render: (r) => <AdminIconActionButton variant="delete" label="Remove model" onClick={() => removeModel(r.model)} />,
                },
              ]}
            />
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className={`${inputClass} sm:w-80`} value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="Model ID, e.g. claude-sonnet-5-5" />
            <button type="button" onClick={addModel} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Add model</button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Cache prices left blank default to 10% (read) and 125% (write) of the input price.</p>
        </section>
      </fieldset>
      {modal}
    </div>
  )
}
