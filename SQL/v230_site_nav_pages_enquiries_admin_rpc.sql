-- ============================================================================
-- v230: Admin editing of the brand site's navigation, common pages and enquiries
-- Monorepo plan: E:\project-nidus\projectplan\v1241_nidus_brand_site_plan.md (Amendment A, A6)
-- Admin plan:    E:\project-nidus-admin\projectplans\v212_public_site_pages_and_enquiries_admin_plan.md
-- ============================================================================
-- Tables live in the MONOREPO's public schema (E:\project-nidus\SQL\v1260_site_nav_pages_and_enquiries.sql):
--   site_nav_links, site_pages (public read of active rows, no client writes)
--   site_enquiries (no client privileges at all)
--   site_products.pricing_url / docs_url (new columns)
-- Same narrow admin→public pattern as v225: public.admin_* SECURITY DEFINER functions gated by
-- system.public_site.view / .edit (v225) and audited by admin.log_admin_action.
-- Prerequisites: monorepo SQL v1260, Admin SQL v225. Idempotent.
-- ============================================================================

-- ── site_products: replace the upsert so it also saves pricing_url / docs_url ──
DROP FUNCTION IF EXISTS public.admin_upsert_site_product(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, UUID);

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
  p_pricing_url TEXT DEFAULT NULL,
  p_docs_url TEXT DEFAULT NULL,
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
       icon_key, accent_key, sort_order, is_active, pricing_url, docs_url, created_by, updated_by)
    VALUES
      (v_slug, trim(p_name), NULLIF(trim(COALESCE(p_tagline, '')), ''), NULLIF(trim(COALESCE(p_description, '')), ''),
       NULLIF(trim(COALESCE(p_audience, '')), ''), trim(p_landing_url), NULLIF(trim(COALESCE(p_sign_in_url, '')), ''),
       NULLIF(trim(COALESCE(p_sign_up_url, '')), ''), NULLIF(trim(COALESCE(p_icon_key, '')), ''),
       NULLIF(trim(COALESCE(p_accent_key, '')), ''), COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE),
       NULLIF(trim(COALESCE(p_pricing_url, '')), ''), NULLIF(trim(COALESCE(p_docs_url, '')), ''), v_admin, v_admin)
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
    pricing_url = NULLIF(trim(COALESCE(p_pricing_url, '')), ''),
    docs_url = NULLIF(trim(COALESCE(p_docs_url, '')), ''),
    updated_by = v_admin
  WHERE id = p_id;

  SELECT * INTO v_new FROM public.site_products WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'site_product.update', 'site_product', p_id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN p_id;
END;
$$;

-- ── site_nav_links ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_site_nav_links(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_nav_links
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_nav_links ORDER BY nav_group, sort_order, lower(label), created_at;
END;
$$;

-- Create (p_id NULL) or update. A link targets either a brand-site page (p_page_slug) or an
-- address (p_url: https://… in another app, or an in-app path '/…' for a product bar).
CREATE OR REPLACE FUNCTION public.admin_upsert_site_nav_link(
  p_id UUID,
  p_link_key TEXT,
  p_nav_group TEXT,
  p_label TEXT,
  p_description TEXT,
  p_page_slug TEXT,
  p_url TEXT,
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
  v_key TEXT := lower(trim(COALESCE(p_link_key, '')));
  v_group TEXT := lower(trim(COALESCE(p_nav_group, '')));
  v_slug TEXT := NULLIF(lower(trim(COALESCE(p_page_slug, ''))), '');
  v_url TEXT := NULLIF(trim(COALESCE(p_url, '')), '');
  v_id UUID;
  v_prev public.site_nav_links%ROWTYPE;
  v_new public.site_nav_links%ROWTYPE;
BEGIN
  IF v_key = '' OR trim(COALESCE(p_label, '')) = '' OR v_group = '' THEN
    RAISE EXCEPTION 'Key, menu and label are required';
  END IF;
  IF (v_slug IS NULL) = (v_url IS NULL) THEN
    RAISE EXCEPTION 'Choose either a site page or an address, not both';
  END IF;
  IF v_url IS NOT NULL AND v_url !~* '^(https?://\S+|/\S*)$' THEN
    RAISE EXCEPTION 'The address must start with https:// (another app) or / (a page inside the product)';
  END IF;
  IF v_slug IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.site_pages WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'There is no site page with slug %', v_slug;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.site_nav_links (link_key, nav_group, label, description, page_slug, url, sort_order, is_active, created_by, updated_by)
    VALUES (v_key, v_group, trim(p_label), NULLIF(trim(COALESCE(p_description, '')), ''), v_slug, v_url,
            COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE), v_admin, v_admin)
    RETURNING id INTO v_id;
    SELECT * INTO v_new FROM public.site_nav_links WHERE id = v_id;
    PERFORM admin.log_admin_action(v_admin, 'site_nav_link.create', 'site_nav_link', v_id, NULL, NULL, to_jsonb(v_new));
    RETURN v_id;
  END IF;

  SELECT * INTO v_prev FROM public.site_nav_links WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site link % not found', p_id;
  END IF;
  UPDATE public.site_nav_links SET
    link_key = v_key,
    nav_group = v_group,
    label = trim(p_label),
    description = NULLIF(trim(COALESCE(p_description, '')), ''),
    page_slug = v_slug,
    url = v_url,
    sort_order = COALESCE(p_sort_order, sort_order),
    is_active = COALESCE(p_is_active, is_active),
    updated_by = v_admin
  WHERE id = p_id;
  SELECT * INTO v_new FROM public.site_nav_links WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'site_nav_link.update', 'site_nav_link', p_id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_site_nav_link(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_prev public.site_nav_links%ROWTYPE;
BEGIN
  SELECT * INTO v_prev FROM public.site_nav_links WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site link % not found', p_id;
  END IF;
  DELETE FROM public.site_nav_links WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'site_nav_link.delete', 'site_nav_link', p_id, NULL, to_jsonb(v_prev), NULL);
  RETURN TRUE;
END;
$$;

-- ── site_pages ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_site_pages(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_pages
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_pages ORDER BY lower(title), created_at;
END;
$$;

-- Create (p_id NULL) or update. Pages are hidden (is_active false), never deleted, so links that
-- point at them can't break silently (the site hides links to inactive pages).
CREATE OR REPLACE FUNCTION public.admin_upsert_site_page(
  p_id UUID,
  p_slug TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_body_md TEXT,
  p_page_kind TEXT,
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
  v_prev public.site_pages%ROWTYPE;
  v_new public.site_pages%ROWTYPE;
BEGIN
  IF v_slug = '' OR trim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Slug and title are required';
  END IF;
  IF v_slug IN ('pricing', 'index', 'assets') THEN
    RAISE EXCEPTION 'The slug % is reserved by the site', v_slug;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.site_pages (slug, title, summary, body_md, page_kind, sort_order, is_active, created_by, updated_by)
    VALUES (v_slug, trim(p_title), NULLIF(trim(COALESCE(p_summary, '')), ''), COALESCE(p_body_md, ''),
            COALESCE(NULLIF(p_page_kind, ''), 'page'), COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE), v_admin, v_admin)
    RETURNING id INTO v_id;
    SELECT * INTO v_new FROM public.site_pages WHERE id = v_id;
    PERFORM admin.log_admin_action(v_admin, 'site_page.create', 'site_page', v_id, NULL, NULL, to_jsonb(v_new));
    RETURN v_id;
  END IF;

  SELECT * INTO v_prev FROM public.site_pages WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site page % not found', p_id;
  END IF;
  UPDATE public.site_pages SET
    slug = v_slug,
    title = trim(p_title),
    summary = NULLIF(trim(COALESCE(p_summary, '')), ''),
    body_md = COALESCE(p_body_md, ''),
    page_kind = COALESCE(NULLIF(p_page_kind, ''), page_kind),
    sort_order = COALESCE(p_sort_order, sort_order),
    is_active = COALESCE(p_is_active, is_active),
    updated_by = v_admin
  WHERE id = p_id;
  -- Keep links pointing at a renamed page.
  IF v_prev.slug IS DISTINCT FROM v_slug THEN
    UPDATE public.site_nav_links SET page_slug = v_slug, updated_by = v_admin WHERE page_slug = v_prev.slug;
  END IF;
  SELECT * INTO v_new FROM public.site_pages WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'site_page.update', 'site_page', p_id, NULL, to_jsonb(v_prev), to_jsonb(v_new));
  RETURN p_id;
END;
$$;

-- ── site_enquiries ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_site_enquiries(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_enquiries
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_enquiries ORDER BY created_at DESC LIMIT 2000;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_site_enquiry_status(p_id UUID, p_status TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_prev TEXT;
BEGIN
  IF p_status NOT IN ('new', 'in_progress', 'answered', 'closed', 'spam') THEN
    RAISE EXCEPTION 'Unknown status %', p_status;
  END IF;
  SELECT status INTO v_prev FROM public.site_enquiries WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enquiry % not found', p_id;
  END IF;
  UPDATE public.site_enquiries SET status = p_status, handled_by = v_admin, handled_at = NOW() WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'site_enquiry.status', 'site_enquiry', p_id, NULL,
    jsonb_build_object('status', v_prev), jsonb_build_object('status', p_status));
  RETURN TRUE;
END;
$$;

-- ── GRANT EXECUTE ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.admin_upsert_site_product(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_site_nav_links(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_site_nav_link(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_site_nav_link(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_site_pages(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_site_page(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_site_enquiries(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_site_enquiry_status(UUID, TEXT, UUID) TO authenticated, service_role;

-- ── Sidebar navigation (Content & Localization → Content) ─────────────────────

INSERT INTO admin.nav_nodes (id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
VALUES
  ('a1b2c3d4-2302-4a1a-9c2a-1d7e5b923001'::uuid, 'content-localization:content:content:public-site-pages',
   'content-localization:content', 'item', 'Public Site Pages & Menus', '/content/public-site-pages',
   ARRAY['/content/public-site-page', '/content/public-site-link']::text[], ARRAY['super_admin', 'system_admin']::text[], 161, TRUE, NULL),
  ('a1b2c3d4-2302-4a1a-9c2a-1d7e5b923002'::uuid, 'content-localization:content:content:site-enquiries',
   'content-localization:content', 'item', 'Site Enquiries', '/content/site-enquiries',
   ARRAY['/content/site-enquiry']::text[], ARRAY['super_admin', 'system_admin']::text[], 162, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key,
  label = EXCLUDED.label,
  path = EXCLUDED.path,
  active_paths = EXCLUDED.active_paths,
  roles = EXCLUDED.roles,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';

SELECT 'v230 applied' AS status,
       (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN ('admin_list_site_nav_links', 'admin_upsert_site_nav_link', 'admin_delete_site_nav_link',
           'admin_list_site_pages', 'admin_upsert_site_page', 'admin_list_site_enquiries', 'admin_set_site_enquiry_status')) AS functions_present_of_7,
       (SELECT COUNT(*) FROM admin.nav_nodes WHERE node_key IN ('content-localization:content:content:public-site-pages', 'content-localization:content:content:site-enquiries')) AS menu_items_of_2;
