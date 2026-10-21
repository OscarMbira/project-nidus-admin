/**
 * v216 (monorepo v1311) — maximum number of organisation custom fields per Local Register.
 * A global default (initially 30) plus optional per-organisation overrides. Writes
 * public.local_register_custom_field_settings / _limit_overrides through the SQL v242 RPCs
 * (permission system.register_custom_fields.edit; reason required; audited).
 * Platform and Simulator enforce the limit server-side when a user adds a field.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  fetchRegisterCustomFieldLimits,
  searchOrganisationsForCustomFieldLimit,
  setRegisterCustomFieldDefaultLimit,
  setRegisterCustomFieldOverride,
  removeRegisterCustomFieldOverride,
  isValidCustomFieldLimit,
  REGISTER_CUSTOM_FIELD_LIMIT_MIN,
  REGISTER_CUSTOM_FIELD_LIMIT_MAX,
} from '@nidus-admin/shared'
import {
  AdminCard,
  AdminIconActionButton,
  AdminModal,
  AdminTable,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const INPUT_CLASS =
  'w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
const RANGE_HINT = `Whole number from ${REGISTER_CUSTOM_FIELD_LIMIT_MIN} to ${REGISTER_CUSTOM_FIELD_LIMIT_MAX}.`

function OverrideModal({ open, initial, onClose, onSaved }) {
  const { showError } = useToast()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [account, setAccount] = useState(null)
  const [limit, setLimit] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = !!initial

  useEffect(() => {
    if (!open || isEdit) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data, error } = await searchOrganisationsForCustomFieldLimit(search)
      if (!cancelled) {
        if (error) showError(error)
        setResults(data)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, isEdit, search, showError])

  if (!open) return null
  const selected = isEdit ? { id: initial.account_id, account_name: initial.account_name } : account
  const valueLimit = limit === '' && isEdit ? String(initial.field_limit) : limit
  const canSave = !!selected && isValidCustomFieldLimit(valueLimit) && reason.trim() !== '' && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const { error } = await setRegisterCustomFieldOverride(selected.id, valueLimit, reason.trim())
    setSaving(false)
    if (error) { showError(error); return }
    onSaved(`${selected.account_name} can now add up to ${valueLimit} custom fields per register.`)
  }

  return (
    <AdminModal
      open
      size="lg"
      title={isEdit ? `Edit limit — ${initial.account_name}` : 'Add organisation override'}
      onClose={onClose}
      onConfirm={save}
      confirmLabel={saving ? 'Saving…' : 'Save override'}
    >
      <div className="space-y-4">
        {!isEdit && (
          <div className="space-y-2">
            <label htmlFor="cf-limit-org-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Organisation *</label>
            <input
              id="cf-limit-org-search"
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setAccount(null) }}
              placeholder="Search organisations by name or code…"
              className={INPUT_CLASS}
            />
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-200 rounded border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No organisations found.</li>
              ) : results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setAccount(r)}
                    className={`w-full px-3 py-2 text-left text-sm ${account?.id === r.id
                      ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                      : 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'}`}
                  >
                    {r.account_name}{r.account_code ? <span className="ml-2 font-mono text-xs text-gray-500 dark:text-gray-400">{r.account_code}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <label htmlFor="cf-limit-value" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Custom fields per register *</label>
          <input id="cf-limit-value" type="number" min={REGISTER_CUSTOM_FIELD_LIMIT_MIN} max={REGISTER_CUSTOM_FIELD_LIMIT_MAX}
            value={valueLimit} onChange={(e) => setLimit(e.target.value)} className={INPUT_CLASS} />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{RANGE_HINT}</p>
        </div>
        <div>
          <label htmlFor="cf-limit-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason (required)</label>
          <textarea id="cf-limit-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT_CLASS} />
        </div>
        {!canSave && !saving && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Choose an organisation, a valid limit and a reason to save.</p>
        )}
      </div>
    </AdminModal>
  )
}

export default function RegisterCustomFieldLimitsPage() {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [settings, setSettings] = useState({ default_limit: 30, overrides: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [defaultInput, setDefaultInput] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | override row

  const load = async () => {
    setLoading(true)
    const { data, error: e } = await fetchRegisterCustomFieldLimits()
    setError(e)
    setSettings(data)
    setDefaultInput(String(data.default_limit ?? 30))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const overrides = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = settings.overrides || []
    const filtered = q
      ? list.filter((r) => [r.account_name, r.account_code, r.reason].some((v) => String(v || '').toLowerCase().includes(q)))
      : list
    return [...filtered].sort((a, b) => String(a.account_name).localeCompare(String(b.account_name), undefined, { sensitivity: 'base' }))
  }, [settings, search])

  const saveDefault = () => {
    if (!isValidCustomFieldLimit(defaultInput)) { showError(RANGE_HINT); return }
    confirm({
      title: `Set the default limit to ${defaultInput}?`,
      message: 'Applies to every organisation without its own override. Fields already added are kept; organisations above the new limit simply cannot add more.',
      confirmLabel: 'Save default',
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: e } = await setRegisterCustomFieldDefaultLimit(defaultInput, reason)
        if (e) { showError(e); return }
        showSuccess(`Default limit is now ${defaultInput} custom fields per register.`)
        await load()
      },
    })
  }

  const removeOverride = (row) => {
    confirm({
      title: `Remove the override for "${row.account_name}"?`,
      message: `The organisation goes back to the default limit of ${settings.default_limit}. Fields already added are kept.`,
      confirmLabel: 'Remove override',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: e } = await removeRegisterCustomFieldOverride(row.account_id, reason)
        if (e) { showError(e); return }
        showSuccess(`"${row.account_name}" now uses the default limit.`)
        await load()
      },
    })
  }

  if (loading) return <LoadingState message="Loading custom field limits..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Register Custom Field Limits</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Maximum number of custom fields an organisation can add to any one local register (Platform and Simulator).
        </p>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminCard title="Default limit" value={settings.default_limit} />
        <AdminCard title="Organisation overrides" value={(settings.overrides || []).length} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <label htmlFor="cf-default-limit" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Default custom fields per register</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input id="cf-default-limit" type="number" min={REGISTER_CUSTOM_FIELD_LIMIT_MIN} max={REGISTER_CUSTOM_FIELD_LIMIT_MAX}
            value={defaultInput} onChange={(e) => setDefaultInput(e.target.value)} className={`${INPUT_CLASS} sm:w-40`} />
          <button
            type="button"
            onClick={saveDefault}
            disabled={String(settings.default_limit) === defaultInput}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save default
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{RANGE_HINT}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar value={search} onChange={setSearch} placeholder="Search overrides..." />
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add override
        </button>
      </div>

      {overrides.length === 0 ? (
        <EmptyState
          title="No organisation overrides"
          description={`Every organisation can add up to ${settings.default_limit} custom fields per register.`}
        />
      ) : (
        <AdminTable
          rows={overrides}
          idKey="account_id"
          columns={[
            { key: 'account_name', label: 'Organisation' },
            { key: 'account_code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.account_code || '—'}</span> },
            { key: 'field_limit', label: 'Limit' },
            { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
            { key: 'updated_at', label: 'Updated', render: (r) => (r.updated_at ? new Date(r.updated_at).toLocaleString() : '—') },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                <div className="flex items-center gap-2">
                  <AdminIconActionButton variant="edit" label={`Edit limit for ${r.account_name}`} onClick={() => setEditing(r)} />
                  <AdminIconActionButton variant="delete" label={`Remove override for ${r.account_name}`} onClick={() => removeOverride(r)} />
                </div>
              ),
            },
          ]}
        />
      )}

      <OverrideModal
        key={editing === 'new' ? 'new' : editing?.account_id || 'closed'}
        open={!!editing}
        initial={editing && editing !== 'new' ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={async (message) => { setEditing(null); showSuccess(message); await load() }}
      />
      {modal}
    </div>
  )
}
