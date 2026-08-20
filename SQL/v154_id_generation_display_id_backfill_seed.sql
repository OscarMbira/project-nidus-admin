-- ============================================================================
-- v154: Backfill admin.generated_ids for active rules at 0% usage
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v19 (generate_display_id), v138 (capacity helpers), v147 (normalize)
--
-- Idempotent: skips rows that already have a display ID. Safe to re-run.
-- Populates the Generated IDs registry for tables that have rows but no IDs yet
-- (common after bulk rule seed v148/v149).
-- ============================================================================

DROP FUNCTION IF EXISTS admin.backfill_zero_usage_display_ids(INTEGER, BOOLEAN);

-- Harden row-count helper: bulk rule seed can create rules before a table exists (e.g. sim.npcs).
CREATE OR REPLACE FUNCTION admin._id_gen_table_row_count(p_target_table TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public, sim
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

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables t
        WHERE t.table_schema = v_schema
          AND t.table_name = v_table
          AND t.table_type = 'BASE TABLE'
    ) THEN
        RETURN 0;
    END IF;

    BEGIN
        EXECUTE format('SELECT COUNT(*)::BIGINT FROM %I.%I', v_schema, v_table)
        INTO v_count;
    EXCEPTION
        WHEN undefined_table THEN
            RETURN 0;
    END;

    RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION admin._id_gen_target_table_exists(p_target_table TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_schema TEXT;
    v_table TEXT;
BEGIN
    IF trim(COALESCE(p_target_table, '')) = '' THEN
        RETURN FALSE;
    END IF;

    IF position('.' IN p_target_table) > 0 THEN
        v_schema := split_part(p_target_table, '.', 1);
        v_table := split_part(p_target_table, '.', 2);
    ELSE
        v_schema := 'public';
        v_table := p_target_table;
    END IF;

    IF v_schema NOT IN ('public', 'sim', 'admin') OR v_table IS NULL OR trim(v_table) = '' THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM information_schema.tables t
        WHERE t.table_schema = v_schema
          AND t.table_name = v_table
          AND t.table_type = 'BASE TABLE'
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.backfill_display_ids_for_table(
    p_target_table TEXT,
    p_limit INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_normalized TEXT;
    v_rule_table TEXT;
    v_schema TEXT;
    v_table TEXT;
    v_row RECORD;
    v_count INTEGER := 0;
    v_limit INTEGER;
    v_has_uuid_id BOOLEAN;
BEGIN
    v_normalized := admin.normalize_id_generation_target_table(p_target_table);
    IF v_normalized = '' THEN
        RETURN 0;
    END IF;

    SELECT r.target_table
    INTO v_rule_table
    FROM admin.id_generation_rules r
    WHERE admin.normalize_id_generation_target_table(r.target_table) = v_normalized
      AND r.is_active = TRUE
    ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_rule_table IS NULL THEN
        RETURN 0;
    END IF;

    v_schema := split_part(v_normalized, '.', 1);
    v_table := split_part(v_normalized, '.', 2);

    IF v_schema NOT IN ('admin', 'public', 'sim') OR v_table IS NULL OR trim(v_table) = '' THEN
        RETURN 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables t
        WHERE t.table_schema = v_schema
          AND t.table_name = v_table
          AND t.table_type = 'BASE TABLE'
    ) THEN
        RETURN 0;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = v_schema
          AND c.table_name = v_table
          AND c.column_name = 'id'
          AND c.udt_name = 'uuid'
    ) INTO v_has_uuid_id;

    IF NOT v_has_uuid_id THEN
        RETURN 0;
    END IF;

    v_limit := CASE
        WHEN p_limit IS NULL OR p_limit <= 0 THEN 10
        ELSE p_limit
    END;

    FOR v_row IN EXECUTE format(
        $q$
        SELECT t.id
        FROM %I.%I t
        WHERE NOT EXISTS (
            SELECT 1
            FROM admin.generated_ids g
            WHERE admin.normalize_id_generation_target_table(g.target_table)
                    = admin.normalize_id_generation_target_table(%L)
              AND g.record_id = t.id
        )
        ORDER BY t.id
        LIMIT %s
        $q$,
        v_schema,
        v_table,
        v_rule_table,
        v_limit
    )
    LOOP
        BEGIN
            PERFORM admin.generate_display_id(v_rule_table, v_row.id);
            v_count := v_count + 1;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'backfill_display_ids_for_table: skip % % — %',
                    v_rule_table, v_row.id, SQLERRM;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION admin.backfill_display_ids_for_table(TEXT, INTEGER) IS
    'Generates display IDs for existing rows in a target table that lack admin.generated_ids entries. Default limit: 10 rows.';

CREATE OR REPLACE FUNCTION admin.backfill_zero_usage_display_ids_batch(
    p_limit_per_table INTEGER DEFAULT 10,
    p_table_batch_size INTEGER DEFAULT 25,
    p_after_target_table TEXT DEFAULT NULL,
    p_only_zero_usage BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    r RECORD;
    v_batch INTEGER;
    v_total INTEGER := 0;
    v_tables INTEGER := 0;
    v_skipped_empty INTEGER := 0;
    v_skipped_missing INTEGER := 0;
    v_processed INTEGER := 0;
    v_last_table TEXT := NULL;
    v_limit INTEGER;
    v_batch_size INTEGER;
    v_results JSONB := '[]'::JSONB;
    v_has_more BOOLEAN := FALSE;
BEGIN
    v_limit := GREATEST(COALESCE(p_limit_per_table, 10), 1);
    v_batch_size := GREATEST(COALESCE(p_table_batch_size, 25), 1);

    FOR r IN
        SELECT
            u.rule_id,
            u.target_table,
            u.generated_count
        FROM admin.v_id_generation_rule_usage u
        WHERE (NOT COALESCE(p_only_zero_usage, TRUE) OR COALESCE(u.generated_count, 0) = 0)
          AND (
              p_after_target_table IS NULL
              OR trim(p_after_target_table) = ''
              OR u.target_table > p_after_target_table
          )
        ORDER BY u.target_table
        LIMIT v_batch_size
    LOOP
        v_processed := v_processed + 1;
        v_last_table := r.target_table;

        IF NOT admin._id_gen_target_table_exists(r.target_table) THEN
            v_skipped_missing := v_skipped_missing + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'target_table', r.target_table,
                    'status', 'skipped_missing'
                )
            );
            CONTINUE;
        END IF;

        v_batch := admin.backfill_display_ids_for_table(r.target_table, v_limit);
        v_total := v_total + COALESCE(v_batch, 0);

        IF COALESCE(v_batch, 0) > 0 THEN
            v_tables := v_tables + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'target_table', r.target_table,
                    'status', 'backfilled',
                    'backfilled', v_batch,
                    'generated_count_before', COALESCE(r.generated_count, 0)
                )
            );
        ELSE
            v_skipped_empty := v_skipped_empty + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'target_table', r.target_table,
                    'status', 'skipped_empty',
                    'backfilled', 0
                )
            );
        END IF;
    END LOOP;

    IF v_last_table IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM admin.v_id_generation_rule_usage u
            WHERE (NOT COALESCE(p_only_zero_usage, TRUE) OR COALESCE(u.generated_count, 0) = 0)
              AND u.target_table > v_last_table
            LIMIT 1
        ) INTO v_has_more;
    END IF;

    RETURN jsonb_build_object(
        'tables_backfilled', v_tables,
        'display_ids_created', v_total,
        'tables_skipped_empty', v_skipped_empty,
        'tables_skipped_missing', v_skipped_missing,
        'tables_processed', v_processed,
        'last_target_table', v_last_table,
        'has_more', COALESCE(v_has_more, FALSE),
        'limit_per_table', v_limit,
        'table_batch_size', v_batch_size,
        'only_zero_usage', COALESCE(p_only_zero_usage, TRUE),
        'results', v_results
    );
END;
$$;

COMMENT ON FUNCTION admin.backfill_zero_usage_display_ids_batch(INTEGER, INTEGER, TEXT, BOOLEAN) IS
    'Backfills up to p_limit_per_table display IDs (default 10) for zero-usage rules, p_table_batch_size tables per call.';

GRANT EXECUTE ON FUNCTION admin._id_gen_target_table_exists(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.backfill_display_ids_for_table(TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.backfill_zero_usage_display_ids_batch(INTEGER, INTEGER, TEXT, BOOLEAN) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v154: ID generation backfill helpers installed. Run: pnpm run admin:seed-id-generation-display-id-backfill';
END $$;
