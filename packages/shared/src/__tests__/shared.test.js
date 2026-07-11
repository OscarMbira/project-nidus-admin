import { describe, it, expect } from 'vitest'
import { validatePassword, hasPermission } from '../src/index.js'

describe('validators', () => {
  it('rejects short passwords', () => {
    const r = validatePassword('short')
    expect(r.valid).toBe(false)
  })

  it('accepts strong passwords', () => {
    const r = validatePassword('SecurePass123!')
    expect(r.valid).toBe(true)
  })
})

describe('permissions', () => {
  it('super_admin has all permissions', () => {
    expect(hasPermission('super_admin', [], 'admins.invite')).toBe(true)
  })

  it('content_admin cannot access billing', () => {
    expect(hasPermission('content_admin', [], 'subscriptions.view')).toBe(false)
  })
})
