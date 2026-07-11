-- ============================================================================
-- v138: ID generation capacity safeguards
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v20.0_id_generation_duplication_safeguards_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Constants / helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._id_gen_max_attempts()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT 20;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_effective_pool_size(p_pool TEXT, p_excluded TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(COUNT(*)::INTEGER, 0)
    FROM unnest(string_to_array(COALESCE(p_pool, ''), NULL)) AS c(ch)
    WHERE COALESCE(p_excluded, '') = '' OR position(c.ch IN p_excluded) = 0;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_binomial(n INTEGER, k INTEGER)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_n INTEGER := GREATEST(COALESCE(n, 0), 0);
    v_k INTEGER := GREATEST(COALESCE(k, 0), 0);
    v_kk INTEGER;
    v_result BIGINT := 1;
    i INTEGER;
BEGIN
    IF v_k > v_n THEN
        RETURN 0;
    END IF;

    v_kk := LEAST(v_k, v_n - v_k);
    FOR i IN 1..v_kk LOOP
        v_result := (v_result * (v_n - v_kk + i)) / i;
    END LOOP;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_keyspace_size(
    p_num_letters INTEGER,
    p_num_digits INTEGER,
    p_letter_case TEXT,
    p_excluded_chars TEXT,
    p_segment_type TEXT DEFAULT 'alphanumeric'
)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_type TEXT := COALESCE(NULLIF(trim(p_segment_type), ''), 'alphanumeric');
    v_letters INTEGER := GREATEST(COALESCE(p_num_letters, 0), 0);
    v_digits INTEGER := GREATEST(COALESCE(p_num_digits, 0), 0);
    v_letter_pool INTEGER;
    v_digit_pool INTEGER;
    v_per_letter BIGINT;
    v_result BIGINT := 1;
    v_max BIGINT := 9223372036854775807;
    i INTEGER;
BEGIN
    IF v_type NOT IN ('numeric', 'alpha', 'alphanumeric') THEN
        RAISE EXCEPTION 'Invalid segment_type: %', p_segment_type;
    END IF;

    v_letter_pool := admin._id_gen_effective_pool_size('ABCDEFGHIJKLMNOPQRSTUVWXYZ', p_excluded_chars);
    v_digit_pool := admin._id_gen_effective_pool_size('0123456789', p_excluded_chars);

    IF v_type IN ('alpha', 'alphanumeric') THEN
        v_per_letter := v_letter_pool;
        IF COALESCE(p_letter_case, 'uppercase') = 'mixed' THEN
            v_per_letter := v_letter_pool * 2;
        END IF;

        IF v_per_letter <= 0 AND v_letters > 0 THEN
            RETURN 0;
        END IF;

        FOR i IN 1..v_letters LOOP
            v_result := v_result * v_per_letter;
            IF v_result >= v_max THEN
                RETURN v_max;
            END IF;
        END LOOP;
    END IF;

    IF v_type IN ('numeric', 'alphanumeric') THEN
        IF v_digit_pool <= 0 AND v_digits > 0 THEN
            RETURN 0;
        END IF;

        FOR i IN 1..v_digits LOOP
            v_result := v_result * v_digit_pool;
            IF v_result >= v_max THEN
                RETURN v_max;
            END IF;
        END LOOP;
    END IF;

    IF v_type = 'alphanumeric' AND v_letters > 0 AND v_digits > 0 THEN
        v_result := v_result * admin._id_gen_binomial(v_letters + v_digits, v_letters);
        IF v_result >= v_max THEN
            RETURN v_max;
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_table_row_count(p_target_table TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_schema TEXT;
    v_table TEXT;
    v_count BIGINT;
BEGIN
    IF trim(COALESCE(p_target_table, '')) = '' THEN
        RETURN 0;
    END IF;

    IF position('.' IN p_target_table) > 0 THEN
        v_schema := split_part(p_target_table, '.', 1);
        v_table := split_part(p_target_table, '.', 2);
    ELSE
        v_schema := 'public';
        v_table := p_target_table;
    END IF;

    IF v_schema NOT IN ('public', 'sim', 'admin') THEN
        RETURN 0;
    END IF;

    IF v_table IS NULL OR trim(v_table) = '' THEN
        RETURN 0;
    END IF;

    EXECUTE format('SELECT COUNT(*)::BIGINT FROM %I.%I', v_schema, v_table)
    INTO v_count;

    RETURN COALESCE(v_count, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Capacity preview RPC (form warnings)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.preview_id_generation_capacity(
    p_target_table TEXT,
    p_num_letters INTEGER,
    p_num_digits INTEGER,
    p_letter_case TEXT,
    p_excluded_chars TEXT,
    p_segment_type TEXT DEFAULT 'alphanumeric'
)
RETURNS TABLE(
    keyspace_size BIGINT,
    table_row_count BIGINT,
    generated_count BIGINT,
    usage_pct NUMERIC,
    capacity_exceeded BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_keyspace BIGINT;
    v_rows BIGINT;
    v_generated BIGINT;
    v_usage NUMERIC;
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'system.id_generation.view') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.view required';
    END IF;

    v_keyspace := admin._id_gen_keyspace_size(
        p_num_letters,
        p_num_digits,
        p_letter_case,
        p_excluded_chars,
        p_segment_type
    );
    v_rows := admin._id_gen_table_row_count(p_target_table);
    v_generated := 0;

    IF trim(COALESCE(p_target_table, '')) <> '' THEN
        SELECT COUNT(*)::BIGINT
        INTO v_generated
        FROM admin.generated_ids g
        WHERE g.target_table = p_target_table;
    END IF;

    IF v_keyspace > 0 THEN
        v_usage := ROUND(GREATEST(v_generated, v_rows)::NUMERIC / v_keyspace::NUMERIC * 100, 2);
    ELSE
        v_usage := 100;
    END IF;

    RETURN QUERY
    SELECT
        v_keyspace,
        v_rows,
        v_generated,
        v_usage,
        (v_keyspace < GREATEST(v_rows, v_generated));
END;
$$;

-- ---------------------------------------------------------------------------
-- Usage view (active rules)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW admin.v_id_generation_rule_usage AS
SELECT
    r.id AS rule_id,
    r.target_table,
    r.table_abbreviation,
    admin._id_gen_keyspace_size(
        r.num_letters,
        r.num_digits,
        r.letter_case,
        r.excluded_chars,
        r.segment_type
    ) AS keyspace_size,
    COALESCE(g.generated_count, 0)::BIGINT AS generated_count,
    CASE
        WHEN admin._id_gen_keyspace_size(
            r.num_letters,
            r.num_digits,
            r.letter_case,
            r.excluded_chars,
            r.segment_type
        ) > 0 THEN ROUND(
            COALESCE(g.generated_count, 0)::NUMERIC
            / admin._id_gen_keyspace_size(
                r.num_letters,
                r.num_digits,
                r.letter_case,
                r.excluded_chars,
                r.segment_type
            )::NUMERIC * 100,
            2
        )
        ELSE 100::NUMERIC
    END AS usage_pct
FROM admin.id_generation_rules r
LEFT JOIN (
    SELECT target_table, COUNT(*)::BIGINT AS generated_count
    FROM admin.generated_ids
    GROUP BY target_table
) g ON g.target_table = r.target_table
WHERE r.is_active = TRUE;

COMMENT ON VIEW admin.v_id_generation_rule_usage IS
    'Per active ID generation rule: keyspace size, generated count, and usage percentage';

GRANT SELECT ON admin.v_id_generation_rule_usage TO authenticated;

-- ---------------------------------------------------------------------------
-- admin.generate_display_id — raised retry ceiling + actionable exhaustion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.generate_display_id(
    p_table TEXT,
    p_record_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_existing TEXT;
    v_rule admin.id_generation_rules%ROWTYPE;
    v_rule_id UUID;
    v_code TEXT;
    v_display_id TEXT;
    v_attempt INTEGER;
    v_max_attempts INTEGER := admin._id_gen_max_attempts();
BEGIN
    IF trim(COALESCE(p_table, '')) = '' OR p_record_id IS NULL THEN
        RAISE EXCEPTION 'table and record_id are required';
    END IF;

    SELECT display_id INTO v_existing
    FROM admin.generated_ids
    WHERE target_table = p_table
      AND record_id = p_record_id;

    IF FOUND THEN
        RETURN v_existing;
    END IF;

    v_rule_id := admin._id_gen_ensure_rule(p_table);

    SELECT * INTO v_rule
    FROM admin.id_generation_rules
    WHERE id = v_rule_id;

    FOR v_attempt IN 1..v_max_attempts LOOP
        v_code := admin._id_gen_build_code(
            v_rule.num_letters,
            v_rule.num_digits,
            v_rule.letter_case,
            v_rule.excluded_chars,
            v_rule.segment_type
        );
        v_display_id := v_rule.table_abbreviation
            || COALESCE(v_rule.separator, '')
            || v_code
            || COALESCE(v_rule.suffix, '');

        BEGIN
            INSERT INTO admin.generated_ids (
                target_table,
                record_id,
                display_id,
                rule_id
            )
            VALUES (
                p_table,
                p_record_id,
                v_display_id,
                v_rule.id
            );

            UPDATE admin.id_generation_rules
            SET current_sequence = current_sequence + 1,
                updated_at = NOW()
            WHERE id = v_rule.id;

            RETURN v_display_id;
        EXCEPTION
            WHEN unique_violation THEN
                IF EXISTS (
                    SELECT 1 FROM admin.generated_ids
                    WHERE target_table = p_table AND record_id = p_record_id
                ) THEN
                    SELECT display_id INTO v_existing
                    FROM admin.generated_ids
                    WHERE target_table = p_table AND record_id = p_record_id;
                    RETURN v_existing;
                END IF;
        END;
    END LOOP;

    RAISE EXCEPTION
        'ID_KEYSPACE_EXHAUSTED: Unable to generate unique display ID for % after % attempts (keyspace may be saturated)',
        p_table,
        v_max_attempts
        USING ERRCODE = 'P0001';
END;
$$;

-- ---------------------------------------------------------------------------
-- create / update — block pathological keyspace < current row count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_id_generation_rule(
    p_target_table TEXT,
    p_table_abbreviation VARCHAR(4),
    p_table_description TEXT,
    p_separator VARCHAR(2),
    p_suffix TEXT,
    p_letter_case TEXT,
    p_segment_type TEXT,
    p_num_letters INTEGER,
    p_num_digits INTEGER,
    p_excluded_chars TEXT,
    p_seed_value BIGINT,
    p_is_active BOOLEAN,
    p_admin_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_id UUID;
    v_new admin.id_generation_rules%ROWTYPE;
    v_abbrev TEXT;
    v_segment_type TEXT;
    v_keyspace BIGINT;
    v_row_count BIGINT;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.id_generation.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.edit required';
    END IF;

    IF trim(COALESCE(p_target_table, '')) = '' THEN
        RAISE EXCEPTION 'target_table is required';
    END IF;

    v_abbrev := upper(trim(COALESCE(p_table_abbreviation, '')));
    IF v_abbrev !~ '^[A-Z]{1,4}$' THEN
        RAISE EXCEPTION 'table_abbreviation must be 1-4 uppercase letters';
    END IF;

    v_segment_type := COALESCE(NULLIF(trim(p_segment_type), ''), 'alphanumeric');
    IF v_segment_type NOT IN ('numeric', 'alpha', 'alphanumeric') THEN
        RAISE EXCEPTION 'Invalid segment_type: %', p_segment_type;
    END IF;

    IF v_segment_type = 'numeric' AND COALESCE(p_num_digits, 0) < 1 THEN
        RAISE EXCEPTION 'num_digits must be at least 1 for numeric segment type';
    END IF;

    IF v_segment_type = 'alpha' AND COALESCE(p_num_letters, 0) < 1 THEN
        RAISE EXCEPTION 'num_letters must be at least 1 for alpha segment type';
    END IF;

    IF v_segment_type = 'alphanumeric'
       AND COALESCE(p_num_letters, 0) + COALESCE(p_num_digits, 0) < 1 THEN
        RAISE EXCEPTION 'num_letters + num_digits must be at least 1 for alphanumeric segment type';
    END IF;

    IF COALESCE(p_letter_case, 'uppercase') NOT IN ('uppercase', 'lowercase', 'mixed') THEN
        RAISE EXCEPTION 'Invalid letter_case: %', p_letter_case;
    END IF;

    v_keyspace := admin._id_gen_keyspace_size(
        CASE WHEN v_segment_type = 'numeric' THEN 0 ELSE COALESCE(p_num_letters, 3) END,
        CASE WHEN v_segment_type = 'alpha' THEN 0 ELSE COALESCE(p_num_digits, 4) END,
        COALESCE(p_letter_case, 'uppercase'),
        COALESCE(p_excluded_chars, ''),
        v_segment_type
    );
    v_row_count := admin._id_gen_table_row_count(p_target_table);

    IF v_keyspace < v_row_count THEN
        RAISE EXCEPTION
            'ID_KEYSPACE_TOO_SMALL: This format allows % unique codes but table % already has % rows. Widen the format before saving.',
            v_keyspace,
            p_target_table,
            v_row_count
            USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(p_is_active, TRUE) THEN
        IF EXISTS (
            SELECT 1 FROM admin.id_generation_rules
            WHERE target_table = p_target_table AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'An active rule already exists for table %', p_target_table;
        END IF;

        IF EXISTS (
            SELECT 1 FROM admin.id_generation_rules
            WHERE table_abbreviation = v_abbrev AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'An active rule already uses abbreviation %', v_abbrev;
        END IF;
    END IF;

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
        NULLIF(trim(COALESCE(p_table_description, '')), ''),
        COALESCE(p_separator, '-'),
        COALESCE(p_suffix, ''),
        COALESCE(p_letter_case, 'uppercase'),
        v_segment_type,
        CASE WHEN v_segment_type = 'numeric' THEN 0 ELSE COALESCE(p_num_letters, 3) END,
        CASE WHEN v_segment_type = 'alpha' THEN 0 ELSE COALESCE(p_num_digits, 4) END,
        COALESCE(p_excluded_chars, ''),
        COALESCE(p_seed_value, 1),
        0,
        COALESCE(p_is_active, TRUE),
        p_admin_user_id,
        p_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.id_generation_rules WHERE id = v_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'id_generation_rule.create',
        'id_generation_rule',
        v_id,
        jsonb_build_object(
            'target_table', p_target_table,
            'keyspace_size', v_keyspace,
            'table_row_count', v_row_count
        ),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_id_generation_rule(
    p_rule_id UUID,
    p_target_table TEXT,
    p_table_abbreviation VARCHAR(4),
    p_table_description TEXT,
    p_separator VARCHAR(2),
    p_suffix TEXT,
    p_letter_case TEXT,
    p_segment_type TEXT,
    p_num_letters INTEGER,
    p_num_digits INTEGER,
    p_excluded_chars TEXT,
    p_seed_value BIGINT,
    p_is_active BOOLEAN,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.id_generation_rules%ROWTYPE;
    v_new admin.id_generation_rules%ROWTYPE;
    v_abbrev TEXT;
    v_segment_type TEXT;
    v_target_table TEXT;
    v_effective_letters INTEGER;
    v_effective_digits INTEGER;
    v_keyspace BIGINT;
    v_row_count BIGINT;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.id_generation.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.id_generation_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ID generation rule not found: %', p_rule_id;
    END IF;

    v_abbrev := upper(trim(COALESCE(p_table_abbreviation, '')));
    IF v_abbrev !~ '^[A-Z]{1,4}$' THEN
        RAISE EXCEPTION 'table_abbreviation must be 1-4 uppercase letters';
    END IF;

    v_segment_type := COALESCE(NULLIF(trim(p_segment_type), ''), v_prev.segment_type, 'alphanumeric');
    IF v_segment_type NOT IN ('numeric', 'alpha', 'alphanumeric') THEN
        RAISE EXCEPTION 'Invalid segment_type: %', p_segment_type;
    END IF;

    IF v_segment_type = 'numeric' AND COALESCE(p_num_digits, 0) < 1 THEN
        RAISE EXCEPTION 'num_digits must be at least 1 for numeric segment type';
    END IF;

    IF v_segment_type = 'alpha' AND COALESCE(p_num_letters, 0) < 1 THEN
        RAISE EXCEPTION 'num_letters must be at least 1 for alpha segment type';
    END IF;

    IF v_segment_type = 'alphanumeric'
       AND COALESCE(p_num_letters, 0) + COALESCE(p_num_digits, 0) < 1 THEN
        RAISE EXCEPTION 'num_letters + num_digits must be at least 1 for alphanumeric segment type';
    END IF;

    v_target_table := COALESCE(NULLIF(trim(p_target_table), ''), v_prev.target_table);
    v_effective_letters := CASE
        WHEN v_segment_type = 'numeric' THEN 0
        ELSE COALESCE(p_num_letters, v_prev.num_letters)
    END;
    v_effective_digits := CASE
        WHEN v_segment_type = 'alpha' THEN 0
        ELSE COALESCE(p_num_digits, v_prev.num_digits)
    END;

    v_keyspace := admin._id_gen_keyspace_size(
        v_effective_letters,
        v_effective_digits,
        COALESCE(p_letter_case, v_prev.letter_case),
        COALESCE(p_excluded_chars, v_prev.excluded_chars),
        v_segment_type
    );
    v_row_count := admin._id_gen_table_row_count(v_target_table);

    IF v_keyspace < v_row_count THEN
        RAISE EXCEPTION
            'ID_KEYSPACE_TOO_SMALL: This format allows % unique codes but table % already has % rows. Widen the format before saving.',
            v_keyspace,
            v_target_table,
            v_row_count
            USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(p_is_active, TRUE) THEN
        IF EXISTS (
            SELECT 1 FROM admin.id_generation_rules
            WHERE target_table = v_target_table
              AND is_active = TRUE
              AND id <> p_rule_id
        ) THEN
            RAISE EXCEPTION 'Another active rule already exists for this table';
        END IF;

        IF EXISTS (
            SELECT 1 FROM admin.id_generation_rules
            WHERE table_abbreviation = v_abbrev
              AND is_active = TRUE
              AND id <> p_rule_id
        ) THEN
            RAISE EXCEPTION 'Another active rule already uses abbreviation %', v_abbrev;
        END IF;
    END IF;

    UPDATE admin.id_generation_rules
    SET target_table = v_target_table,
        table_abbreviation = v_abbrev,
        table_description = NULLIF(trim(COALESCE(p_table_description, '')), ''),
        separator = COALESCE(p_separator, separator),
        suffix = COALESCE(p_suffix, suffix),
        letter_case = COALESCE(p_letter_case, letter_case),
        segment_type = v_segment_type,
        num_letters = v_effective_letters,
        num_digits = v_effective_digits,
        excluded_chars = COALESCE(p_excluded_chars, excluded_chars),
        seed_value = COALESCE(p_seed_value, seed_value),
        is_active = COALESCE(p_is_active, is_active),
        updated_by = p_admin_user_id,
        updated_at = NOW()
    WHERE id = p_rule_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'id_generation_rule.update',
        'id_generation_rule',
        p_rule_id,
        jsonb_build_object(
            'target_table', v_new.target_table,
            'keyspace_size', v_keyspace,
            'table_row_count', v_row_count
        ),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._id_gen_max_attempts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_effective_pool_size(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_binomial(INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_keyspace_size(INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_table_row_count(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.preview_id_generation_capacity(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v138: ID generation capacity safeguards applied.';
END $$;
