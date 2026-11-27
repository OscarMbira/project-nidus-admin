-- ============================================================================
-- v258: ID Generation rules for resource levelling runs and portfolio scenarios
-- Admin schema — companion to project-nidus SQL/v1572 and SQL/v1574.
-- Run after those files so the tables exist (a missing table is skipped).
-- Idempotent. An existing rule is left as configured.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.levelling_runs') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.levelling_runs') THEN
    PERFORM admin.create_id_generation_rule(
      'public.levelling_runs',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'LVL' AND is_active = TRUE)
           THEN 'LVLR' ELSE 'LVL' END,
      'Resource levelling run identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'project_id'
    );
  ELSE
    RAISE NOTICE 'v258: public.levelling_runs rule skipped (table missing or rule already present)';
  END IF;

  IF to_regclass('sim.levelling_runs') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'sim.levelling_runs') THEN
    PERFORM admin.create_id_generation_rule(
      'sim.levelling_runs',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'SLVL' AND is_active = TRUE)
           THEN 'SIMLVL' ELSE 'SLVL' END,
      'Simulator resource levelling run identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'project_id'
    );
  ELSE
    RAISE NOTICE 'v258: sim.levelling_runs rule skipped';
  END IF;

  IF to_regclass('public.portfolio_scenarios') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.portfolio_scenarios') THEN
    PERFORM admin.create_id_generation_rule(
      'public.portfolio_scenarios',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'PSC' AND is_active = TRUE)
           THEN 'PSCN' ELSE 'PSC' END,
      'Portfolio scenario identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'portfolio_id'
    );
  ELSE
    RAISE NOTICE 'v258: public.portfolio_scenarios rule skipped';
  END IF;

  IF to_regclass('sim.portfolio_scenarios') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'sim.portfolio_scenarios') THEN
    PERFORM admin.create_id_generation_rule(
      'sim.portfolio_scenarios',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'SPSC' AND is_active = TRUE)
           THEN 'SIMPSC' ELSE 'SPSC' END,
      'Simulator portfolio scenario identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'portfolio_id'
    );
  ELSE
    RAISE NOTICE 'v258: sim.portfolio_scenarios rule skipped';
  END IF;
END $$;
