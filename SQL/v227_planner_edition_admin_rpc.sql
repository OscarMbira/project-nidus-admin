-- ============================================================================
-- v227: Project Planner — Admin edition controls (monorepo plan v1239 Slice 8.4, D13)
-- Admin plan: projectplans/v211_planner_edition_admin_plan.md
--
--   * Permissions: accounts.edition.change, system.planner_menu.edit
--   * public.admin_change_account_edition(account, edition, reason)   audited edition switch
--       → calls public.apply_account_edition (monorepo SQL v1247; not callable by any client)
--   * public.admin_list_planner_menu_items()                          pln_ menus + allow-list flag
--   * public.admin_set_menu_planner_available(menu_item, on, reason)  writes planner_menu_allowlist
--   * admin.feature_flags 'planner_public_signup' (OFF) — the Planner sign-up kill switch (D18)
--
-- Narrow cross-schema exception (documented in both CLAUDE.md files, like v225/v765/v779):
-- Admin writes public.accounts.product_edition and public.planner_menu_allowlist ONLY through
-- these SECURITY DEFINER RPCs, gated by the permissions above and audited.
-- Prerequisites: monorepo SQL v1247 + v1249; Admin v225 (admin_require_public_site_permission).
-- Idempotent.
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('accounts.edition.change', 'Change Account Edition', 'accounts', 'Switch an organisation between the full PMIS and the Project Planner edition (reason required, audited)'),
  ('system.planner_menu.edit', 'Edit Planner Menu Availability', 'system', 'Choose which pln_ menu items Project Planner workspaces can see')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
  ('super_admin', 'accounts.edition.change'),
  ('super_admin', 'system.planner_menu.edit'),
  ('system_admin', 'system.planner_menu.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── Edition change ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_change_account_edition(
  p_account_id UUID, p_edition TEXT, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('accounts.edition.change', p_admin_user_id);
  v_result JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_result := public.apply_account_edition(p_account_id, p_edition, p_reason, 'admin', NULL);
  PERFORM admin.log_admin_action(v_admin, 'account.edition_change', 'account', p_account_id, jsonb_build_object('reason', p_reason),
                                 jsonb_build_object('edition', v_result ->> 'from'), jsonb_build_object('edition', p_edition));
  RETURN v_result;
END;
$$;

-- ── Planner menu availability ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_planner_menu_items(p_admin_user_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, menu_code TEXT, menu_label TEXT, route_path TEXT, parent_label TEXT, sort_order INT, is_available BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.planner_menu.edit', p_admin_user_id);
  RETURN QUERY
    SELECT mi.id, mi.menu_code::text, mi.menu_label::text, mi.route_path::text, p.menu_label::text, mi.sort_order,
           EXISTS (SELECT 1 FROM public.planner_menu_allowlist a WHERE a.menu_item_id = mi.id)
      FROM public.menu_items mi
      LEFT JOIN public.menu_items p ON p.id = mi.parent_menu_id
     WHERE mi.menu_code LIKE 'pln\_%' AND COALESCE(mi.is_deleted, FALSE) = FALSE
     ORDER BY COALESCE(p.sort_order, mi.sort_order), mi.parent_menu_id NULLS FIRST, mi.sort_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_menu_planner_available(
  p_menu_item_id UUID, p_available BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.planner_menu.edit', p_admin_user_id);
  v_code TEXT;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT menu_code INTO v_code FROM public.menu_items WHERE id = p_menu_item_id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'Menu item not found'; END IF;
  IF v_code NOT LIKE 'pln\_%' THEN RAISE EXCEPTION 'Only Project Planner (pln_) menu items can be made available in the Planner'; END IF;
  IF p_available THEN
    INSERT INTO public.planner_menu_allowlist (menu_item_id, menu_code, added_by) VALUES (p_menu_item_id, v_code, v_admin)
    ON CONFLICT (menu_item_id) DO NOTHING;
  ELSE
    DELETE FROM public.planner_menu_allowlist WHERE menu_item_id = p_menu_item_id;
  END IF;
  PERFORM admin.log_admin_action(v_admin, CASE WHEN p_available THEN 'planner_menu.enable' ELSE 'planner_menu.disable' END,
                                 'menu_item', p_menu_item_id, jsonb_build_object('reason', p_reason), NULL, jsonb_build_object('menu_code', v_code, 'available', p_available));
  RETURN jsonb_build_object('menu_item_id', p_menu_item_id, 'available', p_available);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_account_edition(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_menu_planner_available(UUID, BOOLEAN, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_account_edition(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_planner_menu_items(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_menu_planner_available(UUID, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

-- ── Sign-up kill switch (D18): OFF until launch ──────────────────────────────
INSERT INTO admin.feature_flags (flag_key, flag_name, description, applies_to, is_enabled, updated_at)
SELECT 'planner_public_signup', 'Project Planner public sign-up',
       'When on, anyone can start a Project Planner trial at planner.<domain>/signup. Turning it off hides sign-up within one page load; existing planner users are unaffected.',
       'platform', FALSE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM admin.feature_flags WHERE flag_key = 'planner_public_signup');

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v227 applied: planner edition + menu availability RPCs, planner_public_signup flag (off)'; END $$;
