/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest'
import { isValidCustomFieldLimit } from '../registerCustomFieldLimitServices.js'
import { DEFAULT_NAV_SECTIONS } from '../defaultAdminNav.js'

describe('isValidCustomFieldLimit', () => {
  it('accepts whole numbers from 1 to 200', () => {
    expect(isValidCustomFieldLimit(1)).toBe(true)
    expect(isValidCustomFieldLimit('30')).toBe(true)
    expect(isValidCustomFieldLimit(200)).toBe(true)
  })

  it('rejects out-of-range, fractional and empty values', () => {
    expect(isValidCustomFieldLimit(0)).toBe(false)
    expect(isValidCustomFieldLimit(201)).toBe(false)
    expect(isValidCustomFieldLimit(2.5)).toBe(false)
    expect(isValidCustomFieldLimit('')).toBe(false)
    expect(isValidCustomFieldLimit('abc')).toBe(false)
  })
})

describe('default admin nav', () => {
  it('lists Register Custom Field Limits under System', () => {
    const json = JSON.stringify(DEFAULT_NAV_SECTIONS)
    expect(json).toContain('/system/register-custom-fields')
  })
})
