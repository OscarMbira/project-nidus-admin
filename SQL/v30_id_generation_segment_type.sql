-- ============================================================================
-- v30: ID generation segment type (numeric / alpha / alphanumeric)
-- PostgreSQL 15+ / Supabase
-- ============================================================================

ALTER TABLE admin.id_generation_rules
    ADD COLUMN IF NOT EXISTS segment_type TEXT NOT NULL DEFAULT 'alphanumeric'
        CHECK (segment_type IN ('numeric', 'alpha', 'alphanumeric'));

COMMENT ON COLUMN admin.id_generation_rules.segment_type IS
    'Random code segment: numeric (digits only), alpha (letters only), or alphanumeric (mixed)';

-- ---------------------------------------------------------------------------
-- admin._id_gen_build_code — honor segment_type
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS admin._id_gen_build_code(INTEGER, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin._id_gen_build_code(
    p_num_letters INTEGER,
    p_num_digits INTEGER,
    p_letter_case TEXT,
    p_excluded TEXT,
    p_segment_type TEXT DEFAULT 'alphanumeric'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_chars TEXT[] := ARRAY[]::TEXT[];
    v_letter TEXT;
    v_type TEXT;
    i INTEGER;
BEGIN
    v_type := COALESCE(NULLIF(trim(p_segment_type), ''), 'alphanumeric');

    IF v_type NOT IN ('numeric', 'alpha', 'alphanumeric') THEN
        RAISE EXCEPTION 'Invalid segment_type: %', p_segment_type;
    END IF;

    IF v_type IN ('alpha', 'alphanumeric') THEN
        FOR i IN 1..GREATEST(p_num_letters, 0) LOOP
            v_letter := admin._id_gen_pick_char('ABCDEFGHIJKLMNOPQRSTUVWXYZ', p_excluded);
            IF p_letter_case = 'lowercase' THEN
                v_letter := lower(v_letter);
            ELSIF p_letter_case = 'mixed' AND random() < 0.5 THEN
                v_letter := lower(v_letter);
            END IF;
            v_chars := array_append(v_chars, v_letter);
        END LOOP;
    END IF;

    IF v_type IN ('numeric', 'alphanumeric') THEN
        FOR i IN 1..GREATEST(p_num_digits, 0) LOOP
            v_chars := array_append(v_chars, admin._id_gen_pick_char('0123456789', p_excluded));
        END LOOP;
    END IF;

    IF COALESCE(array_length(v_chars, 1), 0) = 0 THEN
        RETURN 'X';
    END IF;

    IF v_type = 'alphanumeric' THEN
        RETURN (
            SELECT string_agg(c, '' ORDER BY random())
            FROM unnest(v_chars) AS c
        );
    END IF;

    RETURN array_to_string(v_chars, '');
END;
$$;

-- ---------------------------------------------------------------------------
-- admin._id_gen_ensure_rule — include segment_type on auto-create
-- ---------------------------------------------------------------------------
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
        'Auto-generated default rule',
        '-',
        '',
        'uppercase',
        'alphanumeric',
        3,
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

-- ---------------------------------------------------------------------------
-- admin.create_id_generation_rule
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS admin.create_id_generation_rule(
    TEXT, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, BOOLEAN, UUID
);

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
        jsonb_build_object('target_table', p_target_table),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_id_generation_rule
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS admin.update_id_generation_rule(
    UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, BOOLEAN, UUID
);

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

    IF COALESCE(p_is_active, TRUE) THEN
        IF EXISTS (
            SELECT 1 FROM admin.id_generation_rules
            WHERE target_table = COALESCE(NULLIF(trim(p_target_table), ''), v_prev.target_table)
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
    SET target_table = COALESCE(NULLIF(trim(p_target_table), ''), target_table),
        table_abbreviation = v_abbrev,
        table_description = NULLIF(trim(COALESCE(p_table_description, '')), ''),
        separator = COALESCE(p_separator, separator),
        suffix = COALESCE(p_suffix, suffix),
        letter_case = COALESCE(p_letter_case, letter_case),
        segment_type = v_segment_type,
        num_letters = CASE
            WHEN v_segment_type = 'numeric' THEN 0
            ELSE COALESCE(p_num_letters, num_letters)
        END,
        num_digits = CASE
            WHEN v_segment_type = 'alpha' THEN 0
            ELSE COALESCE(p_num_digits, num_digits)
        END,
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
        jsonb_build_object('target_table', v_new.target_table),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.generate_display_id — pass segment_type to code builder
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

    FOR v_attempt IN 1..5 LOOP
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

    RAISE EXCEPTION 'Unable to generate unique display ID for % after 5 attempts', p_table;
END;
$$;

GRANT EXECUTE ON FUNCTION admin._id_gen_build_code(INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_id_generation_rule(
    TEXT, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, BOOLEAN, UUID
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_id_generation_rule(
    UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, BOOLEAN, UUID
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_display_id(TEXT, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v30: ID generation segment_type applied.';
END $$;
