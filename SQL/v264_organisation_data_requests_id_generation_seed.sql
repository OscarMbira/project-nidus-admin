-- ============================================================================
-- v264: ID Generation rule for organisation data requests (monorepo v1358, PRD rule 16.2)
-- Admin schema — companion to project-nidus SQL/v1600_organisation_data_export.sql.
-- Run after v1600 so the table exists (a missing table is skipped). Idempotent; an existing rule is
-- left as configured. References look like ODR-001 (one sequence across organisations, so a support
-- ticket can quote it).
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.organisation_data_requests') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.organisation_data_requests') THEN
    PERFORM admin.create_id_generation_rule(
      'public.organisation_data_requests',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'ODR' AND is_active = TRUE) THEN 'ODRQ' ELSE 'ODR' END,
      'Organisation data export and deletion request identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, NULL
    );
  ELSE
    RAISE NOTICE 'v264: public.organisation_data_requests rule skipped (table missing or rule already exists)';
  END IF;
END $$;

SELECT target_table, table_abbreviation, generation_mode, is_active
  FROM admin.id_generation_rules
 WHERE target_table = 'public.organisation_data_requests';
