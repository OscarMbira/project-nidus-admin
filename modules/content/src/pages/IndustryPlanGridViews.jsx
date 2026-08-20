import { Fragment, useEffect, useRef, useState } from 'react'
import {
  AdminField,
  AdminModal,
  inputClass,
  ViewToggle,
  SearchableSelect,
  MultiSearchableSelect,
} from '@nidus-admin/ui'
import {
  groupByPhase,
  flattenWbsTree,
  distinctFieldValues,
  toSelectOptions,
  phaseSelectOptions,
  resolvePhaseKey,
  emptyIndustryActivityRow,
  emptyIndustryDeliverableRow,
  emptyIndustryMilestoneRow,
  COLUMN_STORAGE_PREFIX,
  loadColumnLayout,
  saveColumnLayout,
  normalizeColumnLayout,
  moveColumn as moveLayoutColumn,
  showColumn,
  hideColumn,
  getColumnLabel,
  formatIndustryPlanCell,
  wbsColumnOpts,
  flatColumnOpts,
  mergeColumnOptsWithCustom,
  normalizeCustomColumnDefs,
  computeMaxOutlineLevel,
  expandedMapForOutlineLevel,
  filterFlatByOutlineLevel,
  fetchActivePublicRoles,
  rolesToSelectOptions,
  fetchRiskCategoryOptions,
  riskCategoriesToSelectOptions,
} from '@nidus-admin/shared'
import { IndustryPlanColumnChooser } from './IndustryPlanColumnChooser.jsx'

const PRIORITIES = ['', 'low', 'medium', 'high', 'critical']
const ACTIVITY_TYPES = ['task', 'review', 'approval', 'meeting', 'deliverable', 'milestone']
const DELIVERABLE_TYPES = ['document', 'report', 'artefact', 'decision', 'approval']
const LIKELIHOOD = ['', 'low', 'medium', 'high']

function IndustryPlanRowDetailModal({ open, title, onCancel, onSave, children, readOnly = false }) {
  return (
    <AdminModal
      open={open}
      title={title || 'Row detail'}
      onClose={onCancel}
      onConfirm={readOnly ? undefined : onSave}
      confirmLabel="Save"
      size="xl"
      hideFooter={false}
    >
      <div className="space-y-3 pb-2">
        {readOnly ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            View mode — fields are read-only. Switch to Edit to change this row.
          </p>
        ) : null}
        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95">
          {children}
        </fieldset>
      </div>
    </AdminModal>
  )
}

function cloneRow(row) {
  try {
    return structuredClone(row)
  } catch {
    return JSON.parse(JSON.stringify(row))
  }
}

function detailTitleFor(kind, row, { readOnly = false } = {}) {
  const labels = {
    phases: 'phase',
    activities: 'activity',
    deliverables: 'deliverable',
    milestones: 'milestone',
    risks: 'risk',
    roles: 'role',
    objectives: 'objective',
    governance: 'governance row',
    benefit_categories: 'benefit category',
    metrics: 'metric',
    benefits: 'benefit',
    dependencies: 'dependency',
  }
  const kindLabel = labels[kind] || 'record'
  const name = row?.phase_name
    || row?.activity_name
    || row?.deliverable_name
    || row?.milestone_name
    || row?.risk_title
    || row?.role_title
    || row?.objective_name
    || row?.kpi_name
    || row?.benefit_name
    || row?.board_name
    || row?.category
    || row?.dependency_description
    || row?.structure
    || ''
  const isNew = !String(name || '').trim()
  if (readOnly) {
    return `View ${kindLabel}`
  }
  return isNew ? `New ${kindLabel}` : `Edit ${kindLabel}`
}

function RemoveRowButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
    >
      Remove
    </button>
  )
}

function PlanningDefaultsFields({ row, listKey, index, updateListItem, offsetLabel }) {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <AdminField label="Priority">
        <SearchableSelect
          value={row.priority || ''}
          onChange={(v) => updateListItem(listKey, index, 'priority', v)}
          options={PRIORITIES.filter(Boolean).map((v) => ({ value: v, label: v }))}
          placeholder="—"
        />
      </AdminField>
      <AdminField label="Planned hours">
        <input
          type="number"
          min={0}
          className={inputClass}
          value={row.planned_hours ?? ''}
          onChange={(e) => updateListItem(listKey, index, 'planned_hours', e.target.value)}
        />
      </AdminField>
      <AdminField label="Planned cost">
        <input
          type="number"
          min={0}
          step="0.01"
          className={inputClass}
          value={row.planned_cost ?? ''}
          onChange={(e) => updateListItem(listKey, index, 'planned_cost', e.target.value)}
        />
      </AdminField>
      <AdminField label={offsetLabel || 'Offset from phase start (days)'}>
        <input
          type="number"
          min={0}
          className={inputClass}
          value={row.start_offset_days ?? ''}
          onChange={(e) => updateListItem(listKey, index, 'start_offset_days', e.target.value)}
        />
      </AdminField>
      <AdminField label="Locked">
        <label className="flex items-center gap-2 pt-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={Boolean(row.is_locked)}
            onChange={(e) => updateListItem(listKey, index, 'is_locked', e.target.checked)}
          />
          Locked on real projects
        </label>
      </AdminField>
    </div>
  )
}

function SectionToolbar({ title, count, onAdd, addLabel, view, onViewChange, extraActions }) {
  return (
    <div
      data-industry-plan-toolbar
      className="mb-3 flex flex-wrap items-center justify-between gap-2"
    >
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
        {title}
        <span className="ml-2 text-xs font-normal text-gray-500">({count})</span>
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {extraActions}
        <ViewToggle view={view === 'grid' ? 'table' : 'card'} onChange={(v) => onViewChange(v === 'table' ? 'grid' : 'card')} />
        {onAdd && (
          <button type="button" onClick={onAdd} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            {addLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function useIndustryPlanColumnLayout(storageSuffix, opts) {
  const storageKey = `${COLUMN_STORAGE_PREFIX}${storageSuffix}`
  const poolKey = (opts.optionalPool || []).join('|')
  const [layout, setLayoutState] = useState(() => loadColumnLayout(storageKey, opts))

  useEffect(() => {
    setLayoutState((prev) => {
      const next = normalizeColumnLayout(prev, opts)
      saveColumnLayout(storageKey, next)
      return next
    })
  // Re-sync when custom columns change the optional pool
  // eslint-disable-next-line react-hooks/exhaustive-deps -- poolKey captures pool membership
  }, [storageKey, poolKey])

  const persist = (next) => {
    const normalized = normalizeColumnLayout(next, opts)
    setLayoutState(normalized)
    saveColumnLayout(storageKey, normalized)
  }

  return {
    layout,
    opts,
    show: (key) => persist(showColumn(layout, key, opts)),
    hide: (key) => persist(hideColumn(layout, key, opts)),
    move: (fromKey, toKey) => persist(moveLayoutColumn(layout, fromKey, toKey, opts)),
    reset: () => persist(opts.defaultShown),
  }
}

function CustomFieldsSection({ row, listKey, index, updateListItem, customDefs }) {
  const defs = normalizeCustomColumnDefs(customDefs)
  if (!defs.length) return null

  const setField = (id, value) => {
    updateListItem(listKey, index, 'custom_fields', {
      ...(row.custom_fields || {}),
      [id]: value,
    })
  }

  return (
    <div className="space-y-3 rounded border border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        Custom columns
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {defs.map((def) => {
          const value = row.custom_fields?.[def.id]
          if (def.type === 'yes_no') {
            return (
              <AdminField key={def.id} label={def.label}>
                <label className="flex items-center gap-2 pt-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) => setField(def.id, e.target.checked)}
                  />
                  Yes
                </label>
              </AdminField>
            )
          }
          if (def.type === 'number') {
            return (
              <AdminField key={def.id} label={def.label}>
                <input
                  type="number"
                  className={inputClass}
                  value={value ?? ''}
                  onChange={(e) => setField(def.id, e.target.value)}
                />
              </AdminField>
            )
          }
          return (
            <AdminField key={def.id} label={def.label}>
              <input
                className={inputClass}
                value={value ?? ''}
                onChange={(e) => setField(def.id, e.target.value)}
              />
            </AdminField>
          )
        })}
      </div>
    </div>
  )
}

function ColumnChooserWired({ colState, customColumnApi, readOnly = false }) {
  return (
    <IndustryPlanColumnChooser
      layout={colState.layout}
      opts={colState.opts}
      onShow={colState.show}
      onHide={colState.hide}
      onMove={colState.move}
      onReset={colState.reset}
      customDefs={readOnly ? undefined : customColumnApi?.defs}
      onAddCustom={readOnly ? undefined : customColumnApi?.onAdd}
      onUpdateCustom={readOnly ? undefined : customColumnApi?.onUpdate}
      onDeleteCustom={readOnly ? undefined : customColumnApi?.onDelete}
    />
  )
}

/**
 * MS Project–style outline: Collapse/Expand all + show through outline level N.
 * Uses non-disabled-friendly controls so it works inside view-mode browse layouts.
 */
function WbsOutlineToolbar({ outlineLevel, maxLevel, onOutlineLevel }) {
  const levels = Array.from({ length: Math.max(1, maxLevel) }, (_, i) => i + 1)
  const btn =
    'rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-wbs-outline-toolbar>
      <button
        type="button"
        className={btn}
        onClick={() => onOutlineLevel(1)}
        title="Collapse all (outline level 1 — phases only)"
      >
        Collapse all
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => onOutlineLevel(maxLevel)}
        title="Expand all outline levels"
      >
        Expand all
      </button>
      <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300">
        <span className="whitespace-nowrap">Outline level</span>
        <select
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-1.5 py-1 text-[11px] text-gray-800 dark:text-gray-100"
          value={outlineLevel}
          onChange={(e) => onOutlineLevel(Number(e.target.value))}
          title="Show rows through this outline level (MS Project style)"
        >
          {levels.map((n) => (
            <option key={n} value={n}>
              Level {n}{n === 1 ? ' (phases)' : n === maxLevel ? ' (all)' : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function GridColumnHeaders({ layout, opts, onMove }) {
  const [dragCol, setDragCol] = useState(null)
  const locked = new Set([...(opts.lockedPrefix || []), ...(opts.lockedSuffix || [])])
  const labels = opts.labels || {}

  return layout.map((key) => {
    const isLocked = locked.has(key)
    const alignRight = key === '_actions'
    const label = getColumnLabel(key, labels)
    return (
      <th
        key={key}
        draggable={!isLocked}
        onDragStart={(e) => {
          if (isLocked) return
          e.dataTransfer.effectAllowed = 'move'
          setDragCol(key)
        }}
        onDragOver={(e) => {
          if (!isLocked) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragCol && !isLocked) onMove?.(dragCol, key)
          setDragCol(null)
        }}
        onDragEnd={() => setDragCol(null)}
        className={`px-2 py-2 font-medium text-gray-500 dark:text-gray-400 ${
          alignRight ? 'text-right' : 'text-left'
        } ${!isLocked ? 'cursor-grab' : ''} ${dragCol === key ? 'opacity-40' : ''}`}
        title={isLocked ? undefined : 'Drag to reorder'}
      >
        {label}
      </th>
    )
  })
}

/**
 * Flat entity grid with row select → detail modal + column chooser (v183).
 */
export function IndustryPlanFlatGrid({
  rows,
  listKey,
  /** Column layout key when it differs from the payload list key (e.g. programme_governance). */
  columnKey = null,
  selectedIndex,
  onSelect,
  onReorder,
  renderDetail,
  minKeep = 0,
  onRemove,
  onAddSibling,
  siblingAddLabel = 'Add sibling',
  indentNameKey,
  replaceListItem,
  customDefs,
  customColumnApi,
  readOnly = false,
}) {
  const catalogOpts = mergeColumnOptsWithCustom(
    flatColumnOpts(columnKey || listKey) || {
      lockedPrefix: ['_row'],
      lockedSuffix: ['_actions'],
      optionalPool: [],
      defaultShown: ['_row', '_actions'],
    },
    customDefs,
  )
  const colState = useIndustryPlanColumnLayout(columnKey || listKey, catalogOpts)
  const defs = normalizeCustomColumnDefs(customDefs)
  const [dragFrom, setDragFrom] = useState(null)
  const snapshotRef = useRef(null)
  const snapshotKeyRef = useRef(null)

  const selectionKey = selectedIndex == null ? null : `${listKey}:${selectedIndex}`

  useEffect(() => {
    if (selectionKey == null || selectedIndex == null || !rows[selectedIndex]) {
      snapshotRef.current = null
      snapshotKeyRef.current = null
      return
    }
    if (snapshotKeyRef.current !== selectionKey) {
      snapshotRef.current = cloneRow(rows[selectedIndex])
      snapshotKeyRef.current = selectionKey
    }
  }, [selectionKey, selectedIndex, rows])

  const handleSave = () => {
    snapshotRef.current = null
    snapshotKeyRef.current = null
    onSelect(null)
  }

  const handleCancel = () => {
    if (!readOnly && snapshotRef.current != null && selectedIndex != null && replaceListItem) {
      replaceListItem(listKey, selectedIndex, snapshotRef.current)
    }
    snapshotRef.current = null
    snapshotKeyRef.current = null
    onSelect(null)
  }

  const renderDataCell = (key, row) => {
    const raw = formatIndustryPlanCell(key, { kind: listKey, row, customDefs: defs })
    if (indentNameKey && key === indentNameKey && resolvePhaseKey(row)) {
      return (
        <span className="inline-flex items-center gap-1.5 pl-6">
          <span className="mr-1 text-gray-400 dark:text-gray-600 select-none" aria-hidden="true">└</span>
          <span className="h-3 w-0.5 shrink-0 rounded bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
          {raw}
        </span>
      )
    }
    return raw
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ColumnChooserWired colState={colState} customColumnApi={customColumnApi} readOnly={readOnly} />
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[640px] divide-y divide-gray-200 dark:divide-gray-700 text-xs">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <GridColumnHeaders layout={colState.layout} opts={colState.opts} onMove={colState.move} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-950/40">
            {rows.map((row, index) => (
              <tr
                key={`${listKey}-${index}`}
                onClick={() => onSelect(index)}
                onDragOver={(e) => {
                  if (!readOnly && dragFrom != null) e.preventDefault()
                }}
                onDrop={(e) => {
                  if (readOnly) return
                  e.preventDefault()
                  if (dragFrom == null) return
                  onReorder?.(dragFrom, index)
                  setDragFrom(null)
                }}
                className={`cursor-pointer ${
                  selectedIndex === index
                    ? 'bg-blue-50 dark:bg-blue-950/40'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-900/60'
                } ${dragFrom === index ? 'opacity-40' : ''}`}
              >
                {colState.layout.map((key) => {
                  if (key === '_row') {
                    return (
                      <td
                        key={key}
                        draggable={!readOnly}
                        onDragStart={(e) => {
                          if (readOnly) return
                          e.stopPropagation()
                          e.dataTransfer.effectAllowed = 'move'
                          setDragFrom(index)
                        }}
                        onDragEnd={() => setDragFrom(null)}
                        onClick={(e) => e.stopPropagation()}
                        className={`select-none px-2 py-1.5 text-gray-500 w-10 ${readOnly ? '' : 'cursor-move'}`}
                        title={readOnly ? undefined : 'Drag to reorder'}
                      >
                        {readOnly ? `${index + 1}` : `⠿ ${index + 1}`}
                      </td>
                    )
                  }
                  if (key === '_actions') {
                    return (
                      <td key={key} className="px-2 py-1.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {readOnly ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500">View</span>
                        ) : (
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            {onAddSibling && (
                              <button
                                type="button"
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={() => onAddSibling(index)}
                                title={siblingAddLabel}
                              >
                                + Add
                              </button>
                            )}
                            <RemoveRowButton
                              disabled={rows.length <= minKeep}
                              onClick={() => onRemove?.(index)}
                            />
                          </div>
                        )}
                      </td>
                    )
                  }
                  return (
                    <td key={key} className="px-2 py-1.5 text-gray-800 dark:text-gray-200">
                      {renderDataCell(key, row)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedIndex != null && rows[selectedIndex] && (
        <IndustryPlanRowDetailModal
          open
          title={detailTitleFor(listKey, rows[selectedIndex], { readOnly })}
          readOnly={readOnly}
          onCancel={handleCancel}
          onSave={handleSave}
        >
          {renderDetail(rows[selectedIndex], selectedIndex)}
        </IndustryPlanRowDetailModal>
      )}
    </div>
  )
}

export function PhaseDetail({ row, index, updateListItem, removeListItem, canRemove, customDefs, readOnly = false }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminField label="Phase #">
          <input type="number" min={1} className={inputClass} value={row.phase_number}
            onChange={(e) => updateListItem('phases', index, 'phase_number', e.target.value)} />
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Phase name" required>
            <input className={inputClass} value={row.phase_name}
              onChange={(e) => updateListItem('phases', index, 'phase_name', e.target.value)} />
          </AdminField>
        </div>
        <AdminField label="Estimated duration">
          <input className={inputClass} value={row.estimated_duration}
            onChange={(e) => updateListItem('phases', index, 'estimated_duration', e.target.value)}
            placeholder="2–4 weeks" />
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Description">
            <textarea rows={3} className={inputClass} value={row.phase_description}
              onChange={(e) => updateListItem('phases', index, 'phase_description', e.target.value)} />
          </AdminField>
        </div>
      </div>
      <PlanningDefaultsFields row={row} listKey="phases" index={index} updateListItem={updateListItem}
        offsetLabel="Offset from project start (days)" />
      <CustomFieldsSection row={row} listKey="phases" index={index} updateListItem={updateListItem} customDefs={customDefs} />
      {!readOnly && <RemoveRowButton disabled={!canRemove} onClick={() => removeListItem('phases', index, 1)} />}
    </div>
  )
}

export function ActivityDetail({ row, index, plan, updateListItem, removeListItem, customDefs, readOnly = false }) {
  const phaseOpts = phaseSelectOptions(plan.phases)
  const resourceOpts = toSelectOptions(distinctFieldValues(plan.activities, 'resource_type'))
  const skillOpts = toSelectOptions(distinctFieldValues(plan.activities, 'required_skills', { arrayField: true }))

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Activity name" required>
          <input className={inputClass} value={row.activity_name}
            onChange={(e) => updateListItem('activities', index, 'activity_name', e.target.value)} />
        </AdminField>
        <AdminField label="Phase #">
          <SearchableSelect
            value={row.phase_number == null ? '' : String(row.phase_number)}
            onChange={(v) => updateListItem('activities', index, 'phase_number', v)}
            options={[{ value: '', label: '— Unassigned —' }, ...phaseOpts]}
            placeholder="Select phase"
          />
        </AdminField>
        <AdminField label="Type">
          <SearchableSelect
            value={row.activity_type || ''}
            onChange={(v) => updateListItem('activities', index, 'activity_type', v)}
            options={ACTIVITY_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </AdminField>
        <AdminField label="Resource type">
          <SearchableSelect
            value={row.resource_type || ''}
            onChange={(v) => updateListItem('activities', index, 'resource_type', v)}
            options={resourceOpts}
            allowCreate
            placeholder="Search or type resource type"
          />
        </AdminField>
        <AdminField label="Typical duration">
          <input className={inputClass} value={row.typical_duration}
            onChange={(e) => updateListItem('activities', index, 'typical_duration', e.target.value)} />
        </AdminField>
        <AdminField label="Typical effort">
          <input className={inputClass} value={row.typical_effort}
            onChange={(e) => updateListItem('activities', index, 'typical_effort', e.target.value)} />
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Required skills / competencies">
            <MultiSearchableSelect
              values={row.required_skills || []}
              onChange={(v) => updateListItem('activities', index, 'required_skills', v)}
              options={skillOpts}
              allowCreate
              placeholder="Add skill…"
            />
          </AdminField>
        </div>
        <div className="sm:col-span-2">
          <AdminField label="Description">
            <textarea rows={3} className={inputClass} value={row.activity_description}
              onChange={(e) => updateListItem('activities', index, 'activity_description', e.target.value)} />
          </AdminField>
        </div>
      </div>
      <PlanningDefaultsFields row={row} listKey="activities" index={index} updateListItem={updateListItem} />
      <CustomFieldsSection row={row} listKey="activities" index={index} updateListItem={updateListItem} customDefs={customDefs} />
      {!readOnly && <RemoveRowButton onClick={() => removeListItem('activities', index)} />}
    </div>
  )
}

export function DeliverableDetail({ row, index, plan, updateListItem, removeListItem, customDefs, readOnly = false }) {
  const phaseOpts = phaseSelectOptions(plan.phases)
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Deliverable name" required>
          <input className={inputClass} value={row.deliverable_name}
            onChange={(e) => updateListItem('deliverables', index, 'deliverable_name', e.target.value)} />
        </AdminField>
        <AdminField label="Phase #">
          <SearchableSelect
            value={row.phase_number == null ? '' : String(row.phase_number)}
            onChange={(v) => updateListItem('deliverables', index, 'phase_number', v)}
            options={[{ value: '', label: '— Unassigned —' }, ...phaseOpts]}
          />
        </AdminField>
        <AdminField label="Type">
          <SearchableSelect
            value={row.deliverable_type || ''}
            onChange={(v) => updateListItem('deliverables', index, 'deliverable_type', v)}
            options={DELIVERABLE_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </AdminField>
        <AdminField label="Mandatory">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={Boolean(row.is_mandatory)}
              onChange={(e) => updateListItem('deliverables', index, 'is_mandatory', e.target.checked)} />
            Required deliverable
          </label>
        </AdminField>
      </div>
      <PlanningDefaultsFields row={row} listKey="deliverables" index={index} updateListItem={updateListItem} />
      <CustomFieldsSection row={row} listKey="deliverables" index={index} updateListItem={updateListItem} customDefs={customDefs} />
      {!readOnly && <RemoveRowButton onClick={() => removeListItem('deliverables', index)} />}
    </div>
  )
}

export function RiskDetail({ row, index, updateListItem, removeListItem, customDefs, readOnly = false }) {
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categoryLoadError, setCategoryLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchRiskCategoryOptions().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setCategoryLoadError(error.message || String(error))
        setCategoryOptions([])
        return
      }
      setCategoryLoadError(null)
      setCategoryOptions(riskCategoriesToSelectOptions(data))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Risk title" required>
          <input className={inputClass} value={row.risk_title}
            onChange={(e) => updateListItem('risks', index, 'risk_title', e.target.value)} />
        </AdminField>
        <AdminField label="Category">
          <SearchableSelect
            value={row.risk_category || ''}
            onChange={(v) => updateListItem('risks', index, 'risk_category', v)}
            options={categoryOptions}
            placeholder="Search and select a category…"
            searchPlaceholder="Search categories…"
            emptyMessage={
              categoryLoadError
                ? `Could not load categories: ${categoryLoadError}`
                : 'No matching categories.'
            }
            disabled={readOnly}
          />
        </AdminField>
        <AdminField label="Likelihood">
          <select className={inputClass} value={row.likelihood}
            onChange={(e) => updateListItem('risks', index, 'likelihood', e.target.value)}>
            {LIKELIHOOD.map((v) => <option key={v || 'empty'} value={v}>{v || '—'}</option>)}
          </select>
        </AdminField>
        <AdminField label="Impact">
          <select className={inputClass} value={row.impact}
            onChange={(e) => updateListItem('risks', index, 'impact', e.target.value)}>
            {LIKELIHOOD.map((v) => <option key={v || 'empty'} value={v}>{v || '—'}</option>)}
          </select>
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Description">
            <textarea rows={3} className={inputClass} value={row.risk_description}
              onChange={(e) => updateListItem('risks', index, 'risk_description', e.target.value)} />
          </AdminField>
        </div>
      </div>
      <CustomFieldsSection row={row} listKey="risks" index={index} updateListItem={updateListItem} customDefs={customDefs} />
      {!readOnly && <RemoveRowButton onClick={() => removeListItem('risks', index)} />}
    </div>
  )
}

export function MilestoneDetail({ row, index, plan, updateListItem, removeListItem, customDefs, readOnly = false }) {
  const phaseOpts = phaseSelectOptions(plan.phases)
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Milestone name" required>
          <input className={inputClass} value={row.milestone_name}
            onChange={(e) => updateListItem('milestones', index, 'milestone_name', e.target.value)} />
        </AdminField>
        <AdminField label="Phase #">
          <SearchableSelect
            value={row.phase_number == null ? '' : String(row.phase_number)}
            onChange={(v) => updateListItem('milestones', index, 'phase_number', v)}
            options={[{ value: '', label: '— Unassigned —' }, ...phaseOpts]}
          />
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Description">
            <textarea rows={3} className={inputClass} value={row.milestone_description}
              onChange={(e) => updateListItem('milestones', index, 'milestone_description', e.target.value)} />
          </AdminField>
        </div>
      </div>
      <PlanningDefaultsFields row={row} listKey="milestones" index={index} updateListItem={updateListItem} />
      <CustomFieldsSection row={row} listKey="milestones" index={index} updateListItem={updateListItem} customDefs={customDefs} />
      {!readOnly && <RemoveRowButton onClick={() => removeListItem('milestones', index)} />}
    </div>
  )
}

export function RoleDetail({ row, index, updateListItem, removeListItem, customDefs, readOnly = false }) {
  const [roleOptions, setRoleOptions] = useState([])
  const [rolesLoadError, setRolesLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchActivePublicRoles().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setRolesLoadError(error.message || String(error))
        setRoleOptions([])
        return
      }
      setRolesLoadError(null)
      setRoleOptions(rolesToSelectOptions(data))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onRoleTitleChange = (value) => {
    updateListItem('roles', index, 'role_title', value)
    const match = roleOptions.find((o) => o.value === value)
    if (match?.description && !String(row.role_description || '').trim()) {
      updateListItem('roles', index, 'role_description', match.description)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Role title" required>
          <SearchableSelect
            value={row.role_title || ''}
            onChange={onRoleTitleChange}
            options={roleOptions}
            placeholder="Search and select a role…"
            searchPlaceholder="Search roles…"
            emptyMessage={rolesLoadError ? `Could not load roles: ${rolesLoadError}` : 'No matching roles.'}
            disabled={readOnly}
          />
        </AdminField>
        <AdminField label="Key role">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={Boolean(row.is_key_role)}
              onChange={(e) => updateListItem('roles', index, 'is_key_role', e.target.checked)} />
            Mark as key role
          </label>
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Description">
            <textarea rows={3} className={inputClass} value={row.role_description}
              onChange={(e) => updateListItem('roles', index, 'role_description', e.target.value)} />
          </AdminField>
        </div>
      </div>
      <CustomFieldsSection row={row} listKey="roles" index={index} updateListItem={updateListItem} customDefs={customDefs} />
      {!readOnly && <RemoveRowButton onClick={() => removeListItem('roles', index)} />}
    </div>
  )
}

function WbsAddMenu({ items }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        className="rounded border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-[11px] text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        + Add
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close add menu"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Option B WBS tree on Phases tab (grid mode).
 * Supports multi-level nesting via row_id / parent_id (WBS 1.2.1 …).
 */
export function IndustryPlanWbsPanel({
  plan,
  updateListItem,
  removeListItem,
  selected,
  onSelect,
  onAddUnderPhase,
  onAddPhaseAfter,
  onAddSibling,
  onAddNestedChild,
  replaceListItem,
  customDefs,
  customColumnApi,
  readOnly = false,
}) {
  const defs = normalizeCustomColumnDefs(customDefs)
  const colState = useIndustryPlanColumnLayout('wbs', mergeColumnOptsWithCustom(wbsColumnOpts(), customDefs))
  const { groups, unassigned } = groupByPhase(plan.phases, {
    activities: plan.activities,
    deliverables: plan.deliverables,
    milestones: plan.milestones,
  })
  const maxOutlineLevel = computeMaxOutlineLevel(groups, unassigned)
  const [outlineLevel, setOutlineLevel] = useState(maxOutlineLevel)
  const [expanded, setExpanded] = useState(() => expandedMapForOutlineLevel(groups, maxOutlineLevel))
  const snapshotRef = useRef(null)
  const snapshotKeyRef = useRef(null)

  useEffect(() => {
    setOutlineLevel((prev) => Math.min(Math.max(1, prev), maxOutlineLevel))
  }, [maxOutlineLevel])

  const applyOutlineLevel = (level) => {
    const next = Math.max(1, Math.min(Number(level) || 1, maxOutlineLevel))
    setOutlineLevel(next)
    setExpanded(expandedMapForOutlineLevel(groups, next))
  }

  const selectionKey = selected?.kind != null && selected?.index != null
    ? `${selected.kind}:${selected.index}`
    : null

  useEffect(() => {
    if (!selectionKey || !selected) {
      snapshotRef.current = null
      snapshotKeyRef.current = null
      return
    }
    const list = plan[selected.kind]
    const row = list?.[selected.index]
    if (!row) return
    if (snapshotKeyRef.current !== selectionKey) {
      snapshotRef.current = cloneRow(row)
      snapshotKeyRef.current = selectionKey
    }
  }, [selectionKey, selected, plan])

  const handleSave = () => {
    snapshotRef.current = null
    snapshotKeyRef.current = null
    onSelect(null)
  }

  const handleCancel = () => {
    if (!readOnly && snapshotRef.current != null && selected && replaceListItem) {
      replaceListItem(selected.kind, selected.index, snapshotRef.current)
    }
    snapshotRef.current = null
    snapshotKeyRef.current = null
    onSelect(null)
  }

  const toggle = (key) => {
    setExpanded((prev) => {
      const currentlyOpen = prev[key] !== false
      const willOpen = !currentlyOpen
      if (willOpen && outlineLevel <= 1) {
        setOutlineLevel(maxOutlineLevel)
      }
      return { ...prev, [key]: willOpen }
    })
  }

  const select = (kind, index) => onSelect({ kind, index })

  const isSelected = (kind, index) => selected?.kind === kind && selected?.index === index

  const factoryFor = (kind) => ({
    activities: emptyIndustryActivityRow,
    deliverables: emptyIndustryDeliverableRow,
    milestones: emptyIndustryMilestoneRow,
  }[kind])

  const countTree = (nodes) => {
    let n = 0
    const walk = (list) => {
      for (const node of list || []) {
        n += 1
        walk(node.children)
      }
    }
    walk(nodes)
    return n
  }

  const renderWbsCell = (key, ctx, extras = {}) => {
    if (key === '_actions') return extras.actions || null
    if (key === 'wbs' && extras.wbsContent) return extras.wbsContent
    if (key === 'name' && extras.nameContent) return extras.nameContent
    return formatIndustryPlanCell(key, ctx)
  }

  const renderTreeRows = (nodes, phaseNumber) => filterFlatByOutlineLevel(flattenWbsTree(nodes), outlineLevel).map((item) => {
    const depthPad = Math.max(0, (item.depth || 1) - 1)
    const addItems = [
      {
        label: `Add nested ${item.label.toLowerCase()} under this`,
        onClick: () => onAddNestedChild?.(item.kind, factoryFor(item.kind), item.kind, item.index),
      },
      {
        label: 'Add sibling (same level)',
        onClick: () => onAddSibling?.(item.kind, factoryFor(item.kind), item.index),
      },
    ]
    if (phaseNumber) {
      addItems.push(
        {
          label: 'Add activity under phase',
          onClick: () => onAddUnderPhase?.('activities', emptyIndustryActivityRow, phaseNumber),
        },
        {
          label: 'Add deliverable under phase',
          onClick: () => onAddUnderPhase?.('deliverables', emptyIndustryDeliverableRow, phaseNumber),
        },
        {
          label: 'Add milestone under phase',
          onClick: () => onAddUnderPhase?.('milestones', emptyIndustryMilestoneRow, phaseNumber),
        },
      )
    }

    const ctx = {
      kind: item.kind,
      row: item.row,
      wbs: item.wbs,
      label: item.label,
      depth: item.depth,
      customDefs: defs,
    }

    return (
      <tr
        key={`${item.kind}-${item.index}-${item.wbs}`}
        onClick={() => select(item.kind, item.index)}
        className={`cursor-pointer ${
          isSelected(item.kind, item.index)
            ? 'bg-blue-50 dark:bg-blue-950/40'
            : 'hover:bg-gray-50 dark:hover:bg-gray-900/60'
        }`}
      >
        {colState.layout.map((key) => {
          if (key === '_actions') {
            return (
              <td key={key} className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                {readOnly ? null : <WbsAddMenu items={addItems} />}
              </td>
            )
          }
          if (key === 'wbs') {
            return (
              <td key={key} className="px-2 py-1.5 text-gray-500 font-mono">
                <span
                  className="inline-flex items-center"
                  style={{ paddingLeft: `${depthPad * 14 + 8}px` }}
                >
                  <span className="mr-1.5 text-gray-400 dark:text-gray-600 select-none" aria-hidden="true">└</span>
                  {item.wbs}
                </span>
              </td>
            )
          }
          if (key === 'name') {
            return (
              <td key={key} className="px-2 py-1.5 text-gray-800 dark:text-gray-100">
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ paddingLeft: `${depthPad * 16}px` }}
                >
                  <span className="h-3 w-0.5 shrink-0 rounded bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
                  {formatIndustryPlanCell('name', ctx)}
                </span>
              </td>
            )
          }
          return (
            <td key={key} className="px-2 py-1.5 text-gray-600 dark:text-gray-400">
              {renderWbsCell(key, ctx)}
            </td>
          )
        })}
      </tr>
    )
  })

  const detail = (() => {
    if (!selected) return null
    const { kind, index } = selected
    if (kind === 'phases' && plan.phases[index]) {
      return (
        <PhaseDetail row={plan.phases[index]} index={index} updateListItem={updateListItem}
          removeListItem={removeListItem} canRemove={plan.phases.length > 1} customDefs={customDefs}
          readOnly={readOnly} />
      )
    }
    if (kind === 'activities' && plan.activities[index]) {
      return <ActivityDetail row={plan.activities[index]} index={index} plan={plan}
        updateListItem={updateListItem} removeListItem={removeListItem} customDefs={customDefs}
        readOnly={readOnly} />
    }
    if (kind === 'deliverables' && plan.deliverables[index]) {
      return <DeliverableDetail row={plan.deliverables[index]} index={index} plan={plan}
        updateListItem={updateListItem} removeListItem={removeListItem} customDefs={customDefs}
        readOnly={readOnly} />
    }
    if (kind === 'milestones' && plan.milestones[index]) {
      return <MilestoneDetail row={plan.milestones[index]} index={index} plan={plan}
        updateListItem={updateListItem} removeListItem={removeListItem} customDefs={customDefs}
        readOnly={readOnly} />
    }
    return null
  })()

  const colCount = colState.layout.length
  const selectedRow = selected
    ? {
        phases: plan.phases,
        activities: plan.activities,
        deliverables: plan.deliverables,
        milestones: plan.milestones,
      }[selected.kind]?.[selected.index]
    : null
  const detailTitle = selected ? detailTitleFor(selected.kind, selectedRow, { readOnly }) : ''

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-3xl">
          WBS numbers are display-only. Click a row to {readOnly ? 'view' : 'edit'} in a popup.
          Use Collapse all / Expand all or Outline level (MS Project style). Use Columns ▾ to show, hide, or reorder fields
          {readOnly ? '.' : ', or define custom columns for this template.'}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <WbsOutlineToolbar
            outlineLevel={outlineLevel}
            maxLevel={maxOutlineLevel}
            onOutlineLevel={applyOutlineLevel}
          />
          <ColumnChooserWired colState={colState} customColumnApi={customColumnApi} readOnly={readOnly} />
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[720px] divide-y divide-gray-200 dark:divide-gray-700 text-xs">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <GridColumnHeaders layout={colState.layout} opts={colState.opts} onMove={colState.move} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-950/40">
            {groups.map((g) => {
              const open = expanded[g.wbs] !== false
              const childCount = countTree(g.tree)
              const phaseNum = g.phaseNumber
              const phaseCtx = {
                kind: 'phases',
                isPhase: true,
                row: g.phase || {},
                wbs: g.wbs,
                label: 'Phase',
                customDefs: defs,
              }
              return (
                <Fragment key={g.wbs}>
                  <tr
                    onClick={() => select('phases', g.phaseIndex)}
                    className={`cursor-pointer ${
                      isSelected('phases', g.phaseIndex)
                        ? 'bg-blue-50 dark:bg-blue-950/40'
                        : 'bg-gray-100/80 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {colState.layout.map((key) => {
                      if (key === '_actions') {
                        return (
                          <td key={key} className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {readOnly ? null : (
                            <WbsAddMenu
                              items={[
                                {
                                  label: 'Add activity under this phase',
                                  onClick: () => {
                                    setExpanded((prev) => ({ ...prev, [g.wbs]: true }))
                                    onAddUnderPhase?.('activities', emptyIndustryActivityRow, phaseNum)
                                  },
                                },
                                {
                                  label: 'Add deliverable under this phase',
                                  onClick: () => {
                                    setExpanded((prev) => ({ ...prev, [g.wbs]: true }))
                                    onAddUnderPhase?.('deliverables', emptyIndustryDeliverableRow, phaseNum)
                                  },
                                },
                                {
                                  label: 'Add milestone under this phase',
                                  onClick: () => {
                                    setExpanded((prev) => ({ ...prev, [g.wbs]: true }))
                                    onAddUnderPhase?.('milestones', emptyIndustryMilestoneRow, phaseNum)
                                  },
                                },
                                {
                                  label: 'Add phase after this one',
                                  onClick: () => onAddPhaseAfter?.(g.phaseIndex),
                                },
                              ]}
                            />
                            )}
                          </td>
                        )
                      }
                      if (key === 'wbs') {
                        return (
                          <td key={key} className="px-2 py-1.5 font-semibold text-gray-800 dark:text-gray-100">
                            <span
                              role="button"
                              tabIndex={0}
                              className="mr-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                              onClick={(e) => { e.stopPropagation(); toggle(g.wbs) }}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter' && e.key !== ' ') return
                                e.preventDefault()
                                e.stopPropagation()
                                toggle(g.wbs)
                              }}
                              aria-label={open ? 'Collapse' : 'Expand'}
                              aria-expanded={open}
                            >
                              {open ? '▾' : '▸'}
                            </span>
                            {g.wbs}
                          </td>
                        )
                      }
                      if (key === 'kind') {
                        return (
                          <td key={key} className="px-2 py-1.5 font-medium text-gray-600 dark:text-gray-300">
                            Phase
                          </td>
                        )
                      }
                      if (key === 'name') {
                        return (
                          <td key={key} className="px-2 py-1.5 font-medium text-gray-900 dark:text-gray-100">
                            <span className="inline-flex items-center font-semibold">
                              {g.phase?.phase_name || '—'}
                              <span className="ml-2 text-gray-400 font-normal">({childCount})</span>
                            </span>
                          </td>
                        )
                      }
                      return (
                        <td key={key} className="px-2 py-1.5 text-gray-600 dark:text-gray-400">
                          {formatIndustryPlanCell(key, phaseCtx)}
                        </td>
                      )
                    })}
                  </tr>
                  {open && renderTreeRows(g.tree, phaseNum)}
                </Fragment>
              )
            })}
            {(unassigned.tree?.length > 0) && (
              <Fragment>
                <tr className="bg-amber-50/80 dark:bg-amber-950/30">
                  <td className="px-2 py-1.5 font-semibold text-amber-800 dark:text-amber-200" colSpan={colCount}>
                    <span
                      role="button"
                      tabIndex={0}
                      className="mr-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                      onClick={(e) => { e.stopPropagation(); toggle('__unassigned') }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        e.stopPropagation()
                        toggle('__unassigned')
                      }}
                      aria-label={expanded.__unassigned !== false ? 'Collapse' : 'Expand'}
                      aria-expanded={expanded.__unassigned !== false}
                    >
                      {expanded.__unassigned !== false ? '▾' : '▸'}
                    </span>
                    Unassigned (no matching phase #)
                  </td>
                </tr>
                {expanded.__unassigned !== false && renderTreeRows(unassigned.tree, '')}
              </Fragment>
            )}
          </tbody>
        </table>
      </div>
      {detail && selected && (
        <IndustryPlanRowDetailModal
          open
          title={detailTitle}
          readOnly={readOnly}
          onCancel={handleCancel}
          onSave={handleSave}
        >
          {detail}
        </IndustryPlanRowDetailModal>
      )}
    </div>
  )
}

export {
  SectionToolbar,
  PlanningDefaultsFields,
  RemoveRowButton,
  PRIORITIES,
  ACTIVITY_TYPES,
  DELIVERABLE_TYPES,
  LIKELIHOOD,
}
