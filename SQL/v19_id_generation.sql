-- ============================================================================
-- v19: ID generation rules and display IDs
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v2.0_id_generation_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.id_generation_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.id_generation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_table TEXT NOT NULL,
    table_abbreviation VARCHAR(4) NOT NULL,
    table_description TEXT,
    separator VARCHAR(2) NOT NULL DEFAULT '-',
    suffix TEXT NOT NULL DEFAULT '',
    letter_case TEXT NOT NULL DEFAULT 'uppercase'
        CHECK (letter_case IN ('uppercase', 'lowercase', 'mixed')),
    num_letters INTEGER NOT NULL DEFAULT 3
        CHECK (num_letters >= 0 AND num_letters <= 10),
    num_digits INTEGER NOT NULL DEFAULT 4
        CHECK (num_digits >= 0 AND num_digits <= 10),
    excluded_chars TEXT NOT NULL DEFAULT '',
    seed_value BIGINT NOT NULL DEFAULT 1,
    current_sequence BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (table_abbreviation ~ '^[A-Z]{1,4}$'),
    CHECK (num_letters + num_digits >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_id_generation_rules_active_table
    ON admin.id_generation_rules (target_table)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_id_generation_rules_active_abbrev
    ON admin.id_generation_rules (table_abbreviation)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_id_generation_rules_target_table
    ON admin.id_generation_rules (target_table);

COMMENT ON TABLE admin.id_generation_rules IS
    'Human-readable display ID format rules per schema-qualified table';

-- ---------------------------------------------------------------------------
-- admin.generated_ids
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.generated_ids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_table TEXT NOT NULL,
    record_id UUID NOT NULL,
    display_id TEXT NOT NULL,
    rule_id UUID REFERENCES admin.id_generation_rules(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_ids_table_record
    ON admin.generated_ids (target_table, record_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_ids_table_display
    ON admin.generated_ids (target_table, display_id);

CREATE INDEX IF NOT EXISTS idx_generated_ids_display_id
    ON admin.generated_ids (display_id);

CREATE INDEX IF NOT EXISTS idx_generated_ids_created_at
    ON admin.generated_ids (created_at DESC);

COMMENT ON TABLE admin.generated_ids IS
    'Maps schema-qualified table rows to human-readable display IDs';

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.id_generation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.generated_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS id_generation_rules_select ON admin.id_generation_rules;
CREATE POLICY id_generation_rules_select ON admin.id_generation_rules
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS generated_ids_select ON admin.generated_ids;
CREATE POLICY generated_ids_select ON admin.generated_ids
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.id_generation_rules TO authenticated;
GRANT SELECT ON admin.generated_ids TO authenticated;
GRANT ALL ON admin.id_generation_rules TO service_role;
GRANT ALL ON admin.generated_ids TO service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._id_gen_table_part(p_target_table TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN position('.' IN p_target_table) > 0 THEN split_part(p_target_table, '.', 2)
        ELSE p_target_table
    END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_pick_char(p_alphabet TEXT, p_excluded TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_char TEXT;
    v_attempts INTEGER := 0;
BEGIN
    IF p_alphabet IS NULL OR length(p_alphabet) = 0 THEN
        RETURN 'X';
    END IF;

    LOOP
        v_char := substr(p_alphabet, floor(random() * length(p_alphabet) + 1)::INTEGER, 1);
        IF COALESCE(p_excluded, '') = '' OR position(v_char IN p_excluded) = 0 THEN
            RETURN v_char;
        END IF;
        v_attempts := v_attempts + 1;
        IF v_attempts > 100 THEN
            RETURN substr(p_alphabet, 1, 1);
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_build_code(
    p_num_letters INTEGER,
    p_num_digits INTEGER,
    p_letter_case TEXT,
    p_excluded TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_chars TEXT[] := ARRAY[]::TEXT[];
    v_letter TEXT;
    i INTEGER;
BEGIN
    FOR i IN 1..GREATEST(p_num_letters, 0) LOOP
        v_letter := admin._id_gen_pick_char('ABCDEFGHIJKLMNOPQRSTUVWXYZ', p_excluded);
        IF p_letter_case = 'lowercase' THEN
            v_letter := lower(v_letter);
        ELSIF p_letter_case = 'mixed' AND random() < 0.5 THEN
            v_letter := lower(v_letter);
        END IF;
        v_chars := array_append(v_chars, v_letter);
    END LOOP;

    FOR i IN 1..GREATEST(p_num_digits, 0) LOOP
        v_chars := array_append(v_chars, admin._id_gen_pick_char('0123456789', p_excluded));
    END LOOP;

    IF COALESCE(array_length(v_chars, 1), 0) = 0 THEN
        RETURN 'X';
    END IF;

    RETURN (
        SELECT string_agg(c, '' ORDER BY random())
        FROM unnest(v_chars) AS c
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_default_abbreviation(p_target_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_table_part TEXT;
    v_base TEXT;
    v_candidate TEXT;
    v_suffix INTEGER := 2;
BEGIN
    v_table_part := admin._id_gen_table_part(p_target_table);
    v_base := upper(substr(v_table_part, 1, 3));
    IF length(v_base) < 3 THEN
        v_base := rpad(v_base, 3, 'X');
    END IF;
    v_candidate := v_base;

    WHILE EXISTS (
        SELECT 1
        FROM admin.id_generation_rules r
        WHERE r.table_abbreviation = v_candidate
          AND r.is_active = TRUE
          AND r.target_table <> p_target_table
    ) LOOP
        v_candidate := v_base || v_suffix::TEXT;
        v_suffix := v_suffix + 1;
        IF length(v_candidate) > 4 THEN
            v_candidate := substr(v_candidate, 1, 4);
        END IF;
    END LOOP;

    RETURN v_candidate;
END;
$$;

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
CREATE OR REPLACE FUNCTION admin.create_id_generation_rule(
    p_target_table TEXT,
    p_table_abbreviation VARCHAR(4),
    p_table_description TEXT,
    p_separator VARCHAR(2),
    p_suffix TEXT,
    p_letter_case TEXT,
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

    IF COALESCE(p_num_letters, 0) + COALESCE(p_num_digits, 0) < 1 THEN
        RAISE EXCEPTION 'num_letters + num_digits must be at least 1';
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
        COALESCE(p_num_letters, 3),
        COALESCE(p_num_digits, 4),
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
CREATE OR REPLACE FUNCTION admin.update_id_generation_rule(
    p_rule_id UUID,
    p_target_table TEXT,
    p_table_abbreviation VARCHAR(4),
    p_table_description TEXT,
    p_separator VARCHAR(2),
    p_suffix TEXT,
    p_letter_case TEXT,
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

    IF COALESCE(p_num_letters, 0) + COALESCE(p_num_digits, 0) < 1 THEN
        RAISE EXCEPTION 'num_letters + num_digits must be at least 1';
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
        num_letters = COALESCE(p_num_letters, num_letters),
        num_digits = COALESCE(p_num_digits, num_digits),
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
-- admin.delete_id_generation_rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_id_generation_rule(
    p_rule_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.id_generation_rules%ROWTYPE;
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

    DELETE FROM admin.id_generation_rules
    WHERE id = p_rule_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'id_generation_rule.delete',
        'id_generation_rule',
        p_rule_id,
        jsonb_build_object('target_table', v_prev.target_table),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.toggle_id_generation_rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.toggle_id_generation_rule(
    p_rule_id UUID,
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

    IF v_prev.is_active = FALSE THEN
        IF EXISTS (
            SELECT 1 FROM admin.id_generation_rules
            WHERE target_table = v_prev.target_table AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Cannot activate: another active rule exists for %', v_prev.target_table;
        END IF;

        IF EXISTS (
            SELECT 1 FROM admin.id_generation_rules
            WHERE table_abbreviation = v_prev.table_abbreviation AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Cannot activate: abbreviation % is already in use', v_prev.table_abbreviation;
        END IF;
    END IF;

    UPDATE admin.id_generation_rules
    SET is_active = NOT is_active,
        updated_by = p_admin_user_id,
        updated_at = NOW()
    WHERE id = p_rule_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'id_generation_rule.toggle',
        'id_generation_rule',
        p_rule_id,
        jsonb_build_object('is_active', v_new.is_active),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.generate_display_id
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
            v_rule.excluded_chars
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

-- ---------------------------------------------------------------------------
-- admin.resolve_display_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.resolve_display_id(
    p_table TEXT,
    p_display_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_record_id UUID;
BEGIN
    SELECT record_id INTO v_record_id
    FROM admin.generated_ids
    WHERE target_table = p_table
      AND display_id = p_display_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Display ID not found: % for table %', p_display_id, p_table;
    END IF;

    RETURN v_record_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.bulk_resolve_display_ids
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.bulk_resolve_display_ids(
    p_table TEXT,
    p_record_ids UUID[]
)
RETURNS TABLE(record_id UUID, display_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT g.record_id, g.display_id
    FROM admin.generated_ids g
    WHERE g.target_table = p_table
      AND g.record_id = ANY(COALESCE(p_record_ids, ARRAY[]::UUID[]));
$$;

-- ---------------------------------------------------------------------------
-- admin.get_available_tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_available_tables()
RETURNS TABLE(table_schema TEXT, table_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'system.id_generation.view') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.view required';
    END IF;

    RETURN QUERY
    SELECT t.table_schema::TEXT, t.table_name::TEXT
    FROM information_schema.tables t
    WHERE t.table_schema IN ('public', 'sim', 'admin')
      AND t.table_type = 'BASE TABLE'
      AND t.table_name NOT LIKE 'pg_%'
      AND t.table_name NOT IN (
          'schema_migrations',
          'supabase_migrations',
          'supabase_functions_migrations',
          'generated_ids'
      )
    ORDER BY t.table_schema, t.table_name;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('system.id_generation.view', 'View ID Generation', 'system', 'View ID generation rules and generated IDs'),
    ('system.id_generation.edit', 'Edit ID Generation', 'system', 'Create, update, delete, and toggle ID generation rules')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('system.id_generation.view', 'system.id_generation.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'system.id_generation.view'),
    ('system_admin', 'system.id_generation.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._id_gen_table_part(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_pick_char(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_build_code(INTEGER, INTEGER, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_default_abbreviation(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_ensure_rule(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_id_generation_rule(TEXT, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_id_generation_rule(UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_id_generation_rule(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_id_generation_rule(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_display_id(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.resolve_display_id(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.bulk_resolve_display_ids(TEXT, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_available_tables() TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v19: ID generation rules and display IDs applied.';
END $$;
