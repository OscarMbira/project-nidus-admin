-- ============================================================================
-- v225: Admin editing of the public Nidus brand site (product cards + brand copy)
-- Monorepo plan: E:\project-nidus\projectplan\v1241_nidus_brand_site_plan.md (Slice 4)
-- Admin plan:    E:\project-nidus-admin\projectplans\v210_public_site_products_admin_plan.md
-- ============================================================================
-- public.site_products / public.site_content live in the MONOREPO's public schema
-- (E:\project-nidus\SQL\v1241_site_products_and_content.sql). Their RLS allows anon/authenticated
-- SELECT of active rows only and has NO write policies, so the only write path is these
-- SECURITY DEFINER RPCs. Same cross-schema pattern as v208 (public.admin_* functions gated by
-- admin.check_admin_permission and audited by admin.log_admin_action).
--
-- Narrow admin→public write exception: these two tables only. Documented in both CLAUDE.md files.
-- The 'admin' slug is refused: the Admin app is never listed on the public site.
-- Prerequisites: monorepo SQL v1241, admin.check_admin_permission, admin.log_admin_action,
-- admin.current_admin_user_id.
-- ============================================================================

-- ── Permission keys ──────────────────────────────────────────────────────────

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('system.public_site.view', 'View Public Site Content', 'system', 'View product cards and brand copy on the public Nidus brand site'),
  ('system.public_site.edit', 'Edit Public Site Content', 'system', 'Create, edit, reorder, activate and deactivate public brand site product cards and copy')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
  ('super_admin', 'system.public_site.view'),
  ('super_admin', 'system.public_site.edit'),
  ('system_admin', 'system.public_site.view'),
  ('system_admin', 'system.public_site.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── Helpers ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_require_public_site_permission(p_permission TEXT, p_admin_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_session_admin UUID := admin.current_admin_user_id();
  v_admin_user_id UUID;
BEGIN
  -- The acting admin comes from the caller's own session. A supplied p_admin_user_id is only
  -- honoured for the service role (server-side jobs); otherwise any signed-in user could pass a
  -- real admin's id and borrow that admin's permissions.
  IF p_admin_user_id IS NOT NULL AND p_admin_user_id IS DISTINCT FROM v_session_admin
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'p_admin_user_id must match the signed-in admin';
  END IF;
  v_admin_user_id := COALESCE(v_session_admin, p_admin_user_id);
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve acting admin user';
  END IF;
  IF NOT admin.check_admin_permission(v_admin_user_id, p_permission) THEN
    RAISE EXCEPTION 'Permission denied: % required', p_permission;
  END IF;
  RETURN v_admin_user_id;
END;
$$;

-- ── site_products ────────────────────────────────────────────────────────────

-- All rows, including inactive ones (the public read policy only exposes active rows).
CREATE OR REPLACE FUNCTION public.admin_list_site_products(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_products
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_products ORDER BY sort_order, lower(name), created_at;
END;
$$;

-- Create (p_id NULL) or update (p_id set). Returns the row id.
CREATE OR REPLACE FUNCTION public.admin_upsert_site_product(
  p_id UUID,
  p_slug TEXT,
  p_name TEXT,
  p_tagline TEXT,
  p_description TEXT,
  p_audience TEXT,
  p_landing_url TEXT,
  p_sign_in_url TEXT,
  p_sign_up_url TEXT,
  p_icon_key TEXT,
  p_accent_key TEXT,
  p_sort_order INTEGER,
  p_is_active BOOLEAN,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_slug TEXT := lower(trim(COALESCE(p_slug, '')));
  v_id UUID;
  v_prev public.site_products%ROWTYPE;
  v_new public.site_products%ROWTYPE;
BEGIN
  IF v_slug = '' OR trim(COALESCE(p_name, '')) = '' OR trim(COALESCE(p_landing_url, '')) = '' THEN
    RAISE EXCEPTION 'slug, name and landing_url are required';
  END IF;
  IF v_slug = 'admin' THEN
    RAISE EXCEPTION 'The Admin app is never listed on the public site';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.site_products
      (slug, name, tagline, description, audience, landing_url, sign_in_url, sign_up_url,
       icon_key, accent_key, sort_order, is_active, created_by, updated_by)
    VALUES
      (v_slug, trim(p_name), NULLIF(trim(COALESCE(p_tagline, '')), ''), NULLIF(trim(COALESCE(p_description, '')), ''),
       NULLIF(trim(COALESCE(p_audience, '')), ''), trim(p_landing_url), NULLIF(trim(COALESCE(p_sign_in_url, '')), ''),
       NULLIF(trim(COALESCE(p_sign_up_url, '')), ''), NULLIF(trim(COALESCE(p_icon_key, '')), ''),
       NULLIF(trim(COALESCE(p_accent_key, '')), ''), COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE), v_admin, v_admin)
    RETURNING id INTO v_id;
    SELECT * INTO v_new FROM public.site_products WHERE id = v_id;
    PERFORM admin.log_admin_action(v_admin, 'site_product.create', 'site_product', v_id, NULL, NULL, to_jsonb(v_new));
    RETURN v_id;
  END IF;

  SELECT * INTO v_prev FROM public.site_products WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site product % not found', p_id;
  END IF;

  UPDATE public.site_products SET
    slug = v_slug,
    name = trim(p_name),
    tagline = NULLIF(trim(COALESCE(p_tagline, '')), ''),
    description = NULLIF(trim(COALESCE(p_description, '')), ''),
    audience = NULLIF(trim(COALESCE(p_audience, '')), ''),
    landing_url = trim(p_landing_url),
    sign_in_url = NULLIF(trim(COALESCE(p_sign_in_url, '')), ''),
    sign_up_url = NULLIF(trim(COALESCE(p_sign_up_url, '')), ''),
    icon_key = NULLIF(trim(COALESCE(p_icon_key, '')), ''),
    accent_key = NULLIF(trim(COALESCE(p_accent_key, '')), ''),
    sort_order = COALESCE(p_sort_order, sort_order),
    is_active = COALESCE(p_is_active, is_active),
    updated_by = v_admin
  WHERE id = p_id;

  SELECT * INTO v_new FROM public.site_products WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'site_product.update', 'site_product', p_id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN p_id;
END;
$$;

-- Show/hide a card (used for the Planner launch switch). Never a hard delete.
CREATE OR REPLACE FUNCTION public.admin_set_site_product_active(p_id UUID, p_is_active BOOLEAN, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_prev public.site_products%ROWTYPE;
BEGIN
  SELECT * INTO v_prev FROM public.site_products WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site product % not found', p_id;
  END IF;
  UPDATE public.site_products SET is_active = p_is_active, updated_by = v_admin WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, CASE WHEN p_is_active THEN 'site_product.activate' ELSE 'site_product.deactivate' END,
    'site_product', p_id, NULL, jsonb_build_object('is_active', v_prev.is_active), jsonb_build_object('is_active', p_is_active));
  RETURN TRUE;
END;
$$;

-- ── site_content ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_site_content(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_content
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_content ORDER BY content_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_site_content(
  p_content_key TEXT,
  p_content_value TEXT,
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
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_key TEXT := lower(trim(COALESCE(p_content_key, '')));
  v_prev public.site_content%ROWTYPE;
  v_new public.site_content%ROWTYPE;
BEGIN
  IF v_key = '' THEN
    RAISE EXCEPTION 'content_key is required';
  END IF;
  SELECT * INTO v_prev FROM public.site_content WHERE content_key = v_key;

  INSERT INTO public.site_content (content_key, content_value, description, is_active, created_by, updated_by)
  VALUES (v_key, COALESCE(p_content_value, ''), NULLIF(trim(COALESCE(p_description, '')), ''), COALESCE(p_is_active, TRUE), v_admin, v_admin)
  ON CONFLICT (content_key) DO UPDATE SET
    content_value = EXCLUDED.content_value,
    description = COALESCE(EXCLUDED.description, public.site_content.description),
    is_active = EXCLUDED.is_active,
    updated_by = v_admin;

  SELECT * INTO v_new FROM public.site_content WHERE content_key = v_key;
  PERFORM admin.log_admin_action(v_admin, CASE WHEN v_prev.id IS NULL THEN 'site_content.create' ELSE 'site_content.update' END,
    'site_content', v_new.id, NULL, CASE WHEN v_prev.id IS NULL THEN NULL ELSE to_jsonb(v_prev) END, to_jsonb(v_new));
  RETURN v_new.id;
END;
$$;

-- ── GRANT EXECUTE ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.admin_require_public_site_permission(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_require_public_site_permission(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_site_products(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_site_product(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_site_product_active(UUID, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_site_content(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_site_content(TEXT, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;

-- ── Sidebar navigation (Content & Localization → Content) ─────────────────────

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
)
VALUES (
    'a1b2c3d4-2251-4a1a-9c2a-1d7e5b922501'::uuid,
    'content-localization:content:content:public-site',
    'content-localization:content',
    'item',
    'Public Site Products',
    '/content/public-site',
    ARRAY['/content/public-site-product', '/content/public-site-content']::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    160,
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

DO $$
BEGIN
  RAISE NOTICE 'v225: public brand site admin RPCs installed (system.public_site.view / .edit).';
END $$;
