-- ============================================================================
-- v144: ID generation rules — platform tables (acceptance / billing cluster)
-- PostgreSQL 15+ / Supabase
-- Abbreviation: first letter of each underscore segment (max 4), e.g. ABD
-- Description: title case from table name, e.g. Account Billing Delegates
-- Default format: 5 letters + 4 digits, alphanumeric
-- ============================================================================

CREATE OR REPLACE FUNCTION admin._id_gen_table_name_part(p_target_table TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN position('.' IN p_target_table) > 0 THEN split_part(p_target_table, '.', 2)
        ELSE p_target_table
    END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_table_description(p_target_table TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(
        trim(
            string_agg(
                initcap(part),
                ' '
                ORDER BY ord
            )
        ),
        ''
    )
    FROM unnest(
        string_to_array(admin._id_gen_table_name_part(p_target_table), '_')
    ) WITH ORDINALITY AS t(part, ord)
    WHERE part <> '';
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_table_abbreviation(p_target_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_name TEXT;
    v_parts TEXT[];
    v_abbrev TEXT;
BEGIN
    v_name := admin._id_gen_table_name_part(p_target_table);
    IF v_name IS NULL OR trim(v_name) = '' THEN
        RETURN 'XXX';
    END IF;

    v_parts := string_to_array(v_name, '_');
    IF COALESCE(array_length(v_parts, 1), 0) > 1 THEN
        SELECT string_agg(upper(substr(part, 1, 1)), '' ORDER BY ord)
        INTO v_abbrev
        FROM unnest(v_parts) WITH ORDINALITY AS t(part, ord)
        WHERE part <> '';
        RETURN substr(COALESCE(v_abbrev, 'X'), 1, 4);
    END IF;

    RETURN substr(upper(regexp_replace(v_name, '[^A-Za-z]', '', 'g')), 1, 3);
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_default_abbreviation(p_target_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_base TEXT;
    v_schema TEXT;
    v_candidate TEXT;
    v_letters TEXT[] := ARRAY['X', 'Y', 'Z', 'W', 'V'];
    v_li INTEGER;
BEGIN
    v_base := admin._id_gen_table_abbreviation(p_target_table);
    IF length(v_base) < 1 THEN
        v_base := 'XXX';
    END IF;

    IF position('.' IN p_target_table) > 0 THEN
        v_schema := split_part(p_target_table, '.', 1);
    ELSE
        v_schema := NULL;
    END IF;

    v_candidate := v_base;
    IF NOT EXISTS (
        SELECT 1 FROM admin.id_generation_rules r
        WHERE r.table_abbreviation = v_candidate
          AND r.target_table <> p_target_table
    ) THEN
        RETURN v_candidate;
    END IF;

    IF v_schema IS NOT NULL AND v_schema <> 'public' THEN
        v_candidate := substr(upper(substr(v_schema, 1, 1) || v_base), 1, 4);
        IF NOT EXISTS (
            SELECT 1 FROM admin.id_generation_rules r
            WHERE r.table_abbreviation = v_candidate
              AND r.target_table <> p_target_table
        ) THEN
            RETURN v_candidate;
        END IF;

        IF length(v_schema) >= 2 THEN
            v_candidate := substr(upper(substr(v_schema, 1, 2) || v_base), 1, 4);
            IF NOT EXISTS (
                SELECT 1 FROM admin.id_generation_rules r
                WHERE r.table_abbreviation = v_candidate
                  AND r.target_table <> p_target_table
            ) THEN
                RETURN v_candidate;
            END IF;
        END IF;
    END IF;

    v_li := 1;
    WHILE v_li <= COALESCE(array_length(v_letters, 1), 0) LOOP
        v_candidate := substr(v_base, 1, 3) || v_letters[v_li];
        IF NOT EXISTS (
            SELECT 1 FROM admin.id_generation_rules r
            WHERE r.table_abbreviation = v_candidate
              AND r.target_table <> p_target_table
        ) THEN
            RETURN v_candidate;
        END IF;
        v_li := v_li + 1;
    END LOOP;

    RAISE EXCEPTION 'ID_ABBREVIATION_EXHAUSTED: Unable to derive a unique abbreviation for %', p_target_table
        USING ERRCODE = 'P0001';
END;
$$;

-- Requires v146 _id_gen_seed_resolve_abbrev when run standalone; defined inline if missing.
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
    v_desc TEXT;
    r RECORD;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin' AND activation_status = 'active'
    ORDER BY created_at LIMIT 1;

    FOR r IN
        SELECT *
        FROM (
            VALUES
                ('a1000004-0004-4004-8004-000000000001'::uuid, 'public.acceptance_records'::text, 'AR'::text),
                ('a1000004-0004-4004-8004-000000000002'::uuid, 'public.account_billing_audit_log', 'ABAL'),
                ('a1000004-0004-4004-8004-000000000003'::uuid, 'public.account_billing_delegates', 'ABD'),
                ('a1000004-0004-4004-8004-000000000004'::uuid, 'public.account_links', 'AL'),
                ('a1000004-0004-4004-8004-000000000005'::uuid, 'public.activity_attributes', 'AA')
        ) AS seed(rule_id, target_table, preferred_abbrev)
        ORDER BY seed.target_table
    LOOP
        IF to_regclass(r.target_table) IS NULL THEN
            CONTINUE;
        END IF;

        DELETE FROM admin.id_generation_rules
        WHERE target_table = r.target_table
          AND id <> r.rule_id;

        v_abbrev := admin._id_gen_seed_resolve_abbrev(r.target_table, r.preferred_abbrev);
        v_desc := admin._id_gen_table_description(r.target_table);

        INSERT INTO admin.id_generation_rules (
            id, target_table, table_abbreviation, table_description,
            separator, suffix, letter_case, segment_type,
            num_letters, num_digits, excluded_chars,
            seed_value, current_sequence, is_active, created_by, updated_by
        )
        VALUES (
            r.rule_id, r.target_table, v_abbrev, v_desc,
            '-', '', 'uppercase', 'alphanumeric',
            5, 4, 'O0I1L',
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
    END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION admin._id_gen_table_name_part(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_table_description(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_table_abbreviation(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION admin._id_gen_ensure_rule(p_target_table TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_rule_id UUID;
    v_abbrev TEXT;
BEGIN
    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE target_table = p_target_table
      AND is_active = TRUE
    LIMIT 1;

    IF FOUND THEN
        RETURN v_rule_id;
    END IF;

    v_abbrev := admin._id_gen_default_abbreviation(p_target_table);

    INSERT INTO admin.id_generation_rules (
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
        p_target_table,
        v_abbrev,
        COALESCE(admin._id_gen_table_description(p_target_table), 'Auto-generated default rule'),
        '-',
        '',
        'uppercase',
        'alphanumeric',
        5,
        4,
        '',
        1,
        0,
        TRUE,
        NULL,
        NULL
    )
    RETURNING id INTO v_rule_id;

    RETURN v_rule_id;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'v144: Platform table ID generation rules seed applied.';
END $$;
