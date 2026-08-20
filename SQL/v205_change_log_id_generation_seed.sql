-- =============================================================================
-- v205: Seed sequential ID rules for Platform/Simulator change log display_id
-- Companion monorepo SQL: E:\project-nidus\SQL\v876_change_log_display_id.sql
-- Codes: CLG-0001 (public.change_log), SCLG-0001 (sim.practice_change_log)
-- Idempotent: safe to re-run.
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
        RAISE NOTICE 'v205: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    FOR r IN
        SELECT *
        FROM (
            VALUES
                (
                    'public.change_log'::text,
                    'CLG'::varchar,
                    'Change request log entry codes (Platform)'::text,
                    4
                ),
                (
                    'sim.practice_change_log'::text,
                    'SCLG'::varchar,
                    'Practice change log entry codes (Simulator)'::text,
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

    RAISE NOTICE 'v205: change_log ID rules (CLG/SCLG) seeded — apply monorepo v876 for column + trigger + backfill';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v205_change_log_id_generation_seed.sql applied';
END $$;
