-- =============================================================================
-- v200: Remove "Pmbok"/"PMBOK" text from process_template display names
-- Plan: projectplans/v199_pmbok_naming_compliance_fix_plan.md (part 2 — see "Correction" section)
--
-- Root cause: v188b_process_template_methodology_seed_min10.sql generated up to ~50
-- process_template rows (Initiating/Planning/Executing/Monitoring & Controlling/Closing
-- x up to 10 each) whose name/description text was built via
-- `format('... (%s)', initcap(v_rec.methodology))` against the hardcoded literal
-- 'pmbok' in that file's VALUES list. v196 (this repo) later renamed the *methodology
-- column* on existing rows from 'pmbok' -> 'standards_based', which is why these rows'
-- own "Standards-Based" badge/column reads correctly today — but v196 never touched
-- the frozen name/description TEXT baked in at INSERT time by v188b, so "(Pmbok)" /
-- "Seeded Pmbok / ..." text survived untouched in ~50 rows. v188b itself is now fixed
-- at the source (literal changed to 'standards_based', display text decoupled from the
-- raw enum via a label CASE) so re-running it will no longer regenerate PMBOK text —
-- this migration is only for rows that already exist with the old frozen text.
--
-- Pattern-based (not fixed-ID like v199) because the affected set spans up to 5
-- categories x up to 10 rows each with fixed-but-numerous UUIDs
-- ('a188b000-0000-4000-8000-...'); a WHERE ... ILIKE match + loop is simpler and safer
-- than hand-listing ~50 ids.
--
-- Same mechanism as v198/v199: rename admin.global_template_library, then call
-- admin.publish_global_template() per row so already-copied accounts' pm_template_nodes
-- rows (matched by source_global_template_id) get updated in place too.
--
-- *** REQUIRED BEFORE RUNNING ***
-- v_admin_user_id below reuses the id already confirmed working for v198/v199 earlier
-- this session. Confirm it is still correct before running, or replace it.
-- =============================================================================

DO $$
DECLARE
  v_admin_user_id UUID := '3d8c074f-a82a-4415-b7f7-b7add57d9da8';
  v_notes TEXT := 'v200 naming compliance: remove PMBOK (PMI trademark) text from process_template display name/description';
  r RECORD;
  v_sync JSONB;
  v_count INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin.admin_users WHERE id = v_admin_user_id
  ) THEN
    RAISE EXCEPTION 'No admin.admin_users row found for id % — set v_admin_user_id to a real admin user before running', v_admin_user_id;
  END IF;

  FOR r IN
    SELECT id
    FROM admin.global_template_library
    WHERE domain = 'process_template'
      AND record_status = 'live'
      AND (
        name ~* 'pmbok'
        OR description ~* 'pmbok'
        OR COALESCE(payload->>'title', '') ~* 'pmbok'
        OR COALESCE(payload->>'description', '') ~* 'pmbok'
      )
  LOOP
    UPDATE admin.global_template_library
    SET
      name = regexp_replace(name, 'pmbok', 'Standards-Based', 'gi'),
      description = regexp_replace(description, 'pmbok', 'Standards-Based', 'gi'),
      payload = payload || jsonb_build_object(
        'title', regexp_replace(COALESCE(payload->>'title', ''), 'pmbok', 'Standards-Based', 'gi'),
        'description', regexp_replace(COALESCE(payload->>'description', ''), 'pmbok', 'Standards-Based', 'gi')
      ),
      updated_at = NOW()
    WHERE id = r.id;

    v_sync := admin.publish_global_template(r.id, v_admin_user_id, v_notes, 'both');
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'v200: renamed + republished % process_template Global Template row(s), removing PMBOK text', v_count;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v200_pmbok_process_template_naming_compliance_fix.sql applied';
END $$;
