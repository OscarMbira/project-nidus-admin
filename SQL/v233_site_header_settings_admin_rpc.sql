-- ============================================================================
-- v233: Admin editing of the public headers' colours and primary button
-- Monorepo PRD/plan: E:\project-nidus\projectprd\v1264_product_led_site_headers_PRD.md
--                    E:\project-nidus\projectplan\v1264_product_led_site_headers_plan.md
-- Admin plan:        E:\project-nidus-admin\projectplans\v215_site_header_settings_admin_plan.md
-- ============================================================================
-- Table lives in the MONOREPO's public schema (E:\project-nidus\SQL\v1264_site_header_settings.sql):
--   site_header_settings (public read of active rows, no client writes; WCAG AA CHECKs).
-- Same narrow admin→public pattern as v225/v230: public.admin_* SECURITY DEFINER functions gated
-- by system.public_site.view / .edit and audited by admin.log_admin_action.
-- Prerequisites: monorepo SQL v1264, Admin SQL v225 + v230. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_site_header_settings(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_header_settings
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_header_settings ORDER BY (scope_slug <> 'brand'), scope_slug, created_at;
END;
$$;

-- Create or update the settings of one header. Scope: 'brand' (brand site) or a public product slug.
-- cta_url blank → brand: the "Which product?" chooser; product: its sign-up page.
CREATE OR REPLACE FUNCTION public.admin_upsert_site_header_settings(
  p_scope_slug TEXT,
  p_bg_color TEXT,
  p_text_color TEXT,
  p_accent_color TEXT,
  p_cta_text_color TEXT,
  p_cta_label TEXT,
  p_cta_url TEXT,
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
  v_scope TEXT := lower(trim(COALESCE(p_scope_slug, '')));
  v_bg TEXT := upper(trim(COALESCE(p_bg_color, '')));
  v_text TEXT := upper(trim(COALESCE(p_text_color, '')));
  v_accent TEXT := upper(trim(COALESCE(p_accent_color, '')));
  v_cta_text TEXT := upper(trim(COALESCE(p_cta_text_color, '')));
  v_label TEXT := trim(COALESCE(p_cta_label, ''));
  v_url TEXT := NULLIF(trim(COALESCE(p_cta_url, '')), '');
  v_ratio NUMERIC;
  v_id UUID;
  v_prev public.site_header_settings%ROWTYPE;
  v_new public.site_header_settings%ROWTYPE;
BEGIN
  IF v_scope <> 'brand' AND NOT EXISTS (SELECT 1 FROM public.site_products WHERE slug = v_scope AND slug <> 'admin') THEN
    RAISE EXCEPTION 'Unknown header %: use brand or a public product', v_scope;
  END IF;
  IF v_bg !~ '^#[0-9A-F]{6}$' OR v_text !~ '^#[0-9A-F]{6}$' OR v_accent !~ '^#[0-9A-F]{6}$' OR v_cta_text !~ '^#[0-9A-F]{6}$' THEN
    RAISE EXCEPTION 'Colours must be 6-digit hex values such as #0B1220';
  END IF;
  v_ratio := public.site_color_contrast(v_text, v_bg);
  IF v_ratio < 4.5 THEN
    RAISE EXCEPTION 'Text on the background is hard to read (contrast %:1, needs at least 4.5:1)', v_ratio;
  END IF;
  v_ratio := public.site_color_contrast(v_cta_text, v_accent);
  IF v_ratio < 4.5 THEN
    RAISE EXCEPTION 'Button text on the accent colour is hard to read (contrast %:1, needs at least 4.5:1)', v_ratio;
  END IF;
  IF v_label = '' OR length(v_label) > 40 THEN
    RAISE EXCEPTION 'The button label is required (up to 40 characters)';
  END IF;
  IF v_url IS NOT NULL AND (length(v_url) > 500 OR v_url !~* '^(https?://\S+|/\S*)$') THEN
    RAISE EXCEPTION 'The button address must start with https:// or / (a page inside the product)';
  END IF;

  SELECT * INTO v_prev FROM public.site_header_settings WHERE scope_slug = v_scope;
  IF NOT FOUND THEN
    INSERT INTO public.site_header_settings
      (scope_slug, bg_color, text_color, accent_color, cta_text_color, cta_label, cta_url, is_active, created_by, updated_by)
    VALUES (v_scope, v_bg, v_text, v_accent, v_cta_text, v_label, v_url, COALESCE(p_is_active, TRUE), v_admin, v_admin)
    RETURNING id INTO v_id;
    SELECT * INTO v_new FROM public.site_header_settings WHERE id = v_id;
    PERFORM admin.log_admin_action(v_admin, 'site_header_settings.create', 'site_header_settings', v_id, NULL, NULL, to_jsonb(v_new));
    RETURN v_id;
  END IF;

  UPDATE public.site_header_settings SET
    bg_color = v_bg,
    text_color = v_text,
    accent_color = v_accent,
    cta_text_color = v_cta_text,
    cta_label = v_label,
    cta_url = v_url,
    is_active = COALESCE(p_is_active, is_active),
    updated_by = v_admin
  WHERE id = v_prev.id;
  SELECT * INTO v_new FROM public.site_header_settings WHERE id = v_prev.id;
  PERFORM admin.log_admin_action(v_admin, 'site_header_settings.update', 'site_header_settings', v_prev.id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN v_prev.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_site_header_settings(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_site_header_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_site_header_settings(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_site_header_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;

-- ── Sidebar navigation (Content & Localization → Content) ─────────────────────
INSERT INTO admin.nav_nodes (id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
VALUES
  ('a1b2c3d4-2330-4a1a-9c2a-1d7e5b923301'::uuid, 'content-localization:content:content:site-headers',
   'content-localization:content', 'item', 'Public Site Headers', '/content/site-headers',
   ARRAY['/content/site-header']::text[], ARRAY['super_admin', 'system_admin']::text[], 166, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key,
  label = EXCLUDED.label,
  path = EXCLUDED.path,
  active_paths = EXCLUDED.active_paths,
  roles = EXCLUDED.roles,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';

SELECT 'v233 applied' AS status,
       (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN ('admin_list_site_header_settings', 'admin_upsert_site_header_settings')) AS functions_present_of_2,
       (SELECT COUNT(*) FROM admin.nav_nodes WHERE node_key = 'content-localization:content:content:site-headers') AS menu_items_of_1;
