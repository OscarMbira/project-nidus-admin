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
          <AdminField helpKey="admin.alert_rules.rule_name" htmlFor="fh-alert-rules-rule-name" label="Rule name" required>
            <input id="fh-alert-rules-rule-name"
              className={compactInput}
              value={form.rule_name}
              onChange={(e) => setForm((prev) => ({ ...prev, rule_name: e.target.value }))}
              placeholder="Failed payment threshold"
            />
          </AdminField>
          <AdminField helpKey="admin.alert_rules.rule_key" htmlFor="fh-alert-rules-rule-key" label="Rule key" required>
            <input id="fh-alert-rules-rule-key"
              className={`${compactInput} ${isEdit ? 'opacity-70' : ''}`}
              value={form.rule_key}
              readOnly={isEdit}
              onChange={(e) => setForm((prev) => ({ ...prev, rule_key: e.target.value }))}
              placeholder="failed_payment_threshold"
            />
          </AdminField>
          <AdminField helpKey="admin.alert_rules.condition_type" htmlFor="fh-alert-rules-condition-type" label="Condition type" required>
            <select id="fh-alert-rules-condition-type"
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
          <AdminField helpKey="admin.alert_rules.target_system" htmlFor="fh-alert-rules-target-system" label="Target system" required>
            <select id="fh-alert-rules-target-system"
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
            <AdminField helpKey="admin.alert_rules.description" htmlFor="fh-alert-rules-description" label="Description">
              <input id="fh-alert-rules-description"
                className={compactInput}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Alert when failed payments exceed threshold in a rolling window"
              />
            </AdminField>
          </div>
        </div>

        <div className={rowClass}>
          <AdminField helpKey="admin.alert_rules.check_interval_minutes" htmlFor="fh-alert-rules-check-interval-minutes" label="Check interval (min)" required>
            <input id="fh-alert-rules-check-interval-minutes"
              type="number"
              min={1}
              className={compactInput}
              value={form.check_interval_minutes}
              onChange={(e) => setForm((prev) => ({ ...prev, check_interval_minutes: e.target.value }))}
            />
          </AdminField>
          <AdminField helpKey="admin.alert_rules.notification_template_id" htmlFor="fh-alert-rules-notification-template-id" label="Notification template">
            <select id="fh-alert-rules-notification-template-id"
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
          <AdminField helpKey="admin.alert_rules.target_roles" htmlFor="fh-alert-rules-target-roles" label="Target roles">
            <input id="fh-alert-rules-target-roles"
              className={compactInput}
              value={form.target_roles}
              onChange={(e) => setForm((prev) => ({ ...prev, target_roles: e.target.value }))}
              placeholder="super_admin, system_admin"
            />
          </AdminField>
        </div>

        <AlertConditionParamsFields form={form} setForm={setForm} />

        <label data-help="exempt" className="flex items-center gap-2 text-xs text-gray-300">
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
