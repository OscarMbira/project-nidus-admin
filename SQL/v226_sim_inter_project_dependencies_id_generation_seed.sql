-- =============================================================================
-- v226: Sequential ID rule for Simulator inter-project dependency codes (v1239 Slice 2)
-- Companion monorepo SQL: E:\project-nidus\SQL\v1242_sim_planning_parity_tables.sql
-- Code: SDEP-2026-001 (sim.inter_project_dependencies.dependency_code)
--       SIPD-2026-001 when SDEP is already an active abbreviation
-- Mirrors v223 (public.inter_project_dependencies). Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    v_rule_id UUID;
    v_abbrev VARCHAR(4);
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE NOTICE 'v226: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    v_abbrev := 'SDEP';
    IF EXISTS (
        SELECT 1
        FROM admin.id_generation_rules
        WHERE upper(table_abbreviation) = 'SDEP'
          AND is_active = TRUE
          AND admin.normalize_id_generation_target_table(target_table)
              <> admin.normalize_id_generation_target_table('sim.inter_project_dependencies')
    ) THEN
        v_abbrev := 'SIPD';
    END IF;

    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE admin.normalize_id_generation_target_table(target_table)
        = admin.normalize_id_generation_target_table('sim.inter_project_dependencies')
    LIMIT 1;

    IF v_rule_id IS NOT NULL THEN
        PERFORM admin.update_id_generation_rule(
            v_rule_id, 'sim.inter_project_dependencies', v_abbrev, 'Practice inter-project dependency codes',
            '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE, v_admin, 'sequential', TRUE, 'YYYY', NULL
        );
    ELSE
        PERFORM admin.create_id_generation_rule(
            'sim.inter_project_dependencies', v_abbrev, 'Practice inter-project dependency codes',
            '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE, v_admin, 'sequential', TRUE, 'YYYY', NULL
        );
    END IF;

    RAISE NOTICE 'v226: sim inter-project dependency ID rule seeded (%)', v_abbrev;
END $$;
