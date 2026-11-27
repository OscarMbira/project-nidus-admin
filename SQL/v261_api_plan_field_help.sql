-- ============================================================================
-- v261: Field help for subscription plan API/SCIM limit columns (v1356)
-- Matches admin.field_help shape (title / module_code), same as v255.
-- Idempotent.
-- ============================================================================

INSERT INTO admin.field_help (help_key, title, purpose, examples, format_notes, extra_notes, module_code)
VALUES
  ('admin.subscription_plans.api_rate_per_minute', 'API rate / minute',
   'Maximum public API requests this plan may make per organisation per minute.',
   '120', NULL, NULL, 'admin_subscriptions'),
  ('admin.subscription_plans.api_rate_per_day', 'API rate / day',
   'Maximum public API requests this plan may make per organisation per day.',
   '50000', NULL, NULL, 'admin_subscriptions'),
  ('admin.subscription_plans.scim_rate_per_minute', 'SCIM rate / minute',
   'Maximum SCIM requests this plan may make per organisation per minute.',
   '60', NULL, NULL, 'admin_subscriptions')
ON CONFLICT (help_key, form_key, locale) DO UPDATE SET
  title = EXCLUDED.title,
  purpose = EXCLUDED.purpose,
  examples = EXCLUDED.examples,
  format_notes = EXCLUDED.format_notes,
  extra_notes = EXCLUDED.extra_notes,
  module_code = EXCLUDED.module_code,
  is_active = TRUE,
  updated_at = NOW();
