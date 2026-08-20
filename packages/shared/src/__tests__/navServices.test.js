import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabase.js', () => ({
  getAdminDb: () => null,
}))
vi.mock('../adminContext.jsx', () => ({
  getCurrentAdminUserId: async () => '11111111-1111-1111-1111-111111111111',
}))

const { buildAdminNavTree } = await import('../navServices.js')

const baseRoles = ['super_admin']

function row(overrides) {
  return {
    node_key: null,
    parent_key: null,
    node_type: 'item',
    label: 'Label',
    path: null,
    active_paths: [],
    roles: baseRoles,
    sort_order: 0,
    badge: null,
    ...overrides,
  }
}

describe('buildAdminNavTree — subsection assembly', () => {
  it('nests groups under a subsection when the group parent_key points at a subsection node', () => {
    const nodes = [
      row({ node_key: 'sec', node_type: 'section', label: 'Global Templates', sort_order: 1 }),
      row({ node_key: 'sec:sub', parent_key: 'sec', node_type: 'subsection', label: 'Templates', sort_order: 2 }),
      row({ node_key: 'sec:sub:grp', parent_key: 'sec:sub', node_type: 'group', label: 'Portfolio', sort_order: 3 }),
      row({
        node_key: 'sec:sub:grp:item', parent_key: 'sec:sub:grp', node_type: 'item',
        label: 'Standards-Based', path: '/x?methodology=standards_based', sort_order: 4,
      }),
    ]

    const { sections } = buildAdminNavTree(nodes)
    const section = sections.find((s) => s.id === 'sec')
    expect(section).toBeTruthy()
    expect(section.groups).toEqual([])
    expect(section.subsections).toHaveLength(1)
    expect(section.subsections[0].label).toBe('Templates')
    expect(section.subsections[0].groups).toHaveLength(1)
    expect(section.subsections[0].groups[0].label).toBe('Portfolio')
    expect(section.subsections[0].groups[0].items[0].path).toBe('/x?methodology=standards_based')
  })

  it('keeps flat groups (parent_key = section) working unchanged for sections with no subsections', () => {
    const nodes = [
      row({ node_key: 'sec2', node_type: 'section', label: 'Other Section', sort_order: 1 }),
      row({ node_key: 'sec2:grp', parent_key: 'sec2', node_type: 'group', label: 'Group A', sort_order: 2 }),
      row({
        node_key: 'sec2:grp:item', parent_key: 'sec2:grp', node_type: 'item',
        label: 'Leaf', path: '/y', sort_order: 3,
      }),
    ]

    const { sections } = buildAdminNavTree(nodes)
    const section = sections.find((s) => s.id === 'sec2')
    expect(section.groups).toHaveLength(1)
    expect(section.groups[0].label).toBe('Group A')
    expect(section.subsections).toEqual([])
  })

  it('drops empty subsections (no groups with items) from the built tree', () => {
    const nodes = [
      row({ node_key: 'sec3', node_type: 'section', label: 'Sec3', sort_order: 1 }),
      row({ node_key: 'sec3:sub-empty', parent_key: 'sec3', node_type: 'subsection', label: 'Empty', sort_order: 2 }),
      row({ node_key: 'sec3:sub-full', parent_key: 'sec3', node_type: 'subsection', label: 'Full', sort_order: 3 }),
      row({ node_key: 'sec3:sub-full:grp', parent_key: 'sec3:sub-full', node_type: 'group', label: 'G', sort_order: 4 }),
      row({
        node_key: 'sec3:sub-full:grp:item', parent_key: 'sec3:sub-full:grp', node_type: 'item',
        label: 'Leaf', path: '/z', sort_order: 5,
      }),
    ]

    const { sections } = buildAdminNavTree(nodes)
    const section = sections.find((s) => s.id === 'sec3')
    expect(section.subsections).toHaveLength(1)
    expect(section.subsections[0].label).toBe('Full')
  })
})
