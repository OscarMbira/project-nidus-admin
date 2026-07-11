import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ADMIN_ROLES,
  PermissionGate,
  ROLE_LABELS,
  fetchAllNavNodesForManagement,
  notifyAdminNavChanged,
  renameNavNode,
  setNavNodeActive,
  setNavNodeRoles,
} from '@nidus-admin/shared'
import { EmptyState, LoadingState, SearchBar, useToast } from '@nidus-admin/ui'

const TABLE_ROLES = [...ADMIN_ROLES]

function rolesVisibleToAll(roles) {
  return !roles?.length
}

function roleIsChecked(roles, role) {
  return rolesVisibleToAll(roles) || roles.includes(role)
}

function normalizeRolesArray(roles) {
  if (!roles?.length) return []
  return [...roles].sort()
}

function rolesEqual(a, b) {
  const left = normalizeRolesArray(a)
  const right = normalizeRolesArray(b)
  if (left.length !== right.length) return false
  return left.every((role, index) => role === right[index])
}

function computeDepth(node, byKey, cache = new Map()) {
  if (cache.has(node.node_key)) return cache.get(node.node_key)
  if (!node.parent_key) {
    cache.set(node.node_key, 0)
    return 0
  }
  const parent = byKey.get(node.parent_key)
  const depth = parent ? 1 + computeDepth(parent, byKey, cache) : 0
  cache.set(node.node_key, depth)
  return depth
}

function nodeTypeLabel(nodeType) {
  switch (nodeType) {
    case 'standalone': return 'Standalone'
    case 'section': return 'Section'
    case 'group': return 'Group'
    case 'item': return 'Item'
    default: return nodeType
  }
}

function toggleRoleInMatrix(currentRoles, role, checked) {
  const allRoles = TABLE_ROLES
  const visibleToAll = rolesVisibleToAll(currentRoles)

  if (checked) {
    if (visibleToAll) return []
    if (currentRoles.includes(role)) return currentRoles
    const next = [...currentRoles, role]
    return next.length === allRoles.length ? [] : next.sort()
  }

  if (visibleToAll) {
    return allRoles.filter((r) => r !== role)
  }

  const next = currentRoles.filter((r) => r !== role)
  return next
}

function buildPendingMaps(nodes) {
  const rolesMap = new Map()
  const activeMap = new Map()
  for (const node of nodes) {
    rolesMap.set(node.node_key, normalizeRolesArray(node.roles))
    activeMap.set(node.node_key, !!node.is_active)
  }
  return { rolesMap, activeMap }
}

function nodeSearchText(node, labelDrafts) {
  return [
    labelDrafts.get(node.node_key) ?? node.label,
    node.path,
    node.node_key,
    nodeTypeLabel(node.node_type),
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')
}

function getAncestorKeys(nodeKey, byKey) {
  const keys = []
  let parentKey = byKey.get(nodeKey)?.parent_key
  while (parentKey) {
    keys.push(parentKey)
    parentKey = byKey.get(parentKey)?.parent_key
  }
  return keys
}

function getDescendantKeys(nodeKey, nodes) {
  const keys = []
  for (const node of nodes) {
    if (node.parent_key === nodeKey) {
      keys.push(node.node_key)
      keys.push(...getDescendantKeys(node.node_key, nodes))
    }
  }
  return keys
}

function filterNavNodes(nodes, query, byKey, labelDrafts) {
  const q = query.trim().toLowerCase()
  if (!q) return nodes

  const visibleKeys = new Set()
  for (const node of nodes) {
    if (!nodeSearchText(node, labelDrafts).includes(q)) continue
    visibleKeys.add(node.node_key)
    getAncestorKeys(node.node_key, byKey).forEach((key) => visibleKeys.add(key))
    getDescendantKeys(node.node_key, nodes).forEach((key) => visibleKeys.add(key))
  }

  return nodes.filter((node) => visibleKeys.has(node.node_key))
}

export default function NavigationManagementPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [nodes, setNodes] = useState([])
  const [baselineRoles, setBaselineRoles] = useState(new Map())
  const [baselineActive, setBaselineActive] = useState(new Map())
  const [pendingRoles, setPendingRoles] = useState(new Map())
  const [pendingActive, setPendingActive] = useState(new Map())
  const [labelDrafts, setLabelDrafts] = useState(new Map())
  const [renamingKey, setRenamingKey] = useState(null)
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await fetchAllNavNodesForManagement()
    if (loadError) {
      setError(typeof loadError === 'string' ? loadError : loadError.message || String(loadError))
      setLoading(false)
      return
    }
    const rows = Array.isArray(data) ? data : []
    const { rolesMap, activeMap } = buildPendingMaps(rows)
    setNodes(rows)
    setBaselineRoles(new Map(rolesMap))
    setBaselineActive(new Map(activeMap))
    setPendingRoles(new Map(rolesMap))
    setPendingActive(new Map(activeMap))
    setLabelDrafts(new Map(rows.map((n) => [n.node_key, n.label])))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const byKey = useMemo(() => new Map(nodes.map((n) => [n.node_key, n])), [nodes])

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return (a.label || '').localeCompare(b.label || '')
    })
  }, [nodes])

  const visibleNodes = useMemo(
    () => filterNavNodes(sortedNodes, search, byKey, labelDrafts),
    [sortedNodes, search, byKey, labelDrafts],
  )

  const dirtyKeys = useMemo(() => {
    const keys = new Set()
    for (const node of nodes) {
      const key = node.node_key
      const rolesDirty = !rolesEqual(pendingRoles.get(key), baselineRoles.get(key))
      const activeDirty = pendingActive.get(key) !== baselineActive.get(key)
      if (rolesDirty || activeDirty) keys.add(key)
    }
    return keys
  }, [nodes, pendingRoles, baselineRoles, pendingActive, baselineActive])

  const hasChanges = dirtyKeys.size > 0

  const toggleRole = (nodeKey, role, checked) => {
    setPendingRoles((prev) => {
      const next = new Map(prev)
      const current = next.get(nodeKey) ?? []
      next.set(nodeKey, toggleRoleInMatrix(current, role, checked))
      return next
    })
  }

  const toggleActive = (nodeKey, checked) => {
    setPendingActive((prev) => {
      const next = new Map(prev)
      next.set(nodeKey, checked)
      return next
    })
  }

  const saveLabel = async (nodeKey) => {
    const node = byKey.get(nodeKey)
    const draft = (labelDrafts.get(nodeKey) ?? '').trim()
    if (!node || !draft) {
      showError('Label is required')
      return
    }
    if (draft === node.label) return

    setRenamingKey(nodeKey)
    const { error: renameError } = await renameNavNode(nodeKey, draft)
    setRenamingKey(null)

    if (renameError) {
      showError(typeof renameError === 'string' ? renameError : renameError.message || String(renameError))
      setLabelDrafts((prev) => new Map(prev).set(nodeKey, node.label))
      return
    }

    showSuccess('Navigation label updated')
    notifyAdminNavChanged()
    await loadData()
  }

  const handleDiscard = () => {
    setPendingRoles(new Map(baselineRoles))
    setPendingActive(new Map(baselineActive))
    setLabelDrafts(new Map(nodes.map((n) => [n.node_key, n.label])))
  }

  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)

    for (const nodeKey of dirtyKeys) {
      const rolesDirty = !rolesEqual(pendingRoles.get(nodeKey), baselineRoles.get(nodeKey))
      const activeDirty = pendingActive.get(nodeKey) !== baselineActive.get(nodeKey)

      if (rolesDirty) {
        const { error: rolesError } = await setNavNodeRoles(nodeKey, pendingRoles.get(nodeKey) ?? [])
        if (rolesError) {
          setSaving(false)
          showError(typeof rolesError === 'string' ? rolesError : rolesError.message || String(rolesError))
          return
        }
      }

      if (activeDirty) {
        const { error: activeError } = await setNavNodeActive(nodeKey, pendingActive.get(nodeKey))
        if (activeError) {
          setSaving(false)
          showError(typeof activeError === 'string' ? activeError : activeError.message || String(activeError))
          return
        }
      }
    }

    showSuccess('Navigation visibility updated')
    notifyAdminNavChanged()
    await loadData()
    setSaving(false)
  }

  if (loading) return <LoadingState message="Loading navigation nodes..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!nodes.length) {
    return <EmptyState title="No navigation nodes" description="No nav_nodes rows were returned from the database." />
  }

  return (
    <div className="space-y-6 p-4 md:p-6" data-testid="navigation-management-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Navigation Management</h1>
          <p className="text-sm text-gray-500">
            Rename sidebar labels and control which admin roles see each node. Empty role selection means all roles.
            Adding or removing nodes still requires SQL.
          </p>
        </div>
        <PermissionGate permission="nav.configure">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saving || (!hasChanges && !renamingKey)}
              className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="rounded border border-blue-700 bg-blue-900/40 px-4 py-2 text-sm text-blue-200 hover:bg-blue-900/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </PermissionGate>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search labels, paths, or node keys..."
        />
        {search.trim() ? (
          <p className="text-xs text-gray-500">
            Showing {visibleNodes.length} of {sortedNodes.length} nodes
          </p>
        ) : null}
      </div>

      {visibleNodes.length === 0 ? (
        <EmptyState
          title="No matching nodes"
          description={`Nothing matches "${search.trim()}". Try a label, path, or node key.`}
        />
      ) : (
      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
        <table className="min-w-full text-sm text-gray-200">
          <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-center">Active</th>
              {TABLE_ROLES.map((role) => (
                <th key={role} className="px-4 py-3 text-center">{ROLE_LABELS[role] || role}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleNodes.map((node) => {
              const depth = computeDepth(node, byKey)
              const pendingNodeRoles = pendingRoles.get(node.node_key) ?? []
              const isDirty = dirtyKeys.has(node.node_key)
              const draftLabel = labelDrafts.get(node.node_key) ?? node.label

              return (
                <tr
                  key={node.node_key}
                  data-testid={`nav-row-${node.node_key}`}
                  className={`border-t border-gray-800 hover:bg-gray-800/40 ${isDirty ? 'bg-amber-900/20' : ''} ${!pendingActive.get(node.node_key) ? 'opacity-60' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div style={{ paddingLeft: depth * 16 }}>
                      <PermissionGate
                        permission="nav.configure"
                        fallback={<span className="font-medium text-gray-100">{node.label}</span>}
                      >
                        <input
                          type="text"
                          value={draftLabel}
                          disabled={renamingKey === node.node_key}
                          onChange={(e) => {
                            setLabelDrafts((prev) => new Map(prev).set(node.node_key, e.target.value))
                          }}
                          onBlur={() => saveLabel(node.node_key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              e.currentTarget.blur()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              setLabelDrafts((prev) => new Map(prev).set(node.node_key, node.label))
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-full min-w-[12rem] rounded border border-gray-600 bg-gray-950 px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                          aria-label={`Label for ${node.node_key}`}
                        />
                      </PermissionGate>
                      {node.path ? (
                        <p className="mt-1 truncate text-xs text-gray-500">{node.path}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-gray-600">{node.node_key}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{nodeTypeLabel(node.node_type)}</td>
                  <td className="px-4 py-3 text-center">
                    <PermissionGate permission="nav.configure" fallback={
                      <span>{pendingActive.get(node.node_key) ? 'Yes' : 'No'}</span>
                    }>
                      <input
                        type="checkbox"
                        checked={!!pendingActive.get(node.node_key)}
                        onChange={(e) => toggleActive(node.node_key, e.target.checked)}
                        className="h-4 w-4 accent-blue-500"
                        aria-label={`Active ${node.label}`}
                      />
                    </PermissionGate>
                  </td>
                  {TABLE_ROLES.map((role) => {
                    const checked = roleIsChecked(pendingNodeRoles, role)
                    return (
                      <td key={`${node.node_key}-${role}`} className="px-4 py-3 text-center">
                        <PermissionGate permission="nav.configure" fallback={
                          <span>{checked ? '✓' : '—'}</span>
                        }>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleRole(node.node_key, role, e.target.checked)}
                            className="h-4 w-4 accent-blue-500"
                            aria-label={`${ROLE_LABELS[role]} visibility for ${node.label}`}
                          />
                        </PermissionGate>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
