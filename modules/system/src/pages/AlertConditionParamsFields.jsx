import { useMemo } from 'react'
import { AdminField, inputClass } from '@nidus-admin/ui'
import {
  CONDITION_PARAM_FIELDS,
  CONDITION_PARAM_HINTS,
  formatConditionParams,
  parseConditionParams,
  readConditionParamValues,
  writeConditionParams,
} from './alertRuleFormUtils.js'

const compactInput = `${inputClass} py-1.5 text-sm`

export default function AlertConditionParamsFields({ form, setForm }) {
  const conditionType = form.condition_type

  const values = useMemo(() => {
    try {
      const parsed = parseConditionParams(form.condition_params)
      return readConditionParamValues(conditionType, parsed)
    } catch {
      return readConditionParamValues(conditionType, {})
    }
  }, [conditionType, form.condition_params])

  const updateField = (key, value) => {
    const nextValues = { ...values, [key]: value }
    const params = writeConditionParams(conditionType, nextValues)
    setForm((prev) => ({ ...prev, condition_params: formatConditionParams(params) }))
  }

  if (conditionType === 'custom') {
    const hint = CONDITION_PARAM_HINTS.custom
    return (
      <div className="rounded border border-gray-700/80 bg-gray-800/30 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Custom condition</p>
        <AdminField label="Parameters (JSON)" required>
          <textarea
            rows={3}
            spellCheck={false}
            className={`${compactInput} font-mono text-xs leading-snug`}
            value={form.condition_params}
            onChange={(e) => setForm((prev) => ({ ...prev, condition_params: e.target.value }))}
            placeholder={hint}
          />
          <p className="mt-1 text-[11px] text-gray-500">Example: {hint}</p>
        </AdminField>
      </div>
    )
  }

  const fields = CONDITION_PARAM_FIELDS[conditionType] || []

  return (
    <div className="rounded border border-gray-700/80 bg-gray-800/30 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Condition settings</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <AdminField key={field.key} label={field.label} required>
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              min={field.min}
              className={compactInput}
              value={values[field.key] ?? ''}
              onChange={(e) => updateField(field.key, e.target.value)}
            />
          </AdminField>
        ))}
      </div>
    </div>
  )
}
