export const CATEGORY_OPTIONS = ['billing', 'security', 'system', 'support']
export const CHANNEL_OPTIONS = ['in_app', 'email', 'both']

export const EMPTY_NOTIFICATION_TEMPLATE_FORM = {
  template_key: '',
  template_name: '',
  category: 'system',
  channel: 'in_app',
  subject_template: '',
  body_template: '',
  is_active: true,
}

export function templateToForm(template) {
  return {
    template_key: template.template_key || '',
    template_name: template.template_name || '',
    category: template.category || 'system',
    channel: template.channel || 'in_app',
    subject_template: template.subject_template || '',
    body_template: template.body_template || '',
    is_active: template.is_active !== false,
  }
}

export function buildNotificationTemplatePayload(form, isEdit) {
  if (!form.template_name.trim() || !form.body_template.trim()) {
    throw new Error('Template name and body are required.')
  }
  if (!isEdit && !form.template_key.trim()) {
    throw new Error('Template key is required.')
  }

  return {
    template_key: form.template_key.trim(),
    template_name: form.template_name.trim(),
    category: form.category,
    channel: form.channel,
    subject_template: form.subject_template.trim() || null,
    body_template: form.body_template.trim(),
    is_active: form.is_active,
  }
}

export function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
