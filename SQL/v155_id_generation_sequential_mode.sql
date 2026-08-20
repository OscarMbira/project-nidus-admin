-- ============================================================================
-- v155: ID Generation — Sequential + Date-Aware Rules
-- PostgreSQL 15+ / Supabase (admin schema)
-- Plan: projectplans/v23_id_generation_sequential_date_engine_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Schema: generation mode columns on rules
-- ---------------------------------------------------------------------------
ALTER TABLE admin.id_generation_rules
    ADD COLUMN IF NOT EXISTS generation_mode TEXT NOT NULL DEFAULT 'random',
    ADD COLUMN IF NOT EXISTS include_date BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS date_format TEXT,
    ADD COLUMN IF NOT EXISTS scope_column TEXT;

ALTER TABLE admin.id_generation_rules
    DROP CONSTRAINT IF EXISTS id_generation_rules_generation_mode_check;

ALTER TABLE admin.id_generation_rules
    ADD CONSTRAINT id_generation_rules_generation_mode_check
        CHECK (generation_mode IN ('random', 'sequential'));

ALTER TABLE admin.id_generation_rules
    DROP CONSTRAINT IF EXISTS id_generation_rules_date_format_check;

ALTER TABLE admin.id_generation_rules
    ADD CONSTRAINT id_generation_rules_date_format_check
        CHECK (date_format IS NULL OR date_format IN ('YYYY', 'YYYYMM', 'YYYYMMDD'));

ALTER TABLE admin.id_generation_rules
    DROP CONSTRAINT IF EXISTS id_generation_rules_random_mode_fields_check;

ALTER TABLE admin.id_generation_rules
    ADD CONSTRAINT id_generation_rules_random_mode_fields_check
        CHECK (
            generation_mode = 'sequential'
            OR (include_date = FALSE AND scope_column IS NULL)
        );

ALTER TABLE admin.id_generation_rules
    DROP CONSTRAINT IF EXISTS id_generation_rules_sequential_date_format_check;

ALTER TABLE admin.id_generation_rules
    ADD CONSTRAINT id_generation_rules_sequential_date_format_check
        CHECK (
            generation_mode = 'random'
            OR include_date = FALSE
            OR date_format IS NOT NULL
        );

COMMENT ON COLUMN admin.id_generation_rules.generation_mode IS
    'random = existing alphanumeric keyspace; sequential = zero-padded counter with optional date/scope';
COMMENT ON COLUMN admin.id_generation_rules.include_date IS
    'When sequential: embed a date period (year/month/day) in the display ID';
COMMENT ON COLUMN admin.id_generation_rules.date_format IS
    'Date token format when include_date is true: YYYY, YYYYMM, or YYYYMMDD';
COMMENT ON COLUMN admin.id_generation_rules.scope_column IS
    'Optional FK column on target_table — sequence resets per distinct scope value';

-- ---------------------------------------------------------------------------
-- Per rule × scope × period sequence counters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.id_generation_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES admin.id_generation_rules(id) ON DELETE CASCADE,
    scope_value TEXT,
    period_key TEXT,
    current_value BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_id_generation_sequences_rule_scope_period
        UNIQUE NULLS NOT DISTINCT (rule_id, scope_value, period_key)
);

CREATE INDEX IF NOT EXISTS idx_id_generation_sequences_rule_id
    ON admin.id_generation_sequences (rule_id);

COMMENT ON TABLE admin.id_generation_sequences IS
    'Atomic sequence counters for sequential ID rules (per scope and/or date period)';

ALTER TABLE admin.id_generation_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS id_generation_sequences_select ON admin.id_generation_sequences;
CREATE POLICY id_generation_sequences_select ON admin.id_generation_sequences
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.id_generation_sequences TO authenticated;
GRANT ALL ON admin.id_generation_sequences TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._id_gen_split_qualified_table(p_target_table TEXT)
RETURNS TABLE(schema_name TEXT, table_name TEXT)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_raw TEXT;
    v_schema TEXT;
    v_name TEXT;
BEGIN
    v_raw := trim(COALESCE(p_target_table, ''));
    IF v_raw = '' THEN
        RETURN;
    END IF;

    IF position('.' IN v_raw) > 0 THEN
        v_schema := split_part(v_raw, '.', 1);
        v_name := NULLIF(substring(v_raw FROM position('.' IN v_raw) + 1), '');
    ELSE
        v_schema := 'public';
        v_name := v_raw;
    END IF;

    IF v_name IS NULL OR v_name = '' THEN
        RETURN;
    END IF;

    schema_name := v_schema;
    table_name := v_name;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_period_key(p_date_format TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_date_format IS NULL OR trim(p_date_format) = '' THEN
        RETURN NULL;
    END IF;

    CASE upper(trim(p_date_format))
        WHEN 'YYYY' THEN RETURN to_char(CURRENT_DATE, 'YYYY');
        WHEN 'YYYYMM' THEN RETURN to_char(CURRENT_DATE, 'YYYYMM');
        WHEN 'YYYYMMDD' THEN RETURN to_char(CURRENT_DATE, 'YYYYMMDD');
        ELSE RAISE EXCEPTION 'Invalid date_format: %', p_date_format;
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_sequential_keyspace(p_num_digits INTEGER)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_num_digits, 0) <= 0 THEN 0
        WHEN COALESCE(p_num_digits, 0) >= 19 THEN 9223372036854775807
        ELSE power(10::NUMERIC, p_num_digits)::BIGINT
    END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_validate_scope_column(
    p_target_table TEXT,
    p_scope_column TEXT
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_schema TEXT;
    v_table TEXT;
    v_col TEXT;
    v_found BOOLEAN;
BEGIN
    v_col := NULLIF(trim(COALESCE(p_scope_column, '')), '');
    IF v_col IS NULL THEN
        RETURN;
    END IF;

    IF v_col = 'id' OR v_col !~ '_id$' THEN
        RAISE EXCEPTION 'scope_column must be an FK-style column ending in _id (not id itself)';
    END IF;

    SELECT s.schema_name, s.table_name
    INTO v_schema, v_table
    FROM admin._id_gen_split_qualified_table(p_target_table) s;

    IF v_schema IS NULL THEN
        RAISE EXCEPTION 'Invalid target_table for scope validation: %', p_target_table;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = v_schema
          AND c.table_name = v_table
          AND c.column_name = v_col
    ) INTO v_found;

    IF NOT v_found THEN
        RAISE EXCEPTION 'scope_column % does not exist on table %', v_col, p_target_table;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_next_sequence_value(
    p_rule_id UUID,
    p_seed_value BIGINT,
    p_scope_value TEXT,
    p_period_key TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_sequence BIGINT;
BEGIN
    INSERT INTO admin.id_generation_sequences (
        rule_id,
        scope_value,
        period_key,
        current_value
    )
    VALUES (
        p_rule_id,
        p_scope_value,
        p_period_key,
        COALESCE(p_seed_value, 1)
    )
    ON CONFLICT ON CONSTRAINT uq_id_generation_sequences_rule_scope_period
    DO UPDATE SET
        current_value = admin.id_generation_sequences.current_value + 1,
        updated_at = NOW()
    RETURNING current_value INTO v_sequence;

    RETURN v_sequence;
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_build_sequential_code(
    p_rule admin.id_generation_rules,
    p_record_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_schema TEXT;
    v_table TEXT;
    v_scope_value TEXT;
    v_period_key TEXT;
    v_sequence BIGINT;
    v_middle TEXT := '';
    v_code TEXT;
BEGIN
    IF p_rule.scope_column IS NOT NULL THEN
        SELECT s.schema_name, s.table_name
        INTO v_schema, v_table
        FROM admin._id_gen_split_qualified_table(p_rule.target_table) s;

        EXECUTE format(
            'SELECT %I::TEXT FROM %I.%I WHERE id = $1',
            p_rule.scope_column,
            v_schema,
            v_table
        )
        INTO v_scope_value
        USING p_record_id;
    END IF;

    IF p_rule.include_date THEN
        v_period_key := admin._id_gen_period_key(p_rule.date_format);
    END IF;

    v_sequence := admin._id_gen_next_sequence_value(
        p_rule.id,
        p_rule.seed_value,
        v_scope_value,
        v_period_key
    );

    IF p_rule.include_date AND v_period_key IS NOT NULL THEN
        v_middle := v_period_key || COALESCE(p_rule.separator, '');
    END IF;

    v_code := LPAD(v_sequence::TEXT, GREATEST(p_rule.num_digits, 1), '0');

    RETURN p_rule.table_abbreviation
        || COALESCE(p_rule.separator, '')
        || v_middle
        || v_code
        || COALESCE(p_rule.suffix, '');
END;
$$;

-- ---------------------------------------------------------------------------
-- Scopable columns for admin UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_scopable_columns(p_target_table TEXT)
RETURNS TABLE(column_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_schema TEXT;
    v_table TEXT;
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'system.id_generation.view') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.view required';
    END IF;

    SELECT s.schema_name, s.table_name
    INTO v_schema, v_table
    FROM admin._id_gen_split_qualified_table(p_target_table) s;

    IF v_schema IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT c.column_name::TEXT
    FROM information_schema.columns c
    WHERE c.table_schema = v_schema
      AND c.table_name = v_table
      AND c.column_name LIKE '%\_id' ESCAPE '\'
      AND c.column_name <> 'id'
    ORDER BY c.column_name;
END;
$$;

-- ---------------------------------------------------------------------------
-- Capacity preview — sequential branch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.preview_id_generation_capacity(
    p_target_table TEXT,
    p_num_letters INTEGER,
    p_num_digits INTEGER,
    p_letter_case TEXT,
    p_excluded_chars TEXT,
    p_segment_type TEXT DEFAULT 'alphanumeric',
    p_generation_mode TEXT DEFAULT 'random',
    p_include_date BOOLEAN DEFAULT FALSE,
    p_scope_column TEXT DEFAULT NULL
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
    v_mode TEXT;
    v_keyspace BIGINT;
    v_rows BIGINT;
    v_generated BIGINT;
    v_usage NUMERIC;
    v_compare BIGINT;
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'system.id_generation.view') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.view required';
    END IF;

    v_mode := COALESCE(NULLIF(trim(p_generation_mode), ''), 'random');

    IF v_mode = 'sequential' THEN
        v_keyspace := admin._id_gen_sequential_keyspace(p_num_digits);
    ELSE
        v_keyspace := admin._id_gen_keyspace_size(
            p_num_letters,
            p_num_digits,
            p_letter_case,
            p_excluded_chars,
            p_segment_type
        );
    END IF;

    v_rows := admin._id_gen_table_row_count(p_target_table);
    v_generated := 0;

    IF trim(COALESCE(p_target_table, '')) <> '' THEN
        SELECT COUNT(*)::BIGINT
        INTO v_generated
        FROM admin.generated_ids g
        WHERE g.target_table = p_target_table;
    END IF;

    v_compare := CASE
        WHEN v_mode = 'sequential' AND (p_scope_column IS NOT NULL OR COALESCE(p_include_date, FALSE)) THEN 0
        ELSE GREATEST(v_rows, v_generated)
    END;

    IF v_keyspace > 0 AND v_compare > 0 THEN
        v_usage := ROUND(v_compare::NUMERIC / v_keyspace::NUMERIC * 100, 2);
    ELSIF v_keyspace > 0 THEN
        v_usage := 0;
    ELSE
        v_usage := 100;
    END IF;

    RETURN QUERY
    SELECT
        v_keyspace,
        v_rows,
        v_generated,
        v_usage,
        (v_keyspace > 0 AND v_compare > v_keyspace);
END;
$$;

-- ---------------------------------------------------------------------------
-- Usage view — honor sequential keyspace
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW admin.v_id_generation_rule_usage AS
SELECT
    r.id AS rule_id,
    r.target_table,
    r.table_abbreviation,
    CASE
        WHEN r.generation_mode = 'sequential' THEN admin._id_gen_sequential_keyspace(r.num_digits)
        ELSE admin._id_gen_keyspace_size(
            r.num_letters,
            r.num_digits,
            r.letter_case,
            r.excluded_chars,
            r.segment_type
        )
    END AS keyspace_size,
    COALESCE(g.generated_count, 0)::BIGINT AS generated_count,
    CASE
        WHEN (
            CASE
                WHEN r.generation_mode = 'sequential' THEN admin._id_gen_sequential_keyspace(r.num_digits)
                ELSE admin._id_gen_keyspace_size(
                    r.num_letters,
                    r.num_digits,
                    r.letter_case,
                    r.excluded_chars,
                    r.segment_type
                )
            END
        ) > 0 THEN ROUND(
            COALESCE(g.generated_count, 0)::NUMERIC
            / (
                CASE
                    WHEN r.generation_mode = 'sequential' THEN admin._id_gen_sequential_keyspace(r.num_digits)
                    ELSE admin._id_gen_keyspace_size(
                        r.num_letters,
                        r.num_digits,
                        r.letter_case,
                        r.excluded_chars,
                        r.segment_type
                    )
                END
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

GRANT SELECT ON admin.v_id_generation_rule_usage TO authenticated;

-- ---------------------------------------------------------------------------
-- admin.generate_display_id — sequential branch
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
-- create / update — new sequential parameters
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
        IF COALESCE(p_include_date, FALSE) OR v_scope IS NOT NULL THEN
            RAISE EXCEPTION 'include_date and scope_column are only valid for sequential mode';
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
        CASE WHEN v_mode = 'sequential' THEN COALESCE(p_include_date, FALSE) ELSE FALSE END,
        CASE WHEN v_mode = 'sequential' AND COALESCE(p_include_date, FALSE) THEN p_date_format ELSE NULL END,
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
            'target_table', p_target_table,
            'generation_mode', v_mode,
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
        IF COALESCE(p_include_date, FALSE) OR NULLIF(trim(COALESCE(p_scope_column, '')), '') IS NOT NULL THEN
            RAISE EXCEPTION 'include_date and scope_column are only valid for sequential mode';
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
        include_date = CASE WHEN v_mode = 'sequential' THEN COALESCE(p_include_date, include_date, FALSE) ELSE FALSE END,
        date_format = CASE
            WHEN v_mode = 'sequential' AND COALESCE(p_include_date, include_date, FALSE)
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
            'generation_mode', v_mode,
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
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._id_gen_split_qualified_table(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_period_key(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_sequential_keyspace(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_validate_scope_column(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_next_sequence_value(UUID, BIGINT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_build_sequential_code(admin.id_generation_rules, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_scopable_columns(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.preview_id_generation_capacity(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_display_id(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_id_generation_rule(TEXT, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, BOOLEAN, UUID, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_id_generation_rule(UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, BOOLEAN, UUID, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v155_id_generation_sequential_mode.sql applied';
END $$;
