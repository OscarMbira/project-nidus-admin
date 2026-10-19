-- ============================================================================
-- v239: AI Centre — Simulator AI authoring (monorepo v1272 Phase 3, PRD D14, D15, D27, story 47)
--
-- Narrow Admin → sim exception (documented in both CLAUDE.md files, like v236–v238): Admin writes
-- sim.scenario_rubrics, sim.ai_assessment_calibration, sim.ai_assessment_flags (review only), the
-- AI columns of sim.scenarios (assessor_counts/weight, adaptive_enabled, min/max difficulty) and the
-- persona columns of sim.npc_characters ONLY through these SECURITY DEFINER RPCs, gated by
-- ai.simulator.author (reads: ai.view) and written to admin.log_admin_action. Learner identities are
-- never returned: assessments are shown by id, score and evidence only.
--
--   admin_sim_ai_list_scenarios / admin_sim_ai_get_scenario
--   admin_sim_ai_upsert_criterion / admin_sim_ai_update_scenario   (counts-toward-score needs calibration:
--                                                                    ≥ 30 author scores, ≥ 80% within ±1 level)
--   admin_sim_ai_calibrate / admin_sim_ai_review_flag
--   admin_sim_ai_list_personas / admin_sim_ai_update_persona
-- Also: permission ai.simulator.author, nav item "Stakeholder Personas", Assessor nav active paths.
-- Prerequisites: monorepo SQL v1285–v1287; Admin v225, v235. Idempotent.
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES ('ai.simulator.author', 'Author Simulator AI', 'ai', 'Rubrics, difficulty limits, Assessor calibration and switch-over, stakeholder personas')
ON CONFLICT (permission_key) DO UPDATE SET permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;
INSERT INTO admin.role_permissions (role, permission_key)
SELECT r, 'ai.simulator.author' FROM unnest(ARRAY['super_admin', 'system_admin']) r
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.nav_nodes (id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
VALUES
  ('7a1c2e00-1272-4a10-9a00-000000000009'::uuid, 'ai-centre:ai:assessor', 'ai-centre:ai', 'item', 'Assessor Calibration', '/ai/assessor',
   ARRAY['/ai/assessor-scenario']::text[], ARRAY['super_admin', 'system_admin']::text[], 77, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000011'::uuid, 'ai-centre:ai:sim-personas', 'ai-centre:ai', 'item', 'Stakeholder Personas', '/ai/sim-personas',
   ARRAY['/ai/sim-persona']::text[], ARRAY['super_admin', 'system_admin']::text[], 79, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key, node_type = EXCLUDED.node_type, label = EXCLUDED.label, path = EXCLUDED.path,
  active_paths = EXCLUDED.active_paths, roles = EXCLUDED.roles, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- Calibration state of a scenario: number of author-scored assessments and mean agreement.
CREATE OR REPLACE FUNCTION public.admin_sim_ai_calibration_state(p_scenario_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
  SELECT jsonb_build_object(
    'calibrated_assessments', COUNT(DISTINCT c.assessment_id),
    'agreement', ROUND(AVG(c.agreement), 1),
    'is_calibrated', COUNT(DISTINCT c.assessment_id) >= 30 AND COALESCE(AVG(c.agreement), 0) >= 80)
    FROM sim.ai_assessment_calibration c
    JOIN sim.ai_assessments a ON a.id = c.assessment_id
   WHERE a.scenario_id = p_scenario_id;
$$;
REVOKE ALL ON FUNCTION public.admin_sim_ai_calibration_state(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_sim_ai_list_scenarios(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY lower(row ->> 'name'), row ->> 'created_at')
      FROM (
        SELECT jsonb_build_object(
          'id', s.id, 'name', s.name, 'difficulty_level', s.difficulty_level, 'is_active', s.is_active, 'created_at', s.created_at,
          'assessor_counts', s.assessor_counts, 'assessor_weight', s.assessor_weight,
          'adaptive_enabled', s.adaptive_enabled, 'min_difficulty', s.min_difficulty, 'max_difficulty', s.max_difficulty,
          'criteria', (SELECT COUNT(*) FROM sim.scenario_rubrics r WHERE r.scenario_id = s.id AND r.is_active),
          'assessments', (SELECT COUNT(*) FROM sim.ai_assessments a WHERE a.scenario_id = s.id),
          'open_flags', (SELECT COUNT(*) FROM sim.ai_assessment_flags f JOIN sim.ai_assessments a ON a.id = f.assessment_id
                          WHERE a.scenario_id = s.id AND f.status = 'open'),
          'calibration', public.admin_sim_ai_calibration_state(s.id)) AS row
          FROM sim.scenarios s
      ) x), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sim_ai_get_scenario(p_scenario_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.view', p_admin_user_id);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sim.scenarios WHERE id = p_scenario_id) THEN RAISE EXCEPTION 'Scenario not found'; END IF;
  RETURN jsonb_build_object(
    'scenario', (SELECT jsonb_build_object('id', id, 'name', name, 'description', description, 'difficulty_level', difficulty_level,
                   'assessor_counts', assessor_counts, 'assessor_weight', assessor_weight, 'adaptive_enabled', adaptive_enabled,
                   'min_difficulty', min_difficulty, 'max_difficulty', max_difficulty, 'created_at', created_at, 'updated_at', updated_at)
                   FROM sim.scenarios WHERE id = p_scenario_id),
    'rubric', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order, r.criterion_key) FROM sim.scenario_rubrics r WHERE r.scenario_id = p_scenario_id), '[]'::jsonb),
    'calibration', public.admin_sim_ai_calibration_state(p_scenario_id),
    'assessments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'assessment_point', a.assessment_point, 'overall_score', a.overall_score, 'criteria', a.criteria,
               'summary', a.summary, 'created_at', a.created_at,
               'my_calibration', (SELECT jsonb_build_object('author_levels', c.author_levels, 'agreement', c.agreement)
                                    FROM sim.ai_assessment_calibration c WHERE c.assessment_id = a.id AND c.author_admin_id = v_admin),
               'calibrations', (SELECT COUNT(*) FROM sim.ai_assessment_calibration c WHERE c.assessment_id = a.id),
               'flags', (SELECT COUNT(*) FROM sim.ai_assessment_flags f WHERE f.assessment_id = a.id))
             ORDER BY a.created_at DESC)
        FROM (SELECT * FROM sim.ai_assessments WHERE scenario_id = p_scenario_id ORDER BY created_at DESC LIMIT 100) a), '[]'::jsonb),
    'flags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'assessment_id', f.assessment_id, 'criterion_key', f.criterion_key,
               'reason', f.reason, 'status', f.status, 'review_note', f.review_note, 'created_at', f.created_at) ORDER BY f.created_at DESC)
        FROM sim.ai_assessment_flags f JOIN sim.ai_assessments a ON a.id = f.assessment_id
       WHERE a.scenario_id = p_scenario_id), '[]'::jsonb));
END;
$$;

-- p_criterion: {criterion_key, title, description, weight, applies_to, sort_order, is_active, levels:[{level:1..4, descriptor}]}
CREATE OR REPLACE FUNCTION public.admin_sim_ai_upsert_criterion(p_scenario_id UUID, p_criterion JSONB, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('ai.simulator.author', p_admin_user_id);
  v_key TEXT := p_criterion ->> 'criterion_key';
  v_before JSONB; v_after JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sim.scenarios WHERE id = p_scenario_id) THEN RAISE EXCEPTION 'Scenario not found'; END IF;
  IF v_key IS NULL OR v_key !~ '^[a-z][a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'Criterion key must be lower_snake_case'; END IF;
  IF COALESCE(btrim(p_criterion ->> 'title'), '') = '' THEN RAISE EXCEPTION 'A title is required'; END IF;
  IF COALESCE((p_criterion ->> 'weight')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Weight must be more than 0'; END IF;
  IF jsonb_typeof(p_criterion -> 'levels') <> 'array' OR jsonb_array_length(p_criterion -> 'levels') <> 4
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_criterion -> 'levels') l
                 WHERE (l ->> 'level')::int NOT BETWEEN 1 AND 4 OR COALESCE(btrim(l ->> 'descriptor'), '') = '') THEN
    RAISE EXCEPTION 'Describe each of the four levels';
  END IF;
  IF COALESCE(p_criterion ->> 'applies_to', 'both') NOT IN ('decision', 'run_end', 'both') THEN RAISE EXCEPTION 'Unknown assessment point'; END IF;

  SELECT to_jsonb(r) INTO v_before FROM sim.scenario_rubrics r WHERE r.scenario_id = p_scenario_id AND r.criterion_key = v_key;
  INSERT INTO sim.scenario_rubrics (scenario_id, criterion_key, title, description, weight, levels, applies_to, sort_order, is_active, updated_by_admin)
  VALUES (p_scenario_id, v_key, btrim(p_criterion ->> 'title'), NULLIF(btrim(p_criterion ->> 'description'), ''), (p_criterion ->> 'weight')::numeric,
          p_criterion -> 'levels', COALESCE(p_criterion ->> 'applies_to', 'both'), COALESCE((p_criterion ->> 'sort_order')::int, 100),
          COALESCE((p_criterion ->> 'is_active')::boolean, TRUE), v_admin)
  ON CONFLICT (scenario_id, criterion_key) DO UPDATE SET
    title = EXCLUDED.title, description = EXCLUDED.description, weight = EXCLUDED.weight, levels = EXCLUDED.levels,
    applies_to = EXCLUDED.applies_to, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active,
    updated_at = NOW(), updated_by_admin = EXCLUDED.updated_by_admin;
  SELECT to_jsonb(r) INTO v_after FROM sim.scenario_rubrics r WHERE r.scenario_id = p_scenario_id AND r.criterion_key = v_key;
  PERFORM admin.log_admin_action(v_admin, 'ai.sim_rubric_upsert', 'sim_scenario', p_scenario_id,
    jsonb_build_object('reason', p_reason, 'criterion', v_key), v_before, v_after);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sim_ai_update_scenario(p_scenario_id UUID, p_changes JSONB, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('ai.simulator.author', p_admin_user_id);
  v_before JSONB; v_after JSONB; v_state JSONB; k TEXT;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb)) LOOP
    IF k NOT IN ('assessor_counts', 'assessor_weight', 'adaptive_enabled', 'min_difficulty', 'max_difficulty') THEN
      RAISE EXCEPTION '"%" cannot be changed here', k;
    END IF;
  END LOOP;
  SELECT jsonb_build_object('assessor_counts', assessor_counts, 'assessor_weight', assessor_weight, 'adaptive_enabled', adaptive_enabled,
                            'min_difficulty', min_difficulty, 'max_difficulty', max_difficulty)
    INTO v_before FROM sim.scenarios WHERE id = p_scenario_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Scenario not found'; END IF;

  IF COALESCE((p_changes ->> 'assessor_counts')::boolean, FALSE) AND NOT (v_before ->> 'assessor_counts')::boolean THEN
    v_state := public.admin_sim_ai_calibration_state(p_scenario_id);
    IF NOT COALESCE((v_state ->> 'is_calibrated')::boolean, FALSE) THEN
      RAISE EXCEPTION 'Not calibrated yet: % of 30 author-scored assessments, agreement % %% (needs 80%%)',
        v_state ->> 'calibrated_assessments', COALESCE(v_state ->> 'agreement', '—');
    END IF;
  END IF;

  UPDATE sim.scenarios SET
    assessor_counts  = COALESCE((p_changes ->> 'assessor_counts')::boolean, assessor_counts),
    assessor_weight  = COALESCE((p_changes ->> 'assessor_weight')::numeric, assessor_weight),
    adaptive_enabled = COALESCE((p_changes ->> 'adaptive_enabled')::boolean, adaptive_enabled),
    min_difficulty   = COALESCE((p_changes ->> 'min_difficulty')::smallint, min_difficulty),
    max_difficulty   = COALESCE((p_changes ->> 'max_difficulty')::smallint, max_difficulty),
    updated_at = NOW()
  WHERE id = p_scenario_id;

  SELECT jsonb_build_object('assessor_counts', assessor_counts, 'assessor_weight', assessor_weight, 'adaptive_enabled', adaptive_enabled,
                            'min_difficulty', min_difficulty, 'max_difficulty', max_difficulty)
    INTO v_after FROM sim.scenarios WHERE id = p_scenario_id;
  PERFORM admin.log_admin_action(v_admin, 'ai.sim_scenario_update', 'sim_scenario', p_scenario_id, jsonb_build_object('reason', p_reason), v_before, v_after);
  RETURN v_after;
END;
$$;

-- p_levels: {criterion_key: level}
CREATE OR REPLACE FUNCTION public.admin_sim_ai_calibrate(p_assessment_id UUID, p_levels JSONB, p_notes TEXT DEFAULT NULL, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('ai.simulator.author', p_admin_user_id);
  v_a sim.ai_assessments;
  v_total INT := 0; v_within INT := 0; v_points NUMERIC := 0; v_weights NUMERIC := 0;
  c JSONB; v_lvl INT; v_w NUMERIC;
  v_agreement NUMERIC; v_overall NUMERIC;
BEGIN
  SELECT * INTO v_a FROM sim.ai_assessments WHERE id = p_assessment_id;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Assessment not found'; END IF;
  IF p_levels IS NULL OR jsonb_typeof(p_levels) <> 'object' THEN RAISE EXCEPTION 'Give your level for each criterion'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(v_a.criteria) LOOP
    CONTINUE WHEN NOT (p_levels ? (c ->> 'criterion_key'));
    v_lvl := (p_levels ->> (c ->> 'criterion_key'))::int;
    IF v_lvl NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Levels must be 1–4'; END IF;
    v_total := v_total + 1;
    IF abs(v_lvl - (c ->> 'level')::int) <= 1 THEN v_within := v_within + 1; END IF;
    SELECT weight INTO v_w FROM sim.scenario_rubrics WHERE scenario_id = v_a.scenario_id AND criterion_key = c ->> 'criterion_key';
    v_w := COALESCE(v_w, 1);
    v_points := v_points + ((v_lvl - 1) / 3.0 * 100) * v_w;
    v_weights := v_weights + v_w;
  END LOOP;
  IF v_total = 0 THEN RAISE EXCEPTION 'Give your level for at least one criterion'; END IF;
  v_agreement := ROUND(v_within * 100.0 / v_total, 2);
  v_overall := ROUND(v_points / NULLIF(v_weights, 0), 2);

  INSERT INTO sim.ai_assessment_calibration (assessment_id, author_admin_id, author_levels, author_overall, agreement, notes)
  VALUES (p_assessment_id, v_admin, p_levels, v_overall, v_agreement, NULLIF(btrim(p_notes), ''))
  ON CONFLICT (assessment_id, author_admin_id) DO UPDATE SET
    author_levels = EXCLUDED.author_levels, author_overall = EXCLUDED.author_overall, agreement = EXCLUDED.agreement,
    notes = EXCLUDED.notes, created_at = NOW();
  PERFORM admin.log_admin_action(v_admin, 'ai.sim_calibrate', 'sim_ai_assessment', p_assessment_id,
    jsonb_build_object('agreement', v_agreement, 'author_overall', v_overall, 'ai_overall', v_a.overall_score), NULL, NULL);
  RETURN jsonb_build_object('agreement', v_agreement, 'author_overall', v_overall, 'state', public.admin_sim_ai_calibration_state(v_a.scenario_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sim_ai_review_flag(p_flag_id UUID, p_status TEXT, p_note TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.simulator.author', p_admin_user_id); v JSONB;
BEGIN
  IF p_status NOT IN ('upheld', 'dismissed') THEN RAISE EXCEPTION 'Status must be upheld or dismissed'; END IF;
  IF COALESCE(btrim(p_note), '') = '' THEN RAISE EXCEPTION 'A note is required'; END IF;
  UPDATE sim.ai_assessment_flags SET status = p_status, review_note = p_note, reviewed_by_admin = v_admin, reviewed_at = NOW()
   WHERE id = p_flag_id;
  SELECT to_jsonb(f) INTO v FROM sim.ai_assessment_flags f WHERE f.id = p_flag_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Flag not found'; END IF;
  PERFORM admin.log_admin_action(v_admin, 'ai.sim_flag_review', 'sim_ai_assessment_flag', p_flag_id, jsonb_build_object('status', p_status, 'note', p_note), NULL, NULL);
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sim_ai_list_personas(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'role_name', role_name, 'character_name', character_name, 'character_initials', character_initials,
      'personality', personality, 'communication_style', communication_style, 'goals', goals, 'concerns', concerns,
      'priorities', priorities, 'red_lines', red_lines, 'persona_notes', persona_notes, 'created_at', created_at, 'updated_at', updated_at)
    ORDER BY lower(character_name), created_at) FROM sim.npc_characters), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sim_ai_update_persona(p_npc_id UUID, p_changes JSONB, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.simulator.author', p_admin_user_id); v_before JSONB; v_after JSONB; k TEXT;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb)) LOOP
    IF k NOT IN ('personality', 'communication_style', 'goals', 'concerns', 'priorities', 'red_lines', 'persona_notes') THEN
      RAISE EXCEPTION '"%" cannot be changed here', k;
    END IF;
  END LOOP;
  IF p_changes ? 'personality' AND (p_changes ->> 'personality') NOT IN ('demanding', 'supportive', 'cautious', 'optimistic', 'balanced') THEN
    RAISE EXCEPTION 'Unknown personality';
  END IF;
  SELECT to_jsonb(n) INTO v_before FROM sim.npc_characters n WHERE id = p_npc_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Stakeholder not found'; END IF;
  UPDATE sim.npc_characters SET
    personality = COALESCE(p_changes ->> 'personality', personality),
    communication_style = CASE WHEN p_changes ? 'communication_style' THEN NULLIF(p_changes ->> 'communication_style', '') ELSE communication_style END,
    goals = CASE WHEN p_changes ? 'goals' THEN NULLIF(p_changes ->> 'goals', '') ELSE goals END,
    concerns = CASE WHEN p_changes ? 'concerns' THEN NULLIF(p_changes ->> 'concerns', '') ELSE concerns END,
    priorities = CASE WHEN p_changes ? 'priorities' THEN NULLIF(p_changes ->> 'priorities', '') ELSE priorities END,
    red_lines = CASE WHEN p_changes ? 'red_lines' THEN NULLIF(p_changes ->> 'red_lines', '') ELSE red_lines END,
    persona_notes = CASE WHEN p_changes ? 'persona_notes' THEN NULLIF(p_changes ->> 'persona_notes', '') ELSE persona_notes END,
    updated_at = NOW(), updated_by_admin = v_admin
  WHERE id = p_npc_id;
  SELECT to_jsonb(n) INTO v_after FROM sim.npc_characters n WHERE id = p_npc_id;
  PERFORM admin.log_admin_action(v_admin, 'ai.sim_persona_update', 'sim_npc_character', p_npc_id, jsonb_build_object('reason', p_reason), v_before, v_after);
  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sim_ai_list_scenarios(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sim_ai_get_scenario(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sim_ai_upsert_criterion(UUID, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sim_ai_update_scenario(UUID, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sim_ai_calibrate(UUID, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sim_ai_review_flag(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sim_ai_list_personas(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sim_ai_update_persona(UUID, JSONB, TEXT, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
SELECT 'v239 applied' AS status;
