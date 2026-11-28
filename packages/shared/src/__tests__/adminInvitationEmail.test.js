// Admin invitation email (SQL v268): link format, escaping, and the link is still returned when sending fails.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({ getAdminDb: () => ({ rpc }), getPublicDb: () => ({}), getSimDb: () => ({}) }))
vi.mock('../adminContext.jsx', () => ({ getCurrentAdminUserId: async () => 'admin-1' }))
const dispatchEmail = vi.fn()
vi.mock('../emailCentreServices.js', () => ({ dispatchEmail: (...a) => dispatchEmail(...a) }))

const { buildAdminInvitationEmail, sendAdminInvitationEmail } = await import('../mutationServices.js')

const DETAILS = { token: 'tok123', email: 'head.of.it@company.example', role: 'system_admin', role_label: 'System Admin', message: 'Welcome <team>', expires_at: '2026-12-01T10:00:00Z', invited_by: 'Head of Platform' }

beforeEach(() => { rpc.mockReset(); dispatchEmail.mockReset() })

describe('admin invitation email', () => {
  it('builds a setup link email and escapes the custom message', () => {
    const { subject, html } = buildAdminInvitationEmail(DETAILS, 'https://admin.company.example/setup/tok123')
    expect(subject).toMatch(/invited/)
    expect(html).toContain('href="https://admin.company.example/setup/tok123"')
    expect(html).toContain('System Admin')
    expect(html).toContain('Welcome &lt;team&gt;')
  })

  it('emails the invitee the /setup/<token> link', async () => {
    rpc.mockResolvedValueOnce({ data: DETAILS, error: null })
    dispatchEmail.mockResolvedValueOnce({ data: {}, error: null })
    const out = await sendAdminInvitationEmail('inv-9', 'http://localhost:5175/')
    expect(rpc).toHaveBeenCalledWith('admin_invitation_link_details', { p_ref: 'inv-9' })
    expect(out).toEqual({ link: 'http://localhost:5175/setup/tok123', error: null })
    expect(dispatchEmail.mock.calls[0][0].to).toBe('head.of.it@company.example')
  })

  it('returns the link with the error when sending fails, and an error when there is no invitation', async () => {
    rpc.mockResolvedValueOnce({ data: DETAILS, error: null })
    dispatchEmail.mockResolvedValueOnce({ data: null, error: new Error('Send failed (500)') })
    expect(await sendAdminInvitationEmail('user-9', 'http://localhost:5175')).toEqual({ link: 'http://localhost:5175/setup/tok123', error: 'Send failed (500)' })
    rpc.mockResolvedValueOnce({ data: null, error: 'There is no pending invitation for this admin' })
    expect(await sendAdminInvitationEmail('user-9', 'http://localhost:5175')).toEqual({ link: null, error: 'There is no pending invitation for this admin' })
  })
})
