import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({
  getAdminDb: () => ({ rpc }),
}))
vi.mock('../adminContext.jsx', () => ({
  getCurrentAdminUserId: async () => '11111111-1111-1111-1111-111111111111',
}))

describe('formInstanceExportServices (picker → export flow)', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('fetchCompletedFormInstances calls list_completed_form_instances RPC', async () => {
    const { fetchCompletedFormInstances } = await import('../formInstanceExportServices.js')
    rpc.mockResolvedValueOnce({
      data: [
        {
          form_instance_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          project_name: 'Alpha',
          status: 'approved',
          owner_name: 'Ada',
          updated_at: '2026-07-01T00:00:00Z',
        },
      ],
      error: null,
    })

    const { data, error } = await fetchCompletedFormInstances(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'platform',
    )

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0].project_name).toBe('Alpha')
    expect(rpc).toHaveBeenCalledWith('list_completed_form_instances', expect.objectContaining({
      p_global_template_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      p_target: 'platform',
    }))
  })

  it('fetchCompletedFormInstanceData returns values shaped for exportRecordTo*', async () => {
    const { fetchCompletedFormInstanceData } = await import('../formInstanceExportServices.js')
    rpc.mockResolvedValueOnce({
      data: {
        instance: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'approved' },
        values: { project_name: 'Alpha', sponsor: 'Board' },
        rows: [],
      },
      error: null,
    })

    const { data, error } = await fetchCompletedFormInstanceData(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'simulator',
    )

    expect(error).toBeNull()
    expect(data.values.project_name).toBe('Alpha')
    expect(rpc).toHaveBeenCalledWith('get_completed_form_instance', expect.objectContaining({
      p_form_instance_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      p_target: 'simulator',
    }))
  })
})
