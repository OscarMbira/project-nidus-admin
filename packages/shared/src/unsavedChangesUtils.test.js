import { describe, it, expect } from 'vitest'
import { aggregateDirtyState } from './unsavedChangesUtils.js'

describe('aggregateDirtyState', () => {
  it('returns not dirty when no guards are dirty', () => {
    expect(aggregateDirtyState([{ isDirty: false }])).toEqual({
      isDirty: false,
      message: 'You have unsaved changes. Discard them and leave this page?',
    })
  })

  it('returns dirty with custom message', () => {
    expect(aggregateDirtyState([{ isDirty: true, message: 'Custom warning' }])).toEqual({
      isDirty: true,
      message: 'Custom warning',
    })
  })

  it('aggregates multiple guards', () => {
    expect(
      aggregateDirtyState([
        { isDirty: false },
        { isDirty: true, message: 'Form A' },
        { isDirty: true, message: 'Form B' },
      ]).isDirty,
    ).toBe(true)
  })
})
