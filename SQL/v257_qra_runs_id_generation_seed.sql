-- ============================================================================
-- v257: ID Generation rules for quantitative risk analysis runs (v1355)
-- Admin schema — companion to project-nidus SQL/v1567_qra_schedule_model.sql
-- public.qra_runs → QRA-001 per project. sim.qra_runs → SQRA-001 per project.
-- An existing rule is left as configured. Run after project-nidus v1567 so the
-- tables exist (this file skips a table that is not there yet).
-- Idempotent. Pattern: v248.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.qra_runs') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.qra_runs') THEN
    PERFORM admin.create_id_generation_rule(
      'public.qra_runs',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'QRA' AND is_active = TRUE)
           THEN 'QRAN' ELSE 'QRA' END,
      'Quantitative risk analysis run identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'project_id'
    );
  ELSE
    RAISE NOTICE 'v257: public.qra_runs rule skipped (table missing or rule already present)';
  END IF;

  IF to_regclass('sim.qra_runs') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'sim.qra_runs') THEN
    PERFORM admin.create_id_generation_rule(
      'sim.qra_runs',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'SQRA' AND is_active = TRUE)
           THEN 'SIMQRA' ELSE 'SQRA' END,
      'Simulator quantitative risk analysis run identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'project_id'
    );
  ELSE
    RAISE NOTICE 'v257: sim.qra_runs rule skipped (table missing or rule already present)';
  END IF;
END $$;

SELECT target_table, table_abbreviation, generation_mode, scope_column, is_active
FROM admin.id_generation_rules
WHERE target_table IN ('public.qra_runs', 'sim.qra_runs')
ORDER BY target_table;
