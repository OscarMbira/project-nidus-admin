-- ============================================================================
-- v146: Regenerate all ID generation rule seeds with unique abbreviations
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v144 (helpers), v145 (global abbreviation alternate key)
--
-- Re-upserts every rule from v20 / v143 / v144 in deterministic order.
-- Preferred abbreviations are kept when still available; otherwise falls back
-- to admin._id_gen_default_abbreviation (schema-aware disambiguation).
-- Safe to re-run (idempotent by fixed rule UUID).
-- ============================================================================

CREATE OR REPLACE FUNCTION admin._id_gen_seed_resolve_abbrev(
    p_target_table TEXT,
    p_preferred TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_preferred TEXT;
BEGIN
    v_preferred := upper(trim(COALESCE(p_preferred, '')));

    IF v_preferred ~ '^[A-Z]{1,4}$'
       AND NOT EXISTS (
           SELECT 1
           FROM admin.id_generation_rules r
           WHERE r.table_abbreviation = v_preferred
             AND r.target_table <> p_target_table
       ) THEN
        RETURN v_preferred;
    END IF;

    RETURN admin._id_gen_default_abbreviation(p_target_table);
END;
$$;

GRANT EXECUTE ON FUNCTION admin._id_gen_seed_resolve_abbrev(TEXT, TEXT) TO authenticated, service_role;

DO $$
DECLARE
    v_admin UUID;
    v_abbrev TEXT;
    v_desc TEXT;
    r RECORD;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    FOR r IN
        SELECT *
        FROM (
            VALUES
                -- v20 core rules (claim preferred abbrevs first)
                ('a1000001-0001-4001-8001-000000000001'::uuid, 'public.users'::text, 'USR'::text, 'Platform user accounts'::text, '-'::text, ''::text, 'uppercase'::text, 'alphanumeric'::text, 3, 4, ''::text),
                ('a1000001-0001-4001-8001-000000000002'::uuid, 'public.accounts', 'ACC', 'Platform organisations / accounts', '-', '', 'uppercase', 'alphanumeric', 2, 3, ''),
                ('a1000001-0001-4001-8001-000000000003'::uuid, 'public.platform_subscriptions', 'SUB', 'Platform and simulator subscription records', '-', '', 'uppercase', 'alphanumeric', 3, 4, 'O0I1L'),
                ('a1000001-0001-4001-8001-000000000004'::uuid, 'public.projects', 'PRJ', 'Platform projects overview', '-', '', 'uppercase', 'alphanumeric', 2, 4, ''),
                ('a1000002-0002-4002-8002-000000000001'::uuid, 'sim.scenarios', 'SCE', 'Simulator training scenarios', '.', '', 'uppercase', 'alphanumeric', 2, 4, ''),
                ('a1000002-0002-4002-8002-000000000002'::uuid, 'sim.certificates', 'CRT', 'Simulator completion certificates', '', '', 'uppercase', 'alphanumeric', 3, 3, ''),
                ('a1000002-0002-4002-8002-000000000003'::uuid, 'sim.leaderboard_entries', 'LDB', 'Simulator leaderboard rows', '-', '', 'uppercase', 'alphanumeric', 2, 4, ''),
                ('a1000002-0002-4002-8002-000000000004'::uuid, 'sim.learning_paths', 'LRN', 'Simulator learning paths', '-', '', 'uppercase', 'alphanumeric', 3, 3, ''),
                ('a1000002-0002-4002-8002-000000000005'::uuid, 'sim.npcs', 'NPC', 'Simulator non-player characters', '-', '', 'uppercase', 'alphanumeric', 3, 3, ''),
                ('a1000003-0003-4003-8003-000000000001'::uuid, 'admin.admin_users', 'ADU', 'Admin panel user accounts', '-', '', 'uppercase', 'alphanumeric', 3, 4, ''),
                ('a1000003-0003-4003-8003-000000000002'::uuid, 'admin.support_tickets', 'SPT', 'Customer support tickets', '*', '', 'uppercase', 'alphanumeric', 4, 4, 'O0I1L'),
                -- v143
                ('a1000003-0003-4003-8003-000000000003'::uuid, 'admin.id_generation_rules', 'IDR', 'ID generation format rules catalog', '-', '', 'uppercase', 'alphanumeric', 3, 4, 'O0I1L'),
                -- v144 platform cluster
                ('a1000004-0004-4004-8004-000000000001'::uuid, 'public.acceptance_records', 'AR', NULL, '-', '', 'uppercase', 'alphanumeric', 5, 4, 'O0I1L'),
                ('a1000004-0004-4004-8004-000000000002'::uuid, 'public.account_billing_audit_log', 'ABAL', NULL, '-', '', 'uppercase', 'alphanumeric', 5, 4, 'O0I1L'),
                ('a1000004-0004-4004-8004-000000000003'::uuid, 'public.account_billing_delegates', 'ABD', NULL, '-', '', 'uppercase', 'alphanumeric', 5, 4, 'O0I1L'),
                ('a1000004-0004-4004-8004-000000000004'::uuid, 'public.account_links', 'AL', NULL, '-', '', 'uppercase', 'alphanumeric', 5, 4, 'O0I1L'),
                ('a1000004-0004-4004-8004-000000000005'::uuid, 'public.activity_attributes', 'AA', NULL, '-', '', 'uppercase', 'alphanumeric', 5, 4, 'O0I1L'),
                -- sim counterpart (resolves to SAA when public.activity_attributes holds AA)
                ('a1000004-0004-4004-8004-000000000006'::uuid, 'sim.activity_attributes', NULL, NULL, '-', '', 'uppercase', 'alphanumeric', 5, 4, 'O0I1L')
        ) AS seed(
            rule_id,
            target_table,
            preferred_abbrev,
            description_override,
            separator,
            suffix,
            letter_case,
            segment_type,
            num_letters,
            num_digits,
            excluded_chars
        )
        ORDER BY seed.target_table
    LOOP
        IF to_regclass(r.target_table) IS NULL THEN
            RAISE NOTICE 'Skipping % — table not present', r.target_table;
            CONTINUE;
        END IF;

        -- Remove auto-created or stale rows for this table (different seed UUID).
        DELETE FROM admin.id_generation_rules
        WHERE target_table = r.target_table
          AND id <> r.rule_id;

        v_abbrev := admin._id_gen_seed_resolve_abbrev(r.target_table, r.preferred_abbrev);
        v_desc := COALESCE(r.description_override, admin._id_gen_table_description(r.target_table));

        INSERT INTO admin.id_generation_rules (
            id,
            target_table,
            table_abbreviation,
            table_description,
            separator,
            suffix,
            letter_case,
            segment_type,
            num_letters,
            num_digits,
            excluded_chars,
            seed_value,
            current_sequence,
            is_active,
            created_by,
            updated_by
        )
        VALUES (
            r.rule_id,
            r.target_table,
            v_abbrev,
            v_desc,
            r.separator,
            r.suffix,
            r.letter_case,
            r.segment_type,
            r.num_letters,
            r.num_digits,
            r.excluded_chars,
            1,
            0,
            TRUE,
            v_admin,
            v_admin
        )
        ON CONFLICT (id) DO UPDATE SET
            target_table = EXCLUDED.target_table,
            table_abbreviation = EXCLUDED.table_abbreviation,
            table_description = EXCLUDED.table_description,
            separator = EXCLUDED.separator,
            suffix = EXCLUDED.suffix,
            letter_case = EXCLUDED.letter_case,
            segment_type = EXCLUDED.segment_type,
            num_letters = EXCLUDED.num_letters,
            num_digits = EXCLUDED.num_digits,
            excluded_chars = EXCLUDED.excluded_chars,
            is_active = EXCLUDED.is_active,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

        RAISE NOTICE 'ID rule seed: % → % (%)', r.target_table, v_abbrev, r.rule_id;
    END LOOP;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'v146: ID generation rule seeds regenerated with unique abbreviations.';
END $$;
