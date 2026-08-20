import { describe, it, expect } from 'vitest'
import { rolesToSelectOptions } from '../roleSelectUtils.js'

describe('rolesToSelectOptions', () => {
  it('maps display name to value/label and skips empty', () => {
    expect(
      rolesToSelectOptions([
        { role_name: 'project_manager', role_display_name: 'Project Manager', role_description: 'Owns initiation' },
        { role_name: 'skip', role_display_name: '  ', role_description: null },
        { role_name: 'sponsor', role_display_name: null, role_description: 'Board' },
      ]),
    ).toEqual([
      { value: 'Project Manager', label: 'Project Manager', description: 'Owns initiation' },
      { value: 'sponsor', label: 'sponsor', description: 'Board' },
    ])
  })
})
