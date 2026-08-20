/**
 * Industry plan template grid / WBS helpers (Admin content module).
 * Presentation-only — does not change array schema.
 */

function phaseKey(row) {
  const raw = row?.phase_number
  if (raw == null || String(raw).trim() === '') return ''
  const n = Number(raw)
  if (Number.isFinite(n)) return String(n)
  return String(raw).trim()
}

/**
 * Stable phase key for grouping / seeding children.
 * Falls back to 1-based index when a phase row has no phase_number.
 */
export function resolvePhaseKey(row, fallbackIndex = null) {
  const key = phaseKey(row)
  if (key) return key
  if (fallbackIndex != null && Number.isFinite(Number(fallbackIndex))) {
    return String(Number(fallbackIndex) + 1)
  }
  return ''
}

const KIND_LABEL = {
  activities: 'Activity',
  deliverables: 'Deliverable',
  milestones: 'Milestone',
}

/**
 * Build a nested WBS forest under each phase using row_id / parent_id.
 * Rows with empty parent_id (or parent_id = phase.row_id) are direct children of the phase.
 * Rows whose parent_id matches another activity/deliverable/milestone nest under that parent.
 * WBS numbers are display-only (e.g. 1.2.1).
 */
export function groupByPhase(phases = [], children = {}) {
  const activities = Array.isArray(children.activities) ? children.activities : []
  const deliverables = Array.isArray(children.deliverables) ? children.deliverables : []
  const milestones = Array.isArray(children.milestones) ? children.milestones : []

  const allItems = []
  activities.forEach((row, index) => allItems.push({ kind: 'activities', row, index }))
  deliverables.forEach((row, index) => allItems.push({ kind: 'deliverables', row, index }))
  milestones.forEach((row, index) => allItems.push({ kind: 'milestones', row, index }))

  const byRowId = new Map()
  for (const item of allItems) {
    const id = String(item.row?.row_id || '').trim()
    if (id) byRowId.set(id, item)
  }

  const phaseKeys = new Set()
  const groups = (phases || []).map((phase, phaseIndex) => {
    const key = resolvePhaseKey(phase, phaseIndex)
    phaseKeys.add(key)
    return {
      phase,
      phaseIndex,
      phaseNumber: key,
      phaseRowId: String(phase?.row_id || '').trim(),
      wbs: String(phaseIndex + 1),
      // Flat buckets kept for backward-compat callers / tests
      activities: [],
      deliverables: [],
      milestones: [],
      // Nested tree (depth-first flatten for the WBS UI)
      tree: [],
    }
  })

  const byKey = new Map(groups.map((g) => [g.phaseNumber, g]))
  const unassigned = { activities: [], deliverables: [], milestones: [], tree: [] }

  const belongsToPhase = (item, group) => {
    const key = phaseKey(item.row)
    return key && key === group.phaseNumber
  }

  const isRootUnderPhase = (item, group) => {
    const parentId = String(item.row?.parent_id || '').trim()
    if (!parentId) return true
    if (group.phaseRowId && parentId === group.phaseRowId) return true
    const parent = byRowId.get(parentId)
    if (!parent) return true
    // Parent in another phase → treat as root here if phase matches
    if (!belongsToPhase(parent, group)) return true
    return false
  }

  for (const group of groups) {
    const phaseItems = allItems.filter((item) => belongsToPhase(item, group))
    const childrenByParent = new Map()

    for (const item of phaseItems) {
      const parentId = String(item.row?.parent_id || '').trim()
      if (parentId && byRowId.has(parentId) && !isRootUnderPhase(item, group)) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
        childrenByParent.get(parentId).push(item)
      }
    }

    const sortSiblings = (list) => {
      const kindOrder = { activities: 0, deliverables: 1, milestones: 2 }
      return [...list].sort((a, b) => {
        const so = (Number(a.row?.sort_order) || 0) - (Number(b.row?.sort_order) || 0)
        if (so !== 0) return so
        return (kindOrder[a.kind] || 0) - (kindOrder[b.kind] || 0)
      })
    }

    const walk = (item, parentWbs, siblingIndex, depth) => {
      const wbs = `${parentWbs}.${siblingIndex}`
      const node = {
        kind: item.kind,
        label: KIND_LABEL[item.kind] || item.kind,
        row: item.row,
        index: item.index,
        wbs,
        depth,
        children: [],
      }
      // Compat flat lists: only depth-1 under phase go into kind buckets with that wbs
      if (depth === 1) {
        group[item.kind].push({ row: item.row, index: item.index, wbs, kind: item.kind, depth })
      }
      const kids = sortSiblings(childrenByParent.get(String(item.row?.row_id || '').trim()) || [])
      kids.forEach((child, i) => {
        node.children.push(walk(child, wbs, i + 1, depth + 1))
      })
      return node
    }

    const roots = sortSiblings(phaseItems.filter((item) => isRootUnderPhase(item, group)))
    // Number roots sequentially across kinds (true WBS), not per-kind restart
    roots.forEach((item, i) => {
      group.tree.push(walk(item, group.wbs, i + 1, 1))
    })
  }

  // Unassigned: no matching phase
  const unassignedItems = allItems.filter((item) => {
    const key = phaseKey(item.row)
    return !key || !byKey.has(key)
  })
  unassignedItems.forEach((item, i) => {
    const wbs = `?.${i + 1}`
    const node = {
      kind: item.kind,
      label: KIND_LABEL[item.kind] || item.kind,
      row: item.row,
      index: item.index,
      wbs,
      depth: 1,
      children: [],
    }
    unassigned[item.kind].push({ row: item.row, index: item.index, wbs, kind: item.kind, depth: 1 })
    unassigned.tree.push(node)
  })

  return { groups, unassigned, phaseKeys: [...phaseKeys] }
}

/** Flatten a WBS tree node list depth-first for table rendering. */
export function flattenWbsTree(nodes = []) {
  const out = []
  const visit = (node) => {
    out.push(node)
    for (const child of node.children || []) visit(child)
  }
  for (const node of nodes) visit(node)
  return out
}

/** Max nesting depth among tree nodes (root children = 1). */
export function maxWbsTreeDepth(nodes = []) {
  let max = 0
  const walk = (list, depth) => {
    for (const node of list || []) {
      max = Math.max(max, depth)
      walk(node.children, depth + 1)
    }
  }
  walk(nodes, 1)
  return max
}

/**
 * MS Project–style outline levels: phase rows are level 1; direct children are level 2, etc.
 * @returns {number} at least 1
 */
export function computeMaxOutlineLevel(groups = [], unassigned = null) {
  let maxChild = 0
  for (const g of groups || []) {
    maxChild = Math.max(maxChild, maxWbsTreeDepth(g.tree))
  }
  if (unassigned?.tree) {
    maxChild = Math.max(maxChild, maxWbsTreeDepth(unassigned.tree))
  }
  return Math.max(1, 1 + maxChild)
}

/**
 * Build expanded-map for phase rows from an outline level (1 = all collapsed).
 */
export function expandedMapForOutlineLevel(groups = [], outlineLevel = 1, { includeUnassigned = true } = {}) {
  const open = Number(outlineLevel) > 1
  const next = {}
  for (const g of groups || []) {
    next[g.wbs] = open
  }
  if (includeUnassigned) next.__unassigned = open
  return next
}

/**
 * Keep flattened WBS rows visible for the chosen outline level.
 * Level 1 → no children; level 2 → depth ≤ 1; level N → depth ≤ N − 1.
 */
export function filterFlatByOutlineLevel(flatRows = [], outlineLevel = 1) {
  const level = Math.max(1, Number(outlineLevel) || 1)
  if (level <= 1) return []
  const maxDepth = level - 1
  return (flatRows || []).filter((row) => (row.depth || 1) <= maxDepth)
}

/**
 * Move one item in an array from fromIndex to toIndex (no extra fields rewritten).
 */
export function reorderArray(list = [], fromIndex, toIndex) {
  if (fromIndex === toIndex) return [...list]
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
    return [...list]
  }
  const next = [...list]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * Reorder a list and rewrite sort_order to 1..n.
 */
export function reorderListItems(list = [], fromIndex, toIndex) {
  return reorderArray(list, fromIndex, toIndex).map((row, i) => ({ ...row, sort_order: i + 1 }))
}

/**
 * Distinct non-empty string values from a list of rows for a given key
 * (or nested array key like required_skills).
 */
export function distinctFieldValues(rows = [], fieldKey, { arrayField = false } = {}) {
  const seen = new Set()
  const out = []
  for (const row of rows || []) {
    if (arrayField) {
      for (const item of row?.[fieldKey] || []) {
        const v = String(item || '').trim()
        if (!v || seen.has(v)) continue
        seen.add(v)
        out.push(v)
      }
    } else {
      const v = String(row?.[fieldKey] || '').trim()
      if (!v || seen.has(v)) continue
      seen.add(v)
      out.push(v)
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

export function toSelectOptions(values = []) {
  return values.map((v) => ({ value: String(v), label: String(v) }))
}

export function phaseSelectOptions(phases = []) {
  return (phases || []).map((phase, index) => {
    const num = phase?.phase_number != null && String(phase.phase_number).trim() !== ''
      ? String(phase.phase_number)
      : String(index + 1)
    const name = String(phase?.phase_name || '').trim()
    return {
      value: num,
      label: name ? `${num} · ${name}` : num,
    }
  })
}
