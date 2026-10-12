-- ============================================================================
-- v231: Admin editing of brand-site marketing sections (drafts, preview, publish) + image uploads
-- Monorepo PRD/plan: E:\project-nidus\projectprd\v1262_brand_site_marketing_homepage_PRD.md
--                    E:\project-nidus\projectplan\v1262_brand_site_marketing_homepage_plan.md
-- Admin plan:        E:\project-nidus-admin\projectplans\v213_site_sections_admin_plan.md
-- Prerequisites: monorepo SQL v1262 (site_sections, site_preview_tokens, bucket site-assets),
-- Admin SQL v225 (public.admin_require_public_site_permission, permission keys). Idempotent.
--
-- Same narrow admin→public pattern as v225/v230. Every change is saved to the row's `draft`;
-- visitors see published columns only. Publish copies a page's drafts live in one statement.
-- ============================================================================

-- ── Draft validation (keys, buttons, items) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_check_site_section_changes(p_changes JSONB)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_cta JSONB;
  v_item JSONB;
  v_href_re CONSTANT TEXT := '^(#[a-z0-9_-]+|/[^[:space:]]*|https?://[^[:space:]]+)$';
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'Changes must be an object';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF v_key NOT IN ('heading', 'subheading', 'body', 'primary_cta', 'secondary_cta', 'image_url', 'image_alt', 'items', 'is_active', 'sort_order') THEN
      RAISE EXCEPTION 'Unknown section field: %', v_key;
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['primary_cta', 'secondary_cta'] LOOP
    v_cta := p_changes->v_key;
    IF v_cta IS NOT NULL AND jsonb_typeof(v_cta) <> 'null' THEN
      IF jsonb_typeof(v_cta) <> 'object' OR COALESCE(btrim(v_cta->>'label'), '') = '' OR COALESCE(v_cta->>'href', '') !~* v_href_re THEN
        RAISE EXCEPTION 'Button %: text is required and the link must start with /, https:// or #', v_key;
      END IF;
    END IF;
  END LOOP;
  IF COALESCE(p_changes->>'image_url', '') <> '' AND p_changes->>'image_url' !~* '^https://' THEN
    RAISE EXCEPTION 'Image address must start with https://';
  END IF;
  IF p_changes ? 'items' THEN
    IF jsonb_typeof(p_changes->'items') <> 'array' THEN RAISE EXCEPTION 'items must be a list'; END IF;
    IF jsonb_array_length(p_changes->'items') > 24 THEN RAISE EXCEPTION 'A section can have up to 24 items'; END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_changes->'items') LOOP
      IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'Each item must be an object'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k NOT IN ('title', 'subtitle', 'text', 'icon', 'href', 'image_url', 'image_alt')) THEN
        RAISE EXCEPTION 'Unknown item field';
      END IF;
      IF COALESCE(v_item->>'href', '') <> '' AND v_item->>'href' !~* v_href_re THEN
        RAISE EXCEPTION 'Item link must start with /, https:// or #';
      END IF;
      IF COALESCE(v_item->>'image_url', '') <> '' AND v_item->>'image_url' !~* '^https://' THEN
        RAISE EXCEPTION 'Item image address must start with https://';
      END IF;
    END LOOP;
  END IF;
  IF p_changes ? 'is_active' AND jsonb_typeof(p_changes->'is_active') <> 'boolean' THEN RAISE EXCEPTION 'is_active must be true or false'; END IF;
  IF p_changes ? 'sort_order' AND jsonb_typeof(p_changes->'sort_order') <> 'number' THEN RAISE EXCEPTION 'sort_order must be a number'; END IF;
END;
$$;

-- ── List (all rows, with drafts) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_site_sections(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_sections
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_sections ORDER BY page_slug, sort_order, section_key;
END;
$$;

-- ── Save draft changes (merged into any existing draft) ──────────────────────
CREATE OR REPLACE FUNCTION public.admin_save_site_section_draft(p_id UUID, p_changes JSONB, p_admin_user_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_prev public.site_sections%ROWTYPE;
BEGIN
  PERFORM public.admin_check_site_section_changes(p_changes);
  SELECT * INTO v_prev FROM public.site_sections WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Section % not found', p_id; END IF;
  UPDATE public.site_sections SET draft = COALESCE(draft, '{}'::jsonb) || p_changes, updated_by = v_admin WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'site_section.draft', 'site_section', p_id,
    jsonb_build_object('page_slug', v_prev.page_slug, 'section_key', v_prev.section_key), v_prev.draft, p_changes);
  RETURN p_id;
END;
$$;

-- ── Add a section (hidden until published) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_add_site_section(
  p_page_slug TEXT, p_section_key TEXT, p_section_type TEXT, p_changes JSONB DEFAULT '{}'::jsonb, p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_key TEXT := lower(btrim(COALESCE(p_section_key, '')));
  v_order INT;
  v_id UUID;
BEGIN
  IF p_page_slug <> 'home' AND NOT EXISTS (SELECT 1 FROM public.site_pages WHERE slug = p_page_slug) THEN
    RAISE EXCEPTION 'There is no site page %', p_page_slug;
  END IF;
  IF v_key !~ '^[a-z0-9_-]+$' THEN RAISE EXCEPTION 'Key: use lowercase letters, numbers, - and _'; END IF;
  IF EXISTS (SELECT 1 FROM public.site_sections WHERE page_slug = p_page_slug AND section_key = v_key) THEN
    RAISE EXCEPTION 'This page already has a section with key %', v_key;
  END IF;
  PERFORM public.admin_check_site_section_changes(COALESCE(p_changes, '{}'::jsonb));
  SELECT COALESCE(MAX(GREATEST(sort_order, COALESCE((draft->>'sort_order')::int, sort_order))), 0) + 10 INTO v_order
    FROM public.site_sections WHERE page_slug = p_page_slug;
  INSERT INTO public.site_sections (page_slug, section_key, section_type, sort_order, is_active, draft, created_by, updated_by)
  VALUES (p_page_slug, v_key, p_section_type, v_order, FALSE,
          COALESCE(p_changes, '{}'::jsonb) || jsonb_build_object('is_active', TRUE, 'sort_order', v_order), v_admin, v_admin)
  RETURNING id INTO v_id;
  PERFORM admin.log_admin_action(v_admin, 'site_section.create', 'site_section', v_id,
    jsonb_build_object('page_slug', p_page_slug, 'section_key', v_key, 'section_type', p_section_type), NULL, p_changes);
  RETURN v_id;
END;
$$;

-- ── Discard a section's draft ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_discard_site_section_draft(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_prev JSONB;
BEGIN
  SELECT draft INTO v_prev FROM public.site_sections WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Section % not found', p_id; END IF;
  UPDATE public.site_sections SET draft = NULL, updated_by = v_admin WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'site_section.discard_draft', 'site_section', p_id, NULL, v_prev, NULL);
  RETURN TRUE;
END;
$$;

-- ── Reorder (saved as drafts; p_keys lists the page's section keys in the new order) ──
CREATE OR REPLACE FUNCTION public.admin_reorder_site_sections(p_page_slug TEXT, p_keys TEXT[], p_admin_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_count INT;
BEGIN
  UPDATE public.site_sections s
     SET draft = COALESCE(s.draft, '{}'::jsonb) || jsonb_build_object('sort_order', o.pos * 10), updated_by = v_admin
    FROM unnest(p_keys) WITH ORDINALITY AS o(section_key, pos)
   WHERE s.page_slug = p_page_slug AND s.section_key = o.section_key;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM admin.log_admin_action(v_admin, 'site_sections.reorder', 'site_page', NULL,
    jsonb_build_object('page_slug', p_page_slug, 'order', to_jsonb(p_keys)), NULL, NULL);
  RETURN v_count;
END;
$$;

-- ── Publish every draft of one page ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_publish_site_sections(p_page_slug TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_count INT;
  v_keys JSONB;
BEGIN
  SELECT jsonb_agg(section_key ORDER BY section_key) INTO v_keys FROM public.site_sections WHERE page_slug = p_page_slug AND draft IS NOT NULL;
  UPDATE public.site_sections SET
    heading       = CASE WHEN draft ? 'heading'       THEN NULLIF(draft->>'heading', '')       ELSE heading END,
    subheading    = CASE WHEN draft ? 'subheading'    THEN NULLIF(draft->>'subheading', '')    ELSE subheading END,
    body          = CASE WHEN draft ? 'body'          THEN NULLIF(draft->>'body', '')          ELSE body END,
    primary_cta   = CASE WHEN draft ? 'primary_cta'   THEN NULLIF(draft->'primary_cta', 'null'::jsonb)   ELSE primary_cta END,
    secondary_cta = CASE WHEN draft ? 'secondary_cta' THEN NULLIF(draft->'secondary_cta', 'null'::jsonb) ELSE secondary_cta END,
    image_url     = CASE WHEN draft ? 'image_url'     THEN NULLIF(draft->>'image_url', '')     ELSE image_url END,
    image_alt     = CASE WHEN draft ? 'image_alt'     THEN NULLIF(draft->>'image_alt', '')     ELSE image_alt END,
    items         = CASE WHEN draft ? 'items'         THEN COALESCE(NULLIF(draft->'items', 'null'::jsonb), '[]'::jsonb) ELSE items END,
    is_active     = CASE WHEN draft ? 'is_active'     THEN (draft->>'is_active')::boolean      ELSE is_active END,
    sort_order    = CASE WHEN draft ? 'sort_order'    THEN (draft->>'sort_order')::numeric::int ELSE sort_order END,
    draft = NULL,
    published_at = NOW(),
    published_by = v_admin,
    updated_by = v_admin
  WHERE page_slug = p_page_slug AND draft IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM admin.log_admin_action(v_admin, 'site_sections.publish', 'site_page', NULL,
    jsonb_build_object('page_slug', p_page_slug, 'sections', COALESCE(v_keys, '[]'::jsonb), 'count', v_count), NULL, NULL);
  RETURN v_count;
END;
$$;

-- ── Preview link (token returned once; only its hash is stored; 60 minutes) ──
CREATE OR REPLACE FUNCTION public.admin_create_site_preview_token(p_admin_user_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  v_token TEXT := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
BEGIN
  DELETE FROM public.site_preview_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
  INSERT INTO public.site_preview_tokens (token_hash, expires_at, created_by)
  VALUES (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), NOW() + INTERVAL '60 minutes', v_admin);
  PERFORM admin.log_admin_action(v_admin, 'site_sections.preview_link', 'site_page', NULL, jsonb_build_object('expires_in_minutes', 60), NULL, NULL);
  RETURN v_token;
END;
$$;

-- ── Image uploads to bucket site-assets (edit permission only) ───────────────
CREATE OR REPLACE FUNCTION public.auth_can_edit_public_site()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := admin.current_admin_user_id();
BEGIN
  RETURN v_admin IS NOT NULL AND admin.check_admin_permission(v_admin, 'system.public_site.edit');
END;
$$;
REVOKE ALL ON FUNCTION public.auth_can_edit_public_site() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_edit_public_site() TO authenticated, service_role;

DROP POLICY IF EXISTS "Site assets: public site editors can upload" ON storage.objects;
CREATE POLICY "Site assets: public site editors can upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-assets' AND public.auth_can_edit_public_site());
DROP POLICY IF EXISTS "Site assets: public site editors can update" ON storage.objects;
CREATE POLICY "Site assets: public site editors can update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'site-assets' AND public.auth_can_edit_public_site())
  WITH CHECK (bucket_id = 'site-assets' AND public.auth_can_edit_public_site());
DROP POLICY IF EXISTS "Site assets: public site editors can delete" ON storage.objects;
CREATE POLICY "Site assets: public site editors can delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'site-assets' AND public.auth_can_edit_public_site());

-- ── GRANT EXECUTE ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_check_site_section_changes(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_check_site_section_changes(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_site_sections(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_site_section_draft(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_site_section(TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_discard_site_section_draft(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reorder_site_sections(TEXT, TEXT[], UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_site_sections(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_site_preview_token(UUID) TO authenticated, service_role;

-- ── Sidebar navigation (Content & Localization → Content) ─────────────────────
INSERT INTO admin.nav_nodes (id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
VALUES ('a1b2c3d4-2312-4a1a-9c2a-1d7e5b923101'::uuid, 'content-localization:content:content:site-sections',
        'content-localization:content', 'item', 'Site Sections', '/content/site-sections',
        ARRAY['/content/site-section']::text[], ARRAY['super_admin', 'system_admin']::text[], 163, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, path = EXCLUDED.path, active_paths = EXCLUDED.active_paths,
  roles = EXCLUDED.roles, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';

SELECT 'v231 applied' AS status,
       (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN ('admin_list_site_sections', 'admin_save_site_section_draft', 'admin_add_site_section',
           'admin_discard_site_section_draft', 'admin_reorder_site_sections', 'admin_publish_site_sections', 'admin_create_site_preview_token')) AS functions_present_of_7,
       (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'Site assets:%') AS upload_policies_of_3,
       (SELECT COUNT(*) FROM admin.nav_nodes WHERE node_key = 'content-localization:content:content:site-sections') AS menu_items_of_1;
