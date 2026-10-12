-- =============================================================================
-- v222: Sequential ID rules for Assumptions Register references
-- Companion monorepo SQL: E:\project-nidus\SQL\v1115_assumptions_id_generation.sql
-- Codes: ASM-2026-001 (public.assumptions.assumption_code)
--        SASM-2026-001 (sim.assumptions.assumption_code)
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
        RAISE NOTICE 'v222: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    FOR r IN
        SELECT *
        FROM (
            VALUES
                (
                    'public.assumptions'::text,
                    'ASM'::varchar,
                    'Assumption references (Platform)'::text,
                    'project_id'::text,
                    3
                ),
                (
                    'sim.assumptions'::text,
                    'SASM'::varchar,
                    'Assumption references (Simulator)'::text,
                    'project_id'::text,
                    3
                )
        ) AS t(target_table, table_abbreviation, table_description, scope_column, num_digits)
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
                TRUE,
                'YYYY',
                r.scope_column
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
                TRUE,
                'YYYY',
                r.scope_column
            );
        END IF;
    END LOOP;

    RAISE NOTICE 'v222: assumptions ID generation rules seeded';
END $$;
