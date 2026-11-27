// Organisation data (monorepo v1358 Slice 2) — Admin service calls and helpers.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({ getPublicDb: () => ({ rpc }) }))
import {
  fetchOrganisationDataOverview,
  fetchOrganisationDataRequests,
  formatDataSize,
  setOrganisationLegalHold,
  transferOrganisationOwner,
} from '../organisationDataServices.js'

beforeEach(() => rpc.mockReset())

describe('organisation data RPC calls', () => {
  it('lists requests and holds, falling back to empty lists', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    const { data } = await fetchOrganisationDataRequests()
    expect(rpc).toHaveBeenCalledWith('admin_organisation_data_requests', {})
    expect(data).toEqual({ requests: [], holds: [] })
  })

  it('loads one organisation and passes database errors through as text', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Organisation not found' } })
    const res = await fetchOrganisationDataOverview('acc-1')
    expect(rpc).toHaveBeenCalledWith('admin_organisation_data_overview', { p_account_id: 'acc-1' })
    expect(res).toEqual({ data: null, error: 'Organisation not found' })
  })

  it('sends the reason with holds and transfers, never an admin id', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    await setOrganisationLegalHold('acc-1', 1, 'Dispute raised by the Head of Legal')
    expect(rpc).toHaveBeenLastCalledWith('admin_organisation_set_legal_hold',
      { p_account_id: 'acc-1', p_on: true, p_reason: 'Dispute raised by the Head of Legal' })
    await transferOrganisationOwner('acc-1', 'user-2', 'Owner left')
    expect(rpc).toHaveBeenLastCalledWith('admin_organisation_transfer_owner',
      { p_account_id: 'acc-1', p_new_owner_user_id: 'user-2', p_reason: 'Owner left' })
    for (const [, params] of rpc.mock.calls) expect(params).not.toHaveProperty('p_admin_user_id')
  })
})

describe('formatDataSize', () => {
  it('shows a dash for nothing and readable units otherwise', () => {
    expect(formatDataSize(null)).toBe('—')
    expect(formatDataSize(2048)).toBe('2.0 KB')
    expect(formatDataSize(5 * 1048576)).toBe('5.0 MB')
    expect(formatDataSize(3 * 1073741824)).toBe('3.00 GB')
  })
})
