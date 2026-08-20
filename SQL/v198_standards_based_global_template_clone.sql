-- =============================================================================
-- v198: Clone Structured Global Templates as Standards-Based (form_template domain)
-- Plan: projectplans/v197_standards_based_global_template_clone_plan.md
-- Companion monorepo: SQL/v827... (investigation) — the earlier monorepo-side attempt
--   (SQL/v828_standards_based_form_template_clone.sql) is marked superseded/do-not-run; it
--   hand-inserted pm_template_nodes/form_templates directly, bypassing this real pipeline.
--
-- Standards-Based methodology never got a real template catalog the way Structured and
-- Agile did. Its original PMBOK-specific content (F001-F068) could not be recovered from any
-- SQL file in either repo — never captured in a versioned migration, apparently only ever
-- authored live through the Admin app UI. This clones the existing Structured
-- admin.global_template_library rows as Standards-Based siblings instead (same content,
-- re-tagged), then publishes each through the real admin.publish_global_template() path —
-- the same call a human triggers by clicking "Publish" — so the result is fully Admin-visible
-- and fans out to public/sim exactly like any other Global Template.
--
-- Scope: form_template domain only (Business Case, Checkpoint Report, Benefits Review Plan,
-- etc.). process_template ("Closing Process Master" family) deliberately NOT attempted —
-- spread across ~24 different Platform-side tables via a polymorphic lookup, too much risk to
-- get right without live DB access to verify against.
--
-- Idempotent: new rows get a deterministic id (uuid_generate_v5 from the source id), matching
-- this table's existing "fixed UUIDs, ON CONFLICT DO UPDATE" seed convention — safe to re-run.
--
-- *** REQUIRED BEFORE RUNNING ***
-- Set v_admin_user_id below to a real admin.admin_users.id that holds the
-- 'content.global_templates.publish' permission (super_admin / system_admin / content_admin).
-- The script raises and stops if left as the placeholder zero-UUID.
--
-- Prerequisites: v160 (global_template_library), v185 (methodology column), v196
--   (standards_based literal), v164/v175/v184/v185 (publish_global_template)
-- =============================================================================

DO $$
DECLARE
  v_admin_user_id UUID := '3d8c074f-a82a-4415-b7f7-b7add57d9da8';
  v_namespace UUID := 'a19800a1-9800-4a19-8a19-8a1980a19800'; -- fixed namespace, deterministic child ids
  r RECORD;
  v_new_id UUID;
  v_new_name TEXT;
  v_new_code TEXT;
  v_new_payload JSONB;
  v_sync JSONB;
  v_cloned INT := 0;
  v_skipped INT := 0;
BEGIN
  IF v_admin_user_id = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'Set v_admin_user_id to a real admin.admin_users.id (with content.global_templates.publish) before running this script';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM admin.admin_users WHERE id = v_admin_user_id
  ) THEN
    RAISE EXCEPTION 'No admin.admin_users row found for id %', v_admin_user_id;
  END IF;

  FOR r IN
    SELECT *
    FROM admin.global_template_library
    WHERE domain = 'form_template'
      AND methodology = 'structured'
      AND record_status = 'live'
  LOOP
    v_new_code := NULLIF(trim(COALESCE(r.payload->>'template_code', '')), '');
    IF v_new_code IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    -- FS- (Form/Structured) -> FD- (Form/Standards-based); falls back to a plain prefix
    -- if a row's code doesn't follow the usual FS- convention.
    IF v_new_code LIKE 'FS-%' THEN
      v_new_code := 'FD-' || substring(v_new_code FROM 4);
    ELSE
      v_new_code := 'FD-' || v_new_code;
    END IF;

    v_new_id := uuid_generate_v5(v_namespace, r.id::text || ':standards_based');
    v_new_name := REPLACE(r.name, '(Structured)', '(Standards-Based)');
    v_new_payload := r.payload || jsonb_build_object('template_code', v_new_code, 'name', v_new_name);

    INSERT INTO admin.global_template_library (
      id, domain, name, description, category, methodology, payload, record_status, record_version, created_by
    ) VALUES (
      v_new_id, r.domain, v_new_name, r.description, r.category, 'standards_based', v_new_payload, 'live', 1, r.created_by
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      methodology = EXCLUDED.methodology,
      payload = EXCLUDED.payload,
      record_status = 'live',
      updated_at = NOW();

    v_sync := admin.publish_global_template(
      v_new_id,
      v_admin_user_id,
      'v198 Standards-Based parity clone from Structured',
      'both'
    );

    v_cloned := v_cloned + 1;
  END LOOP;

  RAISE NOTICE 'Cloned + published % Standards-Based form_template Global Templates (skipped % with no template_code)', v_cloned, v_skipped;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v198_standards_based_global_template_clone.sql applied';
END $$;
