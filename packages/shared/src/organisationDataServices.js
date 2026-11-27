/**
 * Monorepo v1358 Slice 2 — organisation data: requests list, legal hold, ownership transfer. Every call goes
 * through the public.admin_organisation_* RPCs (Admin SQL v265; permissions organisations.data.view / .hold /
 * .transfer; changes need a reason and are audited). The acting admin comes from the session.
 */
import { getPublicDb } from './supabase.js'

async function rpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export const ORGANISATION_DATA_STATUS_LABELS = {
  queued: 'Queued',
  building: 'Being prepared',
  ready: 'Ready',
  failed: 'Failed',
  expired: 'Expired',
  pending_approval: 'Waiting for approval',
  rejected: 'Rejected',
  awaiting_confirmation: 'Waiting for owner confirmation',
  lapsed: 'Lapsed (not confirmed)',
  locked: 'Locked — deletion scheduled',
  deleting: 'Being deleted',
  deleted: 'Deleted',
  cancelled: 'Cancelled',
}

/** Deletion states an admin can still cancel (monorepo SQL v1604). */
export const CANCELLABLE_DELETION_STATUSES = ['pending_approval', 'awaiting_confirmation', 'locked']
export const ORGANISATION_DATA_KIND_LABELS = { export: 'Export', deletion: 'Deletion' }

export const fetchOrganisationDataRequests = async () => {
  const { data, error } = await rpc('admin_organisation_data_requests')
  return { data: data || { requests: [], holds: [] }, error }
}

export const fetchOrganisationDataOverview = async (accountId) => {
  const { data, error } = await rpc('admin_organisation_data_overview', { p_account_id: accountId })
  return { data: data || null, error }
}

export const setOrganisationLegalHold = (accountId, on, reason) =>
  rpc('admin_organisation_set_legal_hold', { p_account_id: accountId, p_on: Boolean(on), p_reason: reason })

export const transferOrganisationOwner = (accountId, newOwnerUserId, reason) =>
  rpc('admin_organisation_transfer_owner', { p_account_id: accountId, p_new_owner_user_id: newOwnerUserId, p_reason: reason })

export const openOrganisationDeletion = (accountId, reason) =>
  rpc('admin_organisation_deletion_open', { p_account_id: accountId, p_reason: reason })

export const decideOrganisationDeletion = (requestId, approve, reason) =>
  rpc('admin_organisation_deletion_decide', { p_request_id: requestId, p_approve: Boolean(approve), p_reason: reason })

export const cancelOrganisationDeletion = (requestId, reason) =>
  rpc('admin_organisation_deletion_cancel', { p_request_id: requestId, p_reason: reason })

export function formatDataSize(bytes) {
  const n = Number(bytes) || 0
  if (!n) return '—'
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(2)} GB`
}
