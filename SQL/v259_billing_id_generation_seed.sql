-- ============================================================================
-- v259: ID Generation rules for clients, client invoices and credit notes
-- Admin schema — companion to project-nidus SQL/v1577 and SQL/v1578.
-- Run after those files so the tables exist (a missing table is skipped).
-- Idempotent. An existing rule is left as configured.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.clients') THEN
    PERFORM admin.create_id_generation_rule(
      'public.clients',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'CLT' AND is_active = TRUE) THEN 'CLNT' ELSE 'CLT' END,
      'Client organisation identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'account_id'
    );
  ELSE
    RAISE NOTICE 'v259: public.clients rule skipped';
  END IF;

  IF to_regclass('sim.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'sim.clients') THEN
    PERFORM admin.create_id_generation_rule(
      'sim.clients',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'SCLT' AND is_active = TRUE) THEN 'SIMCLT' ELSE 'SCLT' END,
      'Simulator client organisation identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, NULL
    );
  ELSE
    RAISE NOTICE 'v259: sim.clients rule skipped';
  END IF;

  IF to_regclass('public.client_invoices') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.client_invoices') THEN
    PERFORM admin.create_id_generation_rule(
      'public.client_invoices',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'INV' AND is_active = TRUE) THEN 'CINV' ELSE 'INV' END,
      'Client invoice identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'project_id'
    );
  ELSE
    RAISE NOTICE 'v259: public.client_invoices rule skipped';
  END IF;

  IF to_regclass('sim.client_invoices') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'sim.client_invoices') THEN
    PERFORM admin.create_id_generation_rule(
      'sim.client_invoices',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'SINV' AND is_active = TRUE) THEN 'SIMINV' ELSE 'SINV' END,
      'Simulator client invoice identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, 'project_id'
    );
  ELSE
    RAISE NOTICE 'v259: sim.client_invoices rule skipped';
  END IF;

  IF to_regclass('public.client_credit_notes') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.client_credit_notes') THEN
    PERFORM admin.create_id_generation_rule(
      'public.client_credit_notes',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'CRN' AND is_active = TRUE) THEN 'CCRN' ELSE 'CRN' END,
      'Client credit note identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, NULL
    );
  ELSE
    RAISE NOTICE 'v259: public.client_credit_notes rule skipped';
  END IF;

  IF to_regclass('sim.client_credit_notes') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'sim.client_credit_notes') THEN
    PERFORM admin.create_id_generation_rule(
      'sim.client_credit_notes',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'SCRN' AND is_active = TRUE) THEN 'SIMCRN' ELSE 'SCRN' END,
      'Simulator client credit note identifiers',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, NULL
    );
  ELSE
    RAISE NOTICE 'v259: sim.client_credit_notes rule skipped';
  END IF;
END $$;
