import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cancelEmailCampaign, deleteEmailCampaign, fetchEmailCampaigns } from '@nidus-admin/shared'
import { AdminBadge, EmptyState, LoadingState, useConfirmAction, useToast } from '@nidus-admin/ui'

const statusVariant = (status) => {
  if (status === 'sent') return 'active'
  if (status === 'sending' || status === 'scheduled') return 'pending_activation'
  if (status === 'cancelled') return 'suspended'
  return 'content_admin'
}

export default function CampaignListPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchEmailCampaigns()
    if (error) showError(error.message || String(error))
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <LoadingState message="Loading campaigns..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Email Campaigns</h1>
          <p className="text-sm text-gray-500">Broadcast emails to filtered audiences.</p>
        </div>
        <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm text-white" onClick={() => navigate('/email-centre/campaign-editor')}>
          New campaign
        </button>
      </div>

      {!rows.length ? (
        <EmptyState title="No campaigns" description="Create a campaign to send bulk emails." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{row.campaign_name}</td>
                  <td className="px-4 py-3"><AdminBadge label={row.status} variant={statusVariant(row.status)} /></td>
                  <td className="px-4 py-3">{row.total_recipients}</td>
                  <td className="px-4 py-3">{row.sent_count} / {row.failed_count} failed</td>
                  <td className="px-4 py-3 space-x-2">
                    <Link to={`/email-centre/campaign-editor?id=${row.id}`} className="text-blue-400 hover:underline">Edit</Link>
                    {row.status === 'draft' && (
                      <button type="button" className="text-red-400 hover:underline" onClick={() => confirm({
                        title: 'Delete campaign?',
                        message: row.campaign_name,
                        danger: true,
                        action: async () => {
                          const { error } = await deleteEmailCampaign(row.id)
                          if (error) throw error
                          showSuccess('Campaign deleted.')
                          load()
                        },
                      })}>Delete</button>
                    )}
                    {['scheduled', 'sending'].includes(row.status) && (
                      <button type="button" className="text-amber-400 hover:underline" onClick={() => confirm({
                        title: 'Cancel campaign?',
                        message: row.campaign_name,
                        danger: true,
                        action: async () => {
                          const { error } = await cancelEmailCampaign(row.id)
                          if (error) throw error
                          showSuccess('Campaign cancelled.')
                          load()
                        },
                      })}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal}
    </div>
  )
}
