import { AdminField, inputClass } from '@nidus-admin/ui'
import { CATEGORY_OPTIONS, CHANNEL_OPTIONS } from './notificationTemplateFormUtils.js'

const compactInput = `${inputClass} py-1.5 text-sm`
const rowClass = 'grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'

export default function NotificationTemplateFormFields({
  form,
  setForm,
  isEdit = false,
  readOnly = false,
}) {
  const showSubject = form.channel === 'email' || form.channel === 'both'

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 md:p-4">
      <fieldset disabled={readOnly} className="flex flex-col gap-3 border-0 p-0 m-0 min-w-0 disabled:opacity-95">
        <div className={rowClass}>
          <AdminField helpKey="admin.notification_templates.template_key" htmlFor="fh-notification-templates-template-key" label="Template key" required>
            <input id="fh-notification-templates-template-key"
              className={`${compactInput} ${isEdit ? 'opacity-70' : ''}`}
              value={form.template_key}
              readOnly={isEdit}
              onChange={(e) => setForm((prev) => ({ ...prev, template_key: e.target.value }))}
              placeholder="subscription_expiry_warning"
            />
          </AdminField>
          <AdminField helpKey="admin.notification_templates.template_name" htmlFor="fh-notification-templates-template-name" label="Template name" required>
            <input id="fh-notification-templates-template-name"
              className={compactInput}
              value={form.template_name}
              onChange={(e) => setForm((prev) => ({ ...prev, template_name: e.target.value }))}
              placeholder="Subscription Expiry Warning"
            />
          </AdminField>
          <AdminField helpKey="admin.notification_templates.category" htmlFor="fh-notification-templates-category" label="Category" required>
            <select id="fh-notification-templates-category"
              className={compactInput}
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </AdminField>
        </div>

        <div className={rowClass}>
          <AdminField helpKey="admin.notification_templates.channel" htmlFor="fh-notification-templates-channel" label="Channel" required>
            <select id="fh-notification-templates-channel"
              className={compactInput}
              value={form.channel}
              onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}
            >
              {CHANNEL_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </AdminField>
          {showSubject ? (
            <div className="sm:col-span-2">
              <AdminField helpKey="admin.notification_templates.subject_template" htmlFor="fh-notification-templates-subject-template" label="Subject template">
                <input id="fh-notification-templates-subject-template"
                  className={compactInput}
                  value={form.subject_template}
                  onChange={(e) => setForm((prev) => ({ ...prev, subject_template: e.target.value }))}
                  placeholder="Subscription expiring for {{org_name}}"
                />
              </AdminField>
            </div>
          ) : (
            <div className="hidden sm:block sm:col-span-2" aria-hidden />
          )}
        </div>

        <AdminField helpKey="admin.notification_templates.body_template" htmlFor="fh-notification-templates-body-template" label="Body template" required>
          <textarea id="fh-notification-templates-body-template"
            rows={4}
            className={compactInput}
            value={form.body_template}
            onChange={(e) => setForm((prev) => ({ ...prev, body_template: e.target.value }))}
            placeholder="Your subscription expires on {{expiry_date}}."
          />
        </AdminField>

        <label data-help="exempt" className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Active
        </label>
      </fieldset>
    </div>
  )
}
