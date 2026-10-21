-- ============================================================================
-- v242: Register custom-field limit — Admin controls (monorepo PRD/plan v1311, D6/D15)
-- Admin plan: projectplans/v216_local_register_custom_field_limit_admin_plan.md
--
--   * Permissions: system.register_custom_fields.view, system.register_custom_fields.edit
--   * public.admin_register_custom_field_get_settings()                     default + overrides
--   * public.admin_register_custom_field_set_default(limit, reason)          global default (1–200)
--   * public.admin_register_custom_field_set_override(account, limit, reason) per-organisation
--   * public.admin_register_custom_field_remove_override(account, reason)
--   * public.admin_register_custom_field_search_accounts(search)            organisation picker
--   * admin.nav_nodes: System › Register Custom Field Limits (/system/register-custom-fields)
--
-- Narrow cross-schema exception (documented in both CLAUDE.md files, like v225/v227/v236):
-- Admin writes public.local_register_custom_field_settings and
-- public.local_register_custom_field_limit_overrides ONLY through these SECURITY DEFINER RPCs,
-- gated by the permissions above and audited in admin.log_admin_action (reason required).
-- Prerequisites: monorepo SQL v1311; Admin v225 (admin_require_public_site_permission).
-- Idempotent.
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('system.register_custom_fields.view', 'View Register Custom Field Limits', 'system',
   'See the maximum number of custom fields organisations may add to each local register'),
  ('system.register_custom_fields.edit', 'Edit Register Custom Field Limits', 'system',
   'Change the default and per-organisation custom-field limits for local registers (reason required, audited)')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
  ('super_admin', 'system.register_custom_fields.view'),
  ('super_admin', 'system.register_custom_fields.edit'),
  ('system_admin', 'system.register_custom_fields.view'),
  ('system_admin', 'system.register_custom_fields.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── Read ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_register_custom_field_get_settings(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.register_custom_fields.view', p_admin_user_id);
  RETURN jsonb_build_object(
    'default_limit', COALESCE((SELECT default_limit FROM public.local_register_custom_field_settings WHERE id), 30),
    'updated_at', (SELECT updated_at FROM public.local_register_custom_field_settings WHERE id),
    'overrides', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'account_id', o.account_id,
               'account_name', COALESCE(a.account_display_name, a.account_name, a.company_name),
               'account_code', a.account_code,
               'field_limit', o.field_limit,
               'reason', o.reason,
               'updated_at', o.updated_at
             ) ORDER BY lower(COALESCE(a.account_display_name, a.account_name, a.company_name)), o.updated_at)
      FROM public.local_register_custom_field_limit_overrides o
      JOIN public.accounts a ON a.id = o.account_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_register_custom_field_search_accounts(p_search TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, account_name TEXT, account_code TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.register_custom_fields.view', p_admin_user_id);
  RETURN QUERY
    SELECT a.id, COALESCE(a.account_display_name, a.account_name, a.company_name)::text, a.account_code::text
      FROM public.accounts a
     WHERE COALESCE(a.is_deleted, FALSE) = FALSE
       AND (COALESCE(btrim(p_search), '') = ''
            OR COALESCE(a.account_display_name, a.account_name, a.company_name, '') ILIKE '%' || btrim(p_search) || '%'
            OR COALESCE(a.account_code, '') ILIKE '%' || btrim(p_search) || '%')
     ORDER BY lower(COALESCE(a.account_display_name, a.account_name, a.company_name)), a.created_at
     LIMIT 25;
END;
$$;

-- ── Write ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_register_custom_field_set_default(
  p_limit INTEGER, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin  UUID := public.admin_require_public_site_permission('system.register_custom_fields.edit', p_admin_user_id);
  v_before INTEGER;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN RAISE EXCEPTION 'The limit must be between 1 and 200'; END IF;
  SELECT default_limit INTO v_before FROM public.local_register_custom_field_settings WHERE id;
  INSERT INTO public.local_register_custom_field_settings (id, default_limit, updated_at, updated_by_admin)
  VALUES (TRUE, p_limit, NOW(), v_admin)
  ON CONFLICT (id) DO UPDATE SET default_limit = EXCLUDED.default_limit, updated_at = NOW(), updated_by_admin = v_admin;
  PERFORM admin.log_admin_action(v_admin, 'register_custom_fields.default_limit', 'system_setting', NULL,
                                 jsonb_build_object('reason', p_reason),
                                 jsonb_build_object('default_limit', v_before), jsonb_build_object('default_limit', p_limit));
  RETURN jsonb_build_object('default_limit', p_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_register_custom_field_set_override(
  p_account_id UUID, p_limit INTEGER, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin  UUID := public.admin_require_public_site_permission('system.register_custom_fields.edit', p_admin_user_id);
  v_before INTEGER;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN RAISE EXCEPTION 'The limit must be between 1 and 200'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id AND COALESCE(is_deleted, FALSE) = FALSE) THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;
  SELECT field_limit INTO v_before FROM public.local_register_custom_field_limit_overrides WHERE account_id = p_account_id;
  INSERT INTO public.local_register_custom_field_limit_overrides (account_id, field_limit, reason, updated_at, updated_by_admin)
  VALUES (p_account_id, p_limit, p_reason, NOW(), v_admin)
  ON CONFLICT (account_id) DO UPDATE SET field_limit = EXCLUDED.field_limit, reason = EXCLUDED.reason,
                                         updated_at = NOW(), updated_by_admin = v_admin;
  PERFORM admin.log_admin_action(v_admin, 'register_custom_fields.override_set', 'account', p_account_id,
                                 jsonb_build_object('reason', p_reason),
                                 jsonb_build_object('field_limit', v_before), jsonb_build_object('field_limit', p_limit));
  RETURN jsonb_build_object('account_id', p_account_id, 'field_limit', p_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_register_custom_field_remove_override(
  p_account_id UUID, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin  UUID := public.admin_require_public_site_permission('system.register_custom_fields.edit', p_admin_user_id);
  v_before INTEGER;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  DELETE FROM public.local_register_custom_field_limit_overrides WHERE account_id = p_account_id
  RETURNING field_limit INTO v_before;
  IF v_before IS NULL THEN RAISE EXCEPTION 'This organisation has no override'; END IF;
  PERFORM admin.log_admin_action(v_admin, 'register_custom_fields.override_removed', 'account', p_account_id,
                                 jsonb_build_object('reason', p_reason),
                                 jsonb_build_object('field_limit', v_before), NULL);
  RETURN jsonb_build_object('account_id', p_account_id, 'removed', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_register_custom_field_set_default(INTEGER, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_register_custom_field_set_override(UUID, INTEGER, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_register_custom_field_remove_override(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_register_custom_field_get_settings(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_register_custom_field_search_accounts(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_register_custom_field_set_default(INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_register_custom_field_set_override(UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_register_custom_field_remove_override(UUID, TEXT, UUID) TO authenticated, service_role;

-- ── Navigation: System › Register Custom Field Limits (same parent as v228 Planner Menu) ──
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
)
VALUES (
    'a1b2c3d4-2421-4a1a-9c2a-1d7e5b924201'::uuid,
    'system-security:system:system:register-custom-fields',
    'system-security:system',
    'item',
    'Register Custom Field Limits',
    '/system/register-custom-fields',
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    195,
    TRUE,
    NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v242 applied: register custom-field limit admin RPCs + permissions'; END $$;
