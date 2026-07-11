-- ============================================================================
-- v148: Bulk seed ID generation rules for all unconfigured tables
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v144 (abbrev helpers), v147 (normalize_id_generation_target_table)
-- ============================================================================

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
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'target_table', v_normalized,
                    'status', 'skipped'
                )
            );
            CONTINUE;
        END IF;

        v_abbrev := admin._id_gen_default_abbreviation(v_normalized);
        v_desc := admin._id_gen_table_description(v_normalized);

        IF p_dry_run THEN
            v_created := v_created + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'target_table', v_normalized,
                    'status', 'would_create',
                    'table_abbreviation', v_abbrev,
                    'table_description', v_desc
                )
            );
            CONTINUE;
        END IF;

        BEGIN
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
                        'table_abbreviation', v_abbrev,
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

COMMENT ON FUNCTION admin.bulk_seed_id_generation_rules(TEXT, BOOLEAN, UUID) IS
    'Creates default ID generation rules (5 letters + 4 digits, O0I1L excluded) for every eligible table without an active rule.';

GRANT EXECUTE ON FUNCTION admin.bulk_seed_id_generation_rules(TEXT, BOOLEAN, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v148: bulk_seed_id_generation_rules applied.';
END $$;
