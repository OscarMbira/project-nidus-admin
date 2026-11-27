// Organisation data (monorepo v1358 Slice 2) — Admin service calls and helpers.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const createSignedUrl = vi.fn()
const from = vi.fn(() => ({ createSignedUrl }))
vi.mock('../supabase.js', () => ({ getPublicDb: () => ({ rpc }), getAdminStorageClient: () => ({ storage: { from } }) }))
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

describe('organisation deletion RPC calls (v1358 slice 3a)', () => {
  it('opens, decides and cancels with a reason and never an admin id', async () => {
    const { openOrganisationDeletion, decideOrganisationDeletion, cancelOrganisationDeletion } = await import('../organisationDataServices.js')
    rpc.mockResolvedValue({ data: {}, error: null })
    await openOrganisationDeletion('acc-1', 'Contract ended')
    expect(rpc).toHaveBeenLastCalledWith('admin_organisation_deletion_open', { p_account_id: 'acc-1', p_reason: 'Contract ended' })
    await decideOrganisationDeletion('req-1', 0, 'Contract still running')
    expect(rpc).toHaveBeenLastCalledWith('admin_organisation_deletion_decide', { p_request_id: 'req-1', p_approve: false, p_reason: 'Contract still running' })
    await cancelOrganisationDeletion('req-1', 'Customer changed their mind')
    expect(rpc).toHaveBeenLastCalledWith('admin_organisation_deletion_cancel', { p_request_id: 'req-1', p_reason: 'Customer changed their mind' })
    for (const [, params] of rpc.mock.calls) expect(params).not.toHaveProperty('p_admin_user_id')
  })
})

describe('organisation deletion records and certificates (v1358 slice 3b)', () => {
  it('lists deletion records, falling back to an empty list', async () => {
    const { fetchOrganisationDeletionRecords } = await import('../organisationDataServices.js')
    rpc.mockResolvedValueOnce({ data: null, error: null })
    const res = await fetchOrganisationDeletionRecords()
    expect(rpc).toHaveBeenCalledWith('admin_organisation_deletion_records', {})
    expect(res).toEqual({ data: [], error: null })
  })

  it('makes a short download link for a certificate from the private bucket', async () => {
    const { getDeletionCertificateUrl, DELETION_CERTIFICATES_BUCKET } = await import('../organisationDataServices.js')
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://files.example/cert.pdf?token=x' }, error: null })
    const res = await getDeletionCertificateUrl('rec-1/deletion-certificate-ODL-001.pdf')
    expect(from).toHaveBeenCalledWith(DELETION_CERTIFICATES_BUCKET)
    expect(createSignedUrl).toHaveBeenCalledWith('rec-1/deletion-certificate-ODL-001.pdf', 300, { download: true })
    expect(res).toEqual({ url: 'https://files.example/cert.pdf?token=x', error: null })
    expect(await getDeletionCertificateUrl(null)).toEqual({ url: null, error: 'This deletion has no certificate yet' })
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
    expect(await getDeletionCertificateUrl('x.pdf')).toEqual({ url: null, error: 'Object not found' })
  })
})
