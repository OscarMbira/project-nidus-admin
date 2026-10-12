-- =============================================================================
-- v221: Seed sequential ID rules for Benefits Review Plan document_ref
-- Companion monorepo SQL: E:\project-nidus\SQL\v1073_benefits_review_plan_document_ref.sql
-- Codes: BRP-2026-001 (public), SBRP-2026-001 (sim practice)
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
        RAISE NOTICE 'v221: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    FOR r IN
        SELECT *
        FROM (
            VALUES
                (
                    'public.benefits_review_plans'::text,
                    'BRP'::varchar,
                    'Benefits Review Plan document references (Platform)'::text,
                    3
                ),
                (
                    'sim.practice_benefits_review_plans'::text,
                    'SBRP'::varchar,
                    'Practice Benefits Review Plan document references (Simulator)'::text,
                    3
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
                TRUE,
                'YYYY',
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
                TRUE,
                'YYYY',
                NULL
            );
        END IF;
    END LOOP;

    RAISE NOTICE 'v221: benefits_review_plans ID generation rules seeded';
END $$;
