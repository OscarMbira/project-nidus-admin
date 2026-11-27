-- ============================================================================
-- v260: Public API / SCIM — Admin ID generation, plan switches, emergency revoke
-- Companion to project-nidus SQL/v1585–v1588 (v1356).
-- Narrow write exception: public.admin_api_* RPCs (document in both CLAUDE.md files).
-- Pattern matches Admin v255 (admin_require_public_site_permission + log_admin_action).
-- Idempotent.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.api_credentials') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.api_credentials') THEN
    PERFORM admin.create_id_generation_rule(
      'public.api_credentials',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'KEY' AND is_active = TRUE) THEN 'APIK' ELSE 'KEY' END,
      'Organisation public API credential identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'account_id'
    );
  ELSE
    RAISE NOTICE 'v260: public.api_credentials rule skipped';
  END IF;

  IF to_regclass('public.webhook_endpoints') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.webhook_endpoints') THEN
    PERFORM admin.create_id_generation_rule(
      'public.webhook_endpoints',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'HOOK' AND is_active = TRUE) THEN 'WHK' ELSE 'HOOK' END,
      'Organisation webhook endpoint identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'account_id'
    );
  ELSE
    RAISE NOTICE 'v260: public.webhook_endpoints rule skipped';
  END IF;

  IF to_regclass('public.sso_connections') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.sso_connections') THEN
    PERFORM admin.create_id_generation_rule(
      'public.sso_connections',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'SSO' AND is_active = TRUE) THEN 'SSOC' ELSE 'SSO' END,
      'Organisation SSO connection identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'account_id'
    );
  ELSE
    RAISE NOTICE 'v260: public.sso_connections rule skipped';
  END IF;
END $$;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scim_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS api_rate_per_minute INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS api_rate_per_day INTEGER NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS scim_rate_per_minute INTEGER NOT NULL DEFAULT 60;

UPDATE public.subscription_plans
SET api_enabled = TRUE, scim_enabled = TRUE
WHERE lower(plan_type) IN ('enterprise', 'professional')
  AND COALESCE(is_active, TRUE) = TRUE;

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('system.api.view', 'View public API usage', 'system',
   'See organisation API credentials, usage and failures (v1356)'),
  ('system.api.edit', 'Manage public API', 'system',
   'Change plan API/SCIM limits and revoke keys in an emergency (v1356)')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
  ('super_admin', 'system.api.view'),
  ('super_admin', 'system.api.edit'),
  ('system_admin', 'system.api.view'),
  ('system_admin', 'system.api.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_api_list_credentials(
  p_account_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.api.view', p_admin_user_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  PERFORM admin.log_admin_action(v_admin, 'api.list_credentials', 'api_credential', NULL,
    jsonb_build_object('account_id', p_account_id, 'reason', btrim(p_reason)), NULL, NULL);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
      SELECT c.id, c.account_id, c.credential_reference, c.name, c.key_prefix, c.scopes,
             c.expires_at, c.revoked_at, c.last_used_at, c.created_at
      FROM public.api_credentials c
      WHERE p_account_id IS NULL OR c.account_id = p_account_id
      ORDER BY c.created_at DESC
      LIMIT 500
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_api_revoke_credential(
  p_credential_id UUID,
  p_reason TEXT,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.api.edit', p_admin_user_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE public.api_credentials
  SET revoked_at = NOW(), updated_at = NOW()
  WHERE id = p_credential_id AND revoked_at IS NULL;
  PERFORM admin.log_admin_action(v_admin, 'api.revoke_credential', 'api_credential', p_credential_id,
    jsonb_build_object('reason', btrim(p_reason)), NULL, jsonb_build_object('revoked', TRUE));
  RETURN jsonb_build_object('credential_id', p_credential_id, 'revoked', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_api_set_plan_limits(
  p_plan_id UUID,
  p_api_enabled BOOLEAN,
  p_scim_enabled BOOLEAN,
  p_api_rate_per_minute INTEGER,
  p_api_rate_per_day INTEGER,
  p_scim_rate_per_minute INTEGER,
  p_reason TEXT,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.api.edit', p_admin_user_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE public.subscription_plans SET
    api_enabled = COALESCE(p_api_enabled, api_enabled),
    scim_enabled = COALESCE(p_scim_enabled, scim_enabled),
    api_rate_per_minute = COALESCE(p_api_rate_per_minute, api_rate_per_minute),
    api_rate_per_day = COALESCE(p_api_rate_per_day, api_rate_per_day),
    scim_rate_per_minute = COALESCE(p_scim_rate_per_minute, scim_rate_per_minute),
    updated_at = NOW()
  WHERE id = p_plan_id;
  PERFORM admin.log_admin_action(v_admin, 'api.set_plan_limits', 'subscription_plan', p_plan_id,
    jsonb_build_object('reason', btrim(p_reason)), NULL,
    jsonb_build_object('api_enabled', p_api_enabled, 'scim_enabled', p_scim_enabled));
  RETURN jsonb_build_object('plan_id', p_plan_id, 'updated', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_api_usage_summary(
  p_days INTEGER DEFAULT 7,
  p_reason TEXT DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.api.view', p_admin_user_id);
  v_days INTEGER := GREATEST(1, LEAST(COALESCE(p_days, 7), 90));
BEGIN
  IF NULLIF(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  PERFORM admin.log_admin_action(v_admin, 'api.usage_summary', 'api_request_log', NULL,
    jsonb_build_object('days', v_days, 'reason', btrim(p_reason)), NULL, NULL);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.calls DESC) FROM (
      SELECT l.account_id,
             count(*)::BIGINT AS calls,
             count(*) FILTER (WHERE l.status_code >= 400)::BIGINT AS errors
      FROM public.api_request_log l
      WHERE l.created_at >= NOW() - make_interval(days => v_days)
      GROUP BY l.account_id
      ORDER BY count(*) DESC
      LIMIT 200
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_api_list_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_api_revoke_credential FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_api_set_plan_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_api_usage_summary FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_api_list_credentials TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_api_revoke_credential TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_api_set_plan_limits TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_api_usage_summary TO authenticated;

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
)
VALUES (
    'a1b2c3d4-2601-4a1a-9c2a-1d7e5b926001'::uuid,
    'system-security:system:system:api-usage',
    'system-security:system',
    'item',
    'Public API',
    '/system/api-usage',
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    197,
    TRUE,
    NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    node_type = EXCLUDED.node_type,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;
