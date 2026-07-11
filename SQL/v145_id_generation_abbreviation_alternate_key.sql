-- ============================================================================
-- v145: table_abbreviation alternate key (globally unique)
-- PostgreSQL 15+ / Supabase
-- ============================================================================

-- Resolve any existing duplicate abbreviations before adding the unique index.
DO $$
DECLARE
    v_row RECORD;
    v_candidate TEXT;
    v_suffix INTEGER;
    v_letter TEXT;
    v_letters TEXT[] := ARRAY['X', 'Y', 'Z', 'W', 'V'];
    v_li INTEGER;
BEGIN
    FOR v_row IN
        SELECT id, target_table, table_abbreviation,
               ROW_NUMBER() OVER (
                   PARTITION BY upper(table_abbreviation)
                   ORDER BY created_at NULLS LAST, id
               ) AS rn
        FROM admin.id_generation_rules
    LOOP
        IF v_row.rn = 1 THEN
            CONTINUE;
        END IF;

        v_candidate := NULL;

        -- Prefer schema-initial prefix (sim.activity_attributes → SAA)
        IF position('.' IN v_row.target_table) > 0 THEN
            v_candidate := upper(
                substr(split_part(v_row.target_table, '.', 1), 1, 1)
                || substr(v_row.table_abbreviation, 1, 3)
            );
            IF length(v_candidate) > 4 THEN
                v_candidate := substr(v_candidate, 1, 4);
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM admin.id_generation_rules
                WHERE upper(table_abbreviation) = v_candidate AND id <> v_row.id
            ) THEN
                UPDATE admin.id_generation_rules
                SET table_abbreviation = v_candidate, updated_at = NOW()
                WHERE id = v_row.id;
                CONTINUE;
            END IF;
        END IF;

        -- Letter suffix disambiguation (abbrev must stay A-Z only)
        v_li := 1;
        WHILE v_candidate IS NULL AND v_li <= COALESCE(array_length(v_letters, 1), 0) LOOP
            v_letter := v_letters[v_li];
            v_candidate := substr(v_row.table_abbreviation, 1, 3) || v_letter;
            IF EXISTS (
                SELECT 1 FROM admin.id_generation_rules
                WHERE upper(table_abbreviation) = v_candidate AND id <> v_row.id
            ) THEN
                v_candidate := NULL;
            END IF;
            v_li := v_li + 1;
        END LOOP;

        IF v_candidate IS NULL THEN
            v_suffix := 2;
            LOOP
                v_candidate := substr(v_row.table_abbreviation, 1, 1)
                    || substr(
                        translate(v_row.table_abbreviation, '0123456789', 'ABCDEFGHIJ'),
                        2,
                        1
                    )
                    || substr(
                        translate(v_suffix::TEXT, '0123456789', 'ABCDEFGHIJ'),
                        1,
                        1
                    );
                v_candidate := substr(v_candidate, 1, 4);
                EXIT WHEN NOT EXISTS (
                    SELECT 1 FROM admin.id_generation_rules
                    WHERE upper(table_abbreviation) = v_candidate AND id <> v_row.id
                );
                v_suffix := v_suffix + 1;
                IF v_suffix > 26 THEN
                    RAISE EXCEPTION 'Unable to deduplicate abbreviation for rule %', v_row.id;
                END IF;
            END LOOP;
        END IF;

        UPDATE admin.id_generation_rules
        SET table_abbreviation = v_candidate, updated_at = NOW()
        WHERE id = v_row.id;
    END LOOP;
END $$;

DROP INDEX IF EXISTS admin.uq_id_generation_rules_active_abbrev;

CREATE UNIQUE INDEX IF NOT EXISTS uq_id_generation_rules_abbreviation
    ON admin.id_generation_rules (table_abbreviation);

COMMENT ON INDEX admin.uq_id_generation_rules_abbreviation IS
    'Alternate key: table_abbreviation is globally unique across all ID generation rules (active and inactive)';

-- ---------------------------------------------------------------------------
-- Schema-aware abbreviation helper (letters only, max 4)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Resolve rule by abbreviation (alternate key lookup)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.resolve_id_generation_rule_by_abbreviation(p_table_abbreviation TEXT)
RETURNS TABLE(
    rule_id UUID,
    target_table TEXT,
    table_abbreviation VARCHAR(4),
    table_description TEXT,
    is_active BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_abbrev TEXT;
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'system.id_generation.view') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.view required';
    END IF;

    v_abbrev := upper(trim(COALESCE(p_table_abbreviation, '')));
    IF v_abbrev = '' THEN
        RAISE EXCEPTION 'table_abbreviation is required';
    END IF;

    RETURN QUERY
    SELECT r.id, r.target_table, r.table_abbreviation, r.table_description, r.is_active
    FROM admin.id_generation_rules r
    WHERE r.table_abbreviation = v_abbrev;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.resolve_id_generation_rule_by_abbreviation(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create / update — enforce global abbreviation uniqueness
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
    v_existing_table TEXT;
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

    SELECT r.target_table INTO v_existing_table
    FROM admin.id_generation_rules r
    WHERE r.table_abbreviation = v_abbrev
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'ID_ABBREVIATION_IN_USE: Abbreviation % is already assigned to %. Choose a unique abbreviation.',
            v_abbrev,
            v_existing_table
            USING ERRCODE = 'P0001';
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
            'table_abbreviation', v_abbrev,
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
    v_existing_table TEXT;
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

    SELECT r.target_table INTO v_existing_table
    FROM admin.id_generation_rules r
    WHERE r.table_abbreviation = v_abbrev
      AND r.id <> p_rule_id
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'ID_ABBREVIATION_IN_USE: Abbreviation % is already assigned to %. Choose a unique abbreviation.',
            v_abbrev,
            v_existing_table
            USING ERRCODE = 'P0001';
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
            'table_abbreviation', v_abbrev,
            'keyspace_size', v_keyspace,
            'table_row_count', v_row_count
        ),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'v145: table_abbreviation alternate key enforced.';
END $$;
