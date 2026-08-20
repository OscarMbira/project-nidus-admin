-- =============================================================================
-- v199: Rename "PMBOK" out of Standards-Based project_template display names
-- Plan: projectplans/v199_pmbok_naming_compliance_fix_plan.md
--
-- Rule 26/27 (CLAUDE.md): avoid copyright/trademark names in components and content.
-- PMBOK(R) is a PMI trademark, same category as PRINCE2 (already excluded elsewhere).
-- v192_project_template_methodology_completeness_seed.sql named 5 Standards-Based
-- project_template rows with literal "PMBOK" text in name/description — corrected at
-- source in that file for future/fresh environments, and here for the rows already
-- live (created before this fix) via the real publish pipeline so every account that
-- already copied one of these picks up the corrected name too, not just new copies.
--
-- Same mechanism as v198: rename admin.global_template_library, then call
-- admin.publish_global_template() so public.sync_global_template_node /
-- sim.sync_global_template_node's per-account lookup (keyed on
-- source_global_template_id) UPDATEs each account's already-materialised
-- pm_template_nodes row in place, rather than only affecting new copies.
--
-- *** REQUIRED BEFORE RUNNING ***
-- v_admin_user_id below is pre-filled with the id used successfully for v198 earlier
-- this session. Confirm it is still correct (content.global_templates.publish
-- permission) before running, or replace it.
-- =============================================================================

DO $$
DECLARE
  v_admin_user_id UUID := '3d8c074f-a82a-4415-b7f7-b7add57d9da8';
  v_notes TEXT := 'v199 naming compliance: remove PMBOK (PMI trademark) from display name/description';
  v_sync JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin.admin_users WHERE id = v_admin_user_id
  ) THEN
    RAISE EXCEPTION 'No admin.admin_users row found for id % — set v_admin_user_id to a real admin user before running', v_admin_user_id;
  END IF;

  -- 1) Digital Delivery Project (PMBOK) -> (Standards-Based)
  UPDATE admin.global_template_library
  SET name = 'Digital Delivery Project (Standards-Based)',
      description = 'Standards-Based Executing-phase project master for digital delivery.',
      payload = payload || jsonb_build_object('name', 'Digital Delivery Project (Standards-Based)'),
      updated_at = NOW()
  WHERE id = 'a1850000-0000-4000-8000-000000000001'::uuid
    AND domain = 'project_template';

  v_sync := admin.publish_global_template('a1850000-0000-4000-8000-000000000001'::uuid, v_admin_user_id, v_notes, 'both');

  -- 2) PMBOK Project Charter Gate -> Standards-Based Project Charter Gate
  UPDATE admin.global_template_library
  SET name = 'Standards-Based Project Charter Gate',
      description = 'Standards-Based Initiating — charter, sponsor alignment, and start-up controls.',
      payload = payload || jsonb_build_object('name', 'Standards-Based Project Charter Gate'),
      updated_at = NOW()
  WHERE id = 'a1920000-0000-4000-8000-000000000011'::uuid
    AND domain = 'project_template';

  v_sync := admin.publish_global_template('a1920000-0000-4000-8000-000000000011'::uuid, v_admin_user_id, v_notes, 'both');

  -- 3) PMBOK Project Management Plan -> Standards-Based Project Management Plan
  UPDATE admin.global_template_library
  SET name = 'Standards-Based Project Management Plan',
      description = 'Standards-Based Planning — baselines, subsidiary plans, and readiness.',
      payload = payload || jsonb_build_object('name', 'Standards-Based Project Management Plan'),
      updated_at = NOW()
  WHERE id = 'a1920000-0000-4000-8000-000000000012'::uuid
    AND domain = 'project_template';

  v_sync := admin.publish_global_template('a1920000-0000-4000-8000-000000000012'::uuid, v_admin_user_id, v_notes, 'both');

  -- 4) PMBOK Performance Control -> Standards-Based Performance Control
  UPDATE admin.global_template_library
  SET name = 'Standards-Based Performance Control',
      description = 'Standards-Based Monitoring & Controlling — variance, change, and forecasts.',
      payload = payload || jsonb_build_object('name', 'Standards-Based Performance Control'),
      updated_at = NOW()
  WHERE id = 'a1920000-0000-4000-8000-000000000014'::uuid
    AND domain = 'project_template';

  v_sync := admin.publish_global_template('a1920000-0000-4000-8000-000000000014'::uuid, v_admin_user_id, v_notes, 'both');

  -- 5) PMBOK Project Closure -> Standards-Based Project Closure
  UPDATE admin.global_template_library
  SET name = 'Standards-Based Project Closure',
      description = 'Standards-Based Closing — handover, lessons, and administrative close.',
      payload = payload || jsonb_build_object('name', 'Standards-Based Project Closure'),
      updated_at = NOW()
  WHERE id = 'a1920000-0000-4000-8000-000000000015'::uuid
    AND domain = 'project_template';

  v_sync := admin.publish_global_template('a1920000-0000-4000-8000-000000000015'::uuid, v_admin_user_id, v_notes, 'both');

  RAISE NOTICE 'v199: renamed + republished 5 Standards-Based project_template Global Templates (PMBOK -> Standards-Based)';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v199_pmbok_naming_compliance_fix.sql applied';
END $$;
