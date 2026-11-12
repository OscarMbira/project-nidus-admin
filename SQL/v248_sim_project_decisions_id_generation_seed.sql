-- ============================================================================
-- v248: ID Generation rule for sim.project_decisions (Simulator decision IDs)
-- Admin schema — companion to project-nidus SQL/v1448_sim_decision_log_practice_projects.sql
-- Feature: project-nidus projectplan/v1340_core_pm_waves_2_to_4_plan.md (Simulator Decision
-- Log moved to the sim schema; rule 16.2).
-- Creates the rule only when sim.project_decisions has none. An existing rule is left exactly
-- as configured (first run failed: a rule already existed and SDEC is taken by another rule).
-- New rule: format SDEC-001 numbered per practice project (project_id); if SDEC is already in
-- use by another active rule, SIMDEC is used instead.
-- Pattern: v245, rewritten with inline subqueries (no variables) for the SQL editor.
-- Idempotent. Run before project-nidus v1448.
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('sim.project_decisions') IS NULL THEN
        RAISE NOTICE 'v248: skipping — sim.project_decisions does not exist in this database';
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'sim.project_decisions') THEN
        RAISE NOTICE 'v248: sim.project_decisions already has an ID Generation rule — left unchanged';
        RETURN;
    END IF;

    PERFORM admin.create_id_generation_rule(
        'sim.project_decisions',
        CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules
                          WHERE table_abbreviation = 'SDEC' AND is_active = TRUE)
             THEN 'SIMDEC' ELSE 'SDEC' END,
        'Simulator decision log identifiers',
        '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        'sequential', FALSE, NULL, 'project_id'
    );
END $$;

-- Check: the rule(s) for sim.project_decisions, and which rule holds SDEC.
SELECT target_table, table_abbreviation, generation_mode, scope_column, is_active
FROM admin.id_generation_rules
WHERE target_table = 'sim.project_decisions' OR table_abbreviation = 'SDEC'
ORDER BY target_table;
