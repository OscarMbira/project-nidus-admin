-- ============================================================================
-- v232: Admin editing of the brand-site blog — posts, attachments, categories
-- Monorepo PRD/plan: E:\project-nidus\projectprd\v1263_brand_site_blog_PRD.md
--                    E:\project-nidus\projectplan\v1263_brand_site_blog_plan.md
-- Admin plan:        E:\project-nidus-admin\projectplans\v214_blog_posts_admin_plan.md
-- Prerequisites: monorepo SQL v1263; Admin SQL v225 (permission helper), v231 (auth_can_edit_public_site,
-- site-assets upload policies). Idempotent.
--
-- Post lifecycle:
--   never published / restored → edited in place (visitors cannot see it)
--   live or scheduled          → edits go to `draft`; attachments added/removed as draft_add / draft_remove
--   publish                    → applies the draft, makes draft attachments live, returns files to delete
--   archive / restore          → off the site / back to an unpublished draft (slug stays locked)
--   delete                     → only posts that were never published
-- Same narrow admin→public pattern as v225/v230/v231 (system.public_site.view / .edit, audited).
-- ============================================================================

-- ── Helpers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_check_blog_post_changes(p_changes JSONB)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN RAISE EXCEPTION 'Changes must be an object'; END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF v_key NOT IN ('slug', 'title', 'summary', 'body_md', 'cover_image_url', 'cover_image_alt', 'author_name', 'author_role', 'category_id') THEN
      RAISE EXCEPTION 'Unknown post field: %', v_key;
    END IF;
  END LOOP;
  IF p_changes ? 'slug' AND COALESCE(p_changes->>'slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Address: use lowercase letters, numbers and single hyphens';
  END IF;
  IF p_changes ? 'title' AND COALESCE(btrim(p_changes->>'title'), '') = '' THEN RAISE EXCEPTION 'Title is required'; END IF;
  IF length(COALESCE(p_changes->>'summary', '')) > 400 THEN RAISE EXCEPTION 'Summary can be up to 400 characters'; END IF;
  IF COALESCE(p_changes->>'cover_image_url', '') <> '' AND p_changes->>'cover_image_url' !~* '^https://' THEN
    RAISE EXCEPTION 'Cover image address must start with https://';
  END IF;
  IF COALESCE(p_changes->>'category_id', '') <> '' AND NOT EXISTS (
    SELECT 1 FROM public.site_blog_categories WHERE id = (p_changes->>'category_id')::uuid) THEN
    RAISE EXCEPTION 'Unknown category';
  END IF;
END;
$$;

-- Live or scheduled (edits must wait for republish).
CREATE OR REPLACE FUNCTION public.admin_blog_post_is_live(p public.site_blog_posts)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$ SELECT p.published_at IS NOT NULL AND p.archived_at IS NULL $$;

-- ── Lists (everything, with drafts) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_blog_posts(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_blog_posts LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, admin AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_blog_posts ORDER BY COALESCE(published_at, created_at) DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_blog_attachments(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_blog_attachments LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, admin AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_blog_attachments ORDER BY post_id, sort_order, created_at;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_blog_categories(p_admin_user_id UUID DEFAULT NULL)
RETURNS SETOF public.site_blog_categories LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, admin AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.public_site.view', p_admin_user_id);
  RETURN QUERY SELECT * FROM public.site_blog_categories ORDER BY sort_order, lower(name);
END; $$;

-- ── Create / save ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_blog_post(p_changes JSONB, p_admin_user_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_id UUID;
BEGIN
  PERFORM public.admin_check_blog_post_changes(p_changes);
  IF COALESCE(p_changes->>'slug', '') = '' OR COALESCE(btrim(p_changes->>'title'), '') = '' THEN
    RAISE EXCEPTION 'Title and address are required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.site_blog_posts WHERE slug = p_changes->>'slug') THEN
    RAISE EXCEPTION 'Another post already uses the address /blog/%', p_changes->>'slug';
  END IF;
  INSERT INTO public.site_blog_posts (slug, title, summary, body_md, cover_image_url, cover_image_alt, author_name, author_role, category_id, created_by, updated_by)
  VALUES (p_changes->>'slug', btrim(p_changes->>'title'), NULLIF(btrim(COALESCE(p_changes->>'summary', '')), ''), COALESCE(p_changes->>'body_md', ''),
          NULLIF(p_changes->>'cover_image_url', ''), NULLIF(p_changes->>'cover_image_alt', ''), NULLIF(btrim(COALESCE(p_changes->>'author_name', '')), ''),
          NULLIF(btrim(COALESCE(p_changes->>'author_role', '')), ''), NULLIF(p_changes->>'category_id', '')::uuid, v_admin, v_admin)
  RETURNING id INTO v_id;
  PERFORM admin.log_admin_action(v_admin, 'blog_post.create', 'blog_post', v_id, jsonb_build_object('slug', p_changes->>'slug'), NULL, p_changes);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_save_blog_post(p_id UUID, p_changes JSONB, p_admin_user_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_post public.site_blog_posts%ROWTYPE;
BEGIN
  PERFORM public.admin_check_blog_post_changes(p_changes);
  SELECT * INTO v_post FROM public.site_blog_posts WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post % not found', p_id; END IF;
  IF p_changes ? 'slug' AND p_changes->>'slug' <> v_post.slug THEN
    IF v_post.first_published_at IS NOT NULL THEN
      RAISE EXCEPTION 'The address of a published post cannot change (it would break shared links)';
    END IF;
    IF EXISTS (SELECT 1 FROM public.site_blog_posts WHERE slug = p_changes->>'slug' AND id <> p_id) THEN
      RAISE EXCEPTION 'Another post already uses the address /blog/%', p_changes->>'slug';
    END IF;
  END IF;

  IF public.admin_blog_post_is_live(v_post) THEN
    UPDATE public.site_blog_posts SET draft = COALESCE(draft, '{}'::jsonb) || (p_changes - 'slug'), updated_by = v_admin WHERE id = p_id;
  ELSE
    UPDATE public.site_blog_posts SET
      slug            = CASE WHEN p_changes ? 'slug'            THEN p_changes->>'slug' ELSE slug END,
      title           = CASE WHEN p_changes ? 'title'           THEN btrim(p_changes->>'title') ELSE title END,
      summary         = CASE WHEN p_changes ? 'summary'         THEN NULLIF(btrim(COALESCE(p_changes->>'summary', '')), '') ELSE summary END,
      body_md         = CASE WHEN p_changes ? 'body_md'         THEN COALESCE(p_changes->>'body_md', '') ELSE body_md END,
      cover_image_url = CASE WHEN p_changes ? 'cover_image_url' THEN NULLIF(p_changes->>'cover_image_url', '') ELSE cover_image_url END,
      cover_image_alt = CASE WHEN p_changes ? 'cover_image_alt' THEN NULLIF(p_changes->>'cover_image_alt', '') ELSE cover_image_alt END,
      author_name     = CASE WHEN p_changes ? 'author_name'     THEN NULLIF(btrim(COALESCE(p_changes->>'author_name', '')), '') ELSE author_name END,
      author_role     = CASE WHEN p_changes ? 'author_role'     THEN NULLIF(btrim(COALESCE(p_changes->>'author_role', '')), '') ELSE author_role END,
      category_id     = CASE WHEN p_changes ? 'category_id'     THEN NULLIF(p_changes->>'category_id', '')::uuid ELSE category_id END,
      updated_by = v_admin
    WHERE id = p_id;
  END IF;
  PERFORM admin.log_admin_action(v_admin, 'blog_post.save', 'blog_post', p_id,
    jsonb_build_object('slug', v_post.slug, 'as_draft', public.admin_blog_post_is_live(v_post)), NULL, p_changes);
  RETURN p_id;
END; $$;

-- ── Publish (now or scheduled) ───────────────────────────────────────────────
-- p_publish_at NULL: first publish = now; a live post keeps its date. Returns the files of removed
-- attachments for Admin to delete from storage.
CREATE OR REPLACE FUNCTION public.admin_publish_blog_post(p_id UUID, p_publish_at TIMESTAMPTZ DEFAULT NULL, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_post public.site_blog_posts%ROWTYPE;
  v_removed JSONB;
  v_when TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_post FROM public.site_blog_posts WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post % not found', p_id; END IF;
  IF v_post.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restore the post before publishing it'; END IF;

  UPDATE public.site_blog_posts SET
    title           = CASE WHEN draft ? 'title'           THEN btrim(draft->>'title') ELSE title END,
    summary         = CASE WHEN draft ? 'summary'         THEN NULLIF(btrim(COALESCE(draft->>'summary', '')), '') ELSE summary END,
    body_md         = CASE WHEN draft ? 'body_md'         THEN COALESCE(draft->>'body_md', '') ELSE body_md END,
    cover_image_url = CASE WHEN draft ? 'cover_image_url' THEN NULLIF(draft->>'cover_image_url', '') ELSE cover_image_url END,
    cover_image_alt = CASE WHEN draft ? 'cover_image_alt' THEN NULLIF(draft->>'cover_image_alt', '') ELSE cover_image_alt END,
    author_name     = CASE WHEN draft ? 'author_name'     THEN NULLIF(btrim(COALESCE(draft->>'author_name', '')), '') ELSE author_name END,
    author_role     = CASE WHEN draft ? 'author_role'     THEN NULLIF(btrim(COALESCE(draft->>'author_role', '')), '') ELSE author_role END,
    category_id     = CASE WHEN draft ? 'category_id'     THEN NULLIF(draft->>'category_id', '')::uuid ELSE category_id END,
    draft = NULL
  WHERE id = p_id
  RETURNING * INTO v_post;

  IF COALESCE(btrim(v_post.summary), '') = '' AND COALESCE(btrim(v_post.body_md), '') = '' THEN
    RAISE EXCEPTION 'Add a summary or article text before publishing';
  END IF;
  IF v_post.cover_image_url IS NOT NULL AND COALESCE(btrim(v_post.cover_image_alt), '') = '' THEN
    RAISE EXCEPTION 'Describe the cover image (alt text) before publishing';
  END IF;

  v_when := COALESCE(p_publish_at, CASE WHEN v_post.published_at IS NOT NULL THEN v_post.published_at ELSE NOW() END);
  UPDATE public.site_blog_posts SET
    published_at = v_when,
    first_published_at = COALESCE(first_published_at, NOW()),
    published_by = v_admin,
    updated_by = v_admin
  WHERE id = p_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket, 'path', file_path)), '[]'::jsonb) INTO v_removed
    FROM public.site_blog_attachments WHERE post_id = p_id AND state = 'draft_remove';
  DELETE FROM public.site_blog_attachments WHERE post_id = p_id AND state = 'draft_remove';
  UPDATE public.site_blog_attachments SET state = 'live', updated_by = v_admin WHERE post_id = p_id AND state = 'draft_add';

  PERFORM admin.log_admin_action(v_admin, CASE WHEN v_when > NOW() THEN 'blog_post.schedule' ELSE 'blog_post.publish' END, 'blog_post', p_id,
    jsonb_build_object('slug', v_post.slug, 'published_at', v_when, 'removed_files', v_removed), NULL, NULL);
  RETURN jsonb_build_object('published_at', v_when, 'removed_files', v_removed);
END; $$;

-- ── Discard a live post's draft ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_discard_blog_post_draft(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_files JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.site_blog_posts WHERE id = p_id) THEN RAISE EXCEPTION 'Post % not found', p_id; END IF;
  UPDATE public.site_blog_posts SET draft = NULL, updated_by = v_admin WHERE id = p_id;
  UPDATE public.site_blog_attachments SET state = 'live', updated_by = v_admin WHERE post_id = p_id AND state = 'draft_remove';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket, 'path', file_path)), '[]'::jsonb) INTO v_files
    FROM public.site_blog_attachments WHERE post_id = p_id AND state = 'draft_add';
  DELETE FROM public.site_blog_attachments WHERE post_id = p_id AND state = 'draft_add';
  PERFORM admin.log_admin_action(v_admin, 'blog_post.discard_draft', 'blog_post', p_id, jsonb_build_object('removed_files', v_files), NULL, NULL);
  RETURN jsonb_build_object('removed_files', v_files);
END; $$;

-- ── Archive / restore / delete ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_archive_blog_post(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
BEGIN
  UPDATE public.site_blog_posts SET archived_at = NOW(), updated_by = v_admin WHERE id = p_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found or already archived'; END IF;
  PERFORM admin.log_admin_action(v_admin, 'blog_post.archive', 'blog_post', p_id, NULL, NULL, NULL);
  RETURN TRUE;
END; $$;

-- Back to an unpublished draft (republish to show it again; the address stays the same).
CREATE OR REPLACE FUNCTION public.admin_restore_blog_post(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
BEGIN
  -- Fold any pending draft into the post (it is no longer visible, so edits apply in place).
  UPDATE public.site_blog_posts SET
    title           = CASE WHEN draft ? 'title'           THEN btrim(draft->>'title') ELSE title END,
    summary         = CASE WHEN draft ? 'summary'         THEN NULLIF(btrim(COALESCE(draft->>'summary', '')), '') ELSE summary END,
    body_md         = CASE WHEN draft ? 'body_md'         THEN COALESCE(draft->>'body_md', '') ELSE body_md END,
    cover_image_url = CASE WHEN draft ? 'cover_image_url' THEN NULLIF(draft->>'cover_image_url', '') ELSE cover_image_url END,
    cover_image_alt = CASE WHEN draft ? 'cover_image_alt' THEN NULLIF(draft->>'cover_image_alt', '') ELSE cover_image_alt END,
    author_name     = CASE WHEN draft ? 'author_name'     THEN NULLIF(btrim(COALESCE(draft->>'author_name', '')), '') ELSE author_name END,
    author_role     = CASE WHEN draft ? 'author_role'     THEN NULLIF(btrim(COALESCE(draft->>'author_role', '')), '') ELSE author_role END,
    category_id     = CASE WHEN draft ? 'category_id'     THEN NULLIF(draft->>'category_id', '')::uuid ELSE category_id END,
    draft = NULL, archived_at = NULL, published_at = NULL, updated_by = v_admin
  WHERE id = p_id AND archived_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found or not archived'; END IF;
  -- Pending additions become part of the post; pending removals are cancelled (nothing half-deleted).
  UPDATE public.site_blog_attachments SET state = 'live' WHERE post_id = p_id AND state IN ('draft_add', 'draft_remove');
  PERFORM admin.log_admin_action(v_admin, 'blog_post.restore', 'blog_post', p_id, NULL, NULL, NULL);
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_blog_post(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_post public.site_blog_posts%ROWTYPE;
  v_files JSONB;
BEGIN
  SELECT * INTO v_post FROM public.site_blog_posts WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post % not found', p_id; END IF;
  IF v_post.first_published_at IS NOT NULL THEN
    RAISE EXCEPTION 'A post that has been published cannot be deleted. Archive it instead.';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket, 'path', file_path)), '[]'::jsonb) INTO v_files
    FROM public.site_blog_attachments WHERE post_id = p_id;
  DELETE FROM public.site_blog_posts WHERE id = p_id;
  PERFORM admin.log_admin_action(v_admin, 'blog_post.delete', 'blog_post', p_id, jsonb_build_object('slug', v_post.slug, 'removed_files', v_files), to_jsonb(v_post), NULL);
  RETURN jsonb_build_object('removed_files', v_files);
END; $$;

-- ── Attachments ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_add_blog_attachment(
  p_post_id UUID, p_display_name TEXT, p_bucket TEXT, p_file_path TEXT, p_public_url TEXT,
  p_mime_type TEXT, p_size_bytes BIGINT, p_is_gated BOOLEAN, p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_post public.site_blog_posts%ROWTYPE;
  v_id UUID;
  v_order INT;
BEGIN
  SELECT * INTO v_post FROM public.site_blog_posts WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post % not found', p_post_id; END IF;
  IF p_mime_type NOT IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
       'text/plain', 'text/csv', 'image/png', 'image/jpeg', 'image/webp') THEN
    RAISE EXCEPTION 'This file type is not allowed';
  END IF;
  SELECT COALESCE(MAX(sort_order), 0) + 10 INTO v_order FROM public.site_blog_attachments WHERE post_id = p_post_id;
  INSERT INTO public.site_blog_attachments (post_id, display_name, bucket, file_path, public_url, mime_type, size_bytes, is_gated, state, sort_order, created_by, updated_by)
  VALUES (p_post_id, btrim(p_display_name), p_bucket, p_file_path, CASE WHEN p_is_gated THEN NULL ELSE p_public_url END, p_mime_type, p_size_bytes, p_is_gated,
          CASE WHEN public.admin_blog_post_is_live(v_post) THEN 'draft_add' ELSE 'live' END, v_order, v_admin, v_admin)
  RETURNING id INTO v_id;
  PERFORM admin.log_admin_action(v_admin, 'blog_attachment.add', 'blog_attachment', v_id,
    jsonb_build_object('post', v_post.slug, 'name', p_display_name, 'gated', p_is_gated, 'size', p_size_bytes), NULL, NULL);
  RETURN v_id;
END; $$;

-- Name and order change immediately (presentation only).
CREATE OR REPLACE FUNCTION public.admin_update_blog_attachment(p_id UUID, p_display_name TEXT, p_sort_order INTEGER, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
BEGIN
  UPDATE public.site_blog_attachments SET display_name = btrim(p_display_name), sort_order = COALESCE(p_sort_order, sort_order), updated_by = v_admin WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attachment % not found', p_id; END IF;
  PERFORM admin.log_admin_action(v_admin, 'blog_attachment.update', 'blog_attachment', p_id, jsonb_build_object('name', p_display_name, 'sort_order', p_sort_order), NULL, NULL);
  RETURN TRUE;
END; $$;

-- On a live post: marks the file for removal at publish. Otherwise (or a not-yet-published upload):
-- deletes the row now and returns the file for Admin to delete.
CREATE OR REPLACE FUNCTION public.admin_remove_blog_attachment(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_att public.site_blog_attachments%ROWTYPE;
  v_post public.site_blog_posts%ROWTYPE;
BEGIN
  SELECT * INTO v_att FROM public.site_blog_attachments WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attachment % not found', p_id; END IF;
  SELECT * INTO v_post FROM public.site_blog_posts WHERE id = v_att.post_id;
  PERFORM admin.log_admin_action(v_admin, 'blog_attachment.remove', 'blog_attachment', p_id, jsonb_build_object('post', v_post.slug, 'name', v_att.display_name), NULL, NULL);
  IF public.admin_blog_post_is_live(v_post) AND v_att.state = 'live' THEN
    UPDATE public.site_blog_attachments SET state = 'draft_remove', updated_by = v_admin WHERE id = p_id;
    RETURN jsonb_build_object('deleted', FALSE);
  END IF;
  DELETE FROM public.site_blog_attachments WHERE id = p_id;
  RETURN jsonb_build_object('deleted', TRUE, 'bucket', v_att.bucket, 'path', v_att.file_path);
END; $$;

-- Undo a pending removal on a live post.
CREATE OR REPLACE FUNCTION public.admin_keep_blog_attachment(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
BEGIN
  UPDATE public.site_blog_attachments SET state = 'live', updated_by = v_admin WHERE id = p_id AND state = 'draft_remove';
  RETURN FOUND;
END; $$;

-- ── Categories ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_blog_category(
  p_id UUID, p_slug TEXT, p_name TEXT, p_description TEXT, p_sort_order INTEGER, p_is_active BOOLEAN, p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
  v_slug TEXT := lower(btrim(COALESCE(p_slug, '')));
  v_id UUID;
BEGIN
  IF v_slug !~ '^[a-z0-9-]+$' OR COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'Name and key (lowercase letters, numbers, hyphens) are required'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.site_blog_categories (slug, name, description, sort_order, is_active, created_by, updated_by)
    VALUES (v_slug, btrim(p_name), NULLIF(btrim(COALESCE(p_description, '')), ''), COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE), v_admin, v_admin)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.site_blog_categories SET slug = v_slug, name = btrim(p_name), description = NULLIF(btrim(COALESCE(p_description, '')), ''),
      sort_order = COALESCE(p_sort_order, sort_order), is_active = COALESCE(p_is_active, is_active), updated_by = v_admin
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Category % not found', p_id; END IF;
  END IF;
  PERFORM admin.log_admin_action(v_admin, CASE WHEN p_id IS NULL THEN 'blog_category.create' ELSE 'blog_category.update' END, 'blog_category', v_id,
    jsonb_build_object('slug', v_slug, 'name', p_name, 'is_active', p_is_active), NULL, NULL);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_blog_category(p_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, admin AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.public_site.edit', p_admin_user_id);
BEGIN
  IF EXISTS (SELECT 1 FROM public.site_blog_posts WHERE category_id = p_id) THEN
    RAISE EXCEPTION 'Posts use this category. Hide it instead.';
  END IF;
  DELETE FROM public.site_blog_categories WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category % not found', p_id; END IF;
  PERFORM admin.log_admin_action(v_admin, 'blog_category.delete', 'blog_category', p_id, NULL, NULL, NULL);
  RETURN TRUE;
END; $$;

-- ── Storage: private bucket site-downloads (editors only; visitors get signed links) ──
DROP POLICY IF EXISTS "Site downloads: public site editors can read" ON storage.objects;
CREATE POLICY "Site downloads: public site editors can read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'site-downloads' AND public.auth_can_edit_public_site());
DROP POLICY IF EXISTS "Site downloads: public site editors can upload" ON storage.objects;
CREATE POLICY "Site downloads: public site editors can upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-downloads' AND public.auth_can_edit_public_site());
DROP POLICY IF EXISTS "Site downloads: public site editors can delete" ON storage.objects;
CREATE POLICY "Site downloads: public site editors can delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'site-downloads' AND public.auth_can_edit_public_site());

-- ── GRANT EXECUTE ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_check_blog_post_changes(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_blog_post_is_live(public.site_blog_posts) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_blog_posts(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_blog_attachments(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_blog_categories(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_blog_post(JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_blog_post(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_blog_post(UUID, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_discard_blog_post_draft(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_archive_blog_post(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_blog_post(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_blog_post(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_blog_attachment(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_blog_attachment(UUID, TEXT, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_blog_attachment(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_keep_blog_attachment(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_blog_category(UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_blog_category(UUID, UUID) TO authenticated, service_role;

-- ── Sidebar navigation (Content & Localization → Content) ─────────────────────
INSERT INTO admin.nav_nodes (id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
VALUES
  ('a1b2c3d4-2322-4a1a-9c2a-1d7e5b923201'::uuid, 'content-localization:content:content:blog-posts', 'content-localization:content', 'item',
   'Blog Posts', '/content/blog-posts', ARRAY['/content/blog-post']::text[], ARRAY['super_admin', 'system_admin']::text[], 164, TRUE, NULL),
  ('a1b2c3d4-2322-4a1a-9c2a-1d7e5b923202'::uuid, 'content-localization:content:content:blog-categories', 'content-localization:content', 'item',
   'Blog Categories', '/content/blog-categories', ARRAY[]::text[], ARRAY['super_admin', 'system_admin']::text[], 165, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, path = EXCLUDED.path, active_paths = EXCLUDED.active_paths,
  roles = EXCLUDED.roles, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';

SELECT 'v232 applied' AS status,
       (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN ('admin_list_blog_posts', 'admin_list_blog_attachments', 'admin_list_blog_categories',
           'admin_create_blog_post', 'admin_save_blog_post', 'admin_publish_blog_post', 'admin_discard_blog_post_draft', 'admin_archive_blog_post',
           'admin_restore_blog_post', 'admin_delete_blog_post', 'admin_add_blog_attachment', 'admin_update_blog_attachment',
           'admin_remove_blog_attachment', 'admin_keep_blog_attachment', 'admin_upsert_blog_category', 'admin_delete_blog_category')) AS functions_present_of_16,
       (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'Site downloads:%') AS download_policies_of_3,
       (SELECT COUNT(*) FROM admin.nav_nodes WHERE node_key IN ('content-localization:content:content:blog-posts', 'content-localization:content:content:blog-categories')) AS menu_items_of_2;
