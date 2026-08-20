import { useState, useEffect } from 'react'
import { ViewToggle } from '@nidus-admin/ui'
import {
  listRestoreCandidates,
  appendRestoredField,
  cloneFieldForRestore,
  reorderArray,
} from '@nidus-admin/shared'

const PROCESS_GROUPS = [
  { value: 'initiating', label: 'Initiating' },
  { value: 'planning', label: 'Planning' },
  { value: 'executing', label: 'Executing' },
  { value: 'monitoring_controlling', label: 'Monitoring & Controlling' },
  { value: 'closing', label: 'Closing' },
  { value: 'agile', label: 'Agile' },
]

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'money', label: 'Money' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'checkbox', label: 'Checkbox' },
]

const inputClass = 'mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100'
const labelClass = 'block text-sm text-gray-700 dark:text-gray-300'
const cellInputClass = 'w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs text-gray-900 dark:text-gray-100'

const DEFAULT_COLUMN_ORDER = ['label', 'key', 'type', 'required', 'help', 'sample', 'options']
/** Content Coverage deep-link: Sample + Guidance first */
const SAMPLE_FOCUS_COLUMN_ORDER = ['sample', 'help', 'label', 'key', 'type', 'required', 'options']
const COLUMN_LABELS = {
  label: 'Label',
  key: 'Field key',
  type: 'Type',
  required: 'Required',
  help: 'Guidance',
  sample: 'Sample / example',
  options: 'Options',
}
const COLUMN_WIDTHS = {
  label: '16%',
  key: '13%',
  type: '10%',
  required: '6%',
  help: '16%',
  sample: '16%',
  options: '15%',
}

function normalizeColumnOrder(order) {
  if (!Array.isArray(order)) return [...DEFAULT_COLUMN_ORDER]
  const cleaned = order.filter((c) => DEFAULT_COLUMN_ORDER.includes(c))
  const missing = DEFAULT_COLUMN_ORDER.filter((c) => !cleaned.includes(c))
  return [...cleaned, ...missing]
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64)
}

function emptyField(index = 0) {
  return {
    key: `field_${index + 1}`,
    label: `Field ${index + 1}`,
    type: 'text',
    required: false,
    options: [],
    help: '',
    sample: '',
  }
}

function emptySection(index = 0) {
  return {
    key: `section_${index + 1}`,
    title: `Section ${index + 1}`,
    fields: [emptyField()],
  }
}

function optionsToText(options) {
  if (!Array.isArray(options)) return ''
  return options.map((opt) => {
    if (opt == null) return ''
    if (typeof opt === 'string') return opt
    if (typeof opt === 'object') {
      const value = opt.value ?? opt.key ?? ''
      const label = opt.label ?? value
      return String(value) === String(label) ? String(label) : `${value}|${label}`
    }
    return String(opt)
  }).filter(Boolean).join('\n')
}

function textToOptions(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const pipe = line.indexOf('|')
      if (pipe === -1) return { value: line, label: line }
      const value = line.slice(0, pipe).trim()
      const label = line.slice(pipe + 1).trim() || value
      return { value, label }
    })
}

function schemaToEditor(schema) {
  const s = schema && typeof schema === 'object' && !Array.isArray(schema) ? schema : {}
  const sections = Array.isArray(s.sections) && s.sections.length
    ? s.sections.map((section, sIdx) => ({
        key: section.key || `section_${sIdx + 1}`,
        title: section.title || `Section ${sIdx + 1}`,
        fields: Array.isArray(section.fields) && section.fields.length
          ? section.fields.map((field, fIdx) => ({
              key: field.key || `field_${fIdx + 1}`,
              label: field.label || field.key || `Field ${fIdx + 1}`,
              type: field.type || 'text',
              required: Boolean(field.required),
              options: Array.isArray(field.options) ? field.options : [],
              help: field.help || field.guidance || '',
              sample: field.sample != null ? String(field.sample) : '',
            }))
          : [emptyField()],
      }))
    : [emptySection()]

  return {
    title: s.title || '',
    fieldColumnOrder: normalizeColumnOrder(s.fieldColumnOrder),
    sections,
  }
}

function editorToSchema(editor) {
  return {
    title: String(editor.title || '').trim(),
    fieldColumnOrder: normalizeColumnOrder(editor.fieldColumnOrder),
    sections: (editor.sections || []).map((section, sIdx) => ({
      key: slugify(section.key) || `section_${sIdx + 1}`,
      title: String(section.title || '').trim() || `Section ${sIdx + 1}`,
      fields: (section.fields || []).map((field, fIdx) => {
        const out = {
          key: slugify(field.key) || `field_${fIdx + 1}`,
          label: String(field.label || '').trim() || `Field ${fIdx + 1}`,
          type: field.type || 'text',
        }
        if (field.required) out.required = true
        if (field.help) out.help = String(field.help).trim()
        if (field.sample) out.sample = String(field.sample).trim()
        if (field.type === 'select') {
          out.options = textToOptions(optionsToText(field.options))
        }
        return out
      }),
    })),
  }
}

/**
 * Visual form_template payload editor (sections + fields).
 * Optional advanced JSON panel for power users.
 * Supports reinstate of removed / missing standard fields (append at section end).
 * @param {boolean} [readOnly] — lock field values (view or approval lock)
 * @param {boolean} [viewMode] — mode=view: allow table row drag-reorder + Save from parent
 */
export default function FormTemplatePayloadEditor({
  value,
  onChange,
  focusDefaults = false,
  readOnly = false,
  viewMode = false,
}) {
  const v = value || {}
  const schemaEditor = schemaToEditor(v.schema)
  const templateCode = String(v.template_code || '').trim().toUpperCase()
  /** Field row drag: Edit always; View when browsing (not approval-lock-only). */
  const canReorderFields = !readOnly || viewMode
  /** Content Coverage deep-link: fill in Sample/Guidance only — structure editing stays locked. */
  const contentOnly = focusDefaults && !readOnly
  const structuralLocked = readOnly || contentOnly
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [fieldsView, setFieldsView] = useState(focusDefaults ? 'table' : 'card')
  const [dragCol, setDragCol] = useState(null)
  const [dragField, setDragField] = useState(null)
  /** @type {Record<string, object[]>} session-removed fields by section key */
  const [removedBySection, setRemovedBySection] = useState({})
  const [restoreOpenFor, setRestoreOpenFor] = useState(null) // section index | null
  const [defaultsFocusApplied, setDefaultsFocusApplied] = useState(false)

  // Reset session-removed list when switching templates
  useEffect(() => {
    setRemovedBySection({})
    setRestoreOpenFor(null)
    setDefaultsFocusApplied(false)
  }, [templateCode])

  // Content Coverage: table view + Sample/Guidance columns first (once per template load)
  useEffect(() => {
    if (readOnly || !focusDefaults || defaultsFocusApplied) return
    setFieldsView('table')
    const nextEditor = {
      ...schemaToEditor(v.schema),
      fieldColumnOrder: normalizeColumnOrder(SAMPLE_FOCUS_COLUMN_ORDER),
    }
    onChange({ ...v, schema: editorToSchema(nextEditor) })
    setDefaultsFocusApplied(true)
    // intentionally omit v/onChange to run once when focusDefaults turns on for this template
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDefaults, defaultsFocusApplied, templateCode, readOnly])

  const set = (patch) => onChange({ ...v, ...patch })

  const updateSchema = (nextEditor) => {
    set({ schema: editorToSchema(nextEditor) })
  }

  const updateSection = (sIdx, patch) => {
    const sections = schemaEditor.sections.map((s, i) => (i === sIdx ? { ...s, ...patch } : s))
    updateSchema({ ...schemaEditor, sections })
  }

  const updateField = (sIdx, fIdx, patch) => {
    const sections = schemaEditor.sections.map((s, i) => {
      if (i !== sIdx) return s
      const fields = s.fields.map((f, j) => (j === fIdx ? { ...f, ...patch } : f))
      return { ...s, fields }
    })
    updateSchema({ ...schemaEditor, sections })
  }

  const addSection = () => {
    updateSchema({
      ...schemaEditor,
      sections: [...schemaEditor.sections, emptySection(schemaEditor.sections.length)],
    })
  }

  const removeSection = (sIdx) => {
    if (schemaEditor.sections.length <= 1) return
    updateSchema({
      ...schemaEditor,
      sections: schemaEditor.sections.filter((_, i) => i !== sIdx),
    })
  }

  const addField = (sIdx) => {
    const section = schemaEditor.sections[sIdx]
    updateSection(sIdx, {
      fields: [...section.fields, emptyField(section.fields.length)],
    })
  }

  const removeField = (sIdx, fIdx) => {
    const section = schemaEditor.sections[sIdx]
    if (section.fields.length <= 1) return
    const removed = cloneFieldForRestore(section.fields[fIdx])
    const sectionKey = section.key || `section_${sIdx + 1}`
    if (removed) {
      setRemovedBySection((prev) => {
        const list = [...(prev[sectionKey] || [])]
        if (!list.some((f) => f.key === removed.key)) list.push(removed)
        return { ...prev, [sectionKey]: list }
      })
    }
    updateSection(sIdx, {
      fields: section.fields.filter((_, i) => i !== fIdx),
    })
  }

  const restoreField = (sIdx, field) => {
    const section = schemaEditor.sections[sIdx]
    const sectionKey = section.key || `section_${sIdx + 1}`
    const nextFields = appendRestoredField(section.fields, field)
    if (nextFields.length === section.fields.length) return
    updateSection(sIdx, { fields: nextFields })
    setRemovedBySection((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter((f) => f.key !== field.key),
    }))
    setRestoreOpenFor(null)
  }

  const restoreCandidatesFor = (sIdx) => {
    const section = schemaEditor.sections[sIdx]
    if (!section) return []
    const sectionKey = section.key || `section_${sIdx + 1}`
    return listRestoreCandidates({
      sessionRemoved: removedBySection[sectionKey] || [],
      templateCode,
      sectionKey,
      currentFields: section.fields,
    })
  }

  const moveField = (sIdx, fromIdx, toIdx) => {
    if (!canReorderFields) return
    if (fromIdx === toIdx) return
    const section = schemaEditor.sections[sIdx]
    updateSection(sIdx, { fields: reorderArray(section.fields, fromIdx, toIdx) })
  }

  const moveColumn = (fromId, toId) => {
    if (readOnly) return
    if (!fromId || fromId === toId) return
    const order = [...schemaEditor.fieldColumnOrder]
    const fromIdx = order.indexOf(fromId)
    const toIdx = order.indexOf(toId)
    if (fromIdx === -1 || toIdx === -1) return
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, fromId)
    updateSchema({ ...schemaEditor, fieldColumnOrder: order })
  }

  const resetColumnOrder = () => {
    updateSchema({ ...schemaEditor, fieldColumnOrder: [...DEFAULT_COLUMN_ORDER] })
  }

  const isDefaultColumnOrder = schemaEditor.fieldColumnOrder.every((c, i) => c === DEFAULT_COLUMN_ORDER[i])

  const renderRestoreControls = (sIdx) => {
    const candidates = restoreCandidatesFor(sIdx)
    const open = restoreOpenFor === sIdx
    return (
      <div className="relative inline-flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => addField(sIdx)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          + Add field
        </button>
        <button
          type="button"
          onClick={() => setRestoreOpenFor(open ? null : sIdx)}
          disabled={candidates.length === 0}
          className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
          title={
            candidates.length === 0
              ? 'No removed or missing standard fields to restore'
              : 'Reinstate a removed or missing standard field'
          }
        >
          Restore field…
        </button>
        {open && candidates.length > 0 && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setRestoreOpenFor(null)} aria-hidden="true" />
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[260px] max-w-[360px] max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-1">
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                Restored fields are added at the end of this section (drag to reorder).
              </p>
              {candidates.map(({ source, field }) => (
                <button
                  key={`${source}-${field.key}`}
                  type="button"
                  onClick={() => restoreField(sIdx, field)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span className="block text-sm text-gray-900 dark:text-gray-100">
                    {field.label || field.key}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {field.key}
                    {' · '}
                    {source === 'session' ? 'Removed this session' : 'Standard catalog'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  const renderFieldCell = (colId, field, sIdx, fIdx) => {
    const isContentColumn = colId === 'help' || colId === 'sample'
    const lock = isContentColumn ? readOnly : structuralLocked
    switch (colId) {
      case 'label':
        return (
          <input
            value={field.label}
            disabled={lock}
            readOnly={lock}
            onChange={(e) => {
              const label = e.target.value
              const key = field.key?.startsWith('field_') ? (slugify(label) || field.key) : field.key
              updateField(sIdx, fIdx, { label, key })
            }}
            className={cellInputClass}
          />
        )
      case 'key':
        return (
          <input
            value={field.key}
            disabled={lock}
            readOnly={lock}
            onChange={(e) => updateField(sIdx, fIdx, { key: e.target.value })}
            className={cellInputClass}
          />
        )
      case 'type':
        return (
          <select
            value={field.type || 'text'}
            disabled={lock}
            onChange={(e) => updateField(sIdx, fIdx, { type: e.target.value })}
            className={cellInputClass}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        )
      case 'required':
        return (
          <input
            type="checkbox"
            checked={Boolean(field.required)}
            disabled={lock}
            onChange={(e) => updateField(sIdx, fIdx, { required: e.target.checked })}
            className="rounded border-gray-600"
          />
        )
      case 'help':
        return (
          <input
            value={field.help || ''}
            disabled={lock}
            readOnly={lock}
            onChange={(e) => updateField(sIdx, fIdx, { help: e.target.value })}
            className={cellInputClass}
            placeholder="Offline / on-screen guidance"
            title="Guidance shown under the field on forms and in Plain Template exports"
          />
        )
      case 'sample':
        return (
          <input
            value={field.sample || ''}
            disabled={lock}
            readOnly={lock}
            onChange={(e) => updateField(sIdx, fIdx, { sample: e.target.value })}
            className={cellInputClass}
            placeholder="Example answer"
            title="Used for Completed (Sample) exports and as Example: on Plain Template exports"
          />
        )
      case 'options':
        return field.type === 'select' ? (
          <textarea
            rows={2}
            value={optionsToText(field.options)}
            disabled={lock}
            readOnly={lock}
            onChange={(e) => updateField(sIdx, fIdx, { options: textToOptions(e.target.value) })}
            className={`${cellInputClass} font-mono`}
            placeholder={'draft|Draft'}
          />
        ) : (
          <span className="text-gray-400 dark:text-gray-600">—</span>
        )
      default:
        return null
    }
  }

  const openAdvanced = () => {
    setJsonDraft(JSON.stringify(editorToSchema(schemaEditor), null, 2))
    setJsonError('')
    setShowAdvanced(true)
  }

  const applyAdvanced = () => {
    try {
      const parsed = JSON.parse(jsonDraft || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('Schema must be a JSON object.')
        return
      }
      set({ schema: editorToSchema(schemaToEditor(parsed)) })
      setJsonError('')
      setShowAdvanced(false)
    } catch {
      setJsonError('Invalid JSON — fix the syntax and try again.')
    }
  }

  return (
    <div className="space-y-4">
      <fieldset disabled={structuralLocked} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-95">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Template code
          <input
            value={v.template_code || ''}
            onChange={(e) => set({ template_code: e.target.value })}
            className={inputClass}
            placeholder="F001"
          />
        </label>
        <label className={labelClass}>
          Process group
          <select
            value={v.process_group || 'planning'}
            onChange={(e) => set({ process_group: e.target.value })}
            className={inputClass}
          >
            {PROCESS_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={v.is_active !== false}
          onChange={(e) => set({ is_active: e.target.checked })}
          className="rounded border-gray-600"
        />
        Active
      </label>
      </fieldset>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Form layout</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {viewMode
                ? 'Browse sections and fields. In table view, drag the # handle to reorder fields, then Save.'
                : readOnly
                  ? 'Browse sections and fields. Use Card / Table toggle to change layout.'
                  : contentOnly
                    ? 'Fill in Sample / Guidance for existing fields. Section and field structure is locked in Content Coverage — open this template from Forms to restructure it.'
                    : 'Add sections and fields. This replaces raw Schema JSON for day-to-day editing.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* View toggle stays enabled in view/read-only mode */}
            <ViewToggle view={fieldsView} onChange={setFieldsView} />
            {!structuralLocked && (
              <>
                <button
                  type="button"
                  onClick={openAdvanced}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Advanced JSON
                </button>
                <button
                  type="button"
                  onClick={addSection}
                  className="rounded bg-blue-800 px-2.5 py-1 text-xs text-white hover:bg-blue-700"
                >
                  + Add section
                </button>
              </>
            )}
          </div>
        </div>

        <fieldset disabled={structuralLocked} className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95">
        <label className={labelClass}>
          Form title (shown on the form)
          <input
            value={schemaEditor.title}
            onChange={(e) => updateSchema({ ...schemaEditor, title: e.target.value })}
            className={inputClass}
            placeholder="Defaults to template name if empty"
          />
        </label>
        </fieldset>

        {schemaEditor.sections.map((section, sIdx) => (
          <div
            key={`section-${sIdx}`}
            className="space-y-3 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          >
            <fieldset disabled={structuralLocked} className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Section {sIdx + 1}
              </p>
              {!structuralLocked && schemaEditor.sections.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSection(sIdx)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove section
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Section title
                <input
                  value={section.title}
                  onChange={(e) => {
                    const title = e.target.value
                    const key = section.key?.startsWith('section_') ? (slugify(title) || section.key) : section.key
                    updateSection(sIdx, { title, key })
                  }}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Section key
                <input
                  value={section.key}
                  onChange={(e) => updateSection(sIdx, { key: e.target.value })}
                  className={inputClass}
                  placeholder="general"
                />
              </label>
            </div>
            </fieldset>

            {fieldsView === 'table' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {canReorderFields
                      ? readOnly
                        ? 'Drag the # handle to reorder fields. Click Save on this page to persist the new order.'
                        : 'Drag a column header to reorder attributes, or drag the # handle to reorder fields (used when this record is exported).'
                      : 'Fields in table layout (read-only).'}
                  </p>
                  {!readOnly && !isDefaultColumnOrder && (
                    <button
                      type="button"
                      onClick={resetColumnOrder}
                      className="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Reset column order
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700/80">
                  <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                    <colgroup>
                      <col className="w-[3%]" />
                      {schemaEditor.fieldColumnOrder.map((colId) => (
                        <col key={colId} style={{ width: COLUMN_WIDTHS[colId] }} />
                      ))}
                      {!structuralLocked && <col className="w-[7%]" />}
                    </colgroup>
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400">#</th>
                        {schemaEditor.fieldColumnOrder.map((colId) => (
                          <th
                            key={colId}
                            draggable={!readOnly}
                            onDragStart={(e) => {
                              if (readOnly) return
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', colId)
                              setDragCol(colId)
                            }}
                            onDragOver={(e) => { if (!readOnly) e.preventDefault() }}
                            onDrop={(e) => {
                              if (readOnly) return
                              e.preventDefault()
                              moveColumn(dragCol, colId)
                              setDragCol(null)
                            }}
                            onDragEnd={() => setDragCol(null)}
                            title={readOnly ? COLUMN_LABELS[colId] : 'Drag to reorder column'}
                            className={`select-none px-2 py-2 font-medium text-gray-500 dark:text-gray-400 ${
                              readOnly ? '' : 'cursor-move hover:text-gray-800 dark:hover:text-gray-200'
                            } ${
                              colId === 'required' ? 'text-center' : 'text-left'
                            } ${dragCol === colId ? 'opacity-40' : ''}`}
                          >
                            {!readOnly && <span className="mr-1 text-gray-400 dark:text-gray-600">⠿</span>}
                            {COLUMN_LABELS[colId]}
                          </th>
                        ))}
                        {!structuralLocked && <th className="px-2 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-950/50">
                      {section.fields.map((field, fIdx) => (
                        <tr
                          key={`field-row-${sIdx}-${field.key || fIdx}-${fIdx}`}
                          onDragOver={(e) => {
                            if (canReorderFields && dragField && dragField.sIdx === sIdx) e.preventDefault()
                          }}
                          onDrop={(e) => {
                            if (!canReorderFields || !dragField || dragField.sIdx !== sIdx) return
                            e.preventDefault()
                            moveField(sIdx, dragField.fIdx, fIdx)
                            setDragField(null)
                          }}
                          className={dragField?.sIdx === sIdx && dragField?.fIdx === fIdx ? 'opacity-40' : ''}
                        >
                          <td
                            draggable={canReorderFields}
                            onDragStart={(e) => {
                              if (!canReorderFields) return
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', String(fIdx))
                              setDragField({ sIdx, fIdx })
                            }}
                            onDragEnd={() => setDragField(null)}
                            title={canReorderFields ? 'Drag to reorder row' : String(fIdx + 1)}
                            className={`select-none px-2 py-1.5 align-top text-gray-500 dark:text-gray-400 ${
                              canReorderFields ? 'cursor-grab active:cursor-grabbing hover:text-gray-800 dark:hover:text-gray-200' : ''
                            }`}
                          >
                            {canReorderFields && <span className="mr-1 text-gray-400 dark:text-gray-600" aria-hidden="true">⠿</span>}
                            {fIdx + 1}
                          </td>
                          {schemaEditor.fieldColumnOrder.map((colId) => (
                            <td
                              key={colId}
                              className={`px-2 py-1.5 align-top ${colId === 'required' ? 'text-center' : ''}`}
                            >
                              {renderFieldCell(colId, field, sIdx, fIdx)}
                            </td>
                          ))}
                          {!structuralLocked && (
                            <td className="px-2 py-1.5 align-top text-right">
                              {section.fields.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeField(sIdx, fIdx)}
                                  className="text-red-600 dark:text-red-400 hover:underline"
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!structuralLocked && renderRestoreControls(sIdx)}
              </div>
            ) : (
              <div className="space-y-2">
                {section.fields.map((field, fIdx) => (
                  <div key={`field-${sIdx}-${fIdx}`} className="space-y-2 rounded border border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Field {fIdx + 1}</p>
                      {!structuralLocked && section.fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeField(sIdx, fIdx)}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <fieldset disabled={structuralLocked} className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelClass}>
                        Label
                        <input
                          value={field.label}
                          onChange={(e) => {
                            const label = e.target.value
                            const key = field.key?.startsWith('field_') ? (slugify(label) || field.key) : field.key
                            updateField(sIdx, fIdx, { label, key })
                          }}
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Field key
                        <input
                          value={field.key}
                          onChange={(e) => updateField(sIdx, fIdx, { key: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Type
                        <select
                          value={field.type || 'text'}
                          onChange={(e) => updateField(sIdx, fIdx, { type: e.target.value })}
                          className={inputClass}
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-end gap-2 pb-2 text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={Boolean(field.required)}
                          onChange={(e) => updateField(sIdx, fIdx, { required: e.target.checked })}
                          className="rounded border-gray-600"
                        />
                        Required
                      </label>
                    </div>
                    {field.type === 'select' && (
                      <label className={labelClass}>
                        Options (one per line; optional <code className="text-gray-500 dark:text-gray-400">value|Label</code>)
                        <textarea
                          rows={3}
                          value={optionsToText(field.options)}
                          onChange={(e) => updateField(sIdx, fIdx, { options: textToOptions(e.target.value) })}
                          className={`${inputClass} font-mono text-xs`}
                          placeholder={'draft|Draft\nactive|Active'}
                        />
                      </label>
                    )}
                    </fieldset>
                    <label className={labelClass}>
                      Guidance (offline / on-screen help)
                      <input
                        value={field.help || ''}
                        disabled={readOnly}
                        onChange={(e) => updateField(sIdx, fIdx, { help: e.target.value })}
                        className={inputClass}
                        placeholder="Brief instructions to complete this field offline or on-screen"
                      />
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                        Shown under the field label on forms and in template exports (PDF/Word/etc.).
                      </span>
                    </label>
                    <label className={labelClass}>
                      Sample / example value
                      <input
                        value={field.sample || ''}
                        disabled={readOnly}
                        onChange={(e) => updateField(sIdx, fIdx, { sample: e.target.value })}
                        className={inputClass}
                        placeholder="Optional example answer"
                      />
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                        Fills Completed (Sample) exports; on Plain Template exports appears as &quot;Example: …&quot;.
                      </span>
                    </label>
                  </div>
                ))}
                {!structuralLocked && renderRestoreControls(sIdx)}
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdvanced && !structuralLocked && (
        <div className="space-y-2 rounded border border-amber-800/60 bg-amber-950/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-amber-100">Advanced Schema JSON</p>
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="text-xs text-gray-400 hover:underline"
            >
              Close
            </button>
          </div>
          <textarea
            rows={12}
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            className="w-full rounded border border-gray-600 bg-gray-950 px-3 py-2 font-mono text-xs text-gray-100"
          />
          {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
          <button
            type="button"
            onClick={applyAdvanced}
            className="rounded bg-amber-800 px-3 py-1.5 text-xs text-white hover:bg-amber-700"
          >
            Apply JSON to form layout
          </button>
        </div>
      )}
    </div>
  )
}

export function emptyFormTemplatePayload() {
  return {
    template_code: '',
    name: '',
    process_group: 'planning',
    is_active: true,
    schema: editorToSchema({
      title: '',
      sections: [emptySection()],
    }),
  }
}

export function normalizeFormTemplatePayload(payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const base = emptyFormTemplatePayload()
  return {
    ...base,
    ...p,
    schema: editorToSchema(schemaToEditor(p.schema)),
  }
}
