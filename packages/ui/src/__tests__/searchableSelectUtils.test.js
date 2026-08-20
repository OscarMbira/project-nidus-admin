import { describe, it, expect } from 'vitest'
import {
  shouldShowCreateOption,
  appendUniqueMultiValue,
  removeMultiValue,
} from '../searchableSelectUtils.js'

describe('shouldShowCreateOption', () => {
  const options = [{ value: 'a', label: 'Alpha' }, { value: 'surveyor', label: 'Surveyor' }]

  it('is false when allowCreate is false', () => {
    expect(shouldShowCreateOption(false, 'Brand new', options)).toBe(false)
  })

  it('is false for empty search', () => {
    expect(shouldShowCreateOption(true, '  ', options)).toBe(false)
  })

  it('is false when query matches an existing label or value', () => {
    expect(shouldShowCreateOption(true, 'Alpha', options)).toBe(false)
    expect(shouldShowCreateOption(true, 'surveyor', options)).toBe(false)
  })

  it('is true when allowCreate and query is novel', () => {
    expect(shouldShowCreateOption(true, 'Design consultant', options)).toBe(true)
  })
})

describe('MultiSearchableSelect chip helpers', () => {
  it('appendUniqueMultiValue adds and dedupes', () => {
    expect(appendUniqueMultiValue(['Steel'], 'Concrete')).toEqual(['Steel', 'Concrete'])
    expect(appendUniqueMultiValue(['Steel'], 'Steel')).toEqual(['Steel'])
    expect(appendUniqueMultiValue(['Steel'], '  ')).toEqual(['Steel'])
  })

  it('removeMultiValue removes one chip', () => {
    expect(removeMultiValue(['Steel', 'Concrete'], 'Steel')).toEqual(['Concrete'])
  })
})
