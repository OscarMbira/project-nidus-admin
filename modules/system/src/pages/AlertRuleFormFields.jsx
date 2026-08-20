import { AdminField, inputClass } from '@nidus-admin/ui'
import {
  CONDITION_TYPE_OPTIONS,
  TARGET_SYSTEM_OPTIONS,
  conditionParamsForTypeChange,
} from './alertRuleFormUtils.js'
import AlertConditionParamsFields from './AlertConditionParamsFields.jsx'

const compactInput = `${inputClass} py-1.5 text-sm`
const rowClass = 'grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'

export default function AlertRuleFormFields({
  form,
  setForm,
  templates,
  isEdit = false,
  readOnly = false,
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 md:p-4">
      <fieldset disabled={readOnly} className="flex flex-col gap-3 border-0 p-0 m-0 min-w-0 disabled:opacity-95">
        <div className={rowClass}>
          <AdminField label="Rule name" required>
            <input
              className={compactInput}
              value={form.rule_name}
              onChange={(e) => setForm((prev) => ({ ...prev, rule_name: e.target.value }))}
              placeholder="Failed payment threshold"
            />
          </AdminField>
          <AdminField label="Rule key" required>
            <input
              className={`${compactInput} ${isEdit ? 'opacity-70' : ''}`}
              value={form.rule_key}
              readOnly={isEdit}
              onChange={(e) => setForm((prev) => ({ ...prev, rule_key: e.target.value }))}
              placeholder="failed_payment_threshold"
            />
          </AdminField>
          <AdminField label="Condition type" required>
            <select
              className={compactInput}
              value={form.condition_type}
              onChange={(e) => {
                const nextType = e.target.value
                setForm((prev) => ({
                  ...prev,
                  condition_type: nextType,
                  condition_params: conditionParamsForTypeChange(nextType),
                }))
              }}
            >
              {CONDITION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </AdminField>
        </div>

        <div className={rowClass}>
          <AdminField label="Target system" required>
            <select
              className={compactInput}
              value={form.target_system}
              onChange={(e) => setForm((prev) => ({ ...prev, target_system: e.target.value }))}
            >
              {TARGET_SYSTEM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </AdminField>
          <div className="sm:col-span-2">
            <AdminField label="Description">
              <input
                className={compactInput}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Alert when failed payments exceed threshold in a rolling window"
              />
            </AdminField>
          </div>
        </div>

        <div className={rowClass}>
          <AdminField label="Check interval (min)" required>
            <input
              type="number"
              min={1}
              className={compactInput}
              value={form.check_interval_minutes}
              onChange={(e) => setForm((prev) => ({ ...prev, check_interval_minutes: e.target.value }))}
            />
          </AdminField>
          <AdminField label="Notification template">
            <select
              className={compactInput}
              value={form.notification_template_id}
              onChange={(e) => setForm((prev) => ({ ...prev, notification_template_id: e.target.value }))}
            >
              <option value="">None</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.template_name} ({template.template_key})
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Target roles">
            <input
              className={compactInput}
              value={form.target_roles}
              onChange={(e) => setForm((prev) => ({ ...prev, target_roles: e.target.value }))}
              placeholder="super_admin, system_admin"
            />
          </AdminField>
        </div>

        <AlertConditionParamsFields form={form} setForm={setForm} />

        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Active — evaluated on each check interval
        </label>
      </fieldset>
    </div>
  )
}
