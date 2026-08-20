-- ============================================================================
-- v208: Admin CRUD for monorepo-owned industry/professional-role reference data
-- (v918 Phase 8 — see E:\project-nidus\projectplan\v918_saas_industry_tenant_provisioning_plan.md)
-- ============================================================================
-- industry_categories, industry_segments, industry_packs, industry_pack_menu_items, and
-- professional_roles all live in the MONOREPO's public schema (not admin) — see
-- E:\project-nidus\SQL\v906/v918/v919/v920. Per the cross-schema-write decision for this
-- phase: these RPCs live directly in `public` (same schema as the tables, same place as
-- provision_organisation_tenant/toggle_organisation_capability), each gated internally by
-- admin.check_admin_permission() — a public-schema function calling an admin-schema function
-- is the mirror image of the existing admin.publish_global_template -> public.sync_global_
-- template_node exception, and needs no proxy layer since these are pure reference-data
-- tables with no admin-specific business logic to layer on top.
--
-- "Delete" is soft (is_active = FALSE) for all 4 tables, never a hard DELETE: industry_
-- categories/industry_packs/professional_roles all have other tables' rows referencing them
-- (roles.industry_category_id, project_roles.industry_category_id, industry_segments FK ON
-- DELETE CASCADE, account_industries FK, users.professional_role_id FK) — a hard delete would
-- either cascade-destroy dependent rows or fail on FK violation. Matches the "disable-only"
-- philosophy already established for organisation_disabled_capabilities (PRD decision 7).
--
-- One shared permission pair covers all 4 tables (system.industries.view / .edit) — same
-- admin population as every other system-reference-data page (currencies, countries, ID
-- generation), not four separate permission keys for one cohesive admin domain.
-- Prerequisites: E:\project-nidus\SQL\v906, v918, v919, v920 (already applied to the shared
-- Supabase project), admin.check_admin_permission, admin.log_admin_action,
-- admin.current_admin_user_id (already exist)
-- ============================================================================

-- ── Permission keys ──────────────────────────────────────────────────────────

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('system.industries.view', 'View Industry Reference Data', 'system', 'View industry categories, segments, packs, and professional roles'),
  ('system.industries.edit', 'Edit Industry Reference Data', 'system', 'Create, update, and deactivate industry categories, segments, packs, and professional roles')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('system.industries.view', 'system.industries.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
  ('system_admin', 'system.industries.view'),
  ('system_admin', 'system.industries.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ============================================================================
-- professional_roles
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_professional_role(
  p_role_code VARCHAR(50),
  p_role_label VARCHAR(150),
  p_description TEXT DEFAULT NULL,
  p_display_order INTEGER DEFAULT 0,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_id UUID;
  v_new public.professional_roles%ROWTYPE;
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;
  IF trim(COALESCE(p_role_code, '')) = '' OR trim(COALESCE(p_role_label, '')) = '' THEN
    RAISE EXCEPTION 'role_code and role_label are required';
  END IF;

  INSERT INTO public.professional_roles (role_code, role_label, description, display_order)
  VALUES (lower(trim(p_role_code)), trim(p_role_label), NULLIF(trim(COALESCE(p_description, '')), ''), COALESCE(p_display_order, 0))
  RETURNING id INTO v_id;

  SELECT * INTO v_new FROM public.professional_roles WHERE id = v_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'professional_role.create', 'professional_role', v_id, NULL, NULL, to_jsonb(v_new));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_professional_role(
  p_id UUID,
  p_role_code VARCHAR(50) DEFAULT NULL,
  p_role_label VARCHAR(150) DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_display_order INTEGER DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_prev public.professional_roles%ROWTYPE;
  v_new public.professional_roles%ROWTYPE;
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;

  SELECT * INTO v_prev FROM public.professional_roles WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Professional role % not found', p_id;
  END IF;

  UPDATE public.professional_roles SET
    role_code = COALESCE(NULLIF(trim(p_role_code), ''), role_code),
    role_label = COALESCE(NULLIF(trim(p_role_label), ''), role_label),
    description = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description), '') ELSE description END,
    display_order = COALESCE(p_display_order, display_order),
    is_active = COALESCE(p_is_active, is_active),
    updated_by = v_admin_user_id,
    updated_at = NOW()
  WHERE id = p_id;

  SELECT * INTO v_new FROM public.professional_roles WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'professional_role.update', 'professional_role', p_id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_deactivate_professional_role(
  p_id UUID,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;

  UPDATE public.professional_roles
  SET is_active = FALSE, updated_by = v_admin_user_id, updated_at = NOW()
  WHERE id = p_id;

  PERFORM admin.log_admin_action(v_admin_user_id, 'professional_role.deactivate', 'professional_role', p_id, NULL, NULL, NULL);
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- industry_categories
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_industry_category(
  p_name VARCHAR(100),
  p_is_active BOOLEAN DEFAULT TRUE,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_id UUID;
  v_new public.industry_categories%ROWTYPE;
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;
  IF trim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  INSERT INTO public.industry_categories (name, is_active)
  VALUES (trim(p_name), COALESCE(p_is_active, TRUE))
  RETURNING id INTO v_id;

  SELECT * INTO v_new FROM public.industry_categories WHERE id = v_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_category.create', 'industry_category', v_id, NULL, NULL, to_jsonb(v_new));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_industry_category(
  p_id UUID,
  p_name VARCHAR(100) DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_prev public.industry_categories%ROWTYPE;
  v_new public.industry_categories%ROWTYPE;
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;

  SELECT * INTO v_prev FROM public.industry_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Industry category % not found', p_id;
  END IF;

  UPDATE public.industry_categories SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = NOW()
  WHERE id = p_id;

  SELECT * INTO v_new FROM public.industry_categories WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_category.update', 'industry_category', p_id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_deactivate_industry_category(
  p_id UUID,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;

  UPDATE public.industry_categories SET is_active = FALSE, updated_at = NOW() WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_category.deactivate', 'industry_category', p_id, NULL, NULL, NULL);
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- industry_segments
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_industry_segment(
  p_industry_category_id UUID,
  p_name VARCHAR(150),
  p_description TEXT DEFAULT NULL,
  p_display_order INTEGER DEFAULT 0,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_id UUID;
  v_new public.industry_segments%ROWTYPE;
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;
  IF p_industry_category_id IS NULL OR trim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'industry_category_id and name are required';
  END IF;

  INSERT INTO public.industry_segments (industry_category_id, name, description, display_order, created_by, updated_by)
  VALUES (p_industry_category_id, trim(p_name), NULLIF(trim(COALESCE(p_description, '')), ''), COALESCE(p_display_order, 0), v_admin_user_id, v_admin_user_id)
  RETURNING id INTO v_id;

  SELECT * INTO v_new FROM public.industry_segments WHERE id = v_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_segment.create', 'industry_segment', v_id, NULL, NULL, to_jsonb(v_new));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_industry_segment(
  p_id UUID,
  p_name VARCHAR(150) DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_display_order INTEGER DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_prev public.industry_segments%ROWTYPE;
  v_new public.industry_segments%ROWTYPE;
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;

  SELECT * INTO v_prev FROM public.industry_segments WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Industry segment % not found', p_id;
  END IF;

  UPDATE public.industry_segments SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    description = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description), '') ELSE description END,
    display_order = COALESCE(p_display_order, display_order),
    is_active = COALESCE(p_is_active, is_active),
    updated_by = v_admin_user_id,
    updated_at = NOW()
  WHERE id = p_id;

  SELECT * INTO v_new FROM public.industry_segments WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_segment.update', 'industry_segment', p_id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_deactivate_industry_segment(
  p_id UUID,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;

  UPDATE public.industry_segments SET is_active = FALSE, updated_by = v_admin_user_id, updated_at = NOW() WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_segment.deactivate', 'industry_segment', p_id, NULL, NULL, NULL);
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- industry_packs + industry_pack_menu_items
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_industry_pack(
  p_industry_category_id UUID,
  p_pack_code VARCHAR(50),
  p_pack_name VARCHAR(150),
  p_description TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_id UUID;
  v_new public.industry_packs%ROWTYPE;
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;
  IF p_industry_category_id IS NULL OR trim(COALESCE(p_pack_code, '')) = '' OR trim(COALESCE(p_pack_name, '')) = '' THEN
    RAISE EXCEPTION 'industry_category_id, pack_code, and pack_name are required';
  END IF;

  INSERT INTO public.industry_packs (industry_category_id, pack_code, pack_name, description, is_active, created_by, updated_by)
  VALUES (p_industry_category_id, lower(trim(p_pack_code)), trim(p_pack_name), NULLIF(trim(COALESCE(p_description, '')), ''), COALESCE(p_is_active, TRUE), v_admin_user_id, v_admin_user_id)
  RETURNING id INTO v_id;

  SELECT * INTO v_new FROM public.industry_packs WHERE id = v_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_pack.create', 'industry_pack', v_id, NULL, NULL, to_jsonb(v_new));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_industry_pack(
  p_id UUID,
  p_pack_name VARCHAR(150) DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_prev public.industry_packs%ROWTYPE;
  v_new public.industry_packs%ROWTYPE;
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;

  SELECT * INTO v_prev FROM public.industry_packs WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Industry pack % not found', p_id;
  END IF;

  UPDATE public.industry_packs SET
    pack_name = COALESCE(NULLIF(trim(p_pack_name), ''), pack_name),
    description = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description), '') ELSE description END,
    is_active = COALESCE(p_is_active, is_active),
    updated_by = v_admin_user_id,
    updated_at = NOW()
  WHERE id = p_id;

  SELECT * INTO v_new FROM public.industry_packs WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_pack.update', 'industry_pack', p_id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_deactivate_industry_pack(
  p_id UUID,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;

  UPDATE public.industry_packs SET is_active = FALSE, updated_by = v_admin_user_id, updated_at = NOW() WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin_user_id, 'industry_pack.deactivate', 'industry_pack', p_id, NULL, NULL, NULL);
  RETURN TRUE;
END;
$$;

-- Replace-all semantics: the picker UI sends the full desired menu_item_id set for a pack;
-- this diffs against what's currently stored and inserts/deletes only the difference.
CREATE OR REPLACE FUNCTION public.admin_set_industry_pack_menu_items(
  p_industry_pack_id UUID,
  p_menu_item_ids UUID[],
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
  v_ids UUID[] := COALESCE(p_menu_item_ids, ARRAY[]::UUID[]);
BEGIN
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, 'system.industries.edit') THEN
    RAISE EXCEPTION 'Permission denied: system.industries.edit required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.industry_packs WHERE id = p_industry_pack_id) THEN
    RAISE EXCEPTION 'Industry pack % not found', p_industry_pack_id;
  END IF;

  DELETE FROM public.industry_pack_menu_items
  WHERE industry_pack_id = p_industry_pack_id
    AND NOT (menu_item_id = ANY(v_ids));

  INSERT INTO public.industry_pack_menu_items (industry_pack_id, menu_item_id)
  SELECT p_industry_pack_id, m_id
  FROM unnest(v_ids) AS m_id
  ON CONFLICT (industry_pack_id, menu_item_id) DO NOTHING;

  PERFORM admin.log_admin_action(
    v_admin_user_id, 'industry_pack.set_menu_items', 'industry_pack', p_industry_pack_id,
    NULL, NULL, jsonb_build_object('menu_item_ids', v_ids)
  );
  RETURN TRUE;
END;
$$;

-- ── GRANT EXECUTE ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.admin_create_professional_role(VARCHAR, VARCHAR, TEXT, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_professional_role(UUID, VARCHAR, VARCHAR, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_deactivate_professional_role(UUID, UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_create_industry_category(VARCHAR, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_industry_category(UUID, VARCHAR, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_deactivate_industry_category(UUID, UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_create_industry_segment(UUID, VARCHAR, TEXT, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_industry_segment(UUID, VARCHAR, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_deactivate_industry_segment(UUID, UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_create_industry_pack(UUID, VARCHAR, VARCHAR, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_industry_pack(UUID, VARCHAR, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_deactivate_industry_pack(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_industry_pack_menu_items(UUID, UUID[], UUID) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'v208: Admin industry reference-data RPCs installed (public schema, admin.check_admin_permission-gated)';
END $$;
