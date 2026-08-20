import { useMemo, useState } from 'react'
import {
  BENEFIT_CATEGORIES,
  DEPENDENCY_TYPES,
  emptyBenefitCategoryRow,
  emptyIndustryMilestoneRow,
  emptyIndustryRiskRow,
  emptyIndustryRoleRow,
  emptyPortfolioGovernanceRow,
  emptyPortfolioMetricRow,
  emptyPortfolioObjectiveRow,
  emptyProgrammeBenefitRow,
  emptyProgrammeDependencyRow,
  emptyProgrammeGovernanceRow,
  GOVERNANCE_MODELS,
  PORTFOLIO_TYPES,
  PROGRAMME_TYPES,
  REVIEW_FREQUENCIES,
  OBJECTIVE_LEVELS,
  reorderListItems,
} from '@nidus-admin/shared'
import { AdminField, inputClass, useToast } from '@nidus-admin/ui'
import {
  IndustryPlanFlatGrid,
  MilestoneDetail,
  RiskDetail,
  RoleDetail,
  SectionToolbar,
} from './IndustryPlanGridViews.jsx'

const PORTFOLIO_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'objectives', label: 'Objectives' },
  { id: 'governance', label: 'Governance' },
  { id: 'benefit_categories', label: 'Benefit categories' },
  { id: 'risks', label: 'Risks' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'roles', label: 'Roles' },
]

const PROGRAMME_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'governance', label: 'Governance' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'dependencies', label: 'Dependencies' },
  { id: 'benefits', label: 'Benefits' },
  { id: 'risks', label: 'Risks' },
  { id: 'roles', label: 'Roles' },
]

const VIEW_PREFIX = 'nidus.admin.ppTemplate.view.'

function loadView(key) {
  try {
    return localStorage.getItem(`${VIEW_PREFIX}${key}`) === 'grid' ? 'grid' : 'card'
  } catch {
    return 'card'
  }
}

function saveView(key, view) {
  try { localStorage.setItem(`${VIEW_PREFIX}${key}`, view) } catch { /* ignore */ }
}

/** Card ⊞ / Table ≡ toggle section — same pattern as Risks / Roles tabs. */
function ToggleListSection({
  title,
  listKey,
  columnKey = null,
  rows,
  view,
  onViewChange,
  onAdd,
  addLabel,
  readOnly,
  emptyText,
  selectedIndex,
  onSelect,
  onReorder,
  onRemove,
  replaceListItem,
  renderDetail,
}) {
  const list = rows || []
  return (
    <div className="space-y-3">
      <SectionToolbar
        title={title}
        count={list.length}
        onAdd={onAdd}
        addLabel={addLabel}
        view={view}
        onViewChange={onViewChange}
      />
      {list.length === 0 && view === 'card' && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{emptyText}</p>
      )}
      {view === 'grid' ? (
        <IndustryPlanFlatGrid
          readOnly={readOnly}
          listKey={listKey}
          columnKey={columnKey}
          rows={list}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
          onReorder={onReorder}
          onRemove={onRemove}
          replaceListItem={replaceListItem}
          renderDetail={renderDetail}
        />
      ) : (
        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0">
          {list.map((row, index) => (
            <div key={index} className="rounded border border-gray-200 p-3 dark:border-gray-700">
              {renderDetail(row, index)}
            </div>
          ))}
        </fieldset>
      )}
    </div>
  )
}

function RemoveBtn({ onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-xs text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
    >
      Remove
    </button>
  )
}

function BenefitCategoryDetail({ row, index, updateListItem, removeListItem, readOnly }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Category">
          <select
            className={inputClass}
            value={row.category}
            disabled={readOnly}
            onChange={(e) => updateListItem('benefit_categories', index, 'category', e.target.value)}
          >
            {BENEFIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Notes">
          <input
            className={inputClass}
            value={row.notes}
            disabled={readOnly}
            onChange={(e) => updateListItem('benefit_categories', index, 'notes', e.target.value)}
          />
        </AdminField>
      </div>
      {!readOnly && <RemoveBtn onClick={() => removeListItem('benefit_categories', index)} />}
    </div>
  )
}

function ObjectiveDetail({ row, index, updateListItem, removeListItem, readOnly }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Code">
          <input className={inputClass} value={row.objective_code} disabled={readOnly}
            onChange={(e) => updateListItem('objectives', index, 'objective_code', e.target.value)} />
        </AdminField>
        <AdminField label="Name" required>
          <input className={inputClass} value={row.objective_name} disabled={readOnly}
            onChange={(e) => updateListItem('objectives', index, 'objective_name', e.target.value)} />
        </AdminField>
        <AdminField label="Level">
          <select className={inputClass} value={row.objective_level} disabled={readOnly}
            onChange={(e) => updateListItem('objectives', index, 'objective_level', e.target.value)}>
            {OBJECTIVE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </AdminField>
        <AdminField label="Importance (1–5)">
          <input type="number" min={1} max={5} className={inputClass} value={row.importance_score} disabled={readOnly}
            onChange={(e) => updateListItem('objectives', index, 'importance_score', e.target.value)} />
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Description">
            <textarea rows={2} className={inputClass} value={row.objective_description} disabled={readOnly}
              onChange={(e) => updateListItem('objectives', index, 'objective_description', e.target.value)} />
          </AdminField>
        </div>
        <AdminField label="Measurement criteria">
          <input className={inputClass} value={row.measurement_criteria} disabled={readOnly}
            onChange={(e) => updateListItem('objectives', index, 'measurement_criteria', e.target.value)} />
        </AdminField>
        <AdminField label="Target value">
          <input className={inputClass} value={row.target_value} disabled={readOnly}
            onChange={(e) => updateListItem('objectives', index, 'target_value', e.target.value)} />
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Strategic alignment">
            <input className={inputClass} value={row.strategic_alignment} disabled={readOnly}
              onChange={(e) => updateListItem('objectives', index, 'strategic_alignment', e.target.value)} />
          </AdminField>
        </div>
      </div>
      {!readOnly && <RemoveBtn onClick={() => removeListItem('objectives', index)} />}
    </div>
  )
}

function PortfolioGovernanceDetail({ row, index, updateListItem, removeListItem, readOnly }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Board / body name">
          <input className={inputClass} value={row.board_name} disabled={readOnly}
            onChange={(e) => updateListItem('governance', index, 'board_name', e.target.value)} />
        </AdminField>
        <AdminField label="Decision-making process">
          <textarea rows={2} className={inputClass} value={row.decision_making_process} disabled={readOnly}
            onChange={(e) => updateListItem('governance', index, 'decision_making_process', e.target.value)} />
        </AdminField>
        <AdminField label="Selection criteria">
          <textarea rows={2} className={inputClass} value={row.selection_criteria} disabled={readOnly}
            onChange={(e) => updateListItem('governance', index, 'selection_criteria', e.target.value)} />
        </AdminField>
        <AdminField label="Prioritisation rules">
          <textarea rows={2} className={inputClass} value={row.prioritisation_rules} disabled={readOnly}
            onChange={(e) => updateListItem('governance', index, 'prioritisation_rules', e.target.value)} />
        </AdminField>
        <AdminField label="Resource allocation rules">
          <textarea rows={2} className={inputClass} value={row.resource_allocation_rules} disabled={readOnly}
            onChange={(e) => updateListItem('governance', index, 'resource_allocation_rules', e.target.value)} />
        </AdminField>
        <AdminField label="Escalation process">
          <textarea rows={2} className={inputClass} value={row.escalation_process} disabled={readOnly}
            onChange={(e) => updateListItem('governance', index, 'escalation_process', e.target.value)} />
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Compliance requirements">
            <textarea rows={2} className={inputClass} value={row.compliance_requirements} disabled={readOnly}
              onChange={(e) => updateListItem('governance', index, 'compliance_requirements', e.target.value)} />
          </AdminField>
        </div>
      </div>
      {!readOnly && <RemoveBtn onClick={() => removeListItem('governance', index)} />}
    </div>
  )
}

function ProgrammeGovernanceDetail({ row, index, updateListItem, removeListItem, readOnly }) {
  return (
    <div className="space-y-3">
      <AdminField label="Structure">
        <textarea rows={2} className={inputClass} value={row.structure} disabled={readOnly}
          onChange={(e) => updateListItem('governance', index, 'structure', e.target.value)} />
      </AdminField>
      <AdminField label="Terms of reference">
        <textarea rows={2} className={inputClass} value={row.terms_of_reference} disabled={readOnly}
          onChange={(e) => updateListItem('governance', index, 'terms_of_reference', e.target.value)} />
      </AdminField>
      <AdminField label="Governance documents">
        <textarea rows={3} className={inputClass} value={row.governance_documents} disabled={readOnly}
          onChange={(e) => updateListItem('governance', index, 'governance_documents', e.target.value)}
          placeholder="One document per line" />
      </AdminField>
      {!readOnly && <RemoveBtn onClick={() => removeListItem('governance', index)} />}
    </div>
  )
}

function MetricDetail({ row, index, updateListItem, removeListItem, readOnly }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="KPI name" required>
          <input className={inputClass} value={row.kpi_name} disabled={readOnly}
            onChange={(e) => updateListItem('metrics', index, 'kpi_name', e.target.value)} />
        </AdminField>
        <AdminField label="Target">
          <input className={inputClass} value={row.target} disabled={readOnly}
            onChange={(e) => updateListItem('metrics', index, 'target', e.target.value)} />
        </AdminField>
        <AdminField label="Measurement frequency">
          <select className={inputClass} value={row.measurement_frequency} disabled={readOnly}
            onChange={(e) => updateListItem('metrics', index, 'measurement_frequency', e.target.value)}>
            {REVIEW_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </AdminField>
        <AdminField label="Description">
          <input className={inputClass} value={row.description} disabled={readOnly}
            onChange={(e) => updateListItem('metrics', index, 'description', e.target.value)} />
        </AdminField>
      </div>
      {!readOnly && <RemoveBtn onClick={() => removeListItem('metrics', index)} />}
    </div>
  )
}

function DependencyDetail({ row, index, updateListItem, removeListItem, readOnly }) {
  return (
    <div className="space-y-3">
      <AdminField label="Description" required>
        <textarea rows={2} className={inputClass} value={row.dependency_description} disabled={readOnly}
          onChange={(e) => updateListItem('dependencies', index, 'dependency_description', e.target.value)} />
      </AdminField>
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Type">
          <select className={inputClass} value={row.dependency_type} disabled={readOnly}
            onChange={(e) => updateListItem('dependencies', index, 'dependency_type', e.target.value)}>
            {DEPENDENCY_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </AdminField>
        <AdminField label="Linked programme / portfolio reference">
          <input className={inputClass} value={row.linked_reference} disabled={readOnly}
            onChange={(e) => updateListItem('dependencies', index, 'linked_reference', e.target.value)} />
        </AdminField>
      </div>
      {!readOnly && <RemoveBtn onClick={() => removeListItem('dependencies', index)} />}
    </div>
  )
}

function ProgrammeBenefitDetail({ row, index, updateListItem, removeListItem, readOnly }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Benefit name" required>
          <input className={inputClass} value={row.benefit_name} disabled={readOnly}
            onChange={(e) => updateListItem('benefits', index, 'benefit_name', e.target.value)} />
        </AdminField>
        <AdminField label="Category">
          <select className={inputClass} value={row.category} disabled={readOnly}
            onChange={(e) => updateListItem('benefits', index, 'category', e.target.value)}>
            {BENEFIT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </AdminField>
        <AdminField label="Target value">
          <input className={inputClass} value={row.target_value} disabled={readOnly}
            onChange={(e) => updateListItem('benefits', index, 'target_value', e.target.value)} />
        </AdminField>
        <AdminField label="Description">
          <input className={inputClass} value={row.description} disabled={readOnly}
            onChange={(e) => updateListItem('benefits', index, 'description', e.target.value)} />
        </AdminField>
      </div>
      {!readOnly && <RemoveBtn onClick={() => removeListItem('benefits', index)} />}
    </div>
  )
}

/**
 * Portfolio / programme / project template editors.
 * List tabs use Card ⊞ / Table ≡ toggle (same pattern as Risks / Roles).
 */
export function PortfolioTemplatePayloadEditor({
  value,
  onChange,
  activeTab,
  onTabChange,
  readOnly = false,
  viewMode = false,
}) {
  return (
    <HierarchyTemplateEditor
      kind="portfolio"
      value={value}
      onChange={onChange}
      activeTab={activeTab}
      onTabChange={onTabChange}
      readOnly={readOnly}
      viewMode={viewMode}
      tabs={PORTFOLIO_TABS}
    />
  )
}

export function ProgrammeTemplatePayloadEditor({
  value,
  onChange,
  activeTab,
  onTabChange,
  readOnly = false,
  viewMode = false,
}) {
  return (
    <HierarchyTemplateEditor
      kind="programme"
      value={value}
      onChange={onChange}
      activeTab={activeTab}
      onTabChange={onTabChange}
      readOnly={readOnly}
      viewMode={viewMode}
      tabs={PROGRAMME_TABS}
    />
  )
}

function HierarchyTemplateEditor({
  kind,
  value,
  onChange,
  activeTab,
  onTabChange,
  readOnly,
  viewMode,
  tabs,
}) {
  const { showError } = useToast()
  const plan = value || {}
  const tab = activeTab || 'overview'
  const storageKey = `${kind}.${tab}`
  const [viewByTab, setViewByTab] = useState(() => ({ [tab]: loadView(storageKey) }))
  const [selectedIndex, setSelectedIndex] = useState(null)

  const view = viewByTab[tab] || loadView(storageKey)
  const setTabView = (v) => {
    setViewByTab((prev) => ({ ...prev, [tab]: v }))
    saveView(storageKey, v)
  }

  const notifyReadOnly = () => {
    showError(
      viewMode
        ? 'You are in view mode. Switch to Edit to change this template.'
        : 'This template is locked until the pending change is approved or rejected.',
    )
  }

  const patch = (partial) => onChange({ ...plan, ...partial })

  const updateListItem = (listKey, index, field, fieldValue) => {
    if (readOnly) { notifyReadOnly(); return }
    const list = [...(plan[listKey] || [])]
    list[index] = { ...list[index], [field]: fieldValue }
    patch({ [listKey]: list })
  }

  const addListItem = (listKey, factory) => {
    if (readOnly) { notifyReadOnly(); return }
    const list = [...(plan[listKey] || [])]
    list.push(factory(list.length + 1))
    patch({ [listKey]: list })
  }

  const removeListItem = (listKey, index) => {
    if (readOnly) { notifyReadOnly(); return }
    patch({ [listKey]: (plan[listKey] || []).filter((_, i) => i !== index) })
    setSelectedIndex(null)
  }

  const replaceListItem = (listKey, index, row) => {
    if (readOnly) return
    const list = [...(plan[listKey] || [])]
    list[index] = row
    patch({ [listKey]: list })
  }

  const reorder = (listKey, from, to) => {
    if (readOnly) return
    patch({ [listKey]: reorderListItems(plan[listKey] || [], from, to) })
  }

  const overviewFields = useMemo(() => {
    if (kind === 'portfolio') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Template code" required>
            <input className={inputClass} value={plan.template_code || ''} disabled={readOnly}
              onChange={(e) => patch({ template_code: e.target.value })} placeholder="PT-TECH-01" />
          </AdminField>
          <AdminField label="Portfolio type">
            <select className={inputClass} value={plan.portfolio_type || 'strategic'} disabled={readOnly}
              onChange={(e) => patch({ portfolio_type: e.target.value })}>
              {PORTFOLIO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </AdminField>
          <AdminField label="Governance model">
            <select className={inputClass} value={plan.governance_model || ''} disabled={readOnly}
              onChange={(e) => patch({ governance_model: e.target.value })}>
              {GOVERNANCE_MODELS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </AdminField>
          <AdminField label="Review frequency">
            <select className={inputClass} value={plan.review_frequency || ''} disabled={readOnly}
              onChange={(e) => patch({ review_frequency: e.target.value })}>
              {REVIEW_FREQUENCIES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </AdminField>
          <div className="sm:col-span-2">
            <AdminField label="Description">
              <textarea rows={3} className={inputClass} value={plan.description || ''} disabled={readOnly}
                onChange={(e) => patch({ description: e.target.value })} />
            </AdminField>
          </div>
        </div>
      )
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Template code" required>
          <input className={inputClass} value={plan.template_code || ''} disabled={readOnly}
            onChange={(e) => patch({ template_code: e.target.value })} placeholder="PG-REG-01" />
        </AdminField>
        <AdminField label="Programme type">
          <select className={inputClass} value={plan.programme_type || 'transformation'} disabled={readOnly}
            onChange={(e) => patch({ programme_type: e.target.value })}>
            {PROGRAMME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </AdminField>
        <AdminField label="Governance model">
          <select className={inputClass} value={plan.governance_model || ''} disabled={readOnly}
            onChange={(e) => patch({ governance_model: e.target.value })}>
            {GOVERNANCE_MODELS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </AdminField>
        <AdminField label="Review frequency">
          <select className={inputClass} value={plan.review_frequency || ''} disabled={readOnly}
            onChange={(e) => patch({ review_frequency: e.target.value })}>
            {REVIEW_FREQUENCIES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </AdminField>
        <div className="sm:col-span-2">
          <AdminField label="Description">
            <textarea rows={3} className={inputClass} value={plan.description || ''} disabled={readOnly}
              onChange={(e) => patch({ description: e.target.value })} />
          </AdminField>
        </div>
      </div>
    )
  }, [kind, plan, readOnly])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { onTabChange?.(t.id); setSelectedIndex(null) }}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'bg-blue-700 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0 disabled:opacity-95">
          {overviewFields}
        </fieldset>
      )}

      {kind === 'portfolio' && tab === 'objectives' && (
        <ToggleListSection
          title="Objectives"
          listKey="objectives"
          rows={plan.objectives || []}
          view={view}
          onViewChange={setTabView}
          onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('objectives', emptyPortfolioObjectiveRow)}
          addLabel="Add objective"
          readOnly={readOnly}
          emptyText="No objectives yet."
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onReorder={(from, to) => reorder('objectives', from, to)}
          onRemove={(index) => removeListItem('objectives', index)}
          replaceListItem={replaceListItem}
          renderDetail={(row, index) => (
            <ObjectiveDetail
              row={row}
              index={index}
              updateListItem={updateListItem}
              removeListItem={removeListItem}
              readOnly={readOnly}
            />
          )}
        />
      )}

      {kind === 'portfolio' && tab === 'governance' && (
        <ToggleListSection
          title="Governance"
          listKey="governance"
          rows={plan.governance || []}
          view={view}
          onViewChange={setTabView}
          onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('governance', emptyPortfolioGovernanceRow)}
          addLabel="Add governance row"
          readOnly={readOnly}
          emptyText="No governance rows yet."
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onReorder={(from, to) => reorder('governance', from, to)}
          onRemove={(index) => removeListItem('governance', index)}
          replaceListItem={replaceListItem}
          renderDetail={(row, index) => (
            <PortfolioGovernanceDetail
              row={row}
              index={index}
              updateListItem={updateListItem}
              removeListItem={removeListItem}
              readOnly={readOnly}
            />
          )}
        />
      )}

      {kind === 'programme' && tab === 'governance' && (
        <ToggleListSection
          title="Governance"
          listKey="governance"
          columnKey="programme_governance"
          rows={plan.governance || []}
          view={view}
          onViewChange={setTabView}
          onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('governance', emptyProgrammeGovernanceRow)}
          addLabel="Add governance row"
          readOnly={readOnly}
          emptyText="No governance rows yet."
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onReorder={(from, to) => reorder('governance', from, to)}
          onRemove={(index) => removeListItem('governance', index)}
          replaceListItem={replaceListItem}
          renderDetail={(row, index) => (
            <ProgrammeGovernanceDetail
              row={row}
              index={index}
              updateListItem={updateListItem}
              removeListItem={removeListItem}
              readOnly={readOnly}
            />
          )}
        />
      )}

      {kind === 'portfolio' && tab === 'benefit_categories' && (
        <ToggleListSection
          title="Benefit categories"
          listKey="benefit_categories"
          rows={plan.benefit_categories || []}
          view={view}
          onViewChange={setTabView}
          onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('benefit_categories', emptyBenefitCategoryRow)}
          addLabel="Add category"
          readOnly={readOnly}
          emptyText="No benefit categories yet."
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onReorder={(from, to) => reorder('benefit_categories', from, to)}
          onRemove={(index) => removeListItem('benefit_categories', index)}
          replaceListItem={replaceListItem}
          renderDetail={(row, index) => (
            <BenefitCategoryDetail
              row={row}
              index={index}
              updateListItem={updateListItem}
              removeListItem={removeListItem}
              readOnly={readOnly}
            />
          )}
        />
      )}

      {kind === 'portfolio' && tab === 'metrics' && (
        <ToggleListSection
          title="Metrics"
          listKey="metrics"
          rows={plan.metrics || []}
          view={view}
          onViewChange={setTabView}
          onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('metrics', emptyPortfolioMetricRow)}
          addLabel="Add metric"
          readOnly={readOnly}
          emptyText="No metrics yet."
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onReorder={(from, to) => reorder('metrics', from, to)}
          onRemove={(index) => removeListItem('metrics', index)}
          replaceListItem={replaceListItem}
          renderDetail={(row, index) => (
            <MetricDetail
              row={row}
              index={index}
              updateListItem={updateListItem}
              removeListItem={removeListItem}
              readOnly={readOnly}
            />
          )}
        />
      )}

      {kind === 'programme' && tab === 'dependencies' && (
        <ToggleListSection
          title="Dependencies"
          listKey="dependencies"
          rows={plan.dependencies || []}
          view={view}
          onViewChange={setTabView}
          onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('dependencies', emptyProgrammeDependencyRow)}
          addLabel="Add dependency"
          readOnly={readOnly}
          emptyText="No dependencies yet."
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onReorder={(from, to) => reorder('dependencies', from, to)}
          onRemove={(index) => removeListItem('dependencies', index)}
          replaceListItem={replaceListItem}
          renderDetail={(row, index) => (
            <DependencyDetail
              row={row}
              index={index}
              updateListItem={updateListItem}
              removeListItem={removeListItem}
              readOnly={readOnly}
            />
          )}
        />
      )}

      {kind === 'programme' && tab === 'benefits' && (
        <ToggleListSection
          title="Benefits"
          listKey="benefits"
          rows={plan.benefits || []}
          view={view}
          onViewChange={setTabView}
          onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('benefits', emptyProgrammeBenefitRow)}
          addLabel="Add benefit"
          readOnly={readOnly}
          emptyText="No benefits yet."
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onReorder={(from, to) => reorder('benefits', from, to)}
          onRemove={(index) => removeListItem('benefits', index)}
          replaceListItem={replaceListItem}
          renderDetail={(row, index) => (
            <ProgrammeBenefitDetail
              row={row}
              index={index}
              updateListItem={updateListItem}
              removeListItem={removeListItem}
              readOnly={readOnly}
            />
          )}
        />
      )}

      {tab === 'risks' && (
        <div className="space-y-3">
          <SectionToolbar
            title="Risks"
            count={(plan.risks || []).length}
            onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('risks', emptyIndustryRiskRow)}
            addLabel="Add risk"
            view={view}
            onViewChange={setTabView}
          />
          {view === 'grid' ? (
            <IndustryPlanFlatGrid
              readOnly={readOnly}
              listKey="risks"
              rows={plan.risks || []}
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
                  readOnly={readOnly}
                />
              )}
            />
          ) : (
            <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0">
              {(plan.risks || []).map((row, index) => (
                <div key={index} className="rounded border border-gray-200 p-3 dark:border-gray-700">
                  <RiskDetail row={row} index={index} updateListItem={updateListItem}
                    removeListItem={removeListItem} readOnly={readOnly} />
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
            count={(plan.roles || []).length}
            onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('roles', emptyIndustryRoleRow)}
            addLabel="Add role"
            view={view}
            onViewChange={setTabView}
          />
          {view === 'grid' ? (
            <IndustryPlanFlatGrid
              readOnly={readOnly}
              listKey="roles"
              rows={plan.roles || []}
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
                  readOnly={readOnly}
                />
              )}
            />
          ) : (
            <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0">
              {(plan.roles || []).map((row, index) => (
                <div key={index} className="rounded border border-gray-200 p-3 dark:border-gray-700">
                  <RoleDetail row={row} index={index} updateListItem={updateListItem}
                    removeListItem={removeListItem} readOnly={readOnly} />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}

      {kind === 'programme' && tab === 'milestones' && (
        <div className="space-y-3">
          <SectionToolbar
            title="Milestones"
            count={(plan.milestones || []).length}
            onAdd={readOnly ? () => notifyReadOnly() : () => addListItem('milestones', emptyIndustryMilestoneRow)}
            addLabel="Add milestone"
            view={view}
            onViewChange={setTabView}
          />
          {view === 'grid' ? (
            <IndustryPlanFlatGrid
              readOnly={readOnly}
              listKey="milestones"
              rows={plan.milestones || []}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onReorder={(from, to) => reorder('milestones', from, to)}
              onRemove={(index) => removeListItem('milestones', index)}
              replaceListItem={replaceListItem}
              renderDetail={(row, index) => (
                <MilestoneDetail
                  row={row}
                  index={index}
                  plan={{ phases: [] }}
                  updateListItem={updateListItem}
                  removeListItem={removeListItem}
                  readOnly={readOnly}
                />
              )}
            />
          ) : (
            <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0">
              {(plan.milestones || []).map((row, index) => (
                <div key={index} className="rounded border border-gray-200 p-3 dark:border-gray-700">
                  <MilestoneDetail row={row} index={index} plan={{ phases: [] }}
                    updateListItem={updateListItem} removeListItem={removeListItem} readOnly={readOnly} />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}
    </div>
  )
}

export default PortfolioTemplatePayloadEditor
