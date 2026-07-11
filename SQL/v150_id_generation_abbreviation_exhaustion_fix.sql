-- ============================================================================
-- v150: ID generation abbreviation exhaustion fix + re-run bulk seed
-- PostgreSQL 15+ / Supabase
-- Fixes ID_ABBREVIATION_EXHAUSTED for public.* tables (e.g. contracts_register)
-- and ensures bulk_seed continues when a single table fails.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin._id_gen_abbreviation_available(
    p_abbrev TEXT,
    p_target_table TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM admin.id_generation_rules r
        WHERE r.table_abbreviation = upper(trim(p_abbrev))
          AND admin.normalize_id_generation_target_table(r.target_table)
              <> admin.normalize_id_generation_target_table(p_target_table)
    );
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_default_abbreviation(p_target_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_normalized TEXT;
    v_base TEXT;
    v_schema TEXT;
    v_name TEXT;
    v_candidate TEXT;
    v_chars CONSTANT TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    v_li INTEGER;
    v_lj INTEGER;
    v_salt INTEGER;
    v_hash TEXT;
    v_byte INTEGER;
BEGIN
    v_normalized := admin.normalize_id_generation_target_table(p_target_table);
    v_base := admin._id_gen_table_abbreviation(v_normalized);
    IF length(v_base) < 1 THEN
        v_base := 'XXX';
    END IF;

    v_name := admin._id_gen_table_name_part(v_normalized);
    v_schema := CASE
        WHEN position('.' IN v_normalized) > 0 THEN split_part(v_normalized, '.', 1)
        ELSE 'public'
    END;

    IF admin._id_gen_abbreviation_available(v_base, v_normalized) THEN
        RETURN v_base;
    END IF;

    IF length(v_schema) >= 1 THEN
        v_candidate := substr(upper(substr(v_schema, 1, 1) || v_base), 1, 4);
        IF admin._id_gen_abbreviation_available(v_candidate, v_normalized) THEN
            RETURN v_candidate;
        END IF;
    END IF;

    IF length(v_schema) >= 2 THEN
        v_candidate := substr(upper(substr(v_schema, 1, 2) || v_base), 1, 4);
        IF admin._id_gen_abbreviation_available(v_candidate, v_normalized) THEN
            RETURN v_candidate;
        END IF;
    END IF;

    IF length(v_schema) >= 3 THEN
        v_candidate := substr(upper(substr(v_schema, 1, 3) || substr(v_base, 1, 1)), 1, 4);
        IF admin._id_gen_abbreviation_available(v_candidate, v_normalized) THEN
            RETURN v_candidate;
        END IF;
    END IF;

    FOR v_li IN 1..26 LOOP
        v_candidate := substr(v_base, 1, 3) || substr(v_chars, v_li, 1);
        IF admin._id_gen_abbreviation_available(v_candidate, v_normalized) THEN
            RETURN v_candidate;
        END IF;
    END LOOP;

    FOR v_li IN 1..26 LOOP
        FOR v_lj IN 1..26 LOOP
            v_candidate := substr(v_base, 1, 2)
                || substr(v_chars, v_li, 1)
                || substr(v_chars, v_lj, 1);
            IF admin._id_gen_abbreviation_available(v_candidate, v_normalized) THEN
                RETURN v_candidate;
            END IF;
        END LOOP;
    END LOOP;

    SELECT upper(substr(string_agg(substr(part, 1, 2), '' ORDER BY ord), 1, 4))
    INTO v_candidate
    FROM unnest(string_to_array(v_name, '_')) WITH ORDINALITY AS t(part, ord)
    WHERE part <> '';

    IF v_candidate IS NOT NULL
       AND length(v_candidate) >= 1
       AND admin._id_gen_abbreviation_available(v_candidate, v_normalized) THEN
        RETURN v_candidate;
    END IF;

    FOR v_salt IN 0..9999 LOOP
        v_hash := md5(v_normalized || ':abbrev:' || v_salt::text);
        v_candidate := '';
        FOR v_li IN 1..4 LOOP
            v_byte := get_byte(decode(substr(v_hash, ((v_li - 1) * 2) + 1, 2), 'hex'), 0);
            v_candidate := v_candidate || substr(v_chars, (v_byte % 26) + 1, 1);
        END LOOP;
        IF admin._id_gen_abbreviation_available(v_candidate, v_normalized) THEN
            RETURN v_candidate;
        END IF;
    END LOOP;

    RAISE EXCEPTION 'ID_ABBREVIATION_EXHAUSTED: Unable to derive a unique abbreviation for %', v_normalized
        USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_seed_resolve_abbrev(
    p_target_table TEXT,
    p_preferred TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_preferred TEXT;
    v_normalized TEXT;
BEGIN
    v_normalized := admin.normalize_id_generation_target_table(p_target_table);
    v_preferred := upper(trim(COALESCE(p_preferred, '')));

    IF v_preferred ~ '^[A-Z]{1,4}$'
       AND admin._id_gen_abbreviation_available(v_preferred, v_normalized) THEN
        RETURN v_preferred;
    END IF;

    RETURN admin._id_gen_default_abbreviation(v_normalized);
END;
$$;

CREATE OR REPLACE FUNCTION admin.bulk_seed_id_generation_rules(
    p_schema_filter TEXT DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_normalized TEXT;
    v_abbrev TEXT;
    v_desc TEXT;
    v_rule_id UUID;
    v_created INTEGER := 0;
    v_skipped INTEGER := 0;
    v_failed INTEGER := 0;
    v_results JSONB := '[]'::JSONB;
    r RECORD;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());

    IF v_admin IS NULL THEN
        SELECT id INTO v_admin
        FROM admin.admin_users
        WHERE role = 'super_admin'
          AND activation_status = 'active'
        ORDER BY created_at
        LIMIT 1;
    END IF;

    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'No admin user available for bulk seed (pass p_admin_user_id or ensure an active super_admin exists)';
    END IF;

    IF NOT admin.check_admin_permission(v_admin, 'system.id_generation.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.edit required';
    END IF;

    IF p_schema_filter IS NOT NULL
       AND p_schema_filter NOT IN ('admin', 'public', 'sim') THEN
        RAISE EXCEPTION 'Invalid schema filter: % (use admin, public, sim, or NULL for all)', p_schema_filter;
    END IF;

    FOR r IN
        SELECT pt.schemaname || '.' || pt.tablename AS target_table
        FROM pg_catalog.pg_tables pt
        WHERE pt.schemaname IN ('admin', 'public', 'sim')
          AND (p_schema_filter IS NULL OR pt.schemaname = p_schema_filter)
          AND pt.tablename NOT LIKE 'pg\_%' ESCAPE '\'
          AND pt.tablename NOT IN (
              'schema_migrations',
              'supabase_migrations',
              'supabase_functions_migrations',
              'generated_ids'
          )
        ORDER BY pt.schemaname, pt.tablename
    LOOP
        v_normalized := admin.normalize_id_generation_target_table(r.target_table);

        IF EXISTS (
            SELECT 1
            FROM admin.id_generation_rules ir
            WHERE admin.normalize_id_generation_target_table(ir.target_table) = v_normalized
              AND ir.is_active = TRUE
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        IF p_dry_run THEN
            BEGIN
                v_abbrev := admin._id_gen_default_abbreviation(v_normalized);
                v_desc := admin._id_gen_table_description(v_normalized);
                v_created := v_created + 1;
                v_results := v_results || jsonb_build_array(
                    jsonb_build_object(
                        'target_table', v_normalized,
                        'status', 'would_create',
                        'table_abbreviation', v_abbrev,
                        'table_description', v_desc
                    )
                );
            EXCEPTION
                WHEN OTHERS THEN
                    v_failed := v_failed + 1;
                    v_results := v_results || jsonb_build_array(
                        jsonb_build_object(
                            'target_table', v_normalized,
                            'status', 'failed',
                            'error', SQLERRM
                        )
                    );
            END;
            CONTINUE;
        END IF;

        BEGIN
            v_abbrev := admin._id_gen_default_abbreviation(v_normalized);
            v_desc := admin._id_gen_table_description(v_normalized);

            v_rule_id := admin.create_id_generation_rule(
                v_normalized,
                v_abbrev,
                v_desc,
                '-',
                '',
                'uppercase',
                'alphanumeric',
                5,
                4,
                'O0I1L',
                1,
                TRUE,
                v_admin
            );

            v_created := v_created + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'target_table', v_normalized,
                    'status', 'created',
                    'rule_id', v_rule_id,
                    'table_abbreviation', v_abbrev
                )
            );
        EXCEPTION
            WHEN OTHERS THEN
                v_failed := v_failed + 1;
                v_results := v_results || jsonb_build_array(
                    jsonb_build_object(
                        'target_table', v_normalized,
                        'status', 'failed',
                        'table_abbreviation', COALESCE(v_abbrev, NULL),
                        'error', SQLERRM
                    )
                );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'created', v_created,
        'skipped', v_skipped,
        'failed', v_failed,
        'dry_run', COALESCE(p_dry_run, FALSE),
        'schema_filter', p_schema_filter,
        'results', v_results
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin._id_gen_abbreviation_available(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_default_abbreviation(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._id_gen_seed_resolve_abbrev(TEXT, TEXT) TO authenticated, service_role;

DO $$
DECLARE
    v_admin UUID;
    v_result JSONB;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE NOTICE 'v150: bulk seed skipped — no active super_admin found';
        RETURN;
    END IF;

    v_result := admin.bulk_seed_id_generation_rules(NULL, FALSE, v_admin);

    RAISE NOTICE 'v150: bulk ID generation rules — created %, skipped %, failed %',
        v_result->>'created', v_result->>'skipped', v_result->>'failed';
END $$;
