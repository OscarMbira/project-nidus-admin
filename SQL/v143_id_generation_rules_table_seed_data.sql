-- ============================================================================
-- v143: Seed ID generation rule for admin.id_generation_rules
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v145 (abbreviation alternate key); v144 helpers recommended
-- ============================================================================

DO $guard$
BEGIN
    IF to_regprocedure('admin._id_gen_seed_resolve_abbrev(text,text)') IS NULL THEN
        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION admin._id_gen_seed_resolve_abbrev(
                p_target_table TEXT,
                p_preferred TEXT DEFAULT NULL
            )
            RETURNS TEXT
            LANGUAGE plpgsql
            AS $body$
            DECLARE
                v_preferred TEXT;
            BEGIN
                v_preferred := upper(trim(COALESCE(p_preferred, '')));
                IF v_preferred ~ '^[A-Z]{1,4}$'
                   AND NOT EXISTS (
                       SELECT 1 FROM admin.id_generation_rules r
                       WHERE r.table_abbreviation = v_preferred
                         AND r.target_table <> p_target_table
                   ) THEN
                    RETURN v_preferred;
                END IF;
                RETURN admin._id_gen_default_abbreviation(p_target_table);
            END;
            $body$;
        $fn$;
    END IF;
END $guard$;

DO $$
DECLARE
    v_admin UUID;
    v_abbrev TEXT;
BEGIN
    IF to_regclass('admin.id_generation_rules') IS NULL THEN
        RAISE NOTICE 'v143: admin.id_generation_rules table missing — skipped.';
        RETURN;
    END IF;

    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin' AND activation_status = 'active'
    ORDER BY created_at LIMIT 1;

    DELETE FROM admin.id_generation_rules
    WHERE target_table = 'admin.id_generation_rules'
      AND id <> 'a1000003-0003-4003-8003-000000000003'::uuid;

    v_abbrev := admin._id_gen_seed_resolve_abbrev('admin.id_generation_rules', 'IDR');

    INSERT INTO admin.id_generation_rules (
        id, target_table, table_abbreviation, table_description,
        separator, suffix, letter_case, segment_type,
        num_letters, num_digits, excluded_chars,
        seed_value, current_sequence, is_active, created_by, updated_by
    )
    VALUES (
        'a1000003-0003-4003-8003-000000000003'::uuid,
        'admin.id_generation_rules',
        v_abbrev,
        COALESCE(admin._id_gen_table_description('admin.id_generation_rules'), 'ID generation format rules catalog'),
        '-', '', 'uppercase', 'alphanumeric',
        3, 4, 'O0I1L',
        1, 0, TRUE, v_admin, v_admin
    )
    ON CONFLICT (id) DO UPDATE SET
        target_table = EXCLUDED.target_table,
        table_abbreviation = EXCLUDED.table_abbreviation,
        table_description = EXCLUDED.table_description,
        segment_type = EXCLUDED.segment_type,
        num_letters = EXCLUDED.num_letters,
        num_digits = EXCLUDED.num_digits,
        excluded_chars = EXCLUDED.excluded_chars,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW();
END $$;

DO $$
BEGIN
    RAISE NOTICE 'v143: ID generation rule seed for admin.id_generation_rules applied.';
END $$;
