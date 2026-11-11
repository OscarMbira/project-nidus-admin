-- ============================================================================
-- v247: ID Generation — sequential numbers are never cut short past their padding width
-- ============================================================================
-- Incident 2026-11-10: monorepo seed SQL/v1402 failed with
--   23505 duplicate key ... uq_generated_ids_table_display (public.local_register_records, LREG-2026-100)
-- Cause: the LREG rule pads to 3 digits, and the sequential builder (v155) used
--   LPAD(sequence, num_digits, '0')
-- Postgres LPAD also CUTS a longer value down to that width, so sequence 1000 became '100' and the
-- generator reissued an ID that already existed. Every sequential rule hits this once it passes
-- 10^num_digits - 1 in a period (999 for 3 digits).
--
-- Fix: pad to the configured width but never shorten — width = the larger of num_digits and the
-- length of the number. 940 stays 'LREG-2026-940', 1000 becomes 'LREG-2026-1000'. Existing IDs do
-- not change. Same signature and behaviour otherwise (scope column, date period, prefix, suffix).
-- The scope lookup moves to a small helper and values are assigned with := so the Supabase SQL
-- editor does not add its automatic row-level-security statement for this file.
-- v246 (counter realign) is harmless and can stay: the LREG counter was already correct (939).
-- Run this, then re-run monorepo SQL/v1402. Idempotent.
-- ============================================================================

-- Scope value of a record, for rules with a scope column (dynamic column and table names).
CREATE OR REPLACE FUNCTION admin._id_gen_scope_value(
    p_schema TEXT,
    p_table TEXT,
    p_scope_column TEXT,
    p_record_id UUID
)
RETURNS SETOF TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    RETURN QUERY EXECUTE format('SELECT %I::TEXT FROM %I.%I WHERE id = $1', p_scope_column, p_schema, p_table)
    USING p_record_id;
END;
$$;

REVOKE ALL ON FUNCTION admin._id_gen_scope_value(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

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
    v_number TEXT;
BEGIN
    IF p_rule.scope_column IS NOT NULL THEN
        v_schema := (SELECT s.schema_name FROM admin._id_gen_split_qualified_table(p_rule.target_table) s);
        v_table := (SELECT s.table_name FROM admin._id_gen_split_qualified_table(p_rule.target_table) s);
        v_scope_value := (SELECT x FROM admin._id_gen_scope_value(v_schema, v_table, p_rule.scope_column, p_record_id) x LIMIT 1);
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

    -- Pad to the configured width, never shorten (LPAD alone cuts 1000 down to '100').
    v_number := v_sequence::TEXT;
    v_number := LPAD(v_number, GREATEST(p_rule.num_digits, 1, length(v_number)), '0');

    RETURN p_rule.table_abbreviation
        || COALESCE(p_rule.separator, '')
        || v_middle
        || v_number
        || COALESCE(p_rule.suffix, '');
END;
$$;

-- Check: what the next LREG numbers look like (no counter is used by this query).
SELECT n AS sequence,
       LPAD(n::TEXT, GREATEST(3, 1, length(n::TEXT)), '0') AS new_builder,
       LPAD(n::TEXT, 3, '0') AS old_builder
FROM (VALUES (7::BIGINT), (940::BIGINT), (999::BIGINT), (1000::BIGINT), (1061::BIGINT)) AS t(n);
