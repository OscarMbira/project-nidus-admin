-- ============================================================================
-- v249: Consolidated role menus — Admin placement screens and the per-organisation switch
-- Admin plan: projectplans/v217_consolidated_menu_placements_admin_plan.md
-- Monorepo: projectprd/v1341 (D20, D21, D30, R1) / projectplan/v1341 Slice 13
-- Prerequisites: monorepo SQL v1449 (tables) …v1459; Admin v225 (admin_require_public_site_permission).
--
--   Permissions: system.menu_placements.view, system.menu_placements.edit
--   Read:   admin_list_menu_sections(app), admin_list_menu_slots(app),
--           admin_list_menu_placements(placement_key), admin_search_menu_items(search),
--           admin_list_account_menu_settings()
--   Write (reason required, audited; each write bumps public.menu_placement_version through the
--   v1449 triggers, so every sidebar refreshes its cached placements):
--           admin_upsert_menu_section, admin_upsert_menu_slot,
--           admin_upsert_menu_placement, admin_delete_menu_placement,
--           admin_set_menu_item_default_section,
--           admin_set_account_consolidated_menu(account, on)       one organisation (D20; rollback)
--           admin_set_consolidated_menu_all(on)                    every organisation at once (D30)
--
-- Narrow cross-schema exception (documented in both CLAUDE.md files, rule 34.5): Admin writes
-- public.menu_sections, public.menu_slots, public.menu_item_placements,
-- public.menu_items.default_section_code and public.account_menu_settings ONLY through these
-- SECURITY DEFINER RPCs. Those tables have no client write policies. Platform and Simulator never
-- write placements (D21).
-- Idempotent.
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('system.menu_placements.view', 'View Menu Placements', 'system', 'See where each menu item appears in the consolidated role sidebars, and which organisations have it on'),
  ('system.menu_placements.edit', 'Edit Menu Placements', 'system', 'Change sidebar sections, shared slots and placements, and turn the consolidated sidebar on or off per organisation (reason required, audited)')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
  ('super_admin', 'system.menu_placements.view'),
  ('super_admin', 'system.menu_placements.edit'),
  ('system_admin', 'system.menu_placements.view'),
  ('system_admin', 'system.menu_placements.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── Read ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_menu_sections(p_app TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.menu_sections
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.menu_placements.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.menu_sections s WHERE s.app = p_app ORDER BY s.is_footer, s.sort_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_menu_slots(p_app TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.menu_slots
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.menu_placements.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.menu_slots s WHERE s.app = p_app ORDER BY s.section_code, s.sort_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_menu_placements(p_placement_key TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID, menu_item_id UUID, menu_code TEXT, menu_label TEXT, route_path TEXT, placement_key TEXT,
  section_code TEXT, parent_menu_item_id UUID, parent_label TEXT, slot_key TEXT, sort_order INT, scope TEXT,
  is_active BOOLEAN, default_section_code TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.menu_placements.view', p_admin_user_id);
  RETURN QUERY
    SELECT p.id, p.menu_item_id, mi.menu_code::text, mi.menu_label::text, mi.route_path::text, p.placement_key,
           p.section_code, p.parent_menu_item_id, par.menu_label::text, p.slot_key, p.sort_order, p.scope,
           p.is_active, mi.default_section_code, p.created_at, p.updated_at
      FROM public.menu_item_placements p
      JOIN public.menu_items mi ON mi.id = p.menu_item_id
      LEFT JOIN public.menu_items par ON par.id = p.parent_menu_item_id
     WHERE p.placement_key = p_placement_key
     ORDER BY p.section_code, p.sort_order, mi.menu_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_search_menu_items(p_search TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, menu_code TEXT, menu_label TEXT, route_path TEXT, parent_label TEXT, default_section_code TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.menu_placements.view', p_admin_user_id);
  RETURN QUERY
    SELECT mi.id, mi.menu_code::text, mi.menu_label::text, mi.route_path::text, par.menu_label::text, mi.default_section_code
      FROM public.menu_items mi
      LEFT JOIN public.menu_items par ON par.id = mi.parent_menu_id
     WHERE mi.is_active = TRUE AND COALESCE(mi.is_deleted, FALSE) = FALSE
       AND mi.menu_code NOT LIKE 'pln\_%'
       AND (COALESCE(btrim(p_search), '') = ''
            OR mi.menu_label ILIKE '%' || p_search || '%' OR mi.menu_code ILIKE '%' || p_search || '%')
     ORDER BY mi.menu_label
     LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_account_menu_settings(p_admin_user_id UUID DEFAULT NULL)
RETURNS TABLE (account_id UUID, consolidated_menu_enabled BOOLEAN, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.menu_placements.view', p_admin_user_id);
  RETURN QUERY SELECT s.account_id, s.consolidated_menu_enabled, s.updated_at FROM public.account_menu_settings s;
END;
$$;

-- ── Write: sections and slots ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_menu_section(
  p_app TEXT, p_section_code TEXT, p_label TEXT, p_icon TEXT, p_sort_order INT, p_overflow_label TEXT,
  p_is_active BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.menu_placements.edit', p_admin_user_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF COALESCE(btrim(p_label), '') = '' THEN RAISE EXCEPTION 'A label is required'; END IF;
  INSERT INTO public.menu_sections (app, section_code, label, icon, sort_order, overflow_label, is_active)
  VALUES (p_app, p_section_code, btrim(p_label), NULLIF(btrim(p_icon), ''), COALESCE(p_sort_order, 0), NULLIF(btrim(p_overflow_label), ''), COALESCE(p_is_active, TRUE))
  ON CONFLICT (app, section_code) DO UPDATE SET
    label = EXCLUDED.label, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order,
    overflow_label = EXCLUDED.overflow_label, is_active = EXCLUDED.is_active, updated_at = NOW();
  PERFORM admin.log_admin_action(v_admin, 'menu_section.upsert', 'menu_section', NULL, jsonb_build_object('reason', p_reason),
                                 NULL, jsonb_build_object('app', p_app, 'section_code', p_section_code, 'label', p_label));
  RETURN jsonb_build_object('app', p_app, 'section_code', p_section_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_menu_slot(
  p_app TEXT, p_slot_key TEXT, p_label TEXT, p_section_code TEXT, p_sort_order INT, p_is_active BOOLEAN,
  p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.menu_placements.edit', p_admin_user_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_sections s WHERE s.app = p_app AND s.section_code = p_section_code) THEN
    RAISE EXCEPTION 'Unknown section %', p_section_code;
  END IF;
  INSERT INTO public.menu_slots (app, slot_key, label, section_code, sort_order, is_active)
  VALUES (p_app, p_slot_key, btrim(p_label), p_section_code, COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE))
  ON CONFLICT (app, slot_key) DO UPDATE SET
    label = EXCLUDED.label, section_code = EXCLUDED.section_code, sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active, updated_at = NOW();
  PERFORM admin.log_admin_action(v_admin, 'menu_slot.upsert', 'menu_slot', NULL, jsonb_build_object('reason', p_reason),
                                 NULL, jsonb_build_object('app', p_app, 'slot_key', p_slot_key, 'section_code', p_section_code));
  RETURN jsonb_build_object('app', p_app, 'slot_key', p_slot_key);
END;
$$;

-- ── Write: placements and default sections ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_menu_placement(
  p_menu_item_id UUID, p_placement_key TEXT, p_section_code TEXT, p_parent_menu_item_id UUID, p_slot_key TEXT,
  p_sort_order INT, p_scope TEXT, p_is_active BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.menu_placements.edit', p_admin_user_id);
  v_old JSONB;
  v_id UUID;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_items WHERE id = p_menu_item_id) THEN RAISE EXCEPTION 'Menu item not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_sections s WHERE s.section_code = p_section_code) THEN
    RAISE EXCEPTION 'Unknown section %', p_section_code;
  END IF;
  IF p_parent_menu_item_id = p_menu_item_id THEN RAISE EXCEPTION 'An item cannot be its own sub-menu parent'; END IF;
  v_old := (SELECT to_jsonb(p) FROM public.menu_item_placements p WHERE p.menu_item_id = p_menu_item_id AND p.placement_key = p_placement_key);
  INSERT INTO public.menu_item_placements (menu_item_id, placement_key, section_code, parent_menu_item_id, slot_key, sort_order, scope, is_active)
  VALUES (p_menu_item_id, p_placement_key, p_section_code, p_parent_menu_item_id, NULLIF(btrim(p_slot_key), ''),
          COALESCE(p_sort_order, 0), COALESCE(p_scope, 'project'), COALESCE(p_is_active, TRUE))
  ON CONFLICT (menu_item_id, placement_key) DO UPDATE SET
    section_code = EXCLUDED.section_code, parent_menu_item_id = EXCLUDED.parent_menu_item_id, slot_key = EXCLUDED.slot_key,
    sort_order = EXCLUDED.sort_order, scope = EXCLUDED.scope, is_active = EXCLUDED.is_active, updated_at = NOW();
  v_id := (SELECT p.id FROM public.menu_item_placements p WHERE p.menu_item_id = p_menu_item_id AND p.placement_key = p_placement_key);
  PERFORM admin.log_admin_action(v_admin, 'menu_placement.upsert', 'menu_placement', v_id, jsonb_build_object('reason', p_reason),
                                 v_old, jsonb_build_object('placement_key', p_placement_key, 'section_code', p_section_code,
                                   'slot_key', p_slot_key, 'sort_order', p_sort_order, 'scope', p_scope, 'is_active', p_is_active));
  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_menu_placement(p_placement_id UUID, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.menu_placements.edit', p_admin_user_id);
  v_old JSONB := (SELECT to_jsonb(p) FROM public.menu_item_placements p WHERE p.id = p_placement_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Placement not found'; END IF;
  DELETE FROM public.menu_item_placements WHERE id = p_placement_id;
  PERFORM admin.log_admin_action(v_admin, 'menu_placement.delete', 'menu_placement', p_placement_id, jsonb_build_object('reason', p_reason), v_old, NULL);
  RETURN jsonb_build_object('id', p_placement_id, 'deleted', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_menu_item_default_section(
  p_menu_item_id UUID, p_section_code TEXT, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.menu_placements.edit', p_admin_user_id);
  v_old TEXT := (SELECT default_section_code FROM public.menu_items WHERE id = p_menu_item_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF NULLIF(btrim(p_section_code), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.menu_sections s WHERE s.section_code = p_section_code) THEN
    RAISE EXCEPTION 'Unknown section %', p_section_code;
  END IF;
  UPDATE public.menu_items SET default_section_code = NULLIF(btrim(p_section_code), ''), updated_at = NOW() WHERE id = p_menu_item_id;
  PERFORM admin.log_admin_action(v_admin, 'menu_item.default_section', 'menu_item', p_menu_item_id, jsonb_build_object('reason', p_reason),
                                 jsonb_build_object('default_section_code', v_old), jsonb_build_object('default_section_code', p_section_code));
  RETURN jsonb_build_object('menu_item_id', p_menu_item_id, 'default_section_code', p_section_code);
END;
$$;

-- ── Write: the switch (D20 one organisation, D30 everyone) ───────────────────
CREATE OR REPLACE FUNCTION public.admin_set_account_consolidated_menu(
  p_account_id UUID, p_enabled BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.menu_placements.edit', p_admin_user_id);
  v_old BOOLEAN := (SELECT consolidated_menu_enabled FROM public.account_menu_settings WHERE account_id = p_account_id);
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  INSERT INTO public.account_menu_settings (account_id, consolidated_menu_enabled, updated_at, updated_by)
  VALUES (p_account_id, COALESCE(p_enabled, FALSE), NOW(), v_admin)
  ON CONFLICT (account_id) DO UPDATE SET
    consolidated_menu_enabled = EXCLUDED.consolidated_menu_enabled, updated_at = NOW(), updated_by = v_admin;
  PERFORM admin.log_admin_action(v_admin, CASE WHEN p_enabled THEN 'menu.consolidated_on' ELSE 'menu.consolidated_off' END,
                                 'account', p_account_id, jsonb_build_object('reason', p_reason),
                                 jsonb_build_object('enabled', COALESCE(v_old, FALSE)), jsonb_build_object('enabled', p_enabled));
  RETURN jsonb_build_object('account_id', p_account_id, 'enabled', p_enabled);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_consolidated_menu_all(p_enabled BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.menu_placements.edit', p_admin_user_id);
  v_count INT;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  INSERT INTO public.account_menu_settings (account_id, consolidated_menu_enabled, updated_at, updated_by)
  SELECT a.id, COALESCE(p_enabled, FALSE), NOW(), v_admin FROM public.accounts a
  ON CONFLICT (account_id) DO UPDATE SET
    consolidated_menu_enabled = EXCLUDED.consolidated_menu_enabled, updated_at = NOW(), updated_by = v_admin;
  v_count := (SELECT count(*) FROM public.accounts);
  PERFORM admin.log_admin_action(v_admin, CASE WHEN p_enabled THEN 'menu.consolidated_on_all' ELSE 'menu.consolidated_off_all' END,
                                 'account', NULL, jsonb_build_object('reason', p_reason, 'organisations', v_count),
                                 NULL, jsonb_build_object('enabled', p_enabled));
  RETURN jsonb_build_object('organisations', v_count, 'enabled', p_enabled);
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_upsert_menu_section(TEXT, TEXT, TEXT, TEXT, INT, TEXT, BOOLEAN, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_menu_slot(TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_menu_placement(UUID, TEXT, TEXT, UUID, TEXT, INT, TEXT, BOOLEAN, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_menu_placement(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_menu_item_default_section(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_account_consolidated_menu(UUID, BOOLEAN, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_consolidated_menu_all(BOOLEAN, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.admin_list_menu_sections(TEXT, UUID),
  public.admin_list_menu_slots(TEXT, UUID),
  public.admin_list_menu_placements(TEXT, UUID),
  public.admin_search_menu_items(TEXT, UUID),
  public.admin_list_account_menu_settings(UUID),
  public.admin_upsert_menu_section(TEXT, TEXT, TEXT, TEXT, INT, TEXT, BOOLEAN, TEXT, UUID),
  public.admin_upsert_menu_slot(TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN, TEXT, UUID),
  public.admin_upsert_menu_placement(UUID, TEXT, TEXT, UUID, TEXT, INT, TEXT, BOOLEAN, TEXT, UUID),
  public.admin_delete_menu_placement(UUID, TEXT, UUID),
  public.admin_set_menu_item_default_section(UUID, TEXT, TEXT, UUID),
  public.admin_set_account_consolidated_menu(UUID, BOOLEAN, TEXT, UUID),
  public.admin_set_consolidated_menu_all(BOOLEAN, TEXT, UUID)
TO authenticated, service_role;

-- ── Admin sidebar ────────────────────────────────────────────────────────────
INSERT INTO admin.nav_nodes (id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
VALUES
  ('a1b2c3d4-2491-4a1a-9c2a-1d7e5b924901'::uuid, 'system-security:system:system:menu-placements', 'system-security:system', 'item',
   'Menu Placements', '/system/menu-placements', ARRAY['/system/menu-placement-form']::text[],
   ARRAY['super_admin', 'system_admin']::text[], 195, TRUE, NULL),
  ('a1b2c3d4-2491-4a1a-9c2a-1d7e5b924902'::uuid, 'system-security:system:system:menu-sections', 'system-security:system', 'item',
   'Menu Sections & Slots', '/system/menu-sections', ARRAY['/system/menu-section-form']::text[],
   ARRAY['super_admin', 'system_admin']::text[], 196, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, path = EXCLUDED.path, active_paths = EXCLUDED.active_paths,
  roles = EXCLUDED.roles, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v249 applied: consolidated menu placement RPCs, switch RPCs, nav nodes'; END $$;
