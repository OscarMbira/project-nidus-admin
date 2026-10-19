/**
 * AI Centre (monorepo v1272, PRD D6 / D16a) — monthly AI credit allowance per subscription plan.
 *   - Platform/Simulator plans: credits per organisation per month (subscription_plans)
 *   - Project Planner plans: credits per paid seat, pooled per account (planner_plan_limits)
 *   - Simulator plans: credits for an organisation whose owner has that Simulator plan (v1288 / Admin v240)
 * Blank = no AI included. The 14-day Planner trial allowance is in Settings.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAiPlans, getDisplayRowNumber, PermissionGate, setAiPlanCredits, setAiPlannerCredits, setAiSimulatorCredits } from '@nidus-admin/shared'
import { AdminActionButton, AdminBadge, AdminTable, ExportListMenu, LoadingState, inputClass, useConfirmAction, useToast } from '@nidus-admin/ui'

export function parseCredits(value) {
  const v = String(value ?? '').trim()
  if (v === '') return { ok: true, value: null }
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? { ok: true, value: n } : { ok: false, value: null }
}

export default function AiPlansPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState(null)
  const [edit, setEdit] = useState(null) // { kind, key, value }

  const load = async () => {
    const { data, error } = await fetchAiPlans()
    if (error) showError(String(error))
    setPlans(data || { platform: [], planner: [] })
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const save = (row, kind) => {
    const parsed = parseCredits(edit.value)
    if (!parsed.ok) { showError('Enter a whole number of credits, or leave blank for no AI.'); return }
    const name = kind === 'planner' ? row.plan_code : kind === 'simulator' ? row.plan_type : row.plan_name
    confirm({
      title: `Set AI credits for ${name}?`,
      message: parsed.value == null ? 'This plan will include no AI credits.' : `${parsed.value.toLocaleString()} credits a month${kind === 'planner' ? ' per paid seat' : ''}.`,
      confirmLabel: 'Save',
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = kind === 'planner'
          ? await setAiPlannerCredits(row.plan_code, parsed.value, reason)
          : kind === 'simulator'
            ? await setAiSimulatorCredits(row.plan_type, parsed.value, reason)
            : await setAiPlanCredits(row.id, parsed.value, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess(`AI credits updated for ${name}.`)
        setEdit(null)
        await load()
      },
    })
  }

  const creditsCell = (row, kind, key) => {
    if (edit?.kind === kind && edit.key === key) {
      return (
        <div className="flex items-center gap-2">
          <input className={`${inputClass} w-32`} type="number" min="0" value={edit.value} autoFocus
            onChange={(e) => setEdit((s) => ({ ...s, value: e.target.value }))} placeholder="No AI" />
          <AdminActionButton onClick={() => save(row, kind)}>Save</AdminActionButton>
          <AdminActionButton onClick={() => setEdit(null)}>Cancel</AdminActionButton>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-3">
        <span>{row.monthly_ai_credits == null ? <span className="text-gray-500 dark:text-gray-400">No AI</span> : Number(row.monthly_ai_credits).toLocaleString()}</span>
        <PermissionGate permission="ai.credits.edit">
          <AdminActionButton onClick={() => setEdit({ kind, key, value: row.monthly_ai_credits ?? '' })}>Change</AdminActionButton>
        </PermissionGate>
      </div>
    )
  }

  if (loading) return <LoadingState message="Loading plans..." />

  const platformRows = plans.platform || []
  const plannerRows = plans.planner || []
  const simulatorRows = plans.simulator || []
  const exportRows = [
    ...platformRows.map((r) => ({ product: 'Platform', plan: r.plan_name, cycle: r.billing_cycle, credits: r.monthly_ai_credits ?? '', unit: 'per organisation' })),
    ...plannerRows.map((r) => ({ product: 'Planner', plan: r.plan_code, cycle: '', credits: r.monthly_ai_credits ?? '', unit: 'per paid seat' })),
    ...simulatorRows.map((r) => ({ product: 'Simulator', plan: r.plan_type, cycle: '', credits: r.monthly_ai_credits ?? '', unit: 'per organisation' })),
  ].map((r, i, all) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: all.length || 1 }) }))

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Plans & AI credits</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Monthly AI allowance per plan. 1 credit = ${Number(plans.credit_unit_usd || 0).toFixed(4)} of model cost.
            Organisations without a paid plan (trials, free Simulator) get {Number(plans.default_trial_credits || 0).toLocaleString()} credits (<Link className="text-blue-600 dark:text-blue-400 underline" to="/ai/settings">change in Settings</Link>); the Planner trial is the "trial" row below.
            Organisation overrides and top-ups are on <Link className="text-blue-600 dark:text-blue-400 underline" to="/ai/organisations">Organisations</Link>.
          </p>
        </div>
        <ExportListMenu
          columns={[{ key: '#', label: '#' }, { key: 'product', label: 'Product' }, { key: 'plan', label: 'Plan' }, { key: 'cycle', label: 'Billing cycle' }, { key: 'credits', label: 'Monthly credits' }, { key: 'unit', label: 'Per' }]}
          data={exportRows}
          baseFilename="ai_plan_credits"
          disabled={!exportRows.length}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Platform and Simulator plans <span className="text-sm font-normal text-gray-500">(credits per organisation per month)</span></h2>
        <AdminTable
          rows={platformRows}
          pageSize={25}
          columns={[
            { key: 'plan_name', label: 'Plan', render: (r) => <span className="font-medium">{r.plan_name}</span> },
            { key: 'plan_type', label: 'Type' },
            { key: 'billing_cycle', label: 'Billing cycle' },
            { key: 'is_active', label: 'Status', render: (r) => <AdminBadge label={r.is_active ? 'active' : 'inactive'} variant={r.is_active ? 'active' : 'archived'} /> },
            { key: 'monthly_ai_credits', label: 'Monthly AI credits', sortable: false, render: (r) => creditsCell(r, 'platform', r.id) },
          ]}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Project Planner plans <span className="text-sm font-normal text-gray-500">(credits per paid seat per month, pooled per account)</span></h2>
        <AdminTable
          rows={plannerRows}
          idKey="plan_code"
          pageSize={25}
          columns={[
            { key: 'plan_code', label: 'Plan', render: (r) => <span className="font-mono">{r.plan_code}</span> },
            { key: 'is_active', label: 'Status', render: (r) => <AdminBadge label={r.is_active ? 'active' : 'inactive'} variant={r.is_active ? 'active' : 'archived'} /> },
            { key: 'monthly_ai_credits', label: 'Monthly AI credits per seat', sortable: false, render: (r) => creditsCell(r, 'planner', r.plan_code) },
          ]}
        />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Simulator plans <span className="text-sm font-normal text-gray-500">(credits per organisation per month, from the owner's Simulator plan; blank = the no-paid-plan allowance)</span></h2>
        <AdminTable
          rows={simulatorRows}
          idKey="plan_type"
          pageSize={25}
          columns={[
            { key: 'plan_type', label: 'Plan', render: (r) => <span className="font-mono">{r.plan_type}</span> },
            { key: 'monthly_ai_credits', label: 'Monthly AI credits', sortable: false, render: (r) => creditsCell(r, 'simulator', r.plan_type) },
          ]}
        />
      </section>
      {modal}
    </div>
  )
}
