import { describe, it, expect } from 'vitest'
import { riskCategoriesToSelectOptions } from '../riskCategorySelectUtils.js'

describe('riskCategoriesToSelectOptions', () => {
  it('maps category_code to value and category_name to label', () => {
    expect(
      riskCategoriesToSelectOptions([
        { category_code: 'scope', category_name: 'Scope', category_description: 'Scope risk' },
        { category_code: '  ', category_name: '', category_description: null },
        { category_code: '', category_name: 'External', category_description: null },
      ]),
    ).toEqual([
      { value: 'scope', label: 'Scope', description: 'Scope risk' },
      { value: 'External', label: 'External', description: '' },
    ])
  })
})
