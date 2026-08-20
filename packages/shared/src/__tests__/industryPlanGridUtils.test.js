import { describe, it, expect } from 'vitest'
import {
  groupByPhase,
  flattenWbsTree,
  reorderArray,
  reorderListItems,
  distinctFieldValues,
  phaseSelectOptions,
  resolvePhaseKey,
  computeMaxOutlineLevel,
  filterFlatByOutlineLevel,
  expandedMapForOutlineLevel,
} from '../industryPlanGridUtils.js'

describe('industryPlanGridUtils', () => {
  it('groupByPhase nests children under matching phase_number with display WBS', () => {
    const phases = [
      { phase_number: 1, phase_name: 'Initiation', row_id: 'p1' },
      { phase_number: 2, phase_name: 'Design', row_id: 'p2' },
    ]
    const { groups, unassigned } = groupByPhase(phases, {
      activities: [
        { activity_name: 'A1', phase_number: 1, row_id: 'a1' },
        { activity_name: 'A2', phase_number: 1, row_id: 'a2' },
        { activity_name: 'Orphan', phase_number: 99, row_id: 'a3' },
        { activity_name: 'None', phase_number: '', row_id: 'a4' },
      ],
      deliverables: [{ deliverable_name: 'D1', phase_number: 2, row_id: 'd1' }],
      milestones: [{ milestone_name: 'M1', phase_number: 2, row_id: 'm1' }],
    })

    expect(groups).toHaveLength(2)
    expect(groups[0].wbs).toBe('1')
    expect(groups[0].tree.map((n) => n.wbs)).toEqual(['1.1', '1.2'])
    expect(groups[0].tree.map((n) => n.row.activity_name)).toEqual(['A1', 'A2'])
    // Unified sibling numbering across kinds under the phase
    expect(groups[1].tree.map((n) => n.wbs)).toEqual(['2.1', '2.2'])
    expect(unassigned.activities).toHaveLength(2)
  })

  it('nests rows under parent_id with deeper WBS (1.2.1)', () => {
    const phases = [{ phase_number: 1, phase_name: 'Pre-Construction', row_id: 'p1' }]
    const { groups } = groupByPhase(phases, {
      activities: [],
      deliverables: [
        { deliverable_name: 'Site Survey Report', phase_number: 1, row_id: 'd1', parent_id: '' },
        { deliverable_name: 'My Test Documents', phase_number: 1, row_id: 'd2', parent_id: '' },
        { deliverable_name: 'Nested child', phase_number: 1, row_id: 'd3', parent_id: 'd2' },
      ],
      milestones: [],
    })
    const flat = flattenWbsTree(groups[0].tree)
    expect(flat.map((n) => ({ wbs: n.wbs, name: n.row.deliverable_name, depth: n.depth }))).toEqual([
      { wbs: '1.1', name: 'Site Survey Report', depth: 1 },
      { wbs: '1.2', name: 'My Test Documents', depth: 1 },
      { wbs: '1.2.1', name: 'Nested child', depth: 2 },
    ])
    expect(computeMaxOutlineLevel(groups)).toBe(3)
    expect(filterFlatByOutlineLevel(flat, 1)).toEqual([])
    expect(filterFlatByOutlineLevel(flat, 2).map((n) => n.wbs)).toEqual(['1.1', '1.2'])
    expect(filterFlatByOutlineLevel(flat, 3).map((n) => n.wbs)).toEqual(['1.1', '1.2', '1.2.1'])
    expect(expandedMapForOutlineLevel(groups, 1)).toEqual({ '1': false, __unassigned: false })
    expect(expandedMapForOutlineLevel(groups, 2)['1']).toBe(true)
  })

  it('groupByPhase handles empty children and non-numeric phase keys', () => {
    const { groups, unassigned } = groupByPhase(
      [{ phase_number: 'A', phase_name: 'Alpha', row_id: 'pA' }],
      { activities: [{ activity_name: 'X', phase_number: 'A', row_id: 'a1' }], deliverables: [], milestones: [] },
    )
    expect(groups[0].tree).toHaveLength(1)
    expect(groups[0].tree[0].wbs).toBe('1.1')
    expect(unassigned.activities).toHaveLength(0)
  })

  it('reorderListItems rewrites sort_order', () => {
    const list = [
      { name: 'a', sort_order: 1 },
      { name: 'b', sort_order: 2 },
      { name: 'c', sort_order: 3 },
    ]
    const next = reorderListItems(list, 0, 2)
    expect(next.map((r) => r.name)).toEqual(['b', 'c', 'a'])
    expect(next.map((r) => r.sort_order)).toEqual([1, 2, 3])
  })

  it('reorderArray moves items without rewriting fields', () => {
    const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
    expect(reorderArray(list, 2, 0).map((r) => r.key)).toEqual(['c', 'a', 'b'])
    expect(reorderArray(list, 1, 1)).toEqual(list)
    expect(reorderArray(list, -1, 0)).toEqual(list)
  })

  it('distinctFieldValues and phaseSelectOptions', () => {
    expect(distinctFieldValues(
      [{ resource_type: 'Surveyor' }, { resource_type: 'Surveyor' }, { resource_type: 'PM' }],
      'resource_type',
    )).toEqual(['PM', 'Surveyor'])
    expect(distinctFieldValues(
      [{ required_skills: ['Steel', 'Concrete'] }, { required_skills: ['Steel'] }],
      'required_skills',
      { arrayField: true },
    )).toEqual(['Concrete', 'Steel'])
    expect(phaseSelectOptions([{ phase_number: 1, phase_name: 'Start' }])[0].label).toBe('1 · Start')
  })

  it('phaseSelectOptions labels update when phase is renamed and only lists live phases', () => {
    const phases = [
      { phase_number: 1, phase_name: 'Initiation' },
      { phase_number: 2, phase_name: 'Design' },
    ]
    expect(phaseSelectOptions(phases).map((o) => o.label)).toEqual([
      '1 · Initiation',
      '2 · Design',
    ])
    phases[0].phase_name = 'Kick-off'
    expect(phaseSelectOptions(phases)[0].label).toBe('1 · Kick-off')
    expect(phaseSelectOptions(phases).map((o) => o.value)).not.toContain('99')
  })

  it('resolvePhaseKey normalises and falls back to index; new children nest under that key', () => {
    expect(resolvePhaseKey({ phase_number: '02' })).toBe('2')
    expect(resolvePhaseKey({}, 0)).toBe('1')
    const phases = [{ phase_name: 'Pre-Construction', row_id: 'p1' }]
    const { groups, unassigned } = groupByPhase(phases, {
      activities: [
        { activity_name: 'Existing', phase_number: '1', row_id: 'a1' },
        { activity_name: 'New child', phase_number: resolvePhaseKey(phases[0], 0), row_id: 'a2' },
      ],
      deliverables: [],
      milestones: [],
    })
    expect(groups[0].phaseNumber).toBe('1')
    expect(groups[0].tree).toHaveLength(2)
    expect(unassigned.activities).toHaveLength(0)
  })
})
