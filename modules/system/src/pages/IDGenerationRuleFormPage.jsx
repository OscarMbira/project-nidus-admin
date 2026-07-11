import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createIdGenerationRule,
  findIdGenerationRuleForTable,
  formatDisplayIdError,
  isIdGenerationRuleAlreadyExistsError,
  parseIdGenerationRuleTableFromExistsError,
  updateIdGenerationRule,
} from '@nidus-admin/shared'
import { AdminForm, EmptyState, LoadingState, useToast } from '@nidus-admin/ui'
import IdGenerationRuleFormFields, { EMPTY_ID_RULE_FORM, ruleToForm } from './idGenerationRuleFormFields.jsx'
import { applyTableDefaults, getAbbreviationValidationError } from './idGenerationTableDefaults.js'
import { isDefaultRule } from './idGenerationPreview.js'
import { useIdGenerationRuleFormMode } from './useIdGenerationRuleFormMode.js'

export default function IDGenerationRuleFormPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()

  const {
    isEdit,
    loading,
    resolutionComplete,
    ruleError,
    rule,
    ruleId,
    tables,
    existingRules,
    catalogLoading,
    presetTable,
    resolveRuleForTable,
    adoptRule,
  } = useIdGenerationRuleFormMode()

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_ID_RULE_FORM)
  const [previewKey, setPreviewKey] = useState(0)
  const [capacityBlocked, setCapacityBlocked] = useState(false)

  const abbreviationError = getAbbreviationValidationError(
    form.table_abbreviation,
    existingRules,
    ruleId,
  )

  useEffect(() => {
    if (isEdit && rule) {
      setForm(ruleToForm(rule))
      return
    }
    if (!isEdit && presetTable && resolutionComplete) {
      setForm(applyTableDefaults(EMPTY_ID_RULE_FORM, presetTable, existingRules))
    }
  }, [isEdit, rule, presetTable, resolutionComplete, existingRules])

  useEffect(() => {
    setPreviewKey((k) => k + 1)
  }, [form])

  useEffect(() => {
    if (isEdit || !resolutionComplete || !form.target_table) return undefined

    let cancelled = false
    resolveRuleForTable(form.target_table).then((existing) => {
      if (cancelled || !existing?.id) return
      adoptRule(existing)
    })

    return () => { cancelled = true }
  }, [form.target_table, isEdit, resolutionComplete, resolveRuleForTable, adoptRule])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!isEdit && (!form.target_table || !form.table_abbreviation.trim())) {
      showError('Target table and abbreviation are required.')
      return
    }
    if (!form.table_abbreviation.trim()) {
      showError('Abbreviation is required.')
      return
    }

    const segmentType = form.segment_type || 'alphanumeric'
    if (segmentType === 'numeric' && Number(form.num_digits) < 1) {
      showError('Digit length must be at least 1 for numeric IDs.')
      return
    }
    if (segmentType === 'alpha' && Number(form.num_letters) < 1) {
      showError('Letter length must be at least 1 for alpha IDs.')
      return
    }
    if (segmentType === 'alphanumeric' && Number(form.num_letters) + Number(form.num_digits) < 1) {
      showError('Letters plus digits must be at least 1.')
      return
    }
    if (capacityBlocked) {
      showError('The configured format cannot cover the table\'s current row count. Widen the format before saving.')
      return
    }
    if (abbreviationError) {
      showError(abbreviationError)
      return
    }

    let existingForTable = isEdit
      ? rule
      : findIdGenerationRuleForTable(existingRules, form.target_table)
    if (!existingForTable?.id) {
      existingForTable = await resolveRuleForTable(form.target_table)
    }

    const saveAsUpdate = Boolean(existingForTable?.id)
    const targetRuleId = existingForTable?.id

    setSaving(true)
    let { error: mutationError } = saveAsUpdate
      ? await updateIdGenerationRule(targetRuleId, form)
      : await createIdGenerationRule(form)
    setSaving(false)

    if (mutationError && !saveAsUpdate && isIdGenerationRuleAlreadyExistsError(mutationError)) {
      const tableFromError = parseIdGenerationRuleTableFromExistsError(mutationError)
      const retryTable = tableFromError || form.target_table
      const rediscovered = await resolveRuleForTable(retryTable)
      if (rediscovered?.id) {
        setSaving(true)
        const retry = await updateIdGenerationRule(rediscovered.id, form)
        setSaving(false)
        mutationError = retry.error
        if (!mutationError) {
          showSuccess('Rule updated.')
          navigate('/system/id-generation-rules')
          return
        }
      }
    }

    if (mutationError) {
      showError(formatDisplayIdError(mutationError))
      return
    }

    showSuccess(saveAsUpdate ? 'Rule updated.' : 'ID generation rule created.')
    navigate('/system/id-generation-rules')
  }

  if (loading) {
    return <LoadingState message={isEdit || presetTable ? 'Loading rule...' : 'Loading form...'} />
  }

  if (isEdit && ruleError) return <div className="p-6 text-red-400">{ruleError}</div>

  if (isEdit && !rule) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Rule not found" description="Select a valid ID generation rule to edit." />
        <button
          type="button"
          className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
          onClick={() => navigate('/system/id-generation-rules')}
        >
          Back to ID Rules
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">
            {isEdit ? 'Edit ID Generation Rule' : 'Create ID Generation Rule'}
          </h1>
          <p className="text-sm text-gray-500">
            {isEdit
              ? `Configure display ID format for ${rule?.target_table || form.target_table}.`
              : 'Define a human-readable display ID format for an admin panel table or platform/simulator database table.'}
          </p>
          {isEdit && rule && isDefaultRule(rule) && (
            <span className="mt-2 inline-flex rounded border border-amber-700 bg-amber-900/30 px-2 py-0.5 text-xs text-amber-200">
              Default rule
            </span>
          )}
        </div>
        <button
          type="button"
          className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
          onClick={() => navigate('/system/id-generation-rules')}
        >
          Back to ID Rules
        </button>
      </div>

      <div className="max-w-4xl rounded-lg border border-gray-700 bg-gray-900 p-5 md:p-6">
        <AdminForm onSubmit={handleSubmit} className="space-y-4">
          <IdGenerationRuleFormFields
            form={form}
            setForm={setForm}
            tables={tables}
            tablesLoading={catalogLoading}
            previewKey={previewKey}
            lockTargetTable={isEdit}
            autoFillFromTable={!isEdit}
            existingRules={existingRules}
            excludeRuleId={ruleId}
            onCapacityChange={(data) => setCapacityBlocked(Boolean(data?.capacity_exceeded))}
          />
          <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
            <button
              type="button"
              onClick={() => navigate('/system/id-generation-rules')}
              className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || capacityBlocked || Boolean(abbreviationError)}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {saving
                ? (isEdit ? 'Updating...' : 'Creating...')
                : (isEdit ? 'Update' : 'Create')}
            </button>
          </div>
        </AdminForm>
      </div>
    </div>
  )
}
