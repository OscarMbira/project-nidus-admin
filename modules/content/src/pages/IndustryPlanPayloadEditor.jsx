import { useEffect, useState } from 'react'
import {
  emptyIndustryActivityRow,
  emptyIndustryDeliverableRow,
  emptyIndustryMilestoneRow,
  emptyIndustryPhaseRow,
  emptyIndustryRiskRow,
  emptyIndustryRoleRow,
  parseTagsInput,
  tagsToInput,
  reorderListItems,
  resolvePhaseKey,
  newIndustryRowId,
  ensureIndustryRowIds,
  addIndustryPlanCustomColumn,
  updateIndustryPlanCustomColumn,
  deleteIndustryPlanCustomColumn,
  normalizeCustomColumnDefs,
} from '@nidus-admin/shared'
import { AdminField, inputClass, useToast } from '@nidus-admin/ui'
import {
  SectionToolbar,
  IndustryPlanFlatGrid,
  IndustryPlanWbsPanel,
  PhaseDetail,
  ActivityDetail,
  DeliverableDetail,
  RiskDetail,
  MilestoneDetail,
  RoleDetail,
} from './IndustryPlanGridViews.jsx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'phases', label: 'Phases' },
  { id: 'activities', label: 'Activities' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'risks', label: 'Risks' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'roles', label: 'Roles' },
]

const VIEW_STORAGE_PREFIX = 'nidus.admin.industryPlan.view.'

function loadView(tabId) {
  try {
    const v = localStorage.getItem(`${VIEW_STORAGE_PREFIX}${tabId}`)
    return v === 'grid' ? 'grid' : 'card'
  } catch {
    return 'card'
  }
}

function saveView(tabId, view) {
  try {
    localStorage.setItem(`${VIEW_STORAGE_PREFIX}${tabId}`, view)
  } catch { /* ignore */ }
}

/**
 * Structured editor for industry_plan Global Template payloads.
 * Option B: WBS on Phases (grid mode); flat grids + master/detail on all entity tabs.
 * @param {boolean} [readOnly] — view/locked: tabs stay clickable; fields/actions are locked
 * @param {boolean} [viewMode] — true when opened with mode=view (message copy differs from approval lock)
 */
export default function IndustryPlanPayloadEditor({
  value,
  onChange,
  activeTab,
  onTabChange,
  readOnly = false,
  viewMode = false,
}) {
  const { showError } = useToast()
  const plan = value
  const tab = activeTab || 'overview'

  const notifyReadOnlyAction = (action = 'change') => {
    showError(
      viewMode
        ? `You are in view mode. Switch to Edit to ${action} records.`
        : 'This record is locked for editing until the pending change is approved or rejected.'
    )
  }

  const setPlan = (next) => {
    if (readOnly) return
    onChange(next)
  }

  const requireEditable = (action = 'change') => {
    if (!readOnly) return true
    notifyReadOnlyAction(action)
    return false
  }

  const [viewByTab, setViewByTab] = useState(() => ({
    phases: loadView('phases'),
    activities: loadView('activities'),
    deliverables: loadView('deliverables'),
    risks: loadView('risks'),
    milestones: loadView('milestones'),
    roles: loadView('roles'),
  }))
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [wbsSelected, setWbsSelected] = useState(null)

  useEffect(() => {
    setSelectedIndex(null)
    setWbsSelected(null)
  }, [tab, viewByTab[tab]])

  useEffect(() => {
    if (readOnly) return
    const { plan: next, changed } = ensureIndustryRowIds(plan)
    if (changed) setPlan(next)
  }, [plan, readOnly]) // setPlan is stable enough via onChange; avoid toast spam in view mode

  const setTabView = (tabId, view) => {
    setViewByTab((prev) => ({ ...prev, [tabId]: view }))
    saveView(tabId, view)
  }

  const updateRoot = (key, val) => {
    if (!requireEditable('edit')) return
    setPlan({ ...plan, [key]: val })
  }

  const customDefs = normalizeCustomColumnDefs(plan?.ui?.custom_column_defs)

  const customColumnApi = {
    defs: customDefs,
    onAdd: ({ label, type }) => {
      if (!requireEditable('add')) return { ok: false, error: 'read_only' }
      const result = addIndustryPlanCustomColumn(plan, { label, type })
      if (result.ok) setPlan(result.plan)
      return result
    },
    onUpdate: (id, { label, type }) => {
      if (!requireEditable('edit')) return { ok: false, error: 'read_only' }
      const result = updateIndustryPlanCustomColumn(plan, id, { label, type })
      if (result.ok) setPlan(result.plan)
      return result
    },
    onDelete: (id) => {
      if (!requireEditable('edit')) return { ok: false, error: 'read_only' }
      const result = deleteIndustryPlanCustomColumn(plan, id)
      if (result.ok) setPlan(result.plan)
      return result
    },
  }

  const updateListItem = (listKey, index, key, val) => {
    if (!requireEditable('edit')) return
    const list = plan[listKey].map((row, i) => (i === index ? { ...row, [key]: val } : row))
    setPlan({ ...plan, [listKey]: list })
  }

  const replaceListItem = (listKey, index, row) => {
    if (!requireEditable('edit')) return
    const list = [...(plan[listKey] || [])]
    if (index < 0 || index >= list.length) return
    list[index] = row
    setPlan({ ...plan, [listKey]: list })
  }

  const addListItem = (listKey, factory) => {
    if (!requireEditable('add')) return
    const list = plan[listKey] || []
    setPlan({ ...plan, [listKey]: [...list, factory(list.length + 1)] })
  }

  /** Add a direct child under a phase (phase_number + parent_id = phase.row_id). */
  const addUnderPhase = (listKey, factory, phaseNumber, afterIndex = null) => {
    if (!requireEditable('add')) return -1
    let working = plan
    const { plan: withIds, changed } = ensureIndustryRowIds(working)
    if (changed) working = withIds

    const phaseKeyStr = resolvePhaseKey({ phase_number: phaseNumber })
    const phaseRow = (working.phases || []).find(
      (p, i) => resolvePhaseKey(p, i) === phaseKeyStr,
    )
    const phaseParentId = phaseRow?.row_id || ''

    const list = [...(working[listKey] || [])]
    if (!phaseKeyStr) {
      const row = { ...factory(list.length + 1), phase_number: '', parent_id: '' }
      const next = [...list, row].map((r, i) => ({ ...r, sort_order: i + 1 }))
      setPlan({ ...working, [listKey]: next })
      return next.length - 1
    }
    const row = {
      ...factory(list.length + 1),
      phase_number: phaseKeyStr,
      parent_id: phaseParentId,
    }

    let insertAt = list.length
    if (afterIndex != null && afterIndex >= 0 && afterIndex < list.length) {
      insertAt = afterIndex + 1
    } else {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (resolvePhaseKey(list[i]) === phaseKeyStr) {
          insertAt = i + 1
          break
        }
      }
    }

    list.splice(insertAt, 0, row)
    const next = list.map((r, i) => ({ ...r, sort_order: i + 1 }))
    setPlan({ ...working, [listKey]: next })
    return insertAt
  }

  /**
   * Nest a new row under a specific activity/deliverable/milestone (parent_id).
   * Depth increases in the WBS (e.g. 1.2 → 1.2.1).
   */
  const addNestedChild = (listKey, factory, parentListKey, parentIndex) => {
    if (!requireEditable('add')) return -1
    let working = plan
    const { plan: withIds, changed } = ensureIndustryRowIds(working)
    if (changed) working = withIds

    const parentList = [...(working[parentListKey] || [])]
    const parent = parentList[parentIndex]
    if (!parent) return -1

    let parentId = String(parent.row_id || '').trim()
    if (!parentId) {
      parentId = newIndustryRowId()
      parentList[parentIndex] = { ...parent, row_id: parentId }
      working = { ...working, [parentListKey]: parentList }
    }

    const phase = resolvePhaseKey(parent)
    const targetList = listKey === parentListKey
      ? [...(working[listKey] || [])]
      : [...(working[listKey] || [])]

    // Keep parent row_id update if same list
    if (listKey === parentListKey) {
      const pIdx = targetList.findIndex((r) => String(r.row_id || '') === parentId)
      if (pIdx >= 0) targetList[pIdx] = { ...targetList[pIdx], row_id: parentId }
    }

    const row = {
      ...factory(targetList.length + 1),
      phase_number: phase,
      parent_id: parentId,
    }

    let insertAt = targetList.length
    if (listKey === parentListKey) {
      const pIdx = targetList.findIndex((r) => String(r.row_id || '') === parentId)
      insertAt = (pIdx >= 0 ? pIdx : parentIndex) + 1
      while (
        insertAt < targetList.length
        && String(targetList[insertAt]?.parent_id || '') === parentId
      ) {
        insertAt += 1
      }
    } else {
      for (let i = targetList.length - 1; i >= 0; i -= 1) {
        if (String(targetList[i]?.parent_id || '') === parentId) {
          insertAt = i + 1
          break
        }
      }
    }

    targetList.splice(insertAt, 0, row)
    const nextPlan = {
      ...working,
      [listKey]: targetList.map((r, i) => ({ ...r, sort_order: i + 1 })),
    }
    if (listKey !== parentListKey) {
      nextPlan[parentListKey] = parentList
    }
    setPlan(nextPlan)
    return insertAt
  }

  /** Insert a new phase after the given index; renumber sort_order. */
  const addPhaseAfter = (afterIndex) => {
    const phases = [...(plan.phases || [])]
    const insertAt = Math.min(Math.max(afterIndex + 1, 0), phases.length)
    const phaseNumber = insertAt + 1
    const row = {
      ...emptyIndustryPhaseRow(phaseNumber),
      phase_number: phaseNumber,
      phase_name: '',
    }
    phases.splice(insertAt, 0, row)
    const renumbered = phases.map((p, i) => ({
      ...p,
      phase_number: Number(resolvePhaseKey(p, i)) || i + 1,
      sort_order: i + 1,
    }))
    setPlan({ ...plan, phases: renumbered })
    return insertAt
  }

  /** Add a sibling sharing the same parent_id + phase_number. */
  const addSibling = (listKey, factory, fromIndex) => {
    if (!requireEditable('add')) return -1
    if (listKey === 'phases') {
      return addPhaseAfter(fromIndex)
    }
    if (!['activities', 'deliverables', 'milestones'].includes(listKey)) {
      const list = plan[listKey] || []
      const row = factory(list.length + 1)
      setPlan({ ...plan, [listKey]: [...list, row] })
      return list.length
    }

    let working = plan
    const { plan: withIds, changed } = ensureIndustryRowIds(working)
    if (changed) working = withIds
    const rows = [...(working[listKey] || [])]
    const src = rows[fromIndex]
    if (!src) return -1

    const row = {
      ...factory(rows.length + 1),
      phase_number: resolvePhaseKey(src),
      parent_id: String(src.parent_id || '').trim(),
    }
    rows.splice(fromIndex + 1, 0, row)
    setPlan({ ...working, [listKey]: rows.map((r, i) => ({ ...r, sort_order: i + 1 })) })
    return fromIndex + 1
  }

  const removeListItem = (listKey, index, minKeep = 0) => {
    if (!requireEditable('edit')) return
    const list = plan[listKey] || []
    if (list.length <= minKeep) return
    setPlan({ ...plan, [listKey]: list.filter((_, i) => i !== index) })
    setSelectedIndex(null)
    setWbsSelected(null)
  }

  const reorder = (listKey, fromIndex, toIndex) => {
    if (!requireEditable('edit')) return
    setPlan({ ...plan, [listKey]: reorderListItems(plan[listKey] || [], fromIndex, toIndex) })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Industry plan content</h2>
        <p className="text-xs text-gray-500">
          {readOnly
            ? 'Browse catalog identity and child rows (read-only). Use the tabs below to open each section.'
            : 'Edit catalog identity and child rows. Publish syncs this into Platform industry templates. Use Card ⊞ / Grid ≡ on each tab; Phases grid shows the WBS hierarchy.'}
        </p>
      </div>

      {readOnly && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          {viewMode
            ? 'View mode is read-only. Switch to Edit if you need to add or change phases, activities, or other records.'
            : 'Editing is locked until the pending change is approved or rejected.'}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
        {TABS.map((t) => {
          const count =
            t.id === 'overview'
              ? null
              : Array.isArray(plan[t.id])
                ? plan[t.id].length
                : null
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange?.(t.id)}
              className={`rounded px-2.5 py-1 text-xs sm:text-sm ${
                tab === t.id
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
              {count != null ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <fieldset
          disabled={readOnly}
          className="m-0 min-w-0 border-0 p-0 disabled:opacity-95"
        >
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Industry code" required>
            <input
              className={inputClass}
              value={plan.industry_code}
              onChange={(e) => updateRoot('industry_code', e.target.value)}
              placeholder="financial_services"
            />
          </AdminField>
          <AdminField label="Industry name">
            <input
              className={inputClass}
              value={plan.industry_name}
              onChange={(e) => updateRoot('industry_name', e.target.value)}
              placeholder="Financial Services & Transformation"
            />
          </AdminField>
          <AdminField label="Typical duration">
            <input
              className={inputClass}
              value={plan.typical_duration}
              onChange={(e) => updateRoot('typical_duration', e.target.value)}
              placeholder="9–18 months"
            />
          </AdminField>
          <AdminField label="Icon key">
            <input
              className={inputClass}
              value={plan.icon}
              onChange={(e) => updateRoot('icon', e.target.value)}
              placeholder="landmark"
            />
          </AdminField>
          <div className="sm:col-span-2">
            <AdminField label="Tags">
              <input
                className={inputClass}
                value={tagsToInput(plan.tags)}
                onChange={(e) => updateRoot('tags', parseTagsInput(e.target.value))}
                placeholder="Financial, industry-plan"
              />
              <p className="mt-1 text-xs text-gray-500">Comma-separated.</p>
            </AdminField>
          </div>
          <div className="sm:col-span-2">
            <AdminField label="Catalog description">
              <textarea
                rows={4}
                className={inputClass}
                value={plan.description}
                onChange={(e) => updateRoot('description', e.target.value)}
                placeholder="What this industry blueprint covers…"
              />
            </AdminField>
          </div>
        </div>
        </fieldset>
      )}

      {tab === 'phases' && (
        <div className="space-y-3">
          <SectionToolbar
            title="Phases"
            count={plan.phases.length}
            onAdd={() => addListItem('phases', emptyIndustryPhaseRow)}
            addLabel="Add phase"
            view={viewByTab.phases}
            onViewChange={(v) => setTabView('phases', v)}
          />
          {viewByTab.phases === 'grid' ? (
            <IndustryPlanWbsPanel
              plan={plan}
              readOnly={readOnly}
              updateListItem={updateListItem}
              removeListItem={removeListItem}
              replaceListItem={replaceListItem}
              customDefs={customDefs}
              customColumnApi={customColumnApi}
              selected={wbsSelected}
              onSelect={setWbsSelected}
              onAddUnderPhase={(listKey, factory, phaseNumber) => {
                const idx = addUnderPhase(listKey, factory, phaseNumber)
                if (idx >= 0) setWbsSelected({ kind: listKey, index: idx })
              }}
              onAddPhaseAfter={(afterIndex) => {
                if (!requireEditable('add')) return
                const idx = addPhaseAfter(afterIndex)
                setWbsSelected({ kind: 'phases', index: idx })
              }}
              onAddSibling={(listKey, factory, fromIndex) => {
                const idx = addSibling(listKey, factory, fromIndex)
                if (idx >= 0) setWbsSelected({ kind: listKey, index: idx })
              }}
              onAddNestedChild={(listKey, factory, parentListKey, parentIndex) => {
                const idx = addNestedChild(listKey, factory, parentListKey, parentIndex)
                if (idx >= 0) setWbsSelected({ kind: listKey, index: idx })
              }}
            />
          ) : (
            <fieldset
              disabled={readOnly}
              className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95"
            >
              {plan.phases.map((row, index) => (
                <div key={index} className="space-y-2 rounded border border-gray-200 dark:border-gray-700 p-3">
                  <PhaseDetail
                    row={row}
                    index={index}
                    updateListItem={updateListItem}
                    removeListItem={removeListItem}
                    canRemove={plan.phases.length > 1}
                    customDefs={customDefs}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}

      {tab === 'activities' && (
        <div className="space-y-3">
          <SectionToolbar
            title="Activities"
            count={plan.activities.length}
            onAdd={() => addListItem('activities', emptyIndustryActivityRow)}
            addLabel="Add activity"
            view={viewByTab.activities}
            onViewChange={(v) => setTabView('activities', v)}
          />
          {plan.activities.length === 0 && (
            <p className="text-xs text-gray-500">No activities yet. Use Add activity to create one.</p>
          )}
          {viewByTab.activities === 'grid' ? (
            <IndustryPlanFlatGrid
              readOnly={readOnly}
              listKey="activities"
              rows={plan.activities}
              customDefs={customDefs}
              customColumnApi={customColumnApi}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onReorder={(from, to) => reorder('activities', from, to)}
              onRemove={(index) => removeListItem('activities', index)}
              replaceListItem={replaceListItem}
              onAddSibling={(index) => {
                const idx = addSibling('activities', emptyIndustryActivityRow, index)
                setSelectedIndex(idx)
              }}
              siblingAddLabel="Add in same phase"
              indentNameKey="activity_name"
              renderDetail={(row, index) => (
                <ActivityDetail
                  row={row}
                  index={index}
                  plan={plan}
                  updateListItem={updateListItem}
                  removeListItem={removeListItem}
                  customDefs={customDefs}
                  readOnly={readOnly}
                />
              )}
            />
          ) : (
            <fieldset
              disabled={readOnly}
              className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95"
            >
              {plan.activities.map((row, index) => (
                <div key={index} className="space-y-2 rounded border border-gray-200 dark:border-gray-700 p-3">
                  <ActivityDetail
                    row={row}
                    index={index}
                    plan={plan}
                    updateListItem={updateListItem}
                    removeListItem={removeListItem}
                    customDefs={customDefs}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}

      {tab === 'deliverables' && (
        <div className="space-y-3">
          <SectionToolbar
            title="Deliverables"
            count={plan.deliverables.length}
            onAdd={() => addListItem('deliverables', emptyIndustryDeliverableRow)}
            addLabel="Add deliverable"
            view={viewByTab.deliverables}
            onViewChange={(v) => setTabView('deliverables', v)}
          />
          {plan.deliverables.length === 0 && (
            <p className="text-xs text-gray-500">No deliverables yet.</p>
          )}
          {viewByTab.deliverables === 'grid' ? (
            <IndustryPlanFlatGrid
              readOnly={readOnly}
              listKey="deliverables"
              rows={plan.deliverables}
              customDefs={customDefs}
              customColumnApi={customColumnApi}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onReorder={(from, to) => reorder('deliverables', from, to)}
              onRemove={(index) => removeListItem('deliverables', index)}
              replaceListItem={replaceListItem}
              onAddSibling={(index) => {
                const idx = addSibling('deliverables', emptyIndustryDeliverableRow, index)
                setSelectedIndex(idx)
              }}
              siblingAddLabel="Add in same phase"
              indentNameKey="deliverable_name"
              renderDetail={(row, index) => (
                <DeliverableDetail
                  row={row}
                  index={index}
                  plan={plan}
                  updateListItem={updateListItem}
                  removeListItem={removeListItem}
                  customDefs={customDefs}
                  readOnly={readOnly}
                />
              )}
            />
          ) : (
            <fieldset
              disabled={readOnly}
              className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95"
            >
              {plan.deliverables.map((row, index) => (
                <div key={index} className="space-y-2 rounded border border-gray-200 dark:border-gray-700 p-3">
                  <DeliverableDetail
                    row={row}
                    index={index}
                    plan={plan}
                    updateListItem={updateListItem}
                    removeListItem={removeListItem}
                    customDefs={customDefs}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}

      {tab === 'risks' && (
        <div className="space-y-3">
          <SectionToolbar
            title="Risks"
            count={plan.risks.length}
            onAdd={() => addListItem('risks', emptyIndustryRiskRow)}
            addLabel="Add risk"
            view={viewByTab.risks}
            onViewChange={(v) => setTabView('risks', v)}
          />
          {plan.risks.length === 0 && (
            <p className="text-xs text-gray-500">No risks yet.</p>
          )}
          {viewByTab.risks === 'grid' ? (
            <IndustryPlanFlatGrid
              readOnly={readOnly}
              listKey="risks"
              rows={plan.risks}
              customDefs={customDefs}
              customColumnApi={customColumnApi}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onReorder={(from, to) => reorder('risks', from, to)}
              onRemove={(index) => removeListItem('risks', index)}
              replaceListItem={replaceListItem}
              renderDetail={(row, index) => (
                <RiskDetail
                  row={row}
                  index={index}
                  updateListItem={updateListItem}
                  removeListItem={removeListItem}
                  customDefs={customDefs}
                  readOnly={readOnly}
                />
              )}
            />
          ) : (
            <fieldset
              disabled={readOnly}
              className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95"
            >
              {plan.risks.map((row, index) => (
                <div key={index} className="space-y-2 rounded border border-gray-200 dark:border-gray-700 p-3">
                  <RiskDetail
                    row={row}
                    index={index}
                    updateListItem={updateListItem}
                    removeListItem={removeListItem}
                    customDefs={customDefs}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}

      {tab === 'milestones' && (
        <div className="space-y-3">
          <SectionToolbar
            title="Milestones"
            count={plan.milestones.length}
            onAdd={() => addListItem('milestones', emptyIndustryMilestoneRow)}
            addLabel="Add milestone"
            view={viewByTab.milestones}
            onViewChange={(v) => setTabView('milestones', v)}
          />
          {plan.milestones.length === 0 && (
            <p className="text-xs text-gray-500">No milestones yet.</p>
          )}
          {viewByTab.milestones === 'grid' ? (
            <IndustryPlanFlatGrid
              readOnly={readOnly}
              listKey="milestones"
              rows={plan.milestones}
              customDefs={customDefs}
              customColumnApi={customColumnApi}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onReorder={(from, to) => reorder('milestones', from, to)}
              onRemove={(index) => removeListItem('milestones', index)}
              replaceListItem={replaceListItem}
              onAddSibling={(index) => {
                const idx = addSibling('milestones', emptyIndustryMilestoneRow, index)
                setSelectedIndex(idx)
              }}
              siblingAddLabel="Add in same phase"
              indentNameKey="milestone_name"
              renderDetail={(row, index) => (
                <MilestoneDetail
                  row={row}
                  index={index}
                  plan={plan}
                  updateListItem={updateListItem}
                  removeListItem={removeListItem}
                  customDefs={customDefs}
                  readOnly={readOnly}
                />
              )}
            />
          ) : (
            <fieldset
              disabled={readOnly}
              className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95"
            >
              {plan.milestones.map((row, index) => (
                <div key={index} className="space-y-2 rounded border border-gray-200 dark:border-gray-700 p-3">
                  <MilestoneDetail
                    row={row}
                    index={index}
                    plan={plan}
                    updateListItem={updateListItem}
                    removeListItem={removeListItem}
                    customDefs={customDefs}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}

      {tab === 'roles' && (
        <div className="space-y-3">
          <SectionToolbar
            title="Roles"
            count={plan.roles.length}
            onAdd={() => addListItem('roles', emptyIndustryRoleRow)}
            addLabel="Add role"
            view={viewByTab.roles}
            onViewChange={(v) => setTabView('roles', v)}
          />
          {plan.roles.length === 0 && (
            <p className="text-xs text-gray-500">No roles yet.</p>
          )}
          {viewByTab.roles === 'grid' ? (
            <IndustryPlanFlatGrid
              readOnly={readOnly}
              listKey="roles"
              rows={plan.roles}
              customDefs={customDefs}
              customColumnApi={customColumnApi}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onReorder={(from, to) => reorder('roles', from, to)}
              onRemove={(index) => removeListItem('roles', index)}
              replaceListItem={replaceListItem}
              renderDetail={(row, index) => (
                <RoleDetail
                  row={row}
                  index={index}
                  updateListItem={updateListItem}
                  removeListItem={removeListItem}
                  customDefs={customDefs}
                  readOnly={readOnly}
                />
              )}
            />
          ) : (
            <fieldset
              disabled={readOnly}
              className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95"
            >
              {plan.roles.map((row, index) => (
                <div key={index} className="space-y-2 rounded border border-gray-200 dark:border-gray-700 p-3">
                  <RoleDetail
                    row={row}
                    index={index}
                    updateListItem={updateListItem}
                    removeListItem={removeListItem}
                    customDefs={customDefs}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}

    </div>
  )
}
