-- ============================================================================
-- v157: Optional date token in Random ID generation mode
-- Allows include_date + date_format on random rules (scope_column remains sequential-only).
-- Example: ABD-2026-E5KHZL439
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Constraints — allow include_date on random; scope_column still sequential-only
-- ---------------------------------------------------------------------------
ALTER TABLE admin.id_generation_rules
    DROP CONSTRAINT IF EXISTS id_generation_rules_random_mode_fields_check;

ALTER TABLE admin.id_generation_rules
    ADD CONSTRAINT id_generation_rules_random_mode_fields_check
        CHECK (
            generation_mode = 'sequential'
            OR scope_column IS NULL
        );

ALTER TABLE admin.id_generation_rules
    DROP CONSTRAINT IF EXISTS id_generation_rules_sequential_date_format_check;

ALTER TABLE admin.id_generation_rules
    ADD CONSTRAINT id_generation_rules_date_format_required_check
        CHECK (
            include_date = FALSE
            OR date_format IS NOT NULL
        );

COMMENT ON COLUMN admin.id_generation_rules.include_date IS
    'Embed a date period (year/month/day) between prefix and code/sequence';

-- ---------------------------------------------------------------------------
-- admin.generate_display_id — random branch inserts optional date token
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
    v_middle TEXT := '';
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

    IF COALESCE(v_rule.generation_mode, 'random') = 'sequential' THEN
        v_display_id := admin._id_gen_build_sequential_code(v_rule, p_record_id);

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
                RAISE;
        END;
    END IF;

    IF v_rule.include_date THEN
        v_middle := admin._id_gen_period_key(v_rule.date_format)
            || COALESCE(v_rule.separator, '');
    END IF;

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
            || v_middle
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
-- create_id_generation_rule — persist include_date/date_format for random mode
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
    p_admin_user_id UUID,
    p_generation_mode TEXT DEFAULT 'random',
    p_include_date BOOLEAN DEFAULT FALSE,
    p_date_format TEXT DEFAULT NULL,
    p_scope_column TEXT DEFAULT NULL
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
    v_mode TEXT;
    v_scope TEXT;
    v_keyspace BIGINT;
    v_row_count BIGINT;
    v_effective_letters INTEGER;
    v_effective_digits INTEGER;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.id_generation.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.edit required';
    END IF;

    IF trim(COALESCE(p_target_table, '')) = '' THEN
        RAISE EXCEPTION 'target_table is required';
    END IF;

    v_mode := COALESCE(NULLIF(trim(p_generation_mode), ''), 'random');
    IF v_mode NOT IN ('random', 'sequential') THEN
        RAISE EXCEPTION 'Invalid generation_mode: %', p_generation_mode;
    END IF;

    v_abbrev := upper(trim(COALESCE(p_table_abbreviation, '')));
    IF v_abbrev !~ '^[A-Z]{1,4}$' THEN
        RAISE EXCEPTION 'table_abbreviation must be 1-4 uppercase letters';
    END IF;

    v_scope := NULLIF(trim(COALESCE(p_scope_column, '')), '');

    IF v_mode = 'random' THEN
        IF v_scope IS NOT NULL THEN
            RAISE EXCEPTION 'scope_column is only valid for sequential mode';
        END IF;
        IF COALESCE(p_include_date, FALSE) AND p_date_format IS NULL THEN
            RAISE EXCEPTION 'date_format is required when include_date is true';
        END IF;
    ELSE
        IF COALESCE(p_num_digits, 0) < 1 THEN
            RAISE EXCEPTION 'num_digits must be at least 1 for sequential mode';
        END IF;
        IF COALESCE(p_include_date, FALSE) AND p_date_format IS NULL THEN
            RAISE EXCEPTION 'date_format is required when include_date is true';
        END IF;
        PERFORM admin._id_gen_validate_scope_column(p_target_table, v_scope);
    END IF;

    v_segment_type := CASE
        WHEN v_mode = 'sequential' THEN 'numeric'
        ELSE COALESCE(NULLIF(trim(p_segment_type), ''), 'alphanumeric')
    END;

    IF v_segment_type NOT IN ('numeric', 'alpha', 'alphanumeric') THEN
        RAISE EXCEPTION 'Invalid segment_type: %', p_segment_type;
    END IF;

    v_effective_letters := CASE
        WHEN v_mode = 'sequential' THEN 0
        WHEN v_segment_type = 'numeric' THEN 0
        ELSE COALESCE(p_num_letters, 3)
    END;
    v_effective_digits := CASE
        WHEN v_segment_type = 'alpha' THEN 0
        ELSE COALESCE(p_num_digits, CASE WHEN v_mode = 'sequential' THEN 3 ELSE 4 END)
    END;

    IF v_mode = 'random' THEN
        IF v_segment_type = 'numeric' AND v_effective_digits < 1 THEN
            RAISE EXCEPTION 'num_digits must be at least 1 for numeric segment type';
        END IF;
        IF v_segment_type = 'alpha' AND v_effective_letters < 1 THEN
            RAISE EXCEPTION 'num_letters must be at least 1 for alpha segment type';
        END IF;
        IF v_segment_type = 'alphanumeric' AND v_effective_letters + v_effective_digits < 1 THEN
            RAISE EXCEPTION 'num_letters + num_digits must be at least 1 for alphanumeric segment type';
        END IF;
    END IF;

    IF COALESCE(p_letter_case, 'uppercase') NOT IN ('uppercase', 'lowercase', 'mixed') THEN
        RAISE EXCEPTION 'Invalid letter_case: %', p_letter_case;
    END IF;

    IF v_mode = 'sequential' THEN
        v_keyspace := admin._id_gen_sequential_keyspace(v_effective_digits);
    ELSE
        v_keyspace := admin._id_gen_keyspace_size(
            v_effective_letters,
            v_effective_digits,
            COALESCE(p_letter_case, 'uppercase'),
            COALESCE(p_excluded_chars, ''),
            v_segment_type
        );
    END IF;

    v_row_count := admin._id_gen_table_row_count(p_target_table);

    IF v_mode = 'random' AND v_keyspace < v_row_count THEN
        RAISE EXCEPTION
            'ID_KEYSPACE_TOO_SMALL: This format allows % unique codes but table % already has % rows. Widen the format before saving.',
            v_keyspace,
            p_target_table,
            v_row_count
            USING ERRCODE = 'P0001';
    END IF;

    IF v_mode = 'sequential' AND v_scope IS NULL AND NOT COALESCE(p_include_date, FALSE) AND v_keyspace < v_row_count THEN
        RAISE EXCEPTION
            'ID_KEYSPACE_TOO_SMALL: Sequential format allows % IDs but table % already has % rows. Increase num_digits before saving.',
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
        generation_mode,
        include_date,
        date_format,
        scope_column,
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
        v_effective_letters,
        v_effective_digits,
        CASE WHEN v_mode = 'sequential' THEN '' ELSE COALESCE(p_excluded_chars, '') END,
        COALESCE(p_seed_value, 1),
        0,
        COALESCE(p_is_active, TRUE),
        v_mode,
        COALESCE(p_include_date, FALSE),
        CASE WHEN COALESCE(p_include_date, FALSE) THEN p_date_format ELSE NULL END,
        CASE WHEN v_mode = 'sequential' THEN v_scope ELSE NULL END,
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
            'target_table', v_new.target_table,
            'table_abbreviation', v_new.table_abbreviation,
            'generation_mode', v_new.generation_mode
        )
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- update_id_generation_rule — persist include_date/date_format for random mode
-- ---------------------------------------------------------------------------
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
    p_admin_user_id UUID,
    p_generation_mode TEXT DEFAULT 'random',
    p_include_date BOOLEAN DEFAULT FALSE,
    p_date_format TEXT DEFAULT NULL,
    p_scope_column TEXT DEFAULT NULL
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
    v_mode TEXT;
    v_scope TEXT;
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

    v_mode := COALESCE(NULLIF(trim(p_generation_mode), ''), v_prev.generation_mode, 'random');
    IF v_mode NOT IN ('random', 'sequential') THEN
        RAISE EXCEPTION 'Invalid generation_mode: %', p_generation_mode;
    END IF;

    v_abbrev := upper(trim(COALESCE(p_table_abbreviation, '')));
    IF v_abbrev !~ '^[A-Z]{1,4}$' THEN
        RAISE EXCEPTION 'table_abbreviation must be 1-4 uppercase letters';
    END IF;

    v_target_table := COALESCE(NULLIF(trim(p_target_table), ''), v_prev.target_table);
    v_scope := CASE
        WHEN v_mode = 'sequential' THEN NULLIF(trim(COALESCE(p_scope_column, v_prev.scope_column, '')), '')
        ELSE NULL
    END;

    IF v_mode = 'random' THEN
        IF NULLIF(trim(COALESCE(p_scope_column, '')), '') IS NOT NULL THEN
            RAISE EXCEPTION 'scope_column is only valid for sequential mode';
        END IF;
        IF COALESCE(p_include_date, v_prev.include_date, FALSE) AND COALESCE(p_date_format, v_prev.date_format) IS NULL THEN
            RAISE EXCEPTION 'date_format is required when include_date is true';
        END IF;
    ELSE
        IF COALESCE(p_num_digits, v_prev.num_digits, 0) < 1 THEN
            RAISE EXCEPTION 'num_digits must be at least 1 for sequential mode';
        END IF;
        IF COALESCE(p_include_date, v_prev.include_date, FALSE) AND COALESCE(p_date_format, v_prev.date_format) IS NULL THEN
            RAISE EXCEPTION 'date_format is required when include_date is true';
        END IF;
        PERFORM admin._id_gen_validate_scope_column(v_target_table, v_scope);
    END IF;

    v_segment_type := CASE
        WHEN v_mode = 'sequential' THEN 'numeric'
        ELSE COALESCE(NULLIF(trim(p_segment_type), ''), v_prev.segment_type, 'alphanumeric')
    END;

    v_effective_letters := CASE
        WHEN v_mode = 'sequential' THEN 0
        WHEN v_segment_type = 'numeric' THEN 0
        ELSE COALESCE(p_num_letters, v_prev.num_letters)
    END;
    v_effective_digits := CASE
        WHEN v_segment_type = 'alpha' THEN 0
        ELSE COALESCE(p_num_digits, v_prev.num_digits)
    END;

    IF v_mode = 'sequential' THEN
        v_keyspace := admin._id_gen_sequential_keyspace(v_effective_digits);
    ELSE
        v_keyspace := admin._id_gen_keyspace_size(
            v_effective_letters,
            v_effective_digits,
            COALESCE(p_letter_case, v_prev.letter_case),
            COALESCE(p_excluded_chars, v_prev.excluded_chars),
            v_segment_type
        );
    END IF;

    v_row_count := admin._id_gen_table_row_count(v_target_table);

    IF v_mode = 'random' AND v_keyspace < v_row_count THEN
        RAISE EXCEPTION
            'ID_KEYSPACE_TOO_SMALL: This format allows % unique codes but table % already has % rows. Widen the format before saving.',
            v_keyspace,
            v_target_table,
            v_row_count
            USING ERRCODE = 'P0001';
    END IF;

    IF v_mode = 'sequential' AND v_scope IS NULL AND NOT COALESCE(p_include_date, v_prev.include_date, FALSE) AND v_keyspace < v_row_count THEN
        RAISE EXCEPTION
            'ID_KEYSPACE_TOO_SMALL: Sequential format allows % IDs but table % already has % rows. Increase num_digits before saving.',
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
        excluded_chars = CASE WHEN v_mode = 'sequential' THEN '' ELSE COALESCE(p_excluded_chars, excluded_chars) END,
        seed_value = COALESCE(p_seed_value, seed_value),
        is_active = COALESCE(p_is_active, is_active),
        generation_mode = v_mode,
        include_date = COALESCE(p_include_date, include_date, FALSE),
        date_format = CASE
            WHEN COALESCE(p_include_date, include_date, FALSE)
                THEN COALESCE(p_date_format, date_format)
            ELSE NULL
        END,
        scope_column = CASE WHEN v_mode = 'sequential' THEN v_scope ELSE NULL END,
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
            'table_abbreviation', v_new.table_abbreviation,
            'generation_mode', v_new.generation_mode
        )
    );

    RETURN TRUE;
END;
$$;
