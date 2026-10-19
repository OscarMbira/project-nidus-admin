/**
 * AI Centre (monorepo v1272, PRD story 23 / D5, D16) — one Ask Nidus register.
 * Route: /ai/catalogue-entity?schema=public|sim&key=<entity_key>[&view=1] (friendly key, rule 13.1).
 * Register settings save through admin_ai_update_catalogue_entity; each field row is edited
 * in place and saved through admin_ai_upsert_catalogue_field (the column must exist in the view).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchAiCatalogue,
  PermissionGate,
  updateAiCatalogueEntity,
  upsertAiCatalogueField,
  useUnsavedChangesGuard,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminTable,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { SCHEMA_LABEL, entityPath } from './AiCataloguePage.jsx'

const DATA_TYPES = ['text', 'number', 'date', 'datetime', 'boolean', 'uuid']
const FLAGS = [['is_filterable', 'Filter'], ['is_groupable', 'Group'], ['is_summable', 'Total'], ['is_default', 'Shown by default'], ['is_active', 'On']]

const toForm = (e) => ({
  label: e?.label || '',
  label_singular: e?.label_singular || '',
  description: e?.description || '',
  route_template: e?.route_template || '',
  sort_order: e?.sort_order ?? 100,
  is_active: Boolean(e?.is_active),
  planner: (e?.editions || []).includes('planner'),
})

export function fieldToPayload(f) {
  return {
    field_key: f.field_key,
    label: f.label,
    description: f.description || '',
    data_type: f.data_type,
    is_filterable: Boolean(f.is_filterable),
    is_groupable: Boolean(f.is_groupable),
    is_summable: f.data_type === 'number' && Boolean(f.is_summable),
    is_default: Boolean(f.is_default),
    allowed_values: String(f.allowed_values_text ?? (f.allowed_values || []).join(', ')).split(',').map((s) => s.trim()).filter(Boolean),
    link_entity_key: f.link_entity_key || '',
    is_active: f.is_active !== false,
    sort_order: Number(f.sort_order) || 100,
  }
}

export default function AiCatalogueEntityPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const schema = params.get('schema') === 'sim' ? 'sim' : 'public'
  const key = params.get('key')
  const isViewOnly = params.get('view') === '1'
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [entity, setEntity] = useState(null)
  const [allKeys, setAllKeys] = useState([])
  const [form, setForm] = useState(toForm(null))
  const [baseline, setBaseline] = useState(toForm(null))
  const [tab, setTab] = useState('details')
  const [editField, setEditField] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchAiCatalogue(schema)
    if (error) showError(String(error))
    const found = (data || []).find((e) => e.entity_key === key) || null
    setAllKeys((data || []).map((e) => e.entity_key))
    setEntity(found)
    setForm(toForm(found))
    setBaseline(toForm(found))
    setLoading(false)
  }
  useEffect(() => { load() }, [schema, key])

  const isDirty = useMemo(() => !isViewOnly && (JSON.stringify(form) !== JSON.stringify(baseline) || Boolean(editField)), [form, baseline, editField, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved catalogue changes.')
  const goBack = () => requestNavigation(`/ai/catalogue?schema=${schema}`)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const saveEntity = (e) => {
    e.preventDefault()
    if (!form.label.trim()) { showError('A register name is required.'); return }
    const editions = schema === 'sim' ? ['platform'] : (form.planner ? ['platform', 'planner'] : ['platform'])
    const changes = {
      label: form.label.trim(), label_singular: form.label_singular.trim() || null, description: form.description.trim(),
      route_template: form.route_template.trim(), sort_order: Number(form.sort_order) || 100, is_active: form.is_active, editions,
    }
    confirm({
      title: `Save ${form.label}?`,
      message: 'Ask Nidus picks up the change on the next question.',
      confirmLabel: 'Save',
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = await updateAiCatalogueEntity(schema, key, changes, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess(`${key} updated (${SCHEMA_LABEL[schema]}).`)
        await load()
      },
    })
  }

  const saveField = () => {
    const payload = fieldToPayload(editField)
    if (!/^[a-z][a-z0-9_]*$/.test(payload.field_key)) { showError('Choose a column from the view.'); return }
    if (!payload.label.trim()) { showError('A field label is required.'); return }
    confirm({
      title: `Save field ${payload.label}?`,
      message: payload.is_active ? 'Ask Nidus can use this field from the next question.' : 'Ask Nidus will no longer use this field.',
      confirmLabel: 'Save field',
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = await upsertAiCatalogueField(schema, key, payload, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess(`${key}.${payload.field_key} saved.`)
        setEditField(null)
        await load()
      },
    })
  }

  if (loading) return <LoadingState message="Loading register..." />
  if (!entity) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Register not found" description={`${key} is not in the ${SCHEMA_LABEL[schema]} catalogue.`} />
        <button type="button" onClick={() => navigate(`/ai/catalogue?schema=${schema}`)} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Back to catalogue</button>
      </div>
    )
  }

  const usedColumns = new Set((entity.fields || []).map((f) => f.field_key))
  const unusedColumns = (entity.view_columns || []).filter((c) => !usedColumns.has(c) && !c.startsWith('__'))
  const fieldRows = [...(entity.fields || [])].sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.field_key).localeCompare(String(b.field_key)))

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Back to catalogue</button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{entity.label} <span className="text-sm font-normal text-gray-500">({SCHEMA_LABEL[schema]})</span></h1>
          <p className="font-mono text-xs text-gray-500">{entity.entity_key} · view {schema}.{entity.view_name}</p>
        </div>
        {isViewOnly ? (
          <PermissionGate permission="ai.catalogue.edit">
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(entityPath(schema, key))} />
          </PermissionGate>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" form="ai-entity-form" disabled={JSON.stringify(form) === JSON.stringify(baseline)}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60">Save register</button>
          </div>
        )}
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && (
        <AuditDetailsPanel description="This catalogue register.">
          <AuditCard title="Identity">
            <AuditField label="Key" value={entity.entity_key} />
            <AuditField label="App" value={SCHEMA_LABEL[schema]} />
          </AuditCard>
          <AuditCard title="Classification">
            <AuditField label="Editions" value={(entity.editions || []).join(', ')} />
            <AuditField label="On" value={entity.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history">
            <AuditTimestampPair dateLabel="Created at" value={entity.created_at} />
            <AuditTimestampPair dateLabel="Last updated" value={entity.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <>
          <AdminForm id="ai-entity-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : saveEntity}>
            <fieldset disabled={isViewOnly} className="grid gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 md:grid-cols-2">
              <AdminField label="Register name" required><input className={inputClass} value={form.label} onChange={set('label')} /></AdminField>
              <AdminField label="One record is called"><input className={inputClass} value={form.label_singular} onChange={set('label_singular')} placeholder="e.g. risk" /></AdminField>
              <div className="md:col-span-2">
                <AdminField label="Description (the model reads this to decide when to use the register)">
                  <textarea className={inputClass} rows={3} value={form.description} onChange={set('description')} />
                </AdminField>
              </div>
              <AdminField label="Record link (route template)"><input className={`${inputClass} font-mono`} value={form.route_template} onChange={set('route_template')} placeholder="/risks/{id}" /></AdminField>
              <AdminField label="Order"><input className={inputClass} type="number" value={form.sort_order} onChange={set('sort_order')} /></AdminField>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Ask Nidus and Report Builder may use this register
              </label>
              {schema === 'public' && (
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.planner} onChange={set('planner')} /> Also available in the Project Planner edition
                </label>
              )}
            </fieldset>
          </AdminForm>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Fields</h2>
              {!isViewOnly && unusedColumns.length > 0 && !editField && (
                <PermissionGate permission="ai.catalogue.edit">
                  <AdminActionButton onClick={() => setEditField({ field_key: '', label: '', description: '', data_type: 'text', is_filterable: true, is_active: true, sort_order: 100, isNew: true })}>
                    Add a field
                  </AdminActionButton>
                </PermissionGate>
              )}
            </div>

            {editField && (
              <div className="grid gap-3 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4 md:grid-cols-3">
                <AdminField label="Column" required>
                  {editField.isNew ? (
                    <select className={inputClass} value={editField.field_key} onChange={(e) => setEditField((f) => ({ ...f, field_key: e.target.value }))}>
                      <option value="">Choose a column…</option>
                      {unusedColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : <input className={`${inputClass} font-mono`} value={editField.field_key} disabled />}
                </AdminField>
                <AdminField label="Label" required><input className={inputClass} value={editField.label} onChange={(e) => setEditField((f) => ({ ...f, label: e.target.value }))} /></AdminField>
                <AdminField label="Data type">
                  <select className={inputClass} value={editField.data_type} onChange={(e) => setEditField((f) => ({ ...f, data_type: e.target.value }))}>
                    {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </AdminField>
                <div className="md:col-span-2">
                  <AdminField label="Description"><input className={inputClass} value={editField.description || ''} onChange={(e) => setEditField((f) => ({ ...f, description: e.target.value }))} /></AdminField>
                </div>
                <AdminField label="Links to register">
                  <select className={inputClass} value={editField.link_entity_key || ''} onChange={(e) => setEditField((f) => ({ ...f, link_entity_key: e.target.value }))}>
                    <option value="">None</option>
                    {allKeys.filter((k) => k !== key).map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </AdminField>
                <div className="md:col-span-2">
                  <AdminField label="Allowed values (comma-separated, optional)">
                    <input className={inputClass} value={editField.allowed_values_text ?? (editField.allowed_values || []).join(', ')}
                      onChange={(e) => setEditField((f) => ({ ...f, allowed_values_text: e.target.value }))} />
                  </AdminField>
                </div>
                <AdminField label="Order"><input className={inputClass} type="number" value={editField.sort_order ?? 100} onChange={(e) => setEditField((f) => ({ ...f, sort_order: e.target.value }))} /></AdminField>
                <div className="flex flex-wrap gap-4 md:col-span-3">
                  {FLAGS.map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={editField[k] !== undefined ? Boolean(editField[k]) : k === 'is_active'}
                        disabled={k === 'is_summable' && editField.data_type !== 'number'}
                        onChange={(e) => setEditField((f) => ({ ...f, [k]: e.target.checked }))} /> {label}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 md:col-span-3">
                  <button type="button" onClick={saveField} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600">Save field</button>
                  <button type="button" onClick={() => setEditField(null)} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
                </div>
              </div>
            )}

            <AdminTable
              rows={fieldRows}
              idKey="field_key"
              pageSize={50}
              columns={[
                { key: 'label', label: 'Field', render: (f) => <span className="font-medium">{f.label}</span> },
                { key: 'field_key', label: 'Column', render: (f) => <span className="font-mono text-blue-600 dark:text-blue-400">{f.field_key}</span> },
                { key: 'data_type', label: 'Type' },
                { key: 'flags', label: 'Use', sortable: false, render: (f) => FLAGS.filter(([k]) => k !== 'is_active' && f[k]).map(([, l]) => l).join(', ') || '—' },
                { key: 'link_entity_key', label: 'Links to', render: (f) => f.link_entity_key || '—' },
                { key: 'is_active', label: 'On', render: (f) => (f.is_active === false ? 'No' : 'Yes') },
                {
                  key: 'actions', label: 'Actions', sortable: false,
                  render: (f) => (!isViewOnly && (
                    <PermissionGate permission="ai.catalogue.edit">
                      <AdminIconActionButton variant="edit" label="Edit field" onClick={() => setEditField({ ...f })} />
                    </PermissionGate>
                  )),
                },
              ]}
            />
          </section>
        </>
      )}
      {modal}
    </div>
  )
}
