import { describe, it, expect } from 'vitest'

/**
 * Mirrors filter constants in GlobalTemplateLibraryList / DefaultContentLibraryPage (v188).
 * Kept in the test so list chip sets stay documented without a shared package export yet.
 */
const CATEGORIES_BY_METHODOLOGY = {
  standards_based: ['Initiating', 'Planning', 'Executing', 'Monitoring & Controlling', 'Closing'],
  structured: [
    'Starting Up',
    'Directing',
    'Initiating',
    'Controlling a Stage',
    'Managing Product Delivery',
    'Managing a Stage Boundary',
    'Closing',
  ],
  agile: ['Backlog', 'Sprint Planning', 'Sprint Execution', 'Review & Retrospective', 'Release'],
}

const METHODOLOGY_FILTER_DOMAINS = [
  'portfolio_template',
  'programme_template',
  'project_template',
  'form_template',
  'process_template',
]

function filterRows(rows, { domain, methodology, category } = {}) {
  let list = [...rows]
  if (domain) list = list.filter((r) => r.domain === domain)
  if (methodology) {
    list = list.filter((r) => String(r.methodology || '').toLowerCase() === methodology.toLowerCase())
  }
  if (category) {
    const cat = category.toLowerCase()
    list = list.filter((r) => String(r.category || '').toLowerCase() === cat)
  }
  return list
}

describe('GTL methodology + domain filters (v188)', () => {
  const rows = [
    { id: 1, domain: 'project_template', methodology: 'standards_based', category: 'delivery', name: 'A' },
    { id: 2, domain: 'project_template', methodology: 'agile', category: 'delivery', name: 'B' },
    { id: 3, domain: 'form_template', methodology: 'structured', category: 'Starting Up', name: 'C' },
    { id: 4, domain: 'form_template', methodology: 'standards_based', category: 'Initiating', name: 'D' },
    { id: 5, domain: 'portfolio_template', methodology: 'structured', category: 'strategic', name: 'E' },
  ]

  it('includes project_template in methodology filter domains', () => {
    expect(METHODOLOGY_FILTER_DOMAINS).toContain('project_template')
  })

  it('defines distinct category sets per methodology', () => {
    expect(CATEGORIES_BY_METHODOLOGY.standards_based).toHaveLength(5)
    expect(CATEGORIES_BY_METHODOLOGY.structured).toHaveLength(7)
    expect(CATEGORIES_BY_METHODOLOGY.agile).toHaveLength(5)
    expect(CATEGORIES_BY_METHODOLOGY.standards_based).not.toContain('Agile')
    expect(CATEGORIES_BY_METHODOLOGY.structured).toContain('Starting Up')
  })

  it('filters by domain + methodology + category', () => {
    expect(filterRows(rows, { domain: 'project_template', methodology: 'standards_based' })).toHaveLength(1)
    expect(filterRows(rows, { domain: 'form_template', methodology: 'structured', category: 'Starting Up' })[0].id).toBe(3)
    expect(filterRows(rows, { methodology: 'structured' })).toHaveLength(2)
  })
})
