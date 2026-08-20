-- =============================================================================
-- v201: Seed sequential ID rules for Platform/Simulator form_templates.template_code
-- (PM Local Forms — CLAUDE.md rule 16.2 / PRD D7)
-- Plan: E:\project-nidus\projectplan\v852_pm_local_forms_plan.md (Phase 2.1)
-- Prerequisites: E:\project-nidus\SQL\v854_form_templates_admin_display_id_trigger.sql,
--                v157 (create/update rule RPCs)
-- Idempotent: safe to re-run
-- Note: plan draft named this v198 — Admin repo already had v198–v200; this is v201.
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    r RECORD;
    v_rule_id UUID;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE NOTICE 'v201: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    -- FRM (Platform) / SFRM (Simulator) — sequential, no date, uppercase, separator -
    FOR r IN
        SELECT *
        FROM (
            VALUES
                (
                    'public.form_templates'::text,
                    'FRM'::varchar,
                    'Form template codes (Platform)'::text,
                    4
                ),
                (
                    'sim.form_templates'::text,
                    'SFRM'::varchar,
                    'Form template codes (Simulator)'::text,
                    4
                )
        ) AS t(target_table, table_abbreviation, table_description, num_digits)
    LOOP
        SELECT id INTO v_rule_id
        FROM admin.id_generation_rules
        WHERE admin.normalize_id_generation_target_table(target_table)
            = admin.normalize_id_generation_target_table(r.target_table)
        LIMIT 1;

        IF v_rule_id IS NOT NULL THEN
            PERFORM admin.update_id_generation_rule(
                v_rule_id,
                r.target_table,
                r.table_abbreviation,
                r.table_description,
                '-',
                '',
                'uppercase',
                'numeric',
                0,
                r.num_digits,
                '',
                1,
                TRUE,
                v_admin,
                'sequential',
                FALSE,
                NULL,
                NULL
            );
        ELSE
            PERFORM admin.create_id_generation_rule(
                r.target_table,
                r.table_abbreviation,
                r.table_description,
                '-',
                '',
                'uppercase',
                'numeric',
                0,
                r.num_digits,
                '',
                1,
                TRUE,
                v_admin,
                'sequential',
                FALSE,
                NULL,
                NULL
            );
        END IF;
    END LOOP;

    RAISE NOTICE 'v201: form_templates ID rules (FRM/SFRM) seeded — new rows get codes via E:\project-nidus\SQL\v854_form_templates_admin_display_id_trigger.sql (no backfill of existing F0xx)';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v201_form_templates_id_generation_seed.sql applied';
END $$;
